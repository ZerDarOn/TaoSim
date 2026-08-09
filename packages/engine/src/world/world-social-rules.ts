// ============================================================
// 社交/关系演化规则集（无 AI 涌现叙事 §4.3/§4.4）— 纯函数，可测试、可复现
//
// 覆盖：社交相遇（初识/论道/切磋/结仇）、寻仇斗法（轻量胜负判定 §11）。
// 所有规则接受注入 rng；关系只沉淀进 NpcRecord.relations（事件沉淀型，不写死命运）。
// ============================================================

import type { NpcRecord, RelationEntry, RelationType } from '@taosim/contracts';
import type { Rng } from './world-tick-rules.js';
import { realmTier } from './npc-record-mapper.js';

export interface GameTime {
  year: number;
  month: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 敌对程度排序（关系类型只升不降：结仇会覆盖友善关系） */
function hostility(type: RelationType): number {
  if (type === 'enemy') return 3;
  if (type === 'rival') return 2;
  if (type === 'benefactor' || type === 'debtor') return 1;
  return 0;
}

/** 关系变更：双向沉淀进 relations（事件链 + bond/trust 演化） */
function applyRelation(
  owner: NpcRecord,
  targetId: string,
  type: RelationType,
  bondDelta: number,
  label: string,
  now: GameTime,
): void {
  const changedAt = { year: now.year, month: now.month };
  const existing: RelationEntry | undefined = owner.relations[targetId];
  if (existing) {
    existing.bond = clamp(existing.bond + bondDelta, -100, 100);
    existing.trust = clamp(existing.trust + (bondDelta > 0 ? 6 : -6), 0, 100);
    if (hostility(type) > hostility(existing.type)) existing.type = type;
    existing.events.push(label);
    existing.changedAt = changedAt;
  } else {
    owner.relations[targetId] = {
      type,
      bond: clamp(bondDelta, -100, 100),
      trust: bondDelta > 0 ? 25 : 10,
      events: [label],
      changedAt,
    };
  }
}

/** 实力分：境界权重 + 体质 + 功法数 + 当前修为进度（轻量胜负判定基准） */
export function powerScore(rec: NpcRecord): number {
  const tier = realmTier(rec.realm);
  return (
    tier * 100 +
    rec.attributes.physique * 2 +
    rec.skillIds.length * 15 +
    Math.min(rec.cultivation.currentExp, rec.cultivation.maxExp) / 20
  );
}

/** 洗牌后取连续对（注入 rng，同种子同配对） */
export function samplePairs<T>(items: T[], rng: Rng, pairCount: number): [T, T][] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  const pairs: [T, T][] = [];
  for (let i = 0; i + 1 < arr.length && pairs.length < pairCount; i += 2) {
    pairs.push([arr[i]!, arr[i + 1]!]);
  }
  return pairs;
}

const MEET_CHANCE = 0.05;

export type EncounterKind = 'meet' | 'dao-discussion' | 'spar' | 'grudge';

export type EncounterTemplateKey = 'social.meet' | 'social.dao' | 'social.spar' | 'social.grudge';

export interface EncounterResult {
  kind: EncounterKind;
  /** 事件模板键（文本统一由模板库产出 §5） */
  templateKey: EncounterTemplateKey;
  /** 对双方的 bond 影响（正=友善，负=敌对） */
  bondDelta: number;
  /** 论道修为增益（关系轨道 ↔ 境界轨道） */
  expGain?: number;
  /** 论道焦点人物（悟性高者，模板 {npc} 变量） */
  focalName?: string;
  major: boolean;
}

/**
 * 社交相遇：配对 NPC 之间可能产生一次关系事件（无事返回 undefined）。
 * 分布：初识 55% / 论道 20% / 切磋 15% / 结仇 10%。
 */
