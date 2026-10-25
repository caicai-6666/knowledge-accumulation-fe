<script setup>
import { t } from '../i18n/index.js'
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { getContextPath, layoutQuestionTree } from '../models/questionTree.js'
import { clampTreeZoom, getAnchoredTreeScroll, getTreeCanvasBounds, MAX_TREE_ZOOM, MIN_TREE_ZOOM } from '../models/treeViewport.js'

const props = defineProps({ tree: { type: Object, required: true }, selectedId: { type: String, default: null }, contextIds: { type: Array, required: true }, active: Boolean, recenterOnActivate: Boolean, touchNavigation: Boolean })
const emit = defineEmits(['select', 'main-end'])
const collapsedByTree = ref({})
const collapsedIds = computed(() => new Set(collapsedByTree.value[props.tree.id] || []))
const layout = computed(() => layoutQuestionTree(props.tree, collapsedIds.value))
const hiddenCount = computed(() => props.tree.nodes.length - layout.value.nodes.length)
const branches = computed(() => [...new Set(props.tree.nodes.map(node => node.branchId).filter(id => id !== 'main'))])
const viewport = ref(null)
const zoom = ref(1)
const viewportSize = ref({ width: 0, height: 0 })
const canvasBounds = computed(() => getTreeCanvasBounds(layout.value, viewportSize.value, zoom.value))
const mobileScroll = ref({ left: 0, top: 0 })
const canvasPosition = computed(() => ({
  left: canvasBounds.value.left - (props.touchNavigation ? mobileScroll.value.left : 0),
  top: canvasBounds.value.top - (props.touchNavigation ? mobileScroll.value.top : 0),
}))
function readScroll() {
  return props.touchNavigation ? { ...mobileScroll.value } : { left: viewport.value.scrollLeft, top: viewport.value.scrollTop }
}
function writeScroll({ left, top }) {
  if (props.touchNavigation) mobileScroll.value = { left, top }
  else viewport.value?.scrollTo({ left, top, behavior: 'instant' })
}
const dragging = ref(false)
const sliderValue = ref(null)
const displayedSliderValue = computed(() => sliderValue.value ?? Math.round(zoom.value * 100))
let resizeObserver
let panStart = null
let zoomFrame = 0
let zoomRevision = 0
let zoomGoal = null
let sliderPointer = null
let sliderFrame = 0
let pendingSliderValue = null
const touchPointers = new Map()
let touchOrigin = null
let suppressTouchClick = false
let momentumFrame = 0
let touchSample = null
let touchVelocity = { x: 0, y: 0 }
function stopMomentum() {
  if (momentumFrame) cancelAnimationFrame(momentumFrame)
  momentumFrame = 0
}
function startMomentum() {
  stopMomentum()
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  let previous = performance.now()
  let velocity = { ...touchVelocity }
  function step(now) {
    const element = viewport.value
    if (!element || !props.active || !props.touchNavigation) { momentumFrame = 0; return }
    const dt = Math.min(32, Math.max(1, now - previous))
    previous = now
    const { left, top } = readScroll()
    writeScroll({ left: left + velocity.x * dt, top: top + velocity.y * dt })
    if (Math.abs(readScroll().left - left) < .1) velocity.x = 0
    if (Math.abs(readScroll().top - top) < .1) velocity.y = 0
    const decay = Math.exp(-dt / 220)
    velocity.x *= decay; velocity.y *= decay
    if (Math.hypot(velocity.x, velocity.y) > .02) momentumFrame = requestAnimationFrame(step)
    else momentumFrame = 0
  }
  if (Math.hypot(velocity.x, velocity.y) > .05) momentumFrame = requestAnimationFrame(step)
}

