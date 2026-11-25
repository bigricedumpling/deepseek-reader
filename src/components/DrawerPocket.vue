<template>
  <span class="pocket" aria-hidden="true">
    <svg class="pocket-well" viewBox="0 0 240 220" preserveAspectRatio="none" focusable="false">
      <path d="M0 17Q0 3 14 3H58C71 3 74 16 88 16H225Q240 16 240 31V206Q240 220 226 220H14Q0 220 0 206Z" />
    </svg>
    <span v-if="count > 2" class="pocket-leaf leaf-back"></span>
    <span v-if="count > 1" class="pocket-leaf leaf-middle"></span>
    <span v-if="preview" class="pocket-leaf leaf-first">
      <span v-if="preview.kind !== 'markdown'" class="paper-format">{{ preview.kind.toUpperCase() }}</span>
      <strong class="drawer-card-preview paper-title">{{ preview.title }}</strong>
      <span v-for="(block, i) in preview.blocks" :key="i" class="paper-block" :data-type="block.type">
        <img v-if="block.type === 'image'" :src="assetUrl(block.url)" alt="" loading="lazy" decoding="async" @error="$event.currentTarget.hidden = true" />
        <span v-else-if="block.type === 'table'" class="paper-table">
          <span v-for="(row, r) in block.rows" :key="r" class="paper-row">
            <span v-for="(cell, c) in row" :key="c" class="paper-cell">{{ cell }}</span>
          </span>
        </span>
        <template v-else>{{ block.text }}</template>
      </span>
    </span>
    <span class="pocket-lip"></span>
  </span>
</template>

<script setup>
import { assetUrl } from '../utils/api'

defineProps({
  preview: { type: Object, default: null },
  count: { type: Number, required: true }
})
</script>

<style scoped>
.pocket {
  --liner: color-mix(in srgb, var(--c-surface) 89%, var(--c-text));
  --stock: color-mix(in srgb, var(--c-surface) 98%, var(--c-ink));
  --edge: color-mix(in srgb, var(--c-ink) 12%, transparent);
  --lip: color-mix(in srgb, var(--c-surface) 96%, var(--c-ink));
  --lip-edge: color-mix(in srgb, var(--c-ink) 14%, var(--c-surface));
  display: block;
  position: relative;
  width: 100%;
  aspect-ratio: .89;
  isolation: isolate;
  container-type: inline-size;
  pointer-events: none;
}
:global(body[data-theme="dark"] .pocket) {
  --liner: color-mix(in srgb, var(--c-surface) 92%, var(--c-text));
  --stock: color-mix(in srgb, var(--c-pop) 95%, var(--c-text));
  --lip: color-mix(in srgb, var(--c-pop) 97%, var(--c-ink));
}
.pocket-well { position:absolute; inset:0; width:100%; height:100%; fill:var(--liner); }
@media (max-width:560px) { .pocket { aspect-ratio:.98; } }
.pocket-leaf {
  display: block;
  position: absolute;
  inset: 16% 8% 6%;
  border: 1px solid color-mix(in srgb, var(--c-ink) 11%, transparent);
  border-radius: var(--radius-item);
  corner-shape: var(--corner-ui);
  background: var(--stock);
  box-shadow: 0 1px 5px color-mix(in srgb, var(--c-ink) 8%, transparent);
  transform-origin: 50% 90%;
}
.leaf-back { transform: translate(-1%, -5%) rotate(-3deg); }
.leaf-middle { transform: translate(1%, -2.6%) rotate(2deg); }
.leaf-first {
  padding: 7% 6.5%;
  overflow: hidden;
  text-align: start;
}
.paper-format { display: block; margin-bottom: .65em; font: 600 9px/1.2 var(--font-sans); color: var(--c-sub); }
.paper-title {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  overflow-wrap: anywhere;
  color: var(--c-ink);
  font-size: clamp(13px, 7.2cqw, 24px);
  line-height: 1.25;
  font-weight: 660;
  letter-spacing: -.035em;
}
.paper-block {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  margin-top: .7em;
  overflow: hidden;
  overflow-wrap: anywhere;
  color: var(--c-text);
  font-size: clamp(7px, 3.9cqw, 12px);
  line-height: 1.6;
  font-weight: 400;
}
.paper-block[data-type="heading"] { font-weight: 650; }
.paper-block[data-type="code"] { white-space: pre-wrap; background: var(--c-field); font-family: monospace; }
.paper-block[data-type="quote"] { padding-inline-start: .6em; border-inline-start: 2px solid var(--edge); }
.paper-block[data-type="image"], .paper-block[data-type="table"] { display: block; }
.paper-block img { display: block; width: 100%; height: auto; max-height: 12em; object-fit: cover; object-position: center 25%; }
.paper-block img[hidden] { display: none; }
.paper-table { display: table; width: 100%; table-layout: fixed; border-collapse: collapse; }
.paper-row { display: table-row; }
.paper-cell { display: table-cell; padding: 0 .3em; border: 1px solid var(--edge); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.paper-row:first-child { font-weight: 600; background: var(--c-field); }
.pocket-lip {
  position: absolute;
  inset: 55% 0 0;
  border: 1px solid var(--lip-edge);
  border-radius: var(--radius-control) var(--radius-control) var(--radius-card) var(--radius-card);
  corner-shape: var(--corner-ui);
  background: var(--lip);
  box-shadow: var(--surface-rim), 0 2px 4px rgb(0 0 0 / .06);
}

/* Keep the front opaque underneath the library name, even in a two-column phone grid. */
@supports ((backdrop-filter: blur(3px)) or (-webkit-backdrop-filter: blur(3px))) {
  .leaf-first + .pocket-lip {
    --reveal-depth: clamp(0px, calc(84% - 46px), 48px);
    background: linear-gradient(to bottom,
      color-mix(in srgb, var(--lip) 36%, transparent),
      var(--lip) var(--reveal-depth));
    -webkit-backdrop-filter: blur(3px);
    backdrop-filter: blur(3px);
  }
}
@media (prefers-reduced-transparency: reduce), (forced-colors: active) {
  .leaf-first + .pocket-lip {
    background: var(--lip);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}

/* Fold only the front face. The name, count and button keep their resting geometry. */
@media (prefers-reduced-motion: no-preference) {
  .pocket {
    --open-lip: perspective(620px) translateY(1px) rotateX(-7deg) scaleY(.97);
  }
  .pocket-leaf, .pocket-lip {
    transition: transform var(--pocket-duration, 230ms) var(--motion-ease);
  }
  .pocket-lip {
    transform-origin: center bottom;
    transform: var(--lip-pose, none);
  }
  .leaf-first { transform: translateY(calc(-1 * var(--paper-rise, 0px))); }
  .leaf-middle {
    transform: translate(1%, calc(-2.6% - .52 * var(--paper-rise, 0px))) rotate(2deg);
  }
  .leaf-back {
    transform: translate(-1%, calc(-5% - .24 * var(--paper-rise, 0px))) rotate(-3deg);
  }
  :global(.drawer-card:has(:focus-visible) .drawer-card-main:enabled .pocket) {
    --paper-rise: clamp(5px, 3.3cqi, 8px);
    --lip-pose: var(--open-lip);
    --pocket-duration: var(--motion-dialog);
  }
}
@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
  :global(.drawer-card:hover .drawer-card-main:enabled .pocket) {
    --paper-rise: clamp(5px, 3.3cqi, 8px);
    --lip-pose: var(--open-lip);
    --pocket-duration: var(--motion-dialog);
  }
}
</style>
