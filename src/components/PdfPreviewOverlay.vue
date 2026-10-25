<script setup>
import { t } from '../i18n/index.js'
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import PdfLoadingAnimation from './PdfLoadingAnimation.vue'
const PdfCanvasViewer = defineAsyncComponent(() => import('./PdfCanvasViewer.vue'))
const mobileQuery = typeof window !== 'undefined' ? window.matchMedia?.('(max-width: 900px)') : null
const mobile = ref(Boolean(mobileQuery?.matches))
function updateMobile() { mobile.value = Boolean(mobileQuery?.matches) }
onMounted(() => mobileQuery?.addEventListener('change', updateMobile))

const props = defineProps({ open: Boolean, loading: Boolean, error: { type: String, default: '' }, src: { type: String, default: '' }, label: { type: String, default: '' } })
const emit = defineEmits(['close'])
const previewLabel = computed(() => props.label || t('PDF 文档'))
const initialized = ref(false)
const closeButton = ref(null)
const frameLoaded = ref(false)
const failed = ref(false)
const contentReady = computed(() => frameLoaded.value && !failed.value && !props.error && !props.loading)
let focusBeforeOpen
let background
let wasInert = false
let listening = false
let loadTimer
function clearLoadTimer() { clearTimeout(loadTimer); loadTimer = undefined }
function markLoaded() { clearLoadTimer(); frameLoaded.value = true }
function markFailed() { clearLoadTimer(); failed.value = true }

function releaseModal() {
  clearLoadTimer()
  if (!listening) return
  document.removeEventListener('keydown', handleKey, true)
  listening = false
  if (background) background.inert = wasInert
  background = null
  if (focusBeforeOpen?.isConnected && !focusBeforeOpen.closest('[inert]')) focusBeforeOpen.focus({ preventScroll: true })
  focusBeforeOpen = null
}
function handleKey(event) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close') }
  // 关闭按钮之后进入阅读工具；移动端工具栏也参与正常键盘导航。
  if (event.key === 'Tab' && !event.shiftKey && document.activeElement === closeButton.value) {
    event.preventDefault()
    closeButton.value?.closest('[role="dialog"]')?.querySelector('.pdf-canvas-viewer__toolbar button:not(:disabled), iframe, .pdf-canvas-viewer__page')?.focus({ preventScroll: true })
  }
}
watch(() => props.open, async open => {
  if (!open) { releaseModal(); return }
  initialized.value = true
  if (!listening) {
    focusBeforeOpen = document.activeElement
    if (['INPUT', 'TEXTAREA'].includes(focusBeforeOpen?.tagName)) focusBeforeOpen.blur()
    background = document.getElementById('app')
    wasInert = Boolean(background?.inert)
    if (background) background.inert = true
    document.addEventListener('keydown', handleKey, true)
    listening = true
  }
  await nextTick()
  if (props.open && listening) closeButton.value?.focus({ preventScroll: true })
}, { immediate: true })
watch([() => props.open, () => props.src, mobile], () => {
  clearLoadTimer(); frameLoaded.value = false; failed.value = false
  if (props.open && props.src) loadTimer = setTimeout(markFailed, 30000)
}, { flush: 'sync', immediate: true })
onDeactivated(releaseModal)
onBeforeUnmount(() => { releaseModal(); mobileQuery?.removeEventListener('change', updateMobile) })
</script>

<template>
  <Teleport to="body">
    <div class="pdf-preview-glass" :class="{ 'is-active': open }" aria-hidden="true" @click="emit('close')"></div>
    <Transition name="pdf-preview">
      <section v-if="initialized" v-show="open" class="pdf-preview" role="dialog" aria-modal="true" :aria-label="t('预览 {value0}', { value0: previewLabel })" :inert="!open">
        <div class="pdf-preview__layout">
          <div class="pdf-preview__viewer">
            <div class="pdf-preview__surface">
              <PdfCanvasViewer v-if="open && src && !failed && mobile" :key="src" :src="src" :label="previewLabel" @ready="markLoaded" @error="markFailed" />
              <iframe v-else-if="open && src && !failed" :key="src" :class="{ 'is-ready': contentReady }" :aria-hidden="!contentReady" :tabindex="contentReady ? 0 : -1" :src="`${src}#view=FitH&toolbar=1&navpanes=0`" :title="t('{value0} PDF 内容', { value0: previewLabel })" @load="markLoaded" @error="markFailed"></iframe>
              <Transition name="pdf-loading">
                <div v-if="open && !contentReady" class="pdf-preview__status" :aria-busy="!error && !failed && (loading || Boolean(src))">
                  <PdfLoadingAnimation v-if="!error && !failed && (loading || src)" />
                  <p>{{ label }}</p>
                  <span v-if="error || failed || !src && !loading" role="alert">{{ error || t('无法打开 PDF，请关闭后重新选择附件。') }}</span>
                  <span v-else role="status">{{ t('正在加载 PDF…') }}</span>
                </div>
              </Transition>
              <button ref="closeButton" class="pdf-preview__close" type="button" :aria-label="t('关闭 PDF 预览')" @click="emit('close')"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 5.5 9 9m0-9-9 9" /></svg></button>
            </div>
          </div>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>

