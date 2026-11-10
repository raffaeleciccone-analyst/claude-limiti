// Customize the limits status line. Keys and values are accepted in English or Italian.
//   node settings.mjs                 current settings + options
//   node settings.mjs styles          preview of every bar style   (alias: stili)
//   node settings.mjs <key> <value>   change one setting (validated)
//   node settings.mjs reset           back to defaults
import { STYLES, SCHEMA, DEFAULTS, KEY_ALIASES, canonicalKey, readUserConfig, saveUserConfig, detectLanguage } from './common.mjs';

const T = {
  it: {
    title: 'IMPOSTAZIONI ATTUALI', preview: 'Anteprima', current: '<- attuale',
    note: '(anteprima al 60%, senza colori: nel terminale la parte non usata è grigia)',
    resetDone: 'OK: impostazioni predefinite ripristinate.',
    missing: (k, v) => `ERRORE: manca il valore per ${k} (${v})`,
    invalid: (k, v) => `ERRORE: valore non valido per ${k}. Valori ammessi: ${v}`,
    unknown: (k, list) => `ERRORE: impostazione sconosciuta "${k}". Disponibili: ${list}`,
    visible: 'Visibile dalla prossima risposta di Claude Code.',
    desc: {
      style: 'aspetto della barra', width: 'lunghezza barra (caratteri)', gap: 'riga vuota tra 5h e 7g',
      brackets: 'barra tra [ ]', compact: 'tutte le barre su una riga', notifications: 'notifiche alle soglie e al reset',
      thresholds: '% a cui avvisare', show_context: 'riga con modello e contesto', show_cost: 'costo stimato della sessione',
      show_git: 'branch git', colors: 'colori (none = senza colori)', symbols: 'ascii se vedi quadratini', language: 'lingua',
      diagnostics: 'registro per verificare il funzionamento',
      scheduled_reset: 'notifica di azzeramento anche a sessioni chiuse (Windows)',
    },
  },
  en: {
    title: 'CURRENT SETTINGS', preview: 'Preview', current: '<- current',
    note: '(preview at 60%, without colors: in the terminal the unused part is grey)',
    resetDone: 'OK: default settings restored.',
    missing: (k, v) => `ERROR: missing value for ${k} (${v})`,
    invalid: (k, v) => `ERROR: invalid value for ${k}. Allowed: ${v}`,
    unknown: (k, list) => `ERROR: unknown setting "${k}". Available: ${list}`,
    visible: 'Visible from the next Claude Code response.',
    desc: {
      style: 'bar look', width: 'bar length (characters)', gap: 'blank line between 5h and 7d',
      brackets: 'bar inside [ ]', compact: 'all bars on one line', notifications: 'alerts at thresholds and at reset',
      thresholds: '% that trigger an alert', show_context: 'line with model and context', show_cost: 'estimated session cost',
      show_git: 'git branch', colors: 'colors (none = no colors)', symbols: 'ascii if you see boxes', language: 'language',
      diagnostics: 'log to check how it works',
      scheduled_reset: 'reset notification even with sessions closed (Windows)',
    },
  },
};
const ALLOWED = {
  style: Object.keys(STYLES).join(' | '), width: '8-40', gap: 'true | false', brackets: 'true | false',
  compact: 'auto | always | never', notifications: 'true | false', thresholds: '80,95', show_context: 'true | false',
  show_cost: 'true | false', show_git: 'true | false', colors: 'auto | truecolor | 256 | none', symbols: 'unicode | ascii',
  language: 'auto | it | en', diagnostics: 'true | false', scheduled_reset: 'true | false',
};

const user = readUserConfig();
let cfg = { ...DEFAULTS, ...user };
const L = T[detectLanguage(cfg)];
const fmt = v => (Array.isArray(v) ? v.join(',') : String(v));
const itName = k => Object.keys(KEY_ALIASES).find(a => KEY_ALIASES[a] === k);
const preview = style => {
  const [on, off] = STYLES[style];
  const full = Math.round(cfg.width * 0.6);
  const b = on.repeat(full) + off.repeat(cfg.width - full);
  return cfg.brackets ? `[${b}]` : b;
};

const [cmdRaw, ...rest] = process.argv.slice(2);
const cmd = (cmdRaw || '').toLowerCase();
const val = rest.join(' ').trim();

if (!cmd) {
  console.log(L.title);
  for (const k of Object.keys(SCHEMA)) {
    const name = L === T.it && itName(k) ? `${k} (${itName(k)})` : k;
    console.log(`  ${name.padEnd(L === T.it ? 34 : 15)} ${fmt(cfg[k]).padEnd(9)} ${L.desc[k]} [${ALLOWED[k]}]`);
  }
  console.log(`\n${L.preview}: 5h ${preview(cfg.style)}  60%`);
} else if (cmd === 'styles' || cmd === 'stili') {
  for (const s of Object.keys(STYLES)) console.log(`  ${s.padEnd(9)} ${preview(s)}${s === cfg.style ? `   ${L.current}` : ''}`);
  console.log(`\n${L.note}`);
} else if (cmd === 'reset') {
  saveUserConfig({ ...DEFAULTS });
  console.log(T[detectLanguage(DEFAULTS)].resetDone);
} else {
  const key = canonicalKey(cmd);
  if (!key) { console.log(L.unknown(cmdRaw, Object.keys(SCHEMA).join(', '))); process.exit(1); }
  if (!val) { console.log(L.missing(key, ALLOWED[key])); process.exit(1); }
  try { cfg[key] = SCHEMA[key].parse(val); } catch { console.log(L.invalid(key, ALLOWED[key])); process.exit(1); }
  saveUserConfig(cfg);
  const M = T[detectLanguage(cfg)]; // messages follow a language change immediately
  console.log(`OK: ${key} = ${fmt(cfg[key])}`);
  console.log(`${M.preview}: 5h ${preview(cfg.style)}  60%`);
  console.log(M.visible);
}
