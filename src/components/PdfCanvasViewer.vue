<script setup>
import { t } from '../i18n/index.js'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createPdfCanvasSession } from '../services/pdfCanvas.js'
import { clampPdfZoom, pdfAnchor, pdfAnchorScroll } from '../models/pdfViewport.js'

const props = defineProps({ src: { type: String, required: true }, label: String })
const emit = defineEmits(['ready', 'error'])
const viewport = ref(null), pages = ref([]), page = ref(1), zoom = ref(1), viewportWidth = ref(0)
const loading = ref(true)
const sheetWidth = computed(() => Math.max(1, viewportWidth.value - 24) * zoom.value)
const canvases = new Map(), sheets = new Map(), nearPages = new Set()
const session = createPdfCanvasSession()
let revision = 0, renderVersion = 0, timer, pageTimer, resizeObserver, intersectionObserver
let mounted = false, pumping = false, scrollFrame = 0, zoomTimer, pinch = null, zoomRevision = 0
function clearTimers() { clearTimeout(timer); clearTimeout(pageTimer); clearTimeout(zoomTimer) }
function fail(current) {
  if (current !== revision) return
  revision++; clearTimers(); session.destroy(); loading.value = false; emit('error')
}
function setSheet(number, element) {
  const previous = sheets.get(number)
  if (previous) intersectionObserver?.unobserve(previous)
  if (element) { sheets.set(number, element); intersectionObserver?.observe(element) }
  else sheets.delete(number)
}
function setCanvas(number, element) { if (element) canvases.set(number, element); else canvases.delete(number) }
function sheetBox(number) {
  const element = sheets.get(number)
  return element ? { number, left: element.offsetLeft, top: element.offsetTop, width: element.clientWidth, height: element.clientHeight } : null
}
function currentAnchor(point) {
  const scroll = { left: viewport.value.scrollLeft, top: viewport.value.scrollTop }
  const target = scroll.top + point.y
  const number = pages.value.find(item => { const box = sheetBox(item.number); return box && box.top + box.height >= target })?.number || pages.value.at(-1)?.number
  const box = sheetBox(number)
  return box ? pdfAnchor(box, scroll, point) : null
}
function refreshWindow() {
  const element = viewport.value
  if (!element || !pages.value.length) return
  const bounds = element.getBoundingClientRect()
  let current = 1
  for (const item of pages.value) {
    const sheet = sheets.get(item.number)
    if (!sheet) continue
    const rect = sheet.getBoundingClientRect()
    if (rect.top <= bounds.top + 50) current = item.number
    if (rect.bottom >= bounds.top - 400 && rect.top <= bounds.bottom + 400) nearPages.add(item.number)
    else {
      nearPages.delete(item.number)
      if (item.status === 'ready') {
        const canvas = canvases.get(item.number)
        if (canvas) canvas.width = canvas.height = 0
        item.status = 'idle'
      }
    }
  }
  page.value = current
  void pump()
}
function onScroll() {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; refreshWindow() })
}
async function pump() {
  if (pumping || !mounted || pinch) return
  pumping = true
  const current = revision, version = renderVersion
  try {
    while (mounted && !pinch && current === revision && version === renderVersion) {
      const item = pages.value.filter(item => nearPages.has(item.number) && item.status === 'idle').sort((a, b) => Math.abs(a.number - page.value) - Math.abs(b.number - page.value))[0]
      if (!item) break
      item.status = 'rendering'
      pageTimer = setTimeout(() => fail(current), 20000)
      try {
        const image = await session.render(item.number, sheetWidth.value, window.devicePixelRatio || 1)
        if (current !== revision || version !== renderVersion) { image.width = image.height = 0; return }
        const canvas = canvases.get(item.number)
        if (!canvas) { image.width = image.height = 0; continue }
        item.ratio = image.height / image.width
        canvas.width = image.width; canvas.height = image.height
        canvas.getContext('2d').drawImage(image, 0, 0)
        image.width = image.height = 0
        item.status = 'ready'
        if (loading.value) {
          loading.value = false; clearTimeout(timer)
          for (const other of pages.value) if (other.status === 'idle') other.ratio = item.ratio
          emit('ready')
        }
      } catch (error) {
        if (current !== revision || version !== renderVersion) return
        if (error.name === 'AbortError' || error.name === 'RenderingCancelledException') return
        item.status = 'failed'
        if (loading.value) { fail(current); return }
      } finally { if (current === revision && version === renderVersion) clearTimeout(pageTimer) }
    }
  } finally { if (current === revision && version === renderVersion) pumping = false }
}
function invalidate() {
  clearTimeout(pageTimer); renderVersion++; pumping = false
  for (const item of pages.value) if (item.status !== 'failed') item.status = 'idle'
  refreshWindow()
}
function scheduleRepaint() {
  clearTimeout(zoomTimer)
  zoomTimer = setTimeout(invalidate, 120)
}
async function setZoom(value, point, anchor = null) {
  const next = clampPdfZoom(value)
  if (!viewport.value || next === zoom.value) return
  const position = point || { x: viewport.value.clientWidth / 2, y: viewport.value.clientHeight / 2 }
  const saved = anchor || currentAnchor(position)
  const operation = ++zoomRevision
  zoom.value = next
  await nextTick()
  if (!mounted || operation !== zoomRevision) return
  const box = saved && sheetBox(saved.number)
  if (box) viewport.value.scrollTo({ ...pdfAnchorScroll(box, saved, position), behavior: 'instant' })
  if (!pinch) scheduleRepaint()
}
function geometry(event) {
  const [a, b] = event.touches
  const rect = viewport.value.getBoundingClientRect()
  return { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top, distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) }
}
function startTouches(event) {
  if (event.touches.length !== 2) return
  clearTimeout(zoomTimer)
  const point = geometry(event)
  pinch = { ...point, zoom: zoom.value, anchor: currentAnchor(point) }
}
function moveTouches(event) {
  if (event.touches.length !== 2 || !pinch || !pinch.distance) return
  // 单指保留浏览器原生滚动与惯性，仅接管双指手势，阻止整页缩放。
  event.preventDefault()
  const point = geometry(event)
  void setZoom(pinch.zoom * point.distance / pinch.distance, point, pinch.anchor)
}
function endTouches(event) {
  if (pinch && event.touches.length < 2) { pinch = null; scheduleRepaint() }
}
function retry(item) { item.status = 'idle'; nearPages.add(item.number); void pump() }
async function load() {
  const current = ++revision
  clearTimers(); renderVersion++; pumping = false; session.destroy(); intersectionObserver?.disconnect()
  pages.value = []; nearPages.clear(); pinch = null; zoom.value = 1; page.value = 1; loading.value = true
  timer = setTimeout(() => fail(current), 25000)
  try {
    const count = await session.load(props.src)
    if (current !== revision) return
    viewportWidth.value = viewport.value.clientWidth
    pages.value = Array.from({ length: count }, (_, index) => ({ number: index + 1, ratio: Math.SQRT2, status: 'idle' }))
    await nextTick()
    if (current !== revision || !mounted) return
    viewport.value.scrollTo({ left: 0, top: 0, behavior: 'instant' })
    intersectionObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const number = Number(entry.target.dataset.page)
        if (entry.isIntersecting) nearPages.add(number)
        else nearPages.delete(number)
      }
      refreshWindow()
    }, { root: viewport.value, rootMargin: '400px' })
    for (const element of sheets.values()) intersectionObserver.observe(element)
    nearPages.add(1)
    refreshWindow()
  } catch (error) { if (current === revision && error.name !== 'AbortError') fail(current) }
}
watch(() => props.src, () => { if (mounted) void load() })
onMounted(() => {
  mounted = true
  resizeObserver = new ResizeObserver(() => {
    const width = viewport.value?.clientWidth || 0
    if (width > 0 && Math.abs(width - viewportWidth.value) > 1) {
      viewportWidth.value = width
      if (pages.value.length) scheduleRepaint()
    }
  })
  resizeObserver.observe(viewport.value)
  void load()
})
onBeforeUnmount(() => {
  mounted = false; revision++; zoomRevision++; clearTimers(); cancelAnimationFrame(scrollFrame)
  resizeObserver?.disconnect(); intersectionObserver?.disconnect(); session.destroy(); pinch = null
})
</script>

