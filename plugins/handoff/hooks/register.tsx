import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Phase } from '../types'

const contextPercent = atom({ plugin: 'handoff', key: 'contextPercent' } as const, null)
const files = atom({ plugin: 'handoff', key: 'files' } as const, [])
const phase = atom({ plugin: 'handoff', key: 'phase' } as const, 'idle' as Phase)

const THRESHOLD = 70

function prompt(touched: readonly string[]): string {
  const list = touched.length > 0 ? touched.map(f => `- ${f}`).join('\n') : '（工具紀錄裡沒有）'
  return [
    '這個對話的 context 快滿了，接下來會清空，由一個全新的對話接手。',
    '請寫一份交接摘要，讓新對話只讀這份摘要就能接著做。用這個對話一直在用的語言，Markdown 格式，只輸出摘要本身。',
    '包含這幾節：',
    '## 目前的目標',
    '## 已經完成的',
    '## 還沒做的（依優先順序）',
    '## 改過的檔案（每個檔案一行，說明改了什麼）',
    '## 要注意的地方（做過的決定、踩過的坑、使用者的偏好、還沒解決的疑問）',
    '',
    '這個對話用工具寫入或編輯過的檔案：',
    list,
  ].join('\n')
}

function stamp(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

async function handOff($: EngineInterface): Promise<void> {
  if ((await read($, phase)) !== 'idle') return
  await update($, phase, () => 'writing')
  try {
    const reply = await $.model.fork({ prompt: prompt(await read($, files)) })
    if (!reply.isAnswered) {
      $.ui.toast(`交接摘要沒寫成（${reply.reason}），對話沒有清空`)
      return
    }

    const path = `.claude/handoffs/handoff-${stamp(await $.clock.now())}.md`
    await $.fs.write(path, reply.text)

    await update($, phase, () => 'clearing')
    await $.command.run({ command: 'clear' })
    await update($, contextPercent, () => null)
    await update($, files, () => [])
    await $.prompt.submit({
      text: `這是上一個對話的交接摘要（也存在 ${path}），請讀完後接著做：\n\n${reply.text}`,
      asUser: true,
    })
  } catch (error) {
    $.ui.toast(`交接失敗：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    await update($, phase, () => 'idle')
  }
}

async function touch($: EngineInterface, path: string): Promise<void> {
  await update($, files, list => (list.includes(path) ? list : [...list, path]))
}

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      const { context } = await $.session.usage()
      await update($, contextPercent, () => context.percent ?? null)
    }

    return result
  })

  // Only bookkeeping: a failure here must never stop the write itself.
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) await touch($, e.file_path)
    return ran
  }).catch(($, e, next) => next(e))
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) await touch($, e.file_path)
    return ran
  }).catch(($, e, next) => next(e))
  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) await touch($, e.notebook_path)
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const percent = await read($, contextPercent)
    const now = await read($, phase)
    const isShown =
      now !== 'idle' || (percent !== null && percent >= THRESHOLD && !e.props.isWorking)
    if (e.props.hasSurvey || !isShown) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const line =
      now === 'idle' ? (
        <Box flexDirection="row" gap={1}>
          <Text color="warning">context {percent}%</Text>
          <Button key="handoff" label="交接到新對話" onPress={() => handOff($)} />
        </Box>
      ) : (
        <Text color="subtle">{now === 'writing' ? '正在寫交接摘要…' : '正在清空對話…'}</Text>
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
