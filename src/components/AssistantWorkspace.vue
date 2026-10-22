<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import QuestionTree from './QuestionTree.vue'
import QuestionTreeSelect from './QuestionTreeSelect.vue'
import HandwritingPrompt from './HandwritingPrompt.vue'
import PdfPreviewOverlay from './PdfPreviewOverlay.vue'
import AdvanceModeSwitch from './AdvanceModeSwitch.vue'
import MarkdownMessage from './MarkdownMessage.vue'
import AnswerProcess from './AnswerProcess.vue'
import DeleteQuestionTreeDialog from './DeleteQuestionTreeDialog.vue'
import { useExplorationTrees } from '../composables/useExplorationTrees.js'
import { useAssistantPanelResize } from '../composables/useAssistantPanelResize.js'
import { createMessageScrollFollower } from '../services/messageScrollFollower.js'
import { clipboardFiles } from '../services/clipboardFiles.js'

const props = defineProps({ active: Boolean, user: Object })
const emit = defineEmits(['authentication-expired'])
const fontSizeKey = 'knowledge-accumulation.assistant.font-size'
function readFontSize() {
  try {
    const value = Number(localStorage.getItem(fontSizeKey))
    if (Number.isInteger(value) && value >= 12 && value <= 20) return value
  } catch { /* 浏览器禁用存储时仍可调整本次阅读字号。 */ }
  return 13
}
const fontSize = ref(readFontSize())
function changeFontSize(value) {
  fontSize.value = Math.max(12, Math.min(20, value))
  try { localStorage.setItem(fontSizeKey, String(fontSize.value)) } catch { /* 本地存储不可用不阻断阅读。 */ }
}
const { workspaceElement, chatElement, resizeHandle, chatWidth, displayedWidth, bounds, resizing, stacked, startResize, moveResize, finishResize, resizeWithKeyboard, resetWidth } = useAssistantPanelResize(() => props.active)
const { trees, tree, isNewExploration, selectedId, selectedNode, context, branchAnchorId, draft, pending, reasoningEffort, canAdvance, advanceMode, queuedQuestions, sendQueued, removeQueued, attachments, convertingAttachments, attachmentError, addAttachments, removeAttachment, selectTree, selectNode, newTree, sendQuestion, stopAnswer, treeMutation, renameTree, deleteTree, revalidate, submissionUncertain, contextPath, loading, listLoading, error, submitting, cancelling, connectionError, reconnect, loadTrees, canSteer, previewResource } = useExplorationTrees({ active: () => props.active, onAuthenticationExpired: () => emit('authentication-expired') })
watch(() => props.user, () => { void revalidate() })
const deleteTarget = ref(null)
const deleteError = ref('')
const treeActionsBusy = computed(() => Boolean(treeMutation.value || submitting.value || cancelling.value || convertingAttachments.value || loading.value || listLoading.value))
function requestTreeDelete(id) {
  if (treeActionsBusy.value) return
  deleteTarget.value = trees.value.find(item => item.id === id) || null
  deleteError.value = ''
}
function closeTreeDelete() { if (treeMutation.value?.type !== 'delete') { deleteTarget.value = null; deleteError.value = '' } }
async function confirmTreeDelete(confirmation) {
  const target = deleteTarget.value
  if (!target || treeActionsBusy.value || confirmation !== `我确认删除${target.title}`) return
  deleteError.value = ''
  try { if (await deleteTree(target.id)) closeTreeDelete() }
  catch (cause) { if (cause.name !== 'AbortError') deleteError.value = cause.message || '删除尚未完成，请重试' }
}
watch(() => props.active, active => { if (!active) closeTreeDelete() })
const messages = ref(null)
const messageContent = ref(null)
const messageElements = new Map()
let scrollFollower = null
let positioningRevision = 0
let needsPositioning = true
let scrollDisposed = false
function setMessageElement(id, element) {
  if (element) messageElements.set(id, element)
  else messageElements.delete(id)
}
const composer = ref(null)
const attachmentInput = ref(null)
const previewAttachment = ref(null)
const previewLoading = ref(false)
const previewError = ref('')
let previewRequest
watch(previewAttachment, item => { if (!item) { previewRequest?.abort(); previewLoading.value = false; previewError.value = '' } })
async function previewFile(item) {
  previewRequest?.abort()
  const request = new AbortController()
  previewRequest = request
  previewAttachment.value = { ...item }
  previewLoading.value = true
  previewError.value = ''
  try {
    const url = await previewResource(item, request.signal)
    if (!request.signal.aborted && previewRequest === request) previewAttachment.value = { ...item, url }
  } catch (cause) {
    if (!request.signal.aborted) previewError.value = cause.message || '无法加载附件'
  } finally { if (previewRequest === request) previewLoading.value = false }
}
function removeFile(id) {
  if (previewAttachment.value?.id === id) previewAttachment.value = null
  removeAttachment(id)
}
watch([() => props.active, () => tree.value.id, selectedId, branchAnchorId], () => { previewAttachment.value = null })
const copiedId = ref(null)
const notice = ref('')
const answerDisplayStates = ref({})
let copyTimer
const contextIds = computed(() => contextPath.value.map(node => node.id))
const hasContinuation = computed(() => tree.value.nodes.some(node => node.parentId === selectedId.value && node.branchId === selectedNode.value?.branchId))
const isBranching = computed(() => Boolean(branchAnchorId.value) || hasContinuation.value)
const pendingHere = computed(() => pending.value?.treeId === tree.value.id)
const hasComposerInput = computed(() => Boolean(draft.value.trim() || attachments.value.length))
const stopMode = computed(() => pendingHere.value && !hasComposerInput.value)

