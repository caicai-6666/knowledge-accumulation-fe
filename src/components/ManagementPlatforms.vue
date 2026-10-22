<script setup>
import { computed, ref, watch } from 'vue'
import PlatformNavigation from './PlatformNavigation.vue'
import PlatformDetail from './PlatformDetail.vue'
import { presentPlatform } from '../data/platformPresentation.js'
import { usePlatforms } from '../composables/usePlatforms.js'
import sleepUrl from '../assets/sleep.webp'

const props = defineProps({ active: Boolean, user: { type: Object, default: null } })
const emit = defineEmits(['authentication-expired'])
const { platforms: directory, status, error, refresh } = usePlatforms(() => props.active, () => props.user, {
  onAuthenticationExpired: () => emit('authentication-expired'),
})
const platforms = computed(() => directory.value.map(presentPlatform))
const selectedCode = ref('')
const selectedPlatform = computed(() => platforms.value.find(platform => platform.code === selectedCode.value))
watch(platforms, items => {
  if (selectedCode.value && !items.some(platform => platform.code === selectedCode.value)) selectedCode.value = ''
})
</script>

<template>
  <div class="management-platforms">
    <aside class="platform-sidebar" aria-label="管理平台">
      <PlatformNavigation v-model="selectedCode" :platforms="platforms" :active="active" />
      <div v-if="status === 'error'" class="platform-load-state" role="alert">
        <p>{{ error }}</p>
        <button type="button" @click="refresh">重新加载</button>
      </div>
      <p v-else-if="status === 'loading'" class="platform-load-message" role="status">正在加载平台…</p>
      <p v-else-if="status === 'ready' && !directory.length" class="platform-load-message">暂无平台</p>
    </aside>

    <section class="platform-detail" :aria-labelledby="selectedPlatform ? 'platform-detail-title' : undefined" :aria-label="selectedPlatform ? undefined : '平台信息'">
        <KeepAlive :max="12">
          <PlatformDetail v-if="selectedPlatform" :key="selectedPlatform.code" :platform="selectedPlatform" />
        </KeepAlive>
        <div v-if="!selectedPlatform" key="unselected" class="platform-detail__placeholder">
          <img :src="sleepUrl" alt="" draggable="false" />
          <p>选择一个平台</p>
        </div>
    </section>
  </div>
</template>

<style scoped>
.management-platforms { display: grid; grid-template-columns: clamp(224px, 18vw, 254px) minmax(0, 1fr); gap: 18px; height: 100%; min-height: 520px; padding: 24px; }
.platform-sidebar { display: flex; flex-direction: column; gap: 14px; min-width: 0; min-height: 0; }
.platform-sidebar > nav { flex: 1; min-height: 0; }
.platform-load-state { padding: 16px; color: #80604e; background: #fff9f1d9; border: 1px solid #e9ddcb; border-radius: 18px; }
.platform-load-state p { margin: 0 0 12px; font-size: 12px; line-height: 1.8; }
.platform-load-state button { padding: 7px 14px; color: #4b6053; background: #ffffffc9; border: 1px solid #d6e0d9; border-radius: 9px; cursor: pointer; }
.platform-load-state button:focus-visible { outline: 3px solid #7063d8; outline-offset: 3px; }
.platform-load-message { margin: 0; padding: 0 14px; color: #84938a; font-size: 12px; line-height: 1.8; }
.platform-detail { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; border: 1px solid #ffffffeb; border-radius: 27px; background: radial-gradient(circle at 90% 8%, #7468d50a, transparent 30%), radial-gradient(circle at 7% 92%, #3da2870a, transparent 28%), #fafcfcd9; box-shadow: inset 0 1px #ffffffdb, 0 18px 40px #34424e0d; }
.platform-detail__placeholder { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 20px; min-height: 240px; padding: 24px; }
.platform-detail__placeholder img { display: block; width: 128px; max-width: 45%; height: auto; object-fit: contain; }
.platform-detail__placeholder p { margin: 0; color: #a7b5aa; font-size: 12px; line-height: 1.8; text-align: center; }
@media (max-width: 1100px) and (min-width: 761px) { .management-platforms { grid-template-columns: 224px minmax(0, 1fr); gap: 12px; padding: 18px; } }


@media (max-width: 760px) {
  .management-platforms { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(360px, 1fr); height: auto; min-height: 100%; gap: 14px; padding: 16px; }
  .platform-sidebar > nav { flex: none; }
  .platform-detail { border-radius: 20px; }
}
@media (prefers-reduced-motion: reduce) { .platform-detail__entry { transition: none; } }
</style>
