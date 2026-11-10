// Reads the usage limits of OpenAI Codex (CLI, IDE extension, app) from its session files.
// Codex writes, after every response, a "token_count" event with the limits into
//   $CODEX_HOME/sessions/YYYY/MM/DD/rollout-<date>-<id>.jsonl   (CODEX_HOME defaults to ~/.codex)
// and later compresses old sessions to .jsonl.zst. Line format (one JSON object per line):
//   {"timestamp":"…","type":"event_msg","payload":{"type":"token_count","info":{…},
//    "rate_limits":{"limit_id":"codex","primary":{"used_percent":12,"window_minutes":300,"resets_at":1762…},
//                   "secondary":{…},"plan_type":"plus",…}}}
// The windows depend on the plan: e.g. 5 hours + 1 week on paid plans, one 30-day window on Free.
// So windows are read as a list with their own length, never assumed.
// Read only: nothing in the Codex folder is ever changed.
import { readFileSync, readdirSync, statSync, openSync, readSync, closeSync, mkdirSync } from 'node:fs';
import * as zlib from 'node:zlib';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { STATE_DIR, clean, num, writeAtomic } from './common.mjs';

export const CODEX_DIR = process.env.CODEX_HOME || join(homedir(), '.codex');
const SESSIONS = join(CODEX_DIR, 'sessions');
const CACHE_FILE = join(STATE_DIR, 'limiti-codex.json');
const TAIL = 1 << 20;         // the latest limits are near the end: read at most the last 1 MB
const MAX_ZST = 64 << 20;     // never decompress more than 64 MB
const DAY_DIRS = 31;          // how many recent day folders to look at

const listDesc = dir => {
  try { return readdirSync(dir).filter(n => /^\d+$/.test(n)).sort((a, b) => Number(b) - Number(a)); }
  catch { return []; }
};

// Most recently modified session files (newest first)
function recentFiles(limit) {
  const days = [];
  outer: for (const y of listDesc(SESSIONS)) for (const m of listDesc(join(SESSIONS, y))) for (const d of listDesc(join(SESSIONS, y, m))) {
    days.push(join(SESSIONS, y, m, d));
    if (days.length >= DAY_DIRS) break outer;
  }
  const files = [];
  for (const dir of days) {
    let names = [];
    try { names = readdirSync(dir); } catch {}
    for (const n of names) {
      if (!/^rollout-.*\.jsonl(\.zst)?$/.test(n)) continue;
      try { const s = statSync(join(dir, n)); if (s.isFile()) files.push({ file: join(dir, n), mtime: s.mtimeMs, size: s.size }); } catch {}
    }
  }
  return files.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
}

function readTail(f) {
  if (f.file.endsWith('.zst')) {
    if (typeof zlib.zstdDecompressSync !== 'function' || f.size > MAX_ZST) return ''; // Node < 22.15 cannot read them
    try { return zlib.zstdDecompressSync(readFileSync(f.file), { maxOutputLength: MAX_ZST }).toString('utf8'); } catch { return ''; }
  }
  let fd;
  try {
    fd = openSync(f.file, 'r');
    const len = Math.min(f.size, TAIL);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, f.size - len);
    return buf.toString('utf8');
  } catch { return ''; } finally { if (fd !== undefined) try { closeSync(fd); } catch {} }
}

// Normalizes one "rate_limits" object. Returns null when it carries no usable window.
export function parseRateLimits(rl, t) {
  if (!rl || typeof rl !== 'object') return null;
  // Other ids are extra per-model quotas; the main Codex limit is "codex" (or unnamed)
  if (rl.limit_id != null && rl.limit_id !== 'codex') return null;
  const windows = [];
  for (const w of [rl.primary, rl.secondary]) {
    if (!w || typeof w !== 'object') continue;
    const used = num(w.used_percent);
    if (used == null) continue;
    const mins = num(w.window_minutes);
    // older Codex versions wrote "resets_in_seconds" instead of "resets_at"
    let resets = num(w.resets_at);
    if (resets == null && num(w.resets_in_seconds) != null) resets = Math.round(t + num(w.resets_in_seconds));
    windows.push({ used_percentage: Math.max(0, used), resets_at: resets, len: mins && mins > 0 ? mins * 60 : null });
  }
  if (!windows.length) return null;
  windows.sort((a, b) => (a.len ?? Infinity) - (b.len ?? Infinity));
  return { t, plan: clean(rl.plan_type ?? '', 20) || null, reached: rl.rate_limit_reached_type ? clean(rl.rate_limit_reached_type, 40) : null, windows };
}

// Latest snapshot in a chunk of session text (scans from the end)
export function lastSnapshot(text) {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (!l.includes('"token_count"') || !l.includes('"rate_limits"')) continue;
    let j;
    try { j = JSON.parse(l); } catch { continue; } // the first line of a tail is usually cut
    const p = j?.payload;
    if (j?.type !== 'event_msg' || p?.type !== 'token_count') continue;
    const t = Date.parse(j.timestamp) / 1000;
    const snap = parseRateLimits(p.rate_limits, Number.isFinite(t) ? t : null);
    if (snap && snap.t != null) return snap;
  }
  return null;
}

// The most recent Codex limits on this computer, or null.
// Result: { t, plan, reached, windows: [{ used_percentage, resets_at, len }] } (shortest window first)
export function readCodex() {
  const files = recentFiles(5);
  if (!files.length) return null;
  // Cache: the newest file did not change since last time → same answer, no reading
  let cache = null;
  try { cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8')); } catch {}
  const key = files.map(f => `${f.file}|${f.mtime}|${f.size}`).join('\n');
  if (cache && cache.key === key) return cache.snap ?? null;
  let best = null;
  for (const f of files) {
    const s = lastSnapshot(readTail(f));
    if (s && (!best || s.t > best.t)) best = s;
    if (best && best.t * 1000 > f.mtime + 5000) break; // older files cannot hold anything newer
  }
  try { mkdirSync(STATE_DIR, { recursive: true }); writeAtomic(CACHE_FILE, JSON.stringify({ key, snap: best })); } catch {}
  return best;
}

// "5h", "7d"/"7g", "30d"/"30g" from a window length in seconds
export function windowLabel(len, lang) {
  if (!len) return '?';
  const m = Math.round(len / 60);
  if (m % 1440 === 0) return `${m / 1440}${lang === 'it' ? 'g' : 'd'}`;
  if (m % 60 === 0) return `${m / 60}h`;
  return `${m}m`;
}
