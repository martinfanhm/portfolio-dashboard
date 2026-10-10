import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const MIN = 60_000
const NOW = 100 * MIN
const FILE = '/w/app.ts'

type Asked = { question: string }

/** The engine beneath: a clock, this session's id, the store, the dialog's pick, the tool. */
function engine(on: On, edits: unknown[], pick: string | null) {
  mock.clock(on, { now: NOW })
  const store: Record<string, unknown> = { edits }
  on('store.get', (_$, e) => ({ value: store[e.key] }))
  on('store.set', (_$, e) => {
    store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined }
  })
  on('session.id', () => ({ value: 'me' }))
  const asked: Asked[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    const q = e.questions[0]!
    asked.push({ question: q.question })
    if (pick === null) return { deny: 'dismissed' }
    return { result: { questions: e.questions, answers: { [q.question]: pick } } }
  })
  const wrote: string[] = []
  on('tool.call', { tool: 'Write' }, (_$, e) => {
    wrote.push(e.file_path)
    return { result: { type: 'create', filePath: e.file_path, content: e.content } as never }
  })
  return { asked, wrote, store }
}

const write = { tool: 'Write', tool_use_id: 't1', file_path: FILE, content: 'x' } as const

describe('collision-alarm', () => {
  test('no other conversation: writes without asking, and records the write', async ($, on) => {
    const { asked, wrote, store } = engine(
      on,
      [{ path: FILE, at: NOW - 5 * MIN, sessionId: 'me' }],
      null,
    )
    const ran = await $.tool.call(write)
    expect(ran.deny).toBeUndefined()
    expect(asked).toHaveLength(0)
    expect(wrote).toEqual([FILE])
    expect(store.edits).toHaveLength(2)
  })

  test('another conversation within 30 minutes: asks; 取消 refuses the write', async ($, on) => {
    const { asked, wrote } = engine(
      on,
      [{ path: FILE, at: NOW - 10 * MIN, sessionId: 'other-session-1234' }],
      '取消',
    )
    const ran = await $.tool.call(write)
    expect(asked).toHaveLength(1)
    expect(asked[0]!.question).toContain('10 分鐘前')
    expect(asked[0]!.question).toContain('other-se')
    expect(ran.deny).toBeDefined()
    expect(wrote).toHaveLength(0)
  })

  test('繼續 goes ahead', async ($, on) => {
    const { wrote } = engine(on, [{ path: FILE, at: NOW - 10 * MIN, sessionId: 'other' }], '繼續')
    const ran = await $.tool.call(write)
    expect(ran.deny).toBeUndefined()
    expect(wrote).toEqual([FILE])
  })

  test('a dismissed dialog counts as cancel', async ($, on) => {
    const { wrote } = engine(on, [{ path: FILE, at: NOW - 1 * MIN, sessionId: 'other' }], null)
    const ran = await $.tool.call(write)
    expect(ran.deny).toBeDefined()
    expect(wrote).toHaveLength(0)
  })

  test('older than 30 minutes is ignored and pruned', async ($, on) => {
    const { asked, store } = engine(
      on,
      [{ path: FILE, at: NOW - 31 * MIN, sessionId: 'other' }],
      null,
    )
    await $.tool.call(write)
    expect(asked).toHaveLength(0)
    expect(store.edits).toEqual([{ path: FILE, at: NOW, sessionId: 'me' }])
  })
})
