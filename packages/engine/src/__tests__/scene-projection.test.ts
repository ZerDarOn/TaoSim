import { describe, it, expect } from 'vitest';
import { NPCGenerator } from '../interaction/npc-generator.js';
import { characterToNpcRecord, npcRecordToCharacter, realmTier } from '../world/npc-record-mapper.js';
import { expandForScene } from '../world/scene-projection.js';
import type { PersistentCondition } from '@taosim/contracts';

/** 构造一个有效的 NpcRecord 测试夹具（经 NPCGenerator → 归档路径，确保字段完整） */
function makeFixtureRecord() {
  const character = NPCGenerator.generate(3, 42);
  return characterToNpcRecord(character, 7, 5);
}

/** 构造一份长期状态（默认无伤势、无毒素、经脉完好） */
function makeCondition(over: Partial<PersistentCondition> = {}): PersistentCondition {
  return {
    injuries: [],
    poisons: [],
    meridianDamage: 0,
    ...over,
  };
}

describe('scene-projection / expandForScene', () => {
  it('基础投影：expandForScene 返回有效 Character', () => {
    const record = makeFixtureRecord();
    const c = expandForScene(record, { sceneType: 'dialog' });

    expect(c).toBeDefined();
    expect(c.id).toBe(record.id);
    expect(c.name).toBe(record.name);
    // 与 npcRecordToCharacter 的基础结果一致
    const direct = npcRecordToCharacter(record);
    expect(c.maxHp).toBe(direct.maxHp);
    expect(c.hp).toBe(direct.hp);
    expect(c.spiritEnergy).toEqual(direct.spiritEnergy);
  });

  it('确定性：同一 record + 同一 options 两次调用结果一致', () => {
    const record = makeFixtureRecord();
    const options = {
      sceneType: 'battle' as const,
      condition: makeCondition({
        injuries: [
          { level: 'moderate', source: 'duel', acquiredAt: { year: 7, month: 1 } },
        ],
        meridianDamage: 20,
      }),
      currentTime: { year: 7, month: 5 },
    };
    const a = expandForScene(record, options);
    const b = expandForScene(record, options);

    expect(a).toEqual(b);
    expect(a.maxHp).toBe(b.maxHp);
    expect(a.hp).toBe(b.hp);
    expect(a.spiritEnergy).toEqual(b.spiritEnergy);
  });

  it('伤势影响：moderate 伤势扣减 15 maxHp，hp 不超过新 maxHp', () => {
    const record = makeFixtureRecord();
    const baseChar = npcRecordToCharacter(record);

    const c = expandForScene(record, {
      sceneType: 'battle',
      condition: makeCondition({
        injuries: [
          { level: 'moderate', source: 'duel', acquiredAt: { year: 7, month: 1 } },
        ],
      }),
      currentTime: { year: 7, month: 5 },
    });

    expect(c.maxHp).toBe(baseChar.maxHp - 15);
    // 基础 hp 等于原 maxHp，扣减后应被钳制到新 maxHp
    expect(c.hp).toBe(c.maxHp);
    expect(c.hp).toBeLessThanOrEqual(c.maxHp);
  });

  it('伤势已恢复：recoversAt 早于 currentTime 的伤势不扣减', () => {
    const record = makeFixtureRecord();
    const baseChar = npcRecordToCharacter(record);

    // 伤势在 year:7 month:3 恢复，当前 year:7 month:5 → 已恢复
    const c = expandForScene(record, {
      sceneType: 'battle',
      condition: makeCondition({
        injuries: [
          {
            level: 'severe',
            source: 'duel',
            acquiredAt: { year: 7, month: 1 },
            recoversAt: { year: 7, month: 3 },
          },
        ],
      }),
      currentTime: { year: 7, month: 5 },
    });

    // 已恢复伤势不扣减
    expect(c.maxHp).toBe(baseChar.maxHp);
    expect(c.hp).toBe(baseChar.hp);
  });

  it('经脉损伤：meridianDamage=50 时灵力上限减半', () => {
    const record = makeFixtureRecord();
    const baseChar = npcRecordToCharacter(record);

    const c = expandForScene(record, {
      sceneType: 'battle',
      condition: makeCondition({ meridianDamage: 50 }),
    });

    const expectedMax = Math.max(1, baseChar.spiritEnergy.max - Math.floor(baseChar.spiritEnergy.max * 50 / 100));
    expect(c.spiritEnergy.max).toBe(expectedMax);
    expect(c.spiritEnergy.current).toBe(c.spiritEnergy.max);
  });

  it('场景差异：dialog 场景不应用伤势修正，battle 场景应用', () => {
    const record = makeFixtureRecord();
    const baseChar = npcRecordToCharacter(record);
    const condition = makeCondition({
      injuries: [
        { level: 'moderate', source: 'duel', acquiredAt: { year: 7, month: 1 } },
      ],
    });

    const dialogChar = expandForScene(record, { sceneType: 'dialog', condition });
    const battleChar = expandForScene(record, { sceneType: 'battle', condition });

    // dialog 不应用伤势
    expect(dialogChar.maxHp).toBe(baseChar.maxHp);
    // battle 扣减 15
    expect(battleChar.maxHp).toBe(baseChar.maxHp - 15);
    expect(battleChar.maxHp).toBeLessThan(dialogChar.maxHp);
  });

  it('不修改原 record：expandForScene 调用后 record 字段不变', () => {
    const record = makeFixtureRecord();
    // 深拷贝留底
    const snapshot = JSON.parse(JSON.stringify(record));

    expandForScene(record, {
      sceneType: 'battle',
      condition: makeCondition({
        injuries: [
          { level: 'severe', source: 'duel', acquiredAt: { year: 7, month: 1 } },
        ],
        meridianDamage: 30,
      }),
      currentTime: { year: 7, month: 5 },
    });

    expect(record).toEqual(snapshot);
    expect(record.attributes).toEqual(snapshot.attributes);
    expect(record.relations).toEqual(snapshot.relations);
  });
});
