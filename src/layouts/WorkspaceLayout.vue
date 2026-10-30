<script setup>
import { t, uiText, localizedRef } from '../i18n/index.js'
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, provide, ref, watch } from 'vue'
const logoUrl = new URL('../assets/logo.webp', import.meta.url).href
import UserAvatar from '../components/UserAvatar.vue'
import BrandTitle from '../components/BrandTitle.vue'
import LanguageSwitch from '../components/LanguageSwitch.vue'
import { waitForWorkspaceReady } from '../services/workspaceReady.js'
import { useMobileLayout } from '../composables/useMobileLayout.js'
import { installEdgeListGesture, setMobileBackGesturesEnabled, closeMobileWorkspace } from '../services/mobileNavigation.js'
const treeIconUrl = new URL('../assets/tree.webp', import.meta.url).href

const props = defineProps({ user: { type: Object, default: null } })
const emit = defineEmits(['ready'])
const rootRef = ref(null)
let preparation
async function prepareWorkspace() {
  if (preparation) return
  const controller = new AbortController()
  preparation = controller
  await nextTick()
  const ready = await waitForWorkspaceReady(rootRef.value, { signal: controller.signal })
  if (controller.signal.aborted) return
  if (ready) emit('ready', props.user?.userid)
  else window.dispatchEvent(new CustomEvent('knowledge-app-error', { detail: '工作台布局尺寸为零，请展开加载信息检查客户端兼容性' }))
}
function cancelPreparation() { preparation?.abort(); preparation = null }
onMounted(prepareWorkspace)
onActivated(prepareWorkspace)
onDeactivated(cancelPreparation)
onBeforeUnmount(cancelPreparation)
const { mobile, viewportHeight, viewportTop } = useMobileLayout()
const drawerSide = ref('')
const searching = ref(false), selecting = ref(false)
const listHost = ref(null), listRegion = ref(null), treeHost = ref(null)
const accountHost = ref(null), languageHost = ref(null), settingsHost = ref(null)
const settingsMounted = ref(false)
const settingsOpen = ref(false), settingsTrigger = ref(null), settingsDialog = ref(null)
const logoTrigger = ref(null), exiting = ref(false), exitError = localizedRef('')
let removeEdgeGesture, navigationActive = false, nativeRevision = 0
let nativeQueue = Promise.resolve()
function queueNativeGestureState(enabled) {
  const revision = ++nativeRevision
  nativeQueue = nativeQueue.catch(() => {}).then(() => {
    if (revision === nativeRevision) return setMobileBackGesturesEnabled(enabled)
  })
}
function pauseMobileNavigation() {
  removeEdgeGesture?.(); removeEdgeGesture = null
  if (navigationActive) queueNativeGestureState(true)
  navigationActive = false
}
function resumeMobileNavigation() {
  if (!mobile.value || !rootRef.value) { pauseMobileNavigation(); return }
  if (navigationActive) return
  navigationActive = true
  queueNativeGestureState(false)
  removeEdgeGesture = installEdgeListGesture(rootRef.value, {
    enabled: () => navigationActive && mobile.value && drawerSide.value !== 'right' && !searching.value,
    isListOpen: () => drawerSide.value === 'left',
    close: closeDrawer,
    open: () => openDrawer('left', { currentTarget: logoTrigger.value }),
  })
}
watch(mobile, () => { exitError.value = ''; resumeMobileNavigation() })
onMounted(resumeMobileNavigation)
onActivated(resumeMobileNavigation)
onDeactivated(pauseMobileNavigation)
onBeforeUnmount(pauseMobileNavigation)
async function exitWorkspace() {
  if (exiting.value) return
  exiting.value = true; exitError.value = ''
  try {
    if (!await closeMobileWorkspace()) exitError.value = uiText('无法自动关闭页面，请使用客户端或浏览器的关闭按钮')
  } catch { exitError.value = uiText('无法自动关闭页面，请使用客户端或浏览器的关闭按钮') }
  finally { exiting.value = false }
}

