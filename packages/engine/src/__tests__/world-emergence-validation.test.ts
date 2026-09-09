// ============================================================
// 世界涌现质量评估器（50 年 × 多种子）
//
// 目标（用户要求：验证到 95%+ 自信）：
//   修改后（N1-N4）涌现质量指标全部达标 + 多种子鲁棒。
//   指标对应验收标准 §10 与缺口诊断 G1-G5/N1-N4。
//
// 使用方法：npx vitest run packages/engine/src/__tests__/world-emergence-validation.test.ts
// ============================================================

import { describe, expect, it } from 'vitest';
import { WorldEngine } from '../world/world-engine.js';
import { createSeededRng } from '../battle/seeded-rng.js';
import { generateLegendaryNpcs } from '../world/legendary-npc-generator.js';
import type { BigEventLog, NpcRecord, WorldState } from '@taosim/contracts';

const YEARS = 50;
const MONTHS = YEARS * 12;
/** 鲁棒性验证种子集合 */
const SEEDS = [42, 7, 2026, 314159, 8888];

/** 例行噪音模板（涌现缺口 N1：交易/出世/拜宗/云游） */
const ROUTINE_KEYS = new Set(['market.trade', 'world.spawn', 'social.joinSect', 'travel.wander']);

interface WorldMetrics {
  seed: number;
  totalEvents: number;
  chronicleEvents: number;
  majorEpoch: number;
  majorRatio: number;        // major+epoch 占编年史比例
  routineRatio: number;      // 例行事件占编年史比例
  firstCataclysmYear: number | null;
  cataclysmCount: number;
  eraSequence: string;
  epithets: number;
  heritageSites: number;
  escapedDeath: number;
  legendaryAlive: number;
  legendaryAvgEvents: number;
  feudDeaths: number;
  feudBattles: number;
  couples: number;
  children: number;
  heritagePasses: number;
  sectAbdications: number;   // 宗门权力（§2.2）：主动让贤
  sectUsurps: number;        // 宗门权力（§2.2）：夺位成功
  sectUsurpFails: number;    // 宗门权力（§2.2）：夺位失败被逐
  sectUsurpStalemates: number; // 宗门权力（§2.2）：真实斗法但未分胜负
}

function baseState(npcs: Record<string, NpcRecord>): WorldState {
  return {
    currentYear: 1,
    currentMonth: 1,
    catastropheCountdownMonths: 600,
    activeContinentIds: ['CONTINENT_CANGZHOU'],
    globalFlags: {},
    npcs,
    eventLog: [],
  };
}

function simulate(seed: number): { metrics: WorldMetrics; events: BigEventLog[]; legendary: NpcRecord[] } {
  const legendary = generateLegendaryNpcs();
  const initialNpcs: Record<string, NpcRecord> = Object.fromEntries(legendary.map((n) => [n.id, n]));
  const engine = new WorldEngine(baseState(initialNpcs), { rng: createSeededRng(seed) });

  const allEvents: BigEventLog[] = [];
  let cataclysmCount = 0;
  let firstCataclysmYear: number | null = null;
  const eraSeq: string[] = [];

  for (let m = 0; m < MONTHS; m++) {
    const result = engine.step();
    allEvents.push(...result.events);
    for (const e of result.events) {
      if (e.templateKey === 'world.era') {
        if (e.title === '量劫将至' && firstCataclysmYear === null) firstCataclysmYear = e.year;
        if (e.title === '量劫将至') cataclysmCount++;
        if (eraSeq[eraSeq.length - 1] !== e.title) eraSeq.push(e.title);
      }
    }
  }

  const final = engine.getState();
  const chronicle = final.eventLog; // 已分层：仅 normal+（N1）
  const majorEpoch = chronicle.filter((e) => e.severity === 'major' || e.severity === 'epoch').length;
  const routine = chronicle.filter((e) => e.templateKey && ROUTINE_KEYS.has(e.templateKey)).length;

  const epithets = allEvents.filter((e) => e.templateKey === 'npc.epithet').length;
  const escapedDeath = allEvents.filter((e) => e.templateKey === 'npc.escapedDeath').length;
  const feudDeaths = allEvents.filter((e) => e.templateKey === 'combat.feed.lethal').length;
  const feudBattles = allEvents.filter((e) => e.templateKey === 'combat.feed.win').length;

  const aliveLegendary = legendary.filter((n) => {
    const rec = final.npcs[n.id];
    return rec && rec.soulState === 'Active';
  });
  const legendaryAvgEvents = Math.round(
    legendary.reduce((sum, n) => sum + allEvents.filter((e) => e.involvedCharacterIds.includes(n.id)).length, 0) /
      legendary.length,
  );

  // 代际指标（§4.13：求偶→道侣→子嗣；道统跨世代）
  const npcs = Object.values(final.npcs);
  const coupleKeys = new Set<string>();
  for (const n of npcs) {
    if (n.soulState === 'Active' && n.spouseId && final.npcs[n.spouseId]?.soulState === 'Active') {
      coupleKeys.add([n.id, n.spouseId].sort().join('|'));
    }
  }
  const children = npcs.filter((n) => (n.parentIds?.length ?? 0) > 0).length;
  const heritagePasses = allEvents.filter((e) => e.templateKey === 'heritage.pass').length;

  // 宗门权力斗争指标（§2.2 权力轨道：让贤 / 夺位成功 / 夺位失败逐出）
  const sectAbdications = allEvents.filter((e) => e.templateKey === 'social.sectAbdicate').length;
  const sectUsurps = allEvents.filter((e) => e.templateKey === 'social.sectUsurp').length;
  const sectUsurpFails = allEvents.filter((e) => e.templateKey === 'social.sectUsurpFail').length;
  const sectUsurpStalemates = allEvents.filter((e) => e.templateKey === 'social.sectUsurpStalemate').length;

  return {
    metrics: {
      seed,
      totalEvents: allEvents.length,
      chronicleEvents: chronicle.length,
      majorEpoch,
      majorRatio: chronicle.length ? majorEpoch / chronicle.length : 0,
      routineRatio: chronicle.length ? routine / chronicle.length : 0,
      firstCataclysmYear,
      cataclysmCount,
      eraSequence: eraSeq.join('→'),
      epithets,
      heritageSites: Object.keys(final.heritageSites ?? {}).length,
      escapedDeath,
      legendaryAlive: aliveLegendary.length,
      legendaryAvgEvents,
      feudDeaths,
      feudBattles,
      couples: coupleKeys.size,
      children,
      heritagePasses,
      sectAbdications,
      sectUsurps,
      sectUsurpFails,
      sectUsurpStalemates,
    },
    events: allEvents,
    legendary,
  };
}

