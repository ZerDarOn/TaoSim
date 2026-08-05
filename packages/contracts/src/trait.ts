// ============================================================
// Trait 词条模型 — 架构规范 §30
// ============================================================

import type { AttributeMap } from './item.js';

export type TraitQuality = 'Red' | 'Orange' | 'Purple' | 'Blue' | 'Green';

export interface Trait {
  id: string;
  name: string;
  quality: TraitQuality;
  description: string;
  effects: AttributeMap;
}
