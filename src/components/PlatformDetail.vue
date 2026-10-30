<script setup>
import { t } from '../i18n/index.js'
import PlatformManager from './PlatformManager.vue'
import PlatformDescription from './PlatformDescription.vue'

defineProps({ platform: { type: Object, required: true } })
</script>

<template>
  <div class="platform-detail__body" :style="{ '--platform-accent': platform.accent }">
    <h2 id="platform-detail-title" class="sr-only">{{ platform.name }}</h2>
    <div class="platform-detail__overview">
      <div class="platform-detail__description-scroll">
        <PlatformDescription class="platform-detail__description" :description="platform.description" />
      </div>
      <footer class="platform-detail__footer">
        <a v-if="platform.entryUrl" :href="platform.entryUrl" class="platform-detail__entry">{{ t('进入平台') }}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></a>
        <button v-else type="button" class="platform-detail__entry" disabled :title="t('平台入口暂未配置')">{{ t('进入平台') }}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></button>
      </footer>
    </div>

    <section class="platform-detail__section" aria-labelledby="platform-managers-title">
      <h3 id="platform-managers-title">{{ t('平台管理人') }}</h3>
      <ul v-if="platform.admins.length" class="platform-detail__managers">
        <PlatformManager v-for="(manager, index) in platform.admins" :key="index" :manager="manager" :index="index" />
      </ul>
      <p v-else class="platform-detail__empty">{{ t('暂无管理人') }}</p>
    </section>
  </div>
</template>

<style scoped>
.platform-detail__body { display: grid; grid-template-columns: minmax(0, 1fr) clamp(220px, 24%, 288px); gap: clamp(24px, 3vw, 40px); flex: 1; min-height: 0; overflow: hidden; padding: clamp(24px, 2.5vw, 36px); }
.platform-detail__overview { display: grid; grid-template-rows: minmax(0, 1fr) auto; min-width: 0; min-height: 0; }
.platform-detail__description-scroll { min-height: 0; overflow: auto; padding-right: 10px; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #879c8e40 transparent; }
.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.platform-detail__description { margin: 0; }
.platform-detail__section { display: flex; flex-direction: column; min-width: 0; min-height: 0; padding-left: clamp(20px, 2vw, 28px); border-left: 1px solid #668b7017; }
.platform-detail__section h3 { flex: none; margin: 0 0 16px; color: #4b6053; font-size: 14px; font-weight: 600; }
.platform-detail__managers { min-height: 0; margin: 0; padding: 0 5px 0 0; overflow: auto; list-style: none; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #879c8e40 transparent; }
.platform-detail__empty { margin: 0; padding: 12px 0; color: #8b9a91; font-size: 13px; }
.platform-detail__footer { display: flex; justify-content: center; padding: 20px 8px 8px; margin-top: 20px; border-top: 1px solid #668b7017; }
/* From Uiverse.io by ke1221；链接与按钮共用浮雕样式。 */
.platform-detail__entry { display: inline-flex; align-items: center; justify-content: center; gap: 20px; color: #090909; padding: .7em 1.7em; font: inherit; font-size: 18px; line-height: 1.4; border-radius: .5em; background: #e8e8e8; cursor: pointer; border: 1px solid #e8e8e8; text-decoration: none; transition: color .3s, box-shadow .3s; box-shadow: 6px 6px 12px #c5c5c5, -6px -6px 12px #ffffff; }
.platform-detail__entry:focus-visible { outline: 3px solid #7063d8; outline-offset: 3px; }
.platform-detail__footer button:disabled { cursor: not-allowed; opacity: .5; }
.platform-detail__footer svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
@media (max-width: 1100px) and (min-width: 901px) {
  .platform-detail__body { grid-template-columns: minmax(0, 1fr) 200px; gap: 20px; padding: 24px; }
  .platform-detail__section { padding-left: 18px; }
}
@media (max-width: 900px) and (min-width: 761px) {
  .platform-detail__body { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; gap: 22px; padding: 24px; }
  .platform-detail__section { max-height: 180px; padding: 20px 0 0; border-left: 0; border-top: 1px solid #668b7017; }
}
@media (max-width: 760px) {
  .platform-detail__body { grid-template-columns: minmax(0, 1fr); gap: 26px; overflow: visible; padding: 26px 20px; }
  .platform-detail__overview { grid-template-rows: auto auto; }
  .platform-detail__description-scroll { overflow: visible; padding: 0; }
  .platform-detail__section { padding: 22px 0 0; border-left: 0; border-top: 1px solid #668b7017; }
  .platform-detail__managers { overflow: visible; }
  .platform-detail__footer { padding-top: 20px; }
}
@media (prefers-reduced-motion: reduce) { .platform-detail__entry { transition: none; } }
</style>
