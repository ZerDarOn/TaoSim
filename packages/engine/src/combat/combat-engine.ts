import type { Character, Skill, HexBattleMap, HexTile } from '@taosim/contracts';
import { hexKey } from '@taosim/contracts';

export interface CombatTurnResult {
  log: string;
  map: HexBattleMap;
  characters: Record<string, Character>;
}

export interface ATBUnit {
  characterId: string;
  gauge: number;          // 0-100
  actionReady: boolean;
}

/**
 * 战棋引擎 — Hex 网格上的 ATB 回合制战斗。
 * 负责：ATB 跑槽、移动/攻击结算、伤害管道、境界壁垒。
 */
export class CombatEngine {
  private map: HexBattleMap;
  private atbQueue: ATBUnit[] = [];
  private turnLog: string[] = [];

  constructor(map: HexBattleMap, participants: Character[]) {
    this.map = map;
    this.atbQueue = participants.map(p => ({
      characterId: p.id,
      gauge: 0,
      actionReady: false,
    }));
  }

  /** ATB Tick：各角色根据身法累加行动值（已就绪者等待行动，不再累加） */
  public tickATB(characters: Record<string, Character>): void {
    for (const unit of this.atbQueue) {
      const character = characters[unit.characterId];
      if (!character || character.hp <= 0) continue;
      if (unit.actionReady) continue;
      unit.gauge = Math.min(100, unit.gauge + 10 + character.attributes.agility * 2);
      if (unit.gauge >= 100) {
        unit.actionReady = true;
      }
    }
  }

  /** 行动完毕后消耗回合：清除就绪标记并重置行动条 */
  public consumeTurn(characterId: string): void {
    const unit = this.atbQueue.find(u => u.characterId === characterId);
    if (unit) {
      unit.actionReady = false;
      unit.gauge = 0;
    }
  }

  /** 获取当前可行动的角色列表 */
  public getReadyUnits(): ATBUnit[] {
    return this.atbQueue.filter(u => u.actionReady);
  }

  /** 获取 ATB 行动条全量状态（供 UI 展示行动值进度） */
  public getAtbQueue(): ATBUnit[] {
    return this.atbQueue;
  }

  /** 获取 Hex 地图快照 */
  public getMap(): HexBattleMap {
    return this.map;
  }

  /** 获取回合日志 */
  public getLog(): string[] {
    return [...this.turnLog];
  }

  /** 角色移动到指定 Hex 格 */
  public moveCharacter(characterId: string, toQ: number, toR: number): void {
    const key = hexKey(toQ, toR);
    if (!this.map.tiles[key]) return;
    // 清除旧位置
    for (const tile of Object.values(this.map.tiles)) {
      if (tile.occupantId === characterId) {
        tile.occupantId = undefined;
        break;
      }
    }
    this.map.tiles[key]!.occupantId = characterId;
    this.turnLog.push(`${characterId} 移动到 (${toQ}, ${toR})`);
  }

  /** 为技能计算伤害预览（不做实际结算） */
  public previewDamage(
    attacker: Character,
    defender: Character,
    skill: Skill,
  ): { minDamage: number; maxDamage: number; armorPenetrationPercent: number } {
    // 简化预览：待 DamagePipeline 实现
    return { minDamage: 10, maxDamage: 20, armorPenetrationPercent: 30 };
  }

  /** 将角色放置到初始位置 */
  public placeCharacter(characterId: string, q: number, r: number): void {
    const key = hexKey(q, r);
    if (this.map.tiles[key]) {
      this.map.tiles[key]!.occupantId = characterId;
    }
  }

  /** 查找角色所在位置 */
  public findCharacterPosition(characterId: string): { q: number; r: number } | null {
    for (const tile of Object.values(this.map.tiles)) {
      if (tile.occupantId === characterId) {
        return { q: tile.q, r: tile.r };
      }
    }
    return null;
  }
}
