import { describe, expect, mock, test } from 'claude-code/testing'
import type { On, SessionUsage } from 'claude-code'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const
const TURN = { answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const
const MIN = 60_000

function engine(on: On, rateLimits: SessionUsage['rateLimits']) {
  const clock = mock.clock(on, { now: 1_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1 }, rateLimits } }))
  on('turn.complete', () => ({ text: '' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>ENGINE</Text>
  })
  return clock
}

describe('cache-timer', () => {
  test('subscription: one-hour countdown, stacked on what is beneath', async ($, on) => {
    engine(on, [{ kind: 'five_hour', percentUsed: 1 }])
    await $.turn.complete(TURN)

    const ui = await $.ui.mount({ plugin: 'cache-timer', surface: 'terminal', ...BAND })
    expect((await ui.find({ type: 'Text', text: /^快取剩/ }))?.text).toBe('快取剩 60:00')
    expect(await ui.find({ type: 'Text', text: /ENGINE/ })).toBeDefined()
    await ui.unmount()
  })

  test('subagent turns do not reset the timer', async ($, on) => {
    engine(on, [])
    await $.turn.complete({ ...TURN, agentId: 'a1' })
    const ui = await $.ui.mount({ plugin: 'cache-timer', surface: 'terminal', ...BAND })
    expect(await ui.find({ type: 'Text', text: /快取/ })).toBeUndefined()
    await ui.unmount()
  })

  test('API key: five minutes, reminder at one minute left, then red', async ($, on) => {
    const clock = engine(on, [])
    const toasts: string[] = []
    on('ui.toast', (_$, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    on('ui.notify', () => ({ value: { isSent: true, channel: 'terminal_bell' } }))
    await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
    await $.turn.complete(TURN)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'cache-timer', surface, ...BAND })
      expect((await ui.find({ type: 'Text', text: /^快取剩/ }))?.text).toBe('快取剩 5:00')
      await ui.unmount()
    }

    await clock.advance(4 * MIN + 1000)
    const warned = await $.ui.mount({ plugin: 'cache-timer', surface: 'terminal', ...BAND })
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toContain('剩 1 分鐘')
    expect((await warned.find({ type: 'Text', text: /^快取剩/ }))?.props.color).toBe('warning')
    await warned.unmount()

    await clock.advance(MIN)
    const ui = await $.ui.mount({ plugin: 'cache-timer', surface: 'terminal', ...BAND })
    const expired = await ui.find({ type: 'Text', text: /過期/ })
    expect(expired?.props.color).toBe('error')
    expect(toasts).toHaveLength(1)
    await ui.unmount()
  })

  test('the ttl option overrides auto', { options: { ttl: '5' } }, async ($, on) => {
    engine(on, [{ kind: 'five_hour', percentUsed: 1 }])
    await $.turn.complete(TURN)
    const ui = await $.ui.mount({ plugin: 'cache-timer', surface: 'terminal', ...BAND })
    expect((await ui.find({ type: 'Text', text: /^快取剩/ }))?.text).toBe('快取剩 5:00')
    await ui.unmount()
  })
})
