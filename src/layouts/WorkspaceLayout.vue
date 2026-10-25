<script setup>
import { t } from '../i18n/index.js'
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
const logoUrl = new URL('../assets/logo.webp', import.meta.url).href
import UserAvatar from '../components/UserAvatar.vue'
import LanguageSwitch from '../components/LanguageSwitch.vue'
import { waitForWorkspaceReady } from '../services/workspaceReady.js'
import { useMobileLayout } from '../composables/useMobileLayout.js'

const props = defineProps({ user: { type: Object, default: null } })
const emit = defineEmits(['ready'])
const rootRef = ref(null)
let preparation
async function prepareWorkspace() {
  if (preparation) return
  const controller = new AbortController()
  preparation = controller
  await nextTick()
  if (await waitForWorkspaceReady(rootRef.value, { signal: controller.signal })) emit('ready', props.user?.userid)
}
function cancelPreparation() { preparation?.abort(); preparation = null }
onMounted(prepareWorkspace)
onActivated(prepareWorkspace)
onDeactivated(cancelPreparation)
onBeforeUnmount(cancelPreparation)
const { mobile, viewportHeight, viewportTop } = useMobileLayout()

const sections = computed(() => [
  { id: 'assistant', label: t('智能体问答') },
  { id: 'platforms', label: t('管理平台') },
])

function readSection() {
  if (mobile.value) return 'assistant'
  const id = window.location.hash.slice(1)
  return sections.value.some(section => section.id === id) ? id : sections.value[0].id
}

const activeSection = ref(readSection())
const activeIndex = computed(() => sections.value.findIndex(section => section.id === activeSection.value))
const renderedSections = ref([activeSection.value])
let leaveTimer
function syncSection() { activeSection.value = readSection() }
function finishPageTransition(event) {
  if (event && (event.target !== event.currentTarget || event.propertyName !== 'transform')) return
  clearTimeout(leaveTimer)
  renderedSections.value = [activeSection.value]
}
watch(activeSection, id => {
  clearTimeout(leaveTimer)
  renderedSections.value = [...new Set([...renderedSections.value, id])]
  // 离开的页面完成原有 520ms 滑动后再移入缓存，快速往返不会销毁实例。
  leaveTimer = setTimeout(finishPageTransition, 560)
})
watch(mobile, () => { syncSection(); finishPageTransition() })
function resumeNavigation() {
  syncSection()
  window.addEventListener('hashchange', syncSection)
}
function pauseNavigation() {
  window.removeEventListener('hashchange', syncSection)
  finishPageTransition()
}
onMounted(resumeNavigation)
onActivated(resumeNavigation)
onDeactivated(pauseNavigation)
onBeforeUnmount(pauseNavigation)
</script>

<template>
  <section ref="rootRef" class="workspace" :class="{ 'is-short-viewport': mobile && viewportHeight > 0 && viewportHeight < 560 }" :style="mobile && viewportHeight ? { '--mobile-viewport-height': `${viewportHeight}px`, '--mobile-viewport-top': `${viewportTop}px` } : undefined" aria-labelledby="workspace-title" data-molecular-field-block>
    <header class="workspace__header">
      <div class="workspace__brand">
        <span class="workspace__logo-wrap">
          <img :src="logoUrl" alt="" draggable="false" />
        </span>
        <h1 id="workspace-title">{{ t('知识沉淀') }}</h1>
      </div>

      <nav v-if="!mobile" class="workspace__nav" :style="{ '--navigation-index': activeIndex }" :aria-label="t('知识沉淀导航')">
        <span class="workspace__nav-slider" aria-hidden="true"></span>
        <a
          v-for="(section, index) in sections"
          :key="section.id"
          :href="`#${section.id}`"
          :style="{ gridColumn: index + 1 }"
          class="workspace__nav-item"
          :aria-current="activeSection === section.id ? 'page' : undefined"
        >{{ section.label }}</a>
      </nav>

      <div class="workspace__tools">
        <LanguageSwitch />
        <div class="workspace__account">
          <span class="workspace__caption">{{ user?.name || user?.userid || t('企业知识统一入口') }}</span>
          <UserAvatar :user="user" />
        </div>
      </div>
    </header>

    <main class="workspace__content" :aria-label="sections[activeIndex].label">
      <div class="workspace__track" @transitionend="finishPageTransition" :style="{ transform: `translate3d(-${activeIndex * 100}%, 0, 0)` }">
        <section
          v-for="section in sections"
          :key="section.id"
          class="workspace__panel"
          :aria-label="section.label"
          :aria-hidden="activeSection !== section.id"
          :inert="activeSection !== section.id"
        >
          <slot :name="section.id" :active="activeSection === section.id" :rendered="renderedSections.includes(section.id)" />
        </section>
      </div>
    </main>
  </section>
</template>
