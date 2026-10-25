import { t, localizedRef, uiText } from '../i18n/index.js'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { finalMessageSignature, readTreeStatusCache, writeTreeStatusCache } from '../services/treeStatusCache.js'
import { useReasoningPreference } from './useReasoningPreference.js'
import { getContextPath } from '../models/questionTree.js'
import { applyExplorationEvent, applyTurnSnapshot, makeLiveNode, normalizeExplorationTree, TERMINAL_TURNS } from '../models/explorationTree.js'
import { createExplorationApi, ExplorationError, isTreeId, validateTreeName, validateTurnInput } from '../services/explorationApi.js'
import { convertImageFileToPdf, isSupportedImage } from '../services/imagePdf.js'

export function useExplorationTrees({ api = createExplorationApi(), active = () => true, onAuthenticationExpired = () => {}, convertImage = convertImageFileToPdf, userId = '', statusStorage } = {}) {
  const trees = ref([]), treeId = ref('__new-exploration__'), selectedId = ref(null), branchAnchorId = ref(null)
  const exploration = { id: '__new-exploration__', get title() { return t('开始新探索') }, nodes: [], mainLeafId: null, loaded: true }
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
  const reasoningEffort = useReasoningPreference(), advanceEnabled = ref(false)
  const canAdvance = computed(() => Boolean(selectedNode.value?.status !== 'generating' && selectedNode.value?.kind === 'task' && selectedNode.value.branchId === 'main' && selectedId.value === tree.value.mainLeafId))
  // 空探索的首问固定建立主干，界面与实际提交模式保持一致。
  const advanceMode = computed({ get: () => Boolean(tree.value.loaded && !tree.value.nodes.length) || canAdvance.value && advanceEnabled.value, set: value => { advanceEnabled.value = canAdvance.value && Boolean(value) } })
  watch([treeId, selectedId], () => { advanceEnabled.value = false }, { flush: 'sync' })
  const loading = ref(false), listLoading = ref(false), error = localizedRef('')
  const submittingTrees = ref(new Set()), cancellingTrees = ref(new Set()), uncertainTrees = ref(new Set())
  const submitting = computed(() => submittingTrees.value.has(treeId.value))
  const cancelling = computed(() => cancellingTrees.value.has(treeId.value))
  const submissionUncertain = computed(() => uncertainTrees.value.has(treeId.value))
  const unreadTreeIds = ref(new Set()), runningTreeIds = ref(new Set())
  const unreadNodesByTree = new Map(), runningVersions = new Map(), observedFinals = new Map(), readFinalsByTree = new Map()
  let statusSaveTimer = null
  let catalogTimer = null, catalogRequest = null, pollFailures = 0, catalogAuthBlocked = false
  for (const saved of readTreeStatusCache(userId, statusStorage)) {
    if (saved.running) runningTreeIds.value.add(saved.id)
    if (saved.unread.length) { unreadNodesByTree.set(saved.id, new Set(saved.unread)); unreadTreeIds.value.add(saved.id) }
    if (saved.baseline !== null) observedFinals.set(saved.id, new Map(saved.baseline))
    if (saved.read.length) readFinalsByTree.set(saved.id, new Map(saved.read))
  }
  const treeMutation = ref(null)
  const attachmentError = localizedRef(''), convertingAttachments = ref(false), connectionError = localizedRef('')
  const pending = computed(() => {
    const node = tree.value.nodes.find(node => node.kind === 'task' && node.status === 'generating')
    return node ? { treeId: tree.value.id, nodeId: node.id, canInterrupt: node.canInterrupt } : null
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
    error.value = cause?.message ? cause : uiText('问答服务暂不可用，请重试')
  }
  function findNode(owner, id) { return trees.value.find(item => item.id === owner)?.nodes.find(node => node.id === id) }
  function makeUrl(blob) { const url = URL.createObjectURL(blob); urls.add(url); return url }
  function saveStatusCache() {
    clearTimeout(statusSaveTimer)
    const ids = new Set([...runningTreeIds.value, ...unreadTreeIds.value, ...observedFinals.keys(), ...readFinalsByTree.keys()])
    writeTreeStatusCache(userId, [...ids].map(id => ({
      id, running: runningTreeIds.value.has(id), unread: [...(unreadNodesByTree.get(id) || [])].slice(-200),
      baseline: observedFinals.has(id) ? [...observedFinals.get(id)].slice(-200) : null,
      read: [...(readFinalsByTree.get(id) || [])].slice(-200),
    })), statusStorage)
  }
  function scheduleStatusSave() {
    if (!userId) return
    clearTimeout(statusSaveTimer)
    statusSaveTimer = setTimeout(saveStatusCache, 100)
  }
  function catalogVisible() { return active() && !disposed && !globalThis.document?.hidden }
  function scheduleCatalogPoll() {
    clearTimeout(catalogTimer)
    if (!catalogVisible() || catalogAuthBlocked) return
    catalogTimer = setTimeout(() => { void loadTrees({ background: true }) }, Math.min(30000, 5000 * 3 ** pollFailures))
  }
  function setRunning(id, running) {
    runningVersions.set(id, (runningVersions.get(id) || 0) + 1)
    if (running) runningTreeIds.value.add(id)
    else runningTreeIds.value.delete(id)
    scheduleStatusSave()
  }
  function updateLocalRunning(id) {
    const owner = trees.value.find(item => item.id === id)
    const running = Boolean(owner?.nodes.some(node => node.turnStatus === 'processing'))
    if (running && !observedFinals.has(id)) observedFinals.set(id, finalMessages(owner))
    setRunning(id, running)
  }
  function finalMessages(owner) {
    return new Map((owner?.nodes || []).flatMap(node => (node.publicMessages || [])
      .filter(message => message.kind === 'final' && message.status === 'completed')
      .map(message => [`${node.id}:${message.id}`, { nodeId: node.id, signature: finalMessageSignature(message.text) }])).slice(-200))
  }
  async function reconcileCatalog(list, signal) {
    for (const item of list) {
      if (signal.aborted || !catalogVisible()) return
      const owner = trees.value.find(tree => tree.id === item.id)
      if (!owner || removedTreeIds.has(item.id)) continue
      const running = runningTreeIds.value.has(item.id)
      const subscribed = owner.nodes.some(node => streams.has(node.id))
      if (running && !observedFinals.has(item.id)) {
        // 首次发现其他窗口发起的任务，建立最终消息基线，不将旧历史当新消息。
        const loaded = owner.loaded ? owner : await refreshTree(item.id)
        if (loaded) observedFinals.set(item.id, finalMessages(loaded))
      } else if (!running && observedFinals.has(item.id)) {
        const baseline = observedFinals.get(item.id)
        if (!subscribed) {
          const loaded = await refreshTree(item.id)
          if (loaded && !signal.aborted) for (const [key, message] of finalMessages(loaded)) {
            if (baseline.get(key)?.signature !== message.signature) markFinalOutput(item.id, message.nodeId)
          }
        }
        observedFinals.delete(item.id)
      }
    }
  }
  async function loadTrees({ background = false } = {}) {
    if (catalogRequest || background && catalogAuthBlocked) return false
    if (submittingTrees.value.size || treeMutation.value || disposed || background && !catalogVisible()) { scheduleCatalogPoll(); return false }
    if (!background) { listLoading.value = true; error.value = ''; catalogAuthBlocked = false }
    const request = controller(), revision = catalogRevision, versions = new Map(runningVersions)
    catalogRequest = request
    try {
      const list = await api.listTrees({ signal: request.signal })
      if (disposed || request.signal.aborted || revision !== catalogRevision) return false
      pollFailures = 0
      if (!background) uncertainTrees.value.delete(exploration.id)
      const previous = new Map(trees.value.map(item => [item.id, item]))
      trees.value = list.map(item => {
        if ((versions.get(item.id) || 0) === (runningVersions.get(item.id) || 0)) {
          if (item.has_running_task === true) runningTreeIds.value.add(item.id)
          else runningTreeIds.value.delete(item.id)
        }
        const owner = previous.get(item.id) || { id: item.id, nodes: [], mainLeafId: null, loaded: false }
        owner.title = item.name
        return owner
      })
      const ids = new Set(list.map(item => item.id))
      for (const id of runningTreeIds.value) if (!ids.has(id)) runningTreeIds.value.delete(id)
      for (const id of unreadTreeIds.value) if (!ids.has(id)) { unreadTreeIds.value.delete(id); unreadNodesByTree.delete(id) }
      for (const id of observedFinals.keys()) if (!ids.has(id)) observedFinals.delete(id)
      for (const id of readFinalsByTree.keys()) if (!ids.has(id)) readFinalsByTree.delete(id)
      if (!isNewExploration.value && !ids.has(treeId.value)) newTree()
      if (!background) listLoading.value = false
      await reconcileCatalog(list, request.signal)
      scheduleStatusSave()
      return true
    } catch (cause) {
      if (request.signal.aborted) return false
      pollFailures = Math.min(2, pollFailures + 1)
      if (cause.status === 401) catalogAuthBlocked = true
      if (!background || cause.status === 401) report(cause)
      return false
    } finally {
      controllers.delete(request)
      if (catalogRequest === request) catalogRequest = null
      if (!background) listLoading.value = false
      scheduleCatalogPoll()
    }
  }
  async function refreshTree(id) {
    if (removedTreeIds.has(id)) return null
    if (treeMutation.value?.id === id && treeMutation.value.type === 'delete') return trees.value.find(item => item.id === id) || null
    const request = controller(), version = treeVersions.get(id) || 0
    try {
      const normalized = normalizeExplorationTree(await api.openTree(id, { signal: request.signal }))
      if (disposed || removedTreeIds.has(id)) return null
      if (version !== (treeVersions.get(id) || 0)) return trees.value.find(item => item.id === id) || null
      uncertainTrees.value.delete(id)
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
      // open 是历史快照，保留当前屏幕尚未消费的新输出入场标记。
      for (const node of normalized.nodes) {
        const existing = old?.nodes.find(item => item.id === node.id)
        if (!existing) continue
        node.revealAnswer = Boolean(existing.revealAnswer)
        for (const step of node.process) if (existing.process.some(item => item.id === step.id && item.reveal)) step.reveal = true
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
  function recordReadFinals(owner, nodeIds) {
    const read = readFinalsByTree.get(owner) || new Map()
    let changed = false
    for (const [key, message] of finalMessages(trees.value.find(item => item.id === owner))) {
      if (nodeIds.has(message.nodeId) && read.get(key) !== message.signature) { read.set(key, message.signature); changed = true }
    }
    if (changed) { readFinalsByTree.set(owner, read); scheduleStatusSave() }
  }
  function markFinalOutput(owner, nodeId) {
    if (active() && treeId.value === owner && !globalThis.document?.hidden && !loading.value && context.value.some(node => node.id === nodeId)) {
      recordReadFinals(owner, new Set([nodeId])); return
    }
    const messages = [...finalMessages(trees.value.find(item => item.id === owner))].filter(([, message]) => message.nodeId === nodeId)
    if (messages.length && messages.every(([key, message]) => readFinalsByTree.get(owner)?.get(key) === message.signature)) return
    if (!unreadNodesByTree.has(owner)) unreadNodesByTree.set(owner, new Set())
    unreadNodesByTree.get(owner).add(nodeId)
    unreadTreeIds.value.add(owner)
    scheduleStatusSave()
  }
  function acknowledgeVisibleTree() {
    if (!active() || globalThis.document?.hidden || loading.value) return
    const nodes = new Set(context.value.map(node => node.id))
    recordReadFinals(treeId.value, nodes)
    const unread = unreadNodesByTree.get(treeId.value)
    if (!unread) return
    for (const id of nodes) unread.delete(id)
    if (!unread.size) { unreadNodesByTree.delete(treeId.value); unreadTreeIds.value.delete(treeId.value) }
    scheduleStatusSave()
  }
  watch([() => active(), treeId, selectedId, loading], acknowledgeVisibleTree)
  function catalogVisibilityChanged() {
    acknowledgeVisibleTree()
    clearTimeout(catalogTimer)
    if (!catalogVisible()) { saveStatusCache(); catalogRequest?.abort() }
    else void loadTrees({ background: true })
  }
  globalThis.document?.addEventListener?.('visibilitychange', catalogVisibilityChanged)
  globalThis.addEventListener?.('pagehide', saveStatusCache)
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
            const previousFinals = new Map(node.publicMessages.filter(message => message.kind === 'final' && message.status === 'completed').map(message => [message.id, message.text]))
            applyTurnSnapshot(node, snapshot)
            updateLocalRunning(owner)
            if (node.publicMessages.some(message => message.kind === 'final' && message.status === 'completed' && previousFinals.get(message.id) !== message.text)) markFinalOutput(owner, id)
          }
          if (!TERMINAL_TURNS.has(node.turnStatus)) await api.events(owner, id, {
            signal: request.signal, lastEventId: node.lastSequence,
            onOpen: () => { connectionError.value = '' },
            onEvent: frame => {
              const current = findNode(owner, id)
              if (!current) return false
              const applied = applyExplorationEvent(current, frame, { reveal: active() && treeId.value === owner && context.value.some(node => node.id === id) && !globalThis.document?.hidden })
              if (applied && frame.event === 'turn.status') updateLocalRunning(owner)
              if (applied && frame.event === 'message.completed' && frame.data.message_kind === 'final' && frame.data.status !== 'interrupted') markFinalOutput(owner, id)
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
      if (!ended) throw new ExplorationError(uiText('连接已中断，任务可能仍在执行，请重新连接'))
    } catch (cause) {
      if (!request.signal.aborted && !disposed && !removedTreeIds.has(owner) && !(treeMutation.value?.id === owner && treeMutation.value.type === 'delete')) {
        connectionError.value = cause.message ? cause : uiText('连接已中断，请重新连接')
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
    if (!owner?.loaded) throw new ExplorationError(uiText('请先选择问答树'))
    const parent = owner.nodes.find(node => node.id === item.parentId)
    const mode = supersedes ? supersedes.pathType === 'main' ? 'main' : 'branch' : !owner.nodes.length ? 'main' : item.advanceMode ? 'main' : 'branch'
    if (!supersedes && owner.nodes.length && (!parent || parent.kind !== 'task' || parent.status === 'generating')) throw new ExplorationError(uiText('请等待所选任务结束后继续'))
    if (!supersedes && mode === 'main' && owner.nodes.length && (owner.mainLeafId !== item.parentId || parent.branchId !== 'main')) throw new ExplorationError(uiText('推进位置已变化，请重新选择主干末尾'))
    const input = { question: item.question, thinkingEffort: item.reasoningEffort, mode, selectedNodeId: item.parentId, supersedesTurnId: supersedes?.id, attachments: item.attachments.map(file => file.file), localAttachments: item.attachments }
    validateTurnInput(input)
    const request = controller()
    let response
    try { response = await api.createTurn(owner.id, input, { signal: request.signal }) }
    catch (cause) {
      if (!cause.status || cause.status >= 500) { uncertainTrees.value.add(item.treeId); throw new ExplorationError(uiText('任务提交结果尚未确认，请重新加载问答树核对后再发送'), cause.status) }
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
    const key = draftKey.value, submissionOwner = treeId.value
    const item = { id: crypto.randomUUID(), treeId: treeId.value, parentId: selectedId.value, question: draft.value.trim() || t('请分析附件图片。'), attachments: [...attachments.value], reasoningEffort: reasoningEffort.value, advanceMode: advanceMode.value }
    error.value = ''
    try {
      validateTurnInput({ question: item.question, attachments: item.attachments.map(file => file.file), thinkingEffort: item.reasoningEffort, mode: item.advanceMode ? 'main' : 'branch' })
      if (pending.value || queuedQuestions.value.length) { (queuedByTree.value[item.treeId] ||= []).push(item) }
      else {
        submittingTrees.value.add(submissionOwner)
        if (isNewExploration.value) {
          const request = controller()
          let created
          try { created = await api.createTree(undefined, { signal: request.signal }) }
          catch (cause) {
            if (!cause.status || cause.status >= 500) { uncertainTrees.value.add(submissionOwner); throw new ExplorationError(uiText('探索创建结果尚未确认，请重新加载列表核对后再发送'), cause.status) }
            throw cause
          }
          finally { controllers.delete(request) }
          if (!isTreeId(created?.id) || typeof created.name !== 'string') throw new ExplorationError(uiText('创建探索响应无效，请刷新列表核对'))
          if (disposed) return false
          const owner = { id: created.id, title: created.name, nodes: [], mainLeafId: null, loaded: true }
          catalogRevision++; trees.value.unshift(owner); item.treeId = owner.id; submittingTrees.value.add(owner.id)
          // 创建成功但登记失败时继续使用该空树，避免重试重复创建。
          if (draftKey.value === key) { treeId.value = owner.id; selectedId.value = null; drafts.value[draftKey.value] = drafts.value[key]; attachmentDrafts.value[draftKey.value] = attachmentDrafts.value[key]; delete drafts.value[key]; delete attachmentDrafts.value[key] }
        }
        if (!await startTask(item)) return false
      }
      delete drafts.value[key]; delete attachmentDrafts.value[key]
      if (key.startsWith(exploration.id)) { delete drafts.value[`${item.treeId}:root`]; delete attachmentDrafts.value[`${item.treeId}:root`] }
      return true
    } catch (cause) { report(cause); return false }
    finally { submittingTrees.value.delete(submissionOwner); submittingTrees.value.delete(item.treeId) }
  }
  async function stopAnswer() {
    if (!pending.value || cancelling.value || !pending.value.canInterrupt) return
    const job = pending.value, request = controller()
    cancellingTrees.value.add(job.treeId); pausedQueues.add(job.treeId); error.value = ''
    try {
      let snapshot
      try { snapshot = await api.cancel(job.treeId, job.nodeId, { signal: request.signal }) }
      catch (cause) { if (cause.status !== 409) throw cause; snapshot = await api.snapshot(job.treeId, job.nodeId, { signal: request.signal }) }
      const node = findNode(job.treeId, job.nodeId)
      if (node) { applyTurnSnapshot(node, snapshot); updateLocalRunning(job.treeId) }
      if (TERMINAL_TURNS.has(snapshot.status)) { streams.get(job.nodeId)?.abort(); await refreshTree(job.treeId) }
    } catch (cause) { report(cause) }
    finally { controllers.delete(request); cancellingTrees.value.delete(job.treeId) }
  }
  async function dispatchQueued(owner, id, steer) {
    if (treeMutation.value || uncertainTrees.value.has(owner) || disposed || submittingTrees.value.has(owner)) return false
    const queue = queuedByTree.value[owner] || [], item = queue.find(entry => entry.id === id)
    const running = trees.value.find(entry => entry.id === owner)?.nodes.find(node => node.status === 'generating')
    if (!item || running && (!steer || !running.canInterrupt || !running.registered && running.turnStatus !== 'pending_activation' || item.parentId !== running.id)) return false
    submittingTrees.value.add(owner); error.value = ''
    try {
      const node = await startTask(item, steer, running)
      if (!node) return false
      queuedByTree.value[owner] = queue.filter(entry => entry.id !== id)
      for (const entry of queuedByTree.value[owner]) if (entry.parentId === item.parentId) { entry.parentId = node.id; entry.advanceMode = node.branchId === 'main' && node.advanceMode }
      return true
    } catch (cause) { report(cause); return false }
    finally { submittingTrees.value.delete(owner) }
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
        if (!isSupportedImage(file)) { failures.push(uiText('{value0}：仅支持图片', { value0: file.name })); continue }
        const list = attachmentDrafts.value[key] || [], sourceKey = JSON.stringify([file.name, file.size, file.lastModified])
        if (list.some(item => item.sourceKey === sourceKey)) continue
        if (list.length >= 10) { failures.push(uiText('每次最多 10 个附件')); break }
        try {
          const pdf = await convertImage(file)
          if (disposed) break
          // 转换期间用户可能移除附件；按最新草稿提交，并替换数组以确保首次添加也触发渲染。
          const current = attachmentDrafts.value[key] || []
          if (current.some(item => item.sourceKey === sourceKey)) continue
          if (current.length >= 10) { failures.push(uiText('每次最多 10 个附件')); break }
          if (pdf.size > 10 * 1024 * 1024 || current.reduce((total, item) => total + item.file.size, pdf.size) > 20 * 1024 * 1024) { failures.push(uiText('{value0}：PDF 超出大小限制', { value0: file.name })); continue }
          attachmentDrafts.value[key] = [...current, { id: crypto.randomUUID(), sourceKey, file: pdf, name: pdf.name, url: makeUrl(pdf), type: 'images' }]
        } catch { failures.push(uiText('{value0}：转换 PDF 失败', { value0: file.name })) }
      }
    } finally { if (!disposed) { convertingAttachments.value = false; attachmentError.value = failures } }
  }
  function removeAttachment(id) {
    const removed = attachments.value.find(item => item.id === id)
    attachmentDrafts.value[draftKey.value] = attachments.value.filter(item => item.id !== id)
    releaseUnusedAttachment(removed)
  }
  async function previewResource(item, signal) {
    if (item.url) return item.url
    if (item.type !== 'images') throw new ExplorationError(uiText('此附件暂不支持 PDF 预览'))
    const key = `${item.treeId}/${item.fileId}`
    if (resourceUrls.has(key)) return resourceUrls.get(key)
    try {
      const blob = await api.attachment(item.treeId, item.fileId, { signal })
      if (disposed || removedTreeIds.has(item.treeId)) return ''
      const url = makeUrl(blob); resourceUrls.set(key, url); return url
    } catch (cause) { if (cause.status === 401) onAuthenticationExpired(); throw cause }
  }
  async function mutateTree(id, type, operation) {
    if (disposed || treeMutation.value || submittingTrees.value.size || cancellingTrees.value.size || loading.value || listLoading.value || convertingAttachments.value) throw new ExplorationError(uiText('当前操作尚未完成，请稍后重试'))
    if (!trees.value.some(item => item.id === id) || removedTreeIds.has(id)) throw new ExplorationError(uiText('问答树不存在'), 404)
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
      unreadTreeIds.value.delete(id); unreadNodesByTree.delete(id); observedFinals.delete(id); readFinalsByTree.delete(id); runningTreeIds.value.delete(id); uncertainTrees.value.delete(id)
      if (treeId.value === id) newTree()
      trees.value = trees.value.filter(item => item.id !== id)
      for (const [key, url] of resourceUrls) if (key.startsWith(`${id}/`)) { URL.revokeObjectURL(url); urls.delete(url); resourceUrls.delete(key) }
      attachmentsToRelease.forEach(releaseUnusedAttachment)
      pausedQueues.delete(id)
      scheduleStatusSave()
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
    clearTimeout(catalogTimer)
    if (!active() || disposed) { catalogRequest?.abort(); stopStreams(); return }
    clock = setInterval(() => { for (const owner of trees.value) for (const node of owner.nodes) if (node.status === 'generating' && node.startedAt) node.elapsedMs = Math.max(0, Date.now() - node.startedAt) }, 1000)
    reconnect()
    if (catalogVisible()) void loadTrees({ background: trees.value.length > 0 })
  }
  watch(active, resume, { immediate: true, flush: 'sync' })
  onScopeDispose(() => { globalThis.removeEventListener?.('pagehide', saveStatusCache); globalThis.document?.removeEventListener?.('visibilitychange', catalogVisibilityChanged); disposed = true; saveStatusCache(); clearTimeout(catalogTimer); catalogRequest?.abort(); stopStreams(); controllers.forEach(request => request.abort()); controllers.clear(); urls.forEach(url => URL.revokeObjectURL(url)); resourceUrls.clear() })
  return { runningTreeIds, unreadTreeIds, treeMutation, renameTree, deleteTree, revalidate, submissionUncertain, trees, tree, isNewExploration, selectedId, selectedNode, context, contextPath: path, branchAnchorId, draft, pending, reasoningEffort, canAdvance, advanceMode, queuedQuestions, sendQueued, removeQueued, attachments, convertingAttachments, attachmentError, addAttachments, removeAttachment, selectTree, selectNode, newTree, sendQuestion, stopAnswer, loading, listLoading, error, submitting, cancelling, connectionError, reconnect, loadTrees, canSteer, previewResource }
}
