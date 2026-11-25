<template>
  <div class="destination-list" role="group" aria-label="选择知识库">
    <button v-for="lib in libraries" :key="lib.name" type="button" :disabled="disabled"
      :aria-pressed="modelValue === lib.name" @click="$emit('update:modelValue', lib.name)">
      <ContentIcon v-if="lib.icon" :value="lib.icon" :size="17" />
      <PhFolderSimple v-else :size="17" class="destination-symbol" aria-hidden="true" />
      <span class="destination-name">{{ lib.name }}</span>
      <small>{{ lib.docs ?? 0 }} 篇</small>
      <PhCheck v-if="modelValue === lib.name" class="destination-check" :size="15" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup>
import ContentIcon from './ContentIcon.vue'
import { PhCheck, PhFolderSimple } from '../icons/remix'

defineProps({ modelValue: String, libraries: { type: Array, required: true }, disabled: Boolean })
defineEmits(['update:modelValue'])
</script>

<style scoped>
.destination-list { display:grid; align-content:start; gap:2px; min-height:0; overflow:auto; overscroll-behavior:contain; max-height:min(270px,35dvh); }
.destination-list button { display:grid; grid-template-columns:18px minmax(0,1fr) auto 15px; align-items:center; gap:10px; min-height:44px; padding:7px 10px; border-radius:var(--radius-row); color:var(--c-text); text-align:start; }
.destination-list button:hover { background:var(--c-hover); }
.destination-list button[aria-pressed=true] { background:var(--c-active); color:var(--c-ink); }
.destination-list button:focus-visible { outline:2px solid var(--c-focus); outline-offset:-2px; }
.destination-name { overflow-wrap:anywhere; font-size:13px; line-height:1.45; }
.destination-list small { color:var(--c-sub); font-size:11px; white-space:nowrap; font-variant-numeric:tabular-nums; }
.destination-symbol { color:var(--c-sub); }
.destination-check { color:var(--c-accent); }
</style>
