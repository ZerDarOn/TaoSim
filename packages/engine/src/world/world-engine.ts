import type { WorldState, BigEventLog, NpcRecord, Faction, WorldEra, HeritageSite, DestinyTier, BornOrigin, SpiritRoot, SpiritRootGrade, GraveMarker } from '@taosim/contracts';
import { parseRealm } from '@taosim/contracts';
import { EconomyEngine } from '../economy/economy-engine.js';
import { NPCGenerator } from '../interaction/npc-generator.js';
import { VENUE_CATALOG, getVenue, getVenuesByNode } from '../overworld/map-catalog.js';
import { PRESET_MAP, getNeighbors } from '../overworld/preset-map.js';
import { generateWorldGrid } from '../overworld/hex-overworld-engine.js';
import { deriveNpcHexPos, npcHexPos, npcSpatialIndex } from '../overworld/npc-spatial.js';
import { generateInitialMind, tickNpcMind } from './npc-mind.js';
import { applyAscension, initializePopulationGrid, tickPopulation } from './population.js';
import { createSeededRng } from '../battle/seeded-rng.js';
import { createInitialFactions } from './sect-presets.js';
import { characterToNpcRecord, realmTier } from './npc-record-mapper.js';
import { resolvePersonalityId } from '../data/npc-personalities.js';
import { EventCollector } from './event-collector.js';
import type { EmitInput } from './event-collector.js';
import { projectTime, elapsedFromYearMonth, MINUTES_PER_MONTH } from '../time/world-clock.js';
import { rollWorldEvent } from '../time/calendar-event-scheduler.js';
import type { Rng } from './world-tick-rules.js';
import {
  cultivateNpc,
  realmDisplay,
  tryBreakthrough,
  tryWander,
  tryWonder,
} from './world-tick-rules.js';
import { samplePairs, sectPowerDuel, socialEncounter, tryFeud, tryJealousy, rootGradeWeight } from './world-social-rules.js';
import {
  chooseBehavior,
  evolveAspiration,
  hasHeritageDisciple,
  motivationPressuresOf,
  rollInitialAspiration,
} from './world-motivation.js';

export interface MonthlyTickResult {
  updatedState: WorldState;
  events: BigEventLog[];
  npcPopulationChanged: boolean;
}

/** 引擎事件流归档上限：保留最近条数 + 全部 major/epoch 大事 */
export const EVENT_LOG_MAX = 2000;

/** 死亡 NPC 从档案中除名（转 Oblivion）的宽限期（年） */
export const OBLIVION_GRACE_YEARS = 10;

/** 成名正反馈阈值：major/epoch 事件达到此数授予江湖绰号（§7.3） */
export const EPITHET_MAJOR_THRESHOLD = 3;

/** 量劫纪元间隔（月）：倒计时归零触发世界级事件后重置 */
export const TRIBULATION_INTERVAL_MONTHS = 600;

/** 坊市流动（§4.6）：坊市场所 NPC 月度参与灵石交易的概率 */
export const MARKET_TRADE_PROBABILITY = 0.4;

/** 动机寻仇触发概率（行为槽 §4.13：深仇者主动出手，高于被动配对 0.1） */
export const REVENGE_DUEL_CHANCE = 0.25;

/** 逍遥/扬名者主动云游概率（行为槽：常年在路上，远高于被动偶遇 0.02） */
export const WANDER_ACTIVE_CHANCE = 0.35;

/** 求道卡关/求寿者主动访缘加成（行为槽：寻觅机缘次数 ×3，高于被动偶遇） */
export const SEEKER_WONDER_BOOST = 3;

/** 道侣生育间隔（年）：修仙子嗣金贵，防逐年生育刷屏 */
export const CHILD_COOLDOWN_YEARS = 8;

/** 道侣每月生育概率（修仙以传承替代繁殖：少量、低频、重血脉） */
export const CHILD_CHANCE_PER_MONTH = 0.02;

/** 求偶接受基础概率（面板因果：魅力高者更易结缘） */
export const COURTSHIP_BASE_CHANCE = 0.25;

/** 道统收徒概率（行为槽：寿元将尽者觅徒传衣钵） */
export const HERITAGE_TEACH_CHANCE = 0.15;

/** 夺位出手概率（权力斗争：野心长老非见异思迁，蓄势良久方一搏；一旦出手即真斗法） */
export const USURP_CHANCE = 0.15;

/** 让贤：寿元>85% 的宗主每月萌生退意的基准概率（压力越大越笃定） */
export const ABDICATE_BASE_CHANCE = 0.2;

/** 坊市流通的突破材料（叙事实体，与玩家突破材料同源同名） */
const MARKET_MATERIALS = ['聚气丹', '凝神花', '妖丹', '玄铁精', '灵植种子', '筑基丹'] as const;

/** 江湖绰号池（成名正反馈授予，注入 rng 保证同种子同绰号） */
const EPITHET_POOL = ['云中仙', '焚天剑客', '孤月真人', '雷霆上人', '玄龟散人', '红尘客', '碧落仙君', '青莲剑仙'];

/** 世界局势跃迁阈值（§2.2 世界轨道：乱世指数 → 和平/乱世/大争/量劫） */
export const ERA_TURMOIL_THRESHOLDS = { turbulent: 30, warring: 60, cataclysm: 85 } as const;

/** 世界局势阶段名称/描述（模板 world.era 变量） */
const ERA_NAMES: Record<WorldEra, string> = {
  peace: '太平盛世',
  turbulent: '乱世初显',
  warring: '大争之世',
  cataclysm: '量劫将至',
};
const ERA_DESC: Record<WorldEra, string> = {
  peace: '四海升平，修士各安其道',
  turbulent: '局势渐紧，纷争四起，修士人心浮动',
  warring: '群雄并起，战火连绵，大争之世',
  cataclysm: '天地大变，灵气紊乱，量劫将至',
};

/**
 * 从 NpcRecord 构造墓碑投影（用于存档 graveyard 字段）。
 * GraveMarker 是查询投影——权威数据源在 archivedNpcs。
 */
function toGraveMarker(record: NpcRecord): GraveMarker {
  const realmType = parseRealm(record.realm).realmType ?? 'LianQi';
  return {
    characterId: record.id,
    name: record.name,
    deathAge: Math.floor(record.lifespan.age),
    deathYear: record.deathYear ?? 0,
    causeOfDeath: record.causeOfDeath ?? 'unknown',
    realmAtDeath: realmType,
    relationHooks: Object.entries(record.relations).map(([targetId, entry]) => ({
      targetId,
      relationType: entry.type,
    })),
  };
}

/** 散修拜入宗门概率（身处宗门驻地或出身宗门，§2.2 社会轨道） */
export const JOIN_SECT_CHANCE = 0.04;

/** 灾害/动荡类世界事件推高乱世指数（§2.2 世界轨道）；单次 +5，靠积累而非速爆（N2） */
export const TURMOIL_EVENT_DELTA = 5;

/** 高境界（金丹+）死亡推高乱世指数（遗府登记时同步；+1 累积而非暴增，防量劫早爆 N2） */
export const TURMOIL_HIGHREALM_DEATH_DELTA = 1;

// ── 区域灵气浓度（生态与地形因果 §4.9：灵气浓郁之地修炼更快）──
export const SPIRIT_QI_MIN = 5;
export const SPIRIT_QI_MAX = 100;

/** 灵气浓度 → 修炼倍率：灵气 0 → 0.6，灵气 100 → 1.6（灵气浓郁之地修炼更快） */
export function spiritQiMultiplier(qi: number): number {
  return 0.6 + qi / 100;
}

/** 初始灵气浓度（按节点 tier 折算：tier1=25 … tier5=85；无 tier 节点取 40） */
export function createInitialNodeSpiritQi(): Record<string, number> {
  const qi: Record<string, number> = {};
  for (const node of Object.values(PRESET_MAP.continents[0]?.nodes ?? {})) {
    qi[node.id] = Math.min(SPIRIT_QI_MAX, Math.max(SPIRIT_QI_MIN, node.tier * 15 + 10));
  }
  return qi;
}

/** 事迹认定层级权重（果：tier 由 major 事迹累计升级，认定线见 LEGEND_TIER_THRESHOLDS） */
const TIER_RANK: Record<DestinyTier, number> = { legendary: 3, prodigy: 2, talented: 1, common: 0 };

/** 事迹认定（果）阈值：major 事件累计到线，世界方以英才/天骄/传奇记之——"先做到，后成名" */
export const LEGEND_TIER_THRESHOLDS = { talented: 2, prodigy: 5, legendary: 9 } as const;

/** 认定层级中文名（npc.legend 模板变量） */
const TIER_NAMES: Record<DestinyTier, string> = {
  common: '', talented: '英才', prodigy: '天骄', legendary: '传奇',
};

/** 乱世指数 → 世界局势阶段（§2.2 世界轨道：和平→乱世→大争→量劫） */
export function eraFromTurmoil(turmoil: number): WorldEra {
  if (turmoil >= ERA_TURMOIL_THRESHOLDS.cataclysm) return 'cataclysm';
  if (turmoil >= ERA_TURMOIL_THRESHOLDS.warring) return 'warring';
  if (turmoil >= ERA_TURMOIL_THRESHOLDS.turbulent) return 'turbulent';
  return 'peace';
}

/** 宗门驻地最高节点 tier（灵脉产出计算依据，§2.2 经济轨道） */
function factionNodeTier(faction: Faction): number {
  let max = 1;
  for (const nodeId of faction.territories) {
    const node = PRESET_MAP.continents[0]?.nodes[nodeId];
    if (node && node.tier > max) max = node.tier;
  }
  return max;
}

/**
 * 事件流归档策略：超限时保留最近 max 条，并把更早的 major/epoch 大事
 * 一并保留（编年史/传闻的数据基础不被滚动裁剪掉）。
 * 输入须为按时间正序（旧→新）的数组。
 */
export function trimEventLog(log: BigEventLog[], max = EVENT_LOG_MAX): BigEventLog[] {
  if (log.length <= max) return log;
  const tail = log.slice(-max);
  const preserved = log
    .slice(0, -max)
    .filter((e) => e.severity === 'major' || e.severity === 'epoch');
  return [...preserved, ...tail];
}

/**
 * 世界引擎 — 驱动月度 Tick（无 AI 涌现叙事）。
 * 负责：NPC 月度更新（寿元/修炼/突破/奇遇/云游）、社交相遇与寻仇（关系轨道）、
 *       人口补充、宗门维护、大事件生成。
 *
 * 持久化（世界涌现叙事设计 §3.3/§5/§9）：
 * - 状态只存精简 NpcRecord（this.state.npcs）+ 全量事件流（this.state.eventLog）
 * - 构造时从 state 恢复，推进后写回，getState() 带出 → 跨推进/跨会话连续
 * - 所有事件经 EventCollector 出口（模板渲染 + 时间戳 + 自增 id）
 */
