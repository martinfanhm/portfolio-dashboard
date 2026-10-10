import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Cache } from '../types'

const cache = atom({ plugin: 'cache-timer', key: 'cache' } as const, null)
const now = atom({ plugin: 'cache-timer', key: 'now' } as const, 0)

const MINUTE = 60_000

async function ttlOf($: EngineInterface, setting: unknown): Promise<number> {
  if (setting === '60') return 60
  if (setting === '5') return 5
  // auto: a subscription reports its five-hour / weekly windows; an API key does not.
  const { rateLimits } = await $.session.usage()
  return rateLimits.length > 0 ? 60 : 5
}

/** The reminder fires this long before expiry: 5 minutes, or 1 on a 5-minute cache. */
function warnMs(ttlMinutes: number): number {
  return (ttlMinutes > 5 ? 5 : 1) * MINUTE
}

function mmss(ms: number): string {
  const s = Math.ceil(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

async function tick($: EngineInterface): Promise<void> {
  const t = await $.clock.now()
  await update($, now, () => t)

  const c = await read($, cache)
  if (c === null || c.isReminded) return
  const left = c.lastAt + c.ttlMinutes * MINUTE - t
  if (left > 0 && left <= warnMs(c.ttlMinutes)) {
    await update($, cache, v => (v === null ? v : { ...v, isReminded: true }))
    const text = `提示快取剩 ${Math.ceil(left / MINUTE)} 分鐘過期，之後的下一句會重新計算`
    $.ui.toast(text, { timeoutMs: 10_000 })
    void $.ui.notify(text).catch(() => undefined)
  }
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    $.clock.every(1000, () => void tick($))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    // A subagent's turns ride their own requests: only the main conversation counts.
    if (e.agentId !== undefined) return result

    const ttlMinutes = await ttlOf($, options.ttl)
    const lastAt = await $.clock.now()
    await update($, cache, () => ({ lastAt, ttlMinutes, isReminded: false }))
    await update($, now, () => lastAt)

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const c = await read($, cache)
    if (e.props.hasSurvey || e.props.isWorking || c === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const left = c.lastAt + c.ttlMinutes * MINUTE - (await read($, now))
    const line =
      left <= 0 ? (
        <Text color="error">快取已過期，下一句會重新計算</Text>
      ) : (
        <Text color={left <= warnMs(c.ttlMinutes) ? 'warning' : 'subtle'}>快取剩 {mmss(left)}</Text>
      )
    // Stack on whatever the plugins beneath draw, so other bands stay visible.
    const below = await next(e)

    return (
      <Box flexDirection="column">
        {line}
        {below}
      </Box>
    )
  })
}
