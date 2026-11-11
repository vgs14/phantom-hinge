import { createApp } from 'vue';
import App from './App.vue';
import router from './router.js';
import config from './config.js';
import './style.css';

// The accent colour comes from .env, so it can't be a static value in
// style.css - set it as a CSS variable everything else refers to.
document.documentElement.style.setProperty('--accent', config.accentColor);

createApp(App).use(router).mount('#app');
