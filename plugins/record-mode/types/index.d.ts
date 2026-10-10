export type Recording = boolean

declare module 'claude-code' {
  interface PluginState {
    'record-mode': { isRecording: Recording }
  }
}
