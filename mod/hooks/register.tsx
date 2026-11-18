// usage-limits — F15 of claude-limiti (SPEC.md): the usage limits as a status entry, a pane
// (/usage-limits) and in-app alerts, also in the VS Code panel where the status line is not run.
// It never raises system notifications: in the terminal the status line already does (C32).
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { LimitWindow } from '../types'
import { alertFor, alertKey, barColor, duration, langOf, pct, resetLabel, resetMs, statusText, texts, thresholdsOf, tracked } from './logic'

const PANE = 'usage-limits'
const limits = atom({ plugin: 'usage-limits', key: 'limits' } as const, { windows: [], at: 0 }, { shape: 'limits-1' })

// Reset timers already set in this session, by alert key (a measurement repeats every response)
const timers = new Set<string>()

export const register: Register = (on, options) => {
  const lang = langOf(options.language)
  const L = texts(lang)
  const thresholds = thresholdsOf(options.thresholds)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'usage-limits', description: L.command })
    return next(e)
  })

  on('command.run', { command: 'usage-limits' }, async $ => {
    await $.ui.open({ id: PANE, title: L.paneTitle })
    return { text: L.opened }
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    if (!e.changed.includes('rateLimits')) return result
    const now = await $.clock.now()
    const windows: LimitWindow[] = e.rateLimits.filter(tracked).map(w => ({ kind: w.kind, percentUsed: w.percentUsed, resetsAt: w.resetsAt }))
    await update($, limits, () => ({ windows, at: now }))
    // Only when it matters: some window at or over the first threshold (C37); otherwise no entry
    $.ui.status(windows.some(w => w.percentUsed >= (thresholds[0] ?? 80)) ? statusText(windows, lang) : undefined)

    for (const w of windows) {
      const due = resetMs(w)
      if (!Number.isFinite(due) || due <= now) continue
      // Threshold alert, once per window across every session (shared store) (C29)
      const a = alertFor(w, thresholds)
      if (a && (await $.store.get(alertKey(w, a.show))) === undefined) {
        for (const t of a.mark) await $.store.set(alertKey(w, t), true)
        const when = w.kind === 'seven_day' ? resetLabel(w, lang) : L.atTime(resetLabel(w, lang))
        $.ui.toast(`${L.at(L.name[w.kind] ?? w.kind, pct(w.percentUsed))} · ${L.resets(when, duration(due - now, lang))}`, { timeoutMs: 10000 })
      }
      // Reset alert, only for a window that reached the first threshold (C30)
      const key = alertKey(w, 'reset')
      if (w.percentUsed >= (thresholds[0] ?? 80) && !timers.has(key)) {
        timers.add(key)
        const name = L.name[w.kind] ?? w.kind
        $.clock.after(due - now + 5000, () => {
          void $.store.get(key).then(given => {
            if (given !== undefined) return
            return $.store.set(key, true).then(() => $.ui.toast(L.wasReset(name), { timeoutMs: 10000 }))
          })
        })
      }
    }
    return result
  })

  // The pane: one line per window, with a bar (C36)
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Progress } = $.ui.resolve(e)
    const { windows } = await read($, limits)
    if (!windows.length) return <Text dimColor>{L.waiting}</Text>
    // A real progress bar, coloured like the status line's (C2): text bars drew as one thin line in VS Code
    return (
      <Box flexDirection="column">
        {windows.map(w => (
          <Box flexDirection="column" marginBottom={1}>
            <Text>{`${L.short[w.kind]} ${pct(w.percentUsed)}% · ${L.reset} ${resetLabel(w, lang)}`}</Text>
            <Progress label={`${L.short[w.kind]} ${L.name[w.kind] ?? w.kind}`} value={pct(w.percentUsed)} max={100} valueText={`${pct(w.percentUsed)}%`} color={barColor(w.percentUsed)} />
          </Box>
        ))}
      </Box>
    )
  })
}
