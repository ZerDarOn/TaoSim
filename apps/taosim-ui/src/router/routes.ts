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
  {
    path: '/faction',
    name: 'faction',
    component: () => import('../pages/FactionPage.vue'),
    meta: { title: '宗门' },
  },
  {
    path: '/inventory',
    name: 'inventory',
    component: () => import('../pages/InventoryPage.vue'),
    meta: { title: '背包' },
  },
  {
    path: '/overworld',
    name: 'overworld',
    component: () => import('../pages/OverworldPage.vue'),
    meta: { title: '大世界' },
  },
  {
    path: '/npc-interaction',
    name: 'npc-interaction',
    component: () => import('../pages/NPCInteractionPage.vue'),
    meta: { title: '偶遇' },
  },
  {
    path: '/npc-trade',
    name: 'npc-trade',
    component: () => import('../pages/NPCTradePage.vue'),
    meta: { title: '交易' },
  },
  {
    path: '/market',
    name: 'market',
    component: () => import('../pages/MarketPage.vue'),
    meta: { title: '坊市' },
  },
  {
    path: '/upgrade',
    name: 'upgrade',
    component: () => import('../pages/UpgradePage.vue'),
    meta: { title: '装备升品' },
  },
  {
    path: '/game-over',
    name: 'game-over',
    component: () => import('../pages/GameOverPage.vue'),
    meta: { title: '道消身殒' },
  },
];
