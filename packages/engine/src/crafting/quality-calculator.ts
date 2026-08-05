import type { ItemTemplate, ItemQuality, SpecialEffectType, AttributeMap } from '@taosim/contracts';

const QUALITY_MULTIPLIER: Record<ItemQuality, number> = {
  Common: 1.0,
  Rare: 1.5,
  Epic: 2.5,
  Legendary: 5.0,
};

const SPECIAL_EFFECTS: SpecialEffectType[] = [
  'SOUL_GUARD', 'BLOOD_THIRST', 'MANA_SHIELD',
  'QUICK_STRIKE', 'PHOENIX_REBIRTH', 'VITALITY_SIPHON',
];

export class QualityCalculator {
  static applyQuality(template: ItemTemplate, quality: ItemQuality): AttributeMap {
    const mult = QUALITY_MULTIPLIER[quality];
    const result: AttributeMap = {};
    for (const [key, value] of Object.entries(template.baseAttributes)) {
      result[key as keyof AttributeMap] = Math.floor((value as number) * mult);
    }
    return result;
  }

  static getMaxQualityForTier(tier: number): ItemQuality {
    return tier <= 1 ? 'Rare' : 'Legendary';
  }

  static rollSpecialEffect(): SpecialEffectType {
    return SPECIAL_EFFECTS[Math.floor(Math.random() * SPECIAL_EFFECTS.length)]!;
  }

  static rollQuality(rng: () => number = Math.random): ItemQuality {
    const r = rng();
    if (r < 0.01) return 'Legendary';
    if (r < 0.11) return 'Epic';
    if (r < 0.40) return 'Rare';
    return 'Common';
  }

  static rollQualityMaster(rng: () => number = Math.random): ItemQuality {
    const r = rng();
    if (r < 0.05) return 'Legendary';
    if (r < 0.30) return 'Epic';
    return 'Rare';
  }

  static rollPillQuality(rng: () => number = Math.random): ItemQuality {
    const r = rng();
    if (r < 0.05) return 'Legendary';
    if (r < 0.20) return 'Epic';
    if (r < 0.50) return 'Rare';
    return 'Common';
  }
}