async function positionCurrentTask() {
  needsPositioning = true
  const revision = ++positioningRevision
  await nextTick()
  if (scrollDisposed || !props.active || revision !== positioningRevision || !scrollFollower) return
  scrollFollower.clearPin()
  const element = messageElements.get(selectedId.value)
  if (element) scrollFollower.pin(element, { follow: selectedNode.value?.status === 'generating' })
  else scrollFollower.resume()
  needsPositioning = false
}
async function activateScrollFollower() {
  await nextTick()
  if (scrollDisposed || !props.active || !messages.value || !messageContent.value) return
  if (scrollFollower) scrollFollower.activate()
  else scrollFollower = createMessageScrollFollower(messages.value, messageContent.value)
  if (needsPositioning) void positionCurrentTask()
}
function suspendScrollFollower() { scrollFollower?.suspend() }
watch([() => tree.value.id, selectedId], positionCurrentTask, { flush: 'post' })
watch(() => props.active, active => { if (active) void activateScrollFollower(); else suspendScrollFollower() })
watch(() => [selectedNode.value?.id, selectedNode.value?.process?.map(step => `${step.id}:${step.status}`).join('|'), Boolean(selectedNode.value?.answer)], (next, previous) => {
  if (next[0] === previous?.[0] && props.active) scrollFollower?.transitionStatus()
})
onMounted(activateScrollFollower)
onActivated(activateScrollFollower)
onDeactivated(suspendScrollFollower)

async function createTree() { newTree(); await nextTick(); composer.value?.focus() }
function prepareAttachmentLeave(element) {
  element.style.width = `${element.getBoundingClientRect().width}px`
}
function chooseAttachments(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  void addAttachments(files)
}
function handleComposerPaste(event) {
  const files = clipboardFiles(event.clipboardData)
  if (!files.length) return
  // 混合粘贴保留原生文字插入、选区和撤销；仅文件粘贴阻止浏览器默认行为。
  if (!event.clipboardData.getData('text/plain')) event.preventDefault()
  if (!props.active || submitting.value || convertingAttachments.value) {
    attachmentError.value = '请等待当前操作完成后重新粘贴附件。'
    return
  }
  void addAttachments(files)
}
function onAnswerDisplay(node, state) {
  answerDisplayStates.value[node.id] = state
}
async function adjustQueued(id) { await sendQueued(id) }
async function send() { await sendQuestion() }
function handleInputKey(event) {
  if (event.key === 'Enter' && event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault()
    send()
  }
}
async function copyAnswer(node) {
  try {
    await navigator.clipboard.writeText(node.answer)
    copiedId.value = node.id
    notice.value = '回答已复制'
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copiedId.value = null; notice.value = '' }, 2000)
  } catch {
    notice.value = '复制未成功，请选择回答文本手动复制。'
  }
}
function attachmentFormat(item) {
  if (item.file?.type === 'application/pdf' || item.type === 'images') return 'PDF'
  const extension = (item.file?.name || item.name || '').match(/\.([a-z0-9]{1,8})$/i)?.[1]
  return extension ? extension.toUpperCase() : '附件'
}
function timeLabel(value) { return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) }
onBeforeUnmount(() => { scrollDisposed = true; ++positioningRevision; scrollFollower?.dispose(); messageElements.clear(); clearTimeout(copyTimer); previewRequest?.abort() })
</script>

