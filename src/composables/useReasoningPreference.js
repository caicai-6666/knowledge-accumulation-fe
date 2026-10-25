import { ref, watch } from 'vue'

export const REASONING_PREFERENCE_KEY = 'knowledge-accumulation.assistant.reasoning-effort'
const levels = ['low', 'medium', 'xhigh']

export function useReasoningPreference() {
  let initial = 'medium'
  try {
    const saved = globalThis.localStorage?.getItem(REASONING_PREFERENCE_KEY)
    if (levels.includes(saved)) initial = saved
  } catch { /* 存储受限时仍可使用默认强度。 */ }
  const effort = ref(initial)
  watch(effort, value => {
    if (!levels.includes(value)) return
    try { globalThis.localStorage?.setItem(REASONING_PREFERENCE_KEY, value) }
    catch { /* 本地缓存失败不影响本次选择与任务提交。 */ }
  }, { flush: 'sync' })
  return effort
}
