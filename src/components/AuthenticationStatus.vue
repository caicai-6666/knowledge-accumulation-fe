<script setup>
import { t } from '../i18n/index.js'
defineProps({ loading: Boolean, message: { type: String, default: '' } })
defineEmits(['retry'])
</script>

<template>
  <section class="authentication-status" aria-live="polite" :aria-busy="loading" data-molecular-field-block>
    <div class="authentication-status__copy">
      <Transition name="authentication-copy" mode="out-in">
        <div :key="loading ? 'loading' : 'error'" class="authentication-status__content">
          <h1>{{ loading ? t('正在进入') : t('暂时无法进入') }}</h1>
          <div v-if="loading" class="authentication-status__loading" role="status" :aria-label="t('正在连接知识沉淀服务，请稍候')"><span class="authentication-status__spinner" aria-hidden="true"></span></div>
          <div v-else class="authentication-status__failure"><p>{{ message }}</p><button type="button" @click="$emit('retry')">{{ t('重新尝试') }}</button></div>
        </div>
      </Transition>
    </div>
  </section>
</template>
