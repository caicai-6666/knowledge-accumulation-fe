<script setup>
import { t, localizedRef, uiText } from '../i18n/index.js'
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, ref, useId, watch } from 'vue'
import { installTreeSelectionDrag } from '../services/treeSelectionDrag.js'
import { usePullToRefresh } from '../composables/usePullToRefresh.js'
import { searchConversationNodes, highlightSearchText } from '../models/conversationSearch.js'
import { getTreeDateGroup, sortTreesByUpdatedAt } from '../models/treeDateGroups.js'
import { useUserAvatar } from '../composables/useUserAvatar.js'
import ConversationContextMenu from './ConversationContextMenu.vue'
import { validateTreeName } from '../services/explorationApi.js'
const explorationIcon = new URL('../assets/exploration.webp', import.meta.url).href

const props = defineProps({
  selectionMode: Boolean,
  selectedIds: { type: Set, default: () => new Set() },
  pinnedIds: { type: Set, default: () => new Set() },
  user: { type: Object, default: null },
  trees: { type: Array, required: true },
  searchRecords: { type: Map, default: () => new Map() },
  searchStatus: { type: Object, default: () => ({}) },
  runningTreeIds: { type: Set, default: () => new Set() },
  unreadTreeIds: { type: Set, default: () => new Set() },
  modelValue: { type: String, required: true },
  active: { type: Boolean, default: true },
  busy: Boolean,
  embedded: Boolean,
  rename: Function,
  refresh: Function,
})
const { imageUrl: userAvatarUrl, failImage: failUserAvatar } = useUserAvatar(() => props.user)
const emit = defineEmits(['update:modelValue', 'create', 'delete', 'select-node', 'retry-search', 'search-mode', 'update:selectionMode', 'update:selectedIds', 'delete-selection', 'pin-selection'])
const allSelectedPinned = computed(() => props.selectedIds.size > 0 && [...props.selectedIds].every(id => props.pinnedIds.has(id)))
function enterSelection() {
  if (props.busy || !props.embedded || !props.trees.length) return
  leaveSearch(); closeContextMenu(); cancelRename(); suppressedClickId = null
  emit('update:selectedIds', new Set()); emit('update:selectionMode', true)
}
function leaveSelection() {
  if (props.busy) return
  emit('update:selectedIds', new Set()); emit('update:selectionMode', false)
}
function toggleSelection(item) {
  const next = new Set(props.selectedIds)
  next.has(item.id) ? next.delete(item.id) : next.add(item.id)
  emit('update:selectedIds', next)
}
function handleEscape(event) {
  if (props.selectionMode) { event.preventDefault(); event.stopPropagation(); leaveSelection() }
  else if (searchMode.value) { event.preventDefault(); event.stopPropagation(); leaveSearch() }
}
const id = useId()
const root = ref(null)
const list = ref(null)
const menu = ref(null)
const trigger = ref(null)
const nameInput = ref(null)
const optionElements = new Map()
const editingId = ref(null), nameDraft = ref(''), renameError = localizedRef(''), saving = ref(false)
const open = ref(false)
const search = ref(''), searchMode = ref(false), searchInput = ref(null)
const settledSearch = ref(''), searchPending = ref(false)
let searchTimer
watch([search, searchMode], ([query, enabled]) => {
  clearTimeout(searchTimer)
  if (!enabled || !query.trim()) { settledSearch.value = ''; searchPending.value = false; return }
  searchPending.value = true
  // 合并连续输入，骨架至少显示 0.5 秒；查询始终只使用本地缓存。
  searchTimer = setTimeout(() => { settledSearch.value = query.trim(); searchPending.value = false }, 500)
}, { flush: 'sync' })
function enterSearch() { if (props.embedded && !searchMode.value) { searchMode.value = true; closeContextMenu(); emit('search-mode', true) } }
function leaveSearch() { search.value = ''; searchMode.value = false; searchInput.value?.blur(); emit('search-mode', false) }
function clearSearch() { search.value = ''; searchInput.value?.focus({ preventScroll: true }) }
function resultDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: 'numeric', day: 'numeric' }).format(new Date(value))
}

const groupNow = ref(new Date())
let dayTimer = 0
const contextItem = ref(null), contextAnchor = ref(null)
let longPressTimer = 0, press = null, suppressedClickId = null
const menuListHeight = ref(null)
const menuHeight = ref(null)
let menuFrame = 0
let renamingComposition = false
let triggerPressOpen = null
let pointerInside = false
const highlighted = ref(0)
const { distance: pullDistance, pulling, refreshing, failed: refreshFailed, progress: pullProgress, refreshNow } = usePullToRefresh(list, {
  active: () => props.embedded && props.active && !searchMode.value && !props.selectionMode && Boolean(props.refresh),
  disabled: () => props.busy || saving.value || Boolean(editingId.value || contextItem.value),
  refresh: () => props.refresh(),
  onPull: cancelLongPress,
})
const allItems = computed(() => props.trees.map(tree => ({
  id: tree.id, title: tree.title, pinned: props.pinnedIds.has(tree.id), updatedAt: tree.updatedAt, unread: props.unreadTreeIds.has(tree.id), running: props.runningTreeIds.has(tree.id), loaded: tree.loaded !== false, count: tree.nodes.filter(node => node.kind !== 'summary').length,
  branches: new Set(tree.nodes.map(node => node.branchId).filter(branch => branch && branch !== 'main')).size,
})))
const items = computed(() => {
  const query = props.embedded ? settledSearch.value : ''
  const filtered = query ? searchConversationNodes(props.searchRecords, props.trees, query).map(hit => ({ ...allItems.value.find(item => item.id === hit.id), ...hit })) : allItems.value
  if (searchMode.value && !query) return []
  if (!props.embedded) return filtered
  const sorted = sortTreesByUpdatedAt(filtered)
  return query ? sorted : sorted.sort((left, right) => Number(right.pinned) - Number(left.pinned))
})
watch([list, () => props.active && props.embedded], ([element, available], _previous, onCleanup) => {
  if (!element || !available) return
  const drag = installTreeSelectionDrag(element, {
    enabled: () => props.active && props.embedded && props.selectionMode && !props.busy,
    items: () => items.value.map(item => item.id), selected: () => props.selectedIds,
    change: value => emit('update:selectedIds', value),
  })
  // 退出多选或条目重排时结束手势，保留本次松手 click 的保护，避免误打开会话。
  const stop = watch([() => props.selectionMode, () => props.busy, () => items.value.map(item => item.id).join(':')], drag.cancel, { flush: 'sync' })
  onCleanup(() => { stop(); drag.dispose() })
}, { flush: 'post' })
const dateHeadings = computed(() => {
  let previous = ''
  return items.value.map(item => {
    const group = item.pinned ? { key: 'pinned', label: '已置顶' } : getTreeDateGroup(item.updatedAt, groupNow.value)
    const heading = group.key === previous ? null : group
    previous = group.key
    return heading
  })
})
function pauseDateGroups() { clearTimeout(dayTimer); dayTimer = 0 }
function refreshDateGroups() {
  pauseDateGroups()
  if (!props.active || !props.embedded) return
  groupNow.value = new Date()
  const tomorrow = new Date(groupNow.value)
  tomorrow.setHours(24, 0, 0, 0)
  dayTimer = setTimeout(refreshDateGroups, tomorrow.getTime() - Date.now() + 50)
}
watch([() => props.active, () => props.embedded], refreshDateGroups, { immediate: true })
onActivated(refreshDateGroups)
onDeactivated(pauseDateGroups)
onBeforeUnmount(pauseDateGroups)
const selected = computed(() => allItems.value.find(item => item.id === props.modelValue))
const optionId = index => `${id}-tree-${index}`

