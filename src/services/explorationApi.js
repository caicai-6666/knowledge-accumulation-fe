import { throwIfAborted } from './abortSignal.js'
import { uiText, LocalizedError } from '../i18n/index.js'
import { parseTreeUpdatedAt } from '../models/treeDateGroups.js'
import { KNOWLEDGE_API_BASE_PATH, readAccessToken } from './authentication.js'

export class ExplorationError extends LocalizedError {
  constructor(message, status = 0, details = null) { super(message); this.name = 'ExplorationError'; this.status = status; this.details = details }
}
export const isTreeId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)
export const isFileId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)
function requireId(id) { if (!isTreeId(id)) throw new ExplorationError(uiText('问答树或任务标识无效')); return id }
export function validateTreeName(name) {
  if (typeof name !== 'string' || !name.trim() || Array.from(name.trim()).length > 200) throw new ExplorationError(uiText('问答树名称需为 1–200 个字符'))
  return name.trim()
}
export function validateTurnInput({ question, attachments = [], thinkingEffort, mode }) {
  if (typeof question !== 'string' || !question.trim() || Array.from(question).length > 20000) throw new ExplorationError(uiText('问题需为 1–20000 个字符'))
  if (!['low', 'medium', 'xhigh'].includes(thinkingEffort) || !['main', 'branch'].includes(mode)) throw new ExplorationError(uiText('问答模式或推理强度无效'))
  if (attachments.length > 10 || attachments.some(file => file.type !== 'application/pdf' || !file.name?.toLowerCase().endsWith('.pdf') || !file.size || file.size > 10 * 1024 * 1024) || attachments.reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024) throw new ExplorationError(uiText('仅支持 PDF，每次最多 10 份，每份最多 10 MiB，合计最多 20 MiB'))
}
export function parseExplorationFrame(frame) {
  let id = '', event = 'message'
  const data = []
  for (const line of frame.split('\n')) {
    if (line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const key = colon < 0 ? line : line.slice(0, colon)
    const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
    if (key === 'id') id = value
    if (key === 'event') event = value
    if (key === 'data') data.push(value)
  }
  if (!data.length) return null
  if (id && !/^\d{1,20}$/.test(id)) throw new ExplorationError(uiText('事件游标无效'))
  return { id, event, data: JSON.parse(data.join('\n')) }
}

export function createExplorationApi({ storage = window.localStorage, fetch: fetcher = globalThis.fetch, base = KNOWLEDGE_API_BASE_PATH } = {}) {
  const treePath = id => `${base}/exploration/trees${id ? `/${requireId(id)}` : ''}`
  const turnPath = (treeId, turnId = '', suffix = '') => `${treePath(treeId)}/turns${turnId ? `/${requireId(turnId)}${suffix}` : ''}`
  async function request(path, { signal, timeout = 75000, responseType = 'json', ...init } = {}) {
    throwIfAborted(signal)
    const token = readAccessToken(storage)
    if (!token) throw new ExplorationError(uiText('登录状态已失效，请重新登录'), 401)
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    let timedOut = false
    let timer
    const resetTimer = duration => { clearTimeout(timer); timer = setTimeout(() => { timedOut = true; abort() }, duration) }
    resetTimer(timeout)
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
    try {
      const response = await fetcher(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store', credentials: 'same-origin', redirect: 'error' })
      const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
      if (!response.ok) {
        const payload = mime === 'application/json' ? await response.json().catch(() => null) : null
        if (response.status === 401 && readAccessToken(storage) !== token) throw new ExplorationError(uiText('请求状态已更新，请重试'))
        const detail = payload?.detail === 'Not Found' ? uiText('问答接口不可用，请确认后端版本与请求映射') : typeof payload?.detail === 'string' ? payload.detail : uiText('问答服务请求失败（{value0}）', { value0: response.status })
        throw new ExplorationError(response.status === 401 ? uiText('登录状态已失效，请重新登录') : detail, response.status, payload)
      }
      if (responseType === 'empty') {
        if (response.status !== 204) throw new ExplorationError(uiText('删除结果未确认，请重新加载列表核对'))
        return
      }
      if (responseType === 'stream') {
        if (mime !== 'text/event-stream' || !response.body) throw new ExplorationError(uiText('无法读取问答事件流，请检查接口映射'))
        resetTimer(45000)
        return { response, signal: controller.signal, cleanup, resetTimer: () => resetTimer(45000) }
      }
      if (responseType === 'pdf') {
        if (mime !== 'application/pdf') throw new ExplorationError(uiText('附件响应不是 PDF'))
        const blob = await response.blob()
        throwIfAborted(controller.signal)
        if (!blob.size || blob.size > 50 * 1024 * 1024) throw new ExplorationError(uiText('附件内容为空或超出大小限制'))
        return blob
      }
      if (mime !== 'application/json') throw new ExplorationError(uiText('问答服务响应格式错误，请检查接口映射'))
      const data = await response.json()
      throwIfAborted(controller.signal)
      return data
    } catch (error) {
      cleanup()
      throwIfAborted(signal)
      if (timedOut) throw new ExplorationError(uiText('问答服务请求超时，请重试'))
      if (error instanceof TypeError) throw new ExplorationError(uiText('无法连接问答服务，请重试'))
      throw error
    } finally { if (responseType !== 'stream') cleanup() }
  }

  async function events(treeId, turnId, { signal, lastEventId = '0', onEvent, onOpen } = {}) {
    if (!/^\d{1,20}$/.test(String(lastEventId))) throw new ExplorationError(uiText('事件游标无效'))
    const connection = await request(turnPath(treeId, turnId, '/events'), { signal, responseType: 'stream', headers: { Accept: 'text/event-stream', 'Last-Event-ID': String(lastEventId) } })
    const reader = connection.response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = '', pendingCR = false
    try {
      onOpen?.()
      while (true) {
        const { done, value } = await reader.read()
        throwIfAborted(connection.signal)
        connection.resetTimer()
        let chunk = decoder.decode(value, { stream: !done })
        if (pendingCR && chunk.startsWith('\n')) chunk = chunk.slice(1)
        pendingCR = chunk.endsWith('\r')
        buffer += chunk.replace(/\r\n|\r/g, '\n')
        if (buffer.length > 8 * 1024 * 1024) throw new ExplorationError(uiText('问答事件超过读取上限'))
        let end
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const event = parseExplorationFrame(buffer.slice(0, end))
          buffer = buffer.slice(end + 2)
          if (event && await onEvent(event) === false) return
        }
        if (done) return
      }
    } catch (error) {
      throwIfAborted(signal)
      if (connection.signal.aborted) throw new ExplorationError(uiText('问答连接超时，请重新连接'))
      throw error
    } finally { connection.cleanup(); await reader.cancel().catch(() => {}); reader.releaseLock() }
  }

  return {
    async listTrees(options) {
      const payload = await request(treePath(), options)
      if (!Array.isArray(payload) || payload.some(item => !isTreeId(item?.id) || typeof item.name !== 'string' || !item.name.trim() || typeof item.has_running_task !== 'boolean' || parseTreeUpdatedAt(item.updated_at) === null) || new Set(payload.map(item => item.id)).size !== payload.length) throw new ExplorationError(uiText('问答树列表格式无效'))
      return payload
    },
    async createTree(name, options) {
      const payload = await request(treePath(), { ...options, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      if (!isTreeId(payload?.id) || typeof payload.name !== 'string' || !payload.name.trim()) throw new ExplorationError(uiText('创建探索响应无效，请刷新列表核对，请勿重复创建'))
      return payload
    },
    async renameTree(id, name, options) {
      const payload = await request(`${treePath(id)}/name`, { ...options, method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: validateTreeName(name) }) })
      if (payload?.id !== id || typeof payload.name !== 'string' || validateTreeName(payload.name) !== payload.name) throw new ExplorationError(uiText('名称更新结果无效，请重新加载列表核对'))
      return payload
    },
    deleteTree: (id, options) => request(treePath(id), { ...options, method: 'DELETE', responseType: 'empty' }),
    openTree: (id, options) => request(`${treePath(id)}/open`, { ...options, method: 'POST' }),
    async createTurn(treeId, input, options) {
      validateTurnInput(input)
      const body = new FormData()
      body.append('question', input.question)
      body.append('mode', input.mode)
      body.append('thinking_effort', input.thinkingEffort)
      if (input.supersedesTurnId) body.append('supersedes_turn_id', requireId(input.supersedesTurnId))
      else if (input.selectedNodeId) body.append('selected_node_id', requireId(input.selectedNodeId))
      input.attachments?.forEach(file => body.append('files', file, file.name))
      const payload = await request(turnPath(treeId), { ...options, method: 'POST', body })
      if (payload?.tree_id !== treeId || !isTreeId(payload.turn_id) || payload.status !== 'pending_activation' || typeof payload.can_interrupt !== 'boolean') throw new ExplorationError(uiText('任务登记响应无效，提交结果需核对，请勿重复发送'))
      return payload
    },
    snapshot: (treeId, turnId, options) => request(turnPath(treeId, turnId), options),
    cancel: (treeId, turnId, options) => request(turnPath(treeId, turnId, '/cancel'), { ...options, method: 'POST' }),
    events,
    attachment(treeId, fileId, options) {
      requireId(treeId)
      if (!isFileId(fileId)) throw new ExplorationError(uiText('附件标识无效'))
      return request(`${base}/resource/attachment/${treeId}/${fileId}`, { ...options, responseType: 'pdf', timeout: 15000 })
    },
  }
}
