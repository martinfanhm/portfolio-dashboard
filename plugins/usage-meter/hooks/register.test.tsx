import { describe, expect, test } from 'claude-code/testing'
import type { SessionUsage } from 'claude-code'

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

function usage(u: Partial<SessionUsage>): SessionUsage {
  return { startedAt: 0, context: { window: 200000 }, rateLimits: [], ...u }
}

describe('usage-meter', () => {
  test('draws nothing before the first turn ends', async ($, on) => {
    on('ui.render', ($, e) => { const { Box } = $.ui.resolve(e); return <Box key="engine" /> })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'usage-meter', surface, ...BAND })
      expect(await ui.find({ type: 'Text', text: /^context/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('subscription: context, 5h with reset, week; over 80% is red', async ($, on) => {
    on('session.usage', () => ({ value:
      usage({
        context: { window: 200000, tokens: 50000, percent: 25 },
        rateLimits: [
          { kind: 'five_hour', percentUsed: 85.5, resetsAt: '2026-10-09T14:30:00Z' },
          { kind: 'seven_day', percentUsed: 40 },
        ],
        cost: { usd: 1.23 },
      }) }),
    )
    on('turn.complete', () => ({ text: '' }))
    on('ui.render', ($, e) => { const { Box } = $.ui.resolve(e); return <Box key="engine" /> })
    await $.turn.complete(TURN)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'usage-meter', surface, ...BAND })
      const ctx = await ui.find({ type: 'Text', text: /^context/ })
      const five = await ui.find({ type: 'Text', text: /^5h/ })
      const week = await ui.find({ type: 'Text', text: /^本週 / })
      expect(ctx?.text).toContain('25%')
      expect(ctx?.props.color).toBe('subtle')
      expect(five?.text).toContain('86%')
      expect(five?.text).toContain('重置')
      expect(five?.props.color).toBe('error')
      expect(week?.text).toContain('40%')
      expect(await ui.find({ type: 'Text', text: /花費/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('API key: no quota windows, shows the conversation cost', async ($, on) => {
    on('session.usage', () => ({ value:
      usage({ context: { window: 200000, tokens: 180000, percent: 90 }, cost: { usd: 0.4567 } }) }),
    )
    on('turn.complete', () => ({ text: '' }))
    on('ui.render', ($, e) => { const { Box } = $.ui.resolve(e); return <Box key="engine" /> })
    await $.turn.complete(TURN)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'usage-meter', surface, ...BAND })
      expect((await ui.find({ type: 'Text', text: /^context/ }))?.props.color).toBe('error')
      expect((await ui.find({ type: 'Text', text: /花費/ }))?.text).toContain('$0.46')
      expect(await ui.find({ type: 'Text', text: /^5h/ })).toBeUndefined()
      await ui.unmount()
    }
  })
})
