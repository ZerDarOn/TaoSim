import { describe, it, expect } from 'vitest';
import type { PopulationGrid } from '@taosim/contracts';
import { generateWorldGrid } from '../overworld/hex-overworld-engine.js';
import {
  initializePopulationGrid,
  tickPopulation,
  applyAscension,
} from '../world/population.js';

function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 0.5;
}

const grid = generateWorldGrid('CONT_EAST');

function landmarkKey(landmarkId: string): string {
  for (const hex of grid.hexes.values()) {
    if (hex.landmarkId === landmarkId) return `${hex.q},${hex.r}`;
  }
  throw new Error(`landmark not found: ${landmarkId}`);
}

describe('initializePopulationGrid', () => {
  it('城镇/灵脉格凡人更多，虚空/水域无凡人', () => {
    const pop = initializePopulationGrid(grid);
    // 天机城（NODE_CITY_TIANJI）对应格应为城镇，凡人众多
    const townKey = landmarkKey('NODE_CITY_TIANJI');
    expect(pop[townKey]!.mortals).toBeGreaterThan(500);
    // 虚空格无人口
    for (const hex of grid.hexes.values()) {
      if (hex.terrain === 'void') expect(pop[`${hex.q},${hex.r}`]).toBeUndefined();
    }
  });
});

describe('tickPopulation（月度自然增长 + 升格候选）', () => {
  it('增长并产生升格候选', () => {
    const pop = initializePopulationGrid(grid);
    const before = Object.values(pop).reduce((s, p) => s + p.mortals, 0);
    const result = tickPopulation(pop, seqRng([0.5]), { ascensionChance: 0.01 });
    const after = Object.values(pop).reduce((s, p) => s + p.mortals, 0);
    expect(after).toBeGreaterThan(before); // 自然增长
    expect(result.ascensionCandidates).toBeGreaterThan(0); // 有候选
  });

  it('零升格配置时不产生候选', () => {
    const pop = initializePopulationGrid(grid);
    const result = tickPopulation(pop, seqRng([0.0]), { ascensionChance: 0 });
    expect(result.ascensionCandidates).toBe(0);
  });
});

describe('applyAscension（升格：扣计数 + 产出候选信息）', () => {
  it('升格后凡人计数减一且产出候选信息', () => {
    const pop = initializePopulationGrid(grid);
    const townKey = landmarkKey('NODE_CITY_TIANJI');
    const before = pop[townKey]!.mortals;
    const result = applyAscension(pop, townKey);
    expect(result).not.toBeNull();
    expect(pop[townKey]!.mortals).toBe(before - 1);
    expect(result!.hexKey).toBe(townKey);
  });

  it('凡人不足时不升格', () => {
    const pop: PopulationGrid = {
      '0,0': { mortals: 0, lowCultivators: 0, spiritRootPotential: 0.03 },
    };
    expect(applyAscension(pop, '0,0')).toBeNull();
  });
});
