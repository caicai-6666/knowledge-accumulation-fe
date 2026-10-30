import { t } from '../i18n/index.js'
export function answerTimingLabel(task) {
  const terminal = task.status !== 'generating'
  const milliseconds = terminal ? task.processingDurationMs : task.elapsedMs
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return ''
  const seconds = Math.floor(milliseconds / 1000)
  const duration = seconds < 60 ? t('{value0} 秒', { value0: seconds }) : t('{value0} 分 {value1} 秒', { value0: Math.floor(seconds / 60), value1: seconds % 60 })
  return terminal ? t('用时 {value0}', { value0: duration }) : t('已经处理 {value0}', { value0: duration })
}

const progressTypes = new Set(['thinking', 'online-search', 'external-expert', 'local-search', 'a2a', 'boardcast'])
const isProgress = step => step.kind === 'progress' || progressTypes.has(step.type)
// label 原样保存 task.progress.message；比较完整原文，不裁剪空格或按展示文案去重。
const sameProgress = (left, right) => Boolean(left && right && left.type === right.type && left.label === right.label)

// 只投影给用户的列表；原始过程、公开事件和 SSE 游标保持不变。
export function answerProcessSteps(task) {
  const result = []
  let previousEntry = null, thinking = null
  const hasFinal = Boolean(task.answer?.trim())
  const finalSequence = task.eventLog?.find(entry => entry.event === 'message.completed' && entry.data?.message_kind === 'final')?.sequence
  for (const source of task.process || []) {
    if (source.status === 'pending') { previousEntry = null; continue }
    const step = { ...source }
    if (step.status === 'generating' && (task.status !== 'generating' || hasFinal && isProgress(step))) {
      step.status = task.status === 'failed' ? 'failed' : ['cancelled', 'superseded'].includes(task.status) ? 'cancelled' : 'complete'
    }
    if (!isProgress(step)) { result.push(step); thinking = null; previousEntry = null; continue }
    const sequence = /^progress-(\d+)$/.exec(step.id)?.[1]
    if (sequence && finalSequence && BigInt(sequence) > BigInt(finalSequence)) { previousEntry = null; continue }
    if (step.type === 'thinking') {
      thinking = step.status === 'generating' && !hasFinal ? step : null
      previousEntry = null
      continue
    }
    thinking = null
    // 只合并原始过程顺序中紧邻的通知；隐藏的思考也会打断合并。
    if (sameProgress(previousEntry, step)) previousEntry.status = step.status
    else { result.push(step); previousEntry = step }
  }
  if (thinking && task.status === 'generating') result.push(thinking)
  return result
}

export function answerStepPresentation(step, taskStatus, { active = false } = {}) {
  if (step.type === 'thinking') {
    const text = t('正在思考')
    return { text, fullText: text }
  }
  let text = step.kind === 'message' ? t('过程输出') : step.label, suffix = ''
  if (!active && step.status !== 'generating') {
    if (step.status === 'failed' || step.status === 'cancelled' && taskStatus === 'failed') suffix = t(' · 未完成')
    else if (step.status === 'cancelled') suffix = taskStatus === 'superseded' ? t(' · 已中断') : t(' · 已停止')
    else if (isProgress(step)) text = text.replace(/^(\s*)正在/, '$1已')
  }
  const fullText = text + suffix
  const colon = text.search(/[:：]/)
  const start = colon >= 0 ? colon + 1 : 0
  const detail = Array.from(text.slice(start))
  if (detail.length > 15) text = `${text.slice(0, start)}${detail.slice(0, 15).join('')}…`
  return { text: text + suffix, fullText }
}
