export type Window = { percent: number; resetsAt?: string }

export type Snapshot = {
  contextPercent?: number
  fiveHour?: Window
  sevenDay?: Window
  costUsd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-meter': { snapshot: Snapshot | null }
  }
}
