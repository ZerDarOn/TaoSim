// ============================================================
// 技能射程解析：从 Geometry 原子提取 range（默认 1）
// 普攻无 Geometry 原子 → 1；多原子取最大 range（覆盖 AOE/Line 组合）
// ============================================================

import type { Skill } from '@taosim/contracts';

export function skillRange(skill: Skill): number {
  let range = 1;
  for (const p of skill.primitives) {
    if (p.category === 'Geometry' && typeof p.params.range === 'number') {
      range = Math.max(range, p.params.range);
    }
  }
  return range;
}
