/** ATB 镜像条目（与 useCombat.state.atb 同构） */
export interface AtbEntry {
  gauge: number;
  actionReady: boolean;
}

/** 按 ATB gauge 降序排列角色 id（行动顺序预告，设计文档 §6.1） */
export function computeTurnOrder(
  atb: Record<string, AtbEntry>,
  excludeIds: string[] = [],
): string[] {
  return Object.entries(atb)
    .filter(([id]) => !excludeIds.includes(id))
    .sort((a, b) => b[1].gauge - a[1].gauge)
    .map(([id]) => id);
}
