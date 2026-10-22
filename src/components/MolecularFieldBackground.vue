<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  paused: {
    type: Boolean,
    default: false,
  },
})

const rootRef = ref(null)
const canvasRef = ref(null)
const ready = ref(false)
const reducedMotion = ref(false)

let worker = null
let resizeObserver = null
let intersectionObserver = null
let reducedMotionQuery = null
let pointerFrame = 0
let pendingPointer = null
let pointerBlocked = false
let visible = true

const pointerListenerOptions = {
  passive: true,
  capture: true,
}

function postMessage(message) {
  worker?.postMessage(message)
}

function stopWorker() {
  ready.value = false
  worker?.terminate()
  worker = null
}

function getSize() {
  const bounds = rootRef.value?.getBoundingClientRect()

  if (!bounds) return null

  return {
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
  }
}

function updateActiveState() {
  postMessage({
    type: 'set-active',
    active: visible && !document.hidden && !props.paused,
  })
}

function isPointerInsideBlockedArea(event) {
  return Array.from(document.querySelectorAll('[data-molecular-field-block]')).some((element) => {
    const bounds = element.getBoundingClientRect()
    return (
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom
    )
  })
}

function blockPointerInteraction() {
  pendingPointer = null

  if (pointerFrame) {
    window.cancelAnimationFrame(pointerFrame)
    pointerFrame = 0
  }

  if (pointerBlocked) return

  pointerBlocked = true
  postMessage({ type: 'pointer-leave' })
}

function handlePointerMove(event) {
  if (event.pointerType === 'touch' || !rootRef.value) return

  if (isPointerInsideBlockedArea(event)) {
    blockPointerInteraction()
    return
  }

  pointerBlocked = false

  const bounds = rootRef.value.getBoundingClientRect()
  pendingPointer = {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  }

  if (pointerFrame) return

  pointerFrame = window.requestAnimationFrame(() => {
    pointerFrame = 0

    if (pendingPointer) {
      postMessage({ type: 'pointer', ...pendingPointer })
    }
  })
}

function handlePointerLeave(event) {
  if (event?.type === 'pointerout' && event.relatedTarget) return

  pointerBlocked = false
  pendingPointer = null
  postMessage({ type: 'pointer-leave' })
}

function handleReducedMotionChange(event) {
  reducedMotion.value = event.matches
  postMessage({
    type: 'set-reduced-motion',
    reducedMotion: event.matches,
  })
}

onMounted(() => {
  const canvas = canvasRef.value
  const size = getSize()

  if (!canvas || !size || typeof Worker === 'undefined') return
  if (typeof canvas.transferControlToOffscreen !== 'function') return

  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion.value = reducedMotionQuery.matches

  // 不支持 Worker、画布转移或加载失败时保留静态背景，页面骨架仍可使用。
  try {
    worker = new Worker(new URL('../workers/molecular-field.worker.js', import.meta.url), {
      type: 'module',
    })

    worker.addEventListener('error', stopWorker)
    const offscreenCanvas = canvas.transferControlToOffscreen()
    worker.postMessage(
      {
        type: 'init',
        canvas: offscreenCanvas,
        ...size,
        reducedMotion: reducedMotion.value,
        active: !document.hidden && !props.paused,
      },
      [offscreenCanvas],
    )
  } catch {
    stopWorker()
    return
  }

  worker.addEventListener('message', (event) => {
    if (event.data?.type === 'ready') {
      ready.value = true
    }

    if (event.data?.type === 'error') {
      stopWorker()
    }
  })

  resizeObserver = new ResizeObserver(() => {
    const nextSize = getSize()
    if (nextSize) postMessage({ type: 'resize', ...nextSize })
  })
  resizeObserver.observe(rootRef.value)

  intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true
    updateActiveState()
  })
  intersectionObserver.observe(rootRef.value)

  window.addEventListener('pointermove', handlePointerMove, pointerListenerOptions)
  window.addEventListener('pointerdown', handlePointerMove, pointerListenerOptions)
  window.addEventListener('pointerout', handlePointerLeave, pointerListenerOptions)
  window.addEventListener('blur', handlePointerLeave)
  document.addEventListener('visibilitychange', updateActiveState)
  reducedMotionQuery.addEventListener('change', handleReducedMotionChange)
})

watch(() => props.paused, updateActiveState)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  intersectionObserver?.disconnect()
  window.removeEventListener('pointermove', handlePointerMove, pointerListenerOptions)
  window.removeEventListener('pointerdown', handlePointerMove, pointerListenerOptions)
  window.removeEventListener('pointerout', handlePointerLeave, pointerListenerOptions)
  window.removeEventListener('blur', handlePointerLeave)
  document.removeEventListener('visibilitychange', updateActiveState)
  reducedMotionQuery?.removeEventListener('change', handleReducedMotionChange)

  if (pointerFrame) window.cancelAnimationFrame(pointerFrame)

  postMessage({ type: 'destroy' })
  worker?.terminate()
  worker = null
})
</script>

<template>
  <div
    ref="rootRef"
    class="molecular-field"
    :data-animation-state="!ready ? 'static' : paused || reducedMotion ? 'paused' : 'running'"
    aria-hidden="true"
  >
    <canvas
      ref="canvasRef"
      class="molecular-field__canvas"
      :class="{ 'molecular-field__canvas--ready': ready }"
    ></canvas>
  </div>
</template>

<style scoped>
.molecular-field {
  position: absolute;
  z-index: 0;
  inset: 0;
  contain: strict;
  overflow: hidden;
  pointer-events: none;
  background: #fcfcfc;
}

.molecular-field__canvas {
  display: block;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 0.9s;
}

.molecular-field__canvas--ready {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .molecular-field__canvas {
    transition-duration: 0.18s;
  }
}
</style>
