<script setup>
import { computed, nextTick, onBeforeUnmount, onDeactivated, ref, useId, watch } from 'vue'
import { validateTreeName } from '../services/explorationApi.js'
import explorationIcon from '../assets/exploration.webp'

const props = defineProps({
  trees: { type: Array, required: true },
  modelValue: { type: String, required: true },
  active: { type: Boolean, default: true },
  busy: Boolean,
  rename: Function,
})
const emit = defineEmits(['update:modelValue', 'create', 'delete'])
const id = useId()
const root = ref(null)
const list = ref(null)
const trigger = ref(null)
const nameInput = ref(null)
const optionElements = new Map()
const editingId = ref(null), nameDraft = ref(''), renameError = ref(''), saving = ref(false)
const open = ref(false)
const highlighted = ref(0)
const items = computed(() => props.trees.map(tree => ({
  id: tree.id, title: tree.title, loaded: tree.loaded !== false, count: tree.nodes.filter(node => node.kind !== 'summary').length,
  branches: new Set(tree.nodes.map(node => node.branchId).filter(branch => branch && branch !== 'main')).size,
})))
const selected = computed(() => items.value.find(item => item.id === props.modelValue))
const optionId = index => `${id}-tree-${index}`

async function revealHighlighted() {
  await nextTick()
  if (open.value) { list.value?.children[highlighted.value]?.scrollIntoView({ block: 'nearest' }); optionElements.get(highlighted.value)?.focus() }
}
function show() {
  if (props.busy) return
  highlighted.value = props.modelValue ? Math.max(0, items.value.findIndex(item => item.id === props.modelValue)) : items.value.length
  open.value = true
  void revealHighlighted()
}
function cancelRename() { if (!saving.value) { editingId.value = null; nameDraft.value = ''; renameError.value = '' } }
function close() { if (saving.value) return; open.value = false; cancelRename() }
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
  if (event.key === 'Escape') { event.preventDefault(); close(); trigger.value?.focus(); return }
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
  if (!editingId.value || saving.value || props.busy) return false
  const target = editingId.value
  renameError.value = ''
  try {
    const name = validateTreeName(nameDraft.value)
    saving.value = true
    if (await props.rename?.(target, name) === false) return false
    editingId.value = null; nameDraft.value = ''
    await nextTick(); optionElements.get(items.value.findIndex(item => item.id === target))?.focus()
    return true
  } catch (cause) { if (cause.name !== 'AbortError') renameError.value = cause.message || '修改名称失败，请重试'; return false }
  finally { saving.value = false }
}
async function startRename(item) {
  if (props.busy || saving.value || !props.rename) return
  if (editingId.value && !await finishRename()) return
  editingId.value = item.id; nameDraft.value = item.title; renameError.value = ''
  await nextTick(); nameInput.value?.focus(); nameInput.value?.select?.()
}
function requestDelete(item) { if (!props.busy && !saving.value) { close(); trigger.value?.focus(); emit('delete', item.id) } }
async function closeAfterEditing() {
  if (saving.value) return
  if (editingId.value && !await finishRename()) return
  close()
}
function clickOutside(event) { if (!root.value?.contains(event.target)) void closeAfterEditing() }
function focusOut(event) { if (!root.value?.contains(event.relatedTarget)) void closeAfterEditing() }
watch(open, (visible, _previous, onCleanup) => {
  if (!visible) return
  document.addEventListener('pointerdown', clickOutside)
  onCleanup(() => document.removeEventListener('pointerdown', clickOutside))
}, { flush: 'sync' })
watch(() => props.active, active => { if (!active) { open.value = false; cancelRename() } })
watch(items, value => {
  highlighted.value = Math.min(highlighted.value, value.length)
})
function hide() { open.value = false; cancelRename() }
onDeactivated(hide)
onBeforeUnmount(hide)
</script>