<template>
  <div ref="workspaceElement" class="assistant-workspace" :class="{ 'is-resizing': resizing, 'is-stacked': stacked }" :style="chatWidth === null ? {} : { '--assistant-chat-width': `${chatWidth}px` }">
    <section id="assistant-chat-panel" ref="chatElement" class="agent-chat" aria-labelledby="agent-chat-title">
      <header class="agent-chat__header" :aria-busy="loading || listLoading">
        <div class="agent-chat__tree-picker">
          <span id="agent-chat-title">问答树选择</span>
          <QuestionTreeSelect :trees="trees" :model-value="isNewExploration ? '' : tree.id" :active="active" :busy="treeActionsBusy" :rename="renameTree" @update:model-value="selectTree" @create="createTree" @delete="requestTreeDelete" />
        </div>
        <div class="agent-chat__font-size" role="group" aria-label="问答字号调整">
          <button type="button" aria-label="缩小字号" title="缩小字号" :disabled="fontSize <= 12" @click="changeFontSize(fontSize - 1)">A<span aria-hidden="true">−</span></button>
          <button type="button" class="agent-chat__font-value" :aria-label="`当前字号 ${fontSize} 像素，点击恢复默认`" title="恢复默认字号" @click="changeFontSize(13)">{{ fontSize }}<span>px</span></button>
          <button type="button" aria-label="放大字号" title="放大字号" :disabled="fontSize >= 20" @click="changeFontSize(fontSize + 1)">A<span aria-hidden="true">+</span></button>
        </div>
        <span v-if="loading || listLoading" class="agent-chat__loading" role="status">{{ loading ? '正在加载问答记录…' : '正在加载问答树…' }}</span>
      </header>
      <div v-if="error" class="agent-chat__service-status is-error" role="alert"><span>{{ error }}</span><button type="button" :disabled="loading || listLoading || submitting" @click="connectionError ? reconnect() : isNewExploration ? loadTrees() : selectTree(tree.id)">{{ connectionError ? '重新连接' : '重新加载' }}</button></div>
      <div ref="messages" class="agent-chat__messages" tabindex="0" aria-label="从根到当前任务的问答记录">
        <div ref="messageContent" class="agent-chat__message-list" :style="{ '--chat-font-size': `${fontSize}px` }" :class="{ 'is-empty': !context.length }">
          <div v-if="!context.length && !loading && (isNewExploration || tree.loaded)" class="agent-chat__empty"><HandwritingPrompt :key="tree.id" :active="active" /></div>
          <article v-for="(node, index) in context" :key="node.id" :ref="element => setMessageElement(node.id, element)" :data-task-id="node.id" class="agent-chat__turn" :aria-label="`第 ${index + 1} 个问答任务`">
            <ul v-if="node.attachments?.length" class="agent-chat__sent-attachments" aria-label="用户消息附件">
              <li v-for="item in node.attachments" :key="item.id">
                <button type="button" class="agent-chat__file-card" :title="`预览附件：${item.file?.name || item.name}`" :aria-label="`预览附件：${item.file?.name || item.name}`" @click="previewFile(item)">
                  <span class="agent-chat__file-icon" aria-hidden="true"><svg viewBox="0 0 24 28"><path d="M14 2H5a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9Z" /><path d="M14 2v7h7M7 15h10M7 19h7" /></svg></span>
                  <span class="agent-chat__file-info"><span class="agent-chat__file-name">{{ item.file?.name || item.name }}</span><span class="agent-chat__file-format">{{ attachmentFormat(item) }} 文件</span></span>
                </button>
              </li>
            </ul>
            <div class="agent-chat__question"><p>{{ node.question }}</p></div>
            <AnswerProcess :task="node" :final-visible="Boolean(answerDisplayStates[node.id]?.text?.trim())" :active="active" @toggle="scrollFollower?.holdLayout()" />
            <div class="agent-chat__answer">
              <p v-if="node.status === 'generating' && !node.answer && !node.process?.length" class="agent-chat__thinking" :class="{ 'is-paused': !active }" role="status">正在思考</p>
              <MarkdownMessage class="agent-chat__answer-text" :beautify-links="node.status === 'complete'" :content="node.answer" :stream-state="node.status === 'generating' ? 'streaming' : node.status === 'complete' ? 'completed' : 'cancelled'" :animate="active" stabilize-height @display-state="onAnswerDisplay(node, $event)" />
              <span v-if="['cancelled', 'superseded', 'failed'].includes(node.status)" class="agent-chat__stopped">{{ node.error || (node.status === 'failed' ? '本次回答未完成' : node.supersededBy || node.status === 'superseded' ? '已调整方向' : '回答已停止') }}</span>
              <div v-if="node.status !== 'generating'" class="agent-chat__answer-actions">
                <button v-if="node.answer" type="button" :class="{ 'is-copied': copiedId === node.id }" :aria-label="copiedId === node.id ? '已复制回答' : '复制回答'" :title="copiedId === node.id ? '已复制' : '复制回答'" @click="copyAnswer(node)"><Transition name="copy-icon" mode="out-in"><svg v-if="copiedId !== node.id" key="copy" viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="9" height="10" rx="2" /><path d="M12 7V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3" /></svg><svg v-else key="copied" viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-9" /></svg></Transition></button>
                <time :datetime="node.createdAt">{{ timeLabel(node.createdAt) }}</time>
              </div>
            </div>
          </article>
        </div>
      </div>

      <form class="agent-chat__composer" @submit.prevent="send">

        <div class="agent-chat__composer-accessories">
          <TransitionGroup tag="ul" name="queued-prompt" class="agent-chat__prompt-queue" aria-label="待发送消息">
            <li v-for="item in queuedQuestions" :key="item.id" class="agent-chat__queued-prompt">
              <div class="agent-chat__queued-content"><span :title="item.question">{{ item.question }}</span><small v-if="item.attachments.length">{{ item.attachments.length }} 个附件</small></div>
              <button type="button" class="agent-chat__queue-steer" :disabled="Boolean(treeMutation) || submitting || Boolean(pending) && (!pendingHere || !canSteer || item.parentId !== pending.nodeId)" :title="pendingHere ? '立即提交这条问题，替代当前轮次' : '立即发送这条排队消息'" @click="adjustQueued(item.id)"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 16v-4a5 5 0 0 1 5-5h5M11 3l4 4-4 4" /></svg>{{ pendingHere ? '调整方向' : '立即发送' }}</button>
              <button type="button" class="agent-chat__queue-remove" :aria-label="`移除待发送消息：${item.question}`" @click="removeQueued(item.id)"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 5 6 6M11 5l-6 6" /></svg></button>
            </li>
          </TransitionGroup>
          <TransitionGroup tag="ul" name="attachment-chip" class="agent-chat__attachments agent-chat__attachments--floating" aria-label="已选附件" @before-leave="prepareAttachmentLeave">
            <li v-for="item in attachments" :key="item.id" class="agent-chat__attachment">
              <button type="button" class="agent-chat__attachment-name" :title="`预览附件：${(item.file?.name || item.name)}`" :aria-label="`预览附件：${(item.file?.name || item.name)}`" @click="previewFile(item)">{{ (item.file?.name || item.name) }}</button>
              <button type="button" :aria-label="`移除附件：${(item.file?.name || item.name)}`" @click="removeFile(item.id)"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 5 6 6M11 5l-6 6" /></svg></button>
            </li>
          </TransitionGroup>
        </div>
        <p v-if="attachmentError" class="agent-chat__attachment-error" role="alert">{{ attachmentError }}</p>
        <textarea :disabled="submitting || Boolean(treeMutation)" ref="composer" v-model="draft" aria-label="输入问题" :placeholder="isBranching ? '换一个角度，从这里继续探索…' : '有什么想了解的？'" rows="3" maxlength="20000" @keydown="handleInputKey" @paste="handleComposerPaste"></textarea>
        <div class="agent-chat__composer-actions">
          <div class="agent-chat__attachment-controls">
            <button class="agent-chat__attach" type="button" :disabled="Boolean(treeMutation) || submitting || convertingAttachments" aria-label="添加图片附件" title="添加图片，自动转为 PDF" @click="attachmentInput?.click()">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg><span v-if="attachments.length" aria-hidden="true">{{ attachments.length }}</span>
            </button>
          </div>
          <input ref="attachmentInput" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif" hidden @change="chooseAttachments" />
          <span role="status">{{ submitting ? '正在提交…' : cancelling ? '正在停止…' : convertingAttachments ? '正在转换为 PDF…' : pending && !pendingHere ? '另一棵问答树正在回答…' : pendingHere ? hasComposerInput ? 'Shift + Enter 加入队列' : '正在生成回答…' : 'Enter 换行 · Shift + Enter 发送' }}</span>
          <div class="agent-chat__submit-controls">
            <AdvanceModeSwitch v-model="advanceMode" :disabled="!canAdvance" :active="active" />
            <div class="agent-chat__reasoning-send">
            <div class="agent-chat__reasoning" :class="{ 'is-paused': !active }">
              <span aria-hidden="true">推理强度</span>
              <fieldset class="agent-chat__reasoning-options">
                <legend class="sr-only">推理强度</legend>
                <span class="agent-chat__reasoning-highlight" aria-hidden="true" :style="{ transform: `translateX(${['low', 'medium', 'xhigh'].indexOf(reasoningEffort) * 58}px)` }"></span>
                <label v-for="level in ['low', 'medium', 'xhigh']" :key="level" class="agent-chat__reasoning-option">
                  <input v-model="reasoningEffort" class="sr-only" type="radio" name="reasoning-effort" :value="level" />
                  <span>{{ level }}</span>
                </label>
              </fieldset>
            </div>
            <button v-if="stopMode" type="button" class="agent-chat__send" :disabled="Boolean(treeMutation) || cancelling || submitting || !pending?.canInterrupt" aria-label="停止回答" title="停止回答" @click="stopAnswer"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="6" width="8" height="8" rx="1" fill="currentColor" stroke="none" /></svg></button><button v-else type="submit" class="agent-chat__send" :disabled="Boolean(treeMutation) || submissionUncertain || submitting || listLoading || loading || !tree.loaded || !hasComposerInput || Boolean(pending) && !pendingHere || convertingAttachments" :aria-label="pendingHere || queuedQuestions.length ? '加入消息队列' : '发送问题'" :title="pendingHere || queuedQuestions.length ? '加入队列，等待当前轮次完成（Shift + Enter）' : '发送问题（Shift + Enter）'"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 15V5m-4 4 4-4 4 4" /></svg></button>
            </div>
          </div>
        </div>
      </form>
      <span class="sr-only" role="status">{{ notice || (selectedNode?.status === 'generating' ? '正在生成回答' : '当前路径已就绪') }}</span>
    </section>
    <button
      ref="resizeHandle" class="assistant-workspace__resize-handle" type="button" role="separator"
      aria-label="调整问答与问答树的宽度" aria-orientation="vertical" aria-controls="assistant-chat-panel assistant-tree-panel"
      :aria-valuemin="Math.round(bounds.min)" :aria-valuemax="Math.round(bounds.max)" :aria-valuenow="displayedWidth"
      :aria-valuetext="`问答窗口宽度 ${displayedWidth} 像素`" :style="{ left: `${displayedWidth}px` }"
      title="拖动调整宽度；方向键微调，双击恢复默认"
      @pointerdown="startResize" @pointermove="moveResize" @pointerup="finishResize" @pointercancel="finishResize" @lostpointercapture="finishResize"
      @keydown="resizeWithKeyboard" @dblclick="resetWidth"
    ><span aria-hidden="true"></span></button>
    <DeleteQuestionTreeDialog :open="Boolean(deleteTarget) && active" :name="deleteTarget?.title || ''" :busy="treeMutation?.type === 'delete'" :error="deleteError" @close="closeTreeDelete" @confirm="confirmTreeDelete" />
    <PdfPreviewOverlay :open="Boolean(previewAttachment) && active" :src="previewAttachment?.url || ''" :label="previewAttachment?.file?.name || previewAttachment?.name || ''" :loading="previewLoading" :error="previewError" @close="previewAttachment = null" />
    <QuestionTree id="assistant-tree-panel" :tree="tree" :selected-id="selectedId" :context-ids="contextIds" :active="active" @select="selectNode" @main-end="selectNode(tree.mainLeafId)" />
  </div>
