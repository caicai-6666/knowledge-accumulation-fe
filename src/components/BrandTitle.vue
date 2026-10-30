<script setup>
import { locale, t } from '../i18n/index.js'
</script>

<template>
  <span class="brand-title" :class="{ 'is-english': locale === 'en' }">
    <span class="brand-title__label">{{ t('知更') }}</span>
    <svg v-if="locale !== 'en'" viewBox="0 0 120 56" fill="none" aria-hidden="true" focusable="false">
      <g class="brand-title__ink" stroke-width="4" transform="rotate(-3 29 28)">
        <path d="m17 9-6 9M14 15l15-1M9 26l23-1M21 16c0 13-3 20-12 27m11-12 11 10" />
        <path d="M38 17q-3 0-3 3l1 19q0 3 3 3l12-1q3 0 3-3l-1-20q0-3-3-2Z" />
      </g>
      <g class="brand-title__ink" stroke-width="4" transform="rotate(3 84 28)">
        <path d="M65 11q18-3 39-1M71 19q-2 0-2 3v12q0 2 3 2l22-1q3 0 3-3V20q0-3-3-2ZM70 27l26-1" />
        <path d="M84 12c1 20-1 30-20 35m7-10c9 7 20 12 33 10" />
      </g>
      <path d="m108 17 1.5 4.5L114 23l-4.5 1.5L108 29l-1.5-4.5L102 23l4.5-1.5Z" fill="#edb96f" />
      <path d="M39 32q5 4 9-1" stroke="#e59c8e" stroke-width="2.5" stroke-linecap="round" />
      <circle cx="59" cy="8" r="2.2" fill="#e59c8e" />
    </svg>
    <svg v-else viewBox="0 0 160 50" fill="none" aria-hidden="true" focusable="false">
      <g class="brand-title__ink" stroke-width="3.4">
        <path d="m9 15 19-1L9 35l20-1M36 10v25m0-10q0-7 7-7t6 8v9M57 20v15" />
        <path d="M80 22c-8-9-17-3-15 7s15 7 15-1m0-8v17q0 9-10 7l-4-2M89 26h15c-1-12-17-9-17 2 0 10 13 10 17 5M113 20v15m0-10q1-7 8-6t5 8v8" />
        <path d="M151 22c-8-9-17-3-15 7s15 7 15-1m0-8v17q0 9-10 7l-4-2" />
      </g>
      <circle cx="57" cy="12" r="2.2" fill="#e59c8e" />
      <path d="m103 5 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" fill="#edb96f" />
    </svg>
  </span>
</template>

<style scoped>
.brand-title { position: relative; display: inline-flex; align-items: center; width: 78px; height: 38px; vertical-align: middle; }
.brand-title.is-english { width: 124px; }
.brand-title svg { display: block; width: 100%; height: 100%; overflow: visible; }
.brand-title__ink { stroke: #527e73; stroke-linecap: round; stroke-linejoin: round; }
.brand-title__label { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (max-width: 900px) { .brand-title { width: 62px; height: 30px; } .brand-title.is-english { width: 90px; } }
</style>
