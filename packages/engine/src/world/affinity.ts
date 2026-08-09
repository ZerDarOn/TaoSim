// ============================================================
// 兼容性基底（§spec 3.3.1 道缘/魔缘）：出生时生成 seed，
// 与任意 NPC 的兼容性由 seed 确定性计算（命运感，不可修改）
// ============================================================

import type { NpcRecord } from '@taosim/contracts';

function simpleHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000; // [0,1)
}

/** 兼容性 [-1,1]：正值=道缘（天生同道），负值=魔缘（天生相克）；对称且确定 */
export function affinity(a: NpcRecord, b: NpcRecord): number {
  const sa = a.affinityMatrixSeed ?? 0.5;
  const sb = b.affinityMatrixSeed ?? 0.5;
  const key = sa < sb ? `${sa}|${sb}` : `${sb}|${sa}`;
  return (simpleHash(key) - 0.5) * 2;
}

/** 社交基底 opinion 偏移：affinity × 15（道缘 +15 起步，魔缘 -15 起步） */
export function affinityOpinionOffset(a: NpcRecord, b: NpcRecord): number {
  return Math.round(affinity(a, b) * 15);
}
