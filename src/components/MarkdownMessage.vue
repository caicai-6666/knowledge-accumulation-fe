<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { answerWebLinks, renderAnswerBlocks } from '../models/answerMarkdown.js'
import { createStreamText } from '../models/streamText.js'
import { createMarkdownInk } from '../models/markdownInk.js'
import { getLinkMetadata } from '../services/linkMetadata.js'

const props = defineProps({ content: { type: String, required: true }, streamState: { type: String, default: '' }, animate: { type: Boolean, default: true }, stabilizeHeight: Boolean, beautifyLinks: Boolean, revealOnMount: Boolean })
const emit = defineEmits(['display-state', 'reveal-start'])
const displayedContent = ref(props.revealOnMount ? '' : props.content)
const contentRef = ref(null)
const reservedHeight = ref(0)
const linkMetadata = ref(new Map())
const linkProbeActive = ref(false)
const linksReady = computed(() => props.beautifyLinks && props.streamState === 'completed' && displayedContent.value === props.content)
const rawBlocks = computed(() => renderAnswerBlocks(displayedContent.value, { beautifyLinks: linksReady.value, linkMetadata: linkMetadata.value }))
const renderedBlocks = ref(rawBlocks.value)
const ink = createMarkdownInk()
ink.update(rawBlocks.value)
let inkPending = false
watch(rawBlocks, blocks => {
  renderedBlocks.value = ink.update(blocks, { animate: inkPending })
  inkPending = false
})
let linkProbeRevision = 0
watch(() => [linksReady.value, props.content, linkProbeActive.value], async ([ready, content, active]) => {
  const revision = ++linkProbeRevision
  if (!ready || !active) return
  await Promise.all(answerWebLinks(content).map(async url => {
    const metadata = await getLinkMetadata(url)
    if (revision === linkProbeRevision) linkMetadata.value = new Map(linkMetadata.value).set(url, metadata)
  }))
}, { immediate: true })
function hideBrokenIcon(event) {
  const element = event.target
  if (element?.tagName === 'IMG' && element.closest('.markdown-web-link__icon')) element.hidden = true
}
let reserveStreamHeight = props.stabilizeHeight && props.streamState === 'streaming'
let measuredWidth = 0
let heightObserver
let revealer
let motionPreference
let running = false
let animateStreamChanges = false
let liveOutput = props.revealOnMount || props.streamState === 'streaming'

function measureContentHeight() {
  const element = contentRef.value
  if (!element || !props.stabilizeHeight) return
  if (props.streamState === 'streaming') reserveStreamHeight = true
  if (!reserveStreamHeight) return
  const { width, height } = element.getBoundingClientRect()
  if (!width) return
  // Markdown 重排只扩展本轮占位；调整栏宽后重新测量，避免累积多余空白。
  if (Math.abs(width - measuredWidth) > 1) reservedHeight.value = 0
  measuredWidth = width
  reservedHeight.value = Math.max(reservedHeight.value, Math.ceil(height))
}
function updateDisplay() {
  linkProbeActive.value = running && props.animate && !document.hidden
  if (!revealer) { displayedContent.value = props.content; return }
  const enabled = running && props.animate && !motionPreference?.matches && !document.hidden
  if (props.revealOnMount || props.streamState === 'streaming') liveOutput = true
  inkPending = enabled && (props.streamState === 'streaming' || props.streamState === 'completed' && liveOutput && displayedContent.value !== props.content)
  animateStreamChanges = inkPending
  const smooth = animateStreamChanges
  revealer.update(props.content, { immediate: !smooth })
  if (!enabled) renderedBlocks.value = ink.update(rawBlocks.value)
  if (props.revealOnMount && props.content) emit('reveal-start')
}
function reportDisplayState() {
  emit('display-state', { text: displayedContent.value, complete: displayedContent.value === props.content })
}
function resume() {
  if (running) return
  running = true
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  revealer = createStreamText({ initial: displayedContent.value, onChange: text => { inkPending = animateStreamChanges; displayedContent.value = text; if (props.streamState !== 'streaming' && text === props.content) liveOutput = false }, requestFrame: callback => window.requestAnimationFrame(callback), cancelFrame: id => window.cancelAnimationFrame(id) })
  motionPreference.addEventListener('change', updateDisplay)
  document.addEventListener('visibilitychange', updateDisplay)
  if (props.stabilizeHeight) {
    heightObserver = new ResizeObserver(measureContentHeight)
    heightObserver.observe(contentRef.value)
    measureContentHeight()
  }
  updateDisplay()
  reportDisplayState()
}
function pause() {
  linkProbeActive.value = false
  ++linkProbeRevision
  running = false
  heightObserver?.disconnect()
  revealer?.stop()
  inkPending = false
  animateStreamChanges = false
  liveOutput = false
  renderedBlocks.value = ink.update(rawBlocks.value)
  revealer = null
  motionPreference?.removeEventListener('change', updateDisplay)
  document.removeEventListener('visibilitychange', updateDisplay)
}
watch(() => [props.content, props.streamState, props.animate, props.revealOnMount], updateDisplay)
watch([displayedContent, () => props.content, () => props.streamState], async () => { await nextTick(); measureContentHeight(); reportDisplayState() }, { flush: 'post' })
onMounted(resume)
onActivated(resume)
onDeactivated(pause)
onBeforeUnmount(pause)
</script>

