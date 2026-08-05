export type UpgradeFailPenalty = 'LossMaterialsOnly' | 'DurabilityLoss' | 'QualityDegrade';

export interface UpgradeRule {
  materials: { templateId: string; count: number }[];
  spiritStones: number;
  successRate: number;
  failPenalty: UpgradeFailPenalty;
}

export interface CraftResult {
  success: boolean;
  item?: import('./item.js').Item;
  message: string;
}

export interface UpgradeResult {
  success: boolean;
  resultItem?: import('./item.js').Item;
  penaltyTriggered?: UpgradeFailPenalty;
  message: string;
}
