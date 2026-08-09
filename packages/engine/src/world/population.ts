// ============================================================
// 氛围层人口（NPC 地图呈现设计 §spec 3.1/3.1.2）：
// 凡人/散修背景板计数 + 月度增长 + 升格候选。
// 计数不进 WorldState.npcs —— 规模可达百万级而不拖垮档案与渲染。
// ============================================================

import type { HexPopulation, PopulationGrid } from '@taosim/contracts';
import type { WorldHexGrid } from '../overworld/hex-overworld-engine.js';

/** 城镇/灵脉/荒野基准人口 */
const TOWN_MORTALS = 1200;
const SPIRIT_VEIN_MORTALS = 800;
const WILD_MORTALS = 200;
const TOWN_LOW_CULTIVATORS = 30;
const SPIRIT_VEIN_LOW_CULTIVATORS = 15;
const WILD_LOW_CULTIVATORS = 3;

/** 确定性初始化抖动（固定种子，与主 rng 序列解耦） */
function simpleRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** 初始化：按地形分布人口（虚空/水域无人烟） */
export function initializePopulationGrid(grid: WorldHexGrid): PopulationGrid {
  const pop: PopulationGrid = {};
  const rng = simpleRng(7);
  for (const hex of grid.hexes.values()) {
    if (hex.terrain === 'void' || hex.terrain === 'water') continue;
    const isTown = hex.terrain === 'town';
    const isVein = hex.terrain === 'spirit_vein';
    pop[`${hex.q},${hex.r}`] = {
      mortals:
        (isTown ? TOWN_MORTALS : isVein ? SPIRIT_VEIN_MORTALS : WILD_MORTALS) +
        Math.floor(rng() * 400),
      lowCultivators: isTown
        ? TOWN_LOW_CULTIVATORS
        : isVein
          ? SPIRIT_VEIN_LOW_CULTIVATORS
          : WILD_LOW_CULTIVATORS,
      spiritRootPotential: 0.03,
    };
  }
  return pop;
}

export interface PopulationTickResult {
  /** 本月可升格候选数（由调用方逐个 applyAscension 升格为档案 NPC） */
  ascensionCandidates: number;
}

export interface PopulationTickOptions {
  /** 凡人自然月增长率（基数比例） */
  growthRate?: number;
  /** 升格概率基数（每月每格） */
  ascensionChance?: number;
}

/**
 * 月度推进：凡人自然增长 + 计算升格候选。
 * 消耗 rng：每格 1 次（升格判定；保持调用方 rng 序列稳定，供测试注入）。
 */
export function tickPopulation(
  pop: PopulationGrid,
  rng: () => number,
  opts: PopulationTickOptions = {},
): PopulationTickResult {
  const growthRate = opts.growthRate ?? 0.002;
  const ascensionChance = opts.ascensionChance ?? 0.001;
  let ascensionCandidates = 0;
  // 跨格累积小数（单格概率过低，独立取整恒为 0；聚合为"全大陆月度升格率"）
  let acc = 0;
  for (const cell of Object.values(pop)) {
    // 自然增长（凡人 + 低阶散修；上限防溢出）
    cell.mortals = Math.min(10000, Math.floor(cell.mortals * (1 + growthRate)) + 1);
    // 升格候选：有灵根潜质的凡人 × 概率（累积取整，而非每格 floor）
    acc += cell.mortals * cell.spiritRootPotential * ascensionChance;
    if (acc >= 1) {
      ascensionCandidates += Math.floor(acc);
      acc -= Math.floor(acc);
    }
    rng();
  }
  return { ascensionCandidates };
}

/** 升格：从该格扣 1 名凡人，返回候选信息（调用方负责生成 NpcRecord 进档案） */
export function applyAscension(
  pop: PopulationGrid,
  hexKey: string,
): { hexKey: string; q: number; r: number } | null {
  const cell = pop[hexKey];
  if (!cell || cell.mortals < 1) return null;
  cell.mortals--;
  const [q, r] = hexKey.split(',').map(Number);
  return { hexKey, q: q!, r: r! };
}

// 供类型引用（避免未使用告警；PopulationGrid 由调用方直接使用）
export type { HexPopulation };