<template>
  <div class="markdown-message" :style="reservedHeight ? { minHeight: `${reservedHeight}px` } : undefined">
    <div ref="contentRef" class="markdown-message__content" @error.capture="hideBrokenIcon">
      <div v-for="(html, index) in renderedBlocks" :key="index" class="markdown-message__block" v-html="html"></div>
    </div>
  </div>
</template>

<style scoped>
.markdown-message {
  min-width: 0;
  color: inherit;
  font-size: var(--chat-font-size, 13px);
  line-height: 1.75;
  overflow-wrap: anywhere;
}

.markdown-message__block { display: contents; }
.markdown-message :deep(.markdown-ink) { animation: markdown-ink-reveal .64s cubic-bezier(.2, .65, .25, 1) both; }
@keyframes markdown-ink-reveal {
  from { opacity: 0; filter: blur(2px); }
  60% { opacity: .85; filter: blur(.35px); }
  to { opacity: 1; filter: blur(0); }
}
@media (prefers-reduced-motion: reduce) { .markdown-message :deep(.markdown-ink) { animation: none; } }
.markdown-message__content { display: flow-root; }

.markdown-message__content :deep(> .markdown-message__block:first-child > :first-child) {
  margin-top: 0;
}

.markdown-message__content :deep(> .markdown-message__block:last-child > :last-child) {
  margin-bottom: 0;
}

.markdown-message :deep(p) {
  margin: 0 0 0.78em;
}

.markdown-message :deep(h1),
.markdown-message :deep(h2),
.markdown-message :deep(h3),
.markdown-message :deep(h4) {
  margin: 1.25em 0 0.55em;
  color: #26332c;
  font-weight: 650;
  line-height: 1.35;
}

.markdown-message :deep(h1) { font-size: 1.35em; }
.markdown-message :deep(h2) { font-size: 1.2em; }
.markdown-message :deep(h3),
.markdown-message :deep(h4) { font-size: 1.05em; }

.markdown-message :deep(ul),
.markdown-message :deep(ol) {
  padding-left: 1.55em;
  margin: 0.65em 0 0.85em;
}

.markdown-message :deep(li + li) {
  margin-top: 0.3em;
}

.markdown-message :deep(blockquote) {
  padding: 0.15em 0 0.15em 0.9em;
  margin: 0.8em 0;
  color: #6d7772;
  border-left: 3px solid #cfd6d2;
}

.markdown-message :deep(a) {
  color: #4e63a8;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.markdown-message :deep(a.markdown-web-link) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: min(100%, 280px);
  padding: 1px 6px;
  border-radius: 6px;
  background: #eaf0e9;
  color: #45624f;
  text-decoration: none;
  vertical-align: baseline;
  font-size: 0.94em;
  transition: background .2s ease;
}
.markdown-message :deep(a.markdown-web-link:hover) { background: #dce8dc; }
.markdown-message :deep(.markdown-web-link__label) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.markdown-message :deep(.markdown-web-link__icon) { position: relative; display: inline-grid; place-items: center; flex: 0 0 14px; width: 14px; height: 14px; line-height: 14px; }
.markdown-message :deep(.markdown-web-link__icon img) { position: absolute; inset: 0; width: 14px; height: 14px; margin: 0; border-radius: 2px; background: #eaf0e9; object-fit: contain; }
.markdown-message :deep(.markdown-web-link__icon img[hidden]) { display: none; }

@media (prefers-reduced-motion: reduce) { .markdown-message :deep(a.markdown-web-link) { transition: none; } }

.markdown-message :deep(code) {
  padding: 0.14em 0.38em;
  color: #33443c;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.9em;
  background: #e9eeeb;
  border-radius: 5px;
}

.markdown-message :deep(pre) {
  max-width: 100%;
  padding: 13px 15px;
  margin: 0.85em 0;
  overflow-x: auto;
  color: #e9f0ec;
  background: #25312c;
  border-radius: 10px;
}

.markdown-message :deep(pre code) {
  padding: 0;
  color: inherit;
  background: transparent;
  border-radius: 0;
}

.markdown-message :deep(table) {
  display: block;
  max-width: 100%;
  margin: 0.85em 0;
  overflow-x: auto;
  border-spacing: 0;
  border-collapse: collapse;
}

.markdown-message :deep(th),
.markdown-message :deep(td) {
  min-width: 88px;
  padding: 7px 10px;
  text-align: left;
  border: 1px solid #dce2df;
}

.markdown-message :deep(th) {
  color: #334139;
  font-weight: 650;
  background: #f0f3f1;
}

.markdown-message :deep(hr) {
  margin: 1.1em 0;
  border: 0;
  border-top: 1px solid #dce2df;
}
</style>
