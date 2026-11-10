<script setup>
import { useId } from 'vue'
import { locale as language, restoreLanguage, setLanguage, t } from '../i18n/index.js'

const inputId = `language-${useId()}`
restoreLanguage()
function changeLanguage(event) { setLanguage(event.target.checked ? 'en' : 'zh') }
</script>

<template>
  <div class="language-switch" :class="{ 'is-english': language === 'en' }">
    <span class="language-switch__label-slot" aria-hidden="true">
      <Transition name="language-label" mode="out-in">
        <span :key="language" class="language-switch__label is-selected">{{ language }}</span>
      </Transition>
    </span>
    <label class="switch">
      <input :id="inputId" type="checkbox" role="switch" :checked="language === 'en'" :aria-label="language === 'en' ? t('语言偏好，当前英文') : t('语言偏好，当前中文')" :title="language === 'en' ? t('选择中文偏好') : t('选择 English 偏好')" @change="changeLanguage" />
      <span class="slider" aria-hidden="true"></span>
    </label>
  </div>
</template>

<style scoped>
/* Adapted from Uiverse.io by RaspberryBee. */
.language-switch { display: inline-flex; align-items: center; flex: none; gap: 6px; }
.language-switch__label-slot { position: relative; display: block; flex: none; width: 18px; height: 1em; overflow: hidden; }
.language-switch__label { position: absolute; inset: 0 auto auto 0; display: block; color: #5b7fa8; font-size: 11px; font-weight: 600; line-height: 1; white-space: nowrap; }
.language-label-enter-active, .language-label-leave-active { transition: opacity .24s ease, transform .24s cubic-bezier(.22, 1, .36, 1); }
.language-label-enter-from { opacity: 0; transform: translateX(-8px); }
.language-label-leave-to { opacity: 0; transform: translateX(8px); }
.switch { position: relative; display: inline-block; flex: none; width: 3.2em; height: 1.8em; font-size: 15px; filter: drop-shadow(0 3px 5px #344e3d24); }
.switch input { position: absolute; z-index: 1; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.slider { position: absolute; inset: 0; box-sizing: border-box; cursor: pointer; background: linear-gradient(145deg, #d0d4d5, #aeb4b6); border: 1px solid #ffffff9c; border-radius: 10px; box-shadow: inset 0 1px 2px #51605a35, inset 0 -1px 1px #ffffff45, 0 1px 2px #344e3d1c; transition: .4s; }
.slider::before { position: absolute; bottom: .275em; left: .275em; box-sizing: border-box; width: 1.25em; height: 1.25em; border: 1px solid #ffffffd9; border-radius: 7px; background: linear-gradient(145deg, #fff, #edf2ef); box-shadow: 0 2px 4px #344e3d38, inset 0 1px #fff; content: ''; transform: rotate(270deg); transition: .4s; }
.switch input:checked + .slider { background: linear-gradient(145deg, #35d95e, #1db548); box-shadow: inset 0 1px 2px #14752d55, inset 0 -1px 1px #ffffff33, 0 1px 3px #168b3745; }
.switch input:focus-visible + .slider { outline: 2px solid #2196f3; outline-offset: 3px; box-shadow: 0 0 1px #2196f3; }
.switch input:checked + .slider::before { transform: translateX(1.4em); }
@media (prefers-reduced-motion: reduce) { .language-switch *, .language-switch *::before, .language-switch *::after { transition: none !important; } }
</style>
