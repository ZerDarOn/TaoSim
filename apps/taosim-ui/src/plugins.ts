import type { App } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import { routes } from './router/routes';

export function setupPlugins(app: App) {
  // Pinia 状态管理
  const pinia = createPinia();
  app.use(pinia);

  // Vue Router
  const router = createRouter({
    history: createWebHashHistory(),
    routes,
  });
  app.use(router);
}
