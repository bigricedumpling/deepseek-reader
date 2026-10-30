<script setup>
import SiteHeader from './components/SiteHeader.vue'
import HeroSection from './components/HeroSection.vue'
import TriptychSection from './components/TriptychSection.vue'
import ClosingSection from './components/ClosingSection.vue'
import SiteFooter from './components/SiteFooter.vue'
import { useReveal } from './composables/useReveal'

useReveal()
</script>

<template>
  <SiteHeader />
  <main>
    <HeroSection />
    <TriptychSection />
    <ClosingSection />
  </main>
  <SiteFooter />
</template>
