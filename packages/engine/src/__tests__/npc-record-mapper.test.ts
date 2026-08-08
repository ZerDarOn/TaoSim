import { describe, it, expect } from 'vitest';
import { NPCGenerator } from '../interaction/npc-generator.js';
import {
  characterToNpcRecord,
  npcRecordToCharacter,
  realmTier,
} from '../world/npc-record-mapper.js';
import type { Character } from '@taosim/contracts';

describe('npc-record-mapper', () => {
  it('realmTier 按境界推导档位', () => {
    expect(realmTier('QiRefinement_5')).toBe(1);
    expect(realmTier('Foundation_2')).toBe(2);
    expect(realmTier('GoldenCore_1')).toBe(3);
    expect(realmTier('NascentSoul_3')).toBe(4);
    expect(realmTier('SoulFormation_1')).toBe(5);
  });

  it('归档：Character → NpcRecord 精简字段', () => {
    const character: Character = NPCGenerator.generate(3, 42);
    const record = characterToNpcRecord(character, 7, 5);

    expect(record.id).toBe(character.id);
    expect(record.name).toBe(character.name);
    expect(record.realm).toBe(character.realm);
    expect(record.spiritRoot).toEqual(character.spiritRoot);
    expect(record.attributes).toEqual(character.attributes);
    expect(record.lifespan).toEqual(character.lifespan);
    expect(record.skillIds).toEqual(character.skills.map(s => s.id));
    expect(record.skillIds.length).toBeGreaterThan(0);
    expect(record.birthYear).toBe(7);
    expect(record.birthMonth).toBe(5);
  });

  it('展开：NpcRecord → 完整 Character（技能找回、战斗数值推导）', () => {
    const character: Character = NPCGenerator.generate(3, 42);
    const record = characterToNpcRecord(character, 7, 5);
    const expanded = npcRecordToCharacter(record);

    expect(expanded.name).toBe(character.name);
    expect(expanded.realm).toBe(character.realm);
    expect(expanded.spiritRoot).toEqual(character.spiritRoot);
    expect(expanded.attributes).toEqual(character.attributes);
    // 技能从注册表按 id 找回
    expect(expanded.skills.map(s => s.id).sort()).toEqual(record.skillIds.slice().sort());
    // 战斗数值按境界推导
    const tier = realmTier(record.realm);
    expect(expanded.maxHp).toBe(100 + tier * 80 + character.attributes.physique * 5);
    expect(expanded.canFly).toBe(tier >= 3);
  });

  it('往返：归档再展开保留身份/灵根/属性', () => {
    const character: Character = NPCGenerator.generate(1, 99);
    const record = characterToNpcRecord(character, 3, 6);
    const expanded = npcRecordToCharacter(record);

    expect(expanded.id).toBe(character.id);
    expect(expanded.name).toBe(character.name);
    expect(expanded.gender).toBe(character.gender);
    expect(expanded.spiritRoot.grade).toBe(character.spiritRoot.grade);
    expect(expanded.attributes).toEqual(character.attributes);
  });
});
