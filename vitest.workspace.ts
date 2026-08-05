import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/contracts',
  'packages/engine',
  'packages/persistence',
  'apps/taosim-ui',
]);
