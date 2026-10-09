import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

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
const TURN = {
  answer: 'ok',
  durationMs: 1,
  isAborted: false,
  turnId: 't1',
  reason: 'answer',
} as const
const SUMMARY = '## 目前的目標\n做完交接 mod'

function engine(on: On, percent: number) {
  mock.clock(on, { now: Date.UTC(2026, 9, 9, 12, 0, 0) })
  const steps: string[] = []
  const forks: string[] = []
  const written: Record<string, string> = {}
  const submitted: string[] = []
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 100, tokens: percent, percent }, rateLimits: [] },
  }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', { tool: 'Edit' }, () => ({ result: {} as never }))
  on('model.fork', (_$, e) => {
    steps.push('fork')
    forks.push(e.prompt)
    return { value: { isAnswered: true, text: SUMMARY, usage: {} as never } }
  })
  on('fs.write', (_$, e) => {
    steps.push('write')
    written[e.path] = e.text
    return { value: undefined }
  })
  on('command.run', (_$, e) => {
    steps.push(`/${e.command}`)
    return { text: '' }
  })
  on('prompt.submit', (_$, e) => {
    steps.push('submit')
    submitted.push(e.text)
    return { text: e.text }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>ENGINE</Text>
  })
  return { steps, forks, written, submitted }
}

describe('handoff', () => {
  test('below 70%: no button', async ($, on) => {
    engine(on, 69)
    await $.turn.complete(TURN)
    const ui = await $.ui.mount({ plugin: 'handoff', surface: 'terminal', ...BAND })
    expect(await ui.find({ key: 'handoff' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /ENGINE/ })).toBeDefined()
    await ui.unmount()
  })

  test('at 70%: the button writes, saves, clears, then submits the summary', async ($, on) => {
    const world = engine(on, 72)
    await $.tool.call({
      tool: 'Edit',
      tool_use_id: 'e1',
      file_path: '/w/a.ts',
      old_string: 'a',
      new_string: 'b',
    })
    await $.turn.complete(TURN)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'handoff', surface, ...BAND })
      expect(await ui.find({ key: 'handoff' })).toBeDefined()
      await ui.unmount()
    }

    const ui = await $.ui.mount({ plugin: 'handoff', surface: 'terminal', ...BAND })
    await ui.press({ key: 'handoff' })

    expect(world.steps).toEqual(['fork', 'write', '/clear', 'submit'])
    expect(world.forks[0]).toContain('/w/a.ts')
    const [path] = Object.keys(world.written)
    expect(path).toMatch(/\/\.claude\/handoffs\/handoff-\d{8}-\d{6}\.md$/)
    expect(world.written[path!]).toBe(SUMMARY)
    expect(world.submitted[0]).toContain(SUMMARY)
    expect(world.submitted[0]).toMatch(/\.claude\/handoffs\/handoff-\d{8}-\d{6}\.md/)

    // After the hand-off the new conversation starts with no button.
    expect(await ui.find({ key: 'handoff' })).toBeUndefined()
    await ui.unmount()
  })
})