export class WorldEngine {
  private state: WorldState;
  private npcCounter = 0;
  private factions: Map<string, Faction> = new Map();
  private rng: Rng;
  /** 因果链（§2.4）：每 NPC 最近一条事件，新事件 relatedTo 指向前者 */
  private lastEventByNpc = new Map<string, BigEventLog>();
  /** 成名正反馈（§7.3）：每 NPC major/epoch 事件计数 */
  private majorCountByNpc = new Map<string, number>();
  /** 世界内已用名字（百家姓取名去重：同一世界不重名；除名时归还，代际可复用） */
  private usedNames = new Set<string>();

  constructor(
    initialState: WorldState,
    options: { rng?: Rng; factions?: Record<string, Faction> } = {},
  ) {
    this.state = {
      ...initialState,
      npcs: { ...(initialState.npcs ?? {}) },
      eventLog: [...(initialState.eventLog ?? [])],
      factions: { ...(initialState.factions ?? options.factions ?? createInitialFactions()) },
      // 世界局势/遗府/灵气：可选字段兜底默认值（兼容旧存档）
      worldEra: initialState.worldEra ?? 'peace',
      worldTurmoil: initialState.worldTurmoil ?? 0,
      heritageSites: { ...(initialState.heritageSites ?? {}) },
      nodeSpiritQi: { ...(initialState.nodeSpiritQi ?? createInitialNodeSpiritQi()) },
    };
    this.rng = options.rng ?? Math.random;
    this.factions = new Map(Object.entries(this.state.factions ?? {}));
    // 从现存 NPC id（NPC_<year>_<month>_<n>）恢复自增计数器，避免跨会话 id 冲突
    let maxCounter = 0;
    for (const id of Object.keys(this.state.npcs)) {
      const m = /^NPC_\d+_\d+_(\d+)$/.exec(id);
      if (m) maxCounter = Math.max(maxCounter, Number(m[1]));
    }
    this.npcCounter = maxCounter;
    // 名字去重恢复：从现存 NPC 重建已用名集合（跨会话保持世界内不重名）
    for (const npc of Object.values(this.state.npcs)) {
      this.usedNames.add(npc.name);
    }
    // 因果链 + 成名正反馈恢复：从事件流重建每 NPC 最近事件与 major 计数（正序，后者覆盖）
    for (const e of this.state.eventLog) {
      if (e.isMajorEvent) {
        for (const id of e.involvedCharacterIds) {
          this.majorCountByNpc.set(id, (this.majorCountByNpc.get(id) ?? 0) + 1);
        }
      }
      for (const id of e.involvedCharacterIds) {
        this.lastEventByNpc.set(id, e);
      }
    }
  }

  /** 推进一个月，返回更新后的状态与事件列表 */
  public step(): MonthlyTickResult {
    return this.stepInternal(false);
  }

