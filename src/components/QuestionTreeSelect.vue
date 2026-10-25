<script setup>
import { t, localizedRef, uiText } from '../i18n/index.js'
import { computed, nextTick, onBeforeUnmount, onDeactivated, ref, useId, watch } from 'vue'
import { validateTreeName } from '../services/explorationApi.js'
const explorationIcon = new URL('../assets/exploration.webp', import.meta.url).href

const props = defineProps({
  trees: { type: Array, required: true },
  runningTreeIds: { type: Set, default: () => new Set() },
  unreadTreeIds: { type: Set, default: () => new Set() },
  modelValue: { type: String, required: true },
  active: { type: Boolean, default: true },
  busy: Boolean,
  rename: Function,
})
const emit = defineEmits(['update:modelValue', 'create', 'delete'])
const id = useId()
const root = ref(null)
const list = ref(null)
const menu = ref(null)
const trigger = ref(null)
const nameInput = ref(null)
const optionElements = new Map()
const editingId = ref(null), nameDraft = ref(''), renameError = localizedRef(''), saving = ref(false)
const open = ref(false)
const menuListHeight = ref(null)
const menuHeight = ref(null)
let menuFrame = 0
let renamingComposition = false
let triggerPressOpen = null
let pointerInside = false
const highlighted = ref(0)
const items = computed(() => props.trees.map(tree => ({
  id: tree.id, title: tree.title, unread: props.unreadTreeIds.has(tree.id), running: props.runningTreeIds.has(tree.id), loaded: tree.loaded !== false, count: tree.nodes.filter(node => node.kind !== 'summary').length,
  branches: new Set(tree.nodes.map(node => node.branchId).filter(branch => branch && branch !== 'main')).size,
})))
const selected = computed(() => items.value.find(item => item.id === props.modelValue))
const optionId = index => `${id}-tree-${index}`

