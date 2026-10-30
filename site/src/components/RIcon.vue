<script setup>
import { computed } from 'vue'
import { remixIcons } from '@app/icons/remix-data'

const props = defineProps({
  name: { type: String, default: 'arrow-right' },
  size: { type: [Number, String], default: 16 }
})
const body = computed(() => remixIcons[props.name]?.line || '')
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" v-html="body" />
</template>
