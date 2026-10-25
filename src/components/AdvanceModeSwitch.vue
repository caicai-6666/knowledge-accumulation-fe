<script setup>
import { t } from '../i18n/index.js'
import { useId } from 'vue'
const props = defineProps({ modelValue: Boolean, disabled: Boolean, active: { type: Boolean, default: true } })
const emit = defineEmits(['update:modelValue'])
const id = `advance-${useId()}`
function toggle(event) {
  if (!props.disabled) emit('update:modelValue', event.target.checked)
}
</script>

<template>
  <div class="advance-mode" :class="{ 'is-disabled': disabled, 'is-paused': !active }" :title="disabled ? modelValue ? t('新探索首条消息固定使用推进模式') : t('仅主干末尾节点可开启推进模式') : modelValue ? t('推进模式') : t('探索模式')">
    <!-- From Uiverse.io by mamyapro123; adapted for a compact, accessible switch. -->
    <svg class="advance-mode__filters" aria-hidden="true"><defs>
      <filter :id="`${id}-sketchy`" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="turbulence" baseFrequency="0.035 0.042" numOctaves="4" result="noise" seed="42" /><feDisplacementMap in="SourceGraphic" in2="noise" scale="4.5" xChannelSelector="R" yChannelSelector="G" /></filter>
      <filter :id="`${id}-sketchy-sm`" x="-18%" y="-18%" width="136%" height="136%"><feTurbulence type="turbulence" baseFrequency="0.06" numOctaves="3" result="noise" seed="7" /><feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G" /></filter>
    </defs></svg>
    <label class="advance-mode__label">
      <span class="advance-mode__text">{{ modelValue ? t('推进模式') : t('探索模式') }}</span>
      <span class="theme-switch" :style="{ '--sketchy': `url(#${id}-sketchy)`, '--sketchy-sm': `url(#${id}-sketchy-sm)` }">
        <input class="theme-switch__checkbox" type="checkbox" role="switch" :aria-label="t('推进模式')" :checked="modelValue" :disabled="disabled" :aria-checked="modelValue" @change="toggle" />
        <span class="theme-switch__container" :class="{ 'is-exploring': !modelValue }" aria-hidden="true">
          <span class="theme-switch__clouds"></span>
          <span class="theme-switch__stars-container"><svg fill="none" viewBox="0 0 144 55"><path v-for="(point, index) in [[4,36],[35,23],[58,25],[85,25],[103,50],[137,4],[140,36]]" :key="index" :transform="`translate(${point[0]},${point[1]})`" fill="currentColor" d="M-4 0Q0 0 0-4Q0 0 4 0Q0 0 0 4Q0 0-4 0" /></svg></span>
          <span class="theme-switch__circle-container"><span class="theme-switch__sun-moon-container"><span class="theme-switch__moon"><span class="theme-switch__spot"></span><span class="theme-switch__spot"></span><span class="theme-switch__spot"></span></span></span></span>
          <span class="theme-switch__shooting-star"></span><span class="theme-switch__shooting-star-2"></span><span class="theme-switch__meteor"></span>
          <span class="theme-switch__stars-cluster"><span v-for="n in 5" :key="n" class="star"></span></span>
          <span class="theme-switch__aurora"></span><span class="theme-switch__comets"><span class="comet"></span><span class="comet"></span></span>
        </span>
      </span>
    </label>
  </div>
</template>

