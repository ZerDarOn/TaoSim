// ============================================================
// 氛围层人口（NPC 地图呈现设计 §spec 3.1：凡人/散修背景板计数，
// 不进 WorldState.npcs —— 规模可达百万级而不拖垮档案与渲染）
// ============================================================

/** 单格人口计数（key: "q,r"） */
export interface HexPopulation {
  /** 凡人计数（背景板，无档案） */
  mortals: number;
  /** 炼气期散修计数（不进档案的背景板修士） */
  lowCultivators: number;
  /** 有灵根潜质的凡人占比 0~1（升格候选池） */
  spiritRootPotential: number;
}

/** 氛围层人口表：hex key("q,r") → 计数（key 与 WorldHexGrid.hexes 一致） */
export type PopulationGrid = Record<string, HexPopulation>;
