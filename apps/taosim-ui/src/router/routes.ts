import type { RouteRecordRaw } from 'vue-router';

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'root',
    component: () => import('@/AppRoot.vue'),
    meta: { title: '大千修仙界' },
  },
];