function revealInList(element) {
  const container = list.value
  if (!container?.getBoundingClientRect || !element?.getBoundingClientRect) return
  const bounds = container.getBoundingClientRect(), item = element.getBoundingClientRect()
  if (item.top < bounds.top) container.scrollTop -= bounds.top - item.top
  else if (item.bottom > bounds.bottom) container.scrollTop += item.bottom - bounds.bottom
}
async function updateMenuViewport() {
  await nextTick()
  if (!open.value || typeof window === 'undefined') return
  const rect = menu.value?.getBoundingClientRect?.()
  if (!rect || !list.value) return
  const viewport = window.visualViewport
  const bottom = (viewport?.height || window.innerHeight) + (viewport?.offsetTop || 0)
  const chrome = Math.max(0, menu.value.offsetHeight - list.value.offsetHeight)
  // 使用菜单最终位置和真实标题/边距高度，整体和列表同时限高，避免键盘上方溢出。
  menuHeight.value = Math.max(0, bottom - rect.top - 12)
  menuListHeight.value = Math.max(0, Math.min(330, menuHeight.value - chrome))
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
  if (open.value) {
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
function close() { if (saving.value) return; open.value = false; pointerInside = false; cancelRename() }
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
  if (props.busy || saving.value || editingId.value) return
  if (index === items.value.length) { close(); emit('create'); return }
  const item = items.value[index]
  if (!item) return
  if (item.id !== props.modelValue) emit('update:modelValue', item.id)
  close()
}
function handleKey(event) {
  if (event.target?.closest?.('.tree-select__action') && ['Enter', ' '].includes(event.key)) return
  if (event.key === 'Escape') { event.preventDefault(); close(); trigger.value?.focus({ preventScroll: true }); return }
  if (event.key === 'Tab') return
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) return
  event.preventDefault()
  if (props.busy || saving.value || editingId.value) return
  if (!open.value) { show(); return }
  if (event.key === 'Enter' || event.key === ' ') { choose(highlighted.value); return }
  const last = items.value.length
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
  } catch (cause) { if (cause.name !== 'AbortError') renameError.value = cause.message ? cause : uiText('修改名称失败，请重试'); return false }
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
  if (editingId.value) return
  // Safari 触摸按钮以及替换为改名输入框时，relatedTarget 可能为空；内部操作不代表离开菜单。
  if (!event.relatedTarget && pointerInside) return
  if (!root.value?.contains(event.relatedTarget)) close()
}
watch(open, (visible, _previous, onCleanup) => {
  if (!visible) return
  document.addEventListener('pointerdown', clickOutside)
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
watch(() => props.active, active => { if (!active) { open.value = false; cancelRename() } })
watch(items, value => {
  highlighted.value = Math.min(highlighted.value, value.length)
})
function hide() { open.value = false; pointerInside = false; cancelTriggerPress(); cancelRename() }
onDeactivated(hide)
onBeforeUnmount(hide)
</script>

<template>
  <div ref="root" class="tree-select" :class="{ 'is-open': open }" @pointerdown.capture="rememberInternalPointer" @keydown.capture="rememberKeyboard" @focusout="focusOut">
    <button ref="trigger" type="button" class="tree-select__trigger" :disabled="busy" :class="{ 'is-open': open }" :aria-label="t('选择问答树')" aria-haspopup="menu" :aria-expanded="open" :aria-controls="`${id}-list`" @pointerdown="rememberTriggerPress" @pointercancel="cancelTriggerPress" @click="toggleTrigger" @keydown="handleKey">
      <img v-if="!modelValue" class="tree-select__create-icon" :src="explorationIcon" alt="" width="24" height="24" />
      <span class="tree-select__value">{{ !modelValue ? t('开始新探索') : selected?.title || t('选择问答树') }}</span>
      <svg class="tree-select__chevron" :class="{ 'is-open': open }" viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>
    </button>
    <Transition name="tree-select-menu">
      <div v-if="open" ref="menu" class="tree-select__menu" :style="menuHeight !== null ? { maxHeight: `${menuHeight}px` } : undefined">
        <div class="tree-select__heading"><span>{{ t('选择问答树') }}</span><span>{{ t('{value0} 个会话', { value0: items.length }) }}</span></div>
        <div :id="`${id}-list`" ref="list" class="tree-select__list" :style="menuListHeight !== null ? { maxHeight: `${menuListHeight}px` } : undefined" role="menu" :aria-label="t('问答树列表')" @keydown="handleKey">
          <div v-for="(item, index) in items" :key="item.id" class="tree-select__row" role="presentation" :class="{ 'is-editing': editingId === item.id }">
            <template v-if="editingId === item.id">
              <input :ref="element => { nameInput = element }" v-model="nameDraft" class="tree-select__name-input" :aria-label="t('问答树名称')" :aria-invalid="Boolean(renameError)" :aria-describedby="renameError ? `${id}-rename-error` : undefined" maxlength="200" enterkeyhint="done" autocomplete="off" :spellcheck="false" :disabled="saving || busy" @compositionstart="renamingComposition = true" @compositionend="renamingComposition = false" @keydown.stop="handleRenameKey" />
              <button type="button" class="tree-select__action tree-select__save" :disabled="saving || busy" :aria-label="t('保存问答树名称')" @pointerdown.prevent @click="finishRename"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10.5 3.5 3.5L16 5.5" /></svg></button>
              <p v-if="renameError" :id="`${id}-rename-error`" class="tree-select__error" role="alert">{{ renameError }}</p>
            </template>
            <template v-else>
              <button :id="optionId(index)" :ref="element => { if (element) optionElements.set(index, element); else optionElements.delete(index) }" type="button" class="tree-select__option" :class="{ 'is-selected': item.id === modelValue, 'is-highlighted': index === highlighted }" role="menuitemradio" :aria-checked="item.id === modelValue" :disabled="busy" tabindex="-1" @pointermove="highlighted = index" @pointerdown.prevent @click="choose(index)">
                <span class="tree-select__option-content"><span class="tree-select__title-row"><span class="tree-select__title">{{ item.title }}</span><span class="tree-select__status"><span v-if="item.running" class="tree-select__spinner" role="img" :aria-label="t('正在生成回答')" :title="t('正在生成回答')"></span><span v-else-if="item.unread" class="tree-select__unread" role="img" :aria-label="t('有新的回答')" :title="t('有新的回答')"></span></span></span><span v-if="item.loaded" class="tree-select__meta">{{ t('{value0} 个任务', { value0: item.count }) }}<span aria-hidden="true">·</span>{{ t('{value0} 条分支', { value0: item.branches }) }}</span></span>
                <svg v-if="item.id === modelValue" class="tree-select__check" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3 3 7-7" /></svg>
              </button>
              <button v-if="rename" type="button" class="tree-select__action tree-select__rename" role="menuitem" :disabled="busy || saving" :aria-label="t('重命名问答树：{value0}', { value0: item.title })" :title="t('重命名')" @click.stop="startRename(item)"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.7 4.1 3.2 3.2M4 16l2.8-.6 8.4-8.4a1.8 1.8 0 0 0 0-2.5 1.8 1.8 0 0 0-2.5 0l-8.4 8.4L4 16Z" /></svg></button>
              <button type="button" class="tree-select__action tree-select__delete" role="menuitem" :disabled="busy || saving" :aria-label="t('删除问答树：{value0}', { value0: item.title })" :title="t('删除问答树')" @click.stop="requestDelete(item)"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5h13M7.5 5.5v-2h5v2M5 5.5l.7 11h8.6l.7-11M8 8.5v5M12 8.5v5" /></svg></button>
            </template>
          </div>
          <button :id="optionId(items.length)" :ref="element => { if (element) optionElements.set(items.length, element); else optionElements.delete(items.length) }" :disabled="busy || saving" type="button" class="tree-select__create" :class="{ 'is-highlighted': highlighted === items.length }" role="menuitemradio" :aria-checked="!modelValue" tabindex="-1" @pointermove="highlighted = items.length" @pointerdown.prevent @click="choose(items.length)">
            <img class="tree-select__create-icon" :src="explorationIcon" alt="" width="24" height="24" />
            <span>{{ t('开始新探索') }}</span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.tree-select__row { position: relative; }
.tree-select__action { position: absolute; top: 50%; display: grid; place-items: center; width: 27px; height: 28px; padding: 4px; color: #89958d; background: transparent; border: 0; border-radius: 6px; opacity: 0; pointer-events: none; transform: translateY(-50%); transition: opacity .18s, color .18s, background .18s; }
.tree-select__rename { right: 34px; }
.tree-select__delete, .tree-select__save { right: 5px; }
.tree-select__row:is(:hover, :focus-within) .tree-select__action { opacity: 1; pointer-events: auto; }
.tree-select__action:hover { color: #405047; background: #ffffffb8; }
.tree-select__delete:hover { color: #b05c58; background: #f8eae8; }
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
.tree-select__trigger:hover, .tree-select__trigger.is-open { border-color: #c5d5ca; background: #ffffffeb; box-shadow: inset 0 1px #fff, 0 4px 16px #34473e0d; }
.tree-select svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.tree-select__value { flex: 1; min-width: 0; overflow: hidden; font-size: 14px; font-weight: 600; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.tree-select__chevron { flex: none; color: #86968c; transition: transform .2s; }
.tree-select__chevron.is-open { transform: rotate(180deg); }
.tree-select__menu { display: flex; flex-direction: column; position: absolute; z-index: 20; top: calc(100% + 9px); left: 0; width: 100%; padding: 8px; overflow: hidden; background: #fcfdfcfa; border: 1px solid #ffffff; border-radius: 17px; box-shadow: 0 18px 45px #263d3324, 0 3px 10px #263d330a; transform-origin: top; }
.tree-select__heading { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 9px 12px; color: #8b9a90; font-size: 10px; }
.tree-select__heading > span:last-child { color: #a3afa7; }
.tree-select__list { flex: 0 1 auto; max-height: min(330px, calc(100dvh - 300px)); min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #b8c8bf55 transparent; }
.tree-select__option { padding-right: 94px; display: flex; align-items: center; gap: 12px; width: 100%; margin: 2px 0; padding: 12px 94px 12px 11px; text-align: left; color: #526759; background: transparent; border: 1px solid transparent; border-radius: 10px; transition: background .16s, border-color .16s; }
.tree-select__option.is-highlighted { background: #eef3ef; }
.tree-select__option.is-selected { color: #365744; background: linear-gradient(110deg, #e6efe8, #f0f4ef); border-color: #dbe6dc; }
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
.tree-select__create.is-highlighted { background: #f1eff6; }
.tree-select__create-icon { flex: none; width: 24px; height: 24px; object-fit: contain; }
.tree-select__check { position: absolute; right: 16px; color: #5a8c6b; }
.tree-select__row:is(:hover, :focus-within) .tree-select__check { opacity: 0; }
.tree-select__trigger:focus-visible { outline: 2px solid #9285ba; outline-offset: 3px; }
.tree-select__trigger:disabled { opacity: .45; cursor: default; }
.tree-select-menu-enter-active, .tree-select-menu-leave-active { transition: opacity .16s, transform .16s; }
.tree-select-menu-enter-from, .tree-select-menu-leave-to { opacity: 0; transform: translateY(-5px) scale(.985); }
@media (prefers-reduced-motion: reduce) { .tree-select__spinner { animation: none; } .tree-select *, .tree-select-menu-enter-active, .tree-select-menu-leave-active { transition: none; } }
@media (max-width: 900px) { .tree-select__name-input { font-size: 16px; } }
</style>
