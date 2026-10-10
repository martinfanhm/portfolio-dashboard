export type Phase = 'idle' | 'writing' | 'clearing'

declare module 'claude-code' {
  interface PluginState {
    handoff: {
      /** The main conversation's context fill after its last turn, 0-100; null before one. */
      contextPercent: number | null
      /** Files this conversation wrote or edited, in first-touched order. */
      files: string[]
      phase: Phase
    }
  }
}