function cancelLongPress() {
  clearTimeout(longPressTimer)
  longPressTimer = 0
  press = null
}
function closeContextMenu() { cancelLongPress(); contextItem.value = null }
function openContextMenu(item, element) {
  if (props.selectionMode || searchMode.value || !props.embedded || props.busy || saving.value || editingId.value || contextItem.value || refreshing.value || pulling.value) return
  cancelLongPress()
  suppressedClickId = item.id
  const rect = element.getBoundingClientRect()
  contextAnchor.value = { left: rect.left, top: rect.top, width: rect.width }
  contextItem.value = item
}
function beginPress(event, item) {
  cancelLongPress()
  suppressedClickId = null
  if (!props.embedded) { event.preventDefault(); return }
  if (props.selectionMode) return
  if (event.button !== 0 || event.isPrimary === false || props.busy || saving.value || editingId.value || refreshing.value || pulling.value) return
  const element = event.currentTarget
  press = { id: item.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY }
  longPressTimer = setTimeout(() => openContextMenu(item, element), 500)
}
function movePress(event) {
  if (press && event.pointerId === press.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) cancelLongPress()
}
function selectOption(event, index) {
  // 长按后的松手 click 不能切换会话；下一次明确按下时才恢复正常轻触。
  if (suppressedClickId === items.value[index]?.id || contextItem.value) { event.preventDefault(); event.stopPropagation(); return }
  choose(index)
}
function handleContextMenu(event, item) {
  if (!props.embedded) return
  event.preventDefault()
  openContextMenu(item, event.currentTarget)
}
function handleContextKey(event, item) {
  if (props.embedded && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
    event.preventDefault(); event.stopPropagation(); openContextMenu(item, event.currentTarget)
  }
}
async function renameFromContext(item) { closeContextMenu(); await nextTick(); void startRename(item) }
function deleteFromContext(item) { closeContextMenu(); requestDelete(item) }

