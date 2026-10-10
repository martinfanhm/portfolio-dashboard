import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { maskDeep, maskText } from './mask'

const isRecording = atom({ plugin: 'record-mode', key: 'isRecording' } as const, false)

const STATUS = '● 錄影模式：email、API key、電話已遮罩'

// Every hook below rewrites only what the row draws: the stored message and what the model reads stay as they were.
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'record',
      description: '開關錄影模式（遮罩畫面上的 email、API key、電話）',
    })
    if (await read($, isRecording)) $.ui.status(STATUS)

    return next(e)
  })

  on('command.run', { command: 'record' }, async $ => {
    const now = !(await read($, isRecording))
    await update($, isRecording, () => now)
    $.ui.status(now ? STATUS : undefined)

    return { text: now ? '錄影模式已開啟。再打一次 /record 關閉。' : '錄影模式已關閉。' }
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) =>
    (await read($, isRecording))
      ? next({ ...e, props: { ...e.props, text: maskText(e.props.text) } })
      : next(e),
  )

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) =>
    (await read($, isRecording))
      ? next({ ...e, props: { ...e.props, text: maskText(e.props.text) } })
      : next(e),
  )

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) =>
    (await read($, isRecording))
      ? next({ ...e, props: { ...e.props, text: maskText(e.props.text) } })
      : next(e),
  )

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) =>
    (await read($, isRecording))
      ? next({
          ...e,
          props: { ...e.props, input: maskDeep(e.props.input), output: maskDeep(e.props.output) },
        })
      : next(e),
  )

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) =>
    (await read($, isRecording))
      ? next({ ...e, props: { ...e.props, output: maskDeep(e.props.output) } })
      : next(e),
  )

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) =>
    (await read($, isRecording))
      ? next({ ...e, props: { ...e.props, calls: maskDeep(e.props.calls) } })
      : next(e),
  )
}
