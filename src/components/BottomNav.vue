<template>
  <nav class="bottom-nav">
    <router-link to="/" class="nav-item">Portfel</router-link>
    <router-link to="/scan" class="nav-item">Skaner</router-link>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #ffffff;
  display: flex;
  justify-content: space-around;
  padding: 1rem;
  box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
  z-index: 1000;
}
.nav-item {
  text-decoration: none;
  color: #666;
  font-weight: 600;
  font-size: 1.1rem;
}
.router-link-active {
  color: #4fc08d;
}
</style>