export function socialEncounter(
  a: NpcRecord,
  b: NpcRecord,
  now: GameTime,
  rng: Rng,
): EncounterResult | undefined {
  if (rng() >= MEET_CHANCE) return undefined;

  const roll = rng();
  if (roll < 0.55) {
    const bond = 5 + Math.floor(rng() * 11); // 5..15
    applyRelation(a, b.id, 'friend', bond, '初识', now);
    applyRelation(b, a.id, 'friend', bond, '初识', now);
    return {
      kind: 'meet', templateKey: 'social.meet', bondDelta: bond, major: false,
    };
  }
  if (roll < 0.75) {
    const bond = 8 + Math.floor(rng() * 11); // 8..18
    const expGain = Math.min(30, Math.max(a.attributes.comprehension, b.attributes.comprehension) * 2);
    applyRelation(a, b.id, 'friend', bond, '论道', now);
    applyRelation(b, a.id, 'friend', bond, '论道', now);
    const wiser = a.attributes.comprehension >= b.attributes.comprehension ? a : b;
    wiser.cultivation.currentExp += expGain;
    return {
      kind: 'dao-discussion', templateKey: 'social.dao', bondDelta: bond, expGain,
      focalName: wiser.name, major: false,
    };
  }
  if (roll < 0.9) {
    const bond = -(3 + Math.floor(rng() * 5)); // -3..-7
    applyRelation(a, b.id, 'rival', bond, '切磋', now);
    applyRelation(b, a.id, 'rival', bond, '切磋', now);
    return {
      kind: 'spar', templateKey: 'social.spar', bondDelta: bond, major: false,
    };
  }
  const bond = -(20 + Math.floor(rng() * 16)); // -20..-35
  applyRelation(a, b.id, 'enemy', bond, '结仇', now);
  applyRelation(b, a.id, 'enemy', bond, '结仇', now);
  return {
    kind: 'grudge', templateKey: 'social.grudge', bondDelta: bond, major: true,
  };
}

const FEUD_CHANCE = 0.1;
const INJURY_BASE_YEARS = 2;

export interface FeudResult {
  attackerWins: boolean;
  /** 事件模板键（combat.feed.win / combat.feed.lethal） */
  templateKey: 'combat.feed.win' | 'combat.feed.lethal';
  /** 败者折寿（年） */
  injuryYears: number;
  /** 实力悬殊 → 陨落（仇杀） */
  lethal: boolean;
  major: boolean;
  /** 夺走的灵石（§2.2 轨道咬合：实力 ↔ 经济；陨落则尽取其物） */
  lootStones: number;
}

/**
 * 寻仇：双方存在 enemy 关系 → 概率触发斗法。
 * 轻量胜负判定：实力分差 + 气运加权；败者折寿，实力悬殊可致陨落。
 */
export function tryFeud(
  attacker: NpcRecord,
  target: NpcRecord,
  now: GameTime,
  rng: Rng,
): FeudResult | undefined {
  const aHatesB = attacker.relations[target.id]?.type === 'enemy';
  const bHatesA = target.relations[attacker.id]?.type === 'enemy';
  if (!aHatesB && !bHatesA) return undefined;
  if (rng() >= FEUD_CHANCE) return undefined;

  const aScore = powerScore(attacker) + attacker.destiny.luck / 10;
  const tScore = powerScore(target) + target.destiny.luck / 10;
  const winChance = clamp(0.5 + (aScore - tScore) / 500, 0.05, 0.95);

  const attackerWins = rng() < winChance;
  const winner = attackerWins ? attacker : target;
  const loser = attackerWins ? target : attacker;
  const gap = Math.abs(aScore - tScore);

  let injuryYears = INJURY_BASE_YEARS;
  if (gap > 250) injuryYears = 10;
  else if (gap > 150) injuryYears = 5;

  let lethal = false;
  if (gap > 250 && rng() < 0.2) {
    lethal = true;
    loser.soulState = 'PrimordialSoul';
    loser.deathYear = now.year;
    loser.deathMonth = now.month;
    loser.causeOfDeath = '仇杀陨落';
  } else {
    loser.lifespan.maxLifespan = Math.max(40, loser.lifespan.maxLifespan - injuryYears);
  }

  // 夺宝（§2.2 轨道咬合）：胜者劫走败者部分灵石；陨落则尽取其物
  let lootStones = 0;
  if ((loser.spiritStones ?? 0) > 0) {
    lootStones = lethal
      ? loser.spiritStones!
      : Math.min(Math.floor((loser.spiritStones ?? 0) * 0.3), 500);
    loser.spiritStones = (loser.spiritStones ?? 0) - lootStones;
    winner.spiritStones = (winner.spiritStones ?? 0) + lootStones;
  }

  applyRelation(winner, loser.id, 'enemy', -5, attackerWins ? '寻仇得手' : '寻仇未果', now);
  applyRelation(loser, winner.id, 'enemy', -8, attackerWins ? '寻仇落败' : '寻仇报复', now);

  return {
    attackerWins,
    templateKey: lethal ? 'combat.feed.lethal' : 'combat.feed.win',
    injuryYears,
    lethal,
    major: lethal,
    lootStones,
  };
}
