<script setup>
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { t } from '../i18n/index.js'

const props = defineProps({ active: Boolean, user: { type: Object, default: null } })
const emit = defineEmits(['authentication-expired'])
const page = shallowRef(null)
const loading = ref(false)
const failed = ref(false)
let revision = 0, timer

async function loadPage() {
  if (page.value || loading.value) return
  const current = ++revision
  loading.value = true
  failed.value = false
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (revision === current) { loading.value = false; failed.value = true }
  }, import.meta.env.DEV ? 60000 : 20000)
  try {
    const module = await import('./ManagementPlatforms.vue')
    // import 无法取消；离开页面可继续准备模块，但旧用户的结果不能重新挂载页面。
    if (revision === current) { page.value = module.default; failed.value = false }
  } catch {
    if (revision === current) failed.value = true
  } finally {
    if (revision === current) { clearTimeout(timer); loading.value = false }
  }
}
watch(() => props.active, active => { if (active && !failed.value) void loadPage() }, { immediate: true })
onBeforeUnmount(() => { revision++; clearTimeout(timer) })
</script>

<template>
  <component :is="page" v-if="page" :active="active" :user="user" @authentication-expired="emit('authentication-expired')" />
  <div v-else class="platform-page-status" :class="{ 'is-active': active }" :aria-busy="loading">
    <div v-if="failed" role="alert">
      <p>{{ t('平台页面暂时无法加载，请重试') }}</p>
      <button type="button" @click="loadPage">{{ t('重新尝试') }}</button>
    </div>
    <div v-else role="status" :aria-label="t('正在加载平台…')"><span class="platform-page-status__spinner" aria-hidden="true"></span></div>
  </div>
</template>

<style scoped>
.platform-page-status { display: grid; place-items: center; height: 100%; min-height: 240px; padding: 24px; color: #68746d; text-align: center; }
.platform-page-status p { font-size: 14px; }
.platform-page-status button { padding: 8px 16px; border: 1px solid #d6e0d9; border-radius: 9px; background: #ffffffc9; color: #4b6053; font: inherit; cursor: pointer; }
.platform-page-status button:focus-visible { outline: 3px solid #7063d8; outline-offset: 3px; }
.platform-page-status__spinner { display: block; width: 30px; height: 30px; border: 2.5px solid #e3ebe5; border-top-color: #7f9f8c; border-radius: 50%; animation: platform-page-loading 1s linear infinite paused; }
.is-active .platform-page-status__spinner { animation-play-state: running; }
@keyframes platform-page-loading { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .platform-page-status__spinner { animation: none; } }
</style>
