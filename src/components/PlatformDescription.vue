<script setup>
import { t } from '../i18n/index.js'
import { computed } from 'vue'
import { renderPlatformDescription } from '../models/platformDescription.js'

const props = defineProps({ description: { type: String, default: '' } })
const html = computed(() => renderPlatformDescription(props.description))
</script>

<template>
  <div v-if="html" class="platform-description" v-html="html"></div>
  <p v-else class="platform-description platform-description--empty">{{ t('暂无平台摘要') }}</p>
</template>

<style scoped>
.platform-description { max-width: 800px; margin: 26px 0 30px; color: #677b6e; font-size: 14px; line-height: 1.8; overflow-wrap: anywhere; }
.platform-description :deep(p) { margin: 0 0 12px; }
.platform-description :deep(> p:first-child) { color: #536c5d; font-size: 14px; line-height: 1.85; }
.platform-description :deep(strong) { color: #344f3e; font-weight: 650; }
.platform-description :deep(h3), .platform-description :deep(h4) { margin: 18px 0 9px; color: #435e4d; font-size: 14px; font-weight: 650; line-height: 1.6; }
.platform-description :deep(h3) { display: flex; align-items: center; gap: 9px; }
.platform-description :deep(h3::before) { content: ''; flex: none; width: 3px; height: 13px; border-radius: 3px; background: var(--platform-accent, #72978a); opacity: .7; }
.platform-description :deep(ul), .platform-description :deep(ol) { margin: 0 0 14px; padding-left: 22px; }
.platform-description :deep(li) { padding-left: 3px; margin: 6px 0; }
.platform-description :deep(li::marker) { color: var(--platform-accent, #72978a); }
.platform-description :deep(li p) { margin-bottom: 5px; }
.platform-description :deep(li strong) { font-weight: 600; }
.platform-description :deep(code) { display: inline-block; max-width: 100%; margin: 3px 5px 3px 0; padding: 2px 10px; border: 1px solid color-mix(in srgb, var(--platform-accent, #72978a) 15%, transparent); border-radius: 7px; color: color-mix(in srgb, var(--platform-accent, #72978a) 70%, #293d30); background: color-mix(in srgb, var(--platform-accent, #72978a) 7%, #ffffffb3); font-family: inherit; font-size: 12px; font-weight: 500; line-height: 1.8; vertical-align: baseline; white-space: normal; overflow-wrap: anywhere; }
.platform-description :deep(a) { color: #5268a0; text-decoration-thickness: 1px; text-underline-offset: 3px; }
.platform-description :deep(a:focus-visible) { outline: 2px solid var(--platform-accent, #72978a); outline-offset: 3px; border-radius: 2px; }
.platform-description :deep(> :first-child) { margin-top: 0; }
.platform-description :deep(> :last-child) { margin-bottom: 0; }
.platform-description--empty { color: #8b9a91; }
@media (max-width: 760px) {
  .platform-description { margin: 22px 0 26px; font-size: 13px; }
  .platform-description :deep(> p:first-child) { font-size: 14px; }
  .platform-description :deep(h3), .platform-description :deep(h4) { margin-top: 20px; font-size: 13px; }
}
</style>
