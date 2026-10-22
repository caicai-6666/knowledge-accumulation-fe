<script setup>
import { computed } from 'vue'
const props = defineProps({ platforms: { type: Array, required: true }, modelValue: { type: String, default: '' }, active: Boolean })
const emit = defineEmits(['update:modelValue'])
const selectedIndex = computed(() => props.platforms.findIndex(item => item.code === props.modelValue))
const accent = computed(() => props.platforms[selectedIndex.value]?.accent || '#7468d5')
</script>

<template>
  <nav class="platform-navigation" :class="{ 'is-active': active, 'has-selection': selectedIndex >= 0 }" :style="{ '--platform-accent': accent, '--platform-index': Math.max(0, selectedIndex) }" aria-label="选择管理平台">
    <span class="platform-navigation__slider" aria-hidden="true"></span>
    <button v-for="(platform, index) in platforms" :key="platform.code" type="button" class="platform-navigation__item" :class="{ 'is-selected': modelValue === platform.code }" :style="{ '--item-accent': platform.accent, '--enter-delay': `${220 + index * 120}ms` }" :aria-pressed="modelValue === platform.code" :title="platform.name" @click="emit('update:modelValue', modelValue === platform.code ? '' : platform.code)">
      <span class="platform-navigation__icon" aria-hidden="true">
        <img v-if="platform.iconUrl" :src="platform.iconUrl" alt="" draggable="false" />
        <svg v-else viewBox="0 0 32 32"><path :d="platform.iconPath" /></svg>
      </span>
      <span class="platform-navigation__label">{{ platform.name }}</span>
      <span class="platform-navigation__state" aria-hidden="true"><i></i></span>
    </button>
  </nav>
</template>