  /** 内部推进逻辑；skipStateCopy=true 时跳过末尾深拷贝（快进优化） */
  private stepInternal(skipStateCopy: boolean): MonthlyTickResult {
    this.advanceCalendar();

    // 区域灵气潮汐（生态与地形因果 §4.9：春生夏长、秋收冬藏 — 确定性，零 rng 消耗）
    this.applySeasonQiShift();

    // 云游回归：上月云游（locationId 清空）的 NPC 本月重新落脚，
    // 避免 '__wander__' 分组随云游积累而无限膨胀（真实节点系统接入前的临时策略）
    for (const npc of Object.values(this.state.npcs)) {
      if (npc.soulState !== 'Active' || npc.locationId !== undefined) continue;
      npc.locationId = this.pickVenueId();
    }

    // 空间与氛围层（NPC 地图呈现 §spec 3.2）：
    // hexPos 维护（独立 rng，与主事件序列解耦）
    this.maintainNpcPositions();

    const collector = new EventCollector(this.state.currentYear, this.state.currentMonth);
    const events: BigEventLog[] = [];

    // 天道量劫降临（§4.10 世界事件）：倒计时归零 → epoch 事件 + 开启新纪元
    if (this.state.catastropheCountdownMonths === 0) {
      events.push(
        collector.emit({ key: 'world.tribulation', vars: {}, involvedCharacterIds: [] }),
      );
      this.state.catastropheCountdownMonths = TRIBULATION_INTERVAL_MONTHS;
    }

    // 世界事件（§4.10）：独立于节气，月度稀有事件 → 驱动世界局势（§2.2 世界轨道）
    const worldEvent = rollWorldEvent(this.rng);
    if (worldEvent) {
      events.push(collector.emit({ key: worldEvent.id, vars: {}, involvedCharacterIds: [] }));
      // 灾害/动荡类事件推高乱世指数；灵气复苏则平抑
      if (worldEvent.category === 'combat' || worldEvent.id === 'WE_NATURAL_DISASTER') {
        this.state.worldTurmoil = Math.min(100, (this.state.worldTurmoil ?? 0) + TURMOIL_EVENT_DELTA);
        // 天灾/兵祸：灵气最盛之地受冲击（确定性选点，零 rng）
        this.dampenRichestQiNode();
      } else if (worldEvent.id === 'WE_HEAVEN_FAVOR') {
        this.state.worldTurmoil = Math.max(0, (this.state.worldTurmoil ?? 0) - 8);
        // 灵气复苏：全图灵气回升
        this.reviveAllQi();
      }
    }
    // 乱世指数缓降（世界自身恢复力）
    this.state.worldTurmoil = Math.max(0, (this.state.worldTurmoil ?? 0) - 1);
    // 世界局势状态机跃迁（§2.2：和平→乱世→大争→量劫）
    const nextEra = eraFromTurmoil(this.state.worldTurmoil);
    if (nextEra !== this.state.worldEra) {
      this.state.worldEra = nextEra;
      events.push(
        collector.emit({
          key: 'world.era',
          vars: { era: ERA_NAMES[nextEra], desc: ERA_DESC[nextEra] },
          involvedCharacterIds: [],
        }),
      );
    }

    let npcPopulationChanged = false;

    // 事件出口（§2.4 因果链 + §7.3 成名正反馈）：串起同一 NPC 的连续经历
    const pushNpcEvent = (input: Omit<EmitInput, 'relatedTo'>, npcIds: string[]): BigEventLog => {
      const related = npcIds
        .map(id => this.lastEventByNpc.get(id))
        .find((e): e is BigEventLog => e !== undefined);
      const event = collector.emit({ ...input, relatedTo: related ? [related] : undefined });
      events.push(event);
      for (const id of npcIds) {
        // 因果链（§2.4）：minor 例行事件不打断故事线（涌现缺口 N1：流水账不污染叙事链）
        if (event.severity !== 'minor') {
          this.lastEventByNpc.set(id, event);
        }
        if (event.isMajorEvent) {
          const npc = this.state.npcs[id];
          if (!npc) continue;
          const count = (this.majorCountByNpc.get(id) ?? 0) + 1;
          this.majorCountByNpc.set(id, count);
          // 事迹认定（果）：天骄/传奇是"做到之后"被世界记下的标签，不是出生给定的。
          // 认定线：英才 ≥2 件 major → 天骄 ≥5 → 传奇 ≥9（先做到，后成名；升级产出 npc.legend）
          const nextTier: DestinyTier =
            count >= LEGEND_TIER_THRESHOLDS.legendary
              ? 'legendary'
              : count >= LEGEND_TIER_THRESHOLDS.prodigy
                ? 'prodigy'
                : count >= LEGEND_TIER_THRESHOLDS.talented
                  ? 'talented'
                  : 'common';
          if (TIER_RANK[nextTier] > TIER_RANK[npc.destiny.tier]) {
            npc.destiny.tier = nextTier;
            events.push(
              collector.emit({
                key: 'npc.legend',
                vars: { npc: npc.name, tier: TIER_NAMES[nextTier] },
                involvedCharacterIds: [id],
                locationId: npc.locationId,
              }),
            );
          }
          if (!npc.destiny.epithet && count >= EPITHET_MAJOR_THRESHOLD) {
            const epithet = EPITHET_POOL[Math.floor(this.rng() * EPITHET_POOL.length)]!;
            npc.destiny.epithet = epithet;
            events.push(
              collector.emit({
                key: 'npc.epithet',
                vars: { npc: npc.name, epithet },
                involvedCharacterIds: [id],
                locationId: npc.locationId,
              }),
            );
          }
        }
      }
      return event;
    };

    // 1. NPC 月度推进（寿元 / 修炼 / 突破 / 奇遇 / 云游）— 无 AI 涌现规则集 §4
    for (const [id, npc] of Object.entries(this.state.npcs)) {
      if (npc.soulState !== 'Active') continue;
      npc.lifespan.age += 1 / 12;
      npc.lastUpdate = { year: this.state.currentYear, month: this.state.currentMonth };

      // 寿元耗尽 → 坐化（按境界分流：金丹及以上留一念，低阶魂散为残魂）
      if (npc.lifespan.age >= npc.lifespan.maxLifespan) {
        // 死劫豁免（涌现缺口 N3，修仙人情化）：命格者寿元将尽时于死关搏得一线生机（顿悟延寿）
        if (this.escapeDeath(npc)) {
          npc.lifespan.age -= 10;
          pushNpcEvent(
            { key: 'npc.escapedDeath', vars: { npc: npc.name }, involvedCharacterIds: [id], locationId: npc.locationId },
            [id],
          );
          continue;
        }
        const tier = realmTier(npc.realm);
        npc.soulState = tier >= 3 ? 'PrimordialSoul' : 'RemnantSoul';
        npc.deathYear = this.state.currentYear;
        npc.deathMonth = this.state.currentMonth;
        npc.causeOfDeath = '寿元耗尽';
        npcPopulationChanged = true;
        if (tier >= 3) {
          // §4.7 坐化升级：金丹及以上坐化为 major 叙事 + 必留遗府（死亡→新机缘 物质循环闭环）
          this.registerHeritage(npc);
          pushNpcEvent(
            {
              key: 'world.heritage',
              vars: { npc: npc.name, venue: this.venueNameOf(npc.locationId) },
              involvedCharacterIds: [id],
              locationId: npc.locationId,
            },
            [id],
          );
        } else {
          pushNpcEvent(
            { key: 'death.natural', vars: { npc: npc.name }, involvedCharacterIds: [id], locationId: npc.locationId },
            [id],
          );
        }
        continue;
      }

      // 自主性（§4.13 需求状态机）：志向缺省则按心性补掷；经历塑形（寿元/仇恨/姻缘/传承）。
      // 志向演化零 rng（纯状态决定），初掷仅一次；行为选择零 rng（缺口压力决定）——
      // NPC 行为由"缺口"驱动，不再是对所有人机械掷骰。
      npc.aspiration = npc.aspiration
        ? evolveAspiration(npc)
        : rollInitialAspiration(npc, this.rng);
      const behavior = chooseBehavior(npc);

      // 修炼增长（灵气浓度 × 师徒传承 × 行为槽：闭关苦修用功加倍；道侣双修相携相助）
      const coupleBonus =
        npc.spouseId && this.state.npcs[npc.spouseId]?.soulState === 'Active' ? 1.15 : 1;
      cultivateNpc(npc, {
        qi: this.spiritQiMultOf(npc.locationId),
        apprentice: this.isUndergraduateDisciple(npc) ? 1.5 : 1,
        focus: (behavior.type === 'seclude' ? 1.5 : 1) * coupleBonus,
      });

      // 突破判定
      const breakthrough = tryBreakthrough(npc, this.rng);
      if (breakthrough.attempted) {
        if (breakthrough.succeeded) {
          const major = breakthrough.major;
          pushNpcEvent(
            {
              key: major ? 'breakthrough.major' : 'breakthrough.minor',
              vars: { npc: npc.name, realm: realmDisplay(npc.realm) },
              involvedCharacterIds: [id],
              locationId: npc.locationId,
            },
            [id],
          );
        } else {
          pushNpcEvent(
            {
              key: 'breakthrough.fail',
              vars: { npc: npc.name, realm: realmDisplay(breakthrough.nextRealm ?? npc.realm) },
              involvedCharacterIds: [id],
              locationId: npc.locationId,
            },
            [id],
          );
        }
      }

      // 出师：弟子修为达金丹（tier≥3）→ 出师独立（保留师徒关系，里程碑留档）
      if (npc.socialRank === 'disciple' && realmTier(npc.realm) >= 3) {
        const masterEntry = Object.entries(npc.relations).find(
          ([, rel]) => rel.type === 'master-disciple' && rel.direction === 'disciple',
        );
        if (masterEntry && !npc.biography.milestones.some((m) => m.title === '出师')) {
          npc.biography.milestones.push({
            eventId: `EVT_${this.state.currentYear}_${this.state.currentMonth}`,
            year: this.state.currentYear,
            month: this.state.currentMonth,
            title: '出师',
            realm: npc.realm,
          });
          const master = this.state.npcs[masterEntry[0]];
          pushNpcEvent(
            {
              key: 'social.graduation',
              vars: { npc: npc.name, master: master?.name ?? '师尊' },
              involvedCharacterIds: [npc.id, masterEntry[0]],
              locationId: npc.locationId,
            },
            [npc.id],
          );
        }
      }

      // 奇遇判定（行为槽 §4.13：求道卡关/求寿者主动访缘，寻觅机缘次数 ×3；其余被动偶遇）
      const wonder = tryWonder(npc, this.rng, behavior.type === 'seekWonder' ? SEEKER_WONDER_BOOST : 1);
      if (wonder.triggered) {
        const wonderKeys: Record<string, string> = {
          treasure: 'wonder.treasure',
          heritage: 'wonder.heritage',
          injury: 'wonder.injury',
        };
        // §2.2 轨道咬合：天材地宝 → 灵石入账（奇遇 ↔ 经济轨道）
        if (wonder.type === 'treasure') {
          const stonesGain = Math.floor(100 + npc.destiny.luck * 5);
          npc.spiritStones = (npc.spiritStones ?? 0) + stonesGain;
        }
        pushNpcEvent(
          {
            key: wonderKeys[wonder.type] ?? 'wonder.treasure',
            vars: { npc: npc.name },
            involvedCharacterIds: [id],
            locationId: npc.locationId,
          },
          [id],
        );
      }

      // 云游判定（§4.2 目的地优先投奔关系；逍遥/扬名者主动云游，常年在路上）
      if (tryWander(npc, this.rng, behavior.type === 'wander' ? WANDER_ACTIVE_CHANCE : 0.02)) {
        const friendEntry = Object.entries(npc.relations).find(
          ([, rel]) =>
            rel.bond >= 30 &&
            (rel.type === 'friend' || rel.type === 'benefactor' || rel.type === 'master-disciple'),
        );
        const friend = friendEntry ? this.state.npcs[friendEntry[0]] : undefined;
        if (friend && friend.soulState === 'Active' && this.rng() < 0.5) {
          // 投奔故人：落脚于好友所在处（关系轨道 → 空间轨道咬合）
          npc.locationId = friend.locationId;
          pushNpcEvent(
            {
              key: 'travel.visit',
              vars: { npc: npc.name, npc2: friend.name },
              involvedCharacterIds: [id, friend.id],
              locationId: npc.locationId,
            },
            [id, friend.id],
          );
        } else {
          pushNpcEvent(
            { key: 'travel.wander', vars: { npc: npc.name }, involvedCharacterIds: [id], locationId: npc.locationId },
            [id],
          );
        }
      }

      // P4：NPC Mind 月度调度——更新需求/目标/下一步行动
      const mindNow = { year: this.state.currentYear, month: this.state.currentMonth };
      if (!npc.mind) {
        npc.mind = generateInitialMind(npc);
      }
      const mindResult = tickNpcMind(npc, npc.mind, mindNow);
      npc.mind = mindResult.mind;
      // TODO：mind 产出行动描述后接入事实/事件流（P7+）
    }

    // 2. 社交相遇 + 寻仇（同地点/云游配对，关系轨道 §4.3/§4.4 — 阶段 1b）
    const now = { year: this.state.currentYear, month: this.state.currentMonth };

    // 寻仇斗法统一出口（配对偶遇与动机寻仇共用）：真实斗法结算 + 事件 + 伤亡/遗府/乱世指数副作用
    // chance：被动配对 0.1；动机驱动（深仇主动出手）可抬高（行为槽 §4.13）
    const handleFeud = (a: NpcRecord, b: NpcRecord, chance = 0.1): void => {
      const feud = tryFeud(a, b, now, this.rng, (n) => this.escapeDeath(n), chance);
      if (!feud) return;
      const winnerName = feud.attackerWins ? a.name : b.name;
      const loserName = feud.attackerWins ? b.name : a.name;
      pushNpcEvent(
        {
          key: feud.templateKey,
          vars: {
            winner: winnerName,
            loser: loserName,
            years: String(feud.injuryYears),
            loot: String(feud.lootStones),
          },
          involvedCharacterIds: [a.id, b.id],
          locationId: a.locationId ?? b.locationId,
        },
        [a.id, b.id],
      );
      if (feud.lethal) {
        npcPopulationChanged = true;
        // 仇杀陨落 → 世界伤亡累积（§2.2 世界轨道）
        this.state.worldTurmoil = Math.min(100, (this.state.worldTurmoil ?? 0) + 2);
        // 遗府闭环（涌现缺口 N4）：高境界（金丹+）仇杀陨落亦留遗府（死亡→新机缘 物质循环）
        const loserNpc = feud.attackerWins ? b : a;
        if (realmTier(loserNpc.realm) >= 3) this.registerHeritage(loserNpc);
      }
    };

    const groups = new Map<string, NpcRecord[]>();
    for (const npc of Object.values(this.state.npcs)) {
      if (npc.soulState !== 'Active') continue;
      const key = npc.locationId ?? '__wander__';
      const list = groups.get(key) ?? [];
      list.push(npc);
      groups.set(key, list);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const pairs = samplePairs(list, this.rng, Math.max(1, Math.floor(list.length / 20)));
      for (const [a, b] of pairs) {
        // 防御：配对后若任一方已陨落（本步内致死），跳过社交/寻仇
        if (a.soulState !== 'Active' || b.soulState !== 'Active') continue;
        const encounter = socialEncounter(a, b, now, this.rng);
        if (encounter) {
          const vars = { npcA: a.name, npcB: b.name, npc: encounter.focalName ?? a.name };
          pushNpcEvent(
            {
              key: encounter.templateKey,
              vars,
              involvedCharacterIds: [a.id, b.id],
              locationId: a.locationId ?? b.locationId,
            },
            [a.id, b.id],
          );
        }
        handleFeud(a, b);
      }
    }

    // 动机寻仇（§4.13 行为槽：深仇者主动出手——实力足以一战才出手，否则苦修蓄势）
    for (const [id, npc] of Object.entries(this.state.npcs)) {
      if (npc.soulState !== 'Active' || npc.aspiration !== 'seekRevenge') continue;
      if (motivationPressuresOf(npc).grudge <= 0) continue;
      const enemy = this.strongestEnemy(npc);
      if (!enemy) {
        // 仇人已陨/仇怨已淡 → 执念放下，转求道（经历塑形）
        npc.aspiration = 'seekDao';
        continue;
      }
      if (!this.canAffordChallenge(npc, enemy)) continue; // 实力未足 → 本月苦修蓄势
      handleFeud(npc, enemy, REVENGE_DUEL_CHANCE); // 深仇主动出手：触发概率高于被动配对
    }

    // 2a. 代际与传承（§4.13 自主性 + 代际链：求缘→道侣→双修→子嗣；寿元将尽→传道统）
    // 求偶（孤独驱动）：seekPartner 且无在世道侣/非守丧 → 寻觅道侣；结为道侣后转求道
    const takenThisMonth = new Set<string>();
    for (const [id, npc] of Object.entries(this.state.npcs)) {
      if (npc.soulState !== 'Active' || npc.aspiration !== 'seekPartner') continue;
      if (takenThisMonth.has(id) || this.isCommitted(npc)) continue;
      const candidate = this.findMateCandidate(npc, takenThisMonth);
      if (!candidate) continue;
      if (this.rng() >= this.courtshipAcceptChance(npc, candidate)) continue;
      this.formCouple(npc, candidate, now, pushNpcEvent);
      takenThisMonth.add(id);
      takenThisMonth.add(candidate.id);
    }
    // 子嗣（代际更替）：已成道侣且双方在世 → 生育（8 年冷却；由 id 较小者掷骰，避免同月双生）
    for (const [id, npc] of Object.entries(this.state.npcs)) {
      if (npc.soulState !== 'Active' || !npc.spouseId) continue;
      const spouse = this.state.npcs[npc.spouseId];
      if (!spouse || spouse.soulState !== 'Active' || id >= spouse.id) continue;
      const lastChild = npc.childbearing?.lastChildYear;
      if (lastChild !== undefined && this.state.currentYear - lastChild < CHILD_COOLDOWN_YEARS) continue;
      if (this.rng() >= CHILD_CHANCE_PER_MONTH) continue;
      const child = this.spawnChild(npc, spouse);
      this.state.npcs[child.id] = child;
      npcPopulationChanged = true;
      npc.childbearing = { lastChildYear: this.state.currentYear };
      spouse.childbearing = { lastChildYear: this.state.currentYear };
      pushNpcEvent(
        {
          key: 'social.child',
          vars: {
            npc: npc.name,
            npc2: spouse.name,
            child: child.name,
            location: this.venueNameOf(child.locationId),
          },
          involvedCharacterIds: [npc.id, spouse.id, child.id],
          locationId: child.locationId,
        },
        [npc.id, spouse.id],
      );
    }
    // 道统传承（传承压力）：寿元将尽者收徒传衣钵，跨世代（师祖→师→徒）
    for (const [id, npc] of Object.entries(this.state.npcs)) {
      if (npc.soulState !== 'Active' || npc.aspiration !== 'seekSuccessor') continue;
      if (hasHeritageDisciple(npc)) {
        npc.aspiration = 'seekDao'; // 已有传人 → 了却心愿，转求道
        continue;
      }
      const disciple = this.findHeritageDisciple(npc);
      if (disciple && this.rng() < HERITAGE_TEACH_CHANCE) {
        this.passHeritage(npc, disciple, now, pushNpcEvent);
      }
    }

    // 2b. 坊市流动（§4.6：灵石交易 / 突破材料流转 — 与玩家经济同一套数据）
    // 收入：境界俸禄水龙头（realmMonthlyIncome，与玩家一致）；交易：仅坊市场所参与，概率采购
    for (const [id, npc] of Object.entries(this.state.npcs)) {
      if (npc.soulState !== 'Active') continue;
      const stones = (npc.spiritStones ?? 0) + EconomyEngine.realmMonthlyIncome(npc.realm);
      if (!npc.locationId) continue;
      const venue = VENUE_CATALOG.find((v) => v.id === npc.locationId);
      if (!venue || venue.type !== 'shop') {
        npc.spiritStones = stones;
        continue;
      }
      if (this.rng() >= MARKET_TRADE_PROBABILITY) {
        npc.spiritStones = stones;
        continue;
      }
      const item = MARKET_MATERIALS[Math.floor(this.rng() * MARKET_MATERIALS.length)]!;
      const spend = Math.min(EconomyEngine.realmMonthlyIncome(npc.realm) * 2, stones);
      if (spend <= 0) {
        npc.spiritStones = stones;
        continue;
      }
      npc.spiritStones = stones - spend;
      pushNpcEvent(
        { key: 'market.trade', vars: { npc: npc.name, item, stones: String(spend) }, involvedCharacterIds: [id], locationId: npc.locationId },
        [id],
      );
    }

    // 2c. 社会轨道（§2.2：入宗→弟子→长老→宗主 — 宗门人才吸纳/晋升/继任）
    for (const faction of this.factions.values()) {
      // 已覆灭宗门不参与社会轨道演化
      if (faction.status === 'destroyed') continue;
      // 宗主继任：掌门陨落 → 修为最高者临危受命
      const leader = faction.leaderId ? this.state.npcs[faction.leaderId] : undefined;
      if (!leader || leader.soulState !== 'Active') {
        const successor = faction.members
          .map((id) => this.state.npcs[id])
          .filter(
            (n): n is NpcRecord => n !== undefined && n.soulState === 'Active' && n.socialRank === 'elder',
          )
          .sort(
            (a, b) => realmTier(b.realm) - realmTier(a.realm) || b.cultivation.currentExp - a.cultivation.currentExp,
          )[0];
        if (successor) {
          faction.leaderId = successor.id;
          successor.socialRank = 'sectMaster';
          pushNpcEvent(
            {
              key: 'social.sectSuccession',
              vars: { npc: successor.name, sect: faction.name },
              involvedCharacterIds: [successor.id],
              locationId: successor.locationId,
            },
            [successor.id],
          );
        }
      }

      // 主动让贤（权力斗争 §2.2）：寿元将尽的宗主体面交班——非死亡驱动的继任
      if (leader && leader.soulState === 'Active' && this.isAbdicatingLeader(leader)) {
        const successor = faction.members
          .map((id) => this.state.npcs[id])
          .filter(
            (n): n is NpcRecord => n !== undefined && n.soulState === 'Active' && n.socialRank === 'elder',
          )
          .sort(
            (a, b) => realmTier(b.realm) - realmTier(a.realm) || b.cultivation.currentExp - a.cultivation.currentExp,
          )[0];
        if (successor && successor.id !== leader.id) {
          faction.leaderId = successor.id;
          successor.socialRank = 'sectMaster';
          leader.socialRank = 'elder';
          pushNpcEvent(
            {
              key: 'social.sectAbdicate',
              vars: { npc: leader.name, npc2: successor.name, sect: faction.name },
              involvedCharacterIds: [leader.id, successor.id],
              locationId: leader.locationId,
            },
            [leader.id, successor.id],
          );
        }
      }

      // 入宗：散修身处宗门驻地或出身宗门 → 拜入门下（弟子）
      // 拜师潮流（势力扩张与战争）：兴盛宗门（灵脉高/地盘广）吸引更多散修 — 马太效应
      const prosperity =
        1 + (faction.spiritVeinLevel - 1) * 0.5 + Math.max(0, faction.territories.length - 1) * 0.25;
      const joinChance = JOIN_SECT_CHANCE * prosperity;
      for (const npc of Object.values(this.state.npcs)) {
        if (npc.soulState !== 'Active' || npc.factionId) continue;
        const venue = npc.locationId ? getVenue(npc.locationId) : undefined;
        const atTerritory = venue !== undefined && faction.territories.includes(venue.nodeId);
        if ((atTerritory || npc.origin.type === '宗门') && this.rng() < joinChance) {
          npc.factionId = faction.id;
          npc.socialRank = 'disciple';
          faction.members.push(npc.id);
          pushNpcEvent(
            {
              key: 'social.joinSect',
              vars: { npc: npc.name, sect: faction.name },
              involvedCharacterIds: [npc.id],
              locationId: npc.locationId,
            },
            [npc.id],
          );
        }
      }

      // 晋升：弟子 修为达金丹（tier≥3）→ 长老
      for (const memberId of [...faction.members]) {
        const npc = this.state.npcs[memberId];
        if (!npc || npc.soulState !== 'Active' || npc.socialRank !== 'disciple') continue;
        if (realmTier(npc.realm) >= 3 && this.rng() < 0.5) {
          npc.socialRank = 'elder';
          pushNpcEvent(
            {
              key: 'social.promote',
              vars: { npc: npc.name, sect: faction.name, rank: '长老' },
              involvedCharacterIds: [npc.id],
              locationId: npc.locationId,
            },
            [npc.id],
          );
        }
      }

      // 夺位（权力斗争 §2.2）：野心长老（seekFame）修为超越宗主 → 赌一把
      // 真实斗法（面板定胜负，非机制钦定）：胜者执掌宗门，败者降为长老；夺位失败者被逐出宗门
      const currentLeader = faction.leaderId ? this.state.npcs[faction.leaderId] : undefined;
      if (currentLeader && currentLeader.soulState === 'Active') {
        for (const memberId of [...faction.members]) {
          const challenger = this.state.npcs[memberId];
          if (!challenger || challenger.soulState !== 'Active') continue;
          if (challenger.id === currentLeader.id || challenger.socialRank === 'sectMaster') continue;
          if (challenger.aspiration !== 'seekFame') continue; // 无心者不妄动
          if (realmTier(challenger.realm) < realmTier(currentLeader.realm)) continue; // 实力不足不找死
          if (this.rng() >= USURP_CHANCE) continue; // 蓄势良久，方一搏
          // 真实斗法（面板定胜负，非机制钦定）：一旦出手即真刀真枪，无临阵退缩
          const duel = sectPowerDuel(challenger, currentLeader, this.rng);
          if (duel.attackerWins) {
            // 夺位成功：新宗主继位，败者降为长老（性命仍在，宗门仍认其人）
            faction.leaderId = challenger.id;
            challenger.socialRank = 'sectMaster';
            currentLeader.socialRank = 'elder';
            pushNpcEvent(
              {
                key: 'social.sectUsurp',
                vars: { npc: challenger.name, npc2: currentLeader.name, sect: faction.name },
                involvedCharacterIds: [challenger.id, currentLeader.id],
                locationId: challenger.locationId,
              },
              [challenger.id, currentLeader.id],
            );
          } else {
            // 夺位失败：颜面扫地，被逐出宗门（流放）
            challenger.factionId = undefined;
            challenger.socialRank = undefined;
            faction.members = faction.members.filter((id) => id !== challenger.id);
            pushNpcEvent(
              {
                key: 'social.sectUsurpFail',
                vars: { npc: challenger.name, npc2: currentLeader.name, sect: faction.name },
                involvedCharacterIds: [challenger.id, currentLeader.id],
                locationId: challenger.locationId,
              },
              [challenger.id],
            );
          }
          // duel undefined：斗法未成（被劝和/另有变故）→ 本月作罢
        }
      }

      // 师徒传承（关系轨道末端）：长老/掌门收同门潜质弟子为徒（每师至多 3 徒）
      for (const memberId of [...faction.members]) {
        const master = this.state.npcs[memberId];
        if (!master || master.soulState !== 'Active') continue;
        if (master.socialRank !== 'elder' && master.socialRank !== 'sectMaster') continue;
        const discipleCount = Object.values(master.relations).filter(
          (rel) => rel.type === 'master-disciple' && rel.direction === 'disciple',
        ).length;
        if (discipleCount >= 3) continue;
        const candidates = faction.members
          .map((id) => this.state.npcs[id])
          .filter(
            (n): n is NpcRecord =>
              n !== undefined &&
              n.soulState === 'Active' &&
              n.socialRank === 'disciple' &&
              n.id !== master.id &&
              !Object.values(n.relations).some(
                (rel) => rel.type === 'master-disciple' && rel.direction === 'disciple',
              ),
          )
          .sort(
            (a, b) =>
              realmTier(b.realm) - realmTier(a.realm) || b.attributes.comprehension - a.attributes.comprehension,
          );
        const disciple = candidates[0];
        if (disciple && this.rng() < 0.05) {
          master.relations[disciple.id] = {
            type: 'master-disciple',
            bond: 40,
            trust: 40,
            events: ['收徒授业'],
            changedAt: now,
            direction: 'master',
          };
          disciple.relations[master.id] = {
            type: 'master-disciple',
            bond: 40,
            trust: 40,
            events: ['拜入师门'],
            changedAt: now,
            direction: 'disciple',
          };
          pushNpcEvent(
            {
              key: 'social.apprentice',
              vars: { master: master.name, disciple: disciple.name, faction: faction.name },
              involvedCharacterIds: [master.id, disciple.id],
              locationId: master.locationId ?? disciple.locationId,
            },
            [master.id, disciple.id],
          );
        }
      }
    }

    // 2d. 势力回合（势力扩张与战争：宗门地盘扩张 / 宣战 / 战争结算 / 灭门 / 叛逃）
    // ── 宗门军事力量：灵脉加成 + 在世成员境界之和 ──
    const factionPower = (f: Faction): number => {
      let power = f.spiritVeinLevel * 5;
      for (const memberId of f.members) {
        const m = this.state.npcs[memberId];
        if (m && m.soulState === 'Active') power += realmTier(m.realm);
      }
      return power;
    };
    const nodeNameOf = (nodeId: string): string =>
      PRESET_MAP.continents[0]?.nodes[nodeId]?.name ?? nodeId;
    /** 该节点当前归属（无人/已覆灭宗门占位视为无主） */
    const occupiedBy = (nodeId: string): Faction | undefined => {
      for (const f of this.factions.values()) {
        if (f.status === 'destroyed') continue;
        if (f.territories.includes(nodeId)) return f;
      }
      return undefined;
    };

    for (const faction of this.factions.values()) {
      if (faction.status === 'destroyed') continue;

      // 灭门：在世成员全灭 → 宗门覆灭，乱世指数骤升（§2.2 世界轨道咬合）
      const activeMembers = faction.members.filter(
        (id) => this.state.npcs[id]?.soulState === 'Active',
      );
      if (activeMembers.length === 0) {
        faction.status = 'destroyed';
        this.state.worldTurmoil = Math.min(100, (this.state.worldTurmoil ?? 0) + 4);
        events.push(
          collector.emit({
            key: 'faction.destroyed',
            vars: { faction: faction.name },
            involvedCharacterIds: [],
          }),
        );
        continue;
      }

      // 叛逃：宗门衰弱（金库枯竭或灵脉 1 阶）→ 弟子流失（马太效应：弱宗留不住人）
      if (faction.treasurySpiritStones < 1000 || faction.spiritVeinLevel <= 1) {
        for (const memberId of [...faction.members]) {
          const m = this.state.npcs[memberId];
          if (!m || m.soulState !== 'Active' || m.socialRank === 'sectMaster' || m.socialRank === 'elder') continue;
          if (this.rng() < 0.02) {
            m.factionId = undefined;
            m.socialRank = undefined;
            faction.members = faction.members.filter((id) => id !== memberId);
            pushNpcEvent(
              {
                key: 'faction.defect',
                vars: { npc: m.name, faction: faction.name },
                involvedCharacterIds: [memberId],
                locationId: m.locationId,
              },
              [memberId],
            );
          }
        }
      }

      // 扩张：向邻接节点开拓（概率 = expansionism；无主之地直接占领，他宗地盘 → 可能宣战）
      if (faction.members.length > 0 && this.rng() < faction.aiPolicy.expansionism) {
        const neighbors = new Set<string>();
        for (const t of faction.territories) {
          for (const n of getNeighbors(t)) neighbors.add(n);
        }
        const border = [...neighbors].filter((n) => !faction.territories.includes(n));
        const unclaimed = border.filter((n) => occupiedBy(n) === undefined);
        if (unclaimed.length > 0) {
          const target = unclaimed[Math.floor(this.rng() * unclaimed.length)]!;
          const cost = 500 * (PRESET_MAP.continents[0]?.nodes[target]?.tier ?? 1);
          if (faction.treasurySpiritStones >= cost) {
            faction.treasurySpiritStones -= cost;
            faction.territories.push(target);
            // 开山立派 → 新地盘灵气回升（生态与地形因果）
            if (this.state.nodeSpiritQi && this.state.nodeSpiritQi[target] !== undefined) {
              this.state.nodeSpiritQi[target] = Math.min(SPIRIT_QI_MAX, this.state.nodeSpiritQi[target] + 3);
            }
            events.push(
              collector.emit({
                key: 'faction.expand',
                vars: { faction: faction.name, node: nodeNameOf(target) },
                involvedCharacterIds: [],
              }),
            );
          }
        } else if (this.rng() < faction.aiPolicy.aggression) {
          // 邻接皆为他宗地盘且好斗 → 宣战（无邻接边界则跳过）
          const disputed = border.filter((n) => occupiedBy(n) !== undefined);
          const targetNode = disputed[Math.floor(this.rng() * disputed.length)];
          if (targetNode === undefined) continue;
          const targetFaction = occupiedBy(targetNode)!;
          if (targetFaction !== faction && faction.diplomacy[targetFaction.id] !== 'War') {
            faction.diplomacy[targetFaction.id] = 'War';
            targetFaction.diplomacy[faction.id] = 'War';
            this.state.worldTurmoil = Math.min(100, (this.state.worldTurmoil ?? 0) + 2);
            events.push(
              collector.emit({
                key: 'faction.warDeclare',
                vars: { faction: faction.name, target: targetFaction.name, node: nodeNameOf(targetNode) },
                involvedCharacterIds: [],
              }),
            );
          }
        }
      }
    }

    // 战争结算：处于 War 的宗门对（去重，只结算一次）按力量对比分胜负
    const warPairs: [Faction, Faction][] = [];
    for (const f of this.factions.values()) {
      if (f.status === 'destroyed') continue;
      for (const [otherId, rel] of Object.entries(f.diplomacy)) {
        const other = this.factions.get(otherId);
        if (!other || other.status === 'destroyed') continue;
        if (rel === 'War' && f.id < other.id) warPairs.push([f, other]);
      }
    }
    for (const [a, b] of warPairs) {
      if (a.status === 'destroyed' || b.status === 'destroyed') continue;
      const pa = factionPower(a);
      const pb = factionPower(b);
      if (pa + pb <= 0) continue;
      const aWins = this.rng() < pa / (pa + pb);
      const winner = aWins ? a : b;
      const loser = aWins ? b : a;

      // 战场取双方交界节点（无交界则取 loser 任一头衔地）
      const loserBorders = loser.territories.filter((t) =>
        winner.territories.some((wt) => getNeighbors(wt).includes(t)),
      );
      const contested = loserBorders.length > 0 ? loserBorders : loser.territories;
      const lostNode = contested[Math.floor(this.rng() * contested.length)];
      if (lostNode) {
        loser.territories = loser.territories.filter((t) => t !== lostNode);
        winner.territories.push(lostNode);
        events.push(
          collector.emit({
            key: 'faction.battle',
            vars: { attacker: winner.name, defender: loser.name, node: nodeNameOf(lostNode) },
            involvedCharacterIds: [],
          }),
        );
        events.push(
          collector.emit({
            key: 'faction.territoryLost',
            vars: { faction: loser.name, node: nodeNameOf(lostNode), target: winner.name },
            involvedCharacterIds: [],
          }),
        );
      }

      // 战利灵石：胜方夺败方部分库存
      const loot = Math.min(loser.treasurySpiritStones, Math.floor(loser.treasurySpiritStones * 0.2) + 200);
      loser.treasurySpiritStones -= loot;
      winner.treasurySpiritStones += loot;

      // 伤亡：双方低阶弟子战死（掌门不参战陨落）
      for (const side of [loser, winner]) {
        const casualties = [...side.members].filter((id) => {
          const m = this.state.npcs[id];
          return (
            m !== undefined &&
            m.soulState === 'Active' &&
            m.socialRank !== 'sectMaster' &&
            // 伤亡率随境界递减：炼气弟子最易战死，金丹+ 长老已非杂兵
            this.rng() < this.casualtyChanceOf(m)
          );
        });
        for (const id of casualties) {
          const m = this.state.npcs[id]!;
          // 死劫豁免（涌现缺口 N3）：命格者于乱军之中搏得一线生机
          if (this.escapeDeath(m)) {
            pushNpcEvent(
              { key: 'npc.escapedDeath', vars: { npc: m.name }, involvedCharacterIds: [id], locationId: m.locationId },
              [id],
            );
            continue;
          }
          m.soulState = 'RemnantSoul';
          m.causeOfDeath = '宗门之战陨落';
          m.deathYear = this.state.currentYear;
          m.deathMonth = this.state.currentMonth;
          npcPopulationChanged = true;
          // 遗府闭环（涌现缺口 N4）：高境界战死亦留遗府（死亡→新机缘 物质循环）
          if (realmTier(m.realm) >= 3) this.registerHeritage(m);
        }
        side.members = side.members.filter((id) => !casualties.includes(id));
      }

      // 战争加剧乱世（§2.2 世界轨道咬合）
      this.state.worldTurmoil = Math.min(100, (this.state.worldTurmoil ?? 0) + 1);
    }

    // 3. 清理已湮灭的 NPC（死亡超过宽限期 → 转 Oblivion 后除名）
    const toRemove: string[] = [];
    for (const [id, npc] of Object.entries(this.state.npcs)) {
      if (npc.soulState === 'Oblivion') {
        toRemove.push(id);
        continue;
      }
      if (npc.soulState !== 'Active' && npc.deathYear !== undefined && npc.deathMonth !== undefined) {
        const died = (npc.deathYear - 1) * 12 + npc.deathMonth;
        const nowM = (this.state.currentYear - 1) * 12 + this.state.currentMonth;
        if (nowM - died >= OBLIVION_GRACE_YEARS * 12) {
          npc.soulState = 'Oblivion'; // 记忆彻底消散（生命周期末端）
          toRemove.push(id);
        }
      }
    }
    if (toRemove.length > 0) {
      for (const id of toRemove) {
        const gone = this.state.npcs[id];
        // 名字归还天下（记忆消散，后人可再取此名——代际复用，避免名字库枯竭）
        if (gone) this.usedNames.delete(gone.name);
        // 实体退出活动世界，但人物历史不能被删除——迁入 archivedNpcs
        this.archiveNpc(id);
        this.lastEventByNpc.delete(id);
        this.majorCountByNpc.delete(id);
      }
      npcPopulationChanged = true;
    }
    // 同步宗门成员表：仅保留在世成员（死者除名，避免悬空引用）
    for (const faction of this.factions.values()) {
      faction.members = faction.members.filter((memberId) => {
        const m = this.state.npcs[memberId];
        return m !== undefined && m.soulState === 'Active';
      });
    }

    // 4. NPC 人口补充（低于 800 则生成散修，复用 NPCGenerator 的真实数据模型）
    if (Object.keys(this.state.npcs).length < 800) {
      const count = Math.min(10, 800 - Object.keys(this.state.npcs).length);
      for (let i = 0; i < count; i++) {
        const npc = this.spawnWildCultivator();
        this.state.npcs[npc.id] = npc;
        npcPopulationChanged = true;
        // 普通修士入世只是人口事实，不占用玩家的事件流。
        // 仅特殊先天、变异灵根或天灵根会伴随值得关注的异象。
        const hasNotableBirth =
          npc.destiny.born !== 'mortal'
          || npc.spiritRoot.isVariant
          || npc.spiritRoot.grade === 'Heaven';
        if (hasNotableBirth) {
          events.push(
            collector.emit({ key: 'world.spawn', vars: { npc: npc.name }, involvedCharacterIds: [npc.id] }),
          );
        }
      }
    }

    // 5. 宗门月度维护（§2.2 经济轨道：灵脉产出 水龙头 − 维护成本；枯竭则降级灵脉）
    for (const [, faction] of this.factions) {
      if (faction.status === 'destroyed') continue;
      faction.treasurySpiritStones += EconomyEngine.calculateSpiritStoneIncome(
        factionNodeTier(faction),
        faction.spiritVeinLevel,
      );
      const maintenance = EconomyEngine.spiritVeinMaintenanceCost(faction.spiritVeinLevel);
      faction.treasurySpiritStones -= maintenance;
      if (faction.treasurySpiritStones < 0) {
        faction.treasurySpiritStones = 0;
        // 灵石枯竭降级灵脉
        if (faction.spiritVeinLevel > 1) {
          faction.spiritVeinLevel--;
          // 灵脉枯竭降级 → 驻地灵气 −5（生态与地形因果：地脉衰败）
          const home = faction.territories[0];
          if (home && this.state.nodeSpiritQi) {
            this.state.nodeSpiritQi[home] = Math.max(
              SPIRIT_QI_MIN,
              (this.state.nodeSpiritQi[home] ?? 40) - 5,
            );
          }
          events.push(
            collector.emit({
              key: 'faction.veinDegrade',
              vars: { faction: faction.name, level: String(faction.spiritVeinLevel) },
              involvedCharacterIds: [],
            }),
          );
        }
      }
    }

    // 事件流持久化（编年史/传闻的数据基础）+ 归档裁剪（避免无上限增长）
    // 分层（涌现缺口 N1）：minor 例行事件只进实时流（result.events，沉浸视角细节），
    // 不进全量 eventLog（上帝视角编年史只留 normal+ 叙事）
    const chronicleEvents = events.filter((e) => e.severity !== 'minor');
    this.state.eventLog = trimEventLog([...this.state.eventLog, ...chronicleEvents]);

    // 氛围层（§spec 3.1）：人口增长 + 凡人升格（独立 rng；放末尾——
    // 升格 NPC 下月才参与 NPC 循环，避免干扰本月主 rng 序列）
    this.tickAtmosphere();

    // 嫉妒追捧（§spec 3.3.2）：同格高资质者招致嫉妒/敬仰（独立 rng，空间局部化 §spec 3.5）
    this.tickJealousy();

    // 快进模式跳过深拷贝——调用方通过 fastForward 在循环结束后统一 getState()
    const updatedState = skipStateCopy ? this.state : this.getState();
    return { updatedState, events, npcPopulationChanged };
  }