let settingsAnimation, settingsRevision = 0
function closeSettings() { settingsOpen.value = false }
watch(settingsOpen, async opened => {
  const revision = ++settingsRevision
  if (opened) settingsMounted.value = true
  await nextTick()
  if (revision !== settingsRevision) return
  const dialog = settingsDialog.value
  const wasOpen = dialog?.open
  const panel = dialog?.querySelector('.workspace__mobile-settings')
  // 首帧先停在屏幕外，再打开模态层，避免原生自动聚焦让面板闪现或滚动。
  if (opened && dialog?.isConnected && !wasOpen) {
    if (panel) { panel.style.transform = 'translateY(100%)'; panel.style.visibility = 'hidden' }
    dialog.showModal()
    dialog.scrollTop = 0
    dialog.focus({ preventScroll: true })
    if (panel) panel.style.visibility = ''
  }
  // 关闭动画结束前保留模态层，快速反向操作从当前位移继续。
  const start = wasOpen && panel ? getComputedStyle(panel).transform : 'translateY(100%)'
  settingsAnimation?.cancel(); settingsAnimation = null
  if (dialog?.open && panel?.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && mobile.value && drawerSide.value === 'left') {
    const animation = panel.animate([{ transform: start }, { transform: opened ? 'translateY(0)' : 'translateY(100%)' }], {
      duration: opened ? 320 : 240, easing: opened ? 'cubic-bezier(.22, 1, .36, 1)' : 'cubic-bezier(.4, 0, 1, 1)', fill: 'both',
    })
    settingsAnimation = animation
    try { await animation.finished } catch { return }
    if (revision !== settingsRevision) return
  }
  if (panel) panel.style.transform = opened ? 'translateY(0)' : 'translateY(100%)'
  if (!opened) {
    if (dialog?.open) dialog.close()
    if (settingsTrigger.value?.isConnected && !settingsTrigger.value.closest('[inert]')) settingsTrigger.value.focus({ preventScroll: true })
  } else dialog?.querySelector('[data-settings-close]')?.focus({ preventScroll: true })
  settingsAnimation?.cancel(); settingsAnimation = null
})
onBeforeUnmount(() => { ++settingsRevision; settingsAnimation?.cancel(); if (settingsDialog.value?.open) settingsDialog.value.close() })

