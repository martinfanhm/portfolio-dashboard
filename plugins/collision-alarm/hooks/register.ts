import type { EngineInterface, Register, ToolCallResult } from 'claude-code'

/** One write, as every session on this machine sees it in the plugin's store. */
type Edit = { path: string; at: number; sessionId: string }

const KEY = 'edits'
const WINDOW_MS = 30 * 60_000
const CONTINUE = '繼續'
const CANCEL = '取消'

async function recent($: EngineInterface): Promise<Edit[]> {
  const edits = ((await $.store.get(KEY)) ?? []) as Edit[]
  const since = (await $.clock.now()) - WINDOW_MS
  return edits.filter(one => one.at >= since)
}

function minutesAgo(at: number, now: number): string {
  const m = Math.round((now - at) / 60_000)
  return m < 1 ? '不到一分鐘前' : `${m} 分鐘前`
}

async function guard(
  $: EngineInterface,
  path: string,
  run: () => Promise<ToolCallResult>,
): Promise<ToolCallResult> {
  const sessionId = await $.session.id()
  const now = await $.clock.now()
  const others = (await recent($)).filter(one => one.path === path && one.sessionId !== sessionId)
  const last = others.at(-1)

  if (last !== undefined) {
    const sessions = new Set(others.map(one => one.sessionId)).size
    const who = sessions > 1 ? `${sessions} 個別的對話` : `另一個對話（${last.sessionId.slice(0, 8)}）`
    const question = `${path} 在 ${minutesAgo(last.at, now)}被${who}改過。要繼續寫入嗎？`
    const answer = await $.ui.ask(question, { header: '撞車警報', options: [CONTINUE, CANCEL] }).catch(
      () => CANCEL,
    )
    if (answer !== CONTINUE) {
      return {
        deny: `${path} was changed by another conversation in the last 30 minutes, and the user chose not to overwrite it. Ask the user how to proceed before touching this file again.`,
      }
    }
  }

  const ran = await run()
  if (ran.deny === undefined && ran.isError !== true) {
    const at = await $.clock.now()
    await $.store.set(KEY, [...(await recent($)), { path, at, sessionId }])
  }

  return ran
}

export const register: Register = on => {
  // A broken store or clock must never stop a write: fall through to the tool.
  on('tool.call', { tool: 'Write' }, ($, e, next) => guard($, e.file_path, () => next(e))).catch(
    ($, e, next) => next(e),
  )
  on('tool.call', { tool: 'Edit' }, ($, e, next) => guard($, e.file_path, () => next(e))).catch(
    ($, e, next) => next(e),
  )
  on('tool.call', { tool: 'NotebookEdit' }, ($, e, next) =>
    guard($, e.notebook_path, () => next(e)),
  ).catch(($, e, next) => next(e))
}