function revealInList(element) {
  const container = list.value
  if (!container?.getBoundingClientRect || !element?.getBoundingClientRect) return
  const bounds = container.getBoundingClientRect(), item = element.getBoundingClientRect()
  if (item.top < bounds.top) container.scrollTop -= bounds.top - item.top
  else if (item.bottom > bounds.bottom) container.scrollTop += item.bottom - bounds.bottom
}
async function updateMenuViewport() {
  await nextTick()
  if ((!open.value && !props.embedded) || typeof window === 'undefined') return
  const rect = menu.value?.getBoundingClientRect?.()
  if (!rect || !list.value) return
  const viewport = window.visualViewport
  const bottom = (viewport?.height || window.innerHeight) + (viewport?.offsetTop || 0)
  const chrome = Math.max(0, menu.value.offsetHeight - list.value.offsetHeight)
  // 使用菜单最终位置和真实标题/边距高度，整体和列表同时限高，避免键盘上方溢出。
  menuHeight.value = Math.max(0, bottom - rect.top - 12)
  menuListHeight.value = Math.max(0, Math.min(props.embedded ? Infinity : 330, menuHeight.value - chrome))
  await nextTick()
  if (editingId.value) revealInList(nameInput.value)
}
function scheduleMenuViewport() {
  if (typeof window === 'undefined' || !window.requestAnimationFrame) { void updateMenuViewport(); return }
  if (menuFrame) return
  menuFrame = window.requestAnimationFrame(() => { menuFrame = 0; void updateMenuViewport() })
}
async function revealHighlighted() {
  await nextTick()
  if (open.value || props.embedded) {
    const element = optionElements.get(highlighted.value)
    revealInList(element)
    element?.focus({ preventScroll: true })
  }
}
function handleRenameKey(event) {
  if (event.isComposing || event.keyCode === 229 || renamingComposition) return
  if (event.key === 'Enter') { event.preventDefault(); void finishRename() }
  else if (event.key === 'Escape') { event.preventDefault(); cancelRename() }
}
function show() {
  if (props.busy) return
  highlighted.value = props.modelValue ? Math.max(0, items.value.findIndex(item => item.id === props.modelValue)) : items.value.length
  open.value = true
  void revealHighlighted()
}
function cancelRename() { if (!saving.value) { renamingComposition = false; editingId.value = null; nameDraft.value = ''; renameError.value = '' } }
function close() { if (saving.value) return; closeContextMenu(); open.value = false; pointerInside = false; cancelRename() }
function rememberTriggerPress() { triggerPressOpen = open.value }
function cancelTriggerPress() { triggerPressOpen = null }
function toggleTrigger(event) {
  // iOS 轻触会先令菜单失焦，再派发 click；按触摸开始时的状态切换，避免先关后开。
  const wasOpen = event?.detail === 0 ? open.value : triggerPressOpen ?? open.value
  triggerPressOpen = null
  if (wasOpen) close()
  else show()
}
function choose(index) {
  if (props.busy || saving.value || editingId.value || refreshing.value || pulling.value || searchPending.value) return
  if (props.selectionMode) { const item = items.value[index]; if (item) toggleSelection(item); return }
  if (index === items.value.length) { close(); emit('create'); return }
  const item = items.value[index]
  if (!item) return
  if (item.nodeId) emit('select-node', { treeId: item.id, nodeId: item.nodeId })
  else if (props.embedded || item.id !== props.modelValue) emit('update:modelValue', item.id)
  close()
}
function handleKey(event) {
  if (event.target?.closest?.('.tree-select__action') && ['Enter', ' '].includes(event.key)) return
  if (event.key === 'Escape' && props.selectionMode) { handleEscape(event); return }
  if (event.key === 'Escape' && searchMode.value) { event.preventDefault(); event.stopPropagation(); leaveSearch(); return }
  if (event.key === 'Escape') { event.preventDefault(); close(); trigger.value?.focus({ preventScroll: true }); return }
  if (event.target?.matches?.('input') || event.target?.closest?.('.tree-select__search-bar')) return
  if (event.key === 'Tab') return
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) return
  event.preventDefault()
  if (props.busy || saving.value || editingId.value) return
  if (!open.value && !props.embedded) { show(); return }
  if (event.key === 'Enter' || event.key === ' ') { choose(highlighted.value); return }
  const last = items.value.length - (props.selectionMode ? 1 : 0)
  if (last < 0) return
  highlighted.value = event.key === 'Home' ? 0 : event.key === 'End' ? last
    : (highlighted.value + (event.key === 'ArrowUp' ? -1 : 1) + last + 1) % (last + 1)
  void revealHighlighted()
}
async function finishRename() {
  if (!editingId.value || saving.value || props.busy || renamingComposition) return false
  const target = editingId.value
  renameError.value = ''
  try {
    const name = validateTreeName(nameDraft.value)
    saving.value = true
    if (await props.rename?.(target, name) === false) return false
    editingId.value = null; nameDraft.value = ''
    await nextTick(); optionElements.get(items.value.findIndex(item => item.id === target))?.focus({ preventScroll: true })
    return true
  } catch (cause) { if (cause.name !== 'AbortError' && cause.status !== 401) renameError.value = cause.message ? cause : uiText('修改名称失败，请重试'); return false }
  finally { saving.value = false }
}
async function startRename(item) {
  if (props.busy || saving.value || !props.rename) return
  if (editingId.value) cancelRename()
  editingId.value = item.id; nameDraft.value = item.title; renameError.value = ''
  await nextTick(); nameInput.value?.focus({ preventScroll: true }); nameInput.value?.select?.(); void updateMenuViewport()
}
function requestDelete(item) { if (!props.busy && !saving.value) { close(); trigger.value?.focus({ preventScroll: true }); emit('delete', item.id) } }
function rememberInternalPointer() { pointerInside = true }
function rememberKeyboard() { pointerInside = false }
function clickOutside(event) {
  pointerInside = Boolean(root.value?.contains(event.target))
  if (!pointerInside) close()
}
function focusOut(event) {
  if (editingId.value || contextItem.value) return
  // Safari 触摸按钮以及替换为改名输入框时，relatedTarget 可能为空；内部操作不代表离开菜单。
  if (!event.relatedTarget && pointerInside) return
  if (!root.value?.contains(event.relatedTarget)) close()
}
watch(() => open.value || (props.embedded && props.active), (visible, _previous, onCleanup) => {
  if (!visible) return
  if (!props.embedded) document.addEventListener('pointerdown', clickOutside)
  const browser = typeof window === 'undefined' ? null : window
  browser?.addEventListener('resize', scheduleMenuViewport)
  browser?.visualViewport?.addEventListener('resize', scheduleMenuViewport)
  browser?.visualViewport?.addEventListener('scroll', scheduleMenuViewport)
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMenuViewport)
  if (trigger.value) observer?.observe(trigger.value)
  scheduleMenuViewport()
  onCleanup(() => {
    document.removeEventListener('pointerdown', clickOutside)
    browser?.removeEventListener('resize', scheduleMenuViewport)
    browser?.visualViewport?.removeEventListener('resize', scheduleMenuViewport)
    browser?.visualViewport?.removeEventListener('scroll', scheduleMenuViewport)
    observer?.disconnect()
    if (menuFrame) browser?.cancelAnimationFrame(menuFrame)
    menuFrame = 0
    menuListHeight.value = null
    menuHeight.value = null
  })
}, { flush: 'sync' })
watch(() => props.active, active => { if (!active) { open.value = false; closeContextMenu(); leaveSearch(); cancelRename(); emit('update:selectedIds', new Set()); emit('update:selectionMode', false) } })
watch(() => props.selectionMode, async value => {
  if (value) { leaveSearch(); closeContextMenu(); cancelRename(); suppressedClickId = null }
  await nextTick()
  if (props.active && props.embedded) root.value?.querySelector(value ? '.tree-select__selection-close' : '.tree-select__manage')?.focus({ preventScroll: true })
})
watch(search, () => { closeContextMenu(); cancelRename() })
watch(() => [props.busy, props.embedded], () => { closeContextMenu() })
watch(() => props.trees, value => {
  const available = new Set(value.map(tree => tree.id))
  const next = new Set([...props.selectedIds].filter(id => available.has(id)))
  if (next.size !== props.selectedIds.size) emit('update:selectedIds', next)
})
watch(items, value => {
  highlighted.value = Math.min(highlighted.value, value.length)
  if (contextItem.value && !value.some(item => item.id === contextItem.value.id)) closeContextMenu()
  if (press && !value.some(item => item.id === press.id)) cancelLongPress()
})
function hide() { closeContextMenu(); leaveSearch(); open.value = false; pointerInside = false; cancelTriggerPress(); cancelRename() }
onDeactivated(hide)
onBeforeUnmount(hide)
</script>

