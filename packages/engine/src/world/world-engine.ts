import type { WorldState, BigEventLog, NpcRecord, Faction, WorldEra, HeritageSite } from '@taosim/contracts';
import { EconomyEngine } from '../economy/economy-engine.js';
import { NPCGenerator } from '../interaction/npc-generator.js';
import { VENUE_CATALOG, getVenue } from '../overworld/map-catalog.js';
import { PRESET_MAP } from '../overworld/preset-map.js';
import { createInitialFactions } from './sect-presets.js';
import { characterToNpcRecord, realmTier } from './npc-record-mapper.js';
import { EventCollector } from './event-collector.js';
import type { EmitInput } from './event-collector.js';
import { rollWorldEvent } from '../time/calendar-event-scheduler.js';
import type { Rng } from './world-tick-rules.js';
import {
  cultivateNpc,
  realmDisplay,
  tryBreakthrough,
  tryWander,
  tryWonder,
} from './world-tick-rules.js';
import { samplePairs, socialEncounter, tryFeud } from './world-social-rules.js';

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

/** 散修拜入宗门概率（身处宗门驻地或出身宗门，§2.2 社会轨道） */
export const JOIN_SECT_CHANCE = 0.04;

/** 灾害/动荡类世界事件推高乱世指数（§2.2 世界轨道） */
export const TURMOIL_EVENT_DELTA = 12;

/** 高境界（金丹+）死亡推高乱世指数 */
export const TURMOIL_HIGHREALM_DEATH_DELTA = 5;

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

  constructor(
    initialState: WorldState,
    options: { rng?: Rng; factions?: Record<string, Faction> } = {},
  ) {
    this.state = {
      ...initialState,
      npcs: { ...(initialState.npcs ?? {}) },
      eventLog: [...(initialState.eventLog ?? [])],
      factions: { ...(initialState.factions ?? options.factions ?? createInitialFactions()) },
      // 世界局势/遗府：可选字段兜底默认值（兼容旧存档）
      worldEra: initialState.worldEra ?? 'peace',
      worldTurmoil: initialState.worldTurmoil ?? 0,
      heritageSites: { ...(initialState.heritageSites ?? {}) },
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
    this.advanceCalendar();

    // 云游回归：上月云游（locationId 清空）的 NPC 本月重新落脚，
    // 避免 '__wander__' 分组随云游积累而无限膨胀（真实节点系统接入前的临时策略）
    for (const npc of Object.values(this.state.npcs)) {
      if (npc.soulState !== 'Active' || npc.locationId !== undefined) continue;
      npc.locationId = this.pickVenueId();
    }

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
      } else if (worldEvent.id === 'WE_HEAVEN_FAVOR') {
        this.state.worldTurmoil = Math.max(0, (this.state.worldTurmoil ?? 0) - 8);
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
        this.lastEventByNpc.set(id, event);
        if (event.isMajorEvent) {
          const npc = this.state.npcs[id];
          if (!npc || npc.destiny.epithet) continue;
          const count = (this.majorCountByNpc.get(id) ?? 0) + 1;
          this.majorCountByNpc.set(id, count);
          if (count >= EPITHET_MAJOR_THRESHOLD) {
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

      // 修炼增长
      cultivateNpc(npc);

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

      // 奇遇判定
      const wonder = tryWonder(npc, this.rng);
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

      // 云游判定（§4.2 目的地优先投奔关系）
      if (tryWander(npc, this.rng)) {
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
    }

    // 2. 社交相遇 + 寻仇（同地点/云游配对，关系轨道 §4.3/§4.4 — 阶段 1b）
    const now = { year: this.state.currentYear, month: this.state.currentMonth };
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
        const feud = tryFeud(a, b, now, this.rng);
        if (feud) {
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
          }
        }
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

      // 入宗：散修身处宗门驻地或出身宗门 → 拜入门下（弟子）
      for (const npc of Object.values(this.state.npcs)) {
        if (npc.soulState !== 'Active' || npc.factionId) continue;
        const venue = npc.locationId ? getVenue(npc.locationId) : undefined;
        const atTerritory = venue !== undefined && faction.territories.includes(venue.nodeId);
        if ((atTerritory || npc.origin.type === '宗门') && this.rng() < JOIN_SECT_CHANCE) {
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
        delete this.state.npcs[id];
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
        events.push(
          collector.emit({ key: 'world.spawn', vars: { npc: npc.name }, involvedCharacterIds: [npc.id] }),
        );
      }
    }

    // 5. 宗门月度维护（§2.2 经济轨道：灵脉产出 水龙头 − 维护成本；枯竭则降级灵脉）
    for (const [, faction] of this.factions) {
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
    this.state.eventLog = trimEventLog([...this.state.eventLog, ...events]);

    return { updatedState: this.getState(), events, npcPopulationChanged };
  }

  /** 快速推进 N 个月（闭关），返回摘要 */
  public fastForward(months: number): { events: BigEventLog[]; progress: number } {
    const events: BigEventLog[] = [];
    for (let i = 0; i < months; i++) {
      const result = this.step();
      events.push(...result.events);
    }
    return { events, progress: 1.0 };
  }

  public getState(): WorldState {
    return {
      ...this.state,
      npcs: { ...this.state.npcs },
      eventLog: [...this.state.eventLog],
      factions: this.state.factions ? { ...this.state.factions } : undefined,
      heritageSites: this.state.heritageSites ? { ...this.state.heritageSites } : undefined,
    };
  }

  private advanceCalendar(): void {
    this.state.currentMonth++;
    if (this.state.currentMonth > 12) {
      this.state.currentMonth = 1;
      this.state.currentYear++;
    }
    if (this.state.catastropheCountdownMonths > 0) {
      this.state.catastropheCountdownMonths--;
    }
  }

  /** 生成一个散修 NPC 并归档为 NpcRecord（境界分布：炼气为主、少量筑基/金丹） */
  private spawnWildCultivator(): NpcRecord {
    this.npcCounter++;
    const id = `NPC_${this.state.currentYear}_${this.state.currentMonth}_${this.npcCounter}`;
    const tierRoll = this.rng();
    const tier = tierRoll < 0.75 ? 1 : tierRoll < 0.95 ? 2 : 3;
    const seed = Math.floor(this.rng() * 1_000_000);
    const character = NPCGenerator.generate(tier, seed);

    const record = characterToNpcRecord(
      { ...character, id, name: character.name },
      this.state.currentYear,
      this.state.currentMonth,
    );
    // 真实地点引用：落脚于预设场所（社交配对按地点分组的数据基础）
    record.locationId = this.pickVenueId();

    // 命格（阶段 1 起影响奇遇/突破/死劫加权）：0.5% 天骄、2.5% 英才
    const destinyRoll = this.rng();
    record.destiny =
      destinyRoll < 0.005
        ? { tier: 'prodigy', luck: 95, hidden: true }
        : destinyRoll < 0.03
          ? { tier: 'talented', luck: 80, hidden: true }
          : { tier: 'common', luck: record.attributes.luck, hidden: false };
    return record;
  }

  /** 从预设场所中随机取一个地点 id（无预设场所时返回 undefined） */
  private pickVenueId(): string | undefined {
    if (VENUE_CATALOG.length === 0) return undefined;
    return VENUE_CATALOG[Math.floor(this.rng() * VENUE_CATALOG.length)]!.id;
  }

  /** 场所 id → 场所名（遗府叙事用；无场所回退"无名之地"） */
  private venueNameOf(locationId?: string): string {
    return locationId ? getVenue(locationId)?.name ?? '无名之地' : '无名之地';
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
  }
}