<template>
  <div ref="root" class="tree-select" @focusout="focusOut">
    <button ref="trigger" type="button" class="tree-select__trigger" :disabled="busy" :class="{ 'is-open': open }" aria-label="选择问答树" aria-haspopup="menu" :aria-expanded="open" :aria-controls="`${id}-list`" @click="open ? close() : show()" @keydown="handleKey">
      <img v-if="!modelValue" class="tree-select__create-icon" :src="explorationIcon" alt="" width="24" height="24" />
      <span class="tree-select__value">{{ !modelValue ? '开始新探索' : selected?.title || '选择问答树' }}</span>
      <svg class="tree-select__chevron" :class="{ 'is-open': open }" viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>
    </button>
    <Transition name="tree-select-menu">
      <div v-if="open" class="tree-select__menu">
        <div class="tree-select__heading"><span>选择问答树</span><span>{{ items.length }} 个会话</span></div>
        <div :id="`${id}-list`" ref="list" class="tree-select__list" role="menu" aria-label="问答树列表" @keydown="handleKey">
          <div v-for="(item, index) in items" :key="item.id" class="tree-select__row" role="presentation" :class="{ 'is-editing': editingId === item.id }">
            <template v-if="editingId === item.id">
              <input :ref="element => { nameInput = element }" v-model="nameDraft" class="tree-select__name-input" aria-label="问答树名称" :aria-invalid="Boolean(renameError)" :aria-describedby="renameError ? `${id}-rename-error` : undefined" maxlength="200" :disabled="saving || busy" @keydown.enter.stop.prevent="finishRename" @keydown.esc.stop.prevent="cancelRename" @keydown.stop @blur="finishRename" />
              <button type="button" class="tree-select__action tree-select__save" :disabled="saving || busy" aria-label="保存问答树名称" @pointerdown.prevent @click="finishRename"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10.5 3.5 3.5L16 5.5" /></svg></button>
              <p v-if="renameError" :id="`${id}-rename-error`" class="tree-select__error" role="alert">{{ renameError }}</p>
            </template>
            <template v-else>
              <button :id="optionId(index)" :ref="element => { if (element) optionElements.set(index, element); else optionElements.delete(index) }" type="button" class="tree-select__option" :class="{ 'is-selected': item.id === modelValue, 'is-highlighted': index === highlighted }" role="menuitemradio" :aria-checked="item.id === modelValue" :disabled="busy" tabindex="-1" @pointermove="highlighted = index" @pointerdown.prevent @click="choose(index)">
                <span class="tree-select__option-content"><span class="tree-select__title">{{ item.title }}</span><span v-if="item.loaded" class="tree-select__meta">{{ item.count }} 个任务<span aria-hidden="true">·</span>{{ item.branches }} 条分支</span></span>
                <svg v-if="item.id === modelValue" class="tree-select__check" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3 3 7-7" /></svg>
              </button>
              <button v-if="rename" type="button" class="tree-select__action tree-select__rename" role="menuitem" :disabled="busy || saving" :aria-label="`重命名问答树：${item.title}`" title="重命名" @click.stop="startRename(item)"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.7 4.1 3.2 3.2M4 16l2.8-.6 8.4-8.4a1.8 1.8 0 0 0 0-2.5 1.8 1.8 0 0 0-2.5 0l-8.4 8.4L4 16Z" /></svg></button>
              <button type="button" class="tree-select__action tree-select__delete" role="menuitem" :disabled="busy || saving" :aria-label="`删除问答树：${item.title}`" title="删除问答树" @click.stop="requestDelete(item)"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5h13M7.5 5.5v-2h5v2M5 5.5l.7 11h8.6l.7-11M8 8.5v5M12 8.5v5" /></svg></button>
            </template>
          </div>
          <button :id="optionId(items.length)" :ref="element => { if (element) optionElements.set(items.length, element); else optionElements.delete(items.length) }" :disabled="busy || saving" type="button" class="tree-select__create" :class="{ 'is-highlighted': highlighted === items.length }" role="menuitemradio" :aria-checked="!modelValue" tabindex="-1" @pointermove="highlighted = items.length" @pointerdown.prevent @click="choose(items.length)">
            <img class="tree-select__create-icon" :src="explorationIcon" alt="" width="24" height="24" />
            <span>开始新探索</span>
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
.tree-select__menu { position: absolute; z-index: 20; top: calc(100% + 9px); left: 0; width: 100%; padding: 8px; overflow: hidden; background: #fcfdfcfa; border: 1px solid #ffffff; border-radius: 17px; box-shadow: 0 18px 45px #263d3324, 0 3px 10px #263d330a; transform-origin: top; }
.tree-select__heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 9px 12px; color: #8b9a90; font-size: 10px; }
.tree-select__heading > span:last-child { color: #a3afa7; }
.tree-select__list { max-height: min(330px, calc(100dvh - 300px)); min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #b8c8bf55 transparent; }
.tree-select__option { padding-right: 76px; display: flex; align-items: center; gap: 12px; width: 100%; margin: 2px 0; padding: 12px 76px 12px 11px; text-align: left; color: #526759; background: transparent; border: 1px solid transparent; border-radius: 10px; transition: background .16s, border-color .16s; }
.tree-select__option.is-highlighted { background: #eef3ef; }
.tree-select__option.is-selected { color: #365744; background: linear-gradient(110deg, #e6efe8, #f0f4ef); border-color: #dbe6dc; }
.tree-select__option-content { display: flex; flex: 1; flex-direction: column; gap: 5px; min-width: 0; }
.tree-select__title { font-size: 12px; font-weight: 550; line-height: 1.5; overflow-wrap: anywhere; }
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
@media (prefers-reduced-motion: reduce) { .tree-select *, .tree-select-menu-enter-active, .tree-select-menu-leave-active { transition: none; } }
</style>
