// ============================================================
// EventCollector — 引擎统一事件出口（世界涌现叙事设计 §5）
//
// - 所有世界事件经此生成：模板渲染 + 时间戳 + 自增 id + 因果链
// - UI 只导入展示，不手拼事件文本
// - 后续 TimeAdvanceService 聚合：世界事件 + 玩家生命周期事件 + 经济事件
// ============================================================

import type { BigEventLog } from '@taosim/contracts';
import { findTemplate, renderTemplate } from './event-templates.js';

export interface EmitInput {
  /** 模板键（见 event-templates.ts） */
  key: string;
  /** 模板变量（真实实体引用） */
  vars: Record<string, string>;
  involvedCharacterIds: string[];
  /** 真实地点引用 */
  locationId?: string;
  /** 因果链：关联到先前事件 */
  relatedTo?: BigEventLog[];
}

// ── 叙事上下文：为模板变量提供自然语言默认值 ──
const SEASONS = ['初春', '春深', '盛夏', '夏末', '金秋', '深秋', '寒冬', '岁末'];
const WEATHERS_BY_SEASON: Record<number, string[]> = {
  0: ['春风微拂', '细雨绵绵'], 1: ['春暖花开', '莺飞草长'],
  2: ['烈日当空', '蝉鸣聒噪'], 3: ['暑气未消', '秋风将至'],
  4: ['秋高气爽', '枫叶飘零'], 5: ['露冷霜寒', '万木凋零'],
  6: ['朔风凛冽', '大雪纷飞'], 7: ['天寒地冻', '岁暮天寒'],
};
const LEGACIES = ['一身道统', '满室法宝', '毕生心得', '未竟遗愿'];
const STRUGGLES = ['天劫淬体', '心魔考验', '九死一生', '闭关苦修', '一朝顿悟'];
const REACTIONS = ['灵光冲天，震动一方', '方圆百里皆有感应', '天地为之共鸣', '引四方修士侧目'];
const METHODS = ['吐纳灵气', '服丹辅助', '参悟道经', '以战养道'];
const CONSEQUENCES = ['经脉受损', '丹田震荡', '心魔反噬'];
const EMOTIONS = ['心中暗喜', '欣喜若狂', '感慨万分', '淡然一笑'];
const DETAILS = ['内有残存禁制', '丹药法宝尚存', '前人笔记完好', '灵脉已枯'];
const TRAPS = ['触发了上古禁制', '遭遇守护妖兽', '灵阵反噬'];
const LESSONS = ['此番经历，当铭记教训', '日后需谨慎行事', '修仙之路，步步惊心'];
const IMPRESSIONS = ['一见如故', '相谈甚欢', '互相提防', '各怀心思'];
const OUTCOMES = ['不分胜负', '{npcA}略占上风', '{npcB}技高一筹'];
const AFTERMATHS = ['心中暗较劲', '彼此多了几分敬意', '从此多了几分忌惮'];
const CAUSES = ['灵石之争', '面皮之辱', '旧怨未消', '误伤同门'];
const FORECASTS = ['日后恐有更多纠葛', '这仇怨不知何时了结'];
const INSIGHTS = ['悟得玄机', '豁然开朗', '触类旁通'];
const BIRTH_DESCRIPTIONS = ['一声啼哭', '灵光绕体', '天降祥瑞'];
const BLESSINGS = ['天生灵秀', '资质非凡', '根骨初显'];
const CEREMONIES = ['行传承大礼', '以神魂相授', '设道坛传法'];
const QUOTES = ['此子命不该绝', '天意如此', '大难不死必有后福'];