function touchGeometry() {
  const points = [...touchPointers.values()]
  const a = points[0], b = points[1] || a
  const rect = viewport.value.getBoundingClientRect()
  return { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top, distance: Math.hypot(a.x - b.x, a.y - b.y) }
}
function resetTouchOrigin() {
  const element = viewport.value
  touchOrigin = touchPointers.size && element ? {
    ...touchGeometry(), zoom: zoom.value, bounds: canvasBounds.value,
    scroll: readScroll(),
  } : null
}
function startTouch(event) {
  stopMomentum()
  if (touchPointers.size >= 2) return
  if (!touchPointers.size) suppressTouchClick = false
  cancelSliderGesture()
  cancelZoomAnimation()
  touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  resetTouchOrigin()
  touchSample = { x: event.clientX, y: event.clientY, time: performance.now() }
  touchVelocity = { x: 0, y: 0 }
  if (touchPointers.size === 2) {
    event.preventDefault()
    suppressTouchClick = true
    for (const id of touchPointers.keys()) viewport.value.setPointerCapture(id)
  }
}
async function moveTouch(event) {
  if (!touchPointers.has(event.pointerId) || !touchOrigin) return
  touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  const point = touchGeometry()
  const now = performance.now()
  if (touchPointers.size === 1 && touchSample) {
    const dt = Math.max(1, now - touchSample.time)
    touchVelocity = { x: Math.max(-2.5, Math.min(2.5, (touchSample.x - event.clientX) / dt)), y: Math.max(-2.5, Math.min(2.5, (touchSample.y - event.clientY) / dt)) }
  } else touchVelocity = { x: 0, y: 0 }
  touchSample = { x: event.clientX, y: event.clientY, time: now }
  if (!suppressTouchClick && Math.hypot(point.x - touchOrigin.x, point.y - touchOrigin.y) < 5) return
  event.preventDefault()
  suppressTouchClick = true
  dragging.value = true
  const element = viewport.value
  if (!element.hasPointerCapture(event.pointerId)) element.setPointerCapture(event.pointerId)
  const origin = touchOrigin
  const revision = ++zoomRevision
  if (touchPointers.size === 2 && origin.distance > 0) zoom.value = clampTreeZoom(origin.zoom * point.distance / origin.distance)
  await nextTick()
  if (revision !== zoomRevision || touchOrigin !== origin) return
  // 同时保持双指中心下的树图坐标，并跟随中心位移，实现缩放与平移组合手势。
  const scroll = getAnchoredTreeScroll(origin.scroll, origin, origin.bounds, canvasBounds.value, origin.zoom, zoom.value)
  writeScroll({ left: scroll.left + origin.x - point.x, top: scroll.top + origin.y - point.y })
}
function stopTouch(event) {
  if (!touchPointers.delete(event.pointerId)) return
  zoomRevision += 1
  if (viewport.value?.hasPointerCapture(event.pointerId)) viewport.value.releasePointerCapture(event.pointerId)
  resetTouchOrigin()
  dragging.value = touchPointers.size > 0 && suppressTouchClick
  if (touchPointers.size) {
    const point = [...touchPointers.values()][0]
    touchSample = { ...point, time: performance.now() }
    touchVelocity = { x: 0, y: 0 }
  } else if (event.type === 'pointerup' && suppressTouchClick && touchSample && performance.now() - touchSample.time < 100) startMomentum()
}
function clearTouches() {
  stopMomentum()
  const ids = [...touchPointers.keys()]
  touchPointers.clear()
  touchOrigin = null
  dragging.value = false
  for (const id of ids) if (viewport.value?.hasPointerCapture(id)) viewport.value.releasePointerCapture(id)
}
function guardTouchClick(event) {
  if (props.touchNavigation && suppressTouchClick && event.detail !== 0) { event.preventDefault(); event.stopPropagation() }
}

function cancelZoomAnimation() {
  zoomRevision += 1
  if (zoomFrame) cancelAnimationFrame(zoomFrame)
  zoomFrame = 0
  zoomGoal = null
}

