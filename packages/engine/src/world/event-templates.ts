// ============================================================
// 事件模板库 — 世界涌现叙事设计 §5
//
// 所有事件文本 = 模板 + 真实实体变量（{npc}/{location}/{item}...）。
// UI 只导入展示，不手拼事件文本。AI 只增强 narrative，不改模板事实。
// ============================================================

import type { EventCategory, EventSeverity, EventVisibility } from '@taosim/contracts';

export interface EventTemplate {
  /** 唯一模板键（category.key 约定） */
  key: string;
  category: EventCategory;
  severity: EventSeverity;
  visibility: EventVisibility;
  titlePattern: string;
  descriptionPattern: string;
}

export const EVENT_TEMPLATES: EventTemplate[] = [
  // ── 生死（world）──
  { key: 'death.natural', category: 'world', severity: 'normal', visibility: 'local',
    titlePattern: '{npc} 坐化',
    descriptionPattern: '{npc} 寿元耗尽，元神出窍，留下一段修行往事' },

  // ── 修炼/突破（cultivation）──
  { key: 'breakthrough.major', category: 'cultivation', severity: 'major', visibility: 'regional',
    titlePattern: '{npc} 突破至{realm}！',
    descriptionPattern: '{npc} 历经磨难，一举跨入{realm}，震动一方' },
  { key: 'breakthrough.minor', category: 'cultivation', severity: 'normal', visibility: 'local',
    titlePattern: '{npc} 修为精进，臻至{realm}',
    descriptionPattern: '{npc} 稳步精进，修为达到{realm}' },
  { key: 'breakthrough.fail', category: 'cultivation', severity: 'minor', visibility: 'local',
    titlePattern: '{npc} 突破失败',
    descriptionPattern: '{npc} 冲击{realm}未果，重伤折损寿元' },

  // ── 奇遇（discovery）──
  { key: 'wonder.treasure', category: 'discovery', severity: 'normal', visibility: 'local',
    titlePattern: '{npc} 得遇天材地宝',
    descriptionPattern: '{npc} 偶得灵药，修为精进' },
  { key: 'wonder.heritage', category: 'discovery', severity: 'major', visibility: 'regional',
    titlePattern: '{npc} 发现前辈洞府',
    descriptionPattern: '{npc} 探得无主洞府，收获丰厚' },
  { key: 'wonder.injury', category: 'discovery', severity: 'minor', visibility: 'local',
    titlePattern: '{npc} 秘境遇险',
    descriptionPattern: '{npc} 误入凶险秘境，重伤而归，寿元受损' },

  // ── 云游（travel）──
  { key: 'travel.wander', category: 'travel', severity: 'minor', visibility: 'local',
    titlePattern: '{npc} 云游四方',
    descriptionPattern: '{npc} 收拾行囊，踏上云游之路' },

  // ── 社交（social）──
  { key: 'social.meet', category: 'social', severity: 'minor', visibility: 'local',
    titlePattern: '{npcA} 与 {npcB} 相识',
    descriptionPattern: '{npcA} 与 {npcB} 于江湖相遇，一见如故' },
  { key: 'social.dao', category: 'social', severity: 'normal', visibility: 'local',
    titlePattern: '{npcA} 与 {npcB} 论道',
    descriptionPattern: '{npc} 在论道中悟得玄机，修为精进' },
  { key: 'social.spar', category: 'social', severity: 'minor', visibility: 'local',
    titlePattern: '{npcA} 与 {npcB} 切磋',
    descriptionPattern: '{npcA} 与 {npcB} 切磋斗法，不分胜负，心中暗较劲' },
  { key: 'social.grudge', category: 'social', severity: 'major', visibility: 'regional',
    titlePattern: '{npcA} 与 {npcB} 结仇',
    descriptionPattern: '{npcA} 与 {npcB} 因故结下仇怨，江湖多了一对死对头' },

  // ── 坊市流动（economy §4.6：灵石交易 / 突破材料流转）──
  { key: 'market.trade', category: 'economy', severity: 'normal', visibility: 'local',
    titlePattern: '{npc} 于坊市购得 {item}',
    descriptionPattern: '{npc} 在坊市花费 {stones} 灵石购得 {item}，突破材料在市井间流转不息' },

  // ── 寻仇斗法（combat）──
  { key: 'combat.feed.win', category: 'combat', severity: 'normal', visibility: 'local',
    titlePattern: '{winner} 击伤 {loser}',
    descriptionPattern: '{winner} 与 {loser} 斗法一场，{loser} 负伤遁走，折损 {years} 年寿元' },
  { key: 'combat.feed.lethal', category: 'combat', severity: 'major', visibility: 'world',
    titlePattern: '{loser} 陨落于 {winner} 之手',
    descriptionPattern: '{winner} 与 {loser} 的恩怨了结，{loser} 陨落当场，江湖震动' },

  // ── 人口/世界（world）──
  { key: 'world.spawn', category: 'world', severity: 'minor', visibility: 'local',
    titlePattern: '散修 {npc} 出世',
    descriptionPattern: '{npc} 踏入修仙之路' },
  { key: 'faction.veinDegrade', category: 'world', severity: 'major', visibility: 'regional',
    titlePattern: '{faction} 灵脉降级',
    descriptionPattern: '{faction} 灵石耗尽，灵脉降至 {level} 阶' },

  // ── 世界大事 / 成名（world）──
  { key: 'world.tribulation', category: 'world', severity: 'epoch', visibility: 'world',
    titlePattern: '天道量劫降临',
    descriptionPattern: '天地大变，灵气紊乱，天灾四起，修仙界迎来大争之世' },
  { key: 'npc.epithet', category: 'world', severity: 'normal', visibility: 'regional',
    titlePattern: '{npc} 名动江湖',
    descriptionPattern: '{npc} 声名鹊起，江湖人称「{epithet}」' },
];

/** 渲染模板：替换 {key} 占位符（缺失变量原样保留，便于排查） */
export function renderTemplate(pattern: string, vars: Record<string, string>): string {
  return pattern.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}

export function findTemplate(key: string): EventTemplate | undefined {
  return EVENT_TEMPLATES.find(t => t.key === key);
}
