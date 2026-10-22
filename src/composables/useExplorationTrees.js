import { computed, onScopeDispose, ref, watch } from 'vue'
import { getContextPath } from '../models/questionTree.js'
import { applyExplorationEvent, applyTurnSnapshot, makeLiveNode, normalizeExplorationTree, TERMINAL_TURNS } from '../models/explorationTree.js'
import { createExplorationApi, ExplorationError, isTreeId, validateTreeName, validateTurnInput } from '../services/explorationApi.js'
import { convertImageFileToPdf, isSupportedImage } from '../services/imagePdf.js'

export function useExplorationTrees({ api = createExplorationApi(), active = () => true, onAuthenticationExpired = () => {}, convertImage = convertImageFileToPdf } = {}) {
  const trees = ref([]), treeId = ref('__new-exploration__'), selectedId = ref(null), branchAnchorId = ref(null)
  const exploration = { id: '__new-exploration__', title: '开始新探索', nodes: [], mainLeafId: null, loaded: true }
  const isNewExploration = computed(() => treeId.value === exploration.id)
  const tree = computed(() => trees.value.find(item => item.id === treeId.value) || exploration)
  const path = computed(() => getContextPath(tree.value, selectedId.value))
  const context = computed(() => path.value.filter(node => node.kind === 'task'))
  const selectedNode = computed(() => context.value.at(-1))
  const drafts = ref({}), attachmentDrafts = ref({}), queuedByTree = ref({})
  const draftKey = computed(() => `${treeId.value}:${selectedId.value || 'root'}`)
  const draft = computed({ get: () => drafts.value[draftKey.value] || '', set: value => { drafts.value[draftKey.value] = value } })
  const attachments = computed(() => attachmentDrafts.value[draftKey.value] || [])
  const queuedQuestions = computed(() => queuedByTree.value[treeId.value] || [])
  const reasoningEffort = ref('medium'), advanceEnabled = ref(false)
  const canAdvance = computed(() => Boolean(selectedNode.value?.status !== 'generating' && selectedNode.value?.kind === 'task' && selectedNode.value.branchId === 'main' && selectedId.value === tree.value.mainLeafId))
  // 空探索的首问固定建立主干，界面与实际提交模式保持一致。
  const advanceMode = computed({ get: () => Boolean(tree.value.loaded && !tree.value.nodes.length) || canAdvance.value && advanceEnabled.value, set: value => { advanceEnabled.value = canAdvance.value && Boolean(value) } })
  watch([treeId, selectedId], () => { advanceEnabled.value = false }, { flush: 'sync' })
  const loading = ref(false), listLoading = ref(false), error = ref(''), submitting = ref(false), cancelling = ref(false)
  const treeMutation = ref(null)
  const submissionUncertain = ref(false)
  const attachmentError = ref(''), convertingAttachments = ref(false), connectionError = ref('')
  const pending = computed(() => {
    const current = tree.value.nodes.find(node => node.kind === 'task' && node.status === 'generating')
    const owner = current ? tree.value : trees.value.find(item => item.nodes.some(node => node.kind === 'task' && node.status === 'generating'))
    const node = current || owner?.nodes.find(node => node.kind === 'task' && node.status === 'generating')
    return node ? { treeId: owner.id, nodeId: node.id, canInterrupt: node.canInterrupt } : null
  })
  const canSteer = computed(() => {
    const node = tree.value.nodes.find(node => node.id === pending.value?.nodeId)
    return Boolean(node?.canInterrupt && (node.registered || node.turnStatus === 'pending_activation'))
  })
  const streams = new Map(), urls = new Set(), resourceUrls = new Map(), controllers = new Set(), pausedQueues = new Set()
  const treeVersions = new Map(), removedTreeIds = new Set()
  let catalogRevision = 0
  let disposed = false, selectionVersion = 0, clock = null
  const controller = () => { const value = new AbortController(); controllers.add(value); return value }
  function report(cause) {
    if (disposed || cause?.name === 'AbortError') return
    if (cause?.status === 401) onAuthenticationExpired()
    error.value = cause?.message || '问答服务暂不可用，请重试'
  }
  function findNode(owner, id) { return trees.value.find(item => item.id === owner)?.nodes.find(node => node.id === id) }
  function makeUrl(blob) { const url = URL.createObjectURL(blob); urls.add(url); return url }
  async function loadTrees() {
    if (listLoading.value || submitting.value || treeMutation.value || disposed) return
    listLoading.value = true; error.value = ''
    const request = controller(), revision = catalogRevision
    try {
      const list = await api.listTrees({ signal: request.signal })
      if (disposed || revision !== catalogRevision) return false
      submissionUncertain.value = false
      const previous = new Map(trees.value.map(item => [item.id, item]))
      trees.value = list.map(item => previous.get(item.id) || { id: item.id, title: item.name, nodes: [], mainLeafId: null, loaded: false })
      for (const item of trees.value) item.title = list.find(entry => entry.id === item.id).name
      if (!isNewExploration.value && !trees.value.some(item => item.id === treeId.value)) newTree()
      return true
    } catch (cause) { report(cause); return false }
    finally { controllers.delete(request); listLoading.value = false }
  }
  async function refreshTree(id) {
    if (removedTreeIds.has(id)) return null
    if (treeMutation.value?.id === id && treeMutation.value.type === 'delete') return trees.value.find(item => item.id === id) || null
    const request = controller(), version = treeVersions.get(id) || 0
    try {
      const normalized = normalizeExplorationTree(await api.openTree(id, { signal: request.signal }))
      if (disposed || removedTreeIds.has(id)) return null
      if (version !== (treeVersions.get(id) || 0)) return trees.value.find(item => item.id === id) || null
      submissionUncertain.value = false
      const old = trees.value.find(item => item.id === id)
      // SSE 可能比 open 的数据库快照更新；拓扑使用服务端结果，保留更新的公开输出。
      for (const node of normalized.nodes) {
        const existing = old?.nodes.find(item => item.id === node.id)
        if (existing && BigInt(existing.lastSequence || '0') > BigInt(node.lastSequence || '0')) {
          const topology = { parentId: node.parentId, branchId: node.branchId, pathType: node.pathType }
          const terminal = node.status !== 'generating' ? { status: node.status, turnStatus: node.turnStatus, canInterrupt: false, processingDurationMs: node.processingDurationMs, supersededBy: node.supersededBy } : null
          Object.assign(node, existing, topology, { registered: true }, terminal)
          if (terminal) for (const step of node.process) if (step.status === 'generating') step.status = terminal.status === 'complete' ? 'complete' : 'cancelled'
        } else if (existing?.attachments?.length === node.attachments.length) {
          node.attachments.forEach((file, index) => { const local = existing.attachments[index]; if (local.file) Object.assign(file, { name: local.file.name, file: local.file, url: local.url }) })
        }
      }
      for (const node of old?.nodes || []) if (node.status === 'generating' && !node.registered && !normalized.nodes.some(item => item.id === node.id)) normalized.nodes.push(node)
      const index = trees.value.findIndex(item => item.id === id)
      if (treeId.value === id && selectedId.value && !normalized.nodes.some(node => node.id === selectedId.value)) selectedId.value = normalized.mainLeafId
      if (index < 0) trees.value.unshift(normalized)
      else trees.value[index] = normalized
      return normalized
    } catch (cause) {
      if (removedTreeIds.has(id) || version !== (treeVersions.get(id) || 0)) return trees.value.find(item => item.id === id) || null
      throw cause
    } finally { controllers.delete(request) }
  }
  async function selectTree(id) {
    if (!trees.value.some(item => item.id === id)) return
    const version = ++selectionVersion
    treeId.value = id; selectedId.value = null; loading.value = true; error.value = ''
    try {
      const loaded = await refreshTree(id)
      if (disposed || !loaded || version !== selectionVersion) return
      selectedId.value = loaded.mainLeafId && loaded.nodes.find(node => node.id === loaded.mainLeafId)?.kind === 'task' ? loaded.mainLeafId : loaded.nodes.findLast(node => node.kind === 'task' && node.branchId === 'main')?.id || null
      for (const node of loaded.nodes) if (node.kind === 'task' && node.status === 'generating') void connect(id, node.id, true)
    } catch (cause) { report(cause) }
    finally { if (version === selectionVersion) loading.value = false }
  }
  function selectNode(id) { if (tree.value.nodes.some(node => node.id === id && node.kind === 'task')) selectedId.value = id }
  function newTree() { ++selectionVersion; treeId.value = exploration.id; selectedId.value = null; loading.value = false; error.value = '' }
  function stopStreams() { for (const request of streams.values()) request.abort(); streams.clear(); clearInterval(clock); clock = null }
  async function connect(owner, id, recover = false) {
    if (disposed || !active() || streams.has(id)) return
    const request = controller(); streams.set(id, request)
    let ended = false
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        request.signal.throwIfAborted()
        let node = findNode(owner, id)
        if (!node) return
        try {
          if (recover || attempt) {
            const snapshot = await api.snapshot(owner, id, { signal: request.signal })
            node = findNode(owner, id)
            if (!node) return
            applyTurnSnapshot(node, snapshot)
          }
          if (!TERMINAL_TURNS.has(node.turnStatus)) await api.events(owner, id, {
            signal: request.signal, lastEventId: node.lastSequence,
            onOpen: () => { connectionError.value = '' },
            onEvent: frame => {
              const current = findNode(owner, id)
              if (!current) return false
              applyExplorationEvent(current, frame)
              return !TERMINAL_TURNS.has(current.turnStatus)
            },
          })
          node = findNode(owner, id)
          if (TERMINAL_TURNS.has(node?.turnStatus)) { ended = true; break }
        } catch (cause) {
          if (request.signal.aborted) throw cause
          if ([401, 404, 410].includes(cause.status)) throw cause
          if (attempt === 3) throw cause
        }
        // 重新连接只重放同一任务，从不重新提交模型请求。
        await new Promise((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
          const timer = setTimeout(() => { request.signal.removeEventListener('abort', abort); resolve() }, 600 * (attempt + 1))
          request.signal.addEventListener('abort', abort, { once: true })
        })
      }
      if (!ended) throw new ExplorationError('连接已中断，任务可能仍在执行，请重新连接')
    } catch (cause) {
      if (!request.signal.aborted && !disposed && !removedTreeIds.has(owner) && !(treeMutation.value?.id === owner && treeMutation.value.type === 'delete')) {
        connectionError.value = cause.message || '连接已中断，请重新连接'
        report(cause)
        if ([404, 410].includes(cause.status)) { try { await refreshTree(owner) } catch (failure) { report(failure) } }
      }
    } finally {
      if (streams.get(id) === request) streams.delete(id)
      controllers.delete(request)
    }
    if (ended && !disposed && active() && !removedTreeIds.has(owner) && !(treeMutation.value?.id === owner && treeMutation.value.type === 'delete')) {
      try { await refreshTree(owner) } catch (cause) { report(cause); return }
      if (!pausedQueues.has(owner)) {
        const next = queuedByTree.value[owner]?.[0]
        if (next) void dispatchQueued(owner, next.id, false)
      }
    }
  }
  function reconnect() {
    error.value = ''; connectionError.value = ''
    for (const owner of trees.value) for (const node of owner.nodes) if (node.kind === 'task' && node.status === 'generating') void connect(owner.id, node.id, true)
  }
  async function startTask(item, navigate = false, supersedes = null) {
    let owner = trees.value.find(entry => entry.id === item.treeId)
    if (!owner?.loaded) throw new ExplorationError('请先选择问答树')
    const parent = owner.nodes.find(node => node.id === item.parentId)
    const mode = supersedes ? supersedes.pathType === 'main' ? 'main' : 'branch' : !owner.nodes.length ? 'main' : item.advanceMode ? 'main' : 'branch'
    if (!supersedes && owner.nodes.length && (!parent || parent.kind !== 'task' || parent.status === 'generating')) throw new ExplorationError('请等待所选任务结束后继续')
    if (!supersedes && mode === 'main' && owner.nodes.length && (owner.mainLeafId !== item.parentId || parent.branchId !== 'main')) throw new ExplorationError('推进位置已变化，请重新选择主干末尾')
    const input = { question: item.question, thinkingEffort: item.reasoningEffort, mode, selectedNodeId: item.parentId, supersedesTurnId: supersedes?.id, attachments: item.attachments.map(file => file.file), localAttachments: item.attachments }
    validateTurnInput(input)
    const request = controller()
    let response
    try { response = await api.createTurn(owner.id, input, { signal: request.signal }) }
    catch (cause) {
      if (!cause.status || cause.status >= 500) { submissionUncertain.value = true; throw new ExplorationError('任务提交结果尚未确认，请重新加载问答树核对后再发送', cause.status) }
      throw cause
    }
    finally { controllers.delete(request) }
    if (disposed) return null
    owner = trees.value.find(entry => entry.id === item.treeId)
    const node = makeLiveNode(owner.id, response.turn_id, input, owner)
    // 方向调整先由后端原子登记成功，旧任务才变成被替代状态。
    if (supersedes) {
      streams.get(supersedes.id)?.abort()
      supersedes.status = 'superseded'; supersedes.turnStatus = 'superseded'; supersedes.canInterrupt = false; supersedes.supersededBy = node.id
      node.parentId = supersedes.registered ? supersedes.id : supersedes.parentId
      node.branchId = supersedes.branchId
      if (!supersedes.registered) owner.nodes = owner.nodes.filter(entry => entry.id !== supersedes.id)
    }
    owner.nodes.push(node)
    if (mode === 'main') owner.mainLeafId = node.id
    if (navigate || treeId.value === owner.id && selectedId.value === item.parentId) { treeId.value = owner.id; selectedId.value = node.id }
    pausedQueues.delete(owner.id)
    void connect(owner.id, node.id)
    return node
  }
  async function sendQuestion() {
    if (treeMutation.value || submissionUncertain.value || !tree.value.loaded || submitting.value || listLoading.value || loading.value || disposed || convertingAttachments.value || !draft.value.trim() && !attachments.value.length) return false
    if (pending.value && pending.value.treeId !== treeId.value) return false
    const key = draftKey.value
    const item = { id: crypto.randomUUID(), treeId: treeId.value, parentId: selectedId.value, question: draft.value.trim() || '请分析附件图片。', attachments: [...attachments.value], reasoningEffort: reasoningEffort.value, advanceMode: advanceMode.value }
    error.value = ''
    try {
      validateTurnInput({ question: item.question, attachments: item.attachments.map(file => file.file), thinkingEffort: item.reasoningEffort, mode: item.advanceMode ? 'main' : 'branch' })
      if (pending.value || queuedQuestions.value.length) { (queuedByTree.value[item.treeId] ||= []).push(item) }
      else {
        submitting.value = true
        if (isNewExploration.value) {
          const request = controller()
          let created
          try { created = await api.createTree(undefined, { signal: request.signal }) }
          catch (cause) {
            if (!cause.status || cause.status >= 500) { submissionUncertain.value = true; throw new ExplorationError('探索创建结果尚未确认，请重新加载列表核对后再发送', cause.status) }
            throw cause
          }
          finally { controllers.delete(request) }
          if (!isTreeId(created?.id) || typeof created.name !== 'string') throw new ExplorationError('创建探索响应无效，请刷新列表核对')
          if (disposed) return false
          const owner = { id: created.id, title: created.name, nodes: [], mainLeafId: null, loaded: true }
          trees.value.unshift(owner); item.treeId = owner.id
          // 创建成功但登记失败时继续使用该空树，避免重试重复创建。
          if (draftKey.value === key) { treeId.value = owner.id; selectedId.value = null; drafts.value[draftKey.value] = drafts.value[key]; attachmentDrafts.value[draftKey.value] = attachmentDrafts.value[key]; delete drafts.value[key]; delete attachmentDrafts.value[key] }
        }
        if (!await startTask(item)) return false
      }
      delete drafts.value[key]; delete attachmentDrafts.value[key]
      if (key.startsWith(exploration.id)) { delete drafts.value[`${item.treeId}:root`]; delete attachmentDrafts.value[`${item.treeId}:root`] }
      return true
    } catch (cause) { report(cause); return false }
    finally { submitting.value = false }
  }
  async function stopAnswer() {
    if (!pending.value || cancelling.value || !pending.value.canInterrupt) return
    const job = pending.value, request = controller()
    cancelling.value = true; pausedQueues.add(job.treeId); error.value = ''
    try {
      let snapshot
      try { snapshot = await api.cancel(job.treeId, job.nodeId, { signal: request.signal }) }
      catch (cause) { if (cause.status !== 409) throw cause; snapshot = await api.snapshot(job.treeId, job.nodeId, { signal: request.signal }) }
      const node = findNode(job.treeId, job.nodeId)
      if (node) applyTurnSnapshot(node, snapshot)
      if (TERMINAL_TURNS.has(snapshot.status)) { streams.get(job.nodeId)?.abort(); await refreshTree(job.treeId) }
    } catch (cause) { report(cause) }
    finally { controllers.delete(request); cancelling.value = false }
  }
  async function dispatchQueued(owner, id, steer) {
    if (treeMutation.value || submissionUncertain.value || disposed || submitting.value || loading.value) return false
    const queue = queuedByTree.value[owner] || [], item = queue.find(entry => entry.id === id)
    const running = trees.value.find(entry => entry.id === owner)?.nodes.find(node => node.status === 'generating')
    if (!item || running && (!steer || !running.canInterrupt || !running.registered && running.turnStatus !== 'pending_activation' || item.parentId !== running.id)) return false
    submitting.value = true; error.value = ''
    try {
      const node = await startTask(item, steer, running)
      if (!node) return false
      queuedByTree.value[owner] = queue.filter(entry => entry.id !== id)
      for (const entry of queuedByTree.value[owner]) if (entry.parentId === item.parentId) { entry.parentId = node.id; entry.advanceMode = node.branchId === 'main' && node.advanceMode }
      return true
    } catch (cause) { report(cause); return false }
    finally { submitting.value = false }
  }
  function sendQueued(id) { return dispatchQueued(treeId.value, id, true) }
  function releaseUnusedAttachment(item) {
    if (!item?.url || !urls.has(item.url) || [...resourceUrls.values()].includes(item.url)) return
    const used = [...Object.values(attachmentDrafts.value).flat(), ...Object.values(queuedByTree.value).flatMap(queue => queue.flatMap(entry => entry.attachments)), ...trees.value.flatMap(owner => owner.nodes.flatMap(node => node.attachments))].some(file => file.url === item.url)
    if (!used) { URL.revokeObjectURL(item.url); urls.delete(item.url) }
  }
  function removeQueued(id) {
    const removed = queuedQuestions.value.find(item => item.id === id)
    queuedByTree.value[treeId.value] = queuedQuestions.value.filter(item => item.id !== id)
    removed?.attachments.forEach(releaseUnusedAttachment)
  }
  async function addAttachments(files) {
    if (treeMutation.value || convertingAttachments.value || disposed) return
    const key = draftKey.value, failures = []
    convertingAttachments.value = true; attachmentError.value = ''
    try {
      for (const file of files) {
        if (disposed) break
        if (!isSupportedImage(file)) { failures.push(`${file.name}：仅支持图片`); continue }
        const list = attachmentDrafts.value[key] || [], sourceKey = JSON.stringify([file.name, file.size, file.lastModified])
        if (list.some(item => item.sourceKey === sourceKey)) continue
        if (list.length >= 10) { failures.push('每次最多 10 个附件'); break }
        try {
          const pdf = await convertImage(file)
          if (disposed) break
          // 转换期间用户可能移除附件；按最新草稿提交，并替换数组以确保首次添加也触发渲染。
          const current = attachmentDrafts.value[key] || []
          if (current.some(item => item.sourceKey === sourceKey)) continue
          if (current.length >= 10) { failures.push('每次最多 10 个附件'); break }
          if (pdf.size > 10 * 1024 * 1024 || current.reduce((total, item) => total + item.file.size, pdf.size) > 20 * 1024 * 1024) { failures.push(`${file.name}：PDF 超出大小限制`); continue }
          attachmentDrafts.value[key] = [...current, { id: crypto.randomUUID(), sourceKey, file: pdf, name: pdf.name, url: makeUrl(pdf), type: 'images' }]
        } catch { failures.push(`${file.name}：转换 PDF 失败`) }
      }
    } finally { if (!disposed) { convertingAttachments.value = false; attachmentError.value = failures.join('；') } }
  }
  function removeAttachment(id) {
    const removed = attachments.value.find(item => item.id === id)
    attachmentDrafts.value[draftKey.value] = attachments.value.filter(item => item.id !== id)
    releaseUnusedAttachment(removed)
  }
  async function previewResource(item, signal) {
    if (item.url) return item.url
    if (item.type !== 'images') throw new ExplorationError('此附件暂不支持 PDF 预览')
    const key = `${item.treeId}/${item.fileId}`
    if (resourceUrls.has(key)) return resourceUrls.get(key)
    try {
      const blob = await api.attachment(item.treeId, item.fileId, { signal })
      if (disposed || removedTreeIds.has(item.treeId)) return ''
      const url = makeUrl(blob); resourceUrls.set(key, url); return url
    } catch (cause) { if (cause.status === 401) onAuthenticationExpired(); throw cause }
  }
  async function mutateTree(id, type, operation) {
    if (disposed || treeMutation.value || submitting.value || cancelling.value || loading.value || listLoading.value || convertingAttachments.value) throw new ExplorationError('当前操作尚未完成，请稍后重试')
    if (!trees.value.some(item => item.id === id) || removedTreeIds.has(id)) throw new ExplorationError('问答树不存在', 404)
    treeMutation.value = { id, type }
    catalogRevision++
    treeVersions.set(id, (treeVersions.get(id) || 0) + 1)
    const request = controller()
    try { return await operation(request.signal) }
    catch (cause) { if (cause.status === 401) onAuthenticationExpired(); throw cause }
    finally {
      controllers.delete(request)
      treeMutation.value = null
      catalogRevision++
      treeVersions.set(id, (treeVersions.get(id) || 0) + 1)
      if (!disposed && !removedTreeIds.has(id) && !pausedQueues.has(id) && !trees.value.find(item => item.id === id)?.nodes.some(node => node.status === 'generating')) {
        const next = queuedByTree.value[id]?.[0]
        if (next) void dispatchQueued(id, next.id, false)
      }
    }
  }
  async function renameTree(id, name) {
    name = validateTreeName(name)
    return mutateTree(id, 'rename', async signal => {
      const updated = await api.renameTree(id, name, { signal })
      if (disposed) return false
      const source = trees.value.find(item => item.id === id)
      if (source) source.title = updated.name
      return true
    })
  }
  async function deleteTree(id) {
    return mutateTree(id, 'delete', async signal => {
      pausedQueues.add(id)
      await api.deleteTree(id, { signal })
      if (disposed) return false
      removedTreeIds.add(id)
      const source = trees.value.find(item => item.id === id)
      const attachmentsToRelease = [...(source?.nodes.flatMap(node => node.attachments) || []), ...(queuedByTree.value[id] || []).flatMap(item => item.attachments)]
      for (const node of source?.nodes || []) streams.get(node.id)?.abort()
      for (const key of Object.keys(drafts.value)) if (key.startsWith(`${id}:`)) delete drafts.value[key]
      for (const key of Object.keys(attachmentDrafts.value)) if (key.startsWith(`${id}:`)) { attachmentsToRelease.push(...attachmentDrafts.value[key]); delete attachmentDrafts.value[key] }
      delete queuedByTree.value[id]
      if (treeId.value === id) newTree()
      trees.value = trees.value.filter(item => item.id !== id)
      for (const [key, url] of resourceUrls) if (key.startsWith(`${id}/`)) { URL.revokeObjectURL(url); urls.delete(url); resourceUrls.delete(key) }
      attachmentsToRelease.forEach(releaseUnusedAttachment)
      pausedQueues.delete(id)
      return true
    })
  }
  async function revalidate() {
    if (!active() || disposed) return
    if (!await loadTrees()) return
    if (!isNewExploration.value && tree.value.loaded) {
      try { await refreshTree(treeId.value) } catch (cause) { report(cause); return }
    }
    reconnect()
  }
  function resume() {
    clearInterval(clock)
    if (!active() || disposed) { stopStreams(); return }
    clock = setInterval(() => { for (const owner of trees.value) for (const node of owner.nodes) if (node.status === 'generating' && node.startedAt) node.elapsedMs = Math.max(0, Date.now() - node.startedAt) }, 1000)
    reconnect()
    if (!trees.value.length && !listLoading.value) void loadTrees()
  }
  watch(active, resume, { immediate: true, flush: 'sync' })
  onScopeDispose(() => { disposed = true; stopStreams(); controllers.forEach(request => request.abort()); controllers.clear(); urls.forEach(url => URL.revokeObjectURL(url)); resourceUrls.clear() })
  return { treeMutation, renameTree, deleteTree, revalidate, submissionUncertain, trees, tree, isNewExploration, selectedId, selectedNode, context, contextPath: path, branchAnchorId, draft, pending, reasoningEffort, canAdvance, advanceMode, queuedQuestions, sendQueued, removeQueued, attachments, convertingAttachments, attachmentError, addAttachments, removeAttachment, selectTree, selectNode, newTree, sendQuestion, stopAnswer, loading, listLoading, error, submitting, cancelling, connectionError, reconnect, loadTrees, canSteer, previewResource }
}
