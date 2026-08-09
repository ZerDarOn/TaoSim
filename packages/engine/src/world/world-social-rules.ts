// ============================================================
// 社交/关系演化规则集（无 AI 涌现叙事 §4.3/§4.4）— 纯函数，可测试、可复现
//
// 覆盖：社交相遇（初识/论道/切磋/结仇）、寻仇斗法（轻量胜负判定 §11）。
// 所有规则接受注入 rng；关系只沉淀进 NpcRecord.relations（事件沉淀型，不写死命运）。
// ============================================================

import type { Character, Item, NpcRecord, RelationEntry, RelationType, SpiritRootGrade } from '@taosim/contracts';
import type { Rng } from './world-tick-rules.js';
import { realmTier, npcRecordToCharacter } from './npc-record-mapper.js';
import { calculateDamage, type DamageSpec } from '../battle/damage-calculator.js';
import { EquipmentManager } from '../equipment/equipment-manager.js';
import { affinityOpinionOffset } from './affinity.js';

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
    const base = 5 + Math.floor(rng() * 11); // 5..15
    // 兼容性基底（§spec 3.3.1）：道缘初识更投缘，魔缘初识有芥蒂
    const bond = Math.max(-20, base + affinityOpinionOffset(a, b));
    applyRelation(a, b.id, bond > 0 ? 'friend' : 'rival', bond, '初识', now);
    applyRelation(b, a.id, bond > 0 ? 'friend' : 'rival', bond, '初识', now);
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
/** 寻仇斗法回合上限（势均力敌按剩余 HP% 定胜负，避免死循环） */
const MAX_FEUD_ROUNDS = 60;

/** 出手规格：装备了带五行灵属的兵刃则按该元素出手（五行相克生效），否则纯物理 */
function attackSpecOf(c: Character): DamageSpec {
  const el = c.equipmentSlots.weapon?.element ?? 'Physical';
  return { multiplier: 1, element: el, tier: 1 };
}

/**
 * 本命兵刃（§战斗合理性）：斗法双方若未佩戴攻击兵刃，按境界根基 + 悟性资质补一件随身兵刃
 * （10 + 境界档×5 + 悟性×0.5）。两重作用：
 * - 破防底线：杜绝高境界互搏时基础攻击（10）破不了护体防御 → 0 伤害僵局；
 * - 天赋面板因果：悟性即天资，悟性高者本命法器威力更大——"以下犯上"只能是
 *   天生天赋/强横法宝支撑的真实战力，而非命格机制特权。
 */
function ensureRealmWeapon(c: Character): Character {
  if (EquipmentManager.getCombatBonuses(c).attack > 0) return c;
  const tier = realmTier(c.realm);
  const weapon: Item = {
    id: `realm_${c.id}_weapon`,
    name: '本命兵刃',
    tier,
    type: 'Equipment',
    attributes: { attack: 10 + tier * 5 + Math.floor(c.attributes.comprehension * 0.5) },
    element: c.equipmentSlots.weapon?.element ?? 'Physical',
  };
  return { ...c, equipmentSlots: { ...c.equipmentSlots, weapon } };
}

interface FeudDuel {
  attackerWins: boolean;
  /** 败者剩余 HP 比例 0..1 */
  loserHpPct: number;
  /** 胜者剩余 HP 比例 0..1 */
  winnerHpPct: number;
}

/**
 * 真实斗法（§战斗）：展开完整 Character（含装备加成），逐回合调用 damage-calculator 结算。
 * 五行克制 / 闪避 / 暴击 / 境界壁垒全部生效：
 * - 先手：寻仇者每轮先攻（主动出击）。
 * - 境界壁垒：跨 2 阶以上 0 伤害（无变数时强者必胜）；±1 阶内战力碾压方可松动壁垒——
 *   "以下犯上"只能由天生天赋/强横法宝支撑（面板因果），无命格机制特权。
 * - 回合上限内未分胜负 → 按剩余 HP% 定胜负（势均力敌两败俱伤）。
 */
function runFeudDuel(attacker: Character, defender: Character, rng: Rng): FeudDuel {
  const aMax = attacker.maxHp;
  const bMax = defender.maxHp;
  for (let round = 0; round < MAX_FEUD_ROUNDS; round++) {
    for (const [atk, def] of [[attacker, defender], [defender, attacker]] as const) {
      if (def.hp <= 0 || atk.hp <= 0) break;
      const res = calculateDamage(atk, def, attackSpecOf(atk), rng);
      def.hp = Math.max(0, def.hp - res.finalDamage);
    }
    if (attacker.hp <= 0 || defender.hp <= 0) break;
  }
  const aPct = Math.max(0, attacker.hp) / aMax;
  const bPct = Math.max(0, defender.hp) / bMax;
  // 势均力敌（HP 同比例，含双双未破防的 0 伤害僵局）：先手微优——
  // 主动出击方略胜，避免"零伤害平局反判寻仇者（先手）落败并折寿"
  const attackerWins = aPct >= bPct;
  return {
    attackerWins,
    loserHpPct: attackerWins ? bPct : aPct,
    winnerHpPct: attackerWins ? aPct : bPct,
  };
}

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
 * 真实斗法判定（§战斗）：按面板 + 装备 + 技能 + HP 逐回合结算；
 * 境界壁垒保证"无变数时弱不胜强"，以下犯上只能由天赋/法宝等世界内因支撑。
 */