async function centerNode(id) {
  stopMomentum()
  cancelSliderGesture()
  cancelZoomAnimation()
  await nextTick()
  const position = layout.value.nodes.find(node => node.id === id)
  const element = viewport.value
  if (!position || !element) return
  writeScroll({
    left: canvasBounds.value.left + (position.x + layout.value.cardWidth / 2) * zoom.value - element.clientWidth / 2,
    top: canvasBounds.value.top + (position.y + layout.value.cardHeight / 2) * zoom.value - element.clientHeight / 2,
    behavior: 'instant',
  })
}
function centerSelected() {
  const expanded = new Set(collapsedIds.value)
  for (const node of getContextPath(props.tree, props.selectedId).slice(0, -1)) expanded.delete(node.id)
  collapsedByTree.value[props.tree.id] = [...expanded]
  return centerNode(props.selectedId)
}
function toggleCollapsed(node) {
  const next = new Set(collapsedIds.value)
  if (next.has(node.id)) next.delete(node.id)
  else next.add(node.id)
  collapsedByTree.value[props.tree.id] = [...next]
  // 折叠仅改变树图，不改写当前会话及其上下文。
  void centerNode(node.id)
}
function expandAll() {
  collapsedByTree.value[props.tree.id] = []
  void centerSelected()
}
async function returnToMainEnd() {
  emit('main-end')
  await nextTick()
  void centerSelected()
}
async function applyZoom(value, anchor, animate = true, origin = null) {
  const element = viewport.value
  const nextZoom = clampTreeZoom(value)
  cancelZoomAnimation()
  if (!element || nextZoom === zoom.value) {
    if (!sliderPointer) sliderValue.value = null
    return
  }
  const revision = zoomRevision
  const startZoom = zoom.value
  const startBounds = origin?.bounds ?? canvasBounds.value
  const startScroll = origin?.scroll ?? readScroll()
  const anchorZoom = origin?.zoom ?? startZoom
  const point = anchor || { x: element.clientWidth / 2, y: element.clientHeight / 2 }
  const duration = animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 260 : 0
  const startedAt = performance.now()
  zoomGoal = nextZoom

  async function renderFrame(now) {
    if (revision !== zoomRevision) return
    const progress = duration ? Math.min(1, (now - startedAt) / duration) : 1
    const eased = 1 - (1 - progress) ** 3
    zoom.value = progress === 1 ? nextZoom : startZoom * (nextZoom / startZoom) ** eased
    await nextTick()
    if (revision !== zoomRevision) return
    const scroll = getAnchoredTreeScroll(startScroll, point, startBounds, canvasBounds.value, anchorZoom, zoom.value)
    writeScroll(scroll)
    if (progress < 1) zoomFrame = requestAnimationFrame(renderFrame)
    else {
      zoomFrame = 0
      zoomGoal = null
      if (!sliderPointer) sliderValue.value = null
    }
  }

  // 同步插值缩放比例和视口位置，保持视觉锚点；连续点击从当前动画位置接续。
  if (duration) zoomFrame = requestAnimationFrame(renderFrame)
  else await renderFrame(startedAt)
}
function changeZoom(amount) {
  const target = Math.round(((zoomGoal ?? zoom.value) + amount) * 100) / 100
  cancelSliderGesture()
  void applyZoom(target)
}
function resetZoom() { cancelSliderGesture(); void applyZoom(1) }
function beginSliderGesture(event) {
  if (event.button !== 0) return
  cancelSliderGesture()
  cancelZoomAnimation()
  const element = viewport.value
  if (!element) return
  sliderValue.value = Math.round(zoom.value * 100)
  sliderPointer = {
    id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false, element: event.currentTarget,
    origin: { zoom: zoom.value, bounds: canvasBounds.value, scroll: readScroll() },
    anchor: { x: element.clientWidth / 2, y: element.clientHeight / 2 },
  }
  event.currentTarget.setPointerCapture(event.pointerId)
}
function queueSliderZoom(value) {
  cancelZoomAnimation()
  pendingSliderValue = value
  if (sliderFrame) return
  sliderFrame = requestAnimationFrame(() => {
    sliderFrame = 0
    const target = pendingSliderValue
    pendingSliderValue = null
    if (target !== null) void applyZoom(target, sliderPointer?.anchor, false, sliderPointer?.origin)
  })
}
function moveSliderGesture(event) {
  if (!sliderPointer || event.pointerId !== sliderPointer.id) return
  if (!sliderPointer.dragging && Math.hypot(event.clientX - sliderPointer.x, event.clientY - sliderPointer.y) > 3) {
    sliderPointer.dragging = true
    queueSliderZoom(sliderValue.value / 100)
  }
}
function inputSlider(event) {
  // 原生滑块持有用户目标值，避免动画中间值反向拉动滑块。
  sliderValue.value = Number(event.currentTarget.value)
  const value = sliderValue.value / 100
  if (sliderPointer?.dragging) queueSliderZoom(value)
  else void applyZoom(value, sliderPointer?.anchor, true, sliderPointer?.origin)
}
async function finishSliderGesture(event) {
  if (sliderPointer && event?.pointerId !== undefined && event.pointerId !== sliderPointer.id) return
  const pointer = sliderPointer
  if (sliderFrame) cancelAnimationFrame(sliderFrame)
  sliderFrame = 0
  const target = pendingSliderValue
  pendingSliderValue = null
  if (target !== null) await applyZoom(target, pointer?.anchor, false, pointer?.origin)
  if (sliderPointer !== pointer) return
  sliderPointer = null
  if (pointer?.element.hasPointerCapture(pointer.id)) pointer.element.releasePointerCapture(pointer.id)
  if (zoomGoal === null) sliderValue.value = null
}
function cancelSliderGesture() {
  const pointer = sliderPointer
  sliderPointer = null
  if (sliderFrame) cancelAnimationFrame(sliderFrame)
  sliderFrame = 0
  pendingSliderValue = null
  sliderValue.value = null
  if (pointer?.element.hasPointerCapture(pointer.id)) pointer.element.releasePointerCapture(pointer.id)
}
function startPan(event) {
  if (props.touchNavigation && event.pointerType === 'touch') { startTouch(event); return }
  // 鼠标、触控笔和单指统一通过指针捕获拖动画布，不使用滚轮或原生滚动。
  if (event.button !== 0 || event.isPrimary === false || panStart || event.target.closest('button')) return
  cancelSliderGesture()
  cancelZoomAnimation()
  const element = viewport.value
  if (!element) return
  event.preventDefault()
  panStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, ...readScroll() }
  element.setPointerCapture(event.pointerId)
  dragging.value = true
}
function movePan(event) {
  if (touchPointers.has(event.pointerId)) { void moveTouch(event); return }
  if (!panStart || event.pointerId !== panStart.pointerId) return
  writeScroll({ left: panStart.left - event.clientX + panStart.x, top: panStart.top - event.clientY + panStart.y })
}
function handleLostCapture(event) {
  // 触点从节点的隐式捕获转交画布时，节点的 lost 事件也会冒泡；此时手势仍有效。
  if (event.target !== event.currentTarget || event.currentTarget.hasPointerCapture(event.pointerId)) return
  stopPan(event)
}
function stopPan(event) {
  if (touchPointers.has(event.pointerId)) { stopTouch(event); return }
  if (!panStart || event.pointerId !== panStart.pointerId) return
  panStart = null
  dragging.value = false
  if (viewport.value?.hasPointerCapture(event.pointerId)) viewport.value.releasePointerCapture(event.pointerId)
}
async function showWholeTree() {
  await nextTick()
  const element = viewport.value
  if (!element) return
  cancelSliderGesture()
  void applyZoom(Math.min(1, element.clientWidth / layout.value.width, element.clientHeight / layout.value.height))
}
async function fitTree() {
  await nextTick()
  if (viewport.value) zoom.value = Math.min(1, Math.max(.6, Math.floor(viewport.value.clientWidth / layout.value.width * 10) / 10))
  void centerSelected()
}
watch(() => props.tree.id, fitTree, { immediate: true })
watch([() => props.tree.id, () => props.selectedId], centerSelected, { immediate: true })
function resumeViewport() {
  resizeObserver?.disconnect()
  if (!props.active) return
  const element = viewport.value
  if (!element) return
  const updateSize = () => {
    if (element.clientWidth && element.clientHeight) viewportSize.value = { width: element.clientWidth, height: element.clientHeight }
  }
  updateSize()
  resizeObserver = new ResizeObserver(updateSize)
  resizeObserver.observe(element)
}
function pauseViewport() {
  clearTouches()
  cancelSliderGesture()
  cancelZoomAnimation()
  if (panStart) stopPan({ pointerId: panStart.pointerId })
  resizeObserver?.disconnect()
}
watch(() => props.touchNavigation, mobile => {
  clearTouches()
  if (mobile && viewport.value) mobileScroll.value = { left: viewport.value.scrollLeft, top: viewport.value.scrollTop }
  else void nextTick(() => writeScroll(mobileScroll.value))
})
watch(viewport, resumeViewport, { flush: 'post' })
watch(() => props.active, active => { if (!active) pauseViewport(); else void nextTick(() => { resumeViewport(); if (props.recenterOnActivate) void centerSelected() }) })
onActivated(() => { void nextTick(resumeViewport) })
onDeactivated(pauseViewport)
onBeforeUnmount(pauseViewport)
</script>

