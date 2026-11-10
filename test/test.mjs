// Dependency-free tests: node test/test.mjs
// Every run uses a temporary home folder, so your real configuration is never touched.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = join(ROOT, 'limiti');
const SL = join(SKILL, 'statusline.mjs'), REPORT = join(SKILL, 'report.mjs'), SET = join(SKILL, 'settings.mjs'), INSTALL = join(ROOT, 'install.mjs');
const STYLES = ['line', 'blocks', 'thin', 'squares', 'dots', 'diamonds', 'ascii'];

let ok = 0, ko = 0;
const check = (cond, name) => { if (cond) ok++; else { ko++; console.log(`  FAILED: ${name}`); } };
const homes = [];
function newHome(config) {
  const h = mkdtempSync(join(tmpdir(), 'limiti-test-'));
  homes.push(h);
  mkdirSync(join(h, '.claude'), { recursive: true });
  if (config !== undefined) setConfig(h, config);
  return h;
}
const setConfig = (h, c) => writeFileSync(join(h, '.claude', 'statusline-limiti.config.json'), typeof c === 'string' ? c : JSON.stringify(c));
const env = (home, extra = {}) => {
  const e = { ...process.env, HOME: home, USERPROFILE: home, LIMITI_NO_NOTIFICHE: '1', COLUMNS: '160', ...extra };
  for (const k of ['NO_COLOR', 'COLORTERM', 'TERM_PROGRAM', 'TERM', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'LANG', 'LC_ALL', 'LC_MESSAGES']) if (!(k in extra)) delete e[k];
  return e;
};
const run = (home, file, args = [], input = '', extra) => spawnSync(process.execPath, [file, ...args], { input, env: env(home, extra), encoding: 'utf8' });
const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '');
const width = s => [...strip(s)].length;
const statePath = h => join(h, '.claude', 'state', 'limiti-utilizzo.json');
const readState = h => JSON.parse(readFileSync(statePath(h), 'utf8'));
const alerts = h => { try { return readdirSync(join(h, '.claude', 'state', 'limiti-avvisi')); } catch { return []; } };