describe('世界涌现质量评估（50 年 × 多种子）', () => {
  it('多种子全指标达标（鲁棒性验证）', () => {
    const rows: WorldMetrics[] = [];
    for (const seed of SEEDS) {
      const { metrics } = simulate(seed);
      rows.push(metrics);
      console.log(
        `\n[seed ${seed}] 全量事件 ${metrics.totalEvents} | 编年史 ${metrics.chronicleEvents} ` +
          `| major+epoch ${metrics.majorEpoch} (${(metrics.majorRatio * 100).toFixed(1)}%) ` +
          `| 例行噪音 ${(metrics.routineRatio * 100).toFixed(1)}%`,
      );
      console.log(
        `  纪元 ${metrics.eraSequence} | 首次量劫 ${metrics.firstCataclysmYear ?? '无'} 年 ` +
          `| 绰号 ${metrics.epithets} | 遗府 ${metrics.heritageSites} | 绝处逢生 ${metrics.escapedDeath}`,
      );
      console.log(
        `  传奇存活 ${metrics.legendaryAlive}/8 | 传奇人均事件 ${metrics.legendaryAvgEvents} ` +
          `| 寻仇胜负 ${metrics.feudBattles}/${metrics.feudDeaths}`,
      );
      console.log(
        `  道侣 ${metrics.couples} 对 | 子嗣 ${metrics.children} | 道统传承 ${metrics.heritagePasses} 次`,
      );
      console.log(
        `  宗门权力 让贤 ${metrics.sectAbdications} | 夺位成功 ${metrics.sectUsurps} | 夺位失败 ${metrics.sectUsurpFails} | 僵持 ${metrics.sectUsurpStalemates}`,
      );
    }

    // ── 达标线（95% 自信 = 全种子通过）──
    const targets = {
      chronicleEventCap: 6000,        // N1：编年史不被流水账撑爆
      majorRatioMin: 0.06,            // 叙事占比 ≥6%（基线 2%）
      routineRatioMax: 0.15,          // 例行噪音 ≤15%（基线 83%）
      cataclysmYearMin: 25,           // N2：首次量劫不早于 25 年（基线 5 年）
      epithetMin: 2,                  // 成名正反馈 ≥2 次（基线 1）
      heritageMin: 2,                 // N4：遗府闭环 ≥2 处（基线 0）
      escapedDeathMin: 1,             // N3：命格豁免机制生效
      legendaryAliveMin: 3,           // N3：传奇存活 ≥3/8（基线 2/8）
      legendaryEventsMin: 15,         // 传奇活跃度（基线 0-6 条的多数）
      couplesMin: 5,                  // 代际：涌现道侣 ≥5 对（基线 0）
      childrenMin: 10,                // 代际：血脉子嗣 ≥10 人（基线 0）
      heritagePassesTotalMin: 5,      // 低频道统事件按多世界样本窗判断，避免钦定每个世界必然发生
      heritagePassSeedCountMin: 4,    // 5 个固定世界中至少 4 个自然激活传承链
      // 宗门权力（§2.2 夺位）：验证真实斗法轨道被激活，不钦定挑战者必须获胜。
      // 若用“成功次数”作门槛，会反向迫使系统偏袒夺位者，破坏人物实力决定胜负的因果。
      sectUsurpBattlesTotalMin: 2,
    };

    const failures: string[] = [];
    const checkNames: string[] = [];
    for (const r of rows) {
      const checks: [string, boolean, string][] = [
        ['编年史规模上限', r.chronicleEvents <= targets.chronicleEventCap, `${r.chronicleEvents}≤${targets.chronicleEventCap}`],
        ['major 叙事占比', r.majorRatio >= targets.majorRatioMin, `${(r.majorRatio * 100).toFixed(1)}%≥${(targets.majorRatioMin * 100).toFixed(0)}%`],
        ['例行噪音占比', r.routineRatio <= targets.routineRatioMax, `${(r.routineRatio * 100).toFixed(1)}%≤${(targets.routineRatioMax * 100).toFixed(0)}%`],
        ['首次量劫不早爆', (r.firstCataclysmYear ?? 999) >= targets.cataclysmYearMin, `${r.firstCataclysmYear ?? '无'}≥${targets.cataclysmYearMin}`],
        ['绰号≥', r.epithets >= targets.epithetMin, `${r.epithets}≥${targets.epithetMin}`],
        ['遗府≥', r.heritageSites >= targets.heritageMin, `${r.heritageSites}≥${targets.heritageMin}`],
        ['绝处逢生>0', r.escapedDeath >= targets.escapedDeathMin, `${r.escapedDeath}≥${targets.escapedDeathMin}`],
        ['传奇存活≥', r.legendaryAlive >= targets.legendaryAliveMin, `${r.legendaryAlive}≥${targets.legendaryAliveMin}`],
        ['传奇活跃≥', r.legendaryAvgEvents >= targets.legendaryEventsMin, `${r.legendaryAvgEvents}≥${targets.legendaryEventsMin}`],
        ['道侣≥', r.couples >= targets.couplesMin, `${r.couples}≥${targets.couplesMin}`],
        ['子嗣≥', r.children >= targets.childrenMin, `${r.children}≥${targets.childrenMin}`],
      ];
      if (checkNames.length === 0) checkNames.push(...checks.map((c) => c[0]));
      for (const [name, ok, actual] of checks) {
        if (!ok) failures.push(`seed ${r.seed} ${name}: ${actual}`);
      }
    }

    // 低频涌现事件按多世界样本窗判定：既要求覆盖多数世界，也要求总量不退化，
    // 但不为单个种子注入保底剧情。
    checkNames.push('道统传承覆盖与合计', '宗门夺位斗法合计≥');
    const heritagePassSeedCount = rows.filter((r) => r.heritagePasses > 0).length;
    const heritagePassTotal = rows.reduce((sum, r) => sum + r.heritagePasses, 0);
    if (heritagePassSeedCount < targets.heritagePassSeedCountMin
      || heritagePassTotal < targets.heritagePassesTotalMin) {
      failures.push(
        `道统传承覆盖 ${heritagePassSeedCount}<${targets.heritagePassSeedCountMin} 或合计 ${heritagePassTotal}<${targets.heritagePassesTotalMin}`,
      );
    }
    const totalUsurps = rows.reduce((s, r) => s + r.sectUsurps, 0);
    const totalAbdications = rows.reduce((s, r) => s + r.sectAbdications, 0);
    const totalUsurpFails = rows.reduce((s, r) => s + r.sectUsurpFails, 0);
    const totalUsurpStalemates = rows.reduce((s, r) => s + r.sectUsurpStalemates, 0);
    const totalUsurpBattles = totalUsurps + totalUsurpFails + totalUsurpStalemates;
    if (totalUsurpBattles < targets.sectUsurpBattlesTotalMin) {
      failures.push(`宗门 夺位斗法合计 ${totalUsurpBattles}<${targets.sectUsurpBattlesTotalMin}`);
    }
    console.log(
      `\n道统传承：${heritagePassSeedCount}/5 个世界，合计 ${heritagePassTotal} 次`,
    );
    console.log(
      `宗门权力合计：让贤 ${totalAbdications} | 夺位成功 ${totalUsurps} | 夺位失败 ${totalUsurpFails} | 僵持 ${totalUsurpStalemates}（5 种子 × 50 年）`,
    );

    if (failures.length > 0) {
      console.log(`\n未达标项（${failures.length}）:\n  ${failures.join('\n  ')}`);
    } else {
      console.log(`\n✅ 全部 ${SEEDS.length} 种子 × ${checkNames.length} 项指标达标`);
    }
    expect(failures).toEqual([]);
  // Phase 7 增加了 800/1500 NPC 的并发性能夹具；workspace 全量运行时多个
  // 长时 worker 会争用 CPU。保持断言不变，仅给这条已有的 5×50 年质量
  // 回归留下真实的资源争用余量，单独运行仍应在原 60 秒预算内完成。
  }, 90_000);
});