<style scoped>
/* 沿用 registry-fe 审核广场第一栏的表面、滑块和动效。 */
.platform-navigation { position: relative; isolation: isolate; display: flex; flex-direction: column; gap: 9px; min-width: 0; padding: 14px; overflow: hidden; background: #fafcfcdc; border: 1px solid #ffffffeb; border-radius: 27px; box-shadow: inset 0 1px #ffffffdb, 0 18px 40px #34424e17; }
.platform-navigation::before { position: absolute; z-index: 0; top: -82px; left: -72px; width: 210px; height: 210px; background: radial-gradient(circle, color-mix(in srgb, var(--platform-accent) 18%, transparent), transparent 68%); border-radius: 50%; content: ''; pointer-events: none; }
.platform-navigation__slider { position: absolute; z-index: 1; top: 14px; right: 14px; left: 14px; height: 74px; border: 1px solid color-mix(in srgb, var(--platform-accent) 25%, transparent); border-radius: 18px; background: radial-gradient(circle, color-mix(in srgb, var(--platform-accent) 32%, transparent) 0 12%, transparent 54%), radial-gradient(circle, #3dae8e3d 0 10%, transparent 50%), linear-gradient(118deg, #ffffffbd 0%, color-mix(in srgb, var(--platform-accent) 16%, white) 48%, #e0f3ecd6 100%); background-size: 75% 170%, 78% 160%, 190% 190%; box-shadow: inset 0 1px #ffffffe6, 0 10px 24px color-mix(in srgb, var(--platform-accent) 18%, transparent); pointer-events: none; transform: translate3d(0, calc(var(--platform-index) * 83px), 0); transition: transform 620ms cubic-bezier(.16, 1, .3, 1), border-color 420ms ease, box-shadow 420ms ease; animation: review-selected-flow 5.8s ease-in-out infinite alternate; animation-play-state: paused; }
.is-active .platform-navigation__slider { animation-play-state: running; }
.platform-navigation__item { position: relative; z-index: 2; mix-blend-mode: multiply; display: grid; grid-template-columns: 38px minmax(0, 1fr) 20px; align-items: center; gap: 10px; flex: 0 0 74px; width: 100%; min-width: 0; height: 74px; padding: 10px; color: #68746d; font: inherit; text-align: left; background: transparent; border: 1px solid transparent; border-radius: 18px; cursor: pointer; transform: translate3d(0, 0, 0); transition: background-color 420ms, border-color 420ms, color 360ms, transform 480ms cubic-bezier(.16, 1, .3, 1); }
.is-active .platform-navigation__item { animation: review-nav-enter 900ms cubic-bezier(.16, 1, .3, 1) var(--enter-delay) backwards; }
.platform-navigation__icon { position: relative; display: grid; place-items: center; width: 38px; height: 38px; color: var(--item-accent); background: transparent; border: 1px solid transparent; border-radius: 12px; transition: background-color 360ms, box-shadow 420ms, transform 480ms cubic-bezier(.16, 1, .3, 1); }
.platform-navigation__icon svg { width: 28px; height: 28px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.platform-navigation__icon img { display: block; width: 32px; height: 32px; object-fit: contain; }
.platform-navigation__label { position: relative; min-width: 0; overflow: hidden; font-size: 14px; font-weight: 650; white-space: nowrap; text-overflow: ellipsis; }
.platform-navigation__state { display: grid; place-items: center; width: 20px; height: 20px; color: var(--item-accent); border: 1px solid transparent; border-radius: 50%; transition: background-color 360ms, border-color 360ms; }
.platform-navigation__state i { width: 5px; height: 5px; background: currentColor; border-radius: 50%; opacity: .38; transition: opacity 360ms; }
.is-selected { color: #2d3932; }
.is-selected .platform-navigation__icon { background: transparent; }
.is-selected .platform-navigation__state { background: color-mix(in srgb, var(--item-accent) 11%, transparent); border-color: color-mix(in srgb, var(--item-accent) 14%, transparent); }
.is-selected .platform-navigation__state i { opacity: 1; }
.platform-navigation__item:focus-visible { outline: 3px solid color-mix(in srgb, var(--item-accent) 30%, transparent); outline-offset: 2px; }
@keyframes review-selected-flow { 0% { background-position: -35% 5%, 125% 95%, 0% 50%; } 50% { background-position: 62% 70%, 45% 12%, 52% 45%; } 100% { background-position: 128% 22%, -32% 78%, 100% 56%; } }
@keyframes review-nav-enter { from { filter: blur(4px); opacity: 0; transform: translate3d(-42px, 0, 0) scale(.96); } to { filter: blur(0); opacity: 1; transform: translate3d(0, 0, 0) scale(1); } }
@media (hover: hover) { .platform-navigation__item:hover:not(.is-selected) { color: #3d4942; background: #ffffffcc; border-color: #ffffffe0; transform: translateX(3px); } .platform-navigation__item:hover .platform-navigation__icon { transform: rotate(-3deg) scale(1.035); } }
@media (max-width: 760px) {
  .platform-navigation { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; padding: 10px; border-radius: 20px; overflow: visible; }
  .platform-navigation__item { height: 64px; min-height: 64px; grid-template-columns: 30px minmax(0, 1fr); gap: 8px; padding: 8px; }
  .platform-navigation__icon { width: 30px; height: 34px; }
  .platform-navigation__icon img { width: 28px; height: 28px; }
  .platform-navigation__label { font-size: 12px; white-space: normal; }
  .platform-navigation__state, .platform-navigation__slider { display: none; }
  .platform-navigation__item.is-selected { border-color: color-mix(in srgb, var(--item-accent) 25%, transparent); background: linear-gradient(118deg, #ffffffbd, color-mix(in srgb, var(--item-accent) 16%, white), #e0f3ecd6); box-shadow: inset 0 1px #ffffffe6; }
}
@media (prefers-reduced-motion: reduce) { .platform-navigation__slider, .is-active .platform-navigation__item { animation: none; } .platform-navigation__slider, .platform-navigation__item, .platform-navigation__icon, .platform-navigation__state, .platform-navigation__state i { transition: none; } }

.platform-navigation { overflow-y: auto; align-content: start; }
.platform-navigation__slider { opacity: 0; }
.platform-navigation.has-selection .platform-navigation__slider { opacity: 1; }
</style>