const now = Math.floor(Date.now() / 1000);
const input = (h5, d7, extra = {}) => JSON.stringify({
  model: { display_name: 'Opus 5.5' }, effort: { level: 'medium' }, fast_mode: true,
  workspace: { current_dir: ROOT }, context_window: { used_percentage: 34 },
  prompt_cache: { expires_at: now + 600 }, cost: { total_duration_ms: 5400000, total_cost_usd: 1.23, total_api_duration_ms: 9000 },
  rate_limits: {
    ...(h5 == null ? {} : { five_hour: { used_percentage: h5, resets_at: now + 5400 } }),
    ...(d7 == null ? {} : { seven_day: { used_percentage: d7, resets_at: now + 300000 } }),
  },
  ...extra,
});
// Emoji and double-width characters (they overlap the following text)
const WIDE = /[\p{Extended_Pictographic}ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;

console.log('1. Bar styles: alignment and symbols');
for (const style of STYLES) for (const brackets of [false, true]) {
  const h = newHome({ style, brackets, language: 'it' });
  const r = run(h, SL, [], input(20, 18));
  const rows = strip(r.stdout).split('\n');
  const name = `${style}${brackets ? ' [ ]' : ''}`;
  check(r.status === 0 && rows.length === 3, `${name}: 3 lines, no errors`);
  check(!WIDE.test(rows.join('')), `${name}: no emoji or wide characters`);
  const [a, b] = [rows[1], rows[2]];
  check(a.startsWith('5h ') && b.startsWith('7g ') && a.indexOf('%') === b.indexOf('%') && a.indexOf('reset') === b.indexOf('reset'), `${name}: % and "reset" aligned`);
  check([...a.slice(3)].slice(0, 20 + (brackets ? 2 : 0)).every(ch => ch !== ' '), `${name}: bar exactly 20 wide`);
}

console.log('2. Terminal width: every line fits');
for (const lang of ['it', 'en']) for (const symbols of ['unicode', 'ascii']) for (const cols of [40, 60, 80, 90, 100, 110, 120, 160]) {
  const h = newHome({ language: lang, symbols });
  const st = join(h, '.claude', 'state'); mkdirSync(st, { recursive: true });
  writeFileSync(join(st, 'limiti-utilizzo.json'), JSON.stringify({ storia: [{ t: now - 1800, h5: 20, r5: now + 5400 }] }));
  const out = run(h, SL, [], input(60, 18), { COLUMNS: String(cols) }).stdout;
  const lines = out.split('\n');
  check(lines.every(l => width(l) <= cols), `${lang}/${symbols} at ${cols} columns: ${lines.map(width).join(',')}`);
}

for (const cols of [40, 60, 80]) {
  const h = newHome({ language: 'it' });
  mkdirSync(join(h, '.claude', 'state'));
  writeFileSync(statePath(h), JSON.stringify({ ultimi: { five_hour: { used_percentage: 85, resets_at: now - 100 } } }));
  const o = run(h, SL, [], input(null, 18), { COLUMNS: String(cols) }).stdout.split('\n');
  check(o.every(l => width(l) <= cols), '"azzerato" fits at ' + cols + ' columns: ' + o.map(width).join(','));
  const u = run(h, SL, [], JSON.stringify({ cost: { total_api_duration_ms: 5 } }), { COLUMNS: String(cols) }).stdout.split('\n');
  check(u.every(l => width(l) <= cols), '"non disponibili" fits at ' + cols + ' columns');
}

console.log('3. Special cases');
const cases = [
  ['no input', '', o => o.includes('in attesa della prima risposta')],
  ['broken JSON', '{broken', o => o.includes('in attesa')],
  ['JSON that is not an object', '42', o => o.includes('in attesa')],
  ['API-key account (answers, no limits)', JSON.stringify({ cost: { total_api_duration_ms: 5000 } }), o => o.includes('non disponibili')],
  ['exhausted', input(100, 40), o => o.includes('ESAURITO') && o.includes('100%')],
  ['99.6% is not shown as 100%', input(99.6, 40), o => o.includes(' 99%') && !o.includes('ESAURITO')],
  ['0%', input(0, 0), o => o.includes('  0%')],
  ['negative % shown as 0', input(-3, 10), o => o.includes('  0%') && !o.includes('-3')],
  ['5h only', input(30, null), o => o.includes('5h') && !o.includes('7g')],
  ['spend limit formatted', input(10, 10, { rate_limits: { spend_limit: { used_percentage: 63, used_usd: 617.123456, limit_usd: 1000 } } }), o => o.includes('$617.12 / $1000.00') && o.includes(' 63%')],
  ['spend limit without dollars', input(10, 10, { rate_limits: { spend_limit: { used_percentage: 63 } } }), o => o.includes(' 63%') && !o.includes('undefined')],
  ['cost as text does not crash', input(10, 10, { cost: { total_cost_usd: 'abc' } }), o => o.includes('5h')],
  ['wrong types everywhere', JSON.stringify({ model: 5, effort: 'x', workspace: { current_dir: 7 }, rate_limits: { five_hour: { used_percentage: '30', resets_at: String(now + 999) }, seven_day: 'x' } }), o => o.includes(' 30%')],
  ['no emoji in context line', input(20, 18), o => !WIDE.test(o) && o.includes('» fast') && o.includes('◷ 1h:30m')],
];
for (const [name, inp, expect] of cases) {
  const h = newHome({ language: 'it' });
  const r = run(h, SL, [], inp);
  check(r.status === 0 && expect(strip(r.stdout)), name);
}
{
  const h = newHome({ language: 'en' });
  const o = strip(run(h, SL, [], input(20, 18)).stdout);
  check(o.includes('7d ') && o.includes('resets') && o.includes('per day available'), 'English output');
}

{
  // Language "auto": on Windows the system language wins over LANG (VS Code sets LANG on its own)
  const h = newHome({});
  const sys = /^it/i.test(Intl.DateTimeFormat().resolvedOptions().locale) ? 'it' : 'en';
  const o = strip(run(h, SL, [], input(20, 18), { LANG: sys === 'it' ? 'en_US.UTF-8' : 'it_IT.UTF-8' }).stdout);
  const shown = o.includes('7g ') ? 'it' : 'en';
  if (process.platform === 'win32') check(shown === sys, 'Windows: system language wins over LANG set by VS Code');
  else check(shown === (sys === 'it' ? 'en' : 'it'), 'macOS/Linux: LANG decides the language');
}

console.log('4. Safety: escape sequences, git, sizes');
{
  const h = newHome({ language: 'it' });
  const evil = '\x1b]0;TITLE\x07\x1b]52;c;ZXZpbA==\x07\x1b[2J';
  const o = run(h, SL, [], input(20, 18, { model: { display_name: `Opus${evil}` }, effort: { level: evil } })).stdout;
  check(!/\x07|\x1b\]|\x1b\[2J/.test(o), 'control characters from the input are removed');
  const repo = join(h, 'repo'); mkdirSync(join(repo, '.git'), { recursive: true });
  writeFileSync(join(repo, '.git', 'HEAD'), `ref: refs/heads/main${evil}\n`);
  const o2 = run(h, SL, [], input(20, 18, { workspace: { current_dir: repo } })).stdout;
  check(!/\x07|\x1b\]|\x1b\[2J/.test(o2) && strip(o2).includes('(main'), 'malicious branch name is cleaned');
  const wt = join(h, 'wt'); mkdirSync(join(h, 'real', 'gitdir'), { recursive: true }); mkdirSync(wt);
  writeFileSync(join(h, 'real', 'gitdir', 'HEAD'), 'ref: refs/heads/feature\n');
  writeFileSync(join(wt, '.git'), 'gitdir: ../real/gitdir\n');
  check(strip(run(h, SL, [], input(20, 18, { workspace: { current_dir: wt } })).stdout).includes('(feature)'), 'worktree/submodule: relative gitdir resolved from the repo folder');
  writeFileSync(join(wt, '.git'), 'gitdir: //attacker.example/share/x\n');
  const t0 = Date.now();
  const o3 = strip(run(h, SL, [], input(20, 18, { workspace: { current_dir: wt } })).stdout);
  check(!o3.split('\n')[0].includes('wt ('), 'network (UNC) gitdir is ignored');
  check(Date.now() - t0 < 5000, 'network gitdir does not hang');
  for (const unc of ['/\\attacker.example\\share', '\\/attacker.example/share', '\\\\?\\UNC\\attacker.example\\share']) {
    writeFileSync(join(wt, '.git'), 'gitdir: ' + unc + '\n');
    const t1 = Date.now();
    const ox = strip(run(h, SL, [], input(20, 18, { workspace: { current_dir: wt } })).stdout);
    check(!ox.split('\n')[0].includes('wt (') && Date.now() - t1 < 5000, 'network path written as ' + unc + ' is ignored');
  }
  if (process.platform === 'win32') {
    // A real network path to this same computer (admin share): proves the block works,
    // because without it the branch WOULD be read through the network.
    const real = join(h, 'real', 'gitdir');
    const viaNet = '/\\localhost\\' + real[0] + '$' + real.slice(2);
    writeFileSync(join(wt, '.git'), 'gitdir: ' + viaNet + '\n');
    const on = strip(run(h, SL, [], input(20, 18, { workspace: { current_dir: wt } })).stdout);
    check(!on.split('\n')[0].includes('(feature)'), 'network path to localhost is not followed');
  }
  const ob = run(h, SL, [], input(20, 18, { model: { display_name: { toString: 1 } }, effort: { level: { toString: 1 } } }));
  check(ob.status === 0 && strip(ob.stdout).includes('5h'), 'objects instead of text do not crash');
  writeFileSync(join(repo, '.git', 'HEAD'), 'ref: refs/heads/' + 'x'.repeat(100000));
  const o4 = run(h, SL, [], input(20, 18, { workspace: { current_dir: repo } }));
  check(o4.status === 0 && o4.stdout.length < 2000, 'huge HEAD file is skipped');
  writeFileSync(join(repo, '.git', 'HEAD'), 'a1b2c3d4e5f6a7b8c9d0\n');
  check(strip(run(h, SL, [], input(20, 18, { workspace: { current_dir: repo } })).stdout).includes('(a1b2c3d)'), 'detached HEAD shows short hash');
}

console.log('5. Colors and symbols');
{
  const h = newHome({ language: 'it' });
  check(!run(h, SL, [], input(20, 18), { NO_COLOR: '1' }).stdout.includes('\x1b'), 'NO_COLOR: no colors');
  setConfig(h, { colors: 'none' }); const on = run(h, SL, [], input(40, 18)).stdout; check(!on.includes('\x1b'), 'colors none');
  check(on.includes('━━━━━━━━─'), 'without colors the line style shows the empty part differently');
  setConfig(h, { colors: '256' }); const o = run(h, SL, [], input(20, 18)).stdout; check(o.includes('38;5;') && !o.includes('38;2;'), 'colors 256');
  setConfig(h, { colori_24bit: false }); check(run(h, SL, [], input(20, 18)).stdout.includes('38;5;'), 'old setting colori_24bit:false still works');
  setConfig(h, {}); check(run(h, SL, [], input(20, 18)).stdout.includes('38;2;'), 'truecolor by default');
  setConfig(h, { symbols: 'ascii', style: 'ascii', colors: 'none' });
  check(/^[\x00-\x7f]*$/.test(run(h, SL, [], input(20, 18)).stdout), 'symbols ascii + style ascii: pure ASCII output');
}

console.log('6. Several sessions, history, forecast, state');
{
  const h = newHome({ language: 'it' });
  run(h, SL, [], input(55, 30));
  const o = strip(run(h, SL, [], input(40, 25)).stdout); // no session id (older Claude Code): one session, every value counts
  check(o.includes(' 40%') && o.includes(' 25%'), 'without session id the latest reading is shown');
  check(readState(h).rate_limits.five_hour.used_percentage === 40, 'without session id the state follows the latest reading');
  check(strip(run(h, REPORT).stdout).includes('40%'), 'report shows the latest value');
  {
    const g = newHome({ language: 'it' });
    // a session = id + total API time, which grows with every response
    const S = (id, api, h5, d7, extra = {}) => { const x = JSON.parse(input(h5, d7)); x.session_id = id; x.cost.total_api_duration_ms = api; return JSON.stringify({ ...x, ...extra }); };
    const show = inp => strip(run(g, SL, [], inp).stdout);
    show(S('A', 1000, 17, 10));                       // morning session, then left idle
    show(S('B', 1000, 37, 12));                       // first time seen: not trusted yet
    check(readState(g).rate_limits.five_hour.used_percentage === 17, 'new session: its first reading waits for its next response');
    show(S('B', 2000, 67, 15));                       // B keeps working
    check(show(S('A', 1000, 17, 10)).includes(' 67%'), 'idle session with an old lower value does not lower the bar');
    const g2 = newHome({ language: 'it' });            // same, right after installing (sessions unknown)
    run(g2, SL, [], S('B', 2000, 67, 15)); run(g2, SL, [], S('A', 1000, 17, 10));
    check(readState(g2).rate_limits.five_hour.used_percentage === 67, 'after installing, an idle session seen for the first time does not lower the bar');
    const up = show(S('B', 3000, 16, 14));            // B gets a new response with lower values: plan upgrade
    check(up.includes(' 16%') && up.includes(' 14%'), 'plan upgrade: a new lower value is shown at once');
    check(readState(g).rate_limits.five_hour.used_percentage === 16, 'plan upgrade: shared state updated');
    show(S('C', 500, 81, 71));                        // a third session seen for the first time with old high values
    check(readState(g).rate_limits.five_hour.used_percentage === 16, 'a session seen for the first time cannot bring old values back');
    show(S('C', 500, 81, 71));
    show(S('B', 4000, 18, 15));                       // the next real response fixes it
    check(show(S('C', 500, 81, 71)).includes(' 18%'), 'after a fresh response, idle sessions no longer bring old values back');
    const sw = JSON.parse(S('B', 5000, 5, 5)); sw.rate_limits.seven_day.resets_at = now + 86400;
    show(JSON.stringify(sw));
    check(readState(g).rate_limits.seven_day.used_percentage === 5, 'account switch / earlier weekly reset is accepted');
    const m1 = readFileSync(statePath(g), 'utf8');
    show(JSON.stringify(sw));
    check(readFileSync(statePath(g), 'utf8') === m1, 'nothing changed: state file not rewritten');
  }
  const old = [];
  for (let i = 0; i < 600; i++) old.push({ t: now - 11 * 3600 - i * 60, h5: 10, r5: now - 3600, d7: 10, r7: now + 300000 });
  writeFileSync(statePath(h), JSON.stringify({ storia: old }));
  run(h, SL, [], input(20, 18));
  const n = readState(h).storia.length;
  check(n < 40, `history older than 10h thinned (600 → ${n})`);
  writeFileSync(statePath(h), JSON.stringify({ storia: [{ t: now - 9 * 86400, h5: 1 }] }));
  run(h, SL, [], input(20, 18));
  check(readState(h).storia.every(x => now - x.t < 8 * 86400), 'history older than 8 days removed');
  writeFileSync(statePath(h), '{"storia": [1, 2');
  const r = run(h, SL, [], input(20, 18));
  check(r.status === 0 && readState(h).rate_limits, 'corrupted state file: recovers and rewrites valid JSON');
  check(!readdirSync(join(h, '.claude', 'state')).some(f => f.endsWith('.tmp')), 'no temporary files left behind');
}
{
  const h = newHome({ language: 'it' });
  mkdirSync(join(h, '.claude', 'state'));
  writeFileSync(statePath(h), JSON.stringify({ storia: [{ t: now - 1800, h5: 20, r5: now + 5400 + 30 }] }));
  check(strip(run(h, SL, [], input(60, 18)).stdout).includes('▲ a questo ritmo finisce alle'), '5h forecast (tolerates resets_at jitter)');
  setConfig(h, { language: 'en' });
  check(strip(run(h, SL, [], input(60, 18)).stdout).includes('▲ at this pace runs out at'), '5h forecast in English');
}
{
  const h = newHome({ language: 'it' });
  mkdirSync(join(h, '.claude', 'state'));
  writeFileSync(statePath(h), JSON.stringify({ ultimi: { five_hour: { used_percentage: 85, resets_at: now - 100 } } }));
  const o = strip(run(h, SL, [], input(null, 18)).stdout);
  check(o.includes('5h') && o.includes('azzerato'), 'after the reset the 5h line says "azzerato" instead of disappearing');
  check(alerts(h).some(f => f.endsWith('-reset')), 'reset notification claimed right after the reset');
  const h2 = newHome({ language: 'it' });
  mkdirSync(join(h2, '.claude', 'state'));
  writeFileSync(statePath(h2), JSON.stringify({ ultimi: { five_hour: { used_percentage: 85, resets_at: now - 3 * 3600 } } }));
  run(h2, SL, [], input(null, 18));
  check(!alerts(h2).some(f => f.endsWith('-reset')), 'no late reset notification hours afterwards');
}
{
  const h = newHome({ language: 'it' });
  run(h, SL, [], input(85, 10));
  const a1 = alerts(h);
  check(a1.length === 1 && a1[0].endsWith('-80'), 'alert at 80% claimed once');
  run(h, SL, [], input(86, 10));
  writeFileSync(statePath(h), 'corrupted');
  run(h, SL, [], input(87, 10));
  check(alerts(h).length === 1, 'no duplicate alert (other runs, corrupted state)');
  run(h, SL, [], input(96, 10));
  check(alerts(h).some(f => f.endsWith('-95')) && alerts(h).length === 2, 'alert at 95% claimed');
  const hj = newHome({ language: 'it' });
  const edge = Math.round((now + 7200) / 3600) * 3600 + 1800;
  for (const r of [edge - 20, edge + 20, edge - 20]) { const x = JSON.parse(input(85, 10)); x.rate_limits.five_hour.resets_at = r; run(hj, SL, [], JSON.stringify(x)); }
  check(alerts(hj).length <= 2, 'small changes of the reset time do not repeat the alert many times');
  const h2 = newHome({ language: 'it' });
  run(h2, SL, [], input(97, 10));
  check(alerts(h2).length === 2, 'first seen at 97%: one alert, both thresholds marked');
}

{
  // Notifications really sent (written to a file instead of the screen), once each
  const h = newHome({ language: 'it' });
  const file = join(h, 'toasts.txt');
  const N = { LIMITI_NO_NOTIFICHE: '', LIMITI_TOAST_FILE: file };
  const sent = () => { try { return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean); } catch { return []; } };
  run(h, SL, [], input(70, 10), N);
  check(sent().length === 0, 'no notification below the thresholds');
  const r = run(h, SL, [], input(83, 10), N);
  check(sent().length === 1 && sent()[0].includes('Limite 5 ore al 83%') && strip(r.stdout).includes(' 83%'), 'notification at 80% is really sent, and the bar is still printed');
  run(h, SL, [], input(86, 10), N);
  check(sent().length === 1, 'the same threshold is not notified twice');
  run(h, SL, [], input(96, 10), N);
  check(sent().length === 2 && sent()[1].includes('al 96%'), 'notification at 95%');
  setConfig(h, { language: 'it', notifications: false });
  const h2 = newHome({ language: 'it', notifications: false });
  run(h2, SL, [], input(99, 10), { ...N, LIMITI_TOAST_FILE: join(h2, 't.txt') });
  check(!existsSync(join(h2, 't.txt')), 'notifications off: nothing sent');
  const h3 = newHome({ language: 'it' });
  mkdirSync(join(h3, '.claude', 'state'));
  writeFileSync(statePath(h3), JSON.stringify({ ultimi: { five_hour: { used_percentage: 90, resets_at: now - 60 } } }));
  run(h3, SL, [], input(null, 18), { ...N, LIMITI_TOAST_FILE: join(h3, 't.txt') });
  check(readFileSync(join(h3, 't.txt'), 'utf8').includes('azzerato'), 'reset notification is really sent');
}

