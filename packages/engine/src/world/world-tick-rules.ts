// ============================================================
// 月度 tick 数值规则集（无 AI 涌现叙事 §4）— 纯函数，可测试、可复现
//
// 覆盖：修炼增长 / 突破判定 / 奇遇 / 云游。
// 所有规则接受注入 rng，保证同种子同结果。
// ============================================================

import type { NpcRecord, RealmFullPath } from '@taosim/contracts';

export type Rng = () => number;

// ---- 境界轨道 ----
const REALM_ORDER: RealmFullPath[] = [
  'QiRefinement_1', 'QiRefinement_2', 'QiRefinement_3', 'QiRefinement_4',
  'QiRefinement_5', 'QiRefinement_6', 'QiRefinement_7', 'QiRefinement_8', 'QiRefinement_9',
  'Foundation_1', 'Foundation_2', 'Foundation_3',
  'GoldenCore_1', 'GoldenCore_2', 'GoldenCore_3',
  'NascentSoul_1', 'NascentSoul_2', 'NascentSoul_3',
  'SoulFormation_1',
];

const REALM_NAMES: Record<string, string> = {
  QiRefinement: '炼气',
  Foundation: '筑基',
  GoldenCore: '金丹',
  NascentSoul: '元婴',
  SoulFormation: '化神',
};

export function realmDisplay(realm: string): string {
  const [major = '', sub] = realm.split('_');
  return `${REALM_NAMES[major] ?? major}${sub ? sub + '层' : ''}`;
}

/** 下一境界（化神圆满无 next） */
export function nextRealm(realm: string): RealmFullPath | undefined {
  const i = REALM_ORDER.indexOf(realm as RealmFullPath);
  return i >= 0 && i < REALM_ORDER.length - 1 ? REALM_ORDER[i + 1] : undefined;
}

/** 当前境界的修为阈值 */
export function realmExpThreshold(realm: string): number {
  if (realm.startsWith('QiRefinement')) {
    const sub = Number(realm.split('_')[1]) || 1;
    return 80 * sub;
  }
  if (realm.startsWith('Foundation')) return 600;
  if (realm.startsWith('GoldenCore')) return 1500;
  if (realm.startsWith('NascentSoul')) return 3000;
  return 8000; // SoulFormation
}

/** 是否为某大境界末层（跨大境界突破） */
export function isBigRealmEnd(realm: string): boolean {
  return realm.endsWith('_9') || realm.endsWith('_3');
}

/** 每月修为增长（与玩家公式一致：悟性 × 0.5） */
export function cultivateNpc(rec: NpcRecord): void {
  rec.cultivation.currentExp += rec.attributes.comprehension * 0.5;
  rec.cultivation.maxExp = realmExpThreshold(rec.realm);
}

export interface BreakthroughResult {
  /** 是否达到阈值并尝试突破 */
  attempted: boolean;
  succeeded: boolean;
  nextRealm?: RealmFullPath;
  /** 跨大境界（major 事件） */
  major: boolean;
}

/**
 * 突破判定：成功率 = 基础 0.7 + 气运加权（±0.2）+ 天骄加成 0.1。
 * 失败：重伤折寿 3 年（寿元下限 40）。
 */
export function tryBreakthrough(rec: NpcRecord, rng: Rng): BreakthroughResult {
  if (rec.cultivation.currentExp < rec.cultivation.maxExp) {
    return { attempted: false, succeeded: false, major: false };
  }
  const next = nextRealm(rec.realm);
  if (!next) {
    return { attempted: false, succeeded: false, major: false }; // 已至化神圆满
  }
  const major = isBigRealmEnd(rec.realm);
  let chance = 0.7 + (rec.destiny.luck - 50) / 250;
  if (rec.destiny.tier === 'prodigy') chance += 0.1;
  chance = Math.min(0.95, Math.max(0.1, chance));

  const succeeded = rng() < chance;
  if (succeeded) {
    rec.realm = next;
    rec.cultivation.currentExp = 0;
    rec.cultivation.maxExp = realmExpThreshold(next);
  } else {
    rec.cultivation.currentExp = 0;
    rec.lifespan.maxLifespan = Math.max(40, rec.lifespan.maxLifespan - 3);
  }
  return { attempted: true, succeeded, nextRealm: next, major };
}

export interface WonderResult {
  triggered: boolean;
  type: 'treasure' | 'heritage' | 'injury';
  expGain?: number;
}

/**
 * 奇遇判定：基础 0.4%/月，气运加权，天骄 ×2。
 * treasure=天材地宝 / heritage=前辈洞府 / injury=秘境遇险（重伤折寿 5 年）。
 */
export function tryWonder(rec: NpcRecord, rng: Rng): WonderResult {
  let chance = 0.004 * (1 + (rec.destiny.luck - 50) / 100);
  if (rec.destiny.tier === 'prodigy') chance *= 2;
  if (rng() >= chance) return { triggered: false, type: 'treasure' };

  const roll = rng();
  if (roll < 0.6) {
    const gain = Math.floor((60 + rec.attributes.comprehension * 10) * (0.5 + rec.destiny.luck / 100));
    rec.cultivation.currentExp += gain;
    return { triggered: true, type: 'treasure', expGain: gain };
  }
  if (roll < 0.9) {
    const gain = Math.floor(200 + rec.attributes.comprehension * 20);
    rec.cultivation.currentExp += gain;
    return { triggered: true, type: 'heritage', expGain: gain };
  }
  rec.lifespan.maxLifespan = Math.max(40, rec.lifespan.maxLifespan - 5);
  return { triggered: true, type: 'injury' };
}

/** 云游判定：2%/月（locationId 置为云游中，待接入真实节点） */
export function tryWander(rec: NpcRecord, rng: Rng): boolean {
  if (rng() >= 0.02) return false;
  rec.locationId = undefined;
  return true;
}
