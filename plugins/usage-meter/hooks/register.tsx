import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Snapshot } from '../types'

const snapshot = atom({ plugin: 'usage-meter', key: 'snapshot' } as const, null)

const HOT = 80

async function measure($: EngineInterface): Promise<Snapshot> {
  const usage = await $.session.usage()
  const win = (kind: string) => {
    const w = usage.rateLimits.find(r => r.kind === kind)
    return w ? { percent: w.percentUsed, resetsAt: w.resetsAt } : undefined
  }

  return {
    contextPercent: usage.context.percent,
    fiveHour: win('five_hour'),
    sevenDay: win('seven_day'),
    costUsd: usage.cost?.usd,
  }
}

function clock(iso: string | undefined): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return undefined
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function pct(n: number): string {
  return `${Math.round(n)}%`
}

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const s = await measure($)
    await update($, snapshot, () => s)

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snapshot)
    if (e.props.hasSurvey || s === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const hasQuota = s.fiveHour !== undefined || s.sevenDay !== undefined
    const cell = (key: string, label: string, value: number | undefined, extra = '') => (
      <Text key={key} color={value !== undefined && value >= HOT ? 'error' : 'subtle'}>
        {label} {value === undefined ? '—' : pct(value)}
        {extra}
      </Text>
    )
    const reset = clock(s.fiveHour?.resetsAt)

    return (
      <Box flexDirection="row" gap={2}>
        {cell('context', 'context', s.contextPercent)}
        {hasQuota
          ? [
              cell('five-hour', '5h', s.fiveHour?.percent, reset ? ` · ${reset} 重置` : ''),
              cell('seven-day', '本週', s.sevenDay?.percent),
            ]
          : (
            <Text key="cost" color="subtle">
              本對話花費 {s.costUsd === undefined ? '—' : `$${s.costUsd.toFixed(2)}`}
            </Text>
          )}
      </Box>
    )
  })
}