{
  // Reset notification with sessions closed: what would be scheduled is written to a file
  const h = newHome({ language: 'it' });
  const file = join(h, 'schedules.txt');
  const E = { LIMITI_SCHEDULE_FILE: file };
  const got = () => { try { return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean); } catch { return []; } };
  run(h, SL, [], input(85, 10), E);
  check(got().length === 0, 'scheduled_reset off by default: nothing scheduled');
  setConfig(h, { language: 'it', scheduled_reset: true });
  run(h, SL, [], input(70, 10), E);
  check(got().length === 0, 'below the first threshold: nothing scheduled');
  const r = run(h, SL, [], input(85, 10), E);
  const when = new Date((now + 5400 + 60) * 1000).toISOString();
  check(got().length === 1 && got()[0] === 'claude-limiti reset five_hour | ' + when + ' | Claude Code · Limite 5 ore azzerato' && strip(r.stdout).includes(' 85%'), 'over the threshold: one task at reset time + 1 minute');
  run(h, SL, [], input(90, 10), E);
  check(got().length === 1, 'scheduled once per window');
  const moved = JSON.parse(input(91, 10)); moved.rate_limits.five_hour.resets_at = now + 5400 + 7200;
  run(h, SL, [], JSON.stringify(moved), E);
  check(got().length === 2 && got()[1].startsWith('claude-limiti reset five_hour | ' + new Date((now + 5400 + 7200 + 60) * 1000).toISOString()), 'reset time changed: task moved');
  const w = JSON.parse(input(10, 85));
  run(h, SL, [], JSON.stringify(w), E);
  check(got().some(l => l.startsWith('claude-limiti reset seven_day')), 'weekly window scheduled too');
  setConfig(h, { language: 'it', notifica_reset_programmata: true });
  check(run(h, SET).stdout.includes('scheduled_reset (notifica_reset_programmata)'), 'Italian name of the setting accepted and listed');
}