</template>

<style scoped>
.agent-chat__loading { position: absolute; right: 30px; bottom: 0; color: #8b9a90; font-size: 11px; line-height: 18px; pointer-events: none; animation: agent-loading-appear .16s ease .3s both; }
@keyframes agent-loading-appear { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .agent-chat__loading { animation-duration: 0s; } }
.agent-chat__service-status { display: flex; align-items: center; justify-content: space-between; flex: none; gap: 12px; margin: 0 30px 10px; padding: 10px 12px; color: #789082; background: #ffffff80; border-radius: 10px; font-size: 12px; line-height: 1.6; }
.agent-chat__service-status.is-error { color: #9b655e; background: #fcf0edb3; }
.agent-chat__service-status button { flex: none; padding: 3px 6px; color: inherit; background: transparent; border: 0; text-decoration: underline; }
.assistant-workspace { position: relative; display: grid; grid-template-columns: minmax(360px, var(--assistant-chat-width, 1.08fr)) minmax(340px, 1fr); height: 100%; min-height: 540px; }
.assistant-workspace.is-resizing { cursor: col-resize; user-select: none; }
.assistant-workspace.is-resizing :deep(*) { cursor: col-resize !important; user-select: none; }
.assistant-workspace > :deep(.question-tree) { border-left: 0; }
.agent-chat::after { position: absolute; z-index: 9; top: 0; right: 0; bottom: 0; width: 4px; content: ''; pointer-events: none; background: linear-gradient(180deg, transparent, #ffffffb8 8%, #ffffffb8 92%, transparent) 1px 0 / 1px 100% no-repeat, linear-gradient(90deg, #81968b24 0%, #ffffffdc 42%, #f8fffca3 58%, #8ba0951f 100%); box-shadow: -1px 0 #72877d12, 2px 0 8px #728c801c; opacity: .88; mask: linear-gradient(180deg, #000 0, #000 calc(50% - 34px), transparent calc(50% - 34px), transparent calc(50% + 34px), #000 calc(50% + 34px), #000 100%); }
.assistant-workspace__resize-handle { position: absolute; z-index: 10; top: 50%; display: flex; align-items: center; justify-content: center; width: 18px; height: 82px; padding: 0; color: #6d7d75; cursor: col-resize; touch-action: none; background: transparent; border: 0; outline: 0; transform: translate(-50%, -50%); }
.assistant-workspace__resize-handle span { width: 8px; height: 38px; background: linear-gradient(180deg, #7b70c3, #579a84); border: 1px solid #ffffffb8; border-radius: 999px; box-shadow: inset 1px 0 #ffffff5c; opacity: .42; transition: width .22s, height .34s cubic-bezier(.16, 1, .3, 1), opacity .2s, box-shadow .26s, transform .26s cubic-bezier(.16, 1, .3, 1); }
.assistant-workspace__resize-handle:hover span, .assistant-workspace__resize-handle:focus-visible span, .is-resizing .assistant-workspace__resize-handle span { width: 10px; height: 46px; box-shadow: inset 1px 0 #ffffff8c, 0 0 10px #7168c35c, 0 0 18px #559a8442; opacity: .92; transform: scaleX(1.08); }
.assistant-workspace__resize-handle:active span, .is-resizing .assistant-workspace__resize-handle span { height: 50px; opacity: 1; }
.assistant-workspace.is-stacked { grid-template-columns: minmax(0, 1fr); height: auto; min-height: 100%; }
.is-stacked .agent-chat { height: 680px; }
.is-stacked .agent-chat::after { display: none; }
.is-stacked .assistant-workspace__resize-handle { display: none; }
.agent-chat { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
.agent-chat__header { position: relative; z-index: 11; display: flex; align-items: center; justify-content: space-between; flex: none; flex-wrap: wrap; gap: 12px; padding: 24px 30px 18px; }
.agent-chat__font-size { display: flex; align-items: center; flex: none; gap: 2px; margin-left: auto; padding: 3px; border: 1px solid #dce5dd; border-radius: 10px; background: #ffffff70; box-shadow: 0 2px 7px #49655206; }
.agent-chat__font-size button { display: flex; align-items: center; justify-content: center; gap: 1px; height: 28px; min-width: 28px; padding: 0 5px; border: 0; border-radius: 7px; background: transparent; color: #607969; font-size: 13px; transition: background .16s, color .16s; }
.agent-chat__font-size button:hover:not(:disabled) { background: #e4ece5; color: #34543f; }
.agent-chat__font-size button:focus-visible { outline: 2px solid #9285ba; outline-offset: 2px; }
.agent-chat__font-size button:disabled { opacity: .3; cursor: default; }
.agent-chat__font-size button > span { font-size: 10px; }
.agent-chat__font-size .agent-chat__font-value { min-width: 40px; font-size: 11px; font-variant-numeric: tabular-nums; }
.agent-chat__font-value > span { color: #94a299; }
.agent-chat__tree-picker { display: flex; align-items: center; gap: 14px; flex: 1 1 220px; min-width: 0; }
.agent-chat__tree-picker > :deep(.tree-select) { flex: 0 1 380px; min-width: 0; }
.agent-chat__tree-picker > span { flex: none; color: #7f9185; font-size: 12px; white-space: nowrap; }
button { font: inherit; cursor: pointer; }
.agent-chat__messages { position: relative; overflow-anchor: none; flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #b8c8bf55 transparent; }
.agent-chat__message-list { position: relative; display: flex; flex-direction: column; gap: 28px; min-height: var(--message-pinned-height, 100%); box-sizing: border-box; padding: 28px 30px 24px; }
.agent-chat__message-list.is-empty { padding: 0; }
.agent-chat__message-list.is-empty > .agent-chat__empty { flex: 1; }
.agent-chat__turn { flex-shrink: 0; }
.agent-chat__turn { min-width: 0; }
.agent-chat__question { display: flex; justify-content: flex-end; margin-bottom: 22px; }
.agent-chat__question p { max-width: 88%; margin: 0; padding: 12px 17px; color: #4e6355; background: #e7ede7bd; border: 1px solid #ffffff70; border-radius: 17px 17px 5px 17px; font-size: var(--chat-font-size, 13px); line-height: 1.8; overflow-wrap: anywhere; white-space: pre-wrap; }
.agent-chat__answer-text { padding: 0 2px; color: #59685e; }
.agent-chat__thinking { min-height: 24px; margin: 0; padding-inline: 2px; color: #95a098; font-size: 12px; line-height: 24px; animation: agent-thinking-highlight 2.8s ease-in-out infinite; }
.agent-chat__thinking.is-paused { animation-play-state: paused; }
@keyframes agent-thinking-highlight { 0%, 25%, 100% { color: #95a098; } 48%, 58% { color: #405b4a; } }
.agent-chat__stopped { display: block; margin-top: 10px; color: #aa9a84; font-size: 11px; }
.agent-chat__answer-actions {
  display: flex;
  gap: 2px;
  align-items: center;
  min-height: 28px;
  margin: 8px 0 0;
  color: #8d9691;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-2px);
  transition:
    opacity 0.18s,
    transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.agent-chat__answer:hover .agent-chat__answer-actions,
.agent-chat__answer:focus-within .agent-chat__answer-actions {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.agent-chat__answer-actions button {
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  padding: 0;
  color: inherit;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 7px;
  transition: color 0.18s, background-color 0.18s;
}

.agent-chat__answer-actions button:hover,
.agent-chat__answer-actions button:focus-visible {
  color: #3f4d46;
  background: #e9eeeb;
  outline: 0;
}

.agent-chat__answer-actions button.is-copied {
  color: #4f7d68;
  background: #e4eee9;
  animation: agent-copy-confirm 0.38s cubic-bezier(0.16, 1, 0.3, 1);
}

.agent-chat__answer-actions svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.45;
}

.copy-icon-enter-active {
  transition:
    opacity 0.18s ease-out,
    transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}

.copy-icon-leave-active {
  transition:
    opacity 0.12s ease-in,
    transform 0.14s ease-in;
}

.copy-icon-enter-from {
  opacity: 0;
  transform: scale(0.55) rotate(-12deg);
}

.copy-icon-leave-to {
  opacity: 0;
  transform: scale(0.72) rotate(8deg);
}

.agent-chat__answer-actions time {
  margin-left: 4px;
  font-size: 10px;
  white-space: nowrap;
}

@media (hover: none) {
  .agent-chat__answer-actions {
    opacity: 1;
    pointer-events: auto;
    transform: none;
  }
}

@keyframes agent-copy-confirm { 45% { transform: scale(.86); } }
@media (prefers-reduced-motion: reduce) {
  .agent-chat__answer-actions, .agent-chat__answer-actions button, .copy-icon-enter-active, .copy-icon-leave-active { transition: none; }
  .agent-chat__answer-actions button.is-copied { animation: none; }
}
.agent-chat__composer { position: relative; flex: none; margin: 0 20px 16px; padding: 12px 14px; background: #ffffffb8; border: 1px solid #ffffffed; border-radius: 19px; box-shadow: inset 0 1px #fff, 0 10px 28px #34473e14; }
.agent-chat__composer textarea { width: 100%; min-height: 56px; max-height: 160px; padding: 4px 3px; color: #34413a; resize: none; background: transparent; border: 0; outline: 0; font: inherit; font-size: 13px; line-height: 1.6; }
.agent-chat__composer textarea::placeholder { color: #a6afa8; }
.agent-chat__composer:focus-within { border-color: #becfc1; }
.agent-chat__attachment-controls { display: flex; flex: none; align-items: center; gap: 14px; }
.agent-chat__attach { position: relative; display: grid; place-items: center; flex: none; width: 36px; height: 36px; padding: 0; color: #56635c; background: #eef2f0; border: 1px solid #dfe6e2; border-radius: 50%; transition: color .22s, background-color .22s; }
.agent-chat__attach:hover:not(:disabled) { color: #344c41; background: #dfe9e4; }
.agent-chat__attach > svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; }
.agent-chat__attach > span { position: absolute; top: -4px; right: -4px; display: grid; place-items: center; min-width: 16px; height: 16px; padding: 0 4px; color: #fff; font-size: 9px; font-weight: 700; background: #7063d8; border: 2px solid #fff; border-radius: 999px; }
.agent-chat__attachments { display: flex; flex-wrap: nowrap; gap: 6px; min-width: 0; margin: 0 0 9px; padding: 2px 0; overflow-x: auto; overflow-y: hidden; list-style: none; scrollbar-width: none; }
.agent-chat__attachments::-webkit-scrollbar { display: none; }
.agent-chat__attachments:empty { display: none; }
.agent-chat__prompt-queue {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 158px;
  padding: 0 2px;
  margin: 0;
  overflow-y: auto;
  list-style: none;
  scrollbar-width: thin;
}
.agent-chat__prompt-queue:empty { display: none; }
.agent-chat__queued-prompt {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8px;
  padding: 9px 10px 9px 13px;
  background: #f3f5f3;
  border: 1px solid #dfe5df;
  border-radius: 13px;
  box-shadow: 0 3px 10px #253d2d08;
}
.agent-chat__queued-content { flex: 1; min-width: 0; color: #59665d; font-size: 12px; }
.agent-chat__queued-content > span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent-chat__queued-content small { display: inline-block; margin: 3px 8px 0 0; color: #8a968e; font-size: 10px; }
.agent-chat__queued-content small.is-error { color: #ad625a; }
.agent-chat__queue-steer,
.agent-chat__queue-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  gap: 4px;
  padding: 5px 7px;
  color: #5a6d60;
  font-size: 11px;
  background: transparent;
  border: 0;
  border-radius: 7px;
  cursor: pointer;
}
.agent-chat__queue-steer { background: #e6ece7; }
.agent-chat__queue-steer:hover:not(:disabled) { color: #2e4e3a; background: #dce6dd; }
.agent-chat__queue-remove { padding: 5px 3px; color: #929b95; }
.agent-chat__queue-remove:hover:not(:disabled) { color: #b25b53; background: #f4e4e1; }
.agent-chat__queue-steer:disabled,
.agent-chat__queue-remove:disabled { cursor: default; opacity: 0.45; }
.agent-chat__queue-steer svg,
.agent-chat__queue-remove svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.queued-prompt-enter-active,
.queued-prompt-leave-active,
.queued-prompt-move { transition: opacity 0.2s ease, transform 0.25s ease; }
.queued-prompt-enter-from,
.queued-prompt-leave-to { opacity: 0; transform: translateY(5px); }
@media (prefers-reduced-motion: reduce) {
  .queued-prompt-enter-active,
  .queued-prompt-leave-active,
  .queued-prompt-move { transition: none; }
}
.agent-chat__composer-accessories { position: absolute; z-index: 2; right: 0; bottom: calc(100% + 4px); left: 0; display: flex; flex-direction: column; gap: 6px; }
.agent-chat__attachments--floating { margin: 0; padding: 2px 14px 4px; -webkit-mask-image: linear-gradient(to right, transparent, #000 14px, #000 calc(100% - 14px), transparent); mask-image: linear-gradient(to right, transparent, #000 14px, #000 calc(100% - 14px), transparent); }
.attachment-chip-enter-active { transition: transform .4s cubic-bezier(.22, 1, .36, 1), opacity .3s ease; }
.attachment-chip-enter-from { opacity: 0; transform: translateX(28px); }
.attachment-chip-leave-active { box-sizing: border-box; overflow: hidden; pointer-events: none; transition: width .3s cubic-bezier(.22, 1, .36, 1), padding .3s cubic-bezier(.22, 1, .36, 1), margin .3s cubic-bezier(.22, 1, .36, 1), border-width .3s cubic-bezier(.22, 1, .36, 1), opacity .18s ease; }
.agent-chat__attachment.attachment-chip-leave-to { width: 0 !important; padding-inline: 0; margin-right: -6px; border-inline-width: 0; opacity: 0; }
@media (prefers-reduced-motion: reduce) { .attachment-chip-enter-active, .attachment-chip-leave-active { transition: none; } }
.agent-chat__sent-attachments { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; max-width: 88%; margin: 0 0 10px auto; padding: 0; list-style: none; }
.agent-chat__sent-attachments > li { width: 244px; max-width: 100%; min-width: 0; }
.agent-chat__file-card { display: flex; align-items: center; gap: 11px; width: 100%; padding: 11px 13px; color: #53685b; text-align: left; background: linear-gradient(125deg, #ffffffdc, #f1f5f2c9); border: 1px solid #dce6de; border-radius: 12px; box-shadow: inset 0 1px #fff, 0 3px 10px #34473e06; transition: border-color .18s, background .18s, box-shadow .18s; }
.agent-chat__file-card:hover { background: #ffffffed; border-color: #bccfc2; box-shadow: inset 0 1px #fff, 0 4px 14px #34473e0c; }
.agent-chat__file-card:focus-visible { outline: 2px solid #9285ba; outline-offset: 3px; }
.agent-chat__file-icon { display: grid; place-items: center; flex: 0 0 34px; height: 40px; color: #7c8e81; background: #e8eeea; border-radius: 7px; }
.agent-chat__file-icon svg { width: 23px; height: 28px; fill: #ffffffb3; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.agent-chat__file-info { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.agent-chat__file-name { overflow: hidden; font-size: 12px; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
.agent-chat__file-format { color: #93a097; font-size: 10px; line-height: 1.3; }
@media (prefers-reduced-motion: reduce) { .agent-chat__file-card { transition: none; } }
.agent-chat__attachment { display: flex; align-items: center; flex: none; gap: 6px; min-width: 0; max-width: min(180px, 100%); padding: 4px 5px 4px 10px; color: #53685b; background: #edf2ee; border: 1px solid #dce6de; border-radius: 9px; }
.agent-chat__attachment > button.agent-chat__attachment-name { display: block; flex: 1; width: auto; height: auto; padding: 0; text-align: left; background: transparent; border: 0; border-radius: 3px; min-width: 0; overflow: hidden; color: inherit; font-size: 12px; line-height: 20px; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
.agent-chat__attachment > button.agent-chat__attachment-name:hover { background: transparent; color: #2e6447; }
.agent-chat__attachment > button { display: grid; place-items: center; flex: 0 0 22px; width: 22px; height: 22px; padding: 0; color: #829287; background: transparent; border: 0; border-radius: 6px; }
.agent-chat__attachment > button:hover { color: #b75353; background: #f6e5e3; }
.agent-chat__attachment svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; }
.agent-chat__attachment > button:focus-visible { outline: 2px solid #9285ba; outline-offset: 1px; }
.agent-chat__attachment-error { margin: 5px 0; color: #a85e60; font-size: 11px; line-height: 1.6; overflow-wrap: anywhere; }
.agent-chat__reasoning { display: flex; align-items: center; gap: 9px; color: #8b9b91; font-size: 10px; }
.agent-chat__reasoning-options { position: relative; display: flex; gap: 2px; min-width: 0; margin: 0; padding: 3px; background: #edf1ed; border: 1px solid #e3eae3; border-radius: 9px; }
.agent-chat__reasoning-option { position: relative; z-index: 1; flex: 0 0 56px; text-align: center; cursor: pointer; }
.agent-chat__reasoning-option > span { position: relative; isolation: isolate; display: block; overflow: hidden; padding: 5px 0; color: #8b9990; border-radius: 6px; line-height: 1.2; transition: color .18s, background .18s, box-shadow .18s; }
.agent-chat__reasoning-option:hover > span { color: #4e6758; }
.agent-chat__reasoning-option > input:checked + span { color: #433878; }
.agent-chat__reasoning-highlight { position: absolute; isolation: isolate; top: 3px; bottom: 3px; left: 3px; width: 56px; overflow: hidden; pointer-events: none; border-radius: 6px; background: #f0ecff; box-shadow: inset 0 0 0 1px #a597df55, 0 1px 5px #7970b52b; transition: transform .32s cubic-bezier(.22, 1, .36, 1); animation: reasoning-breathe 4.8s ease-in-out infinite; }
.agent-chat__reasoning-highlight::before,
.agent-chat__reasoning-highlight::after { position: absolute; z-index: -1; inset: -65%; content: ''; pointer-events: none; filter: blur(5px); animation: reasoning-liquid 7s ease-in-out infinite alternate; }
.agent-chat__reasoning-highlight::before { background: radial-gradient(ellipse at 30% 40%, #818cf8b3, #a5b4fc33 45%, transparent 68%); }
.agent-chat__reasoning-highlight::after { background: radial-gradient(ellipse at 70% 65%, #f0a3c8bd, #f9bdd733 43%, transparent 68%); animation-direction: alternate-reverse; animation-duration: 8.5s; }
.agent-chat__reasoning.is-paused .agent-chat__reasoning-highlight,
.agent-chat__reasoning.is-paused .agent-chat__reasoning-highlight::before,
.agent-chat__reasoning.is-paused .agent-chat__reasoning-highlight::after { animation-play-state: paused; }
.agent-chat__reasoning-option > input:focus-visible + span { outline: 2px solid #9285ba; outline-offset: 2px; }
@keyframes reasoning-liquid { 0% { transform: translate(-9%, -8%) rotate(-12deg) scale(.92); opacity: .65; } 50% { transform: translate(9%, 6%) rotate(12deg) scale(1.12); opacity: .95; } 100% { transform: translate(-3%, 10%) rotate(-6deg) scale(1); opacity: .75; } }
@keyframes reasoning-breathe { 0%, 100% { box-shadow: inset 0 0 0 1px #a597df55, 0 1px 5px #7970b51f; } 50% { box-shadow: inset 0 0 0 1px #a597df80, 0 0 7px #a59ae04d, 0 0 3px #eca2c838; } }
@media (prefers-reduced-motion: reduce) { .agent-chat__reasoning-option > span, .agent-chat__reasoning-highlight, .agent-chat__reasoning-highlight::before, .agent-chat__reasoning-highlight::after { transition: none; animation: none; } }
.agent-chat__composer-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; }
.agent-chat__submit-controls { display: flex; flex: 0 1 auto; flex-wrap: wrap; align-items: center; justify-content: flex-end; max-width: 100%; gap: 10px 14px; margin-left: auto; }
.agent-chat__reasoning-send { display: flex; flex: none; align-items: center; gap: 10px; }
.agent-chat__composer-actions > span { flex: 1; min-width: 130px; color: #b1b9b2; font-size: 9px; }
.agent-chat__send { display: grid; place-items: center; flex: none; width: 34px; height: 34px; padding: 0; color: #f4fbf7; background: #2d4b3e; border: 0; border-radius: 50%; box-shadow: 0 8px 18px #28473a2b; }
.agent-chat__send:hover:not(:disabled) { background: #416b59; }
.agent-chat__send svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
button:disabled { opacity: .38; cursor: default; }
button:focus-visible, select:focus-visible, .agent-chat__messages:focus-visible { outline: 2px solid #9285ba; outline-offset: 2px; }
.agent-chat__empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; min-height: 100%; padding: 40px 24px; text-align: center; }
.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (max-width: 900px) { .assistant-workspace { grid-template-columns: minmax(0, 1fr); height: auto; min-height: 100%; } .agent-chat { height: 680px; } .agent-chat::after, .assistant-workspace__resize-handle { display: none; } }
@media (max-width: 640px) { .agent-chat { height: 650px; } .agent-chat__header { padding: 22px 20px 18px; } .agent-chat__message-list { padding: 24px 20px; } .agent-chat__composer { margin-right: 14px; margin-left: 14px; } }
@media (prefers-reduced-motion: reduce) { .agent-chat__thinking { animation: none; } .agent-chat__answer-actions button, .assistant-workspace__resize-handle span { transition: none; } }
</style>
