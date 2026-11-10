// Claude Code status line with live usage limits.
// Line 1: model, effort, folder, git branch, context, cache, duration, cost
// Lines 2-3: 5-hour and weekly limits with bar, reset time, pace and forecast
// Keeps state and history in ~/.claude/state/ for the /limiti skill and for notifications.
import { readFileSync, existsSync, statSync, openSync, closeSync, readdirSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname, basename, resolve, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import {
  STATE_DIR, STATE_FILE, ALERTS_DIR, STYLES, SYMBOLS, loadConfig, detectLanguage, formatters,
  clean, num, writeAtomic,
} from './common.mjs';

const T = {
  it: {
    h5: '5h', d7: '7g', reset: 'reset', in: d => `(tra ${d})`,
    runsOut: t => `a questo ritmo finisce ${t}`, at: t => `alle ${t}`,
    fast: 'consumi in fretta', ok: 'margine ampio', mid: 'nella media',
    perDay: p => `puoi usarne ~${p}% al giorno`,
    exhausted: 'ESAURITO', until: (t, d) => `fino a ${t} (tra ${d})`,
    wasReset: 'azzerato · riparte alla prossima richiesta', wasResetShort: 'azzerato',
    stale: d => `dati di ${d} fa`,
    waiting: 'limiti: in attesa della prima risposta', waitingShort: 'limiti: in attesa',
    unavailable: 'limiti non disponibili: servono Pro, Max o Ultra', unavailableShort: 'limiti non disponibili',
    cold: 'fredda',
    name5: 'Limite 5 ore', name7: 'Limite settimanale',
    alertTitle: (n, p) => `Claude Code · ${n} al ${p}%`,
    alertBody: (t, d) => `Si azzera ${t} (tra ${d}).`,
    resetTitle: n => `Claude Code · ${n} azzerato`,
    resetBody: 'Puoi tornare a lavorare a pieno ritmo.',
  },
  en: {
    h5: '5h', d7: '7d', reset: 'resets', in: d => `(in ${d})`,
    runsOut: t => `at this pace runs out ${t}`, at: t => `at ${t}`,
    fast: 'burning fast', ok: 'plenty of room', mid: 'on pace',
    perDay: p => `~${p}% per day available`,
    exhausted: 'EXHAUSTED', until: (t, d) => `until ${t} (in ${d})`,
    wasReset: 'reset · restarts with your next request', wasResetShort: 'reset',
    stale: d => `data from ${d} ago`,
    waiting: 'limits: waiting for the first response', waitingShort: 'limits: waiting',
    unavailable: 'limits unavailable: requires Pro, Max or Ultra', unavailableShort: 'limits unavailable',
    cold: 'cold',
    name5: '5-hour limit', name7: 'Weekly limit',
    alertTitle: (n, p) => `Claude Code · ${n} at ${p}%`,
    alertBody: (t, d) => `Resets ${t} (in ${d}).`,
    resetTitle: n => `Claude Code · ${n} reset`,
    resetBody: 'You can get back to full speed.',
  },
};

const cfg = loadConfig();
const lang = detectLanguage(cfg);
const L = T[lang];
const { dur, clock, fullDate } = formatters(lang);
const S = SYMBOLS[cfg.symbols];
const now = Date.now() / 1000;
const COLS = Math.max(20, parseInt(process.env.COLUMNS || '120', 10) || 120);
const MAXW = COLS - 2; // small margin: Claude Code adds its own spacing
const SAME = (a, b) => a != null && b != null && Math.abs(a - b) <= 60; // same window, tolerating small jitter

// ---------- colors ----------
function colorMode() {
  if (cfg.colors !== 'auto') return cfg.colors;
  if (process.env.NO_COLOR) return 'none';
  if (process.env.TERM === 'dumb') return 'none';
  if (/truecolor|24bit/i.test(process.env.COLORTERM || '')) return 'truecolor';
  if (process.env.TERM_PROGRAM === 'Apple_Terminal') return '256';
  return 'truecolor';
}
const MODE = colorMode();
const E = '\x1b[';
const R = MODE === 'none' ? '' : `${E}0m`, BOLD = MODE === 'none' ? '' : `${E}1m`;
function to256(r, g, b) {
  if (Math.max(r, g, b) - Math.min(r, g, b) < 16) { // greys: use the 24-step grey ramp
    const avg = (r + g + b) / 3;
    return avg < 8 ? 16 : avg > 238 ? 231 : 232 + Math.round((avg - 8) / 10);
  }
  return 16 + 36 * Math.round(r / 51) + 6 * Math.round(g / 51) + Math.round(b / 51);
}
const rgb = (r, g, b) => MODE === 'none' ? '' : MODE === '256' ? `${E}38;5;${to256(r, g, b)}m` : `${E}38;2;${r};${g};${b}m`;
const GREEN = [80, 200, 120], YELLOW = [235, 190, 60], RED = [235, 85, 85];
const GREY = [70, 70, 80], SOFT = [140, 140, 155], ACCENT = [120, 170, 255], VIOLET = [190, 140, 255];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const heat = t => (t < 0.5 ? mix(GREEN, YELLOW, t / 0.5) : mix(YELLOW, RED, (t - 0.5) / 0.5));
const pctColor = p => rgb(...heat(Math.min(1, Math.max(0, (p - 20) / 75))));
const c = (col, s) => `${rgb(...col)}${s}${R}`;
const SEP = c(GREY, ` ${S.sep} `);
const visible = s => [...s.replace(/\x1b\[[0-9;]*m/g, '')].length;
// Picks the first rendering (most detailed first) that fits the terminal width
function fit(render, levels) {
  let s = '';
  for (let l = 0; l < levels; l++) { s = render(l); if (visible(s) <= MAXW) return s; }
  return s;
}

// Bar: one color (green/yellow/red by %), grey remainder
function bar(p, width) {
  let [on, off] = STYLES[cfg.style];
  // Without colors, filled and empty parts must look different
  if (MODE === 'none' && on === off) off = '─';
  const full = Math.round(Math.max(0, Math.min(1, p / 100)) * width);
  const col = p >= 80 ? RED : p >= 50 ? YELLOW : GREEN;
  const b = `${rgb(...col)}${on.repeat(full)}${R}${rgb(...GREY)}${off.repeat(width - full)}${R}`;
  return cfg.brackets ? `${c(GREY, '[')}${b}${c(GREY, ']')}` : b;
}

// ---------- input ----------
let d = {};
try { d = JSON.parse(readFileSync(0, 'utf8')); } catch {}
if (!d || typeof d !== 'object') d = {};

// Normalizes one rate-limit window from Claude Code (numbers only, clamped)
function readWindow(w) {
  if (!w || typeof w !== 'object') return null;
  const p = num(w.used_percentage), r = num(w.resets_at);
  if (p == null) return null;
  return { used_percentage: Math.max(0, p), resets_at: r };
}
const rlIn = d.rate_limits && typeof d.rate_limits === 'object' ? d.rate_limits : null;
const incoming = { five_hour: readWindow(rlIn?.five_hour), seven_day: readWindow(rlIn?.seven_day) };

// ---------- shared state ----------
function readState() {
  try {
    const s = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    if (s && typeof s === 'object') return { storia: Array.isArray(s.storia) ? s.storia : [], ultimi: s.ultimi || {}, rate_limits: s.rate_limits || {}, aggiornato: num(s.aggiornato), context_pct: s.context_pct ?? null, spend: s.spend ?? null, sessioni: s.sessioni && typeof s.sessioni === 'object' ? s.sessioni : {} };
  } catch {}
  return { storia: [], ultimi: {}, rate_limits: {}, aggiornato: null, context_pct: null, spend: null, sessioni: {} };
}
const st = readState();

// Several sessions share the state. Claude Code keeps passing an idle session the last
// limits it received, which may be much older than what another session just got.
// The session's total API time grows with every response, so it tells the cases apart:
// - "fresh": this session just got a response → take its limits as they are, even if
//   lower (plan upgrade, account switch, early reset);
// - "idle": known session, no new response → ignore its (old) limits while the stored
//   ones are valid;
// - "unknown": first time we see the session, or no session id / API time →
//   prudent rule: highest value in the same window, the later window across windows.
function newest(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  if (SAME(a.resets_at, b.resets_at)) return a.used_percentage >= b.used_percentage ? a : b;
  return (a.resets_at ?? 0) > (b.resets_at ?? 0) ? a : b;
}
const W = { five_hour: { len: 5 * 3600, key: 'h5', rk: 'r5' }, seven_day: { len: 7 * 86400, key: 'd7', rk: 'r7' } };
const sid = typeof d.session_id === 'string' && d.session_id ? clean(d.session_id, 80) : null;
const seen = sid ? st.sessioni[sid] : null;
const apiTime = num(d.cost?.total_api_duration_ms);
const status = !sid || apiTime == null || !seen || num(seen.a) == null ? 'unknown' : apiTime > seen.a ? 'fresh' : 'idle';
const cur = {}, fresh = {};
for (const k of Object.keys(W)) {
  fresh[k] = !!incoming[k] && status === 'fresh';
  cur[k] = incoming[k] ? pick(incoming[k], readWindow(st.rate_limits?.[k])) : null;
}
function pick(inc, stored) {
  if (status === 'fresh') return inc;
  if (status === 'idle') return stored && stored.resets_at > now ? stored : inc;
  return newest(inc, stored);
}
const hasIncoming = !!(incoming.five_hour || incoming.seven_day);

// ---------- history ----------
if (hasIncoming) {
  const last = st.storia[st.storia.length - 1];
  const s = { t: Math.floor(now), h5: cur.five_hour?.used_percentage ?? null, r5: cur.five_hour?.resets_at ?? null, d7: cur.seven_day?.used_percentage ?? null, r7: cur.seven_day?.resets_at ?? null };
  if (!last || now - last.t > 120 || last.h5 !== s.h5 || last.d7 !== s.d7) st.storia.push(s);
}
// Keeps 8 days; older than 10 hours, one sample every 20 minutes is enough
function compactHistory(list) {
  const seen = new Map(), out = [];
  for (const x of list.filter(x => x && num(x.t) != null && now - x.t < 8 * 86400).sort((a, b) => a.t - b.t)) {
    if (now - x.t > 10 * 3600) seen.set(Math.floor(x.t / 1200), x);
    else if (out.length && out[out.length - 1].t === x.t) out[out.length - 1] = x; // same second: keep the latest
    else out.push(x);
  }
  return [...seen.values(), ...out];
}

// Forecast: 5h = speed over the last hour; 7d = average since the window started
// (a half-hour burst projected over days, nights included, would give false numbers)
function forecast(key, w) {
  if (!w.resets_at) return null;
  if (key === 'seven_day') {
    const elapsed = now - (w.resets_at - W.seven_day.len);
    if (elapsed < 6 * 3600 || w.used_percentage <= 0) return null;
    const eta = now + (100 - w.used_percentage) / (w.used_percentage / elapsed);
    return { eta, runsOut: eta < w.resets_at };
  }
  const pts = st.storia.filter(x => SAME(x.r5, w.resets_at) && x.h5 != null && now - x.t <= 3600);
  if (pts.length < 2) return null;
  const a = pts[0], b = pts[pts.length - 1];
  const dt = b.t - a.t, dp = b.h5 - a.h5;
  if (dt < 300 || dp <= 0) return null;
  const eta = now + (100 - w.used_percentage) / (dp / dt);
  return { eta, runsOut: eta < w.resets_at };
}

// ---------- notifications (Windows, macOS, Linux with notify-send) ----------
// Absolute paths and a neutral working directory: a "powershell.exe" placed in the
// project folder must never be the one that runs.
function launch(cmd, args) {
  try {
    const p = spawn(cmd, args, { cwd: tmpdir(), detached: true, stdio: 'ignore', windowsHide: true });
    p.on('error', () => {});
    p.unref();
  } catch {}
}
function toast(title, msg) {
  if (!cfg.notifications || process.env.LIMITI_NO_NOTIFICHE) return;
  const safe = s => String(s).replace(/[^\p{L}\p{N} .,:%()·/\-]/gu, '');
  title = safe(title); msg = safe(msg);
  if (process.platform === 'win32') {
    const ps = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$x = New-Object Windows.Data.Xml.Dom.XmlDocument
$x.LoadXml('<toast><visual><binding template="ToastGeneric"><text>${title}</text><text>${msg}</text></binding></visual></toast>')
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($x))`;
    const exe = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    launch(exe, ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')]);
  } else if (process.platform === 'darwin') {
    launch('/usr/bin/osascript', ['-e', `display notification ${JSON.stringify(msg)} with title ${JSON.stringify(title)}`]);
  } else {
    const exe = ['/usr/bin/notify-send', '/usr/local/bin/notify-send', '/bin/notify-send'].find(existsSync);
    if (exe) launch(exe, [title, msg]);
  }
}

// Each alert is claimed with a marker file created atomically ('wx'): even with several
// sessions open, or after a corrupted state file, an alert is sent only once.
function claim(name) {
  try { mkdirSync(ALERTS_DIR, { recursive: true }); closeSync(openSync(join(ALERTS_DIR, name), 'wx')); return true; }
  catch { return false; }
}
// Resets happen on the hour: rounding to the hour tolerates small changes of resets_at
const bucket = r => Math.round(r / 3600);
const windowName = k => (k === 'five_hour' ? L.name5 : L.name7);
const resetText = (k, r) => (k === 'seven_day' ? fullDate(r) : L.at(clock(r)));

function checkAlerts(key, w) {
  if (!w.resets_at || w.resets_at <= now) return;
  for (const s of [...cfg.thresholds].reverse()) {
    if (w.used_percentage < s) continue;
    const first = claim(`${key}-${bucket(w.resets_at)}-${s}`);
    cfg.thresholds.filter(x => x < s).forEach(x => claim(`${key}-${bucket(w.resets_at)}-${x}`));
    if (first) toast(L.alertTitle(windowName(key), Math.round(w.used_percentage)), L.alertBody(resetText(key, w.resets_at), dur(w.resets_at - now)));
    break;
  }
}
// Window that was high has just reset: say it is free again (not hours later)
function checkReset(key, prev) {
  if (!prev?.resets_at || prev.resets_at > now || now - prev.resets_at > 600) return;
  if (prev.used_percentage < Math.min(...cfg.thresholds)) return;
  if (claim(`${key}-${bucket(prev.resets_at)}-reset`)) toast(L.resetTitle(windowName(key)), L.resetBody);
}
function cleanupAlerts() {
  try {
    for (const f of readdirSync(ALERTS_DIR)) {
      const b = Number(f.split('-')[1]);
      if (Number.isFinite(b) && b * 3600 < now - 9 * 86400) unlinkSync(join(ALERTS_DIR, f));
    }
  } catch {}
}

// ---------- git branch (reads .git/HEAD directly, no processes) ----------
function readSmall(file) {
  const s = statSync(file);
  if (!s.isFile() || s.size > 4096) return null;
  return readFileSync(file, 'utf8');
}
function gitBranch(dir) {
  try {
    for (let i = 0; i < 12 && dir; i++) {
      const g = join(dir, '.git');
      if (existsSync(g)) {
        let gitDir = g;
        if (statSync(g).isFile()) { // worktree or submodule: ".git" is a file with "gitdir: <path>"
          const m = (readSmall(g) || '').match(/^gitdir:\s*(.+)$/m);
          if (!m) return null;
          const target = m[1].trim();
          // Never follow network (UNC) paths, in any spelling: \\srv, //srv, /\srv, \/srv, \\?\UNC\...
          const UNC = /^[\\/]{2}/;
          if (UNC.test(target)) return null;
          gitDir = isAbsolute(target) ? resolve(target) : resolve(dir, target);
          if (UNC.test(gitDir) && !UNC.test(dir)) return null;
        }
        const h = (readSmall(join(gitDir, 'HEAD')) || '').trim();
        if (!h) return null;
        return clean(h.startsWith('ref:') ? h.replace(/^ref:\s*refs\/heads\//, '') : h.slice(0, 7), 30);
      }
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  } catch {}
  return null;
}

// ---------- line 1: context ----------
const lines = [];
if (cfg.show_context) {
  const model = clean(d.model?.display_name || 'Claude', 30);
  const effort = d.effort?.level ? clean(d.effort.level, 12) : '';
  const cwd = typeof (d.workspace?.current_dir || d.cwd) === 'string' ? (d.workspace?.current_dir || d.cwd) : '';
  const br = cwd && cfg.show_git ? gitBranch(cwd) : null;
  const folder = cwd ? clean(basename(cwd) || cwd, 30) : '';
  const ctx = num(d.context_window?.used_percentage);
  const cacheExp = num(d.prompt_cache?.expires_at);
  const ms = num(d.cost?.total_duration_ms);
  const cost = num(d.cost?.total_cost_usd);
  lines.push(fit(level => {
    const p = [];
    p.push(`${c(VIOLET, S.model)} ${BOLD}${model}${R}${level < 5 && effort ? c(SOFT, ` ${effort}`) : ''}${level < 5 && d.fast_mode === true ? c(YELLOW, ` ${S.fast} fast`) : ''}`);
    if (folder && level < 6) p.push(`${c(ACCENT, folder)}${br && level < 4 ? c(SOFT, ` (${br})`) : ''}`);
    if (ctx != null) p.push(`${c(SOFT, 'ctx')} ${pctColor(ctx)}${Math.round(ctx)}%${R}`);
    if (cacheExp && level < 3) {
      const left = cacheExp - now;
      p.push(left > 0 ? `${c(SOFT, 'cache')} ${c(left < 300 ? YELLOW : GREEN, dur(left))}` : `${c(SOFT, 'cache')} ${c(YELLOW, L.cold)}`);
    }
    if (ms && level < 2) p.push(c(SOFT, `${S.time} ${dur(ms / 1000)}`));
    if (cfg.show_cost && cost && level < 1) p.push(c(SOFT, `${S.approx} $${cost.toFixed(2)}`));
    return p.join(SEP);
  }, 7));
}

// ---------- limit lines ----------
const compact = cfg.compact === 'always' || (cfg.compact === 'auto' && COLS < 70);
const barW = compact ? 8 : Math.min(cfg.width, Math.max(8, COLS - 45));

function pace(key, w) {
  return w.resets_at ? Math.min(1, Math.max(0, 1 - (w.resets_at - now) / W[key].len)) : null;
}
function paceText(p, pc) {
  if (pc == null) return null;
  const diff = p - pc * 100;
  if (diff > 10) return { full: c(YELLOW, `${S.warn} ${L.fast}`), short: c(YELLOW, S.warn) };
  if (diff < -10) return { full: c(GREEN, `${S.ok} ${L.ok}`), short: c(GREEN, S.ok) };
  return { full: c(SOFT, `${S.mid} ${L.mid}`), short: c(SOFT, S.mid) };
}

// One limit line. level: 0 = everything, higher = shorter
function limitLine(key, w, level, width, opts = {}) {
  const p = w.used_percentage;
  const week = key === 'seven_day';
  const shown = p < 100 ? Math.min(99, Math.round(p)) : Math.round(p);
  let s = `${c(SOFT, week ? L.d7 : L.h5)} ${bar(p, width)} ${pctColor(p)}${BOLD}${String(shown).padStart(3)}%${R}`;
  if (opts.wasReset) return level >= 7 ? s : `${s}  ${c(GREEN, level < 5 ? L.wasReset : L.wasResetShort)}`;
  if (!w.resets_at || level >= 6) return s;
  const when = week && level < 5 ? fullDate(w.resets_at) : clock(w.resets_at);
  if (p >= 100) return `${s}  ${c(RED, `${BOLD}${L.exhausted}`)}${level < 2 ? c(SOFT, ` ${L.until(when, dur(w.resets_at - now))}`) : c(SOFT, ` ${when}`)}`;
  s += `  ${c(SOFT, `${L.reset} ${when}`)}`;
  if (compact) return s;
  if (level < 2) s += c(GREY, ` ${L.in(dur(w.resets_at - now))}`);
  if (opts.stale) return s + c(GREY, `  ${L.stale(dur(now - opts.stale))}`);
  if (level < 4) {
    const f = forecast(key, w);
    if (f?.runsOut) {
      const t = week ? fullDate(f.eta) : clock(f.eta);
      s += level < 3 ? `  ${c(RED, `${S.warn} ${L.runsOut(week ? t : L.at(t))}`)}` : `  ${c(RED, `${S.warn} ${t}`)}`;
    } else {
      const pt = paceText(p, pace(key, w));
      if (pt) s += `  ${level < 3 ? pt.full : pt.short}`;
    }
    if (week && level < 1) {
      const days = (w.resets_at - now) / 86400;
      if (days >= 1) s += c(SOFT, ` ${S.dot} ${L.perDay(Math.round((100 - p) / days))}`);
    }
  }
  return s;
}

const items = []; // [key, window, opts]
for (const key of Object.keys(W)) {
  const prev = readWindow(st.ultimi?.[key]);
  checkReset(key, prev);
  let w = cur[key], opts = {};
  if (!w || (w.resets_at && w.resets_at <= now)) {
    const stored = readWindow(st.rate_limits?.[key]);
    if (stored?.resets_at > now) { w = stored; opts.stale = hasIncoming ? null : st.aggiornato; if (opts.stale && now - opts.stale < 120) opts.stale = null; }
    else if (prev?.resets_at && prev.resets_at <= now && now - prev.resets_at < W[key].len) { w = { used_percentage: 0, resets_at: null }; opts.wasReset = true; }
    else continue;
  }
  if (!opts.wasReset && !opts.stale && hasIncoming) checkAlerts(key, w);
  items.push([key, w, opts]);
}

let spendLine = null;
const sp = rlIn?.spend_limit && typeof rlIn.spend_limit === 'object' ? rlIn.spend_limit : null;
const spPct = num(sp?.used_percentage);
if (spPct != null) {
  const used = num(sp.used_usd), limit = num(sp.limit_usd);
  const p = Math.max(0, spPct);
  const txt = used != null && limit != null ? `$${used.toFixed(2)} / $${limit.toFixed(2)}` : '';
  spendLine = `${c(SOFT, '$ ')} ${bar(p, barW)} ${pctColor(p)}${BOLD}${String(Math.round(p)).padStart(3)}%${R}${txt ? `  ${c(SOFT, txt)}` : ''}`;
}

const limitLines = [];
if (compact && items.length) {
  limitLines.push(fit(l => items.map(([k, w, o]) => limitLine(k, w, 5 + l, barW, o)).join(SEP), 3));
} else {
  for (const [k, w, o] of items) limitLines.push(fit(l => limitLine(k, w, Math.min(l, 5), l < 6 ? barW : 8, o), 7));
}
if (spendLine) limitLines.push(spendLine);

if (!limitLines.length) {
  // No limits yet. With API-key accounts they never arrive: say so instead of "waiting".
  const answered = num(d.cost?.total_api_duration_ms) > 0;
  limitLines.push(fit(l => c(GREY, answered ? (l ? L.unavailableShort : L.unavailable) : (l ? L.waitingShort : L.waiting)), 2));
}

if (cfg.gap && !compact) limitLines.forEach((l, i) => { if (i) lines.push('\u2800'); lines.push(l); }); // U+2800: invisible but not whitespace, so it is kept
else lines.push(...limitLines);

process.stdout.write(lines.join('\n'));

// ---------- save (merged with what other sessions wrote meanwhile) ----------
try {
  const disk = readState();
  const out = { ...disk };
  out.storia = compactHistory([...disk.storia, ...st.storia]);
  out.rate_limits = { ...disk.rate_limits };
  out.ultimi = { ...disk.ultimi };
  for (const k of Object.keys(W)) {
    // a fresh response replaces what is stored; otherwise the newest value wins
    if (cur[k]) out.rate_limits[k] = pick(cur[k], readWindow(disk.rate_limits?.[k]));
    const u = cur[k] ? pick(cur[k], readWindow(disk.ultimi?.[k])) : readWindow(disk.ultimi?.[k]);
    if (u) out.ultimi[k] = { used_percentage: u.used_percentage, resets_at: u.resets_at };
  }
  if (sid && hasIncoming) {
    const sessions = { ...disk.sessioni };
    for (const [id, v] of Object.entries(sessions)) if (!v || !(now - v.t < 2 * 86400)) delete sessions[id];
    const prevEntry = sessions[sid];
    // Remembers the session's API time, to recognize its next response as fresh
    if (!prevEntry || prevEntry.a !== apiTime || !(now - prevEntry.t < 3600)) sessions[sid] = { t: Math.floor(now), a: apiTime };
    out.sessioni = sessions;
  }
  // "updated" moves with new data, or every 5 minutes while sessions keep reporting
  if (hasIncoming && (fresh.five_hour || fresh.seven_day || !sid || !(now - (disk.aggiornato || 0) < 300))) {
    out.aggiornato = Math.max(Math.round(now), disk.aggiornato || 0);
    out.context_pct = num(d.context_window?.used_percentage);
  }
  if (spPct != null) out.spend = { used_percentage: Math.max(0, spPct), used_usd: num(sp.used_usd), limit_usd: num(sp.limit_usd) };
  // Skip the write when nothing changed (idle sessions refresh every 60 s)
  const before = JSON.stringify(disk), after = JSON.stringify(out);
  if (after !== before || !existsSync(STATE_FILE)) {
    mkdirSync(STATE_DIR, { recursive: true });
    writeAtomic(STATE_FILE, after);
  }
  if (Math.random() < 0.05) cleanupAlerts();
} catch {}