  /**
   * 快速推进 N 个月（闭关/快进），返回摘要。
   *
   * P1 增强：
   * - elapsedMinutes 由 advanceCalendar 自动维护
   * - 支持 options.shouldContinue 回调实现可中断快进
   */
  public fastForward(
    months: number,
    options?: { shouldContinue?: () => boolean },
  ): { events: BigEventLog[]; progress: number; interrupted?: boolean } {
    const events: BigEventLog[] = [];
    let completedMonths = 0;

    for (let i = 0; i < months; i++) {
      // 可中断检查
      if (options?.shouldContinue && !options.shouldContinue()) {
        break;
      }
      const result = this.stepInternal(true);
      events.push(...result.events);
      completedMonths++;
    }

    const interrupted = completedMonths < months;
    const progress = completedMonths / months;
    return { events, progress, interrupted: interrupted || undefined };
  }

  /**
   * 将 NPC 从活动字典迁入历史档案。
   * 实体可以退出活动世界，但人物历史不能被删除（架构规范 §4.3）。
   */
  private archiveNpc(id: string): void {
    const record = this.state.npcs[id];
    if (!record) return;

    // 迁入历史档案
    if (!this.state.archivedNpcs) this.state.archivedNpcs = {};
    this.state.archivedNpcs[id] = record;

    // 从活动字典移除
    delete this.state.npcs[id];
  }

