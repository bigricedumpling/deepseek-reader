# Landing page handoff

## Current state

The landing page is a static, minimal product page. It does not depend on the app at runtime.

- `npm run dev:site` → `http://127.0.0.1:8092`
- `npm run dev:demo` → real Typocket instance at `http://127.0.0.1:8093` (used only by the “打开实际界面” link)
- `npm run build:site` → static output in `site/dist` (ignored)

Page structure:

1. Minimal header: wordmark, GitHub, download.
2. Hero: large statement, two CTAs, real Typocket window screenshot.
3. “读。收。看。”: three real screenshots.
4. “文件始终在本机。”: install copy + GitHub.
5. Minimal footer.

## Files

- `site/src/App.vue` — page composition.
- `site/src/components/SiteHeader.vue`
- `site/src/components/HeroSection.vue`
- `site/src/components/TriptychSection.vue`
- `site/src/components/ClosingSection.vue`
- `site/src/components/SiteFooter.vue`
- `site/src/styles/site.css`
- `site/src/assets/shots/` — screenshots captured from the real app.
- `site/demo-kb/` — fixture copied by `scripts/dev-demo.mjs` to a temp directory.
- `scripts/dev-demo.mjs` — starts the clean demo instance on 8093.

## Intentional choices

- No redrawn product UI. All product images are screenshots from a running instance.
- No recordings, iframes, external images, or fake demo components.
- No shwn-style floating bubbles, gooey nav, portfolio carousel, live clock, or tiny labels.
- The page is intentionally sparse: large type, large screenshots, few words.

## Known limitations / next steps

- “打开实际界面” points at `127.0.0.1:8093`. For a public deployment, replace it with a hosted demo URL or the release page.
- `site/dist` is ignored. Build with `npm run build:site` before deploying.
- Add OG image, favicon refinements, and an English version if needed.
- The mobile triptych is a stacked image list; if it feels long, switch it to horizontal snap.
- Screenshots are 2x PNGs; optimize to WebP/AVIF before a production deploy if bundle size matters.

## Verification

- `npm run build:site`
- `npm run check`
- `npm run typecheck`
- Playwright smoke test: desktop/mobile no horizontal overflow, no console errors.