<template>
  <div ref="root" class="tree-select" :class="{ 'is-open': open, 'is-embedded': embedded, 'is-searching': searchMode, 'is-selecting': selectionMode }" @pointerdown.capture="rememberInternalPointer" @keydown.capture="rememberKeyboard" @focusout="focusOut" @keydown.esc="handleEscape">
    <button v-if="!embedded" ref="trigger" type="button" class="tree-select__trigger" :disabled="busy" :class="{ 'is-open': open }" :aria-label="t('选择问答树')" aria-haspopup="menu" :aria-expanded="open" :aria-controls="`${id}-list`" @pointerdown="rememberTriggerPress" @pointercancel="cancelTriggerPress" @click="toggleTrigger" @keydown="handleKey">
      <img v-if="!modelValue" class="tree-select__create-icon" :src="explorationIcon" alt="" width="24" height="24" />
      <span class="tree-select__value">{{ !modelValue ? t('开始新探索') : selected?.title || t('选择问答树') }}</span>
      <svg class="tree-select__chevron" :class="{ 'is-open': open }" viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>
    </button>
    <Transition name="tree-select-menu">
      <div v-if="open || embedded" ref="menu" class="tree-select__menu" :style="menuHeight !== null ? { maxHeight: `${menuHeight}px` } : undefined">
        <div v-if="embedded" class="tree-select__toolbar">
        <Transition name="tree-selection-header"><div v-if="selectionMode" class="tree-select__selection-header"><span>{{ selectedIds.size ? t('已选择 {value0} 棵问答树', { value0: selectedIds.size }) : t('选择问答树') }}</span><button type="button" class="tree-select__selection-close" :disabled="busy" :aria-label="t('退出多选')" @click="leaveSelection"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div></Transition>
        <div class="tree-select__search-bar" :inert="selectionMode" :aria-hidden="selectionMode">
          <button type="button" class="tree-select__search-back" :tabindex="searchMode ? 0 : -1" :aria-hidden="!searchMode" :disabled="!searchMode" :aria-label="t('返回问答树列表')" @click="leaveSearch"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7" /></svg></button>
          <label class="tree-select__search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input ref="searchInput" v-model="search" @focus="enterSearch" type="search" enterkeyhint="search" autocomplete="off" :disabled="saving" :aria-label="t('搜索问题和回答')" :placeholder="t('搜索问题和回答…')" /><button v-if="searchMode && search" type="button" class="tree-select__search-clear" :aria-label="t('清空搜索')" @pointerdown.prevent @click="clearSearch"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8" /></svg></button></label>
          <button type="button" :aria-hidden="searchMode" :tabindex="searchMode ? -1 : 0" :id="optionId(items.length)" :ref="element => { if (element) optionElements.set(items.length, element); else optionElements.delete(items.length) }" data-drawer-initial-focus class="tree-select__new" @focus="highlighted = items.length" @keydown="handleKey" :disabled="busy || saving || searchMode" :aria-label="t('开始新探索')" :title="t('开始新探索')" @click="choose(items.length)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
        </div>
        </div>
        <div v-if="embedded && searchMode" class="tree-select__search-info" role="status">
          <span v-if="searchStatus.indexing">{{ t('正在缓存对话（{value0}/{value1}）', { value0: searchStatus.ready, value1: searchStatus.total }) }}</span>
          <span v-else-if="searchStatus.failed || searchStatus.ready < searchStatus.total">{{ t('部分对话未缓存，当前仅搜索已缓存内容') }} <button type="button" @click="$emit('retry-search')">{{ t('重试') }}</button></span>
          <span v-if="searchStatus.memoryOnly">{{ t('浏览器无法保存缓存，仅本次访问可用') }}</span>
        </div>
        <div v-if="embedded && refresh" class="tree-select__refresh" :class="{ 'is-pulling': pulling, 'is-refreshing': refreshing }" :style="{ height: `${pullDistance}px` }">
          <svg viewBox="0 0 32 32" role="progressbar" :aria-label="t('刷新问答树列表')" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="refreshing ? undefined : Math.round(pullProgress * 100)" :style="{ opacity: Math.min(1, pullDistance / 18) }"><line v-for="bar in 12" :key="bar" x1="16" y1="3" x2="16" y2="8" :transform="`rotate(${(bar - 1) * 30} 16 16)`" :class="{ 'is-dark': bar <= Math.floor(pullProgress * 12) }" :style="{ animationDelay: `${(bar - 1) / 12 - 1}s` }" /></svg>
        </div>
        <button v-if="embedded && refreshFailed" type="button" class="tree-select__refresh-error" @click="refreshNow">{{ t('刷新失败，点击重试') }}</button>
        <div v-if="!embedded" class="tree-select__heading"><span>{{ t('选择问答树') }}</span><span>{{ t('{value0} 个会话', { value0: items.length }) }}</span></div>
        <div :id="`${id}-list`" ref="list" class="tree-select__list" :style="menuListHeight !== null ? { maxHeight: `${menuListHeight}px` } : undefined" role="menu" :aria-busy="searchPending" :aria-label="t('问答树列表')" @keydown="handleKey" @scroll="cancelLongPress">
          <div v-if="searchPending" class="tree-select__skeletons" role="status" :aria-label="t('正在搜索本地对话')"><div v-for="row in 5" :key="row" class="tree-select__skeleton" aria-hidden="true"><span class="tree-select__skeleton-icon"></span><span class="tree-select__skeleton-lines"><span></span><span></span></span><span class="tree-select__skeleton-date"></span></div></div>
          <template v-else>
          <template v-for="(item, index) in items" :key="item.key || item.id">
            <div v-if="embedded && !searchMode && dateHeadings[index]" class="tree-select__group-heading" :class="{ 'is-after-pinned': index > 0 && !item.pinned && items[index - 1].pinned }"><h3 class="tree-select__date-group">{{ t(dateHeadings[index].label, dateHeadings[index].values) }}</h3><button v-if="index === 0 && !selectionMode" type="button" class="tree-select__manage" :disabled="busy || saving" :aria-label="t('选择问答树')" :title="t('选择问答树')" @click="enterSelection"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="6" r="2" /><circle cx="5" cy="18" r="2" /><path d="M11 6h10M11 18h10" /></svg></button></div>
          <div class="tree-select__row" role="presentation" :class="{ 'is-editing': editingId === item.id }">
            <template v-if="editingId === item.id">
              <input :ref="element => { nameInput = element }" v-model="nameDraft" class="tree-select__name-input" :aria-label="t('问答树名称')" :aria-invalid="Boolean(renameError)" :aria-describedby="renameError ? `${id}-rename-error` : undefined" maxlength="200" enterkeyhint="done" autocomplete="off" :spellcheck="false" :disabled="saving || busy" @compositionstart="renamingComposition = true" @compositionend="renamingComposition = false" @keydown.stop="handleRenameKey" />
              <button type="button" class="tree-select__action tree-select__save" :disabled="saving || busy" :aria-label="t('保存问答树名称')" @pointerdown.prevent @click="finishRename"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10.5 3.5 3.5L16 5.5" /></svg></button>
              <p v-if="renameError" :id="`${id}-rename-error`" class="tree-select__error" role="alert">{{ renameError }}</p>
            </template>
            <template v-else>
              <button :id="optionId(index)" :ref="element => { if (element) optionElements.set(index, element); else optionElements.delete(index) }" type="button" :data-tree-selection-id="selectionMode ? item.id : undefined" class="tree-select__option" :class="{ 'is-selected': item.id === modelValue, 'is-highlighted': index === highlighted }" :role="selectionMode ? 'menuitemcheckbox' : 'menuitemradio'" :aria-checked="selectionMode ? selectedIds.has(item.id) : item.id === modelValue" :disabled="busy" :tabindex="embedded ? 0 : -1" @focus="highlighted = index" @pointermove="highlighted = index; movePress($event)" @pointerdown="beginPress($event, item)" @pointerup="cancelLongPress" @pointercancel="cancelLongPress" @pointerleave="cancelLongPress" @contextmenu="handleContextMenu($event, item)" @keydown="handleContextKey($event, item)" @click="selectOption($event, index)">
                <Transition name="tree-selection-circle"><span v-if="selectionMode" class="tree-select__selection-circle" @touchstart.stop.prevent @touchmove.stop.prevent @touchend.stop.prevent :class="{ 'is-checked': selectedIds.has(item.id) }" aria-hidden="true"><svg v-if="selectedIds.has(item.id)" viewBox="0 0 20 20"><path d="m5 10 3 3 7-7" /></svg></span></Transition>
                <span v-if="item.nodeId" class="tree-select__result-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 18.5 3 21v-6A9 9 0 1 1 6 18.5Z" /><path d="M7 9h10M7 13h6" /></svg><span v-if="item.source === 'question'" class="tree-select__result-avatar" role="img" :aria-label="t('{value0}的头像', { value0: user?.name || user?.userid || t('用户') })"><img v-if="userAvatarUrl" :src="userAvatarUrl" alt="" @error="failUserAvatar(userAvatarUrl)" /><svg v-else viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg></span></span>
                <span class="tree-select__option-content"><span class="tree-select__title-row"><span class="tree-select__title"><template v-for="(part, partIndex) in highlightSearchText(item.title, item.nodeId ? search : '')" :key="partIndex"><strong v-if="part.match">{{ part.text }}</strong><template v-else>{{ part.text }}</template></template></span><time v-if="item.nodeId" class="tree-select__result-date" :datetime="item.updatedAt">{{ resultDate(item.updatedAt) }}</time><span v-else class="tree-select__status"><span v-if="item.running" class="tree-select__spinner" role="img" :aria-label="t('正在生成回答')" :title="t('正在生成回答')"></span><span v-else-if="item.unread" class="tree-select__unread" role="img" :aria-label="t('有新的回答')" :title="t('有新的回答')"></span></span></span><span v-if="item.nodeId" class="tree-select__excerpt"><template v-for="(part, partIndex) in highlightSearchText(item.excerpt, search)" :key="partIndex"><strong v-if="part.match">{{ part.text }}</strong><template v-else>{{ part.text }}</template></template></span><span v-if="item.loaded && !embedded" class="tree-select__meta">{{ t('{value0} 个任务', { value0: item.count }) }}<span aria-hidden="true">·</span>{{ t('{value0} 条分支', { value0: item.branches }) }}</span></span>
                <svg v-if="item.id === modelValue" class="tree-select__check" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3 3 7-7" /></svg>
              </button>
              <button v-if="rename && !embedded" type="button" class="tree-select__action tree-select__rename" role="menuitem" :disabled="busy || saving" :aria-label="t('重命名问答树：{value0}', { value0: item.title })" :title="t('重命名')" @click.stop="startRename(item)"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.7 4.1 3.2 3.2M4 16l2.8-.6 8.4-8.4a1.8 1.8 0 0 0 0-2.5 1.8 1.8 0 0 0-2.5 0l-8.4 8.4L4 16Z" /></svg></button>
              <button v-if="!embedded" type="button" class="tree-select__action tree-select__delete" role="menuitem" :disabled="busy || saving" :aria-label="t('删除问答树：{value0}', { value0: item.title })" :title="t('删除问答树')" @click.stop="requestDelete(item)"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5h13M7.5 5.5v-2h5v2M5 5.5l.7 11h8.6l.7-11M8 8.5v5M12 8.5v5" /></svg></button>
            </template>
          </div>
          </template>
          <p v-if="embedded && !items.length && (!searchMode || search.trim())" class="tree-select__empty">{{ searchMode ? t('缓存中暂无匹配的对话') : t('暂无历史对话') }}</p>
          <button v-if="!embedded" :id="optionId(items.length)" :ref="element => { if (element) optionElements.set(items.length, element); else optionElements.delete(items.length) }" :disabled="busy || saving" type="button" class="tree-select__create" :class="{ 'is-highlighted': highlighted === items.length }" role="menuitemradio" :aria-checked="!modelValue" :tabindex="embedded ? 0 : -1" @focus="highlighted = items.length" @pointermove="highlighted = items.length" @pointerdown.prevent @click="choose(items.length)">
            <img class="tree-select__create-icon" :src="explorationIcon" alt="" width="24" height="24" />
            <span>{{ t('开始新探索') }}</span>
          </button>
          </template>
        </div>
        <div v-if="embedded && selectionMode" class="tree-select__selection-actions" role="group" :aria-label="t('批量操作问答树')"><button type="button" :disabled="busy || !selectedIds.size" @click="$emit('pin-selection', { ids: [...selectedIds], pinned: !allSelectedPinned })"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l-1 1v5l3 3v2H6v-2l3-3V4L8 3ZM12 14v7" transform="rotate(35 12 12)" /></svg><span>{{ allSelectedPinned ? t('取消置顶') : t('置顶') }}</span></button><span class="tree-select__selection-divider" aria-hidden="true"></span><button type="button" class="tree-select__selection-delete" :disabled="busy || !selectedIds.size" @click="$emit('delete-selection', [...selectedIds])"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" /></svg><span>{{ t('删除') }}</span></button></div>
      </div>
    </Transition>
    <ConversationContextMenu v-if="contextItem" :item="contextItem" :anchor="contextAnchor" :can-rename="Boolean(rename)" @close="closeContextMenu" @rename="renameFromContext" @delete="deleteFromContext" />
  </div>
