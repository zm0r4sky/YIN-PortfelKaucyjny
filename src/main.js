import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import pinia from './store'

const app = createApp(App)

app.use(pinia)
app.use(router)

app.mount('#app')

// Blokada orientacji pionowej (portrait) na urządzeniach mobilnych
const lockOrientation = () => {
  if (screen?.orientation?.lock) {
    screen.orientation.lock('portrait').catch(() => {});
  }
};
window.addEventListener('load', lockOrientation);
document.addEventListener('touchstart', lockOrientation, { once: true });
document.addEventListener('click', lockOrientation, { once: true });
