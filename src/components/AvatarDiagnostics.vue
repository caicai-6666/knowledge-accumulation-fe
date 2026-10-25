<script setup>
import { computed, ref } from 'vue'
import { t } from '../i18n/index.js'
import { avatarDiagnosticText } from '../services/avatarDiagnostics.js'

defineProps({ value: { type: Object, default: () => ({}) }, force: Boolean })
const copied = ref(false)
const copyFailed = ref(false)
async function copy(value) {
  copied.value = false
  copyFailed.value = false
  const text = avatarDiagnosticText(value)
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
  } catch {
    // 受限 WebView 可通过选择文本复制，不触发额外权限或请求。
    copyFailed.value = true
  }
}
const copyLabel = computed(() => copied.value ? t('已复制诊断信息') : t('复制诊断信息'))
</script>

<template>
  <Teleport to="body">
    <details class="avatar-diagnostics" :class="{ 'is-forced': force }" open>
      <summary>{{ t('临时头像诊断') }} · {{ value.stage || '-' }}</summary>
      <div class="avatar-diagnostics__toolbar"><button type="button" @click="copy(value)">{{ copyLabel }}</button><span v-if="copyFailed" role="status">{{ t('请长按下方文字复制') }}</span></div>
      <pre tabindex="0">{{ avatarDiagnosticText(value) }}</pre>
    </details>
  </Teleport>
</template>

<style scoped>
.avatar-diagnostics { position: fixed; z-index: 2147483647; bottom: max(12px, env(safe-area-inset-bottom)); left: 12px; right: 12px; max-height: min(42dvh, 340px); overflow: auto; padding: 12px 16px; border: 1px solid #dce6df; border-radius: 16px; background: #fffffff5; color: #465c4e; box-shadow: 0 8px 32px #243b3029; font: 12px/1.6 system-ui; }
.avatar-diagnostics summary { cursor: pointer; font-weight: 650; touch-action: manipulation; }
.avatar-diagnostics__toolbar { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
.avatar-diagnostics button { padding: 6px 12px; border: 1px solid #cadbd0; border-radius: 9px; background: #e8f2ec; color: #355c44; font: inherit; cursor: pointer; touch-action: manipulation; }
.avatar-diagnostics pre { margin: 10px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; user-select: text; -webkit-user-select: text; }
@media (min-width: 901px) { .avatar-diagnostics:not(.is-forced) { display: none; } }
</style>