</template>

<style scoped>
.tree-select__search-info { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 5px; padding: 0 8px 10px; color: #96979d; font-size: 12px; line-height: 1.5; }
.tree-select__search-info button { color: #6d648c; background: transparent; border: 0; padding: 2px 4px; }
.tree-select__excerpt { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: #85868b; font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.tree-select__search-back { display: grid; place-items: center; flex: none; overflow: hidden; width: 0; height: 42px; padding: 0; opacity: 0; pointer-events: none; transform: translateX(-8px); transition: width .28s, margin .28s, opacity .2s, transform .28s; color: #202123; border: 0; background: transparent; }
.tree-select__search-clear { display: grid; place-items: center; flex: none; width: 20px; height: 20px; padding: 0; color: white; border: 0; border-radius: 50%; background: #a0a1a5; }
.tree-select__search .tree-select__search-clear svg { width: 16px; height: 16px; color: #fff; stroke: #fff; stroke-width: 2; }
.is-searching input::-webkit-search-cancel-button { display: none; }
.is-searching .tree-select__search-back { width: 28px; margin-right: 8px; opacity: 1; pointer-events: auto; transform: none; }
.is-searching .tree-select__new { width: 0; padding: 0; margin-left: 0; opacity: 0; pointer-events: none; transform: scale(.7); }
.tree-select__skeleton { display: flex; align-items: flex-start; gap: 12px; min-height: 76px; padding: 12px 0; }
.tree-select__skeleton-icon, .tree-select__skeleton-lines > span, .tree-select__skeleton-date { position: relative; overflow: hidden; background: #f0f0f2; }
.tree-select__skeleton-icon { flex: none; width: 40px; height: 40px; border-radius: 50%; }
.tree-select__skeleton-lines { flex: 1; display: flex; flex-direction: column; gap: 11px; padding-top: 3px; }
.tree-select__skeleton-lines > span { display: block; width: 64%; height: 13px; border-radius: 5px; }
.tree-select__skeleton-lines > span:last-child { width: 94%; height: 11px; }
.tree-select__skeleton:nth-child(even) .tree-select__skeleton-lines > span:first-child { width: 82%; }
.tree-select__skeleton-date { width: 30px; height: 10px; border-radius: 4px; margin-top: 5px; }
.tree-select__skeleton-icon::after, .tree-select__skeleton-lines > span::after, .tree-select__skeleton-date::after { position: absolute; inset: 0; content: ''; background: linear-gradient(90deg, transparent, #ffffffa3, transparent); transform: translateX(-100%); animation: search-skeleton-shimmer 1.1s infinite; }
@keyframes search-skeleton-shimmer { to { transform: translateX(100%); } }
.is-searching .tree-select__row { animation: search-result-enter .2s ease both; }
@keyframes search-result-enter { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .tree-select__skeletons *, .tree-select__skeletons *::after, .is-searching .tree-select__row { animation: none; } }
.is-searching .tree-select__refresh { display: none; }
.is-searching .tree-select__list { padding-bottom: 12px; mask-image: none; -webkit-mask-image: none; }
.is-searching .tree-select__option { align-items: flex-start; gap: 12px; padding: 12px 0; min-height: 64px; }
.is-searching .tree-select__excerpt { display: block; white-space: nowrap; text-overflow: ellipsis; }
.tree-select__result-icon { position: relative; display: grid; place-items: center; flex: none; width: 40px; height: 40px; border: 1px solid #e5e5e7; border-radius: 50%; color: #888a90; }
.tree-select__result-icon > svg { width: 23px; height: 23px; }
.tree-select__result-icon .tree-select__result-avatar { position: absolute; width: 18px; height: 18px; right: -3px; bottom: -3px; display: grid; place-items: center; overflow: hidden; border-radius: 50%; color: #87988e; background: #eef2ef; }
.tree-select__result-avatar img { width: 100%; height: 100%; object-fit: cover; }
.tree-select__result-avatar svg { width: 14px; height: 14px; }
.tree-select__result-date { flex: none; font-size: 12px; color: #b2b3b7; }
.tree-select__excerpt strong, .tree-select__title strong { font-weight: 600; color: #202123; }
.tree-select__row { position: relative; }
.tree-select__action { position: absolute; top: 50%; display: grid; place-items: center; width: 27px; height: 28px; padding: 4px; color: #89958d; background: transparent; border: 0; border-radius: 6px; opacity: 0; pointer-events: none; transform: translateY(-50%); transition: opacity .18s, color .18s, background .18s; }
.tree-select__rename { right: 34px; }
.tree-select__delete, .tree-select__save { right: 5px; }
.tree-select__row:is(:hover, :focus-within) .tree-select__action { opacity: 1; pointer-events: auto; }
@media (hover: hover) and (pointer: fine) { .tree-select__action:hover { color: #405047; background: #ffffffb8; } }
@media (hover: hover) and (pointer: fine) { .tree-select__delete:hover { color: #b05c58; background: #f8eae8; } }
.tree-select__action svg { width: 16px !important; height: 16px !important; }
.tree-select__action:focus-visible, .tree-select__option:focus-visible, .tree-select__create:focus-visible { outline: 2px solid #9285ba; outline-offset: -2px; }
.tree-select__row.is-editing { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 4px; }
.tree-select__name-input { width: calc(100% - 35px); min-width: 0; padding: 9px 10px; color: #405047; background: #ffffffd9; border: 1px solid #c8d8ce; border-radius: 8px; font: inherit; font-size: 12px; outline-color: #9285ba; }
.tree-select__row.is-editing .tree-select__save { position: static; flex: none; opacity: 1; pointer-events: auto; transform: none; }
.tree-select__error { flex-basis: 100%; margin: 2px 5px 0; color: #ad6259; font-size: 11px; line-height: 1.6; }
@media (hover: none) { .tree-select__action { opacity: 1; pointer-events: auto; } .tree-select__check { display: none; } }

.tree-select { position: relative; width: min(380px, 100%); }
.tree-select button { font: inherit; cursor: pointer; }
.tree-select__trigger { display: flex; align-items: center; gap: 10px; width: 100%; min-width: 0; min-height: 50px; padding: 10px 12px; color: #3e5547; background: linear-gradient(120deg, #ffffffdb, #f1f5f2a3); border: 1px solid #ffffffed; border-radius: 13px; box-shadow: inset 0 1px #fff, 0 3px 12px #34473e08; transition: border-color .2s, box-shadow .2s, background .2s; }
.tree-select__trigger.is-open { border-color: #c5d5ca; background: #ffffffeb; box-shadow: inset 0 1px #fff, 0 4px 16px #34473e0d; }
.tree-select svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.tree-select__value { flex: 1; min-width: 0; overflow: hidden; font-size: 14px; font-weight: 600; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.tree-select__chevron { flex: none; color: #86968c; transition: transform .2s; }
.tree-select__chevron.is-open { transform: rotate(180deg); }
.tree-select__menu { display: flex; flex-direction: column; position: absolute; z-index: 20; top: calc(100% + 9px); left: 0; width: 100%; padding: 8px; overflow: hidden; background: #fcfdfcfa; border: 1px solid #ffffff; border-radius: 17px; box-shadow: 0 18px 45px #263d3324, 0 3px 10px #263d330a; transform-origin: top; }
.tree-select__heading { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 9px 12px; color: #8b9a90; font-size: 10px; }
.tree-select__heading > span:last-child { color: #a3afa7; }
.tree-select__list { flex: 0 1 auto; max-height: min(330px, calc(100vh - 300px)); max-height: min(330px, calc(100dvh - 300px)); min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #b8c8bf55 transparent; }
.tree-select__option { padding-right: 94px; display: flex; align-items: center; gap: 12px; width: 100%; margin: 2px 0; padding: 12px 94px 12px 11px; text-align: left; color: #526759; background: transparent; border: 1px solid transparent; border-radius: 10px; transition: background .16s, border-color .16s; }
.tree-select__option.is-selected { color: #365744; }
.tree-select__option-content { display: flex; flex: 1; flex-direction: column; gap: 5px; min-width: 0; }
.tree-select__title-row { display: flex; align-items: center; gap: 7px; min-width: 0; }
.tree-select__status { position: absolute; right: 70px; top: 50%; display: grid; place-items: center; width: 12px; height: 12px; transform: translateY(-50%); pointer-events: none; }
.tree-select__spinner { box-sizing: border-box; width: 11px; height: 11px; border: 1.5px solid #4b98ed38; border-top-color: #4b98ed; border-radius: 50%; animation: tree-status-spin .85s linear infinite; }
@keyframes tree-status-spin { to { transform: rotate(360deg); } }
.tree-select__unread { width: 7px; height: 7px; border-radius: 50%; background: #4b98ed; box-shadow: 0 0 0 3px #4b98ed12; }
.tree-select__title { flex: 1; min-width: 0; font-size: 12px; font-weight: 550; line-height: 1.5; overflow-wrap: anywhere; }
.tree-select__meta { display: flex; align-items: center; gap: 7px; color: #9aa79e; font-size: 10px; line-height: 1.4; }
.tree-select__option.is-selected .tree-select__meta { color: #84998a; }
.tree-select__create { display: flex; align-items: center; gap: 10px; width: 100%; margin-top: 7px; padding: 13px 11px 7px; color: #6d648c; background: transparent; border: 0; border-top: 1px solid #718b7b1a; text-align: left; font-size: 12px; font-weight: 550; border-radius: 0 0 9px 9px; }
.tree-select__create-icon { flex: none; width: 24px; height: 24px; object-fit: contain; }
.tree-select__check { position: absolute; right: 16px; color: #5a8c6b; }
.tree-select__row:is(:hover, :focus-within) .tree-select__check { opacity: 0; }
.tree-select__trigger:focus-visible { outline: 2px solid #9285ba; outline-offset: 3px; }
.tree-select__trigger:disabled { opacity: .45; cursor: default; }
.tree-select-menu-enter-active, .tree-select-menu-leave-active { transition: opacity .16s, transform .16s; }
.tree-select-menu-enter-from, .tree-select-menu-leave-to { opacity: 0; transform: translateY(-5px) scale(.985); }
@media (prefers-reduced-motion: reduce) { .tree-select__spinner { animation: none; } .tree-select *, .tree-select-menu-enter-active, .tree-select-menu-leave-active { transition: none; } }
@media (max-width: 900px) { .tree-select__name-input { font-size: 16px; } }

.tree-select.is-embedded { display: flex; flex: 1; min-height: 0; width: 100%; }
.is-embedded .tree-select__menu { --tree-toolbar-height: 62px; position: static; width: 100%; max-height: none !important; padding: 12px 16px 0; border: 0; border-radius: 0; box-shadow: none; background: transparent; }
.is-embedded .tree-select__list { flex: 1; max-height: none !important; margin-top: calc(-1 * var(--tree-toolbar-height)); padding-top: var(--tree-toolbar-height); padding-bottom: 72px; }
/* 列表延伸到固定账户区底部，独立遮罩让不支持背景模糊的客户端也能逐渐淡出文字。 */
.is-embedded:not(.is-searching):not(.is-selecting) .tree-select__list { padding-bottom: calc(var(--mobile-account-height, 76px) + 28px); -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 104px), #000c calc(100% - 72px), #0003 calc(100% - 36px), transparent); mask-image: linear-gradient(to bottom, #000 calc(100% - 104px), #000c calc(100% - 72px), #0003 calc(100% - 36px), transparent); }
.tree-select__refresh { position: relative; z-index: 1; display: grid; place-items: center; flex: none; overflow: hidden; transition: height .32s cubic-bezier(.22, 1, .36, 1); }
.tree-select__refresh.is-pulling { transition: none; }
.tree-select__refresh svg { width: 30px; height: 30px; overflow: visible; transition: opacity .22s ease; }
.tree-select__refresh.is-pulling svg { transition: none; }
.tree-select__refresh line { stroke: #d9dce0; stroke-width: 2.5; stroke-linecap: round; transition: stroke .08s linear; }
.tree-select__refresh line.is-dark { stroke: #676b72; }
.tree-select__refresh.is-refreshing line { stroke: #676b72; animation: pull-refresh-bar-fade 1s linear infinite; }
.tree-select__refresh-error { position: relative; z-index: 1; flex: none; padding: 10px; color: #a16c57; background: transparent; border: 0; font-size: 12px; }
@keyframes pull-refresh-bar-fade { from { opacity: 1; } to { opacity: .18; } }
@media (prefers-reduced-motion: reduce) { .tree-select__refresh { transition: none; } .tree-select__refresh.is-refreshing line { animation: none; } }
.tree-select__toolbar { position: relative; z-index: 2; flex: none; height: var(--tree-toolbar-height); }
.tree-select__toolbar::before { position: absolute; z-index: -1; inset: -12px -16px -18px; content: ''; pointer-events: none; background: linear-gradient(to bottom, #fffffff5, #ffffffd9 65%, #ffffff00); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); -webkit-mask-image: linear-gradient(to bottom, #000 65%, transparent); mask-image: linear-gradient(to bottom, #000 65%, transparent); }
.tree-select__toolbar .tree-select__search-bar { height: 100%; }
.is-selecting .tree-select__search-bar { opacity: 0; pointer-events: none; }
.tree-select__search-bar { transition: opacity .22s ease; display: flex; align-items: center; flex: none; gap: 0; padding-bottom: 14px; }
.tree-select__search { display: flex; align-items: center; flex: 1; gap: 9px; min-width: 0; padding: 12px 14px; background: #f7f7f8; border: 1px solid #f0f0f1; border-radius: 28px; box-shadow: 0 10px 28px #00000016, 0 2px 8px #00000008; }
.tree-select__search svg { flex: none; width: 19px; height: 19px; color: #96979d; }
.tree-select__search input { width: 100%; min-width: 0; overflow: hidden; padding: 0; color: #202123; background: transparent; border: 0; outline: none; font: inherit; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
.tree-select__search input::placeholder { color: #96979d; }
.tree-select__new { display: grid; place-items: center; flex: none; width: 42px; height: 42px; margin-left: 8px; overflow: hidden; padding: 10px; transition: width .28s, padding .28s, margin .28s, opacity .2s, transform .28s; color: #62646c; background: #f1f1f3; border: 0; border-radius: 50%; box-shadow: 0 8px 22px #0000001a, 0 2px 7px #0000000a; }
.tree-select__new:disabled, .tree-select__selection-close:disabled { opacity: .45; cursor: default; }
.tree-select__new svg { width: 22px; height: 22px; }
.is-embedded .tree-select__heading { padding: 0 4px 8px; color: #96979d; font-size: 13px; }
.is-embedded .tree-select__option { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; touch-action: pan-y; min-height: 46px; margin: 0; padding: 11px 8px; color: #202123; border: 0; border-radius: 10px; }
.is-embedded .tree-select__option.is-selected { color: #202123; }
.is-embedded .tree-select__title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; font-weight: 400; line-height: 24px; }
.is-embedded .tree-select__check { display: none; }
.is-embedded .tree-select__status { position: static; width: auto; transform: none; }
.is-embedded .tree-select__action { display: none; }
.is-embedded .tree-select__save { display: grid; opacity: 1; pointer-events: auto; }
.is-embedded .tree-select__name-input { font-size: 16px; }
.tree-select__date-group { margin: 0; color: #96979d; font-size: 13px; font-weight: 400; line-height: 20px; }
.tree-select__group-heading { display: flex; align-items: center; justify-content: space-between; min-height: 24px; margin: 24px 8px 9px; }
.tree-select__group-heading:first-child { margin-top: 4px; }
.tree-select__group-heading.is-after-pinned { padding-top: 24px; border-top: 1px solid #e9e9ec; }
.tree-select__manage { display: grid; place-items: center; width: 36px; height: 36px; padding: 7px; margin: -6px -6px -6px 0; color: #96979d; background: transparent; border: 0; border-radius: 50%; }
.tree-select__selection-header { position: absolute; inset: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 4px 14px; color: #202123; font-size: 16px; }
.tree-selection-header-enter-active, .tree-selection-header-leave-active { transition: opacity .28s ease; }
.tree-selection-header-enter-from, .tree-selection-header-leave-to { opacity: 0; pointer-events: none; }
.tree-select__selection-close { display: grid; place-items: center; flex: none; width: 42px; height: 42px; padding: 10px; color: #62646c; background: #f1f1f3; border: 0; border-radius: 50%; box-shadow: 0 8px 22px #0000001a, 0 2px 7px #0000000a; }
.tree-select__selection-close svg { width: 22px; height: 22px; }
.tree-select__selection-circle { position: relative; touch-action: none; display: grid; place-items: center; flex: none; width: 20px; height: 20px; border: 1.5px solid #c2c3c8; border-radius: 50%; }
.tree-select__selection-circle::before { position: absolute; inset: -8px; content: ''; }
.tree-select__selection-circle.is-checked { color: #fff; background: #657de4; border-color: #657de4; }
.tree-select__selection-circle svg { width: 16px; height: 16px; stroke-width: 2; }
.tree-selection-circle-enter-active, .tree-selection-circle-leave-active { transition: opacity .28s ease, transform .28s cubic-bezier(.22, 1, .36, 1), margin-right .28s cubic-bezier(.22, 1, .36, 1); }
.tree-selection-circle-enter-from, .tree-selection-circle-leave-to { margin-right: -32px; opacity: 0; transform: translateX(-12px); pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .tree-selection-circle-enter-active, .tree-selection-circle-leave-active, .tree-selection-header-enter-active, .tree-selection-header-leave-active, .tree-select__search-bar { transition: none; } }
.is-selecting .tree-select__list { padding-bottom: 92px; }
.tree-select__selection-actions { position: relative; z-index: 2; margin-top: -64px; display: flex; align-items: center; justify-content: center; flex: none; min-height: 64px; padding: 8px 4px; }
.tree-select__selection-actions::before { position: absolute; z-index: -1; inset: -24px -16px 0; content: ''; pointer-events: none; background: linear-gradient(to bottom, #ffffff00, #ffffffd9 36%, #fffffff5); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); -webkit-mask-image: linear-gradient(to bottom, transparent, #000 36%); mask-image: linear-gradient(to bottom, transparent, #000 36%); }
.tree-select__selection-actions button { display: flex; align-items: center; justify-content: center; gap: 9px; flex: 1; min-height: 42px; padding: 8px; color: #6b6d75; background: transparent; border: 0; font-size: 15px; }
.tree-select__selection-actions svg { width: 20px; height: 20px; }
.tree-select__selection-divider { width: 1px; height: 22px; background: #e4e4e8; }
.tree-select__selection-actions .tree-select__selection-delete { color: #d56a65; }
.tree-select__selection-actions button:disabled { opacity: .35; cursor: default; }
.tree-select__manage:focus-visible, .tree-select__selection-close:focus-visible, .tree-select__selection-actions button:focus-visible { outline: 2px solid #9285ba; outline-offset: -2px; }
.tree-select__empty { margin: 20px 8px; color: #96979d; font-size: 13px; line-height: 1.6; }
.tree-select__search:focus-within { border-color: #c5c8d1; }
.tree-select__new:focus-visible { outline: 2px solid #9285ba; outline-offset: -2px; }
</style>