  /** 获取全部墓碑投影（从 archivedNpcs 生成；GraveMarker 是非权威查询投影） */
  public getGraveyard(): GraveMarker[] {
    const archived = this.state.archivedNpcs ?? {};
    return Object.values(archived).map(toGraveMarker);
  }

  public getState(): WorldState {
    return {
      ...this.state,
      npcs: { ...this.state.npcs },
      archivedNpcs: this.state.archivedNpcs ? { ...this.state.archivedNpcs } : undefined,
      eventLog: [...this.state.eventLog],
      factions: this.state.factions ? { ...this.state.factions } : undefined,
      heritageSites: this.state.heritageSites ? { ...this.state.heritageSites } : undefined,
      nodeSpiritQi: this.state.nodeSpiritQi ? { ...this.state.nodeSpiritQi } : undefined,
    };
  }

  private advanceCalendar(): void {
    // P1：先从旧年月初始化 elapsedMinutes（如果还没有），再加一个月
    if (this.state.elapsedMinutes === undefined) {
      this.state.elapsedMinutes = elapsedFromYearMonth(this.state.currentYear, this.state.currentMonth);
    }
    this.state.elapsedMinutes += MINUTES_PER_MONTH;

    this.state.currentMonth++;
    if (this.state.currentMonth > 12) {
      this.state.currentMonth = 1;
      this.state.currentYear++;
    }
    if (this.state.catastropheCountdownMonths > 0) {
      this.state.catastropheCountdownMonths--;
    }
  }

