#!/usr/bin/env node
// Installs (or removes) the /limiti skill and the usage-limits status line for Claude Code.
//   node install.mjs            install or update
//   node install.mjs --force    replace a status line configured by something else (it is saved and restored on --remove)
//   node install.mjs --remove   uninstall (keeps preferences and history)
//   node install.mjs --codex    only the skill for Codex (~/.agents/skills), Claude Code untouched
//   (a normal install also adds the Codex skill when a Codex folder exists)
// Italian aliases: --forza, --rimuovi
const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  console.error(`claude-limiti needs Node.js 18 or later (you have ${process.versions.node}).`);
  process.exit(1);
}

const { cpSync, existsSync, readFileSync, rmSync, copyFileSync, lstatSync, unlinkSync } = await import('node:fs');
const { join, dirname } = await import('node:path');
const { homedir } = await import('node:os');
const { fileURLToPath } = await import('node:url');
const { CLAUDE_DIR, loadConfig, detectLanguage, writeAtomic } = await import('./limiti/common.mjs');
const { CODEX_DIR } = await import('./limiti/codex.mjs');

const T = {
  it: {
    badJson: f => `${f} non è un JSON valido: correggilo e riprova. Non ho cambiato nulla.`,
    notObject: f => `${f} non contiene un oggetto JSON: correggilo e riprova. Non ho cambiato nulla.`,
    foreign: s => `Hai già una status line configurata:\n  ${s}\nNon la tocco. Per sostituirla esegui: node install.mjs --force\n(la salvo e la rimetto se un giorno disinstalli).`,
    skill: d => `Skill installata in ${d}`,
    saved: f => `Status line precedente salvata in ${f}`,
    backup: f => `Copia di sicurezza di settings.json: ${f}`,
    enabled: 'Status line attivata in settings.json.',
    oddPath: p => `Attenzione: il percorso ${p} contiene caratteri speciali ($ ` + '`' + ` % !). Se la barra non compare, installa da un utente senza questi caratteri nel nome.`,
    done: 'Fatto. Riavvia Claude Code: i limiti compaiono dopo la prima risposta.\nPer personalizzare la barra chiedi a Claude, per esempio "/limiti cambia lo stile della barra".',
    restored: 'Status line precedente ripristinata.', removedSl: 'Status line rimossa da settings.json.',
    removedSkill: d => `Skill rimossa: ${d}`,
    codexSkill: d => `Skill per Codex installata in ${d}: in Codex chiedi "quanto mi resta?".`,
    codexForeign: d => `In ${d} c'è già un'altra skill "limiti": non la tocco.`,
    codexRemoved: d => `Skill per Codex rimossa: ${d}`,
    kept: 'Preferenze e storico restano in ~/.claude (statusline-limiti.config.json, state/limiti-*): cancellali a mano se non servono.',
  },
  en: {
    badJson: f => `${f} is not valid JSON: fix it and try again. Nothing was changed.`,
    notObject: f => `${f} does not contain a JSON object: fix it and try again. Nothing was changed.`,
    foreign: s => `You already have a status line configured:\n  ${s}\nLeaving it alone. To replace it run: node install.mjs --force\n(it is saved and put back if you ever uninstall).`,
    skill: d => `Skill installed in ${d}`,
    saved: f => `Previous status line saved in ${f}`,
    backup: f => `Backup of settings.json: ${f}`,
    enabled: 'Status line enabled in settings.json.',
    oddPath: p => `Warning: the path ${p} contains special characters ($ ` + '`' + ` % !). If the bar does not show up, install from a user whose name has none of them.`,
    done: 'Done. Restart Claude Code: the limits appear after the first response.\nTo customize the bar ask Claude, e.g. "/limiti change the bar style".',
    restored: 'Previous status line restored.', removedSl: 'Status line removed from settings.json.',
    removedSkill: d => `Skill removed: ${d}`,
    codexSkill: d => `Codex skill installed in ${d}: in Codex ask "how much usage is left?".`,
    codexForeign: d => `${d} already holds another "limiti" skill: leaving it alone.`,
    codexRemoved: d => `Codex skill removed: ${d}`,
    kept: 'Preferences and history stay in ~/.claude (statusline-limiti.config.json, state/limiti-*): delete them by hand if you do not need them.',
  },
};
const L = T[detectLanguage(loadConfig())];

const args = process.argv.slice(2);
const force = args.includes('--force') || args.includes('--forza');
const remove = args.includes('--remove') || args.includes('--rimuovi');
const codexOnly = args.includes('--codex');

const SRC = join(dirname(fileURLToPath(import.meta.url)), 'limiti');
const DEST = join(CLAUDE_DIR, 'skills', 'limiti');
const SETTINGS = join(CLAUDE_DIR, 'settings.json');
const BACKUP = SETTINGS + '.bak-limiti';
const PREVIOUS = join(CLAUDE_DIR, 'statusline-limiti.precedente.json');
const LEGACY = join(CLAUDE_DIR, 'statusline-limiti.mjs'); // script location of early versions

