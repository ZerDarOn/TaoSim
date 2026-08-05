import type { Character, Faction, FactionRank } from '@taosim/contracts';

export interface ActionResult {
  success: boolean;
  reason?: string;
}

const RANK_THRESHOLDS: Record<FactionRank, number> = {
  Disciple: 0,
  Deacon: 500,
  Elder: 2000,
  Leader: 5000,
};

const RANK_ORDER: FactionRank[] = ['Disciple', 'Deacon', 'Elder', 'Leader'];

export class FactionEngine {
  static joinFaction(character: Character, faction: Faction): ActionResult {
    if (character.factionId) return { success: false, reason: '已有宗门归属' };
    character.factionId = faction.id;
    character.factionRank = 'Disciple';
    faction.members.push(character.id);
    return { success: true };
  }

  static leaveFaction(character: Character, faction: Faction): ActionResult {
    if (!character.factionId || character.factionId !== faction.id) {
      return { success: false, reason: '非本宗门成员' };
    }
    character.factionId = undefined;
    character.factionRank = undefined;
    faction.members = faction.members.filter(id => id !== character.id);
    // 背叛会导致通缉
    character.wantedLevels[faction.id] = (character.wantedLevels[faction.id] ?? 0) + 3;
    return { success: true };
  }

  static contribute(faction: Faction, amount: number): ActionResult {
    if (amount <= 0) return { success: false, reason: '无效贡献' };
    faction.treasurySpiritStones += amount;
    return { success: true };
  }

  static promote(character: Character, contribution: number): ActionResult {
    if (!character.factionRank) return { success: false, reason: '非宗门成员' };

    const currentIdx = RANK_ORDER.indexOf(character.factionRank);
    if (currentIdx === -1 || currentIdx >= RANK_ORDER.length - 1) {
      return { success: false, reason: '已是最高阶位' };
    }

    const nextRank = RANK_ORDER[currentIdx + 1]!;
    const threshold = RANK_THRESHOLDS[nextRank]!;

    if (contribution < threshold) {
      return { success: false, reason: `贡献度不足（需 ${threshold}）` };
    }

    character.factionRank = nextRank;
    return { success: true };
  }
}
