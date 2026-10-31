import { parseTreeUpdatedAt } from './treeDateGroups.js'
import { t, uiText } from '../i18n/index.js'
import { ExplorationError, isFileId, isTreeId } from '../services/explorationApi.js'

export const TERMINAL_TURNS = new Set(['completed', 'cancelled', 'superseded', 'failed', 'expired'])
const statuses = { pending_activation: 'generating', processing: 'generating', completed: 'complete', cancelled: 'cancelled', superseded: 'superseded', failed: 'failed', expired: 'failed' }
const validText = value => typeof value === 'string'
function invalid() { throw new ExplorationError(uiText('问答树或任务返回的数据不完整，请重新加载')) }
export function makeAttachment(treeId, reference) {
  if (!reference || !isFileId(reference.file_id) || !['images', 'audio', 'video'].includes(reference.type)) invalid()
  const extension = { images: 'pdf', audio: 'mp3', video: 'mp4' }[reference.type]
  return { id: reference.file_id, fileId: reference.file_id, treeId, type: reference.type, name: `${reference.file_id}.${extension}`, file: null, url: '' }
}
// 后端只提供 main/branch 和真实父链；branchId 仅用于前端分列。
// 分支的首个后继沿原列延伸，已有后继时再次探索必须使用独立列。
function displayBranchId(id, pathType, parent, hasContinuation) {
  return pathType === 'main' ? 'main' : parent && parent.branchId !== 'main' && !hasContinuation ? parent.branchId : id
}
export function makeLiveNode(treeId, turnId, input, source) {
  const parent = source.nodes.find(node => node.id === input.selectedNodeId)
  const hasContinuation = parent && source.nodes.some(node => node.parentId === parent.id && node.branchId === parent.branchId)
  const branchId = displayBranchId(turnId, input.mode, parent, hasContinuation)
  return {
    id: turnId, turnId, treeId, kind: 'task', parentId: input.selectedNodeId || null, pathType: input.mode, branchId,
    question: input.question, answer: '', revealAnswer: false, status: 'generating', turnStatus: 'pending_activation', canInterrupt: true,
    createdAt: new Date().toISOString(), startedAt: null, elapsedMs: null, processingDurationMs: null,
    publicMessages: [], process: [], eventLog: [], lastSequence: '0', attachments: input.localAttachments || [],
    reasoningEffort: input.thinkingEffort, advanceMode: input.mode === 'main', registered: false, error: '',
  }
}
function settleProcess(node, status = 'complete') {
  for (const step of node.process) if (step.status === 'generating') step.status = status
}
function updateElapsedTime(node) {
  // 历史替换与激活事件立即恢复计时，不能等下一秒 tick 才重新显示计时栏。
  if (node.status === 'generating' && Number.isFinite(node.startedAt)) node.elapsedMs = Math.max(0, Date.now() - node.startedAt)
}
function applyStatus(node, data) {
  if (!Object.prototype.hasOwnProperty.call(statuses, data.status) || typeof data.can_interrupt !== 'boolean') invalid()
  node.turnStatus = data.status
  node.status = statuses[data.status]
  node.canInterrupt = data.can_interrupt && !TERMINAL_TURNS.has(data.status)
  if (data.node_id) { if (data.node_id !== node.turnId) invalid(); node.registered = true }
  if (data.summary_id) { if (!isTreeId(data.summary_id)) invalid(); node.summaryId = data.summary_id }
  if (data.activated_at) { if (!Number.isFinite(Date.parse(data.activated_at))) invalid(); node.startedAt = Date.parse(data.activated_at); node.createdAt = data.activated_at }
  if (data.processing_duration_ms !== undefined && data.processing_duration_ms !== null) {
    if (!Number.isSafeInteger(data.processing_duration_ms) || data.processing_duration_ms < 0) invalid()
    node.processingDurationMs = data.processing_duration_ms
    node.elapsedMs = data.processing_duration_ms
  }
  if (data.superseded_by_turn_id) node.supersededBy = data.superseded_by_turn_id
  if (TERMINAL_TURNS.has(data.status)) settleProcess(node, data.status === 'completed' ? 'complete' : 'cancelled')
  updateElapsedTime(node)
}
function applyMessage(node, event, data, { reveal = false } = {}) {
  if (!isTreeId(data.message_id) || !['intermediate', 'final'].includes(data.message_kind)) invalid()
  const text = event === 'message.delta' ? data.delta : data.text
  const status = event === 'message.delta' ? 'streaming' : data.status || 'completed'
  if (!validText(text) || !['streaming', 'completed', 'interrupted'].includes(status)) invalid()
  let message = node.publicMessages.find(message => message.id === data.message_id)
  const newMessage = !message
  if (!message) { message = { id: data.message_id, kind: data.message_kind, text: '', status: 'streaming' }; node.publicMessages.push(message) }
  if (message.kind !== data.message_kind) invalid()
  if (event === 'message.delta') message.text += text
  else message.text = text
  message.status = status
  if (message.kind === 'intermediate') {
    let step = node.process.find(step => step.id === message.id)
    if (!step) { settleProcess(node); step = { id: message.id, kind: 'message', label: t('过程输出'), content: '', status: 'generating', reveal }; node.process.push(step) }
    step.content = message.text
    step.status = message.status === 'streaming' ? 'generating' : message.status === 'interrupted' ? 'cancelled' : 'complete'
  } else {
    if (newMessage && reveal && !node.answer) node.revealAnswer = true
    settleProcess(node)
    node.answer = node.publicMessages.filter(message => message.kind === 'final').map(message => message.text).join('\n\n')
  }
}
function applyProgress(node, data, id) {
  if (!['thinking', 'online-search', 'external-expert', 'local-search', 'a2a', 'boardcast'].includes(data.type) || !validText(data.message) || !data.message.trim()) invalid()
  settleProcess(node)
  node.process.push({ id, kind: 'progress', type: data.type, label: data.message, content: '', status: node.status === 'generating' ? 'generating' : 'complete' })
}
export function applyExplorationEvent(node, frame, { history = false, reveal = true } = {}) {
  const { id, event, data } = frame
  if (!data || data.turn_id !== node.turnId) invalid()
  if (id) {
    if (!/^\d{1,20}$/.test(String(id))) invalid()
    if (BigInt(id) <= BigInt(node.lastSequence || '0')) return false
  }
  if (event === 'turn.status') applyStatus(node, data)
  else if (event === 'task.progress') applyProgress(node, data, `progress-${id || node.process.length}`)
  else if (event === 'message.delta' || event === 'message.completed') applyMessage(node, event, data, { reveal: !history && reveal })
  else if (event === 'error') {
    if (!validText(data.message)) invalid()
    if (!id && !history) throw new ExplorationError(data.message, data.code === 'replay_required' ? 409 : 404)
    node.error = data.message
  } else invalid()
  if (id) node.lastSequence = String(id)
  if (event !== 'message.delta') node.eventLog.push({ sequence: id ? String(id) : null, event, data })
  return true
}
export function applyTurnSnapshot(node, snapshot) {
  if (snapshot?.tree_id !== node.treeId || snapshot.turn_id !== node.turnId || !Array.isArray(snapshot.messages) || !Number.isSafeInteger(snapshot.last_sequence) || snapshot.last_sequence < 0) invalid()
  const ids = new Set(snapshot.messages.map(message => message.message_id))
  node.process = node.process.filter(step => step.kind !== 'message' || ids.has(step.id))
  node.publicMessages = []
  node.answer = ''
  applyStatus(node, snapshot)
  for (const message of snapshot.messages) applyMessage(node, 'message.completed', message)
  if (snapshot.progress && !node.process.some(step => step.kind === 'progress' && step.label === snapshot.progress.message && step.type === snapshot.progress.type)) applyProgress(node, snapshot.progress, `snapshot-progress-${snapshot.last_sequence}`)
  if (TERMINAL_TURNS.has(snapshot.status)) settleProcess(node, snapshot.status === 'completed' ? 'complete' : 'cancelled')
  node.error = snapshot.error?.message || ''
  node.lastSequence = String(snapshot.last_sequence)
}
export function normalizeExplorationTree(payload) {
  if (!payload || !isTreeId(payload.id) || !validText(payload.name) || payload.kind !== 'exploration' || parseTreeUpdatedAt(payload.updated_at) === null || !Array.isArray(payload.nodes)) invalid()
  const raw = [...payload.nodes].sort((a, b) => a.sequence - b.sequence)
  const ids = new Set(raw.map(node => node.id))
  if (ids.size !== raw.length || raw.some(node => !isTreeId(node.id) || node.parent_id !== null && !ids.has(node.parent_id) || !['task', 'summary'].includes(node.kind) || !['main', 'branch'].includes(node.path_type) || !['generating', 'complete', 'cancelled', 'superseded', 'failed'].includes(node.status) || !Number.isSafeInteger(node.sequence) || !Array.isArray(node.children_ids) || node.children_ids.some(id => !ids.has(id)))) invalid()
  if (payload.main_leaf_id !== null && !ids.has(payload.main_leaf_id) || payload.root_id !== null && !ids.has(payload.root_id)) invalid()
  const nodes = [], byId = new Map(), branchContinuation = new Set()
  for (const item of raw) {
    const parent = item.parent_id ? byId.get(item.parent_id) : null
    if (item.parent_id && !parent) invalid()
    const branchId = displayBranchId(item.id, item.path_type, parent, branchContinuation.has(parent?.id))
    if (parent && branchId === parent.branchId && item.path_type === 'branch') branchContinuation.add(parent.id)
    const node = {
      id: item.id, turnId: item.id, treeId: payload.id, kind: item.kind, parentId: item.parent_id, branchId, pathType: item.path_type,
      question: item.kind === 'task' ? item.content?.question : t('上下文摘要'), answer: item.kind === 'task' ? item.content?.answer : item.content?.text,
      advanceMode: item.path_type === 'main', status: item.status, turnStatus: item.status === 'complete' ? 'completed' : item.status === 'generating' ? 'processing' : item.status,
      createdAt: item.created_at, startedAt: item.status === 'generating' ? Date.parse(item.created_at) : null,
      processingDurationMs: item.processing_duration_ms, canInterrupt: item.can_interrupt, registered: true,
      attachments: (item.content?.attachments || []).map(reference => makeAttachment(payload.id, reference)),
      publicMessages: [], process: [], eventLog: [], lastSequence: '0', revealAnswer: false, error: '', supersededBy: item.superseded_by_node_id,
    }
    if (!validText(node.question) || !validText(node.answer)) invalid()
    const originalAnswer = node.answer
    if (item.display?.events?.length) {
      for (const entry of item.display.events) applyExplorationEvent(node, { id: entry.sequence === null ? '' : String(entry.sequence), event: entry.event, data: entry.data }, { history: true })
    } else {
      for (const message of item.messages || []) if (message.kind !== 'question') applyMessage(node, 'message.completed', { message_id: message.id, message_kind: message.kind, text: message.text, status: message.status })
    }
    // display 游标包含 delta；推进游标前必须恢复对应的累计片段，否则后续分片会丢失前缀。
    const streaming = item.display?.streaming_messages ?? []
    if (!Array.isArray(streaming)) invalid()
    for (const message of streaming) {
      if (message?.status !== 'streaming' || node.publicMessages.some(item => item.id === message.message_id)) invalid()
      applyMessage(node, 'message.completed', message)
    }
    // 数据库节点是终态权威；展示事件可能只持久化到最后确认的前缀。
    node.status = item.status
    node.turnStatus = item.status === 'complete' ? 'completed' : item.status === 'generating' ? 'processing' : item.status
    node.canInterrupt = item.can_interrupt && item.status === 'generating'
    node.processingDurationMs = item.processing_duration_ms
    updateElapsedTime(node)
    if (!node.publicMessages.some(message => message.kind === 'final')) node.answer = originalAnswer
    if (item.status !== 'generating') settleProcess(node, item.status === 'complete' ? 'complete' : 'cancelled')
    if (item.display?.last_sequence !== null && item.display?.last_sequence !== undefined) node.lastSequence = String(item.display.last_sequence)
    nodes.push(node); byId.set(node.id, node)
  }
  const roots = nodes.filter(node => node.parentId === null)
  if (nodes.length && (roots.length !== 1 || roots[0].id !== payload.root_id) || !nodes.length && (payload.root_id !== null || payload.main_leaf_id !== null)) invalid()
  return { id: payload.id, title: payload.name, updatedAt: payload.updated_at, mainLeafId: payload.main_leaf_id, nodes, loaded: true, revision: payload.revision }
}
