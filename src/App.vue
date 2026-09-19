<script setup>
import BottomNav from './components/BottomNav.vue'
</script>

<template>
  <main class="app-container">
    <router-view />
  </main>
  <BottomNav />
</template>

<style>
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background-color: #f0f2f5;
  color: #333;
}
.app-container {
  padding-bottom: 70px;
}
</style>