<template>
  <div class="pdf-canvas-viewer" :aria-busy="loading">
    <nav class="pdf-canvas-viewer__toolbar" :aria-label="t('PDF 阅读工具')">
      <span class="pdf-canvas-viewer__count">{{ t('第 {value0} / {value1} 页', { value0: page, value1: pages.length || 1 }) }}</span>
      <div class="pdf-canvas-viewer__zoom">
        <button type="button" :disabled="zoom <= 1" :aria-label="t('缩小 PDF')" @click="setZoom(zoom - .25)">−</button>
        <button type="button" class="pdf-canvas-viewer__percentage" :aria-label="t('恢复 PDF 缩放')" @click="setZoom(1)">{{ Math.round(zoom * 100) }}%</button>
        <button type="button" :disabled="zoom >= 3" :aria-label="t('放大 PDF')" @click="setZoom(zoom + .25)">+</button>
      </div>
    </nav>
    <div ref="viewport" class="pdf-canvas-viewer__page" tabindex="0" :aria-label="label || t('PDF 文档')" @scroll.passive="onScroll" @touchstart.passive="startTouches" @touchmove="moveTouches" @touchend.passive="endTouches" @touchcancel.passive="endTouches">
      <div class="pdf-canvas-viewer__stack">
        <section v-for="item in pages" :key="item.number" :ref="element => setSheet(item.number, element)" :data-page="item.number" class="pdf-canvas-viewer__sheet" :style="{ width: `${sheetWidth}px`, aspectRatio: `${1 / item.ratio}` }" :aria-label="t('第 {value0} / {value1} 页', { value0: item.number, value1: pages.length })" :aria-busy="item.status === 'rendering'">
          <canvas :ref="element => setCanvas(item.number, element)" :class="{ 'is-ready': item.status === 'ready' || item.status === 'rendering' }" role="img" :aria-label="t('第 {value0} / {value1} 页', { value0: item.number, value1: pages.length })"></canvas>
          <div v-if="item.status === 'failed'" class="pdf-canvas-viewer__error" role="alert"><span>{{ t('此页暂时无法显示') }}</span><button type="button" @click="retry(item)">{{ t('重新加载') }}</button></div>
          <span v-else-if="item.status !== 'ready' && item.status !== 'rendering'" class="pdf-canvas-viewer__placeholder" aria-hidden="true">{{ item.number }}</span>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pdf-canvas-viewer { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; overflow: hidden; border-radius: inherit; background: #e8eeea; }
.pdf-canvas-viewer__toolbar { display: flex; align-items: center; justify-content: space-between; flex: none; gap: 12px; padding: 9px 44px 9px 16px; color: #64786b; font-size: 11px; border-bottom: 1px solid #dce5df; background: #f7faf8ed; }
.pdf-canvas-viewer__zoom { display: flex; align-items: center; gap: 5px; }
.pdf-canvas-viewer__toolbar button { width: 32px; height: 30px; padding: 0; font: inherit; font-size: 20px; color: inherit; background: white; border: 1px solid #dce5df; border-radius: 9px; touch-action: manipulation; }
.pdf-canvas-viewer__toolbar button.pdf-canvas-viewer__percentage { width: 50px; font-size: 11px; font-variant-numeric: tabular-nums; }
.pdf-canvas-viewer__toolbar button:disabled { opacity: .35; }
.pdf-canvas-viewer__page { position: relative; flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; touch-action: pan-x pan-y; }
.pdf-canvas-viewer__stack { display: flex; flex-direction: column; align-items: center; gap: 14px; width: max-content; min-width: 100%; padding: 12px; }
.pdf-canvas-viewer__sheet { position: relative; flex: none; overflow: hidden; background: white; box-shadow: 0 3px 12px #28453516; }
canvas { display: block; width: 100%; height: 100%; opacity: 0; }
canvas.is-ready { opacity: 1; }
.pdf-canvas-viewer__placeholder { position: absolute; inset: 0; display: grid; place-items: center; color: #b1beb5; font-size: 14px; }
.pdf-canvas-viewer__error { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #9b7569; font-size: 12px; }
.pdf-canvas-viewer__error button { padding: 6px 12px; color: inherit; border: 1px solid #dfccc4; border-radius: 9px; background: #fff9f5; font: inherit; }
button:focus-visible, .pdf-canvas-viewer__page:focus-visible { outline: 2px solid #aaa0ed; outline-offset: -2px; }
</style>
