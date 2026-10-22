<script setup>
defineProps({ loading: Boolean, message: { type: String, default: '' } })
defineEmits(['retry'])
</script>

<template>
  <section class="authentication-status" aria-live="polite" :aria-busy="loading" data-molecular-field-block>
    <div class="authentication-status__copy">
      <Transition name="authentication-copy" mode="out-in">
        <div :key="loading ? 'loading' : 'error'" class="authentication-status__content">
          <h1>{{ loading ? '正在进入' : '暂时无法进入' }}</h1>
          <div v-if="loading" class="authentication-status__loading" role="status" aria-label="正在连接知识沉淀服务，请稍候"><span class="authentication-status__spinner" aria-hidden="true"></span></div>
          <div v-else class="authentication-status__failure"><p>{{ message }}</p><button type="button" @click="$emit('retry')">重新尝试</button></div>
        </div>
      </Transition>
    </div>
  </section>
</template>

<style scoped>
.authentication-status {
  position: absolute;
  z-index: 1;
  inset: 0;
  width: min(344px, calc(100% - 40px));
  height: 184px;
  max-height: calc(100dvh - 40px);
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin: auto;
  padding: 22px 24px;
  text-align: center;
  background: #f9fbfce8;
  border: 1px solid #fff;
  border-radius: 22px;
  box-shadow: 0 18px 48px #333b6321;
}
.authentication-status__copy { flex: 1; min-height: 0; }
.authentication-status__content { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.authentication-status__loading { display: grid; place-items: center; flex: 1; min-height: 0; }
.authentication-status__failure { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; flex: 1; min-height: 0; padding-top: 8px; }
h1 { flex: none; margin: 0; font-size: 18px; font-weight: 650; line-height: 1.45; }
p { min-height: 0; margin: 0; overflow: auto; color: #738078; font-size: 13px; line-height: 1.65; overflow-wrap: anywhere; }
/* From Uiverse.io by ke1221 */
button { align-self: center; flex: none; margin-top: 0; color: #090909; padding: .7em 1.7em; font-size: 18px; line-height: 1.4; border-radius: .5em; background: #e8e8e8; cursor: pointer; border: 1px solid #e8e8e8; transition: color .3s, box-shadow .3s; box-shadow: 6px 6px 12px #c5c5c5, -6px -6px 12px #ffffff; }
button:active:not(:disabled) { color: #666; box-shadow: inset 4px 4px 12px #c5c5c5, inset -4px -4px 12px #ffffff; }
button:focus-visible { outline: 3px solid #7063d8; outline-offset: 3px; }
.authentication-status__spinner { display: block; flex: none; width: 30px; height: 30px; border: 2.5px solid #e3ebe5; border-top-color: #7f9f8c; border-radius: 50%; animation: spin 1s linear infinite; }
.authentication-copy-enter-active { transition: opacity .24s ease; }
.authentication-copy-leave-active { transition: opacity .16s ease; }
.authentication-copy-enter-from, .authentication-copy-leave-to { opacity: 0; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .authentication-status__spinner { animation: none; }
  .authentication-copy-enter-active, .authentication-copy-leave-active { transition: none; }
  button { transition: none; }
}
</style>
