<script setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import logoUrl from '../assets/logo.webp'
import UserAvatar from '../components/UserAvatar.vue'

defineProps({ user: { type: Object, default: null } })

const sections = [
  { id: 'assistant', label: '智能体问答' },
  { id: 'platforms', label: '管理平台' },
]

function readSection() {
  const id = window.location.hash.slice(1)
  return sections.some(section => section.id === id) ? id : sections[0].id
}

const activeSection = ref(readSection())
const activeIndex = computed(() => sections.findIndex(section => section.id === activeSection.value))
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
  <section class="workspace" aria-labelledby="workspace-title" data-molecular-field-block>
    <header class="workspace__header">
      <div class="workspace__brand">
        <span class="workspace__logo-wrap">
          <img :src="logoUrl" alt="" draggable="false" />
        </span>
        <h1 id="workspace-title">知识沉淀</h1>
      </div>

      <nav class="workspace__nav" :style="{ '--navigation-index': activeIndex }" aria-label="知识沉淀导航">
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

      <div class="workspace__account">
        <span class="workspace__caption">{{ user?.name || user?.userid || '企业知识统一入口' }}</span>
        <UserAvatar :user="user" />
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
