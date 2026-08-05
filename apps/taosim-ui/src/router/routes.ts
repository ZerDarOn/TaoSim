import type { RouteRecordRaw } from 'vue-router';

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('../pages/HomePage.vue'),
    meta: { title: '大千修仙界' },
  },
  {
    path: '/create-character',
    name: 'create-character',
    component: () => import('../pages/CreateCharacterPage.vue'),
    meta: { title: '创角 — 天道降临' },
  },
  {
    path: '/battle',
    name: 'battle',
    component: () => import('../pages/BattlePage.vue'),
    meta: { title: 'Hex 战棋' },
  },
  {
    path: '/world',
    name: 'world',
    component: () => import('../pages/WorldPage.vue'),
    meta: { title: '大世界' },
  },
  {
    path: '/cultivation',
    name: 'cultivation',
    component: () => import('../pages/CultivationPage.vue'),
    meta: { title: '闭关修炼' },
  },
  {
    path: '/crafting',
    name: 'crafting',
    component: () => import('../pages/CraftingPage.vue'),
    meta: { title: '百艺' },
  },
];
