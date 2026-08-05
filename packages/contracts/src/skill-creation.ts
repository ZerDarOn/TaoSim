// ============================================================
// SkillCreation AI 功法创作上下文 — 架构规范 §22
// ============================================================

import type { RealmType } from './character.js';
import type { Item } from './item.js';

export interface SkillCreationContext {
  creatorId: string;
  realm: RealmType;
  comprehension: number;
  usedMaterials: Item[];
  keywords: string[];
}
