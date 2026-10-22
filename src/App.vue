<script setup>
import WorkspaceLayout from './layouts/WorkspaceLayout.vue'
import MolecularFieldBackground from './components/MolecularFieldBackground.vue'
import ManagementPlatforms from './components/ManagementPlatforms.vue'
import AssistantWorkspace from './components/AssistantWorkspace.vue'
import AuthenticationStatus from './components/AuthenticationStatus.vue'
import { useAuthentication } from './composables/useAuthentication.js'

const { state, user, error, retry } = useAuthentication()
</script>

<template>
  <div class="knowledge-page">
    <MolecularFieldBackground />
    <Transition name="authentication-view" mode="out-in" appear @before-leave="element => { element.inert = true }">
      <AuthenticationStatus v-if="state !== 'ready'" :loading="state === 'loading'" :message="error" @retry="retry" />
    </Transition>
    <!-- 缓存只属于当前用户；更换身份时淘汰旧工作台，避免复用其他用户的数据。 -->
    <Transition name="authentication-workspace" @before-leave="element => { element.inert = true }">
      <KeepAlive :max="1">
        <WorkspaceLayout v-if="user && state === 'ready'" :key="user.userid" :user="user" :inert="state !== 'ready'" :aria-hidden="state !== 'ready'">
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
