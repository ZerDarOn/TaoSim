import { describe, expect, it } from 'vitest';
import type { WorldState } from '@taosim/contracts';
import { createSeededRng } from '../../battle/seeded-rng.js';
import { WorldEngine } from '../world-engine.js';

const BASE_WORLD: WorldState = {
  currentYear: 1,
  currentMonth: 1,
  catastropheCountdownMonths: 600,
  activeContinentIds: ['CONTINENT_CANGZHOU'],
  globalFlags: {},
  npcs: {},
  eventLog: [],
};

describe('NB2 shadow 长期校准基线', () => {
  it('多种子两年样本保持可解释、完整记账和有界诊断', () => {
    const seeds = [42, 2026, 314159];
    for (const seed of seeds) {
      const bootstrap = new WorldEngine(BASE_WORLD, { rng: createSeededRng(seed) });
      bootstrap.fastForward(80);
      const engine = new WorldEngine(bootstrap.getState(), {
        rng: createSeededRng(seed + 1),
        npcBrainV2Shadow: true,
      });

      engine.fastForward(24);
      const report = engine.getBrainShadowAggregateReport()!;
      const matchRate = report.matchedCount / report.evaluatedNpcCount;
      const noRecommendationRate = report.noRecommendationCount / report.evaluatedNpcCount;
      const topTransitions = Object.entries(report.comparisonCounts)
        .sort(([, countA], [, countB]) => countB - countA)
        .slice(0, 5)
        .map(([transition, count]) => `${transition}:${count}`)
        .join(',');

      console.info(
        `[NB2_CALIBRATION] seed=${seed} evaluated=${report.evaluatedNpcCount} `
        + `matchRate=${(matchRate * 100).toFixed(1)}% `
        + `noRecommendation=${(noRecommendationRate * 100).toFixed(2)}% `
        + `top=${topTransitions}`,
      );

      expect(report.monthCount).toBe(24);
      expect(report.matchedCount + report.differedCount).toBe(report.evaluatedNpcCount);
      expect(Object.values(report.comparisonCounts).reduce((sum, count) => sum + count, 0))
        .toBe(report.evaluatedNpcCount);
      expect(noRecommendationRate).toBeLessThan(0.05);
      expect(report.differenceSamples.length).toBeLessThanOrEqual(20);
    }
  }, 15_000);
});