export function tryFeud(
  attacker: NpcRecord,
  target: NpcRecord,
  now: GameTime,
  rng: Rng,
  /** 死劫豁免回调（涌现缺口 N3）：命格者于死斗中绝处逢生（由调用方注入，保持规则集纯函数） */
  escapeDeath?: (npc: NpcRecord) => boolean,
  /** 触发概率：默认被动配对 0.1；动机驱动寻仇者主动出手可抬高（行为槽 §4.13） */
  chance = FEUD_CHANCE,
): FeudResult | undefined {
  const aHatesB = attacker.relations[target.id]?.type === 'enemy';
  const bHatesA = target.relations[attacker.id]?.type === 'enemy';
  if (!aHatesB && !bHatesA) return undefined;
  if (rng() >= chance) return undefined;

  // 真实斗法：展开完整 Character（含装备加成 combatGear → 兵刃/法衣/法宝），
  // 无攻击兵刃者按境界根基 + 悟性资质补本命兵刃（天赋面板因果，见 ensureRealmWeapon）
  const attackerChar = ensureRealmWeapon(npcRecordToCharacter(attacker));
  const defenderChar = ensureRealmWeapon(npcRecordToCharacter(target));

  const outcome = runFeudDuel(attackerChar, defenderChar, rng);
  const attackerWins = outcome.attackerWins;
  const winner = attackerWins ? attacker : target;
  const loser = attackerWins ? target : attacker;

  // 伤势按斗法实际伤害折算：败者剩余 HP 越少，伤越重（轻伤 2 年 / 重伤 5 年 / 濒死 10 年）
  let injuryYears = INJURY_BASE_YEARS;
  if (outcome.loserHpPct >= 0.99) injuryYears = 0; // 未能破防的势均力敌：无伤，不折寿
  else if (outcome.loserHpPct <= 0.25) injuryYears = 10;
  else if (outcome.loserHpPct <= 0.5) injuryYears = 5;

  // 仇杀致死：胜者余力尚存（HP≥50%）且败者已油尽灯枯（HP≤20%）→ 可下杀手
  let lethal = false;
  const canKill = outcome.loserHpPct <= 0.2 && outcome.winnerHpPct >= 0.5;
  if (canKill && rng() < 0.35) {
    // 死劫豁免（涌现缺口 N3）：命格者于生死一线搏得生机 → 重伤延寿替代陨落
    if (escapeDeath?.(loser)) {
      loser.lifespan.maxLifespan = Math.max(40, loser.lifespan.maxLifespan - 10);
    } else {
      lethal = true;
      loser.soulState = 'PrimordialSoul';
      loser.deathYear = now.year;
      loser.deathMonth = now.month;
      loser.causeOfDeath = '仇杀陨落';
    }
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

/**
 * 宗门权力斗法（§2.2 夺位）：与寻仇同源的真实结算（面板定胜负），
 * 但无敌人关系前置——夺位是权力野心而非仇怨。由引擎夺位块调用：
 * 胜者执掌宗门，败者降为长老或被逐出宗门。
 */
export function sectPowerDuel(challenger: NpcRecord, incumbent: NpcRecord, rng: Rng): FeudDuel {
  const attackerChar = ensureRealmWeapon(npcRecordToCharacter(challenger));
  const defenderChar = ensureRealmWeapon(npcRecordToCharacter(incumbent));
  return runFeudDuel(attackerChar, defenderChar, rng);
}

// ============================================================
// 嫉妒追捧（§spec 3.3.2）：宗门社会化结构——天灵根招嫉、凡人仰慕
// ============================================================

/** 灵根资质权重（天>地>玄>黄；神品最高） */
export function rootGradeWeight(grade: SpiritRootGrade): number {
  switch (grade) {
    case 'Heaven': return 4;
    case 'Earth': return 3;
    case 'Profound': return 2;
    case 'Yellow': return 1;
    default: return 0;
  }
}

/**
 * 嫉妒追捧：同场所低资质者对高资质天才产生 opinion 偏移。
 * - 嫉妒：性格 jealous 者 rng < 0.5 → 心生嫉妒（-15，双向结怨）
 * - 敬仰：其余人 rng < 0.05 → 心生敬仰（+8，少部分人仰慕）
 * 消耗 rng：每名旁观者 1 次。
 */
export function tryJealousy(
  bystanders: NpcRecord[],
  target: NpcRecord,
  now: GameTime,
  rng: Rng,
): void {
  const targetW = rootGradeWeight(target.spiritRoot.grade);
  if (targetW < 2) return; // 玄级以下不引人注目
  for (const other of bystanders) {
    if (other.id === target.id || other.soulState !== 'Active') continue;
    if (rootGradeWeight(other.spiritRoot.grade) >= targetW) continue; // 同级/更高不嫉妒
    if (other.personalityId === 'PERSONALITY_JEALOUS' && rng() < 0.5) {
      applyRelation(other, target.id, 'rival', -15, '心生嫉妒', now);
      applyRelation(target, other.id, 'rival', -5, '察觉敌意', now);
    } else if (rng() < 0.05) {
      // 少量敬仰（防止所有低资质都沉默）
      applyRelation(other, target.id, 'friend', 8, '心生敬仰', now);
    }
  }
}
