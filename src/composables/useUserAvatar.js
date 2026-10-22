import { ref, toValue, watch } from 'vue'
import { fetchUserAvatar } from '../services/userAvatar.js'

export function useUserAvatar(user, { loadAvatar = fetchUserAvatar, urls = URL } = {}) {
  const imageUrl = ref('')
  const ready = ref(false)

  function clearImage() {
    if (imageUrl.value) urls.revokeObjectURL(imageUrl.value)
    imageUrl.value = ''
  }

  function markImageReady(source) {
    if (source && source === imageUrl.value) ready.value = true
  }

  function failImage(source) {
    if (!source || source !== imageUrl.value) return
    clearImage()
    ready.value = true
  }

  watch([
    () => toValue(user)?.userid,
    () => toValue(user)?.name,
    () => toValue(user)?.avatar_url,
  ], ([_userid, _name, filename], _previous, onCleanup) => {
    clearImage()
    ready.value = false
    if (!filename) { ready.value = true; return }
    const controller = new AbortController()
    onCleanup(() => { controller.abort(); clearImage() })
    // 头像独立加载；失败时保留默认人像，不阻塞工作台或修改共享登录态。
    Promise.resolve().then(() => loadAvatar(filename, { signal: controller.signal })).then(blob => {
      if (controller.signal.aborted) return
      if (blob) imageUrl.value = urls.createObjectURL(blob)
      else ready.value = true
    }).catch(() => {
      if (!controller.signal.aborted) ready.value = true
    })
  }, { immediate: true })

  return { imageUrl, ready, markImageReady, failImage, clearImage }
}