<style scoped>
/* From Uiverse.io by mamyapro123 */
.advance-mode { flex: none; -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none; }
.advance-mode__filters { position: absolute; width: 0; height: 0; overflow: hidden; }
.advance-mode__label { display: flex; align-items: center; gap: 9px; cursor: pointer; touch-action: manipulation; }
.advance-mode__text { color: #7e8c83; font-size: 10px; white-space: nowrap; }
.advance-mode.is-disabled { opacity: .42; }
.advance-mode.is-disabled .advance-mode__label, .advance-mode.is-disabled .theme-switch__container { cursor: not-allowed; }
.theme-switch { --toggle-size: 10px; --container-width: 5.625em; --container-height: 2.5em; --container-radius: .38em; --container-light-bg: #5caad4; --container-night-bg: #1b1e36; --circle-container-diameter: 3.375em; --sun-moon-diameter: 2.125em; --sun-bg: #f5c518; --moon-bg: #d8d4c0; --spot-color: #9b9787; --circle-container-offset: calc((var(--circle-container-diameter) - var(--container-height)) / 2 * -1); --stars-color: #fff8e1; --clouds-color: #f4f4f4; --back-clouds-color: #bacfe0; --transition: .5s cubic-bezier(0,-.02,.4,1.25); --circle-transition: .3s cubic-bezier(0,-.02,.35,1.17); position: relative; display: inline-block; flex: none; }
.theme-switch, .theme-switch *, .theme-switch *::before, .theme-switch *::after { box-sizing: border-box; margin: 0; padding: 0; font-size: var(--toggle-size); }
.theme-switch__container { display: block; width: var(--container-width); height: var(--container-height); background-color: var(--container-light-bg); border-radius: var(--container-radius); overflow: hidden; cursor: pointer; position: relative; background-image: linear-gradient(to bottom,var(--container-light-bg),#4a92bd); transition: all var(--transition); box-shadow: 0 0 0 1px #1a1a1a, 1px 2px 0 1px #1a1a1a38; transform: rotate(-.7deg); filter: var(--sketchy); }
.theme-switch__container::before { content: ''; position: absolute; z-index: 1; inset: 0; background-image: repeating-linear-gradient(-50deg,transparent,transparent 7px,#ffffff0a 7px,#ffffff0a 8px); border-radius: inherit; pointer-events: none; }
.theme-switch__checkbox { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.theme-switch__checkbox:focus-visible + .theme-switch__container { outline: 2px solid #9285ba; outline-offset: 5px; }
.theme-switch__circle-container { width: var(--circle-container-diameter); height: var(--circle-container-diameter); background: #ffffff1a; position: absolute; left: var(--circle-container-offset); top: var(--circle-container-offset); border-radius: var(--container-radius); box-shadow: inset 0 0 0 3.375em #ffffff1a,inset 0 0 0 3.375em #ffffff1a,0 0 0 .625em #ffffff1a,0 0 0 1.25em #ffffff1a; display: flex; transition: var(--circle-transition); pointer-events: none; }
.theme-switch__circle-container::before { content: ''; position: absolute; width: calc(var(--circle-container-diameter) + 1.5em); height: calc(var(--circle-container-diameter) + 1.5em); left: -.75em; top: -.75em; border-radius: 50%; background: repeating-conic-gradient(transparent 0deg 8deg,#f5c51885 8deg 22deg,transparent 22deg 45deg); animation: rotateSunRays 14s linear infinite; opacity: 1; transition: opacity var(--transition); filter: var(--sketchy-sm); }
.theme-switch__sun-moon-container { position: relative; z-index: 2; width: var(--sun-moon-diameter); height: var(--sun-moon-diameter); margin: auto; border-radius: var(--container-radius); background: var(--sun-bg); box-shadow: .062em .062em .062em #feffef9c inset,0 -.062em .062em #a1872a inset,.1em .13em 0 .04em #1a1a1a; filter: var(--sketchy-sm) drop-shadow(.062em .125em .125em #00000040) drop-shadow(0 .062em .125em #00000040); overflow: hidden; transition: var(--transition); }
.theme-switch__moon { display: block; transform: translateX(100%); width: 100%; height: 100%; background: var(--moon-bg); border-radius: inherit; box-shadow: .062em .062em .062em #feffef9c inset,0 -.062em .062em #969696 inset; transition: all var(--transition),transform .3s ease; position: relative; }
.theme-switch__spot { position: absolute; top: .75em; left: .312em; width: .75em; height: .75em; border-radius: var(--container-radius); background: var(--spot-color); box-shadow: 0 .0312em .062em #00000040 inset; filter: var(--sketchy-sm); }
.theme-switch__spot:nth-of-type(2) { width: .375em; height: .375em; top: .937em; left: 1.375em; }
.theme-switch__spot:nth-of-type(3) { width: .25em; height: .25em; top: .312em; left: .812em; }
.theme-switch__clouds { width: 1.25em; height: 1.25em; background: var(--clouds-color); border-radius: var(--container-radius); position: absolute; bottom: -.625em; left: .312em; box-shadow: .937em .312em var(--clouds-color),-.312em -.312em var(--back-clouds-color),1.437em .375em var(--clouds-color),.5em -.125em var(--back-clouds-color),2.187em 0 var(--clouds-color),1.25em -.062em var(--back-clouds-color),2.937em .312em var(--clouds-color),2em -.312em var(--back-clouds-color),3.625em -.062em var(--clouds-color),2.625em 0 var(--back-clouds-color),4.5em -.312em var(--clouds-color),3.375em -.437em var(--back-clouds-color),4.625em -1.75em 0 .437em var(--clouds-color),4em -.625em var(--back-clouds-color),4.125em -2.125em 0 .437em var(--back-clouds-color); transition: var(--transition); filter: var(--sketchy-sm); }
.theme-switch__stars-container { position: absolute; color: var(--stars-color); top: -100%; left: .312em; width: 2.75em; transition: var(--transition); }
.theme-switch__stars-container svg { display: block; width: 100%; height: auto; }
.theme-switch__container.is-exploring { background-color: var(--container-night-bg); background-image: linear-gradient(to bottom,var(--container-night-bg),#252a4a); }
.theme-switch__container.is-exploring .theme-switch__circle-container { left: calc(100% - var(--circle-container-offset) - var(--circle-container-diameter)); }
.theme-switch__container.is-exploring .theme-switch__circle-container::before { opacity: 0; }
.theme-switch__container.is-exploring .theme-switch__moon { transform: translateX(0); }
.theme-switch__container.is-exploring .theme-switch__clouds { bottom: -4.062em; }
.theme-switch__container.is-exploring .theme-switch__stars-container { top: 50%; transform: translateY(-50%); }
.theme-switch__shooting-star, .theme-switch__shooting-star-2 { position: absolute; width: 2px; height: 2px; background: white; top: 20%; left: -10%; opacity: 0; }
.theme-switch__shooting-star-2 { width: 1px; height: 1px; top: 35%; }
.theme-switch__meteor { position: absolute; width: 3px; height: 3px; background: #ffd700; border-radius: 50%; top: -10%; left: 50%; opacity: 0; filter: blur(1px); }
.theme-switch__container.is-exploring .theme-switch__shooting-star { animation: shootingStar 2s linear infinite; }
.theme-switch__container.is-exploring .theme-switch__shooting-star-2 { animation: shootingStar 3s linear infinite 1s; }
.theme-switch__container.is-exploring .theme-switch__meteor { animation: meteor 4s linear infinite 2s; }
.theme-switch__stars-cluster { position: absolute; inset: 0; opacity: 0; transition: opacity .3s ease; }
.theme-switch__stars-cluster .star { position: absolute; width: 2px; height: 2px; background: white; border-radius: 50%; box-shadow: 0 0 4px 1px white; animation: twinkle 1s infinite ease-in-out; }
.star:nth-child(1) { top: 20%; left: 20%; }
.star:nth-child(2) { top: 30%; left: 55%; animation-delay: .3s; }
.star:nth-child(3) { top: 40%; left: 80%; animation-delay: .6s; }
.star:nth-child(4) { top: 60%; left: 30%; animation-delay: .9s; }
.star:nth-child(5) { top: 70%; left: 65%; animation-delay: 1.2s; }
.theme-switch__aurora { position: absolute; top: 0; left: 0; right: 0; height: 20px; background: linear-gradient(90deg,#00ffff00,#00ffff33 25%,#8000ff33 50%,#00ffff33 75%,#00ffff00); opacity: 0; filter: blur(4px); transform: translateY(-100%); transition: opacity .3s ease; }
.theme-switch__comets { position: absolute; inset: 0; overflow: hidden; opacity: 0; transition: opacity .3s ease; }
.comet { position: absolute; width: 2px; height: 2px; background: linear-gradient(90deg,white,transparent 90%); border-radius: 50%; filter: blur(1px); top: 30%; left: -10%; animation: cometMove 4s linear infinite; }
.comet:nth-child(2) { top: 50%; animation: cometMove 6s linear infinite 2s; }
.theme-switch__container.is-exploring :is(.theme-switch__stars-cluster,.theme-switch__aurora,.theme-switch__comets) { opacity: 1; }
.theme-switch__container.is-exploring .theme-switch__aurora { animation: auroraWave 8s linear infinite; }
.advance-mode:is(.is-paused,.is-disabled) .theme-switch *, .advance-mode:is(.is-paused,.is-disabled) .theme-switch *::before { animation-play-state: paused !important; }
@keyframes rotateSunRays { to { transform: rotate(360deg); } }
@keyframes shootingStar { from { transform: translate(0) rotate(45deg); opacity: 1; } to { transform: translate(150px,150px) rotate(45deg); opacity: 0; } }
@keyframes meteor { from { transform: translateY(0) scale(1); opacity: 1; } to { transform: translateY(150px) scale(.3); opacity: 0; } }
@keyframes twinkle { 0%,100% { opacity: .3; transform: scale(1); } 50% { opacity: 1; transform: scale(1.2); } }
@keyframes cometMove { 0% { transform: translate(0) rotate(-45deg); opacity: 0; } 10%,90% { opacity: 1; } 100% { transform: translate(200px,200px) rotate(-45deg) scale(.2); opacity: 0; } }
@keyframes auroraWave { from { transform: translate(-50%,-100%); } to { transform: translate(50%,-100%); } }
@media (prefers-reduced-motion: reduce) { .theme-switch *, .theme-switch *::before, .theme-switch *::after { animation: none !important; transition: none !important; } }
</style>
