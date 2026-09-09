import type { SpatialAddress } from '@taosim/contracts';

export interface HexPosition {
  q: number;
  r: number;
}

export interface PlayerHexProjection {
  position: HexPosition;
  source: 'authority-coordinate' | 'authority-node' | 'map-cache';
}

function isHexPosition(value: SpatialAddress['coordinate']): value is HexPosition {
  return !!value && 'q' in value && 'r' in value;
}

/**
 * 将权威空间地址投影到六边形地图。
 * 地图缓存只保存浏览体验；一旦角色已有权威坐标或节点锚点，缓存不得反向覆盖它。
 */
export function resolvePlayerHexProjection(
  address: SpatialAddress | undefined,
  cachedPosition: HexPosition,
  findNodePosition: (nodeId: string) => HexPosition | null,
): PlayerHexProjection {
  if (isHexPosition(address?.coordinate)) {
    return { position: { q: address.coordinate.q, r: address.coordinate.r }, source: 'authority-coordinate' };
  }

  if (address) {
    const nodePosition = findNodePosition(address.nodeId);
    if (nodePosition) return { position: nodePosition, source: 'authority-node' };
  }

  return {
    position: { q: cachedPosition.q, r: cachedPosition.r },
    source: 'map-cache',
  };
}
