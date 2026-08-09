/**
 * CalendarEventScheduler — 节气事件调度
 *
 * 定义修仙世界的周期性节气事件。
 * 每月推进时检查是否有节气事件触发。
 *
 * 框架先行：先做 8 个骨架事件，后续可填充具体内容。
 */

import type { CalendarEventDef, EventCategory } from '@taosim/contracts';

// ============================================================
// 节气事件目录
// ============================================================

export const CALENDAR_EVENTS: CalendarEventDef[] = [
  {
    id: 'CAL_SPRING_THUNDER',
    name: '春雷惊蛰',
    description: '正月春雷乍响，万物苏醒。天地灵气随之涌动，修炼效率提升。',
    trigger: { month: 1, probability: 0.8 },
    effectType: 'spirit_surge',
    effect: { spiritDensityMult: 1.15 },
  },
  {
    id: 'CAL_SPRING_BALANCE',
    name: '春分别阳',
    description: '仲春之月，阴阳调和，适合突破瓶颈。',
    trigger: { month: 2, probability: 0.5 },
    effectType: 'spirit_surge',
    effect: { spiritDensityMult: 1.08, breakthroughBonus: 0.05 },
  },
  {
    id: 'CAL_SUMMER_SOLSTICE',
    name: '夏至阳生',
    description: '夏至日阳气最盛，火属灵气充沛。妖兽亦在此月躁动不安。',
    trigger: { month: 5, probability: 0.7 },
    effectType: 'spirit_surge',
    effect: { spiritDensityMult: 1.20, demonSpawnMult: 1.5 },
  },
  {
    id: 'CAL_AUTUMN_HARVEST',
    name: '秋分灵收',
    description: '金秋时节，灵材成熟，天地灵气凝聚而不散。',
    trigger: { month: 8, probability: 0.6 },
    effectType: 'opportunity',
    effect: { spiritDensityMult: 1.10 },
  },
  {
    id: 'CAL_GHOST_FESTIVAL',
    name: '七月鬼节',
    description: '中元鬼门大开，阴气弥漫。妖魔鬼物频繁出没，凶险异常。',
    trigger: { month: 7, probability: 0.9 },
    effectType: 'demon_tide',
    effect: { demonSpawnMult: 2.0, spiritDensityMult: 0.9 },
  },
  {
    id: 'CAL_WINTER_SOLSTICE',
    name: '冬至一阳生',
    description: '冬至日阴极阳生，为闭关悟道之良机。心境澄明，突破有望。',
    trigger: { month: 11, probability: 0.7 },
    effectType: 'spirit_surge',
    effect: { spiritDensityMult: 1.12, breakthroughBonus: 0.08 },
  },
  {
    id: 'CAL_YEAR_END_FESTIVAL',
    name: '腊月辞岁',
    description: '岁末年初，修仙者齐聚城镇，交换消息，采办灵材。',
    trigger: { month: 12, probability: 0.5 },
    effectType: 'festival',
    effect: { spiritDensityMult: 0.95 },
  },
  {
    id: 'CAL_HEAVENLY_TRIBULATION',
    name: '天道量劫',
    description: '百年一次的天道量劫将至，灵气紊乱，天灾频发。',
    trigger: { month: 0, probability: 0.01 }, // 极低概率，任意月
    effectType: 'heavenly_tribulation',
    effect: { spiritDensityMult: 0.7, demonSpawnMult: 3.0 },
  },
];

// ============================================================
// 调度逻辑
// ============================================================

/**
 * 检查某月是否有节气事件触发。
 * 返回触发的第一个事件（同月只取一个）。
 */
export function rollCalendarEvent(
  month: number,
  rng: () => number = Math.random,
): CalendarEventDef | undefined {
  const candidates = CALENDAR_EVENTS.filter(evt => {
    if (evt.trigger.month !== 0 && evt.trigger.month !== month) return false;
    return rng() < evt.trigger.probability;
  });

  // 优先返回非通用事件（month !== 0）
  return candidates.find(e => e.trigger.month !== 0) ?? candidates[0];
}

/** 查询某月的默认节气事件（不考虑概率，用于 UI 预览） */
export function getExpectedCalendarEvent(month: number): CalendarEventDef | undefined {
  return CALENDAR_EVENTS.find(e => e.trigger.month === month);
}

// ============================================================
// 世界大事（§4.10 涌现规则）— 独立于节气，低概率稀有事件
// ============================================================

/** 世界事件定义（天灾 / 异宝出世 / 宗门大比等） */
export interface WorldEventDef {
  id: string;
  name: string;
  description: string;
  /** 每月触发概率（按累计池抽样，同月最多一个） */
  probability: number;
  severity: 'major' | 'epoch';
  visibility: 'regional' | 'world';
  category: EventCategory;
}

/** 世界事件目录（累计约 1.55%/月） */
export const WORLD_EVENTS: WorldEventDef[] = [
  { id: 'WE_CELESTIAL_TREASURE', name: '异宝出世', description: '传闻某地灵光冲天，疑似上古异宝现世，各方修士闻风而动。', probability: 0.004, severity: 'major', visibility: 'regional', category: 'discovery' },
  { id: 'WE_SECRET_REALM', name: '秘境开启', description: '尘封百年的秘境洞天现世，机缘与凶险并存。', probability: 0.003, severity: 'major', visibility: 'regional', category: 'discovery' },
  { id: 'WE_DEMON_TIDE', name: '妖潮来袭', description: '深山妖兽暴动成潮，袭扰城镇，各地修士集结抵御。', probability: 0.003, severity: 'major', visibility: 'regional', category: 'combat' },
  { id: 'WE_SECT_TOURNAMENT', name: '宗门大比', description: '正道宗门广发英雄帖，举办论道大比，胜者可获宗门秘藏。', probability: 0.002, severity: 'major', visibility: 'world', category: 'social' },
  { id: 'WE_NATURAL_DISASTER', name: '天灾临世', description: '地火喷涌、江河倒卷，生灵涂炭，灾后灵脉或有异动。', probability: 0.0015, severity: 'major', visibility: 'regional', category: 'world' },
  { id: 'WE_HEAVEN_FAVOR', name: '灵气复苏', description: '天地灵潮涌动，普天同庆，修炼事半功倍。', probability: 0.002, severity: 'major', visibility: 'world', category: 'world' },
];

/** 每月掷一次世界事件（独立于节气；按概率池抽样，未命中返回 undefined） */
export function rollWorldEvent(rng: () => number = Math.random): WorldEventDef | undefined {
  const total = WORLD_EVENTS.reduce((sum, e) => sum + e.probability, 0);
  const roll = rng();
  if (roll >= total) return undefined;
  let acc = 0;
  for (const e of WORLD_EVENTS) {
    acc += e.probability;
    if (roll < acc) return e;
  }
  return undefined;
}
