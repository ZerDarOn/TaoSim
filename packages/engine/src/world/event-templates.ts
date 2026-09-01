// ============================================================
// 事件模板库 — 世界涌现叙事设计 §5
//
// 所有事件文本 = 模板 + 真实实体变量（{npc}/{location}/{item}...）。
// UI 只导入展示，不手拼事件文本。AI 只增强 narrative，不改模板事实。
// ============================================================

import type { EventCategory, EventSeverity, EventVisibility } from '@taosim/contracts';
import { WORLD_EVENTS } from '../time/calendar-event-scheduler.js';

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
    descriptionPattern: '{npc} 寿元耗尽，于{location}坐化，{realm}元神出窍，留下{legacy}供后人追寻' },

  // ── 修炼/突破（cultivation）──
  { key: 'breakthrough.major', category: 'cultivation', severity: 'major', visibility: 'regional',
    titlePattern: '{npc} 突破至{realm}！',
    descriptionPattern: '{npc} 于{location}{weather}，历经{struggle}，一举跨入{realm}，{reaction}' },
  { key: 'breakthrough.minor', category: 'cultivation', severity: 'normal', visibility: 'local',
    titlePattern: '{npc} 修为精进，臻至{realm}',
    descriptionPattern: '{npc} 于{location}稳步精进{method}，修为达到{realm}' },
  { key: 'breakthrough.fail', category: 'cultivation', severity: 'normal', visibility: 'local',
    titlePattern: '{npc} 突破{realm}失败',
    descriptionPattern: '{npc} 于{location}冲击{realm}未果，{consequence}，折损寿元{lifeLoss}年' },

  // ── 奇遇（discovery）──
  { key: 'wonder.treasure', category: 'discovery', severity: 'normal', visibility: 'local',
    titlePattern: '{npc} 得遇天材地宝',
    descriptionPattern: '{npc} 于{location}{weather}偶得{item}，修为精进，{emotion}' },
  { key: 'wonder.heritage', category: 'discovery', severity: 'major', visibility: 'regional',
    titlePattern: '{npc} 发现前辈洞府',
    descriptionPattern: '{npc} 于{location}探得一座无主洞府，{detail}，收获丰厚，引四方修士侧目' },
  { key: 'wonder.injury', category: 'discovery', severity: 'normal', visibility: 'local',
    titlePattern: '{npc} 秘境遇险',
    descriptionPattern: '{npc} 于{location}误入凶险秘境，{trap}，重伤而归，寿元受损。{lesson}' },

  // ── 云游（travel）──
  { key: 'travel.wander', category: 'travel', severity: 'minor', visibility: 'local',
    titlePattern: '{npc} 云游四方',
    descriptionPattern: '{npc} 收拾行囊，{mood}离开{location}，踏上云游之路' },

  // ── 社交（social）──
  { key: 'social.meet', category: 'social', severity: 'normal', visibility: 'local',
    titlePattern: '{npcA} 与 {npcB} 于{location}相遇',
    descriptionPattern: '{npcA} 与 {npcB} 于{location}{weather}相遇，{impression}' },
  { key: 'social.dao', category: 'social', severity: 'normal', visibility: 'local',
    titlePattern: '{npcA} 与 {npcB} 论道',
    descriptionPattern: '{npc} 与{npcB}于{location}坐而论道，{insight}，{npc}修为精进' },
  { key: 'social.spar', category: 'social', severity: 'minor', visibility: 'local',
    titlePattern: '{npcA} 与 {npcB} 切磋',
    descriptionPattern: '{npcA} 与 {npcB} 于{location}切磋斗法，{outcome}，{aftermath}' },
  { key: 'social.grudge', category: 'social', severity: 'major', visibility: 'regional',
    titlePattern: '{npcA} 与 {npcB} 结仇',
    descriptionPattern: '{npcA} 与 {npcB} 因{cause}结下仇怨，江湖多了一对死对头，{forecast}' },

  // ── 代际与传承（§4.13 自主性：道侣 / 子嗣 / 道统）──
  { key: 'social.couple', category: 'social', severity: 'major', visibility: 'regional',
    titlePattern: '{npc} 与 {npc2} 结为道侣',
    descriptionPattern: '{npc} 与 {npc2} {how}，于{location}结为道侣，{vow}——修仙界平添一段佳话' },
  { key: 'social.sectAbdicate', category: 'social', severity: 'major', visibility: 'regional',
    titlePattern: '{npc} 传位于 {npc2}，执掌 {sect}',
    descriptionPattern: '{npc} 自觉大限将至，于{sect}大殿传位，{speech}。{npc2}继任宗主，{charge}' },
  { key: 'social.sectUsurp', category: 'social', severity: 'major', visibility: 'regional',
    titlePattern: '{npc} 夺位成功，执掌 {sect}',
    descriptionPattern: '{npc} 于宗内大比力压{npc2}，{method}夺得{sect}宗主之位，{reaction}' },
  { key: 'social.sectUsurpFail', category: 'social', severity: 'major', visibility: 'regional',
    titlePattern: '{npc} 夺位失败，被逐出 {sect}',
    descriptionPattern: '{npc} 挑战{npc2}宗主之位不成，{reason}，颜面扫地，被逐出{sect}，{fate}' },
  { key: 'social.sectUsurpStalemate', category: 'social', severity: 'normal', visibility: 'regional',
    titlePattern: '{npc} 与 {npc2} 争位未决',
    descriptionPattern: '{npc} 于{sect}挑战{npc2}，双方斗法难分高下，宗主之位暂且未变。' },
  { key: 'social.child', category: 'social', severity: 'normal', visibility: 'local',
    titlePattern: '{npc} 与 {npc2} 喜得子嗣 {child}',
    descriptionPattern: '{child} {birthDescription}于{location}，{blessing}。{npc}与{npc2}的衣钵有了传承之人' },
  { key: 'heritage.pass', category: 'social', severity: 'normal', visibility: 'regional',
    titlePattern: '{master} 将一身道统传给 {disciple}',
    descriptionPattern: '{master} 寿元将尽，于{location}将一生道统尽数传给{disciple}，{ceremony}。衣钵相承，薪火不绝' },

  // ── NPC 社交深度：友谊升温 / 关系裂痕 ──
  { key: 'social.friendship.deepen', category: 'social', severity: 'minor', visibility: 'local',
    titlePattern: '{npcA} 与 {npcB} 交情日笃',
    descriptionPattern: '{npcA} 与 {npcB} 于{location}{activity}，相谈甚欢，{bond}' },
  { key: 'social.quarrel', category: 'social', severity: 'minor', visibility: 'local',
    titlePattern: '{npcA} 与 {npcB} 言语不合',
    descriptionPattern: '{npcA} 在{location}与{npcB}{reason}言语不合，不欢而散，{aftermath}' },
  { key: 'social.mentor', category: 'social', severity: 'normal', visibility: 'local',
    titlePattern: '{master} 指点 {disciple} 修行',
    descriptionPattern: '{master} 于{location}悉心指点{disciple}，{teaching}，{disciple}受益匪浅' },

  // ── 志向过渡叙事 ──
  { key: 'aspiration.shift', category: 'cultivation', severity: 'normal', visibility: 'local',
    titlePattern: '{npc} 道心转向',
    descriptionPattern: '{npc}{trigger}，道心为之一变，从此{fromAspiration}转为{toAspiration}。{resolution}' },
  { key: 'aspiration.mourn', category: 'cultivation', severity: 'normal', visibility: 'local',
    titlePattern: '{npc} 心念故人道侣',
    descriptionPattern: '{npc} 于{location}追忆逝去的道侣{spouse}，{emotion}。此去经年，道心深处仍留一缕执念' },

  // ── 坊市流动（economy）──
  { key: 'market.trade', category: 'economy', severity: 'minor', visibility: 'local',
    titlePattern: '{npc} 于坊市购得 {item}',
    descriptionPattern: '{npc} 在{location}坊市花费 {stones} 灵石购得{item}，{remark}。突破材料在市井间流转不息' },

  // ── 寻仇斗法（combat）──
  { key: 'combat.feed.win', category: 'combat', severity: 'normal', visibility: 'local',
    titlePattern: '{winner} 击伤 {loser}',
    descriptionPattern: '{winner} 与 {loser} 于{location}斗法，{detail}。{loser}负伤遁走、折损{years}年寿元，{winner}夺走{loot}灵石' },
  { key: 'combat.feed.lethal', category: 'combat', severity: 'major', visibility: 'world',
    titlePattern: '{loser} 陨落于 {winner} 之手',
    descriptionPattern: '{winner} 与 {loser} 的恩怨于{location}了结。{loser}陨落当场，{impact}，江湖震动' },
  { key: 'combat.feed.stalemate', category: 'combat', severity: 'normal', visibility: 'local',
    titlePattern: '{npcA} 与 {npcB} 激战未决',
    descriptionPattern: '{npcA} 与 {npcB} 真正交手，却在此战中未能分出胜负。' },
  { key: 'combat.ambush', category: 'combat', severity: 'normal', visibility: 'local',
    titlePattern: '{attacker} 偷袭 {defender}',
    descriptionPattern: '{attacker}循着情报于{location}截住{defender}，{detection}。{outcome}' },
  { key: 'combat.ambush.lethal', category: 'combat', severity: 'major', visibility: 'world',
    titlePattern: '{loser} 在伏击中陨落',
    descriptionPattern: '{attacker}追查、准备并于{location}发起偷袭，{detection}。{winner}最终杀死{loser}，这段恩怨成了世界中的新事实' },
  { key: 'combat.ambush.prevented', category: 'combat', severity: 'normal', visibility: 'local',
    titlePattern: '{attacker} 的袭击被守卫制止',
    descriptionPattern: '{attacker}试图在{location}袭击{defender}，但{guards}名在场守卫及时介入，斗法未能发生' },

  // ── 人口/世界（world）──
  { key: 'world.spawn', category: 'world', severity: 'minor', visibility: 'local',
    titlePattern: '散修 {npc} 踏入修仙界',
    descriptionPattern: '{npc} 于{location}步入道途，{potential}，修仙界再添一位求道者' },
  { key: 'faction.veinDegrade', category: 'world', severity: 'major', visibility: 'regional',
    titlePattern: '{faction} 灵脉降级',
    descriptionPattern: '{faction} 灵石耗尽，灵脉降至{level}阶。{impact}，宗门上下人心惶惶' },

  // ── 世界大事 / 成名（world）──
  { key: 'world.tribulation', category: 'world', severity: 'epoch', visibility: 'world',
    titlePattern: '天道量劫降临',
    descriptionPattern: '天地大变，灵气紊乱，天灾四起。{omen}。修仙界迎来大争之世，唯有强者可破劫而生' },
  { key: 'npc.epithet', category: 'world', severity: 'normal', visibility: 'regional',
    titlePattern: '{npc} 名动江湖',
    descriptionPattern: '{npc} 以{deed}声名鹊起，江湖人称「{epithet}」' },
  { key: 'npc.legend', category: 'world', severity: 'normal', visibility: 'world',
    titlePattern: '{npc} 名动天下，世人目之为{tier}',
    descriptionPattern: '{npc} 以{achievement}印证天资，天下修士传颂其名，目之为{tier}' },
  { key: 'npc.escapedDeath', category: 'world', severity: 'major', visibility: 'regional',
    titlePattern: '{npc} 于死劫中绝处逢生',
    descriptionPattern: '{npc} 命悬一线之际，{how}搏出一线生机。世人皆言：{quote}' },

  // ── 遗府（§4.7：坐化后留下的新奇遇源）──
  { key: 'world.heritage', category: 'discovery', severity: 'major', visibility: 'world',
    titlePattern: '{npc} 坐化，遗府现世于{venue}',
    descriptionPattern: '{npc} 于{venue}坐化，遗府灵光冲天，{treasure}。四方修士闻讯而动，一场夺宝之争在所难免' },

  // ── 世界局势（§2.2 世界轨道）──
  { key: 'world.era', category: 'world', severity: 'epoch', visibility: 'world',
    titlePattern: '{era}',
    descriptionPattern: '{desc}' },

  // ── 社会轨道（§2.2：入宗→弟子→长老→宗主）──
  { key: 'social.joinSect', category: 'social', severity: 'minor', visibility: 'regional',
    titlePattern: '{npc} 拜入{sect}门下',
    descriptionPattern: '{npc} {motive}，经{referrer}引荐拜入{sect}，{reception}，踏上宗门修行之路' },
  { key: 'social.promote', category: 'social', severity: 'normal', visibility: 'regional',
    titlePattern: '{npc} 晋升为{sect}{rank}',
    descriptionPattern: '{npc} {contributions}，晋升为{sect}{rank}，{reaction}' },
  { key: 'social.sectSuccession', category: 'social', severity: 'major', visibility: 'world',
    titlePattern: '{npc} 继任{sect}宗主',
    descriptionPattern: '{sect}前任宗主陨落，{npc}临危受命、执掌宗门。{manifesto}，{sect}上下拭目以待' },

  // ── 云游投奔（§4.2）──
  { key: 'travel.visit', category: 'travel', severity: 'normal', visibility: 'local',
    titlePattern: '{npc} 云游归来，拜访 {npc2}',
    descriptionPattern: '{npc} 云游至{location}，登门拜访{npc2}，{reunion}。老友重逢，{mood}' },

  // ── 势力扩张与战争（§2.2 社会/世界轨道）──
  { key: 'faction.expand', category: 'world', severity: 'normal', visibility: 'regional',
    titlePattern: '{faction} 扩张至{node}',
    descriptionPattern: '{faction} 遣弟子开疆拓土，将{node}纳入势力范围。{strategy}' },
  { key: 'faction.warDeclare', category: 'world', severity: 'major', visibility: 'world',
    titlePattern: '{faction} 向 {target} 宣战',
    descriptionPattern: '{faction} 与 {target} {grievance}，于{node}一带兵戈相向，{declaration}，天下震动' },
  { key: 'faction.battle', category: 'combat', severity: 'normal', visibility: 'regional',
    titlePattern: '{attacker} 与 {defender} 交战于{node}',
    descriptionPattern: '{attacker} 与 {defender} 两宗弟子于{node}激战，{tide}，死伤枕藉' },
  { key: 'faction.territoryLost', category: 'world', severity: 'major', visibility: 'regional',
    titlePattern: '{faction} 失守{node}，{target} 攻占',
    descriptionPattern: '{faction} {reason}兵败{node}，{target}趁势攻占，{consequence}' },
  { key: 'faction.defect', category: 'social', severity: 'minor', visibility: 'local',
    titlePattern: '{npc} 脱离{faction}',
    descriptionPattern: '{npc} {motive}，黯然脱离{faction}，{fate}，重归散修之路' },
  { key: 'faction.destroyed', category: 'world', severity: 'major', visibility: 'world',
    titlePattern: '{faction} 覆灭',
    descriptionPattern: '{faction} {demise}，山门崩塌、就此除名。{legacy}，修仙界又少一脉传承' },

  // ── 师徒传承（关系轨道末端）──
  { key: 'social.apprentice', category: 'social', severity: 'minor', visibility: 'local',
    titlePattern: '{master} 收 {disciple} 为徒',
    descriptionPattern: '{master} 于{faction}中相中{disciple}的{quality}，收入门下。{ceremony}，倾囊相授' },
  { key: 'social.graduation', category: 'social', severity: 'normal', visibility: 'local',
    titlePattern: '{npc} 出师，拜别师尊 {master}',
    descriptionPattern: '{npc} {achievement}，正式出师。拜别师尊{master}时{emotion}，自此独立行走江湖' },

  // ── 道侣日常互动 ──
  { key: 'social.couple.daily', category: 'social', severity: 'minor', visibility: 'local',
    titlePattern: '{npcA} 与道侣 {npcB} {activity}',
    descriptionPattern: '{npcA} 与道侣 {npcB} 于{location}{activity}，{feeling}。道途有你，{thought}' },

  // ── C1：NPC Mind 行动事实 ──
  {
    key: 'npc.mind.action',
    category: 'cultivation',
    severity: 'normal',
    visibility: 'regional',
    titlePattern: '{npc} {action}',
    descriptionPattern: '{npc} 于{location}{actionResult}',
  },
  {
    key: 'npc.mind.minor',
    category: 'cultivation',
    severity: 'minor',
    visibility: 'regional',
    titlePattern: '{npc} {action}',
    descriptionPattern: '{npc}{actionResult}',
  },

  // ── 世界事件（§4.10：数据单一来源 = WORLD_EVENTS）──
  ...WORLD_EVENTS.map((w) => ({
    key: w.id,
    category: w.category,
    severity: w.severity,
    visibility: w.visibility,
    titlePattern: w.name,
    descriptionPattern: w.description,
  })),
];

/** 渲染模板：替换 {key} 占位符（缺失变量原样保留，便于排查） */
export function renderTemplate(pattern: string, vars: Record<string, string>): string {
  return pattern.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}

export function findTemplate(key: string): EventTemplate | undefined {
  return EVENT_TEMPLATES.find(t => t.key === key);
}