  /**
   * P1：设置权威绝对时间，并同步年/月投影。
   * WorldClockService 在跨月推进后调用此方法写回 elapsedMinutes。
   */
  public setElapsedMinutes(minutes: number): void {
    this.state.elapsedMinutes = minutes;
    // 同步年月投影
    const t = projectTime(minutes);
    this.state.currentYear = t.year;
    this.state.currentMonth = t.month;
  }

  /** 生成一个散修 NPC 并归档为 NpcRecord（境界分布：炼气为主、少量筑基/金丹；rng 可注入） */
  private spawnWildCultivator(rng: Rng = this.rng): NpcRecord {
    this.npcCounter++;
    const id = `NPC_${this.state.currentYear}_${this.state.currentMonth}_${this.npcCounter}`;
    const tierRoll = rng();
    const tier = tierRoll < 0.75 ? 1 : tierRoll < 0.95 ? 2 : 3;
    const seed = Math.floor(rng() * 1_000_000);
    const character = NPCGenerator.generate(tier, seed);
    // 世界内名字去重（百家姓 × 性别名库共 5120 组合）：重名则换种子重取名，最多重试 32 次
    let name = character.name;
    let nameGuard = 0;
    while (this.usedNames.has(name) && nameGuard < 32) {
      nameGuard++;
      name = NPCGenerator.generateName(seed + nameGuard * 7919, character.gender);
    }
    this.usedNames.add(name);

    const record = characterToNpcRecord(
      { ...character, id, name },
      this.state.currentYear,
      this.state.currentMonth,
    );
    // 真实地点引用：落脚于预设场所（社交配对按地点分组的数据基础）
    record.locationId = this.pickVenueId(rng);

    // 先天出身（因）：塑造出生起点（面板/初始条件），之后世界演化完全由面板与经历驱动，
    // 不提供任何机制概率加成。1% 气运之子、0.5% 大能转世、2.5% 逆天传承，其余平凡。
    const bornRoll = rng();
    let born: BornOrigin = 'mortal';
    if (bornRoll < 0.01) born = 'fortune';
    else if (bornRoll < 0.015) born = 'reincarnated';
    else if (bornRoll < 0.04) born = 'inherited';
    // tier（果）出生一律 common：天骄/传奇只能由之后做到的事迹认定
    record.destiny = { tier: 'common', born, luck: record.attributes.luck, hidden: born !== 'mortal' };
    // 出身面板因果：气运之子改运（luck 拔高 → 奇遇/突破/死劫面板加权）；
    // 大能转世天资聪颖（悟性 +6 → 修炼更快）；逆天传承开局身家（灵石 +500）。
    // 只调"起点"，不碰任何概率机制——之后的世界演化完全看面板与世界经历。
    if (born === 'fortune') record.destiny.luck = Math.min(95, record.attributes.luck + 60);
    if (born === 'reincarnated') record.attributes.comprehension = Math.min(40, record.attributes.comprehension + 6);
    if (born === 'inherited') record.spiritStones = (record.spiritStones ?? 0) + 500;
    // 自主性（§4.13）：出生即有心性塑造的志向（旧档案缺省则由月度循环补掷）
    record.aspiration = rollInitialAspiration(record, rng);
    // 空间与亲和（NPC 地图呈现 §spec 3.2/3.3.1）：出生即定 hexPos 与兼容性种子
    record.hexPos = npcHexPos(record.locationId, this.gridOf()) ?? undefined;
    record.moveState = 'resident';
    record.affinityMatrixSeed = rng();
    return record;
  }

  // ============================================================
  // 空间与氛围层（NPC 地图呈现 §spec 3.1/3.2：独立 rng，不干扰主事件序列）
  // ============================================================

  /** hex 网格缓存（当前仅东荒大陆有 PRESET_MAP 地标；多大陆接入后按大陆分片） */
  private gridCache = new Map<string, ReturnType<typeof generateWorldGrid>>();

  private gridOf(): ReturnType<typeof generateWorldGrid> {
    const id = 'CONT_EAST';
    let g = this.gridCache.get(id);
    if (!g) {
      g = generateWorldGrid(id);
      this.gridCache.set(id, g);
    }
    return g;
  }

