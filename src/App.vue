<script setup>
import { computed, ref, watch } from 'vue'
import { locale } from './i18n/index.js'
import WorkspaceLayout from './layouts/WorkspaceLayout.vue'
import MolecularFieldBackground from './components/MolecularFieldBackground.vue'
import ManagementPlatforms from './components/ManagementPlatforms.vue'
import AssistantWorkspace from './components/AssistantWorkspace.vue'
import AuthenticationStatus from './components/AuthenticationStatus.vue'
import { useAuthentication } from './composables/useAuthentication.js'

const { state, user, error, retry } = useAuthentication()
const workspaceReady = ref(false)
const workspaceVisible = computed(() => state.value === 'ready' && workspaceReady.value)
watch([state, () => user.value?.userid], () => { workspaceReady.value = false }, { flush: 'sync' })
function revealWorkspace(userid) {
  if (state.value === 'ready' && userid === user.value?.userid) workspaceReady.value = true
}
watch(locale, value => { if (typeof document === 'undefined' || !document.documentElement) return; document.documentElement.lang = value === 'en' ? 'en' : 'zh-CN'; document.title = value === 'en' ? 'Knowledge Hub · Your knowledge workspace' : '知识沉淀 · 企业知识统一入口' }, { immediate: true })
</script>

<template>
  <div class="knowledge-page">
    <MolecularFieldBackground />
    <Transition name="authentication-view" mode="out-in" @before-leave="element => { element.inert = true }">
      <AuthenticationStatus v-if="!workspaceVisible" :loading="state !== 'error'" :message="error" @retry="retry" />
    </Transition>
    <!-- 缓存只属于当前用户；更换身份时淘汰旧工作台，避免复用其他用户的数据。 -->
    <Transition name="authentication-workspace" @before-leave="element => { element.inert = true }">
      <KeepAlive :max="1">
        <WorkspaceLayout v-if="user && state === 'ready'" :key="user.userid" :user="user" :class="{ 'is-preparing': !workspaceVisible }" :inert="!workspaceVisible" :aria-hidden="!workspaceVisible" @ready="revealWorkspace">
          <template #assistant="{ active, rendered }">
            <KeepAlive><AssistantWorkspace :user="user" v-if="rendered" :active="active && state === 'ready'" @authentication-expired="retry" /></KeepAlive>
          </template>
          <template #platforms="{ active, rendered }">
            <KeepAlive><ManagementPlatforms v-if="rendered" :active="active && state === 'ready'" :user="user" @authentication-expired="retry" /></KeepAlive>
          </template>
        </WorkspaceLayout>
      </KeepAlive>
    </Transition>
  </div>
</template>
