import { createRouter, createWebHistory } from 'vue-router';
import WelcomeView from './views/WelcomeView.vue';
import RoomsView from './views/RoomsView.vue';
import SystemView from './views/SystemView.vue';

// The order here is the order the board rotates through (see App.vue).
// HTML5 history mode (/rooms rather than /#/rooms) - backend/server.js
// answers any non-file path with index.html so these URLs survive a
// Chromium restart.
export const routes = [
  { path: '/', name: 'welcome', component: WelcomeView, meta: { title: 'Welcome' } },
  { path: '/rooms', name: 'rooms', component: RoomsView, meta: { title: 'Meeting rooms' } },
  { path: '/system', name: 'system', component: SystemView, meta: { title: 'This kiosk' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export default createRouter({
  history: createWebHistory(),
  routes,
});