<template>
  <section class="question-tree" :class="{ 'is-paused': !active }" aria-labelledby="question-tree-title">
    <header class="question-tree__header">
      <div><h2 id="question-tree-title">{{ t('问答树') }}</h2><p>{{ t('{value0} 个任务', { value0: tree.nodes.filter(node => node.kind !== 'summary').length }) }}<span>·</span> {{ t('{value0} 条分支', { value0: branches.length }) }}<template v-if="hiddenCount"><span>·</span>{{ t('已收起 {value0} 个', { value0: hiddenCount }) }}</template></p></div>
      <div class="question-tree__header-actions"><button v-if="collapsedIds.size" type="button" class="question-tree__main-end" @click="expandAll">{{ t('全部展开') }}</button><button type="button" class="question-tree__main-end" :disabled="!tree.mainLeafId" @click="returnToMainEnd">{{ t('主干末尾') }}<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v13m-4-4 4 4 4-4" /></svg></button></div>
    </header>
    <div class="question-tree__legend"><span><i class="is-main"></i>{{ t('主干') }}</span><span><i class="is-branch"></i>{{ t('分支') }}</span><span><i class="is-context"></i>{{ t('当前上下文') }}</span></div>

    <div v-if="tree.nodes.length" ref="viewport" class="question-tree__viewport" :class="{ 'is-dragging': dragging, 'is-touch-navigation': touchNavigation }" tabindex="0" :aria-label="touchNavigation ? t('问答树画布，单指拖动定位，双指缩放') : t('问答树画布，按住空白处拖动平移，使用下方控件缩放')" @click.capture="guardTouchClick" @wheel.prevent @pointerdown="startPan" @pointermove="movePan" @pointerup="stopPan" @pointercancel="stopPan" @lostpointercapture="handleLostCapture">
      <div class="question-tree__space" :style="{ width: `${touchNavigation ? viewportSize.width : canvasBounds.width}px`, height: `${touchNavigation ? viewportSize.height : canvasBounds.height}px` }">
        <div class="question-tree__canvas" role="group" :aria-label="t('问答任务树')" :style="{ left: `${canvasPosition.left}px`, top: `${canvasPosition.top}px`, width: `${layout.width}px`, height: `${layout.height}px`, transform: `scale(${zoom})` }">
          <svg class="question-tree__edges" :width="layout.width" :height="layout.height" aria-hidden="true">
            <path v-for="edge in layout.edges" :key="edge.id" :d="edge.path" :class="{ 'is-context': contextIds.includes(edge.id) && contextIds.includes(edge.parentId) }" />
          </svg>
          <div v-for="node in layout.nodes" :key="node.id" class="question-tree__node-group" :style="{ left: `${node.x}px`, top: `${node.y}px`, width: `${layout.cardWidth}px`, height: `${layout.cardHeight}px` }">
          <button
            type="button"
            class="question-tree__node"
            :class="{ 'is-main': node.branchId === 'main', 'is-selected': selectedId === node.id, 'is-context': contextIds.includes(node.id), 'is-generating': node.status === 'generating' }"
            :disabled="node.kind === 'summary'" :aria-pressed="selectedId === node.id" :aria-label="t('查看任务：{value0}', { value0: node.question })" :title="node.question" @click="emit('select', node.id)"
          >
            <span v-if="contextIds.includes(node.id)" class="question-tree__liquid" aria-hidden="true"></span>
            <span class="question-tree__node-top"><span>{{ node.kind === 'summary' ? t('上下文摘要') : node.branchId === 'main' ? t('主干') : t('分支 {value0}', { value0: branches.indexOf(node.branchId) + 1 }) }}<small>{{ String(tree.nodes.findIndex(item => item.id === node.id) + 1).padStart(2, '0') }}</small></span><span v-if="node.collapsed" class="question-tree__collapsed-count">+{{ node.descendantCount }}</span><i v-else :class="{ 'is-generating': node.status === 'generating', 'is-cancelled': ['cancelled', 'superseded', 'failed'].includes(node.status) }" :aria-label="node.status === 'generating' ? t('正在回答') : node.status === 'cancelled' ? t('已停止') : node.status === 'superseded' ? t('已调整方向') : node.status === 'failed' ? t('回答失败') : t('已完成')"></i></span>
            <strong>{{ node.kind === 'summary' ? t('上下文摘要') : node.question }}</strong>
          </button>
          <button v-if="node.descendantCount" type="button" class="question-tree__collapse" :class="{ 'is-collapsed': node.collapsed }" :aria-expanded="!node.collapsed" :aria-label="t('{value0}后续 {value1} 个任务：{value2}', { value0: node.collapsed ? t('展开') : t('折叠'), value1: node.descendantCount, value2: node.question })" :title="t('{value0}后续 {value1} 个任务', { value0: node.collapsed ? t('展开') : t('折叠'), value1: node.descendantCount })" @click.stop="toggleCollapsed(node)"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 8 3 3 3-3" /></svg></button>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="question-tree__empty"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 17v13m0 0H15v14m17-14h17v14" /><rect x="22" y="5" width="20" height="12" rx="5" /><rect x="5" y="44" width="20" height="12" rx="5" /><rect x="39" y="44" width="20" height="12" rx="5" /></svg><p>{{ t('从第一个问题开始') }}</p><span>{{ t('每次问答，都会长成一个节点') }}</span></div>

    <footer v-if="!touchNavigation" class="question-tree__footer">
      <span>{{ t('按住空白处拖动 · 下方控件缩放') }}</span>
      <div class="question-tree__tools" role="group" :aria-label="t('问答树缩放控制')">
        <button type="button" class="question-tree__overview" :aria-label="t('查看整棵问答树')" :title="t('适应画布，查看全树')" :disabled="!tree.nodes.length" @click="showWholeTree">{{ t('全树') }}</button>
        <button type="button" :aria-label="t('缩小问答树')" :title="t('缩小')" :disabled="!tree.nodes.length || zoom <= MIN_TREE_ZOOM" @click="changeZoom(-.1)">−</button>
        <input type="range" :min="MIN_TREE_ZOOM * 100" :max="MAX_TREE_ZOOM * 100" step="1" :value="displayedSliderValue" :disabled="!tree.nodes.length" :aria-label="t('问答树缩放比例')" :aria-valuetext="`${displayedSliderValue}%`" @pointerdown="beginSliderGesture" @pointermove="moveSliderGesture" @pointerup="finishSliderGesture" @pointercancel="finishSliderGesture" @lostpointercapture="finishSliderGesture" @blur="finishSliderGesture()" @input="inputSlider" />
        <button type="button" :aria-label="t('放大问答树')" :title="t('放大')" :disabled="!tree.nodes.length || zoom >= MAX_TREE_ZOOM" @click="changeZoom(.1)">+</button>
        <button type="button" class="question-tree__percentage" :aria-label="t('恢复百分之百缩放')" :title="t('恢复 100%')" :disabled="!tree.nodes.length" @click="resetZoom">{{ Math.round(zoom * 100) }}%</button>
        <button type="button" :aria-label="t('定位当前任务')" :title="t('定位当前任务')" :disabled="!selectedId" @click="centerSelected"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="5" /><path d="M10 2v3m0 10v3M2 10h3m10 0h3" /></svg></button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.question-tree__node:disabled { cursor: default; opacity: .65; border-style: dashed; }
