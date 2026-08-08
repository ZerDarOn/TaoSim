import type { Character, Item } from '@taosim/contracts';

export interface EquipResult {
  success: boolean;
  reason?: string;
}

export interface CombatBonuses {
  attack: number;
  defense: number;
  critRate: number;
  physique: number;
  comprehension: number;
  perception: number;
  agility: number;
  luck: number;
}

type SlotKey = 'weapon' | 'armor';

export class EquipmentManager {
  static equip(character: Character, item: Item): EquipResult {
    if (item.type !== 'Equipment') return { success: false, reason: '非装备物品' };

    const stackIdx = character.inventory.findIndex(s => s.item.id === item.id);
    if (stackIdx === -1) return { success: false, reason: '背包中无此物品' };
    const stack = character.inventory[stackIdx]!;
    if (stack.count <= 0) return { success: false, reason: '物品数量不足' };
    stack.count--;
    if (stack.count === 0) character.inventory.splice(stackIdx, 1);

    const slot = this.determineSlot(item);
    if (slot === 'treasures') {
      const old = character.equipmentSlots.treasures.find(t => t.id === item.id);
      if (old) return { success: false, reason: '已装备该法宝' };
      if (character.equipmentSlots.treasures.length >= 3) {
        const removed = character.equipmentSlots.treasures.shift()!;
        this.addToInventory(character, removed);
      }
      character.equipmentSlots.treasures.push(item);
    } else {
      const old = character.equipmentSlots[slot];
      if (old) {
        this.addToInventory(character, old);
      }
      character.equipmentSlots[slot] = item;
    }

    return { success: true };
  }

  static unequip(character: Character, slot: 'weapon' | 'armor' | 'treasures', itemId?: string): EquipResult {
    if (slot === 'treasures') {
      if (itemId) {
        const idx = character.equipmentSlots.treasures.findIndex(t => t.id === itemId);
        if (idx === -1) return { success: false, reason: '未装备该法宝' };
        const removed = character.equipmentSlots.treasures.splice(idx, 1)[0]!;
        this.addToInventory(character, removed);
      } else {
        return { success: false, reason: '请指定法宝 ID' };
      }
    } else {
      const item = character.equipmentSlots[slot];
      if (!item) return { success: false, reason: '该槽位为空' };
      character.equipmentSlots[slot] = undefined;
      this.addToInventory(character, item);
    }
    return { success: true };
  }

  static getCombatBonuses(character: Character): CombatBonuses {
    const bonuses: CombatBonuses = {
      attack: 0, defense: 0, critRate: 0,
      physique: 0, comprehension: 0, perception: 0, agility: 0, luck: 0,
    };

    const allEquipped: Item[] = [];
    if (character.equipmentSlots.weapon) allEquipped.push(character.equipmentSlots.weapon);
    if (character.equipmentSlots.armor) allEquipped.push(character.equipmentSlots.armor);
    allEquipped.push(...character.equipmentSlots.treasures);

    for (const item of allEquipped) {
      const attrs = item.attributes;
      if (attrs.attack) bonuses.attack += attrs.attack;
      if (attrs.defense) bonuses.defense += attrs.defense;
      if (attrs.critRate) bonuses.critRate += attrs.critRate;
      if (attrs.physique) bonuses.physique += attrs.physique;
      if (attrs.comprehension) bonuses.comprehension += attrs.comprehension;
      if (attrs.perception) bonuses.perception += attrs.perception;
      if (attrs.agility) bonuses.agility += attrs.agility;
      if (attrs.luck) bonuses.luck += attrs.luck;
    }

    // 词条（先天气运）战斗加成合并
    if (character.traitBonuses) {
      bonuses.attack += character.traitBonuses.attack ?? 0;
      bonuses.defense += character.traitBonuses.defense ?? 0;
      bonuses.critRate += character.traitBonuses.critRate ?? 0;
    }

    return bonuses;
  }

  private static determineSlot(item: Item): SlotKey | 'treasures' {
    if (item.attributes.attack && !item.attributes.defense) return 'weapon';
    if (item.attributes.defense && !item.attributes.attack) return 'armor';
    return 'treasures';
  }

  private static addToInventory(character: Character, item: Item): void {
    const existing = character.inventory.find(s => s.item.id === item.id);
    if (existing) {
      existing.count++;
    } else {
      character.inventory.push({ item, count: 1 });
    }
  }
}
