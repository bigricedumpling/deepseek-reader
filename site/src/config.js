const localDemoUrl =
  'http://127.0.0.1:8093/doc/%E7%A0%94%E7%A9%B6/%E4%B8%80%E6%AC%A1%E8%B0%83%E7%A0%94%E7%95%99%E4%B8%8B%E7%9A%84%EF%BC%8C%E4%B8%8D%E5%8F%AA%E6%98%AF%E7%BB%93%E8%AE%BA?lib=%E7%A0%94%E7%A9%B6'

// The public demo is deployment-specific. Local dev falls back to `npm run dev:demo`;
// production builds hide the demo CTA unless VITE_DEMO_URL is provided.
export const demoUrl = (
  import.meta.env.VITE_DEMO_URL || (import.meta.env.DEV ? localDemoUrl : '')
).trim()
