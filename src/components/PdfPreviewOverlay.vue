<script setup>
import { computed, nextTick, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import PdfLoadingAnimation from './PdfLoadingAnimation.vue'

const props = defineProps({ open: Boolean, loading: Boolean, error: { type: String, default: '' }, src: { type: String, default: '' }, label: { type: String, default: 'PDF 文档' } })
const emit = defineEmits(['close'])
const initialized = ref(false)
const closeButton = ref(null)
const frameLoaded = ref(false)
const failed = ref(false)
const contentReady = computed(() => frameLoaded.value && !failed.value && !props.error && !props.loading)
let focusBeforeOpen
let background
let wasInert = false
let listening = false

function releaseModal() {
  if (!listening) return
  document.removeEventListener('keydown', handleKey, true)
  listening = false
  if (background) background.inert = wasInert
  background = null
  if (focusBeforeOpen?.isConnected && !focusBeforeOpen.closest('[inert]')) focusBeforeOpen.focus()
  focusBeforeOpen = null
}
function handleKey(event) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close') }
  // 阅读器内有独立的原生 PDF 工具栏；弹窗外部的 Tab 从关闭按钮进入阅读区。
  if (event.key === 'Tab' && document.activeElement === closeButton.value) {
    event.preventDefault()
    closeButton.value?.closest('[role="dialog"]')?.querySelector('iframe')?.focus()
  }
}
watch(() => props.open, async open => {
  if (!open) { releaseModal(); return }
  initialized.value = true
  if (!listening) {
    focusBeforeOpen = document.activeElement
    background = document.getElementById('app')
    wasInert = Boolean(background?.inert)
    if (background) background.inert = true
    document.addEventListener('keydown', handleKey, true)
    listening = true
  }
  await nextTick()
  if (props.open && listening) closeButton.value?.focus()
}, { immediate: true })
watch([() => props.open, () => props.src], () => { frameLoaded.value = false; failed.value = false }, { flush: 'sync' })
onDeactivated(releaseModal)
onBeforeUnmount(releaseModal)
</script>

<template>
  <Teleport to="body">
    <div class="pdf-preview-glass" :class="{ 'is-active': open }" aria-hidden="true" @click="emit('close')"></div>
    <Transition name="pdf-preview">
      <section v-if="initialized" v-show="open" class="pdf-preview" role="dialog" aria-modal="true" :aria-label="`预览 ${label}`" :inert="!open">
        <div class="pdf-preview__layout">
          <div class="pdf-preview__viewer">
            <div class="pdf-preview__surface">
              <iframe v-if="open && src && !failed" :key="src" :class="{ 'is-ready': contentReady }" :aria-hidden="!contentReady" :tabindex="contentReady ? 0 : -1" :src="`${src}#view=FitH&toolbar=1&navpanes=0`" :title="`${label} PDF 内容`" @load="frameLoaded = true" @error="failed = true"></iframe>
              <Transition name="pdf-loading">
                <div v-if="open && !contentReady" class="pdf-preview__status" :aria-busy="!error && !failed && (loading || Boolean(src))">
                  <PdfLoadingAnimation v-if="!error && !failed && (loading || src)" />
                  <p>{{ label }}</p>
                  <span v-if="error || failed || !src && !loading" role="alert">{{ error || '无法打开 PDF，请关闭后重新选择附件。' }}</span>
                  <span v-else role="status">正在加载 PDF…</span>
                </div>
              </Transition>
              <button ref="closeButton" class="pdf-preview__close" type="button" aria-label="关闭 PDF 预览" @click="emit('close')"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 5.5 9 9m0-9-9 9" /></svg></button>
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
  .pdf-preview { padding: 10px; }
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
