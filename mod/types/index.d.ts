// What the pane reads: the latest limits the session measured.
export type LimitWindow = { kind: string; percentUsed: number; resetsAt?: string }
export type Limits = { windows: LimitWindow[]; at: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-limits': { limits: Shaped<Limits> }
  }
}