let drawerTrigger
function closeDrawer() { settingsOpen.value = false; searching.value = false; selecting.value = false; drawerSide.value = '' }
function openDrawer(side, event) {
  if (!mobile.value || !['left', 'right'].includes(side)) return
  drawerTrigger = event?.currentTarget || document.activeElement
  if (['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName)) document.activeElement.blur()
  drawerSide.value = drawerSide.value === side ? '' : side
}
provide('mobile-workspace-drawers', { side: drawerSide, searching, selecting, listHost, treeHost, settingsHost, open: openDrawer, close: closeDrawer })
watch(drawerSide, async side => {
  searching.value = false
  await nextTick()
  if (side !== drawerSide.value) return
  if (side) {
    const host = side === 'left' ? listRegion.value : treeHost.value
    const target = host?.querySelector('[data-drawer-initial-focus]') || host?.querySelector('[data-drawer-close]')
    target?.focus({ preventScroll: true })
  }
  else if (drawerTrigger?.isConnected) drawerTrigger.focus({ preventScroll: true })
})
function handleDrawerKey(event) {
  if (!drawerSide.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    if (settingsOpen.value) { settingsOpen.value = false; settingsTrigger.value?.focus({ preventScroll: true }) }
    else closeDrawer()
    return
  }
  if (event.key !== 'Tab') return
  const host = drawerSide.value === 'left' ? listRegion.value : treeHost.value
  const controls = [...(host?.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]') || [])].filter(element => element.getClientRects().length && !element.closest('[inert]'))
  const first = controls[0], last = controls[controls.length - 1]
  if (!first) { event.preventDefault(); return }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
watch(mobile, closeDrawer)
onDeactivated(closeDrawer)
onBeforeUnmount(closeDrawer)

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
  <section ref="rootRef" class="workspace" :class="{ 'is-short-viewport': mobile && viewportHeight > 0 && viewportHeight < 560, 'has-left-drawer': drawerSide === 'left', 'is-searching-conversations': drawerSide === 'left' && searching, 'is-selecting-trees': drawerSide === 'left' && selecting, 'has-right-drawer': drawerSide === 'right' }" @keydown="handleDrawerKey" :style="mobile && viewportHeight ? { '--mobile-viewport-height': `${viewportHeight}px`, '--mobile-viewport-top': `${viewportTop}px` } : undefined" aria-labelledby="workspace-title" data-molecular-field-block>
    <div ref="listRegion" class="workspace__drawer-host workspace__drawer-host--left" :inert="drawerSide !== 'left'" :aria-hidden="drawerSide !== 'left'" :role="mobile ? 'dialog' : undefined" :aria-modal="drawerSide === 'left' ? true : undefined" :aria-label="t('问答树列表')">
      <div ref="listHost" class="workspace__drawer-content"></div>
      <Teleport to="body">
        <dialog v-if="mobile && settingsMounted" ref="settingsDialog" class="workspace__settings-dialog" :class="{ 'is-closing': !settingsOpen }" aria-labelledby="mobile-settings-title" autofocus @cancel.prevent="closeSettings" @close="closeSettings" @click.self="closeSettings">
          <section class="workspace__mobile-settings">
            <div class="workspace__settings-content">
            <header><strong id="mobile-settings-title">{{ t('设置') }}</strong><button type="button" data-settings-close :aria-label="t('关闭设置')" @click="closeSettings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></header>
            <div class="workspace__setting-row"><span>{{ t('语言') }}</span><div ref="languageHost"></div></div>
            <div ref="settingsHost"></div>
            </div>
          </section>
        </dialog>
      </Teleport>
      <footer v-if="mobile" :inert="searching || selecting" :aria-hidden="searching || selecting" class="workspace__drawer-account" :aria-label="t('用户')">
        <div ref="accountHost" class="workspace__drawer-identity"></div>
        <button ref="settingsTrigger" type="button" class="workspace__settings-trigger" :aria-label="t('设置')" :aria-expanded="settingsOpen" @click="settingsOpen = !settingsOpen"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg></button>
      </footer>
    </div>
    <div ref="treeHost" class="workspace__drawer-host workspace__drawer-host--right" :inert="drawerSide !== 'right'" :aria-hidden="drawerSide !== 'right'"></div>
    <div class="workspace__center">
    <div class="workspace__center-content" :inert="Boolean(drawerSide)">
    <header class="workspace__header">
      <div class="workspace__brand">
        <button v-if="mobile" ref="logoTrigger" type="button" class="workspace__logo-wrap" :aria-label="t('打开问答列表')" :aria-expanded="drawerSide === 'left'" aria-controls="mobile-question-list" @click="openDrawer('left', $event)"><img :src="logoUrl" alt="" draggable="false" /></button>
        <span v-else class="workspace__logo-wrap">
          <img :src="logoUrl" alt="" draggable="false" />
        </span>
        <h1 id="workspace-title"><BrandTitle /></h1>
      </div>

      <nav v-if="!mobile" class="workspace__nav" :style="{ '--navigation-index': activeIndex }" :aria-label="t('知更导航')">
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
        <div v-if="mobile" class="workspace__action-capsule">
          <button type="button" class="workspace__exit" :disabled="exiting" :aria-label="t('退出应用')" :title="t('退出应用')" @click="exitWorkspace"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v9M6.3 5.8a8 8 0 1 0 11.4 0" /></svg></button>
          <span class="workspace__action-divider" aria-hidden="true"></span>
          <button type="button" class="workspace__tree-trigger" :aria-label="t('查看问答树')" aria-haspopup="dialog" aria-controls="mobile-question-tree" :aria-expanded="drawerSide === 'right'" @click="openDrawer('right', $event)"><img :src="treeIconUrl" alt="" width="28" height="28" draggable="false" /></button>
        </div>
        <span v-show="!mobile"><Teleport :to="languageHost || 'body'" :disabled="!mobile || !languageHost"><LanguageSwitch /></Teleport></span>
        <Teleport :to="accountHost || 'body'" :disabled="!mobile || !accountHost">
          <div class="workspace__account">
            <span class="workspace__caption">{{ user?.name || user?.userid || t('企业知识统一入口') }}</span>
            <UserAvatar :user="user" />
          </div>
        </Teleport>
      </div>
    </header>
    <p v-if="exitError" class="workspace__exit-message" role="alert">{{ exitError }}</p>

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
    </div>
    <button v-if="drawerSide" type="button" class="workspace__drawer-dismiss" tabindex="-1" :aria-label="t('返回问答')" @click="closeDrawer"></button>
    </div>
  </section>
</template>
