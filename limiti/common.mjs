// Shared pieces: paths, settings schema, bar styles, symbols, translations, helpers.
// Parti condivise: percorsi, schema impostazioni, stili, simboli, traduzioni, utilità.
import { readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

// Claude Code's configuration folder (CLAUDE_CONFIG_DIR moves it elsewhere)
export const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
export const STATE_DIR = join(CLAUDE_DIR, 'state');
export const STATE_FILE = join(STATE_DIR, 'limiti-utilizzo.json');
export const ALERTS_DIR = join(STATE_DIR, 'limiti-avvisi');
// Optional log of what Claude Code sends, to check our assumptions with real data
export const DIAG_FILE = join(STATE_DIR, 'limiti-diagnostica.jsonl');
// Outside the skill folder, so updating the skill keeps the user's preferences
export const CONFIG_FILE = join(CLAUDE_DIR, 'statusline-limiti.config.json');

// ---------- bar styles: [filled, empty] ----------
// Only characters that are one column wide and present in common terminal fonts
// (Cascadia, Consolas, Menlo, DejaVu). No emoji: they render two columns wide but
// count as one, and overlap the text that follows.
export const STYLES = {
  line:     ['━', '━'],
  blocks:   ['█', '░'],
  thin:     ['━', '─'],
  squares:  ['■', '□'],
  dots:     ['●', '○'],
  diamonds: ['◆', '◇'],
  ascii:    ['#', '-'],
};

export const SYMBOLS = {
  unicode: { model: '◆', sep: '│', time: '◷', warn: '▲', ok: '✓', mid: '●', fast: '»', approx: '≈', dot: '·' },
  ascii:   { model: '*', sep: '|', time: 't', warn: '!', ok: '+', mid: 'o', fast: '>>', approx: '~', dot: '-' },
};

// ---------- settings schema ----------
const bool = v => {
  if (typeof v === 'boolean') return v;
  if (/^(true|yes|si|sì|on|1)$/i.test(String(v))) return true;
  if (/^(false|no|off|0)$/i.test(String(v))) return false;
  throw 'true | false';
};
const oneOf = (list, aliases = {}) => v => {
  const k = aliases[String(v).toLowerCase()] ?? String(v).toLowerCase();
  if (!list.includes(k)) throw list.join(' | ');
  return k;
};

export const SCHEMA = {
  style:         { def: 'line', parse: oneOf(Object.keys(STYLES), { linea: 'line', blocchi: 'blocks', sottile: 'thin', quadrati: 'squares', pallini: 'dots', rombi: 'diamonds' }) },
  width:         { def: 20, parse: v => { const n = Number(v); if (!(Number.isInteger(n) && n >= 8 && n <= 40)) throw '8-40'; return n; } },
  gap:           { def: false, parse: bool },
  brackets:      { def: false, parse: bool },
  compact:       { def: 'auto', parse: oneOf(['auto', 'always', 'never'], { sempre: 'always', mai: 'never' }) },
  notifications: { def: true, parse: bool },
  thresholds:    { def: [80, 95], parse: v => {
    const a = (Array.isArray(v) ? v : String(v).split(/[,; ]+/)).filter(x => x !== '').map(Number);
    if (!a.length || a.some(n => !(n > 0 && n <= 100))) throw '1-100, e.g. 80,95';
    return [...new Set(a)].sort((x, y) => x - y);
  } },
  show_context:  { def: true, parse: bool },
  show_cost:     { def: true, parse: bool },
  show_git:      { def: true, parse: bool },
  colors:        { def: 'auto', parse: oneOf(['auto', 'truecolor', '256', 'none'], { '24bit': 'truecolor', nessuno: 'none', off: 'none' }) },
  symbols:       { def: 'unicode', parse: oneOf(['unicode', 'ascii']) },
  language:      { def: 'auto', parse: oneOf(['auto', 'it', 'en'], { italiano: 'it', english: 'en', inglese: 'en' }) },
  diagnostics:   { def: false, parse: bool },
  scheduled_reset: { def: false, parse: bool }, // Windows: reset notification even with every session closed
  show_codex:    { def: true, parse: bool },  // extra line with the OpenAI Codex limits, only if Codex is used
};
export const DEFAULTS = Object.fromEntries(Object.entries(SCHEMA).map(([k, s]) => [k, s.def]));

// Italian names (used by earlier versions and accepted as aliases)
export const KEY_ALIASES = {
  stile_barra: 'style', stile: 'style', larghezza_barra: 'width', larghezza: 'width',
  spazio_tra_barre: 'gap', spazio: 'gap', parentesi: 'brackets', compatto: 'compact',
  notifiche: 'notifications', soglie: 'thresholds', mostra_contesto: 'show_context',
  mostra_costo: 'show_cost', mostra_git: 'show_git', colori: 'colors', simboli: 'symbols', lingua: 'language',
  diagnostica: 'diagnostics', notifica_reset_programmata: 'scheduled_reset', reset_programmato: 'scheduled_reset', mostra_codex: 'show_codex',
};
export const canonicalKey = k => {
  k = String(k).toLowerCase();
  if (Object.hasOwn(SCHEMA, k)) return k;
  if (Object.hasOwn(KEY_ALIASES, k)) return KEY_ALIASES[k];
  return null;
};

// Reads the user's file: unknown keys are ignored, invalid values fall back to defaults.
export function readUserConfig() {
  let raw = {};
  try { raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')); } catch {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'colori_24bit') { if (v === false && !('colors' in raw) && !('colori' in raw)) out.colors = '256'; continue; }
    const key = canonicalKey(k);
    if (!key) continue;
    try { out[key] = SCHEMA[key].parse(v); } catch {}
  }
  return out; // only what the user set
}
export const loadConfig = () => ({ ...DEFAULTS, ...readUserConfig() });

// Saves only values different from the defaults, so future default changes still apply.
export function saveUserConfig(cfg) {
  const diff = {};
  for (const k of Object.keys(SCHEMA)) if (JSON.stringify(cfg[k]) !== JSON.stringify(DEFAULTS[k])) diff[k] = cfg[k];
  writeAtomic(CONFIG_FILE, JSON.stringify(diff, null, 2) + '\n');
}

// ---------- language ----------
export function detectLanguage(cfg) {
  if (cfg.language === 'it' || cfg.language === 'en') return cfg.language;
  let system = '';
  try { system = Intl.DateTimeFormat().resolvedOptions().locale; } catch {}
  // On Windows LANG is not a user setting: VS Code, Git Bash and others set it on their own
  // (e.g. en_US when VS Code is in English). The system language is what the user chose.
  if (process.platform === 'win32' && system) return /^it/i.test(system) ? 'it' : 'en';
  const env = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '';
  const loc = env && env !== 'C' && env !== 'POSIX' ? env : system;
  return /^it/i.test(loc) ? 'it' : 'en';
}

const DAYS = { it: ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = n => String(n).padStart(2, '0');
export const hhmm = t => `${p2(t.getHours())}:${p2(t.getMinutes())}`;

// Formatting helpers bound to a language
export function formatters(lang) {
  const D = DAYS[lang];
  const day = lang === 'it' ? 'g' : 'd';
  const dur = (s, spaced = false) => {
    s = Math.max(0, Math.floor(s));
    const g = Math.floor(s / 86400); s -= g * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60);
    if (g) return `${g}${day} ${h}h`;
    if (h) return `${h}h:${p2(m)}m`; // e.g. "2h:58m"
    return `${m}m`;
  };
  // "14:20" today, "Tue 14:20" another day
  const clock = epoch => {
    const t = new Date(epoch * 1000);
    return new Date().toDateString() === t.toDateString() ? hhmm(t) : `${D[t.getDay()]} ${hhmm(t)}`;
  };
  // "ven 13/11 21:00" / "Fri 13 Nov 21:00"
  const fullDate = epoch => {
    const t = new Date(epoch * 1000);
    return lang === 'it'
      ? `${D[t.getDay()]} ${p2(t.getDate())}/${p2(t.getMonth() + 1)} ${hhmm(t)}`
      : `${D[t.getDay()]} ${t.getDate()} ${MONTHS_EN[t.getMonth()]} ${hhmm(t)}`;
  };
  return { dur, clock, fullDate, dayName: t => D[t.getDay()] };
}

// ---------- safety helpers ----------
// Removes control characters (ANSI/OSC escape sequences) from external text and limits length
export const clean = (s, max = 40) => (typeof s === 'string' || typeof s === 'number' ? String(s) : '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').slice(0, max);
export const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null));

// Atomic write: temp file + rename, so an interrupted run never leaves a truncated file.
// Keeps the permissions of the existing file and writes through symlinks (e.g. dotfiles).
export function writeAtomic(file, data) {
  try { file = realpathSync(file); } catch {}
  let mode = 0o600;
  try { mode = statSync(file).mode & 0o777; } catch {}
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, data, { mode });
  for (let i = 0; ; i++) {
    try { renameSync(tmp, file); return; }
    catch (e) {
      if (i >= 4 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) { try { unlinkSync(tmp); } catch {} throw e; }
      const until = Date.now() + 15; while (Date.now() < until) { /* brief wait (Windows file locks) */ }
    }
  }
}
