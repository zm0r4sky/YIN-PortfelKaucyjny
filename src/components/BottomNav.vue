<template>
  <nav class="bottom-nav">
    <router-link to="/" class="nav-item">
      <span class="nav-icon">👛</span>
      <span class="nav-text">Portfel</span>
      <span v-if="activeCount > 0" class="nav-badge">{{ activeCount }}</span>
    </router-link>
    <router-link to="/scan" class="nav-item">
      <span class="nav-icon">📷</span>
      <span class="nav-text">Skaner</span>
    </router-link>
  </nav>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { db } from '../services/db';

const activeCount = ref(0);

const updateCount = async () => {
  try {
    activeCount.value = await db.receipts.where('status').equals('active').count();
  } catch (e) {}
};

onMounted(() => {
  updateCount();
  // Okresowe odświeżanie licznika
  setInterval(updateCount, 2000);
});
</script>

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #ffffff;
  display: flex;
  justify-content: space-around;
  padding: 8px 0;
  box-shadow: 0 -4px 20px rgba(0,0,0,0.08);
  z-index: 1000;
  border-top: 1px solid #edf2f7;
}

.nav-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-decoration: none;
  color: #718096;
  font-weight: 700;
  font-size: 0.8rem;
  padding: 4px 20px;
  border-radius: 12px;
  transition: all 0.15s;
}

.nav-icon {
  font-size: 1.4rem;
  margin-bottom: 2px;
}

.router-link-active {
  color: #10b981;
}

.router-link-active .nav-icon {
  transform: scale(1.1);
}

.nav-badge {
  position: absolute;
  top: 2px;
  right: 18px;
  background: #10b981;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: 10px;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.4);
}
</style>
