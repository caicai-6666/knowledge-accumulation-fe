<script setup>
defineProps({ message: { type: String, default: '' }, tone: { type: String, default: 'success' }, revision: Number, embedded: Boolean })
</script>

<template>
  <Transition name="operation-toast">
    <div v-if="message" :key="revision" class="operation-toast" :class="{ 'is-error': tone === 'error', 'is-embedded': embedded }" :role="tone === 'error' ? 'alert' : 'status'" aria-atomic="true">
      <span class="operation-toast__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path v-if="tone === 'error'" d="m8 8 8 8m0-8-8 8" /><path v-else d="m6.5 12 3.5 3.5 7.5-7.5" /></svg></span>
      <span class="operation-toast__message">{{ message }}</span>
    </div>
  </Transition>
</template>

<style scoped>
.operation-toast { position: fixed; z-index: 1000; top: max(20px, env(safe-area-inset-top)); left: 50%; display: flex; align-items: center; gap: 12px; width: max-content; max-width: min(440px, calc(100vw - 32px)); padding: 10px 18px 10px 10px; color: #52665c; background: #fcfffcf5; border: 1px solid #e0ece2; border-radius: 21px; box-shadow: 0 10px 30px #47735118, inset 0 1px #fff; backdrop-filter: blur(14px); transform: translateX(-50%); pointer-events: none; font-size: 13px; line-height: 1.6; }
.operation-toast__icon { position: relative; display: grid; place-items: center; flex: none; width: 34px; height: 34px; border: 2px solid #fff; border-radius: 50%; color: #fff; background: #78b58c; box-shadow: 0 2px 6px #6a9d7633, inset 0 1px #ffffff70; }
.operation-toast__icon::after { position: absolute; content: ''; top: -2px; right: -2px; width: 7px; height: 7px; border: 2px solid #fcfffc; border-radius: 50%; background: #b1d6ba; }
.operation-toast svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.operation-toast__message { min-width: 0; overflow-wrap: anywhere; }
.operation-toast.is-error { color: #846663; background: #fffdfcf5; border-color: #f0e0dc; box-shadow: 0 10px 30px #aa777018, inset 0 1px #fff; }
.operation-toast.is-error .operation-toast__icon { color: #fff; background: #d58d87; box-shadow: 0 2px 6px #c08b8533, inset 0 1px #ffffff70; }
.operation-toast.is-error .operation-toast__icon::after { background: #e8b3ad; border-color: #fffdfc; }
.operation-toast.is-embedded { position: absolute; top: 12px; max-width: calc(100% - 24px); }
.operation-toast-enter-active, .operation-toast-leave-active { transition: opacity .2s ease, transform .24s cubic-bezier(.22,1,.36,1); }
.operation-toast-enter-from, .operation-toast-leave-to { opacity: 0; transform: translate(-50%, -8px); }
@media (prefers-reduced-motion: reduce) { .operation-toast-enter-active, .operation-toast-leave-active { transition: none; } }
</style>
