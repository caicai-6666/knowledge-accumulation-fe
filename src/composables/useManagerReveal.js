import { onScopeDispose, ref, watch } from 'vue'

export function useManagerReveal(ready, { requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame } = {}) {
  const revealed = ref(false)
  let frame = null

  function cancel() {
    if (frame !== null) cancelFrame(frame)
    frame = null
  }

  watch(ready, value => {
    cancel()
    revealed.value = false
    if (!value) return
    // 保证折叠状态先被绘制，再展开；缓存图片和默认头像也有完整入场过程。
    frame = requestFrame(() => {
      frame = requestFrame(() => { frame = null; revealed.value = true })
    })
  }, { immediate: true, flush: 'post' })

  onScopeDispose(cancel)
  return revealed
}
