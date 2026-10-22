export function answerTimingLabel(task) {
  const terminal = task.status !== 'generating'
  const milliseconds = terminal ? task.processingDurationMs : task.elapsedMs
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return ''
  const seconds = Math.floor(milliseconds / 1000)
  const duration = seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
  return terminal ? `用时 ${duration}` : `已经处理 ${duration}`
}

const progressTypes = new Set(['thinking', 'online-search', 'external-expert'])
const isProgress = step => step.kind === 'progress' || progressTypes.has(step.type)
const sameProgress = (left, right) => Boolean(left && right && left.type === right.type && left.label === right.label)

// 只投影给用户的列表；原始过程、公开事件和 SSE 游标保持不变。
export function answerProcessSteps(task) {
  const result = []
  let previousProgress = null, previousEntry = null, thinking = null
  const hasFinal = Boolean(task.answer?.trim())
  const finalSequence = task.eventLog?.find(entry => entry.event === 'message.completed' && entry.data?.message_kind === 'final')?.sequence
  for (const source of task.process || []) {
    if (source.status === 'pending') continue
    const step = { ...source }
    if (step.status === 'generating' && (task.status !== 'generating' || hasFinal && isProgress(step))) {
      step.status = task.status === 'failed' ? 'failed' : ['cancelled', 'superseded'].includes(task.status) ? 'cancelled' : 'complete'
    }
    if (!isProgress(step)) { result.push(step); thinking = null; continue }
    const sequence = /^progress-(\d+)$/.exec(step.id)?.[1]
    if (sequence && finalSequence && BigInt(sequence) > BigInt(finalSequence)) continue
    if (step.type === 'thinking') {
      thinking = step.status === 'generating' && !hasFinal ? step : null
      previousProgress = step
      continue
    }
    thinking = null
    // 同阶段的穿插通知复用首项；思考不留存，移除后相邻的相同状态也合并。
    const adjacent = result.at(-1)
    const entry = sameProgress(previousProgress, step) && previousEntry
      || isProgress(adjacent || {}) && sameProgress(adjacent, step) && adjacent
    if (entry) entry.status = step.status
    else { result.push(step); previousEntry = step }
    if (entry) previousEntry = entry
    previousProgress = step
  }
  if (thinking && task.status === 'generating') result.push(thinking)
  return result
}

export function answerStepPresentation(step, taskStatus, { active = false } = {}) {
  let text = step.label, suffix = ''
  if (!active && step.status !== 'generating') {
    if (step.status === 'failed' || step.status === 'cancelled' && taskStatus === 'failed') suffix = ' · 未完成'
    else if (step.status === 'cancelled') suffix = taskStatus === 'superseded' ? ' · 已中断' : ' · 已停止'
    else if (isProgress(step)) text = text.replace(/^(\s*)正在/, '$1已')
  }
  const fullText = text + suffix
  const colon = text.search(/[:：]/)
  if (colon >= 0) {
    const detail = Array.from(text.slice(colon + 1))
    if (detail.length > 15) text = `${text.slice(0, colon + 1)}${detail.slice(0, 15).join('')}…`
  }
  return { text: text + suffix, fullText }
}
