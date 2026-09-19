<script setup>
import BottomNav from './components/BottomNav.vue'
const buildTime = __APP_BUILD_TIME__;
</script>

<template>
  <div class="dev-topbar">
    <span>BUILD: {{ buildTime }}</span>
  </div>
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
.dev-topbar {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  background: rgba(0, 0, 0, 0.7);
  color: #00ff00;
  font-family: monospace;
  font-size: 0.65rem;
  text-align: center;
  padding: 4px 0;
  z-index: 9999;
  pointer-events: none;
}
.app-container {
  padding-top: 25px; /* miejsce na topbar */
  padding-bottom: 70px;
}
</style>
