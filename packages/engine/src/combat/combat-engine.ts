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

  /** ATB Tick：各角色根据身法累加行动值 */
  public tickATB(characters: Record<string, Character>): void {
    for (const unit of this.atbQueue) {
      const character = characters[unit.characterId];
      if (!character || character.hp <= 0) continue;
      unit.gauge += 10 + character.attributes.agility * 2;
      if (unit.gauge >= 100) {
        unit.gauge = 0;
        unit.actionReady = true;
      }
    }
  }

  /** 获取当前可行动的角色列表 */
  public getReadyUnits(): ATBUnit[] {
    return this.atbQueue.filter(u => u.actionReady);
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
}
