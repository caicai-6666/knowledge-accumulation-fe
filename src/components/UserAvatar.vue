<script setup>
import { watch } from 'vue'
import { useUserAvatar } from '../composables/useUserAvatar.js'

const props = defineProps({ user: { type: Object, default: null }, compact: Boolean })
const emit = defineEmits(['ready'])
const { imageUrl, ready, markImageReady, failImage } = useUserAvatar(() => props.user)

watch(ready, value => emit('ready', value), { immediate: true, flush: 'post' })

async function imageLoaded(event) {
  const element = event.currentTarget
  const source = element.currentSrc || element.src
  try {
    // 等待浏览器解码，而不只是下载完成，避免条目入场后头像再闪现。
    await element.decode?.()
    markImageReady(source)
  } catch {
    failImage(source)
  }
}

function imageFailed(event) {
  failImage(event.currentTarget.currentSrc || event.currentTarget.src)
}
</script>

<template>
  <span class="user-avatar" :class="{ 'user-avatar--compact': compact }" role="img" :aria-label="`${user?.name || user?.userid || '用户'}的头像`">
    <img v-if="imageUrl" :key="imageUrl" :src="imageUrl" alt="" draggable="false" @load="imageLoaded" @error="imageFailed" />
    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 21v-2a7 7 0 0 1 14 0v2" stroke-linecap="round" />
    </svg>
  </span>
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
