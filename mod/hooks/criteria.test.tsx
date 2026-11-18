// Tests of the SPEC.md criteria for F15 (mod usage-limits): C29, C30, C31, C32, C36, C37.
// Run: claude plugin test mod
import { expect, mock, test } from 'claude-code/testing'

const H = 3600 * 1000
const START = Date.UTC(2026, 10, 17, 18, 0, 0) // 17/11/2026 18:00 UTC
const iso = (ms: number) => new Date(ms).toISOString()
const OPTIONS = { language: 'it', thresholds: '80,95' }

// The engine's measurement, as session.measure delivers it
const measure = (five: number, fiveReset: number, week = 20, weekReset = START + 100 * H) => ({
  context: { windowTokens: 200000 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: five, resetsAt: iso(fiveReset) },
    { kind: 'seven_day', percentUsed: week, resetsAt: iso(weekReset) },
  ],
  changed: ['rateLimits'],
}) as any

// The world beneath the mod: clock, store, toasts, status line, notifications recorded
function world(on: any) {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  const toasts: string[] = []
  const notified: string[] = []
  const status: (string | undefined)[] = []
  const opened: string[] = []
  on('ui.toast', (_: any, e: any) => { toasts.push(e.text); return { value: undefined } })
  on('ui.status', (_: any, e: any) => { status.push(e.text); return { value: undefined } })
  on('ui.notify', (_: any, e: any) => { notified.push(e.text); return { value: { isSent: true, channel: 'test' } } })
  on('command.register', () => ({ value: { command: 'usage-limits' } }))
  on('ui.open', (_: any, e: any) => { opened.push(e.id); return { value: { isPlaced: true } } })
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('session.measure', (_: any, e: any) => ({ changed: e.changed }))
  return { clock, toasts, notified, status, opened }
}

test('C29: crossing 80% gives one alert "Limite 5 ore all\'80%", once even when measured again', { options: OPTIONS }, async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(measure(50, START + 2 * H))
  expect(w.toasts.length).toBe(0)
  await $.session.measure(measure(81, START + 2 * H))
  expect(w.toasts.length).toBe(1)
  expect(w.toasts[0]).toContain("Limite 5 ore all'81%")
  // a second window of Claude Code measures the same: the shared store already holds the alert
  await $.session.measure(measure(82, START + 2 * H))
  await $.session.measure(measure(84, START + 2 * H))
  expect(w.toasts.length).toBe(1)
  // 95% is a new threshold: one more alert
  await $.session.measure(measure(96, START + 2 * H))
  expect(w.toasts.length).toBe(2)
  expect(w.toasts[1]).toContain('96%')
})

test('C29: first seen at 97% gives a single alert, not one per threshold', { options: OPTIONS }, async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(measure(97, START + 2 * H))
  await $.session.measure(measure(97.5, START + 2 * H))
  expect(w.toasts.length).toBe(1)
})

test('C29: an alert already given by another session (shared store) is not repeated', { options: OPTIONS }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const bucket = Math.round((START + 2 * H) / 1000 / 3600)
  mock.store(on, { [`alert:five_hour:${bucket}:80`]: true })
  const toasts: string[] = []
  on('ui.toast', (_: any, e: any) => { toasts.push(e.text); return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'usage-limits' } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('session.measure', (_: any, e: any) => ({ changed: e.changed }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(measure(85, START + 2 * H))
  expect(toasts.length).toBe(0)
  void clock
})

test('C30: a window at 85% that resets while open gives "Limite 5 ore azzerato" once', { options: OPTIONS }, async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(measure(85, START + 2 * H))
  await $.session.measure(measure(86, START + 2 * H)) // measured again: still one timer, one alert
  const before = w.toasts.length
  await w.clock.advance(2 * H + 60 * 1000)
  const resets = w.toasts.slice(before).filter(t => t.includes('Limite 5 ore azzerato'))
  expect(resets.length).toBe(1)
})

test('C30: a window at 30% that resets gives no alert', { options: OPTIONS }, async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(measure(30, START + 2 * H))
  await w.clock.advance(2 * H + 60 * 1000)
  expect(w.toasts.length).toBe(0)
})

test('C31: works on its own, with nothing of the status line installed', { options: OPTIONS }, async ($, on) => {
  const w = world(on)
  // reading any file would mean depending on the status line: none is answered
  on('fs.read', () => { throw new Error('the mod must not read files') })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(measure(82, START + 2 * H))
  expect(w.status.at(-1)).toContain('5h 82%')
  expect(w.toasts.length).toBe(1)
})

test('C37: the status entry shows only above the first threshold, well separated, and goes away below it', { options: OPTIONS }, async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  await $.session.measure(measure(40, START + 2 * H, 57))
  expect(w.status.filter(Boolean).length).toBe(0) // 40% and 57%: no entry
  await $.session.measure(measure(85, START + 2 * H, 57))
  const line = w.status.at(-1) ?? ''
  expect(line).toMatch(/^5h 85% · reset \d\d:\d\d │ 7g 57% · reset \S+ \d\d:\d\d$/)
  expect(line).not.toContain('  ') // no double spaces: VS Code would squeeze them into one
  // a new window after the reset, back under the threshold: the entry goes away
  await $.session.measure(measure(3, START + 7 * H, 57))
  expect(w.status.at(-1)).toBeUndefined()
})

test('C32: the mod never raises a Windows notification (the status line does it in the terminal)', { options: OPTIONS }, async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(measure(96, START + 2 * H))
  await w.clock.advance(2 * H + 60 * 1000)
  expect(w.toasts.length).toBeGreaterThan(0)
  expect(w.notified.length).toBe(0)
})

test('C36: in the VS Code panel the pane draws the limits (the entry waits for the threshold, C37)', { options: OPTIONS }, async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  await $.session.measure(measure(28, START + 2 * H, 56))
  expect(w.status.filter(Boolean).length).toBe(0)
  for (const surface of ['vscode', 'terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'usage-limits', component: 'Pane', requestId: 'usage-limits', surface,
      props: { title: 'Limiti', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
    } as any)
    expect((await ui.find({ type: 'Text', text: /5h.*28%/ }))?.text).toContain('28%')
    expect((await ui.find({ type: 'Text', text: /7g.*56%/ }))?.text).toContain('56%')
    await ui.unmount()
  }
})

test('C36: the /usage-limits command opens the pane', { options: OPTIONS }, async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  expect(w.opened.length).toBe(0) // not opened unasked
  await $.command.run({ command: 'usage-limits', args: '' } as any)
  expect(w.opened).toContain('usage-limits')
})

test('English when the language is en', { options: { language: 'en', thresholds: '80,95' } }, async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(measure(81, START + 2 * H, 30))
  expect(w.toasts[0]).toContain('5-hour limit at 81%')
  expect(w.status.at(-1)).toContain('7d 30%')
})

test('C36 + C2: the pane draws a real progress bar per window, green / yellow / red like the status line', { options: OPTIONS }, async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  await $.session.measure(measure(85, START + 2 * H, 30))
  const ui = await $.ui.mount({
    plugin: 'usage-limits', component: 'Pane', requestId: 'usage-limits', surface: 'vscode',
    props: { title: 'Limiti', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  } as any)
  // the surface draws a Progress as boxes filled with its colour
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('#eb5555') // 5h at 85%: red
  expect(drawn).toContain('#50c878') // 7g at 30%: green
  expect(drawn).not.toContain('#ebbe3c') // nothing at 50-79%: no yellow
  await ui.unmount()
})