  /** 月度 hexPos 维护：所有 Active NPC 锚定场所格 / 向游历目标漂移（§spec 3.2.2） */
  private maintainNpcPositions(): void {
    const grid = this.gridOf();
    // 独立 rng：移动目标生成与主事件序列解耦（防既有测试的 rng 注入偏移）
    const moveRng = createSeededRng(this.state.currentYear * 977 + this.state.currentMonth * 31 + 13);
    for (const npc of Object.values(this.state.npcs)) {
      if (npc.soulState !== 'Active') continue;
      if (npc.moveState === 'secluded') {
        // 闭关：不动，剩余月数递减，出关转 resident
        npc.secludeMonths = (npc.secludeMonths ?? 12) - 1;
        if (npc.secludeMonths <= 0) {
          npc.moveState = 'resident';
          npc.secludeMonths = undefined;
        }
        if (!npc.hexPos) {
          npc.hexPos = npcHexPos(npc.locationId, grid) ?? { q: 10, r: 10 };
        }
        continue;
      }
      const result = deriveNpcHexPos(npc.hexPos, npc.locationId, npc.moveTarget, grid);
      npc.hexPos = result.hexPos;
      npc.moveState = result.moveState;
      if (result.reached) npc.moveTarget = undefined;
      // 无场所云游中且无目标：给一个方向感目标（2-4 格外）
      if (npc.locationId === undefined && npc.moveState === 'wandering' && !npc.moveTarget) {
        npc.moveTarget = {
          q: npc.hexPos.q + Math.floor(moveRng() * 5) - 2,
          r: npc.hexPos.r + Math.floor(moveRng() * 5) - 2,
        };
      }
    }
  }

  /** 月度氛围层：人口增长 + 凡人升格为档案 NPC（§spec 3.1.2；独立 rng） */
  private tickAtmosphere(): void {
    const grid = this.gridOf();
    if (!this.state.populationGrid || Object.keys(this.state.populationGrid).length === 0) {
      this.state.populationGrid = initializePopulationGrid(grid);
    }
    const pop = this.state.populationGrid;
    const ascRng = createSeededRng(this.state.currentYear * 977 + this.state.currentMonth * 31 + 7);
    // 升格率 0.0002：全大陆每月约 0.9 名凡人入册（修士稀少；且不超名字库容量压力）
    const result = tickPopulation(pop, ascRng, { ascensionChance: 0.0002 });
    // 升格上限防爆：单月最多 8 名凡人入册
    const candidates = Math.min(result.ascensionCandidates, 8);
    for (let i = 0; i < candidates; i++) {
      const keys = Object.keys(pop);
      if (keys.length === 0) break;
      const key = keys[Math.floor(ascRng() * keys.length)]!;
      const asc = applyAscension(pop, key);
      if (!asc) continue;
      const record = this.spawnWildCultivator(ascRng);
      // 升格者落脚于升格格对应场所（若该格是地标且有场所）；否则随机场所（散修）
      const hex = grid.hexes.get(asc.hexKey);
      if (hex?.landmarkId) {
        const venues = getVenuesByNode(hex.landmarkId);
        if (venues.length > 0) record.locationId = venues[Math.floor(ascRng() * venues.length)]!.id;
        else record.locationId = this.pickVenueId(ascRng);
      } else {
        record.locationId = this.pickVenueId(ascRng);
      }
      record.hexPos = { q: asc.q, r: asc.r };
      record.moveState = 'resident';
      record.moveTarget = undefined;
      // 升阶叙事：凡人出身者入册即记下"自凡人踏上修途"里程碑（传记/编年史可查）
      record.biography.milestones.push({
        eventId: `ASC_${record.id}`,
        year: this.state.currentYear,
        month: this.state.currentMonth,
        title: '自凡人踏上修途',
        realm: record.realm,
      });
      this.state.npcs[record.id] = record;
    }
  }

  /** 嫉妒追捧（§spec 3.3.2）：按格索引，同格低资质者对高资质天才产生 opinion 偏移（独立 rng，空间局部化 §spec 3.5） */
  private tickJealousy(): void {
    const grid = this.gridOf();
    const now = { year: this.state.currentYear, month: this.state.currentMonth };
    const jealRng = createSeededRng(this.state.currentYear * 977 + this.state.currentMonth * 31 + 19);
    const index = npcSpatialIndex(this.state.npcs, grid);
    for (const list of index.values()) {
      if (list.length < 2) continue;
      // 选资质最高者作为目标（若有玄级以上者才会触发内部判定）
      let genius: NpcRecord | null = null;
      for (const n of list) {
        if (!genius || rootGradeWeight(n.spiritRoot.grade) > rootGradeWeight(genius.spiritRoot.grade)) {
          genius = n;
        }
      }
      if (!genius) continue;
      tryJealousy(list, genius, now, jealRng);
    }
  }

  /** 从预设场所中随机取一个地点 id（无预设场所时返回 undefined；rng 可注入） */
  private pickVenueId(rng: Rng = this.rng): string | undefined {
    if (VENUE_CATALOG.length === 0) return undefined;
    return VENUE_CATALOG[Math.floor(rng() * VENUE_CATALOG.length)]!.id;
  }

  /** 场所 id → 场所名（遗府叙事用；无场所回退"无名之地"） */
  private venueNameOf(locationId?: string): string {
    return locationId ? getVenue(locationId)?.name ?? '无名之地' : '无名之地';
  }

  /**
   * 宗门战伤亡率：境界越高越难战死（炼气 4% → 筑基 2% → 金丹 0.8% → 化神+ 0.4%）。
   * 宗门战每月结算（War 关系逐月拉锯），故单场概率取低值，
   * 使金丹+ 长老在混战中仍大概率保全（修仙人情化：长老非杂兵，且有死劫豁免兜底）。
   */
  private casualtyChanceOf(npc: NpcRecord): number {
    const tier = realmTier(npc.realm);
    if (tier >= 4) return 0.004;
    if (tier === 3) return 0.008;
    if (tier === 2) return 0.02;
    return 0.04;
  }

  /** 绝处逢生（涌现缺口 N3，修仙人情化）：死劫一线能否搏得生机，
   *  由 气运（面板 luck）+ 心性（悟性）决定——面板因果，非命格机制特权 */
  private escapeDeath(npc: NpcRecord): boolean {
    const luckP = (npc.destiny.luck / 100) * 0.6; // 气运：满分 0.6
    const compP = (npc.attributes.comprehension / 40) * 0.3; // 心性：满分 0.3
    const p = Math.min(0.85, luckP + compP);
    return this.rng() < p;
  }

  /** §4.7 遗府登记：金丹及以上死亡必留遗府（死亡→新机缘 物质循环闭环；同步推高乱世指数） */
  private registerHeritage(npc: NpcRecord): void {
    this.state.worldTurmoil = Math.min(100, (this.state.worldTurmoil ?? 0) + TURMOIL_HIGHREALM_DEATH_DELTA);
    const venue = npc.locationId ? getVenue(npc.locationId) : undefined;
    const site: HeritageSite = {
      npcId: npc.id,
      npcName: npc.name,
      venueId: venue?.id,
      venueName: venue?.name ?? '无名之地',
      year: this.state.currentYear,
      month: this.state.currentMonth,
    };
    this.state.heritageSites = { ...(this.state.heritageSites ?? {}), [npc.id]: site };
    // 高人气机汇聚：遗府现世 → 所在节点灵气 +3（生态与地形因果）
    if (venue?.nodeId && this.state.nodeSpiritQi) {
      this.state.nodeSpiritQi[venue.nodeId] = Math.min(
        SPIRIT_QI_MAX,
        (this.state.nodeSpiritQi[venue.nodeId] ?? 40) + 3,
      );
    }
  }

  /** 季节灵气潮汐（§4.9：春 +1 / 夏 +2 / 秋 −1 / 冬 −2 — 确定性，不消耗 rng）。
   *  月份窗口与 season-system.getSeason 同边界：1-3 春 / 4-6 夏 / 7-9 秋 / 10-12 冬 */
  private applySeasonQiShift(): void {
    const qi = this.state.nodeSpiritQi;
    if (!qi) return;
    const m = this.state.currentMonth;
    const delta = m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? -1 : -2;
    for (const key of Object.keys(qi)) {
      const cur = qi[key] ?? 40;
      qi[key] = Math.min(SPIRIT_QI_MAX, Math.max(SPIRIT_QI_MIN, cur + delta));
    }
  }

  /** 灵气复苏：全图灵气 +5 */
  private reviveAllQi(): void {
    const qi = this.state.nodeSpiritQi;
    if (!qi) return;
    for (const key of Object.keys(qi)) {
      const cur = qi[key] ?? 40;
      qi[key] = Math.min(SPIRIT_QI_MAX, cur + 5);
    }
  }

  /** 天灾/兵祸：灵气最盛之地 −5（资源最丰处先受冲击，确定性选点） */
  private dampenRichestQiNode(): void {
    const qi = this.state.nodeSpiritQi;
    if (!qi) return;
    const richest = Object.entries(qi).reduce<string | undefined>(
      (acc, [k, v]) => (acc === undefined || v > (qi[acc] ?? 0) ? k : acc),
      undefined,
    );
    if (richest !== undefined) {
      const cur = qi[richest] ?? 40;
      qi[richest] = Math.max(SPIRIT_QI_MIN, cur - 5);
    }
  }

  /** 该地灵气浓度 → 修炼倍率（无地点/无灵气记录时按 1，不放大） */
  private spiritQiMultOf(locationId?: string): number {
    if (!locationId) return 1;
    const nodeId = getVenue(locationId)?.nodeId;
    if (!nodeId) return 1;
    const qi = this.state.nodeSpiritQi?.[nodeId];
    return qi === undefined ? 1 : spiritQiMultiplier(qi);
  }

  /** 是否未出师弟子（有师尊且尚未出师 → 享受师门传承加速） */
  private isUndergraduateDisciple(npc: NpcRecord): boolean {
    if (npc.socialRank !== 'disciple') return false;
    const hasMaster = Object.values(npc.relations).some(
      (rel) => rel.type === 'master-disciple' && rel.direction === 'disciple',
    );
    if (!hasMaster) return false;
    return !npc.biography.milestones.some((m) => m.title === '出师');
  }

  // ── §4.13 自主性 / 代际链：动机驱动的辅助方法 ──

  /** 最恨之敌（enemy/rival 中 bond 最低且在世者；无则在世仇敌返回 undefined） */
  private strongestEnemy(npc: NpcRecord): NpcRecord | undefined {
    let best: NpcRecord | undefined;
    let worstBond = 0;
    for (const [id, rel] of Object.entries(npc.relations)) {
      if ((rel.type !== 'enemy' && rel.type !== 'rival') || rel.bond >= worstBond) continue;
      const target = this.state.npcs[id];
      if (target && target.soulState === 'Active') {
        worstBond = rel.bond;
        best = target;
      }
    }
    return best;
  }

  /** 实力足以一战：境界差距 ≤1 阶（真实斗法由面板定胜负；跨 2 阶以上壁垒难破 → 苦修蓄势） */
  private canAffordChallenge(seeker: NpcRecord, enemy: NpcRecord): boolean {
    return realmTier(seeker.realm) >= realmTier(enemy.realm) - 1;
  }

