import { initAccent } from '../composables/useAccent'
import { initUiFont } from '../composables/useUiFont'
import { createApp } from 'vue'
initAccent()
initUiFont()
import '@fontsource/noto-serif-sc/chinese-simplified-400.css'
import '@fontsource/noto-serif-sc/chinese-simplified-600.css'
import '@fontsource/noto-serif-sc/latin-400.css'
import '@fontsource/noto-sans-sc/chinese-simplified-400.css'
import '@fontsource/noto-sans-sc/chinese-simplified-600.css'
import '@fontsource/noto-sans-sc/latin-400.css'
import '../styles/tokens.css'
import '../styles/shapes.css'
import '../styles/surfaces.css'
import KbHome from './KbHome.vue'

createApp(KbHome).mount('#kb')