.question-tree { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; border-left: 1px solid #668b7017; background: linear-gradient(145deg, #f2f7f47a, #f6f5fb59); }
.question-tree__header { display: flex; align-items: center; justify-content: space-between; flex: none; gap: 16px; padding: 26px 28px 20px; }
.question-tree__header h2 { margin: 0 0 9px; color: #3d5547; font-size: 15px; font-weight: 600; }
.question-tree__header p { margin: 0; color: #95a198; font-size: 11px; }
.question-tree__header p > span { margin: 0 6px; }
.question-tree__header-actions { display: flex; flex: none; flex-wrap: wrap; justify-content: end; gap: 7px; }
button { font: inherit; cursor: pointer; }
.question-tree__main-end { display: flex; align-items: center; gap: 7px; padding: 8px 10px; color: #7d8c83; background: #ffffff95; border: 1px solid #fff; border-radius: 10px; font-size: 11px; }
.question-tree__main-end svg, .question-tree__tools svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.question-tree__legend { display: flex; flex-wrap: wrap; gap: 16px; flex: none; padding: 0 28px 18px; color: #8b988f; font-size: 10px; }
.question-tree__legend > span { display: inline-flex; align-items: center; gap: 6px; }
.question-tree__legend i { width: 6px; height: 6px; border-radius: 50%; }
.question-tree__legend .is-main { background: #93a69a; }
.question-tree__legend .is-branch { background: #ac9ec9; }
.question-tree__legend .is-context { background: linear-gradient(135deg, #818cf8, #efa5ce); box-shadow: 0 0 0 3px #a59ae01a; }
.question-tree__viewport { flex: 1; min-height: 0; overflow: hidden; touch-action: none; overscroll-behavior: contain; background-image: radial-gradient(#69857920 .7px, transparent .7px); background-size: 18px 18px; cursor: grab; user-select: none; }
.question-tree__viewport.is-touch-navigation { overflow: clip; }
.question-tree__viewport.is-dragging { cursor: grabbing; }
.question-tree__space { position: relative; overflow: hidden; min-width: 100%; min-height: 100%; }
.question-tree__canvas { position: absolute; transform-origin: top left; }
.question-tree__edges { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
.question-tree__edges path { fill: none; stroke: #bcb6d17a; stroke-width: 1.5; transition: stroke .2s; }
.question-tree__edges path.is-context { stroke: #a396cd; stroke-width: 2; }
.question-tree__node-group { position: absolute; }
.question-tree__node { position: absolute; isolation: isolate; overflow: hidden; inset: 0; width: 100%; height: 100%; display: flex; flex-direction: column; gap: 9px; padding: 12px 14px; text-align: left; background: #faf9fef5; border: 1px solid #dcd6e685; border-radius: 14px; box-shadow: 0 5px 12px #3b4f4210, inset 0 1px #fff; transition: background .2s, border-color .2s, box-shadow .2s; }
.question-tree__collapse { position: absolute; display: grid; place-items: center; top: 29px; right: -30px; width: 24px; height: 24px; padding: 0; color: #8a9e91; background: #fafdfbf5; border: 1px solid #cddbd2; border-radius: 50%; box-shadow: 0 2px 6px #395a430c; }
.question-tree__collapse svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; transition: transform .2s; }
.question-tree__collapse.is-collapsed { color: #8d7ea6; background: #f3eef8; border-color: #d7cde4; }
.question-tree__collapse.is-collapsed svg { transform: rotate(-90deg); }
.question-tree__collapse:hover { color: #486c55; border-color: #829e8d; }
.question-tree__collapsed-count { padding: 0 5px; border-radius: 5px; color: #9683ac; background: #e8e1f080; font-size: 9px; line-height: 16px; }
.question-tree__node.is-main { background: #fbfdfcf5; border-color: #d8e2db; }
.question-tree__node.is-context { background: #f0edfc; border-color: #b3a5d8; }
.question-tree__liquid { position: absolute; z-index: 0; inset: 0; overflow: hidden; border-radius: inherit; clip-path: inset(0 round 13px); pointer-events: none; }
.question-tree__liquid::before, .question-tree__liquid::after { position: absolute; inset: -65%; content: ''; pointer-events: none; animation: tree-liquid 8s ease-in-out infinite alternate; }
.question-tree__liquid::before { background: radial-gradient(ellipse at 32% 40%, #818cf86b, #a5b4fc30 42%, transparent 65%); }
.question-tree__liquid::after { background: radial-gradient(ellipse at 68% 62%, #eea0cc7a, #f9bdd72e 44%, transparent 68%); animation-direction: alternate-reverse; animation-duration: 10s; }
.question-tree__node-top, .question-tree__node strong { position: relative; z-index: 1; }
.question-tree.is-paused .question-tree__liquid::before, .question-tree.is-paused .question-tree__liquid::after, .question-tree.is-paused .question-tree__node-top i.is-generating { animation-play-state: paused; }
@keyframes tree-liquid { 0% { transform: translate(-10%, -8%) rotate(-12deg) scale(.94); opacity: .75; } 50% { transform: translate(8%, 6%) rotate(10deg) scale(1.12); opacity: 1; } 100% { transform: translate(-3%, 10%) rotate(-5deg) scale(1); opacity: .8; } }
.question-tree__node.is-selected { background: #eeebfa; border-color: #9280c3; box-shadow: 0 0 0 3px #a59ae026, 0 7px 16px #7970b522; }
.question-tree__node:hover { border-color: #a394c6; box-shadow: 0 7px 18px #395a431c; }
.question-tree__node-top { display: flex; align-items: center; justify-content: space-between; color: #a095b3; font-size: 10px; }
.is-main .question-tree__node-top { color: #8a9d90; }
.is-context .question-tree__node-top { color: #8b7ca7; }
.is-selected .question-tree__node-top { color: #756196; }
.question-tree__node.is-context strong { color: #56506d; }
.question-tree__node-top small { margin-left: 7px; font: inherit; opacity: .65; }
.question-tree__node-top i { width: 5px; height: 5px; background: #89ae99; border-radius: 50%; }
.question-tree__node-top i.is-cancelled { background: #b9a78c; }
.question-tree__node-top i.is-generating { background: #9684be; animation: tree-pulse 1.2s ease infinite alternate; }
.question-tree__node strong { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; color: #5b6c60; font-size: 11px; font-weight: 500; line-height: 1.6; overflow-wrap: anywhere; }
.question-tree__footer { display: flex; align-items: center; justify-content: space-between; flex: none; flex-wrap: wrap; gap: 10px; min-height: 58px; padding: 10px 24px; border-top: 1px solid #668b7010; color: #9ca69f; font-size: 10px; background: #f9fbfc80; }
.question-tree__tools { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; padding: 5px; background: #ffffffc9; border: 1px solid #ffffff; border-radius: 12px; box-shadow: 0 3px 12px #34473e0a; }
.question-tree__tools button { display: grid; place-items: center; flex: none; width: 28px; height: 28px; padding: 0; color: #7e9084; background: transparent; border: 0; border-radius: 7px; font-size: 17px; }
.question-tree__tools button.question-tree__percentage { width: 44px; font-size: 10px; font-variant-numeric: tabular-nums; }
.question-tree__tools input { width: clamp(70px, 8vw, 100px); margin: 0 4px; accent-color: #749582; cursor: pointer; touch-action: none; }
.question-tree__tools input:disabled { cursor: default; opacity: .4; }
.question-tree__tools button.question-tree__overview { width: auto; padding: 0 7px; font-size: 10px; }
.question-tree__tools button:hover:not(:disabled) { background: #e6eee8; }
button:disabled { cursor: default; opacity: .4; }
button:focus-visible, .question-tree__viewport:focus-visible, .question-tree__tools input:focus-visible { outline: 2px solid #8b81b7; outline-offset: -2px; }
.question-tree__empty { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 230px; color: #94a39a; padding: 24px; }
.question-tree__empty svg { width: 58px; height: 58px; margin-bottom: 8px; fill: #f6f9f7; stroke: #a1b8a9; stroke-width: 1.3; }
.question-tree__empty p { margin: 0; font-size: 13px; }
.question-tree__empty span { font-size: 11px; color: #a8b2ab; text-align: center; }
@keyframes tree-pulse { to { opacity: .35; box-shadow: 0 0 0 3px #9684be20; } }
@media (max-width: 900px) { .question-tree { height: 480px; border-left: 0; border-top: 1px solid #668b7017; } .question-tree__header { padding: 22px 22px 18px; } .question-tree__legend { padding-left: 22px; } }
@media (prefers-reduced-motion: reduce) { .question-tree__liquid::before, .question-tree__liquid::after { animation: none; } .question-tree__node-top i.is-generating { animation: none; } .question-tree__node, .question-tree__edges path, .question-tree__collapse svg { transition: none; } }
</style>
