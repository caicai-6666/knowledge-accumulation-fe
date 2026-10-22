<script setup>
import { computed, ref, useId, watch } from 'vue'
import MarkdownMessage from './MarkdownMessage.vue'
import onlineSearchImage from '../assets/online-search.webp'
import externalExpertImage from '../assets/external-expert.webp'
import { answerProcessSteps, answerStepPresentation, answerTimingLabel } from '../models/answerProcess.js'

const props = defineProps({ task: { type: Object, required: true }, finalVisible: Boolean, active: Boolean })
const emit = defineEmits(['display-updated', 'toggle'])
const progressImages = { 'online-search': onlineSearchImage, 'external-expert': externalExpertImage }
const id = `answer-process-${useId()}`
const expanded = ref(false)
const displayStates = ref({})
const steps = computed(() => answerProcessSteps(props.task))
const present = (step, active = false) => answerStepPresentation(step, props.task.status, { active })
const caughtUp = computed(() => steps.value.every(step => displayStates.value[step.id]?.complete))
const canCollapse = computed(() => props.task.status !== 'generating' || props.finalVisible && caughtUp.value)
const collapsed = computed(() => canCollapse.value && !expanded.value)
const timing = computed(() => answerTimingLabel(props.task))
function updateStep(step, state) {
  displayStates.value[step.id] = state
  emit('display-updated')
}
function toggle() { expanded.value = !expanded.value; emit('toggle') }
watch(() => props.task.status, status => { if (['cancelled', 'superseded', 'failed'].includes(status)) expanded.value = false })
</script>

<template>
  <div v-if="timing || steps.length" class="answer-process" :class="{ 'is-paused': !active }">
    <Transition name="turn-timing" appear>
      <div v-if="timing || canCollapse && steps.length" class="communication-turn-timing" aria-live="off">
        <div class="communication-turn-timing__content">
          <div class="communication-turn-timing__row">
            <span v-if="timing" title="本轮服务端处理用时">{{ timing }}</span>
            <button v-if="canCollapse && steps.length" type="button" class="communication-process-toggle" :aria-expanded="!collapsed" :aria-controls="id" :aria-label="collapsed ? '展开处理过程' : '收起处理过程'" :title="collapsed ? '展开处理过程' : '收起处理过程'" @click="toggle"><svg viewBox="0 0 16 16" aria-hidden="true" :class="{ 'is-expanded': !collapsed }"><path d="m6 4 4 4-4 4" /></svg></button>
          </div>
          <hr aria-hidden="true" />
        </div>
      </div>
    </Transition>
    <div :id="id" class="communication-process-region" :class="{ 'is-collapsed': collapsed }" :inert="collapsed" :aria-hidden="collapsed">
      <div class="communication-process-region__content">
        <section v-for="step in steps" :key="step.id" class="answer-process__step" :aria-label="present(step).fullText">
          <div class="communication-step" :class="{ 'communication-step--settled': step.status !== 'generating', 'communication-step--thinking': step.type === 'thinking' }">
            <img v-if="progressImages[step.type]" class="communication-progress-icon" :src="progressImages[step.type]" width="16" height="16" alt="" aria-hidden="true" /><i v-else-if="step.type !== 'thinking'" aria-hidden="true"></i>
            <span class="communication-step__label" :title="present(step).fullText"><span class="communication-step__measure" aria-hidden="true">{{ present(step, true).text }}</span><span class="communication-step__text">{{ present(step).text }}</span><span class="communication-step__pulse" aria-hidden="true"><span>{{ present(step).text }}</span></span></span>
          </div>
          <MarkdownMessage :content="step.content" :stream-state="step.status === 'generating' ? 'streaming' : 'completed'" :animate="active && !collapsed" stabilize-height @display-state="updateStep(step, $event)" />
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.answer-process { margin-bottom: 18px; min-width: 0; }
.communication-turn-timing { display: grid; grid-template-rows: 1fr; width: 100%; color: #879189; font-size: 12px; line-height: 1.6; font-variant-numeric: tabular-nums; }
.communication-turn-timing__content { min-height: 0; overflow: hidden; }
.communication-turn-timing__row { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 12px; }
.communication-process-toggle { display: inline-flex; align-items: center; gap: 5px; padding: 0; color: #829087; background: transparent; border: 0; cursor: pointer; }
.communication-process-toggle:hover { color: #405b4a; }
.communication-process-toggle:focus-visible { outline: 2px solid #9285ba; outline-offset: 3px; border-radius: 4px; }
.communication-process-toggle svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; transition: transform .2s ease; }
.communication-process-toggle svg.is-expanded { transform: rotate(90deg); }
.communication-turn-timing hr { margin: 9px 0 0; border: 0; border-top: 1px solid #dce3de; }
.turn-timing-enter-active, .turn-timing-leave-active { transition: grid-template-rows .4s cubic-bezier(.22,1,.36,1), opacity .3s ease; }
.turn-timing-enter-from, .turn-timing-leave-to { grid-template-rows: 0fr; opacity: 0; }
.communication-process-region { display: grid; grid-template-rows: 1fr; min-width: 0; margin-top: 14px; transition: grid-template-rows .42s cubic-bezier(.22,1,.36,1), margin-top .42s cubic-bezier(.22,1,.36,1), opacity .28s ease; }
.communication-process-region__content { display: flex; flex-direction: column; gap: 16px; min-height: 0; overflow: hidden; }
.communication-process-region.is-collapsed { grid-template-rows: 0fr; margin-top: 0; opacity: 0; }
.answer-process__step { min-width: 0; color: #747f79; }
.communication-step { display: flex; align-items: center; gap: 6px; margin: 0 2px 6px; color: #344c3e; font-size: 12px; line-height: 24px; }
.communication-step > i { flex: none; width: 5px; height: 5px; background: currentColor; border-radius: 50%; opacity: .55; }
.communication-step__label { display: grid; min-width: 0; }
.communication-step__label > span { grid-area: 1 / 1; }
.communication-step__measure { visibility: hidden; pointer-events: none; user-select: none; }
.communication-step__text { color: #9ca59f; }
.communication-step__pulse { color: #344c3e; opacity: 1; transition: opacity .3s ease; pointer-events: none; user-select: none; }
.communication-step__pulse > span { animation: communication-step-breathe 2.8s ease-in-out infinite; }
.communication-step--settled .communication-step__pulse { opacity: 0; }
.communication-step--settled .communication-step__pulse > span { animation-play-state: paused; }
.communication-progress-icon { display: block; flex: 0 0 16px; width: 16px; height: 16px; object-fit: contain; transition: opacity .3s ease, filter .3s ease; }
.communication-step--settled .communication-progress-icon { opacity: .55; filter: grayscale(1); }
.communication-step--thinking .communication-step__measure { visibility: hidden; pointer-events: none; user-select: none; }
.communication-step__text { color: #95a098; }
.communication-step--thinking .communication-step__pulse { color: #405b4a; }
.communication-step--thinking .communication-step__pulse > span { animation-name: thinking-highlight; }
@keyframes thinking-highlight { 0%, 25%, 100% { opacity: 0; } 48%, 58% { opacity: 1; } }
.answer-process.is-paused .communication-step__pulse > span { animation-play-state: paused; }
@keyframes communication-step-breathe { 0%,100% { opacity: .2; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .communication-progress-icon, .communication-step__pulse, .communication-process-region, .communication-process-toggle svg, .turn-timing-enter-active, .turn-timing-leave-active { transition: none; } .communication-step__pulse > span { animation: none; } }
</style>
