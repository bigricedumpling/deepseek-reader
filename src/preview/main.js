import { initAccent } from '../composables/useAccent'
import { createApp } from 'vue'
initAccent()
import '@fontsource/noto-sans-sc/chinese-simplified-400.css'
import '@fontsource/noto-sans-sc/chinese-simplified-600.css'
import '../style.css'
import '../styles/shapes.css'
import '../styles/surfaces.css'
import '@fontsource/noto-sans-sc/latin-400.css'
import Preview from './Preview.vue'
createApp(Preview).mount('#app')
