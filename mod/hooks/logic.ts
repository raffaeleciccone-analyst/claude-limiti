// Pure helpers of the usage-limits mod: texts, thresholds, alert keys. No `$` here.
import type { LimitWindow } from '../types'

export type Lang = 'it' | 'en'

const TEXT = {
  it: {
    short: { five_hour: '5h', seven_day: '7g' } as Record<string, string>,
    name: { five_hour: 'Limite 5 ore', seven_day: 'Limite settimanale' } as Record<string, string>,
    at: (n: string, p: number) => `${n} ${/^(8|11)/.test(String(p)) ? "all'" : 'al '}${p}%`,
    resets: (t: string, d: string) => `si azzera ${t} (tra ${d})`,
    atTime: (t: string) => `alle ${t}`,
    wasReset: (n: string) => `${n} azzerato: puoi tornare a lavorare a pieno ritmo.`,
    reset: 'reset',
    waiting: 'limiti: in attesa della prima risposta',
    none: 'limiti non disponibili: servono Pro, Max o Ultra',
    paneTitle: 'Limiti di utilizzo',
    opened: 'Riquadro dei limiti aperto.',
    command: 'Mostra i limiti di utilizzo (5 ore e settimanale) in un riquadro',
    days: ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'],
  },
  en: {
    short: { five_hour: '5h', seven_day: '7d' } as Record<string, string>,
    name: { five_hour: '5-hour limit', seven_day: 'Weekly limit' } as Record<string, string>,
    at: (n: string, p: number) => `${n} at ${p}%`,
    resets: (t: string, d: string) => `resets ${t} (in ${d})`,
    atTime: (t: string) => `at ${t}`,
    wasReset: (n: string) => `${n} reset: you can get back to full speed.`,
    reset: 'reset',
    waiting: 'limits: waiting for the first response',
    none: 'limits not available: they need Pro, Max or Ultra',
    paneTitle: 'Usage limits',
    opened: 'Limits pane opened.',
    command: 'Show the usage limits (5-hour and weekly) in a pane',
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  },
}
export const texts = (lang: Lang) => TEXT[lang]

// "auto" follows the system language (F10)
export function langOf(option: unknown): Lang {
  if (option === 'it' || option === 'en') return option
  let loc = ''
  try { loc = Intl.DateTimeFormat().resolvedOptions().locale || '' } catch {}
  return /^it\b/i.test(loc) ? 'it' : 'en'
}

// "80,95" → [80, 95]; anything unusable → the default (F4)
export function thresholdsOf(option: unknown): number[] {
  const list = String(option ?? '').split(/[,; ]+/).map(Number).filter(n => Number.isFinite(n) && n > 0 && n <= 100)
  return list.length ? [...new Set(list)].sort((a, b) => a - b) : [80, 95]
}

// Only the two subscription windows are tracked (F1)
export const tracked = (w: LimitWindow) => w.kind === 'five_hour' || w.kind === 'seven_day'

export const resetMs = (w: LimitWindow) => (w.resetsAt ? Date.parse(w.resetsAt) : NaN)
// One alert per window: the window is named by the hour of its reset (as the status line does)
export const bucket = (w: LimitWindow) => Math.round(resetMs(w) / 1000 / 3600)
export const alertKey = (w: LimitWindow, threshold: number | 'reset') => `alert:${w.kind}:${bucket(w)}:${threshold}`

const p2 = (n: number) => String(n).padStart(2, '0')
export const pct = (p: number) => Math.round(p)

// 2h:05m, 3g 4h / 3d 4h, 12m
export function duration(ms: number, lang: Lang): string {
  const m = Math.max(0, Math.round(ms / 60000))
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60
  if (d > 0) return `${d}${lang === 'it' ? 'g' : 'd'} ${h}h`
  if (h > 0) return `${h}h:${p2(mm)}m`
  return `${mm}m`
}

// 23:10 for the 5-hour window; "lun 22:00" for the weekly one
export function resetLabel(w: LimitWindow, lang: Lang): string {
  const t = new Date(resetMs(w))
  const hm = `${p2(t.getHours())}:${p2(t.getMinutes())}`
  return w.kind === 'seven_day' ? `${TEXT[lang].days[t.getDay()]} ${hm}` : hm
}

// The status entry: "5h 85% · reset 23:10 │ 7g 57% · reset mar 22:00": single spaces, VS Code squeezes doubles (C37)
export function statusText(windows: readonly LimitWindow[], lang: Lang): string {
  const L = TEXT[lang]
  const shown = windows.filter(tracked)
  if (!shown.length) return L.waiting
  return shown
    .map(w => `${L.short[w.kind]} ${pct(w.percentUsed)}%` + (Number.isFinite(resetMs(w)) ? ` · ${L.reset} ${resetLabel(w, lang)}` : ''))
    .join(' │ ')
}

// Which alert to give for one window: the highest threshold reached, and every
// threshold at or under it to mark as given (first seen at 97% → one alert) (C29)
export function alertFor(w: LimitWindow, thresholds: readonly number[]): { show: number; mark: number[] } | null {
  const reached = thresholds.filter(t => w.percentUsed >= t)
  if (!reached.length) return null
  return { show: reached[reached.length - 1] as number, mark: reached }
}

// The bar colour, the same thresholds as the status line (C2): green, yellow from 50%, red from 80%
export const barColor = (p: number) => (p >= 80 ? '#eb5555' : p >= 50 ? '#ebbe3c' : '#50c878')
