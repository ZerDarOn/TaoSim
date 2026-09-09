// ============================================================
// NPC 动态空间反应 — Phase 4
//
// 这是从个人面板、心智档案和当前可见特征推导的纯决策函数。
// 它只产生意图，不直接修改世界；实际进入/避开仍由 WorldEngine
// 在空间路线和权限校验后提交。
// ============================================================

import type { DynamicSpatialFeature, NpcRecord } from '@taosim/contracts';

export type NpcSpatialResponse = 'enter' | 'investigate' | 'avoid' | 'seal';

export interface NpcSpatialDecision {
  featureId: string;
  response: NpcSpatialResponse;
  score: number;
  reason: string;
}

export function chooseNpcSpatialResponse(
  npc: Readonly<NpcRecord>,
  feature: Readonly<DynamicSpatialFeature>,
): NpcSpatialDecision {
  const riskTolerance = npc.brain?.profile.behavioralBiases.riskTolerance
    ?? (npc.personalityId.includes('cautious') || npc.personalityId.includes('谨慎')
      ? 25
      : npc.personalityId.includes('reckless') || npc.personalityId.includes('冒险') ? 95 : 50);
  const curiosity = npc.brain?.profile.behavioralBiases.curiosity
    ?? (npc.personalityId.includes('reckless') || npc.personalityId.includes('冒险')
      ? 75
      : Math.min(100, npc.attributes.perception * 5 + npc.attributes.luck * 2));
  const duty = npc.socialRank === 'elder' || npc.socialRank === 'sectMaster' ? 15 : 0;
  const danger = typeof feature.effects.dangerLevel === 'number' ? feature.effects.dangerLevel : 35;
  const score = Math.round(curiosity * 0.5 + riskTolerance * 0.5 + duty - danger * 0.2);

  if (feature.type === 'barrier' && duty >= 15 && score >= 45) {
    return { featureId: feature.id, response: 'seal', score, reason: '宗门身份要求维护辖地边界' };
  }
  if (score >= 65) {
    return { featureId: feature.id, response: 'enter', score, reason: '好奇心与风险承受力足以进入异常空间' };
  }
  if (score >= 45) {
    return { featureId: feature.id, response: 'investigate', score, reason: '先调查异常，避免立即承担全部风险' };
  }
  return { featureId: feature.id, response: 'avoid', score, reason: '风险高于当前意愿与承受力' };
}