  /** 让贤判定（§2.2 权力斗争）：寿元>85% 的宗主萌生退意，压力越大越笃定 */
  private isAbdicatingLeader(leader: NpcRecord): boolean {
    const longevity = leader.lifespan.age / leader.lifespan.maxLifespan;
    if (longevity <= 0.85) return false;
    const chance = Math.min(0.3, ((longevity - 0.85) / 0.15) * ABDICATE_BASE_CHANCE);
    return this.rng() < chance;
  }

  /** 是否已有在世道侣（或丧偶守丧 3 年内——情义深重，不急于再续） */
  private isCommitted(npc: NpcRecord): boolean {
    if (!npc.spouseId) return false;
    const spouse = this.state.npcs[npc.spouseId];
    if (spouse && spouse.soulState === 'Active') return true;
    if (spouse?.deathYear !== undefined && this.state.currentYear - spouse.deathYear < 3) return true;
    return false;
  }

  /** 寻觅道侣候选（异性、无在世道侣、年岁相差 ≤40、本月未被牵走；同地优先，先近后远） */
  private findMateCandidate(seeker: NpcRecord, taken: Set<string>): NpcRecord | undefined {
    const candidates = Object.values(this.state.npcs).filter(
      (c) =>
        c.soulState === 'Active' &&
        c.gender !== seeker.gender &&
        !taken.has(c.id) &&
        !this.isCommitted(c) &&
        Math.abs(c.lifespan.age - seeker.lifespan.age) <= 40,
    );
    if (candidates.length === 0) return undefined;
    const sameLoc = candidates.filter((c) => c.locationId === seeker.locationId && c.locationId !== undefined);
    const pool = sameLoc.length > 0 ? sameLoc : candidates;
    return pool[Math.floor(this.rng() * pool.length)]!;
  }

  /** 求偶接受概率（面板因果：双方魅力越高越易结缘） */
  private courtshipAcceptChance(a: NpcRecord, b: NpcRecord): number {
    const charm = (a.attributes.charm + b.attributes.charm) / 2;
    return Math.min(0.6, Math.max(0.05, COURTSHIP_BASE_CHANCE * (1 + (charm - 50) / 100)));
  }

  /** 结为道侣：双向绑定 + 关系沉淀 + 志向转迁（成家后专心道途）+ 里程碑/事件 */
  private formCouple(
    a: NpcRecord,
    b: NpcRecord,
    now: { year: number; month: number },
    push: (input: Omit<EmitInput, 'relatedTo'>, npcIds: string[]) => BigEventLog,
  ): void {
    const changedAt = { year: now.year, month: now.month };
    a.spouseId = b.id;
    b.spouseId = a.id;
    a.relations[b.id] = { type: 'spouse', bond: 70, trust: 60, events: ['结为道侣'], changedAt };
    b.relations[a.id] = { type: 'spouse', bond: 70, trust: 60, events: ['结为道侣'], changedAt };
    a.aspiration = 'seekDao';
    b.aspiration = 'seekDao';
    a.biography.milestones.push({ eventId: `EVT_${now.year}_${now.month}`, year: now.year, month: now.month, title: '结为道侣', realm: a.realm });
    b.biography.milestones.push({ eventId: `EVT_${now.year}_${now.month}`, year: now.year, month: now.month, title: '结为道侣', realm: b.realm });
    push(
      {
        key: 'social.couple',
        vars: { npc: a.name, npc2: b.name },
        involvedCharacterIds: [a.id, b.id],
        locationId: a.locationId ?? b.locationId,
      },
      [a.id, b.id],
    );
  }

  /** 子嗣降生：修仙以传承替代繁殖——世家子弟出山，继承父母血脉灵根与家学（面板因果，非机制特权） */
  private spawnChild(parentA: NpcRecord, parentB: NpcRecord): NpcRecord {
    this.npcCounter++;
    const id = `NPC_${this.state.currentYear}_${this.state.currentMonth}_${this.npcCounter}`;
    const gender: NpcRecord['gender'] = this.rng() < 0.5 ? 'Male' : 'Female';
    const father = parentA.gender === 'Male' ? parentA : parentB;
    const seed = Math.floor(this.rng() * 1_000_000);
    // 子承父姓（百家姓同源），名由性别名库取；世界内去重（重名换种子重取）
    let name = father.name[0]! + NPCGenerator.generateName(seed, gender).slice(1);
    let nameGuard = 0;
    while (this.usedNames.has(name) && nameGuard < 32) {
      nameGuard++;
      name = father.name[0]! + NPCGenerator.generateName(seed + nameGuard * 7919, gender).slice(1);
    }
    this.usedNames.add(name);
    const changedAt = { year: this.state.currentYear, month: this.state.currentMonth };
    const record: NpcRecord = {
      id,
      name,
      gender,
      personalityId: resolvePersonalityId(id),
      origin: { type: '世家' },
      // 世家子弟出身（因）：家学渊源（悟性/灵石起步高），tier 仍从零认定（果）
      destiny: {
        tier: 'common',
        born: 'inherited',
        luck: Math.round((parentA.attributes.luck + parentB.attributes.luck) / 2),
        hidden: true,
      },
      realm: 'QiRefinement_1',
      soulState: 'Active',
      cultivation: { currentExp: 0, maxExp: 80 },
      locationId: father.locationId,
      factionId: father.factionId,
      spiritRoot: {
        grade: this.inheritRootGrade(parentA.spiritRoot.grade, parentB.spiritRoot.grade),
        elements: this.inheritRootElements(parentA.spiritRoot, parentB.spiritRoot),
        isVariant: this.rng() < 0.05,
      },
      attributes: {
        physique: this.inheritAttribute(parentA.attributes.physique, parentB.attributes.physique),
        comprehension: this.inheritAttribute(parentA.attributes.comprehension, parentB.attributes.comprehension),
        perception: this.inheritAttribute(parentA.attributes.perception, parentB.attributes.perception),
        agility: this.inheritAttribute(parentA.attributes.agility, parentB.attributes.agility),
        luck: Math.round((parentA.attributes.luck + parentB.attributes.luck) / 2),
        charm: this.inheritAttribute(parentA.attributes.charm, parentB.attributes.charm),
      },
      lifespan: { age: 16 + Math.floor(this.rng() * 5), maxLifespan: 100 },
      skillIds: [],
      // 家传底蕴（出生起点，面板因果）：世家子弟开局身家
      spiritStones: 500,
      birthYear: this.state.currentYear,
      birthMonth: this.state.currentMonth,
      parentIds: [parentA.id, parentB.id],
      relations: {
        [parentA.id]: { type: 'clan', bond: 80, trust: 70, events: ['血脉至亲'], changedAt },
        [parentB.id]: { type: 'clan', bond: 80, trust: 70, events: ['血脉至亲'], changedAt },
      },
      biography: {
        milestones: [{ eventId: `EVT_${this.state.currentYear}_${this.state.currentMonth}`, year: this.state.currentYear, month: this.state.currentMonth, title: '降世', realm: 'QiRefinement_1' }],
        summary: '',
      },
      lastUpdate: { year: this.state.currentYear, month: this.state.currentMonth },
    };
    record.aspiration = rollInitialAspiration(record, this.rng);
    parentA.childrenIds = [...(parentA.childrenIds ?? []), id];
    parentB.childrenIds = [...(parentB.childrenIds ?? []), id];
    return record;
  }

  /** 灵根品级继承（父母灵根好 → 子嗣资质好；3 成概率更进一品，面板因果） */
  private inheritRootGrade(ga: SpiritRootGrade, gb: SpiritRootGrade): SpiritRootGrade {
    const rank = (a: SpiritRootGrade): number => (a === 'Heaven' ? 4 : a === 'Earth' ? 3 : a === 'Profound' ? 2 : 1);
    const avg = (rank(ga) + rank(gb)) / 2;
    const gradeRank = Math.min(4, Math.max(1, Math.round(avg + (this.rng() < 0.3 ? 1 : 0))));
    return (['Yellow', 'Profound', 'Earth', 'Heaven'] as const)[gradeRank - 1]!;
  }

  /** 灵根元素继承（父母元素池洗牌取 1-2 个，血脉延续） */
  private inheritRootElements(a: SpiritRoot, b: SpiritRoot): SpiritRoot['elements'] {
    const pool = [...new Set([...a.elements, ...b.elements])];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    const count = this.rng() < 0.4 ? 2 : 1;
    return pool.slice(0, Math.min(count, pool.length)) as SpiritRoot['elements'];
  }

  /** 属性继承（父母均值 + 波动，血脉传承带随机性） */
  private inheritAttribute(va: number, vb: number): number {
    return Math.max(1, Math.round((va + vb) / 2 + (this.rng() * 8 - 4)));
  }

  /** 寻觅道统传人（悟性尚可、境界低于己、无师门者；同地优先，次选悟性最高——慧眼识珠） */
  private findHeritageDisciple(master: NpcRecord): NpcRecord | undefined {
    const candidates = Object.values(this.state.npcs).filter(
      (c) =>
        c.soulState === 'Active' &&
        c.id !== master.id &&
        c.attributes.comprehension >= 12 &&
        realmTier(c.realm) < realmTier(master.realm) &&
        !Object.values(c.relations).some((rel) => rel.type === 'master-disciple' && rel.direction === 'disciple'),
    );
    if (candidates.length === 0) return undefined;
    const sameLoc = candidates.filter((c) => c.locationId === master.locationId);
    const pool = sameLoc.length > 0 ? sameLoc : candidates;
    return pool.sort((x, y) => y.attributes.comprehension - x.attributes.comprehension)[0];
  }

  /** 传道统：师祖→师→徒 跨世代继承同一道统；师父了却心愿转求道 */
  private passHeritage(
    master: NpcRecord,
    disciple: NpcRecord,
    now: { year: number; month: number },
    push: (input: Omit<EmitInput, 'relatedTo'>, npcIds: string[]) => BigEventLog,
  ): void {
    const line = master.heritageLineId ?? `HL_${master.id}`;
    master.heritageLineId = line;
    disciple.heritageLineId = line;
    const changedAt = { year: now.year, month: now.month };
    master.relations[disciple.id] = { type: 'master-disciple', bond: 50, trust: 55, events: ['传下道统，衣钵相承'], changedAt, direction: 'master' };
    disciple.relations[master.id] = { type: 'master-disciple', bond: 50, trust: 55, events: ['拜入道统'], changedAt, direction: 'disciple' };
    master.aspiration = 'seekDao';
    master.biography.milestones.push({ eventId: `EVT_${now.year}_${now.month}`, year: now.year, month: now.month, title: '传下道统', realm: master.realm });
    push(
      {
        key: 'heritage.pass',
        vars: { master: master.name, disciple: disciple.name },
        involvedCharacterIds: [master.id, disciple.id],
        locationId: master.locationId ?? disciple.locationId,
      },
      [master.id, disciple.id],
    );
  }
}