// ---------- skill for Codex (and other agents reading ~/.agents/skills) ----------
const CODEX_DEST = join(homedir(), '.agents', 'skills', 'limiti');
const CODEX_TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), 'codex-skill', 'SKILL.md');
const MARK = '.claude-limiti'; // tells our copy apart from someone else's "limiti" skill
const isOurs = d => existsSync(join(d, MARK));
function installCodex() {
  if (existsSync(CODEX_DEST) && !isOurs(CODEX_DEST)) { console.log(L.codexForeign(CODEX_DEST)); return; }
  rmSync(CODEX_DEST, { recursive: true, force: true });
  cpSync(SRC, CODEX_DEST, { recursive: true });
  // Codex does not expand CLAUDE_SKILL_DIR: the skill gets the absolute path written in
  const dir = CODEX_DEST.split('\\').join('/');
  writeAtomic(join(CODEX_DEST, 'SKILL.md'), readFileSync(CODEX_TEMPLATE, 'utf8').split('{{DIR}}').join(dir));
  writeAtomic(join(CODEX_DEST, MARK), 'installed by claude-limiti install.mjs\n');
  console.log(L.codexSkill(CODEX_DEST));
}
if (codexOnly && !remove) { installCodex(); process.exit(0); }

const script = join(DEST, 'statusline.mjs').replace(/\\/g, '/');
// Windows: double quotes (forward slashes work in cmd, PowerShell and Git Bash).
// Elsewhere: single quotes, so a home folder containing $ or ` is never expanded by the shell.
const COMMAND = process.platform === 'win32' ? `node "${script}"` : `node '${script.replace(/'/g, `'\\''`)}'`;
const ours = sl => typeof sl?.command === 'string' && (/skills[\\/]limiti[\\/]statusline\.mjs/.test(sl.command) || /[\\/]statusline-limiti\.mjs["']?\s*$/.test(sl.command));

let settings = {};
if (existsSync(SETTINGS)) {
  try { settings = JSON.parse(readFileSync(SETTINGS, 'utf8')); }
  catch { console.error(L.badJson(SETTINGS)); process.exit(1); }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) { console.error(L.notObject(SETTINGS)); process.exit(1); }
}
function saveSettings() {
  // The first backup is never overwritten: it is the state before claude-limiti
  if (existsSync(SETTINGS) && !existsSync(BACKUP)) { copyFileSync(SETTINGS, BACKUP); console.log(L.backup(BACKUP)); }
  writeAtomic(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
}
const isLink = p => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };

if (remove) {
  if (ours(settings.statusLine)) {
    let prev = null;
    try { prev = JSON.parse(readFileSync(PREVIOUS, 'utf8')); } catch {}
    if (prev && typeof prev === 'object') { settings.statusLine = prev; console.log(L.restored); }
    else { delete settings.statusLine; console.log(L.removedSl); }
    saveSettings();
    try { unlinkSync(PREVIOUS); } catch {}
  }
  if (existsSync(DEST) || isLink(DEST)) { rmSync(DEST, { recursive: true, force: true }); console.log(L.removedSkill(DEST)); }
  if (isOurs(CODEX_DEST)) { rmSync(CODEX_DEST, { recursive: true, force: true }); console.log(L.codexRemoved(CODEX_DEST)); }
  if (process.platform === 'win32' && !process.env.LIMITI_SCHEDULE_FILE) {
    // scheduled reset notifications still waiting
    const { spawnSync } = await import('node:child_process');
    const ps = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    spawnSync(ps, ['-NoProfile', '-NonInteractive', '-Command', "Get-ScheduledTask -TaskName 'claude-limiti reset *' -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false"], { stdio: 'ignore', windowsHide: true, timeout: 20000 });
  }
  console.log(L.kept);
  process.exit(0);
}

const current = settings.statusLine;
if (current && !ours(current)) {
  if (!force) { console.error(L.foreign(JSON.stringify(current))); process.exit(1); }
  writeAtomic(PREVIOUS, JSON.stringify(current, null, 2) + '\n'); console.log(L.saved(PREVIOUS));
}

// Fresh copy, so files removed in newer versions do not linger
if (existsSync(DEST) || isLink(DEST)) rmSync(DEST, { recursive: true, force: true });
cpSync(SRC, DEST, { recursive: true });
console.log(L.skill(DEST));

const keep = ours(current) ? current : {}; // keeps e.g. "padding" set by the user
settings.statusLine = { ...keep, type: 'command', command: COMMAND, refreshInterval: keep.refreshInterval ?? 60 };
saveSettings();
console.log(L.enabled);
if (process.platform === 'win32' && /[$`%!]/.test(script)) console.log(L.oddPath(script));
if (ours(current) && /statusline-limiti\.mjs/.test(current.command) && existsSync(LEGACY)) { try { unlinkSync(LEGACY); } catch {} }
if (existsSync(CODEX_DIR) || isOurs(CODEX_DEST)) installCodex();

console.log(`\n${L.done}`);
