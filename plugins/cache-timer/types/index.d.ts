export type Cache = {
  /** When the main conversation's last turn ended, in `$.clock.now()` ms. */
  lastAt: number
  /** How long the cache lives from then, in minutes. */
  ttlMinutes: number
  /** Whether the "almost expired" reminder already went out for this `lastAt`. */
  isReminded: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'cache-timer': { cache: Cache | null; now: number }
  }
}
