import { getCurrentInstance, onDeactivated, onScopeDispose, ref, watch } from 'vue'
import { localizedRef } from '../i18n/index.js'

export function useOperationToast(active) {
  const message = localizedRef('')
  const tone = ref('success')
  const revision = ref(0)
  let timer
  function clear() { clearTimeout(timer); timer = undefined; message.value = '' }
  function show(value, type = 'success') {
    if (!active()) return
    clear()
    tone.value = type
    message.value = value
    revision.value++
    timer = setTimeout(clear, type === 'error' ? 4500 : 3000)
  }
  watch(active, available => { if (!available) clear() })
  if (getCurrentInstance()) onDeactivated(clear)
  onScopeDispose(clear)
  return { message, tone, revision, show, clear }
}
