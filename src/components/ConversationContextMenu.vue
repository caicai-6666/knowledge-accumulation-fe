<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { t } from '../i18n/index.js'
import { useMobileLayout } from '../composables/useMobileLayout.js'

const props = defineProps({ item: { type: Object, required: true }, anchor: { type: Object, required: true }, canRename: Boolean })
const emit = defineEmits(['close', 'rename', 'delete'])
const dialog = ref(null)
const firstAction = ref(null)
const { viewportHeight, viewportTop } = useMobileLayout()
const placement = computed(() => {
  const width = Math.min(props.anchor.width, window.innerWidth - 32)
  const left = Math.max(16, Math.min(props.anchor.left, window.innerWidth - width - 16))
  const topEdge = viewportTop.value + 16
  const bottomEdge = viewportTop.value + (viewportHeight.value || window.innerHeight) - 16
  const rowHeight = 48
  const menuHeight = (props.canRename ? 2 : 1) * 48 + 16
  const top = Math.max(topEdge, Math.min(props.anchor.top, bottomEdge - rowHeight))
  const menuTop = top + rowHeight + 12 + menuHeight <= bottomEdge ? top + rowHeight + 12 : Math.max(topEdge, top - menuHeight - 12)
  return { row: { left: `${left}px`, top: `${top}px`, width: `${width}px` }, menu: { left: `${left}px`, top: `${menuTop}px`, width: `${Math.min(236, width)}px` } }
})
onMounted(async () => {
  await nextTick()
  if (!dialog.value?.isConnected) return
  dialog.value.showModal()
  firstAction.value?.focus({ preventScroll: true })
})
onBeforeUnmount(() => { if (dialog.value?.open) dialog.value.close() })
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="conversation-context" :aria-label="t('对话操作')" @cancel.prevent="emit('close')" @close="emit('close')" @contextmenu.prevent>
      <button type="button" class="conversation-context__dismiss" :aria-label="t('关闭菜单')" tabindex="-1" @click="emit('close')"></button>
      <div class="conversation-context__selected" :style="placement.row"><span>{{ item.title }}</span></div>
      <div class="conversation-context__menu" :style="placement.menu" role="menu" :aria-label="t('对话操作')">
        <button v-if="canRename" ref="firstAction" type="button" role="menuitem" @click="emit('rename', item)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M5 19l4-1L20 7a2.8 2.8 0 0 0-4-4L5 14l-1 5M12 19h8" /></svg><span>{{ t('重命名') }}</span></button>
        <button :ref="element => { if (!canRename) firstAction = element }" type="button" class="is-destructive" role="menuitem" :aria-label="t('删除问答树')" @click="emit('delete', item)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" /></svg><span>{{ t('删除') }}</span></button>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.conversation-context { position: fixed; inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; margin: 0; padding: 0; overflow: hidden; color: #202123; background: transparent; border: 0; outline: 0; }
.conversation-context::backdrop { background: #38383e38; backdrop-filter: blur(3px); }
.conversation-context__dismiss { position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; background: transparent; border: 0; }
.conversation-context__selected { position: absolute; display: flex; align-items: center; height: 48px; padding: 0 14px; overflow: hidden; background: #fff; border-radius: 18px; font-size: 15px; white-space: nowrap; text-overflow: ellipsis; box-shadow: 0 12px 32px #0000000c; pointer-events: none; }
.conversation-context__selected span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conversation-context__menu { position: absolute; padding: 8px; background: #f9f9fbf5; border: 1px solid #fff; border-radius: 26px; box-shadow: 0 18px 48px #00000020; animation: context-enter .16s ease-out; }
.conversation-context__menu button { display: flex; align-items: center; gap: 16px; width: 100%; min-height: 48px; padding: 10px 18px; color: inherit; font: inherit; font-size: 16px; text-align: left; background: transparent; border: 0; border-radius: 16px; cursor: pointer; }
.conversation-context__menu svg { width: 21px; height: 21px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.conversation-context__menu .is-destructive { color: #ff424b; }
.conversation-context__menu button:focus-visible { outline: 2px solid #9285ba; outline-offset: -2px; }
@keyframes context-enter { from { opacity: 0; transform: translateY(-4px) scale(.98); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .conversation-context__menu { animation: none; } }
</style>
