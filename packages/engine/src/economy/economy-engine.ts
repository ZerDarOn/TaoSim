/**
 * 灵石经济引擎 — 架构规范 §19。
 *
 * 负责：
 *   - 月度灵石产出计算（水龙头）
 *   - 灵石消耗回收（黑洞）
 *   - 抗通胀机制
 */
export class EconomyEngine {
  /**
   * 计算宗门灵脉月度产出。
   * EffectiveSpiritVein = min(OverworldNode.tier, Faction.spiritVeinLevel)
   */
  public static calculateSpiritStoneIncome(
    nodeTier: number,
    factionSpiritVeinLevel: number,
  ): number {
    const effectiveLevel = Math.min(nodeTier, factionSpiritVeinLevel);
    const baseOutput = 100;
    return baseOutput * effectiveLevel;
  }

  /**
   * 计算延寿丹价格（指数增长）。
   * @param timesUsed 当前角色已使用延寿丹的次数
   */
  public static longevityPillCost(baseCost: number, timesUsed: number): number {
    return Math.round(baseCost * Math.pow(2, timesUsed));
  }

  /**
   * 计算灵脉维护消耗。
   * @param spiritVeinLevel 灵脉阶位
   */
  public static spiritVeinMaintenanceCost(spiritVeinLevel: number): number {
    const costs = [0, 50, 200, 800, 3200, 12800];
    return costs[spiritVeinLevel] ?? 0;
  }
}
