// Report for the /limiti skill: status, pace, forecast, history. Always exits 0.
import { readFileSync } from 'node:fs';
import { STATE_FILE, loadConfig, detectLanguage, formatters, num } from './common.mjs';

const T = {
  it: {
    none: 'NESSUN_DATO: la status line non ha ancora ricevuto i limiti.',
    updated: a => `Dati aggiornati ${a}.`, nowWord: 'adesso', ago: d => `${d} fa`,
    names: { five_hour: 'Limite 5 ore', seven_day: 'Limite settimanale' },
    alreadyReset: (n, p) => `${n}: già azzerato (era ${p}%).`,
    used: (n, p) => `${n}: ${p}% usato, resta ${100 - p}%.`,
    resets: (w, d) => `  Si azzera ${w} (tra ${d}).`,
    pace: (t, p, g) => `  Ritmo: tempo trascorso ${t}%, consumo ${p}% → ${g}.`,
    fast: 'stai consumando IN FRETTA (più del tempo trascorso)',
    ok: 'margine ampio (hai consumato meno del tempo trascorso)', mid: 'nella media',
    perDay: p => `  Puoi usarne in media ~${p}% al giorno fino al reset.`,
    projection: (p, out) => `  Proiezione: con la media tenuta finora arrivi al reset intorno al ${p}%${out ? ' → lo ESAURISCI prima' : ''}.`,
    recent: (r, msg) => `  Consumo recente: ~${r}% all'ora → ${msg}.`,
    runsOut: t => `FINISCE verso ${t}, prima del reset`, safe: 'arrivi al reset senza esaurirlo',
    hist5: s => `Storico limite 5 ore (ultime 10h, ogni carattere = 20 min):\n  ${s}  (vuoto = nessun dato)`,
    hist7: s => `Settimanale a fine giornata: ${s}`,
    spend: (p, t) => `\nLimite di spesa: ${p}%${t}.`,
    ctx: p => `\nContesto dell'ultima sessione: ${p}% pieno.`,
  },
  en: {
    none: 'NO_DATA: the status line has not received the limits yet.',
    updated: a => `Data updated ${a}.`, nowWord: 'just now', ago: d => `${d} ago`,
    names: { five_hour: '5-hour limit', seven_day: 'Weekly limit' },
    alreadyReset: (n, p) => `${n}: already reset (was ${p}%).`,
    used: (n, p) => `${n}: ${p}% used, ${100 - p}% left.`,
    resets: (w, d) => `  Resets ${w} (in ${d}).`,
    pace: (t, p, g) => `  Pace: time elapsed ${t}%, used ${p}% → ${g}.`,
    fast: 'you are burning FAST (more than the time elapsed)',
    ok: 'plenty of room (you used less than the time elapsed)', mid: 'on pace',
    perDay: p => `  On average you can use ~${p}% per day until the reset.`,
    projection: (p, out) => `  Projection: at your average so far you reach the reset at about ${p}%${out ? ' → you RUN OUT before it' : ''}.`,
    recent: (r, msg) => `  Recent usage: ~${r}% per hour → ${msg}.`,
    runsOut: t => `RUNS OUT around ${t}, before the reset`, safe: 'you reach the reset without running out',
    hist5: s => `5-hour limit history (last 10h, one character = 20 min):\n  ${s}  (blank = no data)`,
    hist7: s => `Weekly at end of day: ${s}`,
    spend: (p, t) => `\nSpend limit: ${p}%${t}.`,
    ctx: p => `\nContext of the last session: ${p}% full.`,
  },
};

