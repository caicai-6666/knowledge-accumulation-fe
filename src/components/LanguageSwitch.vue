<script setup>
import { useId } from 'vue'
import { locale as language, restoreLanguage, setLanguage, t } from '../i18n/index.js'

const inputId = `language-${useId()}`
restoreLanguage()
function changeLanguage(event) { setLanguage(event.target.checked ? 'en' : 'zh') }
</script>

<template>
  <div class="language-switch" :class="{ 'is-english': language === 'en' }">
    <span class="language-switch__label" :class="{ 'is-selected': language === 'zh' }" aria-hidden="true">zh</span>
    <div class="toggleWrapper">
      <input :id="inputId" class="input" type="checkbox" role="switch" :checked="language === 'en'" :aria-label="language === 'en' ? t('语言偏好，当前英文') : t('语言偏好，当前中文')" :title="language === 'en' ? t('选择中文偏好') : t('选择 English 偏好')" @change="changeLanguage" />
      <label class="toggle" :for="inputId" aria-hidden="true">
        <span class="toggle__handler">
          <span class="crater crater--1"></span><span class="crater crater--2"></span><span class="crater crater--3"></span>
        </span>
        <span class="star star--1"></span><span class="star star--2"></span><span class="star star--3"></span>
        <span class="star star--4"></span><span class="star star--5"></span><span class="star star--6"></span>
      </label>
    </div>
    <span class="language-switch__label" :class="{ 'is-selected': language === 'en' }" aria-hidden="true">en</span>
  </div>
</template>

<style scoped>
/* Adapted from Uiverse.io by mobinkakei. */
.language-switch { display: inline-flex; align-items: center; flex: none; gap: 8px; }
.language-switch__label { color: #a3adb5; font-size: 11px; font-weight: 600; line-height: 1; transition: color .2s ease; }
.language-switch__label.is-selected { color: #5b7fa8; }
.toggleWrapper { position: relative; display: flex; border-radius: 99px; }
.toggleWrapper .input { position: absolute; z-index: 2; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.toggle { position: relative; display: inline-block; width: 54px; height: 30px; overflow: hidden; background: #83d8ff; border-radius: 84px; box-shadow: inset 0 1px 3px #426b8624, 0 2px 6px #54739212; transition: background-color .2s cubic-bezier(.445,.05,.55,.95); }
.input:focus-visible + .toggle { outline: 2px solid #8472bd; outline-offset: 4px; }
.toggle__handler { display: inline-block; position: relative; z-index: 1; top: 2px; left: 2px; width: 26px; height: 26px; background: #ffcf96; border-radius: 50%; box-shadow: 0 2px 6px #0003; transition: transform .4s cubic-bezier(.68,-.55,.265,1.55), background-color .4s ease; transform: rotate(-45deg); }
.crater { position: absolute; background: #e8cda5; opacity: 0; border-radius: 100%; transition: opacity .2s ease-in-out; }
.crater--1 { top: 11px; left: 6px; width: 2.4px; height: 2.4px; }
.crater--2 { top: 17px; left: 13px; width: 3.6px; height: 3.6px; }
.crater--3 { top: 6px; left: 15px; width: 4.8px; height: 4.8px; }
.star { position: absolute; background: #fff; border-radius: 50%; transition: all .3s cubic-bezier(.445,.05,.55,.95); }
.star--1 { top: 6px; left: 21px; z-index: 0; width: 18px; height: 1.8px; }
.star--2 { top: 11px; left: 17px; z-index: 1; width: 18px; height: 1.8px; }
.star--3 { top: 16px; left: 24px; z-index: 0; width: 18px; height: 1.8px; }
.star--4, .star--5, .star--6 { opacity: 0; transform: translate3d(2px,0,0); }
.star--4 { top: 10px; left: 7px; width: 1.2px; height: 1.2px; }
.star--5 { top: 19px; left: 10px; width: 1.8px; height: 1.8px; }
.star--6 { top: 22px; left: 17px; width: 1.2px; height: 1.2px; }
.input:checked + .toggle { background: #749dd6; }
.input:checked + .toggle .toggle__handler { background: #ffe5b5; transform: translate3d(24px,0,0) rotate(0); }
.input:checked + .toggle .crater { opacity: 1; }
.input:checked + .toggle .star--1 { width: 1.2px; height: 1.2px; }
.input:checked + .toggle .star--2 { width: 2.4px; height: 2.4px; transform: translate3d(-3px,0,0); }
.input:checked + .toggle .star--3 { width: 1.2px; height: 1.2px; transform: translate3d(-4px,0,0); }
.input:checked + .toggle .star--4, .input:checked + .toggle .star--5, .input:checked + .toggle .star--6 { opacity: 1; transform: translate3d(0,0,0); }
.input:checked + .toggle .star--4 { transition-delay: .2s; }
.input:checked + .toggle .star--5 { transition-delay: .3s; }
.input:checked + .toggle .star--6 { transition-delay: .4s; }
@media (prefers-reduced-motion: reduce) { .language-switch *, .language-switch *::before, .language-switch *::after { transition: none !important; } }
</style>
