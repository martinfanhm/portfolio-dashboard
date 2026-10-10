import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { maskText } from './mask'

const RECORD = {
  command: 'record',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

const SECRET =
  'mail me at jane.doe@example.com, key sk-ant-api03-AbCdEfGhIjKlMnOpQrStUv, call +886 912-345-678'

function engine(on: On) {
  on('command.run', () => ({ text: '' }))
  // Beneath the plugin, the engine draws the props it was handed.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{JSON.stringify(e.props)}</Text>
  })
}

const USER = {
  component: 'UserMessage',
  props: { text: SECRET, origin: { kind: 'composer' }, isExpanded: true },
} as const

describe('maskText', () => {
  test('masks email, API keys and phone numbers', () => {
    const out = maskText(SECRET)
    expect(out).not.toContain('jane.doe')
    expect(out).not.toContain('sk-ant')
    expect(out).not.toContain('912')
    expect(out).toContain('[email]')
    expect(out).toContain('[API key]')
    expect(out).toContain('[電話]')
  })

  test('key=value secrets and other key shapes', () => {
    expect(maskText('OPENAI_API_KEY=abcd1234efgh5678ijkl')).toBe('OPENAI_API_KEY=[API key]')
    expect(maskText('"token": "abcdefghijklmnop1234"')).toBe('"token": "[API key]"')
    expect(maskText('ghp_0123456789abcdefghijABCDEFGHIJ')).toBe('[API key]')
    expect(maskText('AKIAIOSFODNN7EXAMPLE')).toBe('[API key]')
    expect(maskText('0912345678')).toBe('[電話]')
    expect(maskText('(02) 2345-6789')).toBe('[電話]')
  })

  test('leaves ordinary text, dates, versions and hashes alone', () => {
    for (const s of [
      '2026-10-09',
      'v2.1.295',
      '192.168.1.10',
      'commit 2269d88',
      'line 1234',
      'took 3500ms',
    ]) {
      expect(maskText(s)).toBe(s)
    }
  })
})

describe('record-mode', () => {
  test('/record toggles masking of what rows draw', async ($, on) => {
    engine(on)
    for (const surface of ['terminal', 'desktop'] as const) {
      const off = await $.ui.mount({ plugin: 'record-mode', surface, ...USER })
      expect((await off.find({ type: 'Text' }))?.text).toContain('jane.doe@example.com')
      await off.unmount()
    }

    const opened = await $.command.run(RECORD)
    expect(opened.text).toContain('已開啟')

    for (const surface of ['terminal', 'desktop'] as const) {
      const on1 = await $.ui.mount({ plugin: 'record-mode', surface, ...USER })
      const drawn = (await on1.find({ type: 'Text' }))?.text ?? ''
      expect(drawn).not.toContain('jane.doe')
      expect(drawn).toContain('[email]')
      await on1.unmount()
    }

    const closed = await $.command.run(RECORD)
    expect(closed.text).toContain('已關閉')
    const again = await $.ui.mount({ plugin: 'record-mode', surface: 'terminal', ...USER })
    expect((await again.find({ type: 'Text' }))?.text).toContain('jane.doe@example.com')
    await again.unmount()
  })

  test('tool rows: input and output strings are masked, ids are kept', async ($, on) => {
    engine(on)
    await $.command.run(RECORD)
    const ui = await $.ui.mount({
      plugin: 'record-mode',
      surface: 'terminal',
      component: 'ToolUse',
      props: {
        tool_use_id: 'toolu_1',
        tool: 'Bash',
        input: { command: 'curl -H "Authorization: Bearer abcdefghijklmnopqrstuv" x' },
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
        output: { stdout: 'owner: bob@corp.io', stderr: '', interrupted: false },
      },
    })
    const drawn = (await ui.find({ type: 'Text' }))?.text ?? ''
    expect(drawn).toContain('toolu_1')
    expect(drawn).not.toContain('abcdefghijklmnopqrstuv')
    expect(drawn).not.toContain('bob@corp.io')
    await ui.unmount()
  })
})