export function defaultEventContext(
  month?: number,
  locationName?: string,
): Record<string, string> {
  const m = (month ?? 1) - 1;  // 1-indexed → 0-indexed
  const seasonIdx = Math.floor((m % 12) / 1.5); // 8 个微季节
  const weathers = WEATHERS_BY_SEASON[seasonIdx] ?? ['天气清朗'];
  return {
    location: locationName ?? '某处',
    weather: weathers[m % weathers.length] ?? '天朗气清',
    season: SEASONS[seasonIdx] ?? '寻常时日',
    emotion: EMOTIONS[m % EMOTIONS.length] ?? '感慨万分',
    legacy: LEGACIES[m % LEGACIES.length] ?? '一身道统',
    struggle: STRUGGLES[m % STRUGGLES.length] ?? '闭关苦修',
    reaction: REACTIONS[m % REACTIONS.length] ?? '震动一方',
    method: METHODS[m % METHODS.length] ?? '吐纳灵气',
    consequence: CONSEQUENCES[m % CONSEQUENCES.length] ?? '经脉受损',
    lifeLoss: '3',
    item: '灵草',
    detail: DETAILS[m % DETAILS.length] ?? '禁制完好',
    trap: TRAPS[m % TRAPS.length] ?? '触发禁制',
    lesson: LESSONS[m % LESSONS.length] ?? '步步惊心',
    impression: IMPRESSIONS[m % IMPRESSIONS.length] ?? '一见如故',
    outcome: OUTCOMES[m % OUTCOMES.length] ?? '不分胜负',
    aftermath: AFTERMATHS[m % AFTERMATHS.length] ?? '心中暗较劲',
    cause: CAUSES[m % CAUSES.length] ?? '灵石之争',
    forecast: FORECASTS[m % FORECASTS.length] ?? '日后恐有纠葛',
    insight: INSIGHTS[m % INSIGHTS.length] ?? '豁然开朗',
    birthDescription: BIRTH_DESCRIPTIONS[m % BIRTH_DESCRIPTIONS.length] ?? '一声啼哭',
    blessing: BLESSINGS[m % BLESSINGS.length] ?? '资质非凡',
    ceremony: CEREMONIES[m % CEREMONIES.length] ?? '行传承大礼',
    quote: QUOTES[m % QUOTES.length] ?? '天意如此',
    how: '情投意合',
    vow: '从此道途相携',
    speech: '不愿宗门随己陪葬',
    charge: '宗门上下拭目以待',
    reason: '技不如人',
    fate: '黯然离去',
    mood: '满怀期待地',
    activity: '品茗论道',
    bond: '交情愈发深厚',
    trigger: '经历了生离死别',
    fromAspiration: '问道',
    toAspiration: '求长生',
    resolution: '从此道心坚定，不再彷徨',
    spouse: '已故道侣',
    remark: '价格公道',
    impact: '恩怨了结',
    potential: '资质平平',
    deed: '一身修为',
    achievement: '一身事迹',
    treasure: '内有丹药法宝无数',
    strategy: '稳扎稳打',
    grievance: '积怨已久',
    declaration: '誓要讨还公道',
    tide: '刀光剑影',
    motive: '见势衰',
    demise: '宗门上下死伤殆尽',
    quality: '根骨上佳',
    feeling: '其乐融融',
    thought: '何惧道阻且长',
    referrer: '人',
    reception: '自此安身',
    contributions: '修为与功绩并重',
    manifesto: '定当振兴宗门',
    reunion: '把酒言欢',
    omen: '天降血雨',
    stones: '若干',
    action: '',
    actionResult: '',
    npcB: '某人',
  };
}

export class EventCollector {
  private counter = 0;

  constructor(
    public year: number,
    public month: number,
  ) {}

  /** 推进后同步世界时间 */
  setTime(year: number, month: number): void {
    this.year = year;
    this.month = month;
  }

  /**
   * 按模板生成并返回一条事件（不自动入池，由调用方决定流向）。
   * 未知模板键直接抛错——模板是唯一文本来源，不允许手拼。
   * 模板中缺失的变量自动从 defaultEventContext 填充。
   */
  emit(input: EmitInput): BigEventLog {
    const tpl = findTemplate(input.key);
    if (!tpl) {
      throw new Error(`未知事件模板: ${input.key}`);
    }
    // 自动填充缺失的上下文变量
    const defaults = defaultEventContext(this.month, input.locationId);
    const varsWithDefaults: Record<string, string> = { ...defaults, ...input.vars };
    const major = tpl.severity === 'major' || tpl.severity === 'epoch';
    this.counter++;
    return {
      id: `EVT_${this.year}_${this.month}_${this.counter}`,
      year: this.year,
      month: this.month,
      isMajorEvent: major,
      category: tpl.category,
      severity: tpl.severity,
      visibility: tpl.visibility,
      source: 'engine',
      title: renderTemplate(tpl.titlePattern, varsWithDefaults),
      description: renderTemplate(tpl.descriptionPattern, varsWithDefaults),
      involvedCharacterIds: input.involvedCharacterIds,
      locationId: input.locationId,
      relatedEventIds: input.relatedTo?.length ? input.relatedTo.map(e => e.id) : undefined,
      templateKey: input.key,
    };
  }
}
