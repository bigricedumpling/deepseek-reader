<template>
  <Teleport to="body">
    <div class="reader-modal-shade" @mousedown.self="emit('close')">
      <section ref="dialog" class="reader-dialog product-settings" role="dialog" aria-modal="true" aria-label="设置" tabindex="-1">
        <header><h2>设置</h2><button class="btn-icon" aria-label="关闭设置" @click="emit('close')"><PhX :size="18" /></button></header>
        <fieldset>
          <legend>主题色</legend>
          <div class="accent-presets">
            <label v-for="preset in ACCENT_PRESETS" :key="preset.id" class="accent-choice" :class="{ selected: accent === preset.id }">
              <input type="radio" name="accent" :value="preset.id" :checked="accent === preset.id" @change="setAccent(preset.id)" />
              <span class="accent-swatch" :style="{ '--swatch': preset.light }"><PhCheck v-if="accent === preset.id" :size="17" weight="bold" /></span>
              <span>{{ preset.label }}</span>
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>界面字体</legend>
          <div class="font-presets" role="group" aria-label="界面字体">
            <button
              v-for="option in UI_FONT_OPTIONS"
              :key="option.id"
              type="button"
              class="font-choice"
              :class="{ selected: uiFont === option.id }"
              :aria-pressed="uiFont === option.id"
              @click="setUiFont(option.id)"
            >{{ option.label }}</button>
          </div>
          <a class="font-license" :href="fontLicenseUrl" target="_blank" rel="noopener noreferrer">鸿蒙黑体 © Huawei Device Co., Ltd. 查看字体许可</a>
        </fieldset>
        <footer class="product-name">{{ BRAND_NAME }}</footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { BRAND_NAME } from '../../brand.mjs'
import { ref } from 'vue'
import { PhX, PhCheck } from '@phosphor-icons/vue'
import { ACCENT_PRESETS, useAccent } from '../composables/useAccent'
import { UI_FONT_OPTIONS, useUiFont } from '../composables/useUiFont'
import { useDialogFocus } from '../composables/useDialogFocus'
const emit = defineEmits(['close'])
const dialog = ref(null)
const { accent, setAccent } = useAccent()
const { uiFont, setUiFont } = useUiFont()
const fontLicenseUrl = `${import.meta.env.BASE_URL}fonts/HarmonyOS-Sans-LICENSE.txt`
useDialogFocus(() => true, dialog, () => emit('close'))
</script>

<style scoped>
.product-settings{width:min(380px,calc(100vw - 32px));padding:24px}
h2{margin:0;font-size:16px;font-weight:600}
fieldset{border:0;padding:0;margin:22px 0 0;min-width:0}
legend{font-size:12px;color:var(--c-sub);padding:0;margin-bottom:12px}
.accent-presets{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.reader-dialog .accent-choice{position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;margin:0;padding:10px 3px;border-radius:10px;cursor:pointer;font-size:12px;color:var(--c-sub)}
.accent-choice:hover{background:var(--c-hover)}
.reader-dialog .accent-choice.selected{background:var(--c-field);color:var(--c-ink)}
.accent-choice input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;margin:0}
.accent-choice:has(input:focus-visible){outline:2px solid var(--c-focus);outline-offset:2px}
.accent-swatch{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--swatch);color:#fff}
.font-presets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.font-choice{min-height:34px;padding:6px 4px;border-radius:9px;background:var(--c-field);color:var(--c-sub);font-size:12px;white-space:nowrap}
.font-choice:hover{background:var(--c-chip-hover);color:var(--c-ink)}
.font-choice.selected{background:var(--c-active);color:var(--c-accent);font-weight:600}
.font-license{display:block;margin-top:10px;color:var(--c-faint);font-size:11px;line-height:1.5}
.font-license:hover{color:var(--c-sub)}
.product-settings .product-name{margin:24px 0 0;font-size:12px;color:var(--c-faint)}
</style>
