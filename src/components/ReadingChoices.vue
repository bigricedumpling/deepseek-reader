<template>
  <div class="choice-row" role="radiogroup" :aria-labelledby="name">
    <span :id="name" class="choice-caption">{{ label }}</span>
    <div class="choice-options" :style="{ '--columns': columns || options.length }">
      <label v-for="option in options" :key="option.value" class="choice" :class="{ 'is-selected': model === option.value }">
        <input v-model="model" type="radio" :name="name" :value="option.value" :aria-label="option.label">
        <component v-if="option.icon" :is="option.icon" :size="14" aria-hidden="true" />
        <span :style="option.family ? { fontFamily: option.family } : undefined">{{ option.label }}</span>
      </label>
    </div>
  </div>
</template>

<script setup>
import { useId } from 'vue'

defineProps({
  label: { type: String, required: true },
  options: { type: Array, required: true },
  columns: Number
})
const model = defineModel()
const name = useId()
</script>

<style scoped>
.choice-row { display: grid; grid-template-columns: var(--setting-label) minmax(0, 1fr); gap: var(--setting-gap); align-items: baseline; }
.choice-caption { font-size: 12px; color: var(--c-sub); line-height: 1.5; }
.choice-options { display: grid; grid-template-columns: repeat(var(--columns), minmax(0, 1fr)); gap: 2px; padding: 3px; background: var(--reading-choice-track); border-radius: var(--radius-control); }
.choice { position: relative; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 5px 2px; min-height: 29px; line-height: 1.5; white-space: nowrap; font-size: 12px; border-radius: calc(var(--radius-control) - 3px); color: var(--c-sub); cursor: pointer; }
.choice input { position: absolute; inset: 0; margin: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.choice svg { flex: none; }
.choice.is-selected { background: var(--reading-choice-face); color: var(--c-ink); font-weight: 550; box-shadow: var(--reading-choice-shadow); }
.choice:has(:focus-visible) { outline: 2px solid var(--c-focus); outline-offset: -1px; }
@media (hover:hover) { .choice:hover { color: var(--c-ink); } }
@media (pointer:coarse) { .choice { min-height: 44px; } }
@media (forced-colors: active) {
  .choice.is-selected { forced-color-adjust: none; background: Highlight; color: HighlightText; box-shadow: none; }
  .choice:has(:focus-visible) { outline: 2px solid Highlight; outline-offset: -3px; }
  .choice.is-selected:has(:focus-visible) { outline-color: HighlightText; }
}
</style>