.pdf-preview-glass {
  position: fixed;
  z-index: 10000;
  inset: 0;
  pointer-events: none;
  background-color: rgb(7 12 10 / 0%);
  backdrop-filter: blur(0) saturate(1);
  opacity: 0;
  transition:
    background-color 0.36s cubic-bezier(0.22, 1, 0.36, 1),
    backdrop-filter 0.42s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.3s ease;
}

.pdf-preview-glass.is-active {
  pointer-events: auto;
  background-color: rgb(7 12 10 / 42%);
  backdrop-filter: blur(20px) saturate(0.78) brightness(0.84);
  opacity: 1;
}

.pdf-preview {
  position: fixed;
  z-index: 10001;
  inset: 0;
  display: grid;
  place-items: center;
  padding: clamp(24px, 4vw, 56px);
  pointer-events: none;
}

.pdf-preview__layout {
  display: flex;
  align-items: center;
  width: min(1180px, 100%);
  height: min(820px, 100%);
  min-height: 0;
  min-width: 0;
}
.pdf-preview__surface { width: 100%; height: 100%; border-radius: inherit; }
.pdf-preview__viewer {
  box-sizing: border-box;
  position: relative;
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: visible;
  pointer-events: auto;
  background: #dfe3e1;
  border: 1px solid #ffffff52;
  border-radius: 20px;
  box-shadow:
    0 34px 100px #010302a3,
    0 4px 20px #01030252,
    inset 0 1px #ffffff66;
}

.pdf-preview__viewer iframe {
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #fff;
  border: 0;
  border-radius: inherit;
  opacity: 0;
  pointer-events: none;
  transition: opacity .8s cubic-bezier(.22, 1, .36, 1) .24s;
}

.pdf-preview__viewer iframe.is-ready { opacity: 1; pointer-events: auto; }
.pdf-loading-leave-active { transition: opacity .24s ease; }
.pdf-loading-leave-to { opacity: 0; }

.pdf-preview__close {
  position: absolute;
  z-index: 2;
  top: -16px;
  right: -16px;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  padding: 0;
  color: #edf4f0;
  cursor: pointer;
  background: rgb(18 30 25 / 88%);
  border: 1px solid #ffffff36;
  border-radius: 50%;
  box-shadow:
    0 10px 28px #01030275,
    inset 0 1px #ffffff1f;
  backdrop-filter: blur(14px) saturate(0.82);
  transition:
    color 0.18s,
    background 0.18s,
    border-color 0.18s,
    transform 0.26s cubic-bezier(0.16, 1, 0.3, 1);
}

.pdf-preview__status {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  height: 100%;
  padding: 24px;
  box-sizing: border-box;
  color: #40594c;
  text-align: center;
  overflow-wrap: anywhere;
}
.pdf-preview__status.has-toolbar { top: 56px; height: calc(100% - 56px); }
.pdf-preview__status p { margin: 0; font-weight: 600; }
.pdf-preview__status span { font-size: 14px; }
.pdf-preview__status button {
  padding: 8px 18px;
  border: 1px solid #9eb3a5;
  border-radius: 8px;
  color: #304e3d;
  background: #edf3ef;
  cursor: pointer;
}

.pdf-preview__close:hover {
  color: #fff;
  background: rgb(43 59 52 / 94%);
  border-color: #ffffff5c;
  transform: scale(1.06);
}

.pdf-preview__close:active { transform: scale(0.96); }

.pdf-preview__close:focus-visible {
  outline: 2px solid #aaa0ed;
  outline-offset: 3px;
}

.pdf-preview__close svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1.7px;
}

.pdf-preview-enter-active,
.pdf-preview-leave-active { transition: opacity 0.28s ease; }

.pdf-preview-enter-active .pdf-preview__viewer,
.pdf-preview-leave-active .pdf-preview__viewer {
  transform-origin: 50% 52%;
  transition:
    transform 0.42s cubic-bezier(0.16, 1, 0.3, 1),
    filter 0.32s ease;
}

.pdf-preview-enter-from,
.pdf-preview-leave-to { opacity: 0; }

.pdf-preview-enter-from .pdf-preview__viewer,
.pdf-preview-leave-to .pdf-preview__viewer {
  filter: blur(4px);
  transform: translateY(18px) scale(0.975);
}


@media (max-width: 640px) {
  .pdf-preview { padding: max(24px, env(safe-area-inset-top)) 12px max(24px, env(safe-area-inset-bottom)); }
  .pdf-preview__layout { height: 100%; }
  .pdf-preview__viewer { border-radius: 13px; }
  .pdf-preview__close { top: -8px; right: -5px; width: 34px; height: 34px; }
}
@media (prefers-reduced-motion: reduce) {
  .pdf-preview-glass, .pdf-preview__viewer iframe, .pdf-preview__close,
  .pdf-loading-leave-active, .pdf-preview-enter-active, .pdf-preview-leave-active,
  .pdf-preview-enter-active .pdf-preview__viewer,
  .pdf-preview-leave-active .pdf-preview__viewer { transition: none; }
}
</style>