const lang = detectLanguage(loadConfig());
const L = T[lang];
const { dur, fullDate, dayName } = formatters(lang);
const clock = e => { const t = new Date(e * 1000); return `${new Date().toDateString() === t.toDateString() ? '' : dayName(t) + ' '}${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; };

let st = null;
try { st = JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch {}
const rl = st && typeof st.rate_limits === 'object' ? st.rate_limits : null;
const hasData = rl && Object.values(rl).some(w => num(w?.used_percentage) != null);
if (!hasData) { console.log(L.none); process.exit(0); }

const now = Date.now() / 1000;
const storia = Array.isArray(st.storia) ? st.storia : [];
const age = num(st.aggiornato) != null ? now - st.aggiornato : null;
if (age != null) console.log(`${L.updated(age < 60 ? L.nowWord : L.ago(dur(age, true)))}\n`);

const W = [['five_hour', 5 * 3600], ['seven_day', 7 * 86400]];
for (const [key, len] of W) {
  const w = rl[key];
  const used = num(w?.used_percentage), reset = num(w?.resets_at);
  if (used == null) continue;
  const name = L.names[key];
  const p = Math.round(Math.max(0, used));
  if (reset && reset < now) { console.log(`${L.alreadyReset(name, p)}\n`); continue; }
  console.log(L.used(name, Math.min(100, p)));
  if (!reset) { console.log(); continue; }
  console.log(L.resets(key === 'seven_day' ? fullDate(reset) : clock(reset), dur(reset - now, true)));
  const pace = Math.max(0, (1 - (reset - now) / len) * 100);
  const diff = p - pace;
  console.log(L.pace(Math.round(pace), p, diff > 10 ? L.fast : diff < -10 ? L.ok : L.mid));
  if (key === 'seven_day') {
    if (reset - now >= 86400) console.log(L.perDay(Math.max(0, Math.round((100 - p) / ((reset - now) / 86400)))));
    if (pace > 2) { const at = Math.round(used / (pace / 100)); console.log(L.projection(at, at >= 100)); }
    console.log();
    continue;
  }
  const pts = storia.filter(x => x && Math.abs((x.r5 ?? 0) - reset) <= 60 && x.h5 != null && now - x.t <= 3600);
  if (pts.length >= 2) {
    const a = pts[0], b = pts[pts.length - 1];
    const rate = (b.h5 - a.h5) / (b.t - a.t);
    if (b.t - a.t >= 300 && rate > 0) {
      const eta = now + (100 - used) / rate;
      console.log(L.recent((rate * 3600).toFixed(1), eta < reset ? L.runsOut(clock(eta)) : L.safe));
    }
  }
  console.log();
}

// 5h history: last 10 hours, one point every 20 minutes
const SPARK = '▁▂▃▄▅▆▇█';
const vals = [];
for (let i = 29; i >= 0; i--) {
  const t0 = now + 5 - (i + 1) * 1200, t1 = now + 5 - i * 1200; // +5 s: a sample written just now is included
  const inSlot = storia.filter(x => x && x.t > t0 && x.t <= t1 && x.h5 != null);
  vals.push(inSlot.length ? Math.max(...inSlot.map(x => x.h5)) : null);
}
if (vals.some(v => v != null)) console.log(L.hist5(vals.map(v => v == null ? ' ' : SPARK[Math.max(0, Math.min(7, Math.floor((v / 100) * 8)))]).join('')));

// Weekly history: value at the end of each day
const days = [];
for (let i = 6; i >= 0; i--) {
  const end = new Date(); end.setHours(23, 59, 59, 0); end.setDate(end.getDate() - i);
  const e = end.getTime() / 1000, s = e - 86400;
  const inDay = storia.filter(x => x && x.t > s && x.t <= e && x.d7 != null);
  days.push(`${dayName(end)} ${inDay.length ? `${Math.round(inDay[inDay.length - 1].d7)}%` : '-'}`);
}
console.log(L.hist7(days.join(' · ')));

const sp = st.spend;
if (num(sp?.used_percentage) != null) {
  const u = num(sp.used_usd), l = num(sp.limit_usd);
  console.log(L.spend(Math.round(Math.max(0, sp.used_percentage)), u != null && l != null ? ` ($${u.toFixed(2)} / $${l.toFixed(2)})` : ''));
}
if (num(st.context_pct) != null) console.log(L.ctx(Math.round(st.context_pct)));
