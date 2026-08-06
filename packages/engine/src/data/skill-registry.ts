// ============================================================
// 任务 3：功法技能库
// 30 个技能：Huang ×8 / Xuan ×8 / Di ×8 / Tian ×6
// 技能方向：剑修 / 法修 / 体修 / 辅助 / 邪道
// ============================================================

import type { Skill } from '@taosim/contracts';

export const SKILL_REGISTRY: Skill[] = [
  // ==================== Huang（黄阶）×8 ====================
  // 定位：基础攻击/防御技能，伤害倍率 1.0-1.5，冷却 0-2
  {
    id: 'SKILL_STONE_FIST',
    name: '碎石拳',
    quality: 'Huang',
    type: 'Active',
    primitives: [
      { id: 'ATOM_101', category: 'Geometry', params: { type: 'Single', range: 1 }, costBudget: 10 },
      { id: 'ATOM_102', category: 'Numeric', params: { multiplier: 1.1 }, costBudget: 10 },
    ],
    cost: { ap: 1, spiritEnergy: 5 },
    cooldownTurns: 0,
  },
  {
    id: 'SKILL_WIND_BLADE',
    name: '风刃术',
    quality: 'Huang',
    type: 'Active',
    primitives: [
      { id: 'ATOM_103', category: 'Geometry', params: { type: 'Single', range: 2 }, costBudget: 10 },
      { id: 'ATOM_104', category: 'Numeric', params: { multiplier: 1.2 }, costBudget: 10 },
    ],
    cost: { ap: 1, spiritEnergy: 8 },
    cooldownTurns: 1,
  },
  {
    id: 'SKILL_IRON_GUARD',
    name: '铁布衫',
    quality: 'Huang',
    type: 'Passive',
    primitives: [
      { id: 'ATOM_105', category: 'StatusHook', params: { status: 'ArmorPassive', duration: 0 }, costBudget: 10 },
      { id: 'ATOM_106', category: 'Numeric', params: { defenseBoost: 8 }, costBudget: 10 },
    ],
    cost: { ap: 0, spiritEnergy: 0 },
    cooldownTurns: 0,
  },
  {
    id: 'SKILL_WHISPER_SWORD',
    name: '柳叶剑',
    quality: 'Huang',
    type: 'Active',
    primitives: [
      { id: 'ATOM_107', category: 'Geometry', params: { type: 'Single', range: 1 }, costBudget: 10 },
      { id: 'ATOM_108', category: 'Numeric', params: { multiplier: 1.0 }, costBudget: 10 },
    ],
    cost: { ap: 1, spiritEnergy: 6 },
    cooldownTurns: 0,
  },
  {
    id: 'SKILL_SPARK',
    name: '引火诀',
    quality: 'Huang',
    type: 'Active',
    primitives: [
      { id: 'ATOM_109', category: 'Geometry', params: { type: 'Single', range: 2 }, costBudget: 10 },
      { id: 'ATOM_110', category: 'Numeric', params: { multiplier: 1.3 }, costBudget: 10 },
    ],
    cost: { ap: 1, spiritEnergy: 8 },
    cooldownTurns: 1,
  },
  {
    id: 'SKILL_QUICK_STEP',
    name: '疾风步',
    quality: 'Huang',
    type: 'Active',
    primitives: [
      { id: 'ATOM_111', category: 'TimeATB', params: { atbCost: 30 }, costBudget: 5 },
      { id: 'ATOM_112', category: 'Geometry', params: { type: 'Move', range: 2 }, costBudget: 8 },
    ],
    cost: { ap: 1, spiritEnergy: 5 },
    cooldownTurns: 2,
  },
  {
    id: 'SKILL_VINE_ENTANGLE',
    name: '缠藤术',
    quality: 'Huang',
    type: 'Active',
    primitives: [
      { id: 'ATOM_113', category: 'Geometry', params: { type: 'Single', range: 2 }, costBudget: 10 },
      { id: 'ATOM_114', category: 'StatusHook', params: { status: 'Bind', duration: 1 }, costBudget: 8 },
    ],
    cost: { ap: 1, spiritEnergy: 8 },
    cooldownTurns: 2,
  },
  {
    id: 'SKILL_BODY_TEMPER',
    name: '淬体诀',
    quality: 'Huang',
    type: 'Passive',
    primitives: [
      { id: 'ATOM_115', category: 'StatusHook', params: { status: 'PhysiqueUp', duration: 0 }, costBudget: 10 },
      { id: 'ATOM_116', category: 'Numeric', params: { maxHpBoost: 20 }, costBudget: 8 },
    ],
    cost: { ap: 0, spiritEnergy: 0 },
    cooldownTurns: 0,
  },

  // ==================== Xuan（玄阶）×8 ====================
  // 定位：进阶技能，伤害倍率 1.5-2.5，带 StatusHook，冷却 1-3
  {
    id: 'SKILL_FIRE_BALL',
    name: '火球术',
    quality: 'Xuan',
    type: 'Active',
    primitives: [
      { id: 'ATOM_117', category: 'Geometry', params: { type: 'Single', range: 2 }, costBudget: 10 },
      { id: 'ATOM_118', category: 'Numeric', params: { multiplier: 1.8 }, costBudget: 12 },
      { id: 'ATOM_119', category: 'StatusHook', params: { status: 'Burn', duration: 2 }, costBudget: 8 },
    ],
    cost: { ap: 1, spiritEnergy: 12 },
    cooldownTurns: 2,
  },
  {
    id: 'SKILL_ICE_SPEAR',
    name: '冰锥术',
    quality: 'Xuan',
    type: 'Active',
    primitives: [
      { id: 'ATOM_120', category: 'Geometry', params: { type: 'Single', range: 2 }, costBudget: 10 },
      { id: 'ATOM_121', category: 'Numeric', params: { multiplier: 1.6 }, costBudget: 12 },
      { id: 'ATOM_122', category: 'StatusHook', params: { status: 'Freeze', duration: 1 }, costBudget: 10 },
    ],
    cost: { ap: 1, spiritEnergy: 12 },
    cooldownTurns: 2,
  },
  {
    id: 'SKILL_THUNDER_SLASH',
    name: '惊雷斩',
    quality: 'Xuan',
    type: 'Active',
    primitives: [
      { id: 'ATOM_123', category: 'Geometry', params: { type: 'Single', range: 1 }, costBudget: 10 },
      { id: 'ATOM_124', category: 'Numeric', params: { multiplier: 2.0 }, costBudget: 14 },
      { id: 'ATOM_125', category: 'TimeATB', params: { atbCost: 60 }, costBudget: 6 },
    ],
    cost: { ap: 2, spiritEnergy: 18 },
    cooldownTurns: 2,
  },
  {
    id: 'SKILL_IRON_SHIRT',
    name: '金钟罩',
    quality: 'Xuan',
    type: 'Active',
    primitives: [
      { id: 'ATOM_126', category: 'StatusHook', params: { status: 'Shield', duration: 2 }, costBudget: 12 },
      { id: 'ATOM_127', category: 'Numeric', params: { shieldValue: 30 }, costBudget: 10 },
    ],
    cost: { ap: 1, spiritEnergy: 15 },
    cooldownTurns: 2,
  },
  {
    id: 'SKILL_HEALING_ART',
    name: '回春术',
    quality: 'Xuan',
    type: 'Active',
    primitives: [
      { id: 'ATOM_128', category: 'Geometry', params: { type: 'Single', range: 2 }, costBudget: 8 },
      { id: 'ATOM_129', category: 'Numeric', params: { heal: 2.0 }, costBudget: 12 },
      { id: 'ATOM_130', category: 'StatusHook', params: { status: 'Regen', duration: 2 }, costBudget: 8 },
    ],
    cost: { ap: 1, spiritEnergy: 12 },
    cooldownTurns: 2,
  },
  {
    id: 'SKILL_SOUL_SEAL',
    name: '摄魂符',
    quality: 'Xuan',
    type: 'Active',
    primitives: [
      { id: 'ATOM_131', category: 'StatusHook', params: { status: 'SoulWeaken', duration: 2 }, costBudget: 12 },
      { id: 'ATOM_132', category: 'Numeric', params: { multiplier: 1.5 }, costBudget: 12 },
    ],
    cost: { ap: 2, spiritEnergy: 20 },
    cooldownTurns: 3,
  },
  {
    id: 'SKILL_WIND_RIDE',
    name: '御风术',
    quality: 'Xuan',
    type: 'Active',
    primitives: [
      { id: 'ATOM_133', category: 'TimeATB', params: { atbCost: 70 }, costBudget: 8 },
      { id: 'ATOM_134', category: 'Geometry', params: { type: 'Move', range: 3 }, costBudget: 10 },
    ],
    cost: { ap: 1, spiritEnergy: 10 },
    cooldownTurns: 2,
  },
  {
    id: 'SKILL_SPIRIT_SHIELD',
    name: '护体灵光',
    quality: 'Xuan',
    type: 'Passive',
    primitives: [
      { id: 'ATOM_135', category: 'StatusHook', params: { status: 'ManaShield', duration: 0 }, costBudget: 12 },
      { id: 'ATOM_136', category: 'Numeric', params: { damageAbsorb: 15 }, costBudget: 10 },
    ],
    cost: { ap: 0, spiritEnergy: 10 },
    cooldownTurns: 0,
  },

  // ==================== Di（地阶）×8 ====================
  // 定位：高阶技能，伤害倍率 2.5-4.0，有范围/ATB 效果，冷却 2-4
  {
    id: 'SKILL_TEN_THOUSAND_SWORDS',
    name: '万剑归宗',
    quality: 'Di',
    type: 'Active',
    primitives: [
      { id: 'ATOM_137', category: 'Geometry', params: { type: 'AOE', range: 2, radius: 1 }, costBudget: 15 },
      { id: 'ATOM_138', category: 'Numeric', params: { multiplier: 2.8 }, costBudget: 18 },
    ],
    cost: { ap: 3, spiritEnergy: 30 },
    cooldownTurns: 3,
  },
  {
    id: 'SKILL_FREEZE_TEN_THOUSAND',
    name: '冰封万里',
    quality: 'Di',
    type: 'Active',
    primitives: [
      { id: 'ATOM_139', category: 'Geometry', params: { type: 'AOE', range: 3, radius: 1 }, costBudget: 16 },
      { id: 'ATOM_140', category: 'Numeric', params: { multiplier: 2.5 }, costBudget: 16 },
      { id: 'ATOM_141', category: 'StatusHook', params: { status: 'Frozen', duration: 2 }, costBudget: 10 },
    ],
    cost: { ap: 3, spiritEnergy: 35 },
    cooldownTurns: 3,
  },
  {
    id: 'SKILL_HEAVENLY_THUNDER',
    name: '天雷诀',
    quality: 'Di',
    type: 'Active',
    primitives: [
      { id: 'ATOM_142', category: 'Geometry', params: { type: 'Single', range: 3 }, costBudget: 12 },
      { id: 'ATOM_143', category: 'Numeric', params: { multiplier: 3.2 }, costBudget: 18 },
      { id: 'ATOM_144', category: 'StatusHook', params: { status: 'Paralyze', duration: 1 }, costBudget: 8 },
    ],
    cost: { ap: 2, spiritEnergy: 30 },
    cooldownTurns: 3,
  },
  {
    id: 'SKILL_DRAGON_ELEPHANT',
    name: '龙象之力',
    quality: 'Di',
    type: 'Active',
    primitives: [
      { id: 'ATOM_145', category: 'StatusHook', params: { status: 'AttackUp', duration: 2 }, costBudget: 12 },
      { id: 'ATOM_146', category: 'Numeric', params: { multiplier: 3.0 }, costBudget: 16 },
    ],
    cost: { ap: 2, spiritEnergy: 25 },
    cooldownTurns: 3,
  },
  {
    id: 'SKILL_SWORD_QI_RIVER',
    name: '剑气纵横',
    quality: 'Di',
    type: 'Active',
    primitives: [
      { id: 'ATOM_147', category: 'Geometry', params: { type: 'AOE', range: 2, radius: 1 }, costBudget: 15 },
      { id: 'ATOM_148', category: 'Numeric', params: { multiplier: 2.6 }, costBudget: 16 },
      { id: 'ATOM_149', category: 'TimeATB', params: { atbCost: 60 }, costBudget: 6 },
    ],
    cost: { ap: 3, spiritEnergy: 28 },
    cooldownTurns: 3,
  },
  {
    id: 'SKILL_MYTHIC_EYE',
    name: '天眼通',
    quality: 'Di',
    type: 'Active',
    primitives: [
      { id: 'ATOM_150', category: 'StatusHook', params: { status: 'PerceptionUp', duration: 3 }, costBudget: 12 },
      { id: 'ATOM_151', category: 'TimeATB', params: { atbCost: 50 }, costBudget: 8 },
    ],
    cost: { ap: 2, spiritEnergy: 20 },
    cooldownTurns: 3,
  },
  {
    id: 'SKILL_EARTH_BURROW',
    name: '遁地术',
    quality: 'Di',
    type: 'Active',
    primitives: [
      { id: 'ATOM_152', category: 'TimeATB', params: { atbCost: 80 }, costBudget: 10 },
      { id: 'ATOM_153', category: 'Geometry', params: { type: 'Move', range: 4 }, costBudget: 12 },
    ],
    cost: { ap: 2, spiritEnergy: 18 },
    cooldownTurns: 3,
  },
  {
    id: 'SKILL_SOUL_DEVOUR',
    name: '噬魂术',
    quality: 'Di',
    type: 'Active',
    primitives: [
      { id: 'ATOM_154', category: 'Geometry', params: { type: 'Single', range: 2 }, costBudget: 12 },
      { id: 'ATOM_155', category: 'Numeric', params: { multiplier: 3.5 }, costBudget: 18 },
      { id: 'ATOM_156', category: 'StatusHook', params: { status: 'SoulDrain', duration: 2 }, costBudget: 10 },
    ],
    cost: { ap: 2, spiritEnergy: 30 },
    cooldownTurns: 4,
  },

  // ==================== Tian（天阶）×6 ====================
  // 定位：顶级技能，伤害倍率 4.0-8.0，带反噬风险，冷却 3-5
  {
    id: 'SKILL_ONE_SWORD_BREAK',
    name: '一剑破万法',
    quality: 'Tian',
    type: 'Active',
    primitives: [
      { id: 'ATOM_157', category: 'Geometry', params: { type: 'Single', range: 3 }, costBudget: 14 },
      { id: 'ATOM_158', category: 'Numeric', params: { multiplier: 5.0 }, costBudget: 22 },
    ],
    cost: { ap: 3, spiritEnergy: 40 },
    cooldownTurns: 4,
  },
  {
    id: 'SKILL_NINE_NETHER_FLAME',
    name: '九幽冥火',
    quality: 'Tian',
    type: 'Active',
    primitives: [
      { id: 'ATOM_159', category: 'Geometry', params: { type: 'AOE', range: 3, radius: 1 }, costBudget: 16 },
      { id: 'ATOM_160', category: 'Numeric', params: { multiplier: 4.2 }, costBudget: 20 },
      { id: 'ATOM_161', category: 'TerrainMutate', params: { terrain: 'Fire' }, costBudget: 8 },
    ],
    cost: { ap: 3, spiritEnergy: 45 },
    backfire: { type: 'HeartDemonInc', intensity: 20, durationTurns: 2 },
    cooldownTurns: 4,
  },
  {
    id: 'SKILL_IMMORTAL_GOLDEN_BODY',
    name: '不灭金身',
    quality: 'Tian',
    type: 'Active',
    primitives: [
      { id: 'ATOM_162', category: 'StatusHook', params: { status: 'Invincible', duration: 2 }, costBudget: 20 },
      { id: 'ATOM_163', category: 'Numeric', params: { defenseBoost: 60 }, costBudget: 14 },
    ],
    cost: { ap: 3, spiritEnergy: 40 },
    backfire: { type: 'SelfStun', intensity: 30, durationTurns: 1 },
    cooldownTurns: 5,
  },
  {
    id: 'SKILL_BLOOD_SACRIFICE',
    name: '血祭大法',
    quality: 'Tian',
    type: 'Active',
    primitives: [
      { id: 'ATOM_164', category: 'Geometry', params: { type: 'Single', range: 2 }, costBudget: 12 },
      { id: 'ATOM_165', category: 'Numeric', params: { multiplier: 6.0 }, costBudget: 24 },
      { id: 'ATOM_166', category: 'StatusHook', params: { status: 'BloodRage', duration: 2 }, costBudget: 12 },
    ],
    cost: { ap: 2, spiritEnergy: 35, lifespanDays: 30 },
    backfire: { type: 'SelfDamage', intensity: 50 },
    cooldownTurns: 3,
  },
  {
    id: 'SKILL_DEMON_BODY_EXPLODE',
    name: '天魔解体',
    quality: 'Tian',
    type: 'Active',
    primitives: [
      { id: 'ATOM_167', category: 'Numeric', params: { multiplier: 8.0 }, costBudget: 26 },
      { id: 'ATOM_168', category: 'TimeATB', params: { atbCost: 100 }, costBudget: 10 },
    ],
    cost: { ap: 2, spiritEnergy: 40, lifespanDays: 60 },
    backfire: { type: 'SelfDamage', intensity: 80 },
    cooldownTurns: 4,
  },
  {
    id: 'SKILL_STAR_CALAMITY',
    name: '星陨天灾',
    quality: 'Tian',
    type: 'Active',
    primitives: [
      { id: 'ATOM_169', category: 'Geometry', params: { type: 'AOE', range: 4, radius: 2 }, costBudget: 20 },
      { id: 'ATOM_170', category: 'Numeric', params: { multiplier: 6.5 }, costBudget: 24 },
      { id: 'ATOM_171', category: 'TerrainMutate', params: { terrain: 'Meteor' }, costBudget: 10 },
    ],
    cost: { ap: 3, spiritEnergy: 50 },
    backfire: { type: 'SelfDamage', intensity: 40 },
    cooldownTurns: 5,
  },
];
