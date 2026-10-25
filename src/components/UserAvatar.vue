<script setup>
import { t } from '../i18n/index.js'
import { watch } from 'vue'
import AvatarDiagnostics from './AvatarDiagnostics.vue'
import { useUserAvatar } from '../composables/useUserAvatar.js'

const props = defineProps({ user: { type: Object, default: null }, compact: Boolean })
const emit = defineEmits(['ready'])
const { imageUrl, ready, status, diagnostic, markImageReady, failImage } = useUserAvatar(() => props.user)

watch(ready, value => emit('ready', value), { immediate: true, flush: 'post' })

let forceDiagnostics = false
try { forceDiagnostics = new URL(window.location.href).searchParams.get('dd_display_debug') === '1' } catch { /* 测试或服务端无浏览器环境。 */ }

function imageLoaded(event) {
  const element = event.currentTarget
  const source = element.currentSrc || element.src
  // load 与有效固有尺寸已证明图片可显示，不因额外 decode() 调用失败丢弃有效图片。
  if (element.naturalWidth > 0 && element.naturalHeight > 0) markImageReady(source, { width: element.naturalWidth, height: element.naturalHeight })
  else failImage(source)
}

function imageFailed(event) {
  const element = event.currentTarget
  failImage(element.currentSrc || element.src, { width: element.naturalWidth, height: element.naturalHeight })
}
</script>

<template>
  <span class="user-avatar" :class="{ 'user-avatar--compact': compact }" :data-avatar-state="status" role="img" :aria-label="t('{value0}的头像', { value0: user?.name || user?.userid || t('用户') })">
    <img v-if="imageUrl" :key="imageUrl" :src="imageUrl" alt="" draggable="false" @load="imageLoaded" @error="imageFailed" />
    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 21v-2a7 7 0 0 1 14 0v2" stroke-linecap="round" />
    </svg>
  </span>
  <AvatarDiagnostics v-if="!compact && forceDiagnostics" :value="diagnostic" :force="forceDiagnostics" />
</template>

<style scoped>
.user-avatar {
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
  width: 52px;
  height: 52px;
  overflow: hidden;
  color: #87988e;
  background: linear-gradient(145deg, #f3f7f4, #dbe7df);
  border: 3px solid #ffffff;
  border-radius: 50%;
  box-shadow:
    0 7px 16px #294b3926,
    0 2px 5px #253e3314;
}
.user-avatar::after {
  position: absolute;
  inset: 0;
  content: '';
  pointer-events: none;
  border-radius: inherit;
  box-shadow: inset 0 1px 2px #ffffff70, inset 0 0 0 1px #243d3210;
}
img { width: 100%; height: 100%; object-fit: cover; }
svg { width: 31px; height: 31px; }
@media (max-width: 640px) {
  .user-avatar { width: 44px; height: 44px; }
  svg { width: 27px; height: 27px; }
}
.user-avatar--compact { width: 46px; height: 46px; border-width: 2px; box-shadow: 0 4px 12px #294b3917, 0 1px 3px #253e330d; }
.user-avatar--compact svg { width: 28px; height: 28px; }
</style>