console.log('7. Layout options');
{
  const h = newHome({ language: 'it', spazio_tra_barre: true });
  const rows = strip(run(h, SL, [], input(20, 18)).stdout).split('\n');
  check(rows.length === 4 && rows[2] === '⠀', 'gap (Italian name spazio_tra_barre) adds an invisible line');
  setConfig(h, { compact: 'always', language: 'it' });
  const c = strip(run(h, SL, [], input(20, 18)).stdout).split('\n');
  check(c.length === 2 && c[1].includes('5h') && c[1].includes('7g'), 'compact: bars on one line');
  setConfig(h, { show_context: false, language: 'it' });
  check(strip(run(h, SL, [], input(20, 18)).stdout).split('\n').length === 2, 'show_context false hides line 1');
  setConfig(h, { show_cost: false, show_git: false, language: 'it' });
  const l1 = strip(run(h, SL, [], input(20, 18)).stdout).split('\n')[0];
  check(!l1.includes('$') && !l1.includes('('), 'show_cost / show_git false');
  setConfig(h, { style: 'nope', width: 999, thresholds: 'x', compact: 1, colors: [] });
  const r = run(h, SL, [], input(20, 18));
  check(r.status === 0 && strip(r.stdout).includes('━'.repeat(20)), 'invalid settings fall back to defaults');
  setConfig(h, '{not json');
  check(run(h, SL, [], input(20, 18)).status === 0, 'unreadable settings file: still works');
}

