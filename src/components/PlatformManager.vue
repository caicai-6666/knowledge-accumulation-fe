<script setup>
import { ref } from 'vue'
import UserAvatar from './UserAvatar.vue'
import { useManagerReveal } from '../composables/useManagerReveal.js'

defineProps({ manager: { type: Object, required: true }, index: { type: Number, default: 0 } })
const avatarReady = ref(false)
const revealed = useManagerReveal(avatarReady)
</script>

<template>
  <li class="platform-manager" :class="{ 'is-revealed': revealed }" :style="{ '--reveal-delay': `${Math.min(index, 4) * 70}ms` }" :aria-hidden="!revealed" :inert="!revealed">
    <div class="platform-manager__reveal">
      <div class="platform-manager__card">
        <UserAvatar :user="manager" compact @ready="avatarReady = $event" />
        <span>{{ manager.name }}</span>
      </div>
    </div>
  </li>
</template>

<style scoped>
.platform-manager {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transform: translateX(24px);
  transition: grid-template-rows .48s cubic-bezier(.22, 1, .36, 1), opacity .38s ease, transform .48s cubic-bezier(.22, 1, .36, 1);
}
.platform-manager.is-revealed {
  grid-template-rows: 1fr;
  opacity: 1;
  transform: translateX(0);
  transition-delay: var(--reveal-delay);
}
.platform-manager__reveal { min-height: 0; overflow: hidden; }
.platform-manager__card {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  margin: 3px 3px 10px;
  padding: 14px 18px;
  background: linear-gradient(115deg, #ffffffd6, #f1f6f2a6);
  border: 1px solid #fff;
  border-radius: 18px;
  box-shadow: inset 0 1px #fff, 0 5px 15px #344e3d06;
}
.platform-manager__card > span { color: #42594b; font-size: 14px; font-weight: 550; overflow-wrap: anywhere; }
@media (max-width: 760px) { .platform-manager__card { padding: 12px 14px; } }
@media (prefers-reduced-motion: reduce) { .platform-manager { transition: none; transform: none; } }
</style>
