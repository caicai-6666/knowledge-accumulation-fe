<script setup>
import { nextTick, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { t } from '../i18n/index.js'
const props = defineProps({ count: { type: Number, required: true }, completed: { type: Number, default: 0 }, busy: Boolean, error: { type: String, default: '' } })
const emit = defineEmits(['close', 'confirm'])
const dialog = ref(null), cancelButton = ref(null)
let previousFocus
watch(dialog, async element => {
  if (!element) return
  previousFocus = document.activeElement
  await nextTick()
  if (element.isConnected && !element.open) { element.showModal(); cancelButton.value?.focus({ preventScroll: true }) }
}, { flush: 'post' })
function close() { if (!props.busy) emit('close') }
function release() {
  dialog.value?.close()
  if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus({ preventScroll: true })
}
onDeactivated(release)
onBeforeUnmount(release)
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="tree-selection-delete" aria-labelledby="tree-selection-delete-title" aria-describedby="tree-selection-delete-description" :aria-busy="busy" @cancel.prevent="close" @click.self="close">
      <form @submit.prevent="!busy && $emit('confirm')">
        <h2 id="tree-selection-delete-title">{{ t('删除选中的 {value0} 棵问答树？', { value0: count }) }}</h2>
        <p id="tree-selection-delete-description">{{ t('所选问答树、全部任务和关联附件将被永久删除，待发送消息也会清除。此操作无法撤销。') }}</p>
        <p v-if="completed" class="tree-selection-delete__progress" role="status">{{ t('已删除 {value0} 棵问答树', { value0: completed }) }}</p>
        <p v-if="error" class="tree-selection-delete__error" role="alert">{{ error }}</p>
        <button type="submit" class="tree-selection-delete__confirm" :disabled="busy || !count">{{ busy ? t('正在删除…') : error ? t('重试剩余删除') : t('删除所选问答树') }}</button>
        <button ref="cancelButton" type="button" class="tree-selection-delete__cancel" :disabled="busy" @click="close">{{ t('取消') }}</button>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.tree-selection-delete { width: min(360px, calc(100vw - 40px)); max-height: calc(100vh - 40px); margin: auto; padding: 26px 22px 14px; overflow: auto; color: #202123; background: #fff; border: 1px solid #eeeeef; border-radius: 26px; box-shadow: 0 24px 70px #00000025; }
.tree-selection-delete::backdrop { background: #20212a66; }
.tree-selection-delete h2 { margin: 0 0 16px; font-size: 17px; font-weight: 600; line-height: 1.6; text-align: center; }
.tree-selection-delete p { margin: 0 0 20px; color: #898a90; font-size: 14px; line-height: 1.7; text-align: center; overflow-wrap: anywhere; }
.tree-selection-delete .tree-selection-delete__error { color: #b35e57; }
.tree-selection-delete .tree-selection-delete__progress { margin-bottom: 10px; }
.tree-selection-delete button { display: block; width: 100%; min-height: 46px; padding: 10px 16px; border: 0; border-radius: 999px; font: inherit; font-size: 15px; cursor: pointer; }
.tree-selection-delete__confirm { color: #fff; background: #ef575b; }
.tree-selection-delete__cancel { margin-top: 12px; color: #72737b; background: transparent; }
.tree-selection-delete button:disabled { opacity: .45; cursor: default; }
.tree-selection-delete button:focus-visible { outline: 2px solid #9285ba; outline-offset: 3px; }
</style>