{
  const h = newHome();
  const alt = join(h, 'altrove');
  mkdirSync(alt);
  writeFileSync(join(alt, 'statusline-limiti.config.json'), JSON.stringify({ language: 'en' }));
  const o = strip(run(h, SL, [], input(20, 18), { CLAUDE_CONFIG_DIR: alt }).stdout);
  check(o.includes('7d ') && existsSync(join(alt, 'state', 'limiti-utilizzo.json')), 'CLAUDE_CONFIG_DIR is respected');
  check(run(h, INSTALL, [], '', { CLAUDE_CONFIG_DIR: alt }).status === 0 && existsSync(join(alt, 'skills', 'limiti', 'SKILL.md')) && existsSync(join(alt, 'settings.json')), 'installer uses CLAUDE_CONFIG_DIR');
}
if (process.platform !== 'win32') {
  const h = newHome();
  const S = join(h, '.claude', 'settings.json');
  writeFileSync(S, '{}', { mode: 0o600 });
  run(h, INSTALL);
  check((statSync(S).mode & 0o777) === 0o600, 'settings.json keeps its permissions');
}

{
  const h = newHome({ language: 'it' });
  const S = (api, h5) => { const x = JSON.parse(input(h5, 10)); x.session_id = 'sessione-di-prova-123'; x.cost.total_api_duration_ms = api; return JSON.stringify(x); };
  run(h, SL, [], S(100, 20));
  check(!existsSync(join(h, '.claude', 'state', 'limiti-diagnostica.jsonl')), 'diagnostics off by default: nothing logged');
  check(run(h, REPORT, ['diagnosi']).stdout.includes('Registro vuoto'), 'diagnostics report with no log');
  setConfig(h, { language: 'it', diagnostics: true });
  run(h, SL, [], S(100, 20)); run(h, SL, [], S(200, 21)); run(h, SL, [], S(200, 25)); run(h, SL, [], S(150, 26));
  const log = readFileSync(join(h, '.claude', 'state', 'limiti-diagnostica.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  check(log.length === 4 && log[0].s === 'sessione' && !JSON.stringify(log).includes('prova-123'), 'diagnostics log: one line per reading, shortened session id');
  const d = run(h, REPORT, ['diagnosi']).stdout;
  check(/4 letture, 1 sessioni/.test(d) && /senza una nuova risposta: 1 su 3/.test(d) && /indietro.*: 1/.test(d), 'diagnostics report detects the cases');
  setConfig(h, { language: 'en', diagnostics: true });
  check(run(h, REPORT, ['diagnostics']).stdout.includes('readings'), 'diagnostics report in English');
}

console.log('8. report.mjs');
{
  const h = newHome({ language: 'it' });
  check(run(h, REPORT).stdout.startsWith('NESSUN_DATO'), 'no data (it)');
  setConfig(h, { language: 'en' });
  check(run(h, REPORT).stdout.startsWith('NO_DATA'), 'no data (en)');
  setConfig(h, { language: 'it' });
  run(h, SL, [], input(40, 30));
  const o = run(h, REPORT).stdout;
  check(o.includes('Limite 5 ore: 40% usato') && o.includes('Limite settimanale: 30% usato') && o.includes('Storico'), 'report with saved values and history');
  const s = readState(h); s.rate_limits.five_hour.resets_at = now - 10; writeFileSync(statePath(h), JSON.stringify(s));
  check(run(h, REPORT).stdout.includes('già azzerato'), 'window already reset');
  writeFileSync(statePath(h), 'garbage');
  check(run(h, REPORT).status === 0, 'corrupted state: exits cleanly');
}

console.log('9. settings.mjs');
{
  const h = newHome({ language: 'it' });
  const set = (...a) => run(h, SET, a);
  const cfg = () => JSON.parse(readFileSync(join(h, '.claude', 'statusline-limiti.config.json'), 'utf8'));
  check(set().stdout.includes('IMPOSTAZIONI ATTUALI'), 'list (it)');
  check(STYLES.every(s => set('stili').stdout.includes(s)) && set('styles').status === 0, 'style previews (stili / styles)');
  check(set('stile_barra', 'pallini').status === 0 && cfg().style === 'dots', 'Italian key and value accepted');
  check(set('style', 'nope').status === 1 && cfg().style === 'dots', 'unknown style rejected');
  check(set('width', '99').status === 1 && set('width', '12.5').status === 1 && set('width', '30').status === 0 && cfg().width === 30, 'width validated');
  check(set('soglie', '95, 70,70').status === 0 && JSON.stringify(cfg().thresholds) === '[70,95]', 'thresholds sorted, no duplicates');
  check(set('thresholds', '150').status === 1, 'threshold above 100 rejected');
  check(set('notifiche', 'no').status === 0 && cfg().notifications === false, 'yes/no words');
  check(set('__proto__', '1').status === 1 && set('constructor', '1').status === 1 && set('toString', 'x').status === 1, 'inherited names are not settings');
  check(set('fake_key', '1').status === 1, 'unknown setting rejected');
  check(set('style', 'line').status === 0 && !('style' in cfg()), 'only non-default values are saved');
  check(set('language', 'en').stdout.includes('Visible from the next'), 'messages switch language immediately');
  check(set('reset').status === 0 && Object.keys(cfg()).length === 0, 'reset to defaults');
}

console.log('10. Installer');
const cmdPath = s => s.statusLine.command.match(/^node ["'](.+)["']$/)[1];
{
  const h = newHome();
  const inst = (...a) => run(h, INSTALL, a);
  const S = join(h, '.claude', 'settings.json');
  const settings = () => JSON.parse(readFileSync(S, 'utf8'));
  writeFileSync(S, JSON.stringify({ model: 'opus', other: 1 }));
  check(inst().status === 0, 'install');
  check(['SKILL.md', 'common.mjs', 'statusline.mjs', 'report.mjs', 'settings.mjs'].every(f => existsSync(join(h, '.claude', 'skills', 'limiti', f))), 'skill copied');
  check(settings().other === 1 && settings().statusLine.refreshInterval === 60, 'status line enabled, other settings untouched');
  check(existsSync(S + '.bak-limiti') && !('statusLine' in JSON.parse(readFileSync(S + '.bak-limiti', 'utf8'))), 'backup of the original settings');
  check(spawnSync(process.execPath, [cmdPath(settings())], { input: input(20, 18), env: env(h), encoding: 'utf8' }).stdout.includes('5h'), 'installed status line works');
  const s = settings(); s.statusLine.padding = 2; writeFileSync(S, JSON.stringify(s));
  check(inst().status === 0 && settings().statusLine.padding === 2, 'update keeps user fields like padding');
  check(!('statusLine' in JSON.parse(readFileSync(S + '.bak-limiti', 'utf8'))), 'first backup never overwritten');
  writeFileSync(join(h, '.claude', 'skills', 'limiti', 'old-file.mjs'), '');
  inst();
  check(!existsSync(join(h, '.claude', 'skills', 'limiti', 'old-file.mjs')), 'update removes files of older versions');
  const s2 = settings(); s2.statusLine = { type: 'command', command: 'my-own-script', padding: 1 }; writeFileSync(S, JSON.stringify(s2));
  check(inst().status === 1 && settings().statusLine.command === 'my-own-script', 'does not replace someone else\'s status line');
  check(inst('--force').status === 0 && settings().statusLine.command.includes('limiti'), '--force replaces it');
  check(inst('--force').status === 0 && JSON.parse(readFileSync(join(h, '.claude', 'statusline-limiti.precedente.json'), 'utf8')).command === 'my-own-script', 'previous status line saved and kept across updates');
  const s4 = settings(); s4.statusLine = { type: 'command', command: 'my-newer-script' }; writeFileSync(S, JSON.stringify(s4));
  inst('--force');
  check(JSON.parse(readFileSync(join(h, '.claude', 'statusline-limiti.precedente.json'), 'utf8')).command === 'my-newer-script', 'a second --force saves the newer status line');
  const s5 = settings(); s5.statusLine = { type: 'command', command: 'my-own-script', padding: 1 }; writeFileSync(S, JSON.stringify(s5)); inst('--force');
  check(inst('--remove').status === 0 && settings().statusLine.command === 'my-own-script' && !existsSync(join(h, '.claude', 'skills', 'limiti')), '--remove restores the previous status line');
  check(inst().status === 1, 'restored status line is protected again');
  const s3 = settings(); delete s3.statusLine; writeFileSync(S, JSON.stringify(s3));
  inst(); check(inst('--rimuovi').status === 0 && !('statusLine' in settings()), '--rimuovi removes the status line');
}
for (const [name, content] of [['invalid JSON', '{oops'], ['null', 'null'], ['array', '[1]'], ['string', '"x"']]) {
  const h = newHome();
  const S = join(h, '.claude', 'settings.json');
  writeFileSync(S, content);
  check(run(h, INSTALL).status === 1 && readFileSync(S, 'utf8') === content && !existsSync(join(h, '.claude', 'skills', 'limiti')), `settings.json ${name}: stops without changing anything`);
}
{
  const h = newHome();
  check(run(h, INSTALL).status === 0 && existsSync(join(h, '.claude', 'settings.json')), 'works without settings.json');
  const h2 = newHome();
  writeFileSync(join(h2, '.claude', 'statusline-limiti.mjs'), '// old');
  writeFileSync(join(h2, '.claude', 'settings.json'), JSON.stringify({ statusLine: { type: 'command', command: 'node ~/.claude/statusline-limiti.mjs' } }));
  check(run(h2, INSTALL).status === 0 && !existsSync(join(h2, '.claude', 'statusline-limiti.mjs')), 'upgrade from the first version removes the old script');
}

console.log('11. SKILL.md');
{
  const md = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  const fm = md.match(/^---\n([\s\S]+?)\n---/)?.[1] || '';
  check(/^name: limiti$/m.test(fm) && /^description: .+/m.test(fm) && /^allowed-tools:/m.test(fm), 'frontmatter has name, description, allowed-tools');
  check(fm.length < 1536, 'frontmatter text within the listing limit');
  const scripts = [...md.matchAll(/\$\{CLAUDE_SKILL_DIR\}\/(\w+\.mjs)/g)].map(m => m[1]);
  check(scripts.length > 0 && scripts.every(f => existsSync(join(SKILL, f))), 'every referenced script exists');
  check(!/~\/\.claude\/skills/.test(md), 'no hard-coded skill path');
  check(!/^\s*- \w+\(.*\*\)\s*$/m.test(fm), 'no wildcard in pre-approved commands');
  check(/PowerShell\(node/.test(fm) && /Bash\(node/.test(fm), 'rules for both Bash and PowerShell');
}

console.log('12. Codex (OpenAI) limits');
{
  const { lastSnapshot, parseRateLimits, windowLabel } = await import('../limiti/codex.mjs');
  const zlib = await import('node:zlib');
  const { utimesSync } = await import('node:fs');
  // Same shape Codex writes (checked against a real session file and codex-rs/protocol)
  const ev = (rl, t = now - 30) => JSON.stringify({ timestamp: new Date(t * 1000).toISOString(), type: 'event_msg', payload: { type: 'token_count', info: null, rate_limits: rl } });
  const paid = (p5, p7, extra = {}) => ({ limit_id: 'codex', limit_name: null, primary: { used_percent: p5, window_minutes: 300, resets_at: now + 3600 }, secondary: { used_percent: p7, window_minutes: 10080, resets_at: now + 400000 }, credits: null, plan_type: 'plus', rate_limit_reached_type: null, ...extra });
  const free = p => ({ limit_id: 'codex', primary: { used_percent: p, window_minutes: 43200, resets_at: now + 600000 }, secondary: null, plan_type: 'free' });
  const other = { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [] } };
  const writeCodex = (h, lines, { day = '10', name = 'rollout-2026-11-10T10-00-00-abc.jsonl', mtime } = {}) => {
    const dir = join(h, '.codex', 'sessions', '2026', '11', day);
    mkdirSync(dir, { recursive: true });
    const f = join(dir, name);
    const text = lines.join('\n') + '\n';
    writeFileSync(f, name.endsWith('.zst') ? zlib.zstdCompressSync(Buffer.from(text)) : text);
    if (mtime) utimesSync(f, mtime, mtime);
    return f;
  };
  const CX = h => ({ CODEX_HOME: join(h, '.codex') });

  // parsing
  const s1 = lastSnapshot([ev(paid(10, 20), now - 100), JSON.stringify(other), ev(paid(12, 21), now - 50), JSON.stringify(other)].join('\n'));
  check(s1 && s1.windows.length === 2 && s1.windows[0].used_percentage === 12 && s1.windows[0].len === 18000 && s1.windows[1].len === 604800 && s1.plan === 'plus', 'paid plan: 5h + weekly, latest event wins');
  const s2 = lastSnapshot(ev(free(7)));
  check(s2 && s2.windows.length === 1 && s2.windows[0].len === 2592000 && windowLabel(s2.windows[0].len, 'it') === '30g' && windowLabel(18000, 'en') === '5h', 'Free plan: one 30-day window, labels 5h / 30g');
  check(lastSnapshot([ev(paid(10, 20)), ev({ ...paid(90, 90), limit_id: 'codex_other' })].join('\n'))?.windows[0].used_percentage === 10, 'extra per-model quotas (other limit_id) are ignored');
  check(lastSnapshot(ev(null)) === null && lastSnapshot('') === null && lastSnapshot('{"type":"event_msg","payload":{"type":"token_count","rate_limits":') === null, 'no limits (API key) or a cut line: nothing, no crash');
  const legacy = parseRateLimits({ primary: { used_percent: 5, window_minutes: 300, resets_in_seconds: 600 } }, 1000);
  check(legacy?.windows[0].resets_at === 1600, 'older Codex format (resets_in_seconds) understood');
  check(parseRateLimits({ primary: { used_percent: 'x' } }, 1) === null && parseRateLimits({ primary: { used_percent: -5, window_minutes: 300, resets_at: 9 } }, 1).windows[0].used_percentage === 0, 'bad numbers rejected or clamped');

  // status line
  const h = newHome({ language: 'it' });
  writeCodex(h, [ev(paid(42, 15))]);
  let out = strip(run(h, SL, [], input(20, 18), CX(h)).stdout).split('\n');
  check(out.length === 4 && /^Codex 5h .* 42%  reset \d\d:\d\d .*│ 7g .* 15%  reset /.test(out[3]), 'status line: extra Codex line with 5h and weekly');
  check(!/dati di/.test(out[3]), 'fresh Codex data: no age shown');
  for (const cols of [40, 60, 80, 120, 160]) {
    const o = run(h, SL, [], input(20, 18), { ...CX(h), COLUMNS: String(cols) }).stdout.split('\n');
    check(o.every(l => width(l) <= cols) && strip(o[o.length - 1]).startsWith('Codex'), `Codex line fits at ${cols} columns: ${o.map(width).join(',')}`);
  }
  setConfig(h, { language: 'it', show_codex: false });
  out = strip(run(h, SL, [], input(20, 18), CX(h)).stdout);
  check(!out.includes('Codex'), 'show_codex false hides the line');
  const hn = newHome({ language: 'it' });
  check(!strip(run(hn, SL, [], input(20, 18), CX(hn)).stdout).includes('Codex'), 'no Codex folder: no line, no error');
  const hw = newHome({ language: 'it' });
  writeCodex(hw, [ev(free(3))]);
  out = strip(run(hw, SL, [], JSON.stringify({ cost: { total_api_duration_ms: 0 } }), CX(hw)).stdout).split('\n');
  check(out.some(l => l.includes('in attesa')) && /^Codex 30g .*  3%  reset \w+ \d\d\/\d\d/.test(out[out.length - 1]), 'Codex only: Claude still "waiting", Codex 30-day line with the date');

  // stale and reset windows
  const hs = newHome({ language: 'it' });
  writeCodex(hs, [ev({ ...paid(60, 30), primary: { used_percent: 85, window_minutes: 300, resets_at: now - 120 } }, now - 7200)]);
  const toastFile = join(hs, 't.txt');
  out = strip(run(hs, SL, [], input(20, 18), { ...CX(hs), LIMITI_NO_NOTIFICHE: '', LIMITI_TOAST_FILE: toastFile }).stdout).split('\n');
  check(/^Codex 5h .*  0%  azzerato/.test(out[3]) && out[3].includes('dati di 2h'), 'expired Codex window shows "azzerato", old data shows its age');
  let toasts = existsSync(toastFile) ? readFileSync(toastFile, 'utf8') : '';
  check(toasts.includes('Codex · Limite 5h azzerato') && !toasts.includes('7g'), 'Codex reset notification sent; weekly at 30% no alert');

  // threshold alerts, once
  const ha = newHome({ language: 'it' });
  writeCodex(ha, [ev(paid(83, 10))]);
  const tf = join(ha, 't.txt'), N = { ...CX(ha), LIMITI_NO_NOTIFICHE: '', LIMITI_TOAST_FILE: tf };
  run(ha, SL, [], input(20, 18), N); run(ha, SL, [], input(20, 18), N);
  toasts = readFileSync(tf, 'utf8').trim().split('\n');
  check(toasts.length === 1 && toasts[0].startsWith('Codex · Limite 5h al 83%'), 'Codex alert at 80% sent once, labelled Codex');

  // which file: newest by modification time, even in an older day folder (resumed session)
  const hr = newHome({ language: 'en' });
  writeCodex(hr, [ev(paid(10, 10), now - 3000)], { day: '10', mtime: now - 3000 });
  writeCodex(hr, [ev(paid(55, 10), now - 60)], { day: '02', name: 'rollout-2026-11-02T09-00-00-old.jsonl', mtime: now - 60 });
  out = strip(run(hr, SL, [], input(20, 18), CX(hr)).stdout);
  check(/Codex 5h .* 55%/.test(out), 'resumed old session (older folder, newer data) wins');
  if (typeof zlib.zstdCompressSync === 'function') {
    const hz = newHome({ language: 'en' });
    writeCodex(hz, [ev(free(21))], { name: 'rollout-2026-11-10T10-00-00-z.jsonl.zst' });
    check(/Codex 30d .* 21%/.test(strip(run(hz, SL, [], input(20, 18), CX(hz)).stdout)), 'compressed session (.jsonl.zst) read');
  }
  // a huge session: only the end is read
  const hb = newHome({ language: 'en' });
  writeCodex(hb, [ev(paid(1, 1), now - 500), ...Array(3000).fill(JSON.stringify({ ...other, pad: 'x'.repeat(600) })), ev(paid(33, 2))]);
  check(/Codex 5h .* 33%/.test(strip(run(hb, SL, [], input(20, 18), CX(hb)).stdout)), 'large session file (2 MB): latest value read from the end');

  // report
  let rep = run(h, REPORT, [], '', CX(h)).stdout; // show_codex false
  check(!rep.includes('Codex'), 'report: show_codex false hides Codex');
  rep = run(hw, REPORT, [], '', CX(hw)).stdout;
  check(rep.startsWith('Codex (OpenAI), piano free') && rep.includes('Limite 30g: 3% usato, resta 97%') && rep.includes('al giorno'), 'report: Codex only (no Claude data), Free plan');
  const hrep = newHome({ language: 'en' });
  writeCodex(hrep, [ev(paid(42, 15, { rate_limit_reached_type: 'rate_limit_reached' }))]);
  run(hrep, SL, [], input(20, 18), CX(hrep));
  rep = run(hrep, REPORT, [], '', CX(hrep)).stdout;
  check(rep.includes('5-hour limit: 20% used') && rep.includes('Codex (OpenAI), plus plan') && rep.includes('5h limit: 42% used') && rep.includes('7d limit: 15% used') && rep.includes('REACHED'), 'report: Claude and Codex together');
  // not using Codex: an old session (window still running) shows nothing
  const ho = newHome({ language: 'it' });
  writeCodex(ho, [ev(free(5), now - 2 * 86400)]);
  check(!strip(run(ho, SL, [], input(20, 18), CX(ho)).stdout).includes('Codex'), 'Codex not used in the last 24h: no line in the bar');
  check(run(ho, REPORT, [], '', CX(ho)).stdout.includes('Codex'), 'report: Codex used 2 days ago still shown');
  const ho2 = newHome({ language: 'it' });
  writeCodex(ho2, [ev(free(5), now - 8 * 86400)]);
  check(!run(ho2, REPORT, [], '', CX(ho2)).stdout.includes('Codex'), 'report: Codex not used for 8 days: hidden');
  const hx = newHome({ language: 'it' });
  mkdirSync(join(hx, '.codex'));
  const ri = run(hx, INSTALL, [], '', { ...CX(hx), LIMITI_SCHEDULE_FILE: join(hx, 'x') });
  check(!existsSync(join(hx, '.agents')) && ri.stdout.includes('--codex'), 'normal install with a Codex folder: no Codex skill, only a hint');
  const he = newHome({ language: 'it' });
  check(run(he, REPORT, [], '', CX(he)).stdout.startsWith('NESSUN_DATO'), 'report: nothing anywhere → NESSUN_DATO');

  // Codex skill
  const hi = newHome({ language: 'en' });
  const r = run(hi, INSTALL, ['--codex'], '', CX(hi));
  const dest = join(hi, '.agents', 'skills', 'limiti');
  const md = existsSync(join(dest, 'SKILL.md')) ? readFileSync(join(dest, 'SKILL.md'), 'utf8') : '';
  check(r.status === 0 && /^---\nname: limiti\ndescription: .+\n---/.test(md) && !md.includes('{{DIR}}') && !md.includes('CLAUDE_SKILL_DIR') && md.includes(dest.split('\\').join('/') + '/report.mjs'), 'install --codex: skill with absolute paths');
  check(!existsSync(join(hi, '.claude', 'settings.json')), 'install --codex leaves Claude Code untouched');
  writeCodex(hi, [ev(free(9))]);
  check(run(hi, join(dest, 'report.mjs'), [], '', CX(hi)).stdout.includes('30d limit: 9% used'), 'report runs from the Codex skill folder');
  run(hi, INSTALL, ['--remove'], '', { ...CX(hi), LIMITI_SCHEDULE_FILE: join(hi, 'x') });
  check(!existsSync(dest), '--remove deletes our Codex skill');
  mkdirSync(dest, { recursive: true }); writeFileSync(join(dest, 'SKILL.md'), 'someone else');
  run(hi, INSTALL, ['--codex'], '', CX(hi));
  check(readFileSync(join(dest, 'SKILL.md'), 'utf8') === 'someone else', "someone else's limiti skill is never overwritten");
  const tpl = readFileSync(join(ROOT, 'codex-skill', 'SKILL.md'), 'utf8');
  check([...tpl.matchAll(/\{\{DIR\}\}\/(\w+\.mjs)/g)].every(m => existsSync(join(SKILL, m[1]))), 'Codex skill template references existing scripts');
}

for (const h of homes) rmSync(h, { recursive: true, force: true });
console.log(`\n${ok} checks passed, ${ko} failed.`);
process.exit(ko ? 1 : 0);
