// ============================================================
// 补充任务：地点实体注册表（原子实体库）
// 与 npc-registry.ts 配套，为八卦（gossip-registry）、奇遇
// （adventure-events）提供可复用的具名地点。八卦/事件通过
// locationId 引用本表，避免硬编码地名。
// 引擎可据此做地点校验、地图标记与事件挂载：
//   - 事件触发条件（triggerCondition.nodeType）可与本表 type 对应
//   - NPC 的 homeLocationId 指向本表，形成"NPC 在哪"的世界图
// 注：本数据文件的接口为自包含定义，无对应 @taosim/contracts 类型
// ============================================================

export type LocationType =
  | 'City'        // 城池/城镇/宗门
  | 'Wilderness'  // 野外/山林/沼泽
  | 'Dungeon'     // 洞府/古墓/秘境
  | 'Landmark';   // 名胜/地标/传说之地

export interface GameLocation {
  id: string;                  // 如 'LOC_EAST_TEAHOUSE'
  name: string;                // 显示名（八卦/事件文本中应保持一致）
  type: LocationType;
  region: string;              // 所属大区域（如 '青云城' / '城郊' / '苍岭'）
  description: string;         // 一句话叙事（AI 场景养料）
  relatedNpcIds?: string[];    // 常驻/关联 NPC（npc-registry.ts）
}

export const LOCATION_REGISTRY: GameLocation[] = [
  // ==================== 青云城（City）====================
  {
    id: 'LOC_CITY',
    name: '青云城',
    type: 'City',
    region: '青云城',
    description: '青云宗脚下的主城，茶楼酒肆、坊市黑市一应俱全，三教九流汇聚之地。',
    relatedNpcIds: ['NPC_BEAST_RAVEN'],
  },
  {
    id: 'LOC_EAST_TEAHOUSE',
    name: '东街茶馆',
    type: 'City',
    region: '青云城',
    description: '瞎眼茶博士阿善的茶馆，茶香袅袅，是城里消息流通最快的地方。',
    relatedNpcIds: ['NPC_TEA_BLIND'],
  },
  {
    id: 'LOC_SOUTH_FORGE',
    name: '城南打铁铺',
    type: 'City',
    region: '青云城',
    description: '哑巴铁匠老锤的铺子，炉火终年不熄。后院那扇从不开的门里，传说藏着半部炼器古卷。',
    relatedNpcIds: ['NPC_FORGE_MUTE'],
  },
  {
    id: 'LOC_WEST_INN',
    name: '城西客栈',
    type: 'City',
    region: '青云城',
    description: '柳三娘的客栈，每逢雨夜便谢客。后院一口封死的井，锁着一个等不到的人。',
    relatedNpcIds: ['NPC_INN_WIDOW'],
  },
  {
    id: 'LOC_MARKET',
    name: '城南坊市',
    type: 'City',
    region: '青云城',
    description: '青云城最热闹的集市，丹药法器、灵草灵膳、真假物件皆在此流转。',
    relatedNpcIds: ['NPC_PILL_SELLER', 'NPC_MARKET_OLD', 'NPC_FOOD_STALL', 'NPC_MIRROR_SHOP'],
  },
  {
    id: 'LOC_OLD_TAVERN',
    name: '城南老酒馆',
    type: 'City',
    region: '青云城',
    description: '后院只有一口枯井的老酒馆，掌柜半夜掀开井盖钻进去，天亮前才出来。',
  },
  {
    id: 'LOC_NORTH_MINE',
    name: '城北灵矿',
    type: 'City',
    region: '青云城',
    description: '王守山名下的灵石矿，月产灵石七成不上账，暗流涌动。',
    relatedNpcIds: ['NPC_MINE_OWNER', 'NPC_SILENT_GUARD'],
  },
  {
    id: 'LOC_ORPHANAGE',
    name: '城东育幼堂',
    type: 'City',
    region: '青云城',
    description: '白发阿婆收养孤儿的育幼堂，院里六十个孩子笑声不断。',
    relatedNpcIds: ['NPC_ORPHAN_MASTER'],
  },
  {
    id: 'LOC_LIBRARY',
    name: '藏经阁',
    type: 'City',
    region: '青云城',
    description: '藏经阁顶层每逢子时有翻书声，上去却空无一人——据说是一位放不下书的元婴前辈。',
  },
  {
    id: 'LOC_ALCHEMIST_HUT',
    name: '城郊丹庐',
    type: 'City',
    region: '城郊',
    description: '疯癫丹师石疯子的丹庐，丹炉前总摆着几炉废渣，半夜有人看见他往炉里加血。',
    relatedNpcIds: ['NPC_ALCHEMIST_MAD'],
  },
  {
    id: 'LOC_SCHOLAR_FARM',
    name: '城郊农田',
    type: 'City',
    region: '城郊',
    description: '沈书生种的萝卜比人还高的田。上月萝卜成了精，半夜顶着土在田里跑。',
    relatedNpcIds: ['NPC_SCHOLAR_FARM'],
  },
  {
    id: 'LOC_VILLAGE',
    name: '城郊村落',
    type: 'City',
    region: '城郊',
    description: '求雨祭师老马所在的村落，村民靠天吃饭，也靠老马"心诚则灵"的雨。',
    relatedNpcIds: ['NPC_RAIN_PRIEST'],
  },
  {
    id: 'LOC_MOUNTAIN_COTTAGE',
    name: '山间草庐',
    type: 'City',
    region: '城郊',
    description: '玄真子的草庐，院里有只会打鸣报时还会记账的灵鸡。',
    relatedNpcIds: ['NPC_TAOIST_ROOSTER'],
  },
  {
    id: 'LOC_QAINGZHU_SECT',
    name: '青云宗',
    type: 'City',
    region: '青云城',
    description: '掌门云沧澜执掌的宗门，山门种满了他为亡妻栽的桃树。',
    relatedNpcIds: ['NPC_SECT_MASTER', 'NPC_ELDER_OLD', 'NPC_DISCIPLE_SECRET', 'NPC_SWORD_SERVANT', 'NPC_BEAST_CAT'],
  },
  {
    id: 'LOC_TEMPLE_POND',
    name: '城隍庙荷花池',
    type: 'City',
    region: '青云城',
    description: '会吐泡泡拼"快跑"的金色锦鲤所在的荷花池，老庙祝已吓得辞职。',
    relatedNpcIds: ['NPC_BEAST_CARP'],
  },

  // ==================== 野外（Wilderness）====================
  {
    id: 'LOC_GRAVEYARD',
    name: '城北乱葬岗',
    type: 'Wilderness',
    region: '城北',
    description: '鬼火磷光不散的乱葬岗，夜间常有黑袍人出没炼尸。',
  },
  {
    id: 'LOC_SHILI_SLOPE',
    name: '十里坡',
    type: 'Wilderness',
    region: '官道',
    description: '匪首黑牙劫道的地界，落单行人谈之色变。',
    relatedNpcIds: ['NPC_BANDIT_LEADER'],
  },
  {
    id: 'LOC_CANGLING',
    name: '苍岭',
    type: 'Wilderness',
    region: '苍岭',
    description: '狼王盘踞、铁背苍龙沉睡的深山，深处藏着龙珠的传说。',
    relatedNpcIds: ['NPC_BEAST_WOLF', 'NPC_BEAST_DRAGON'],
  },
  {
    id: 'LOC_SWAMP',
    name: '黑沼沼泽',
    type: 'Wilderness',
    region: '苍岭',
    description: '剧毒妖蟒的领地，瘴气常年不散，只有蜕皮期才有一线生机。',
    relatedNpcIds: ['NPC_BEAST_SERPENT'],
  },
  {
    id: 'LOC_PEACH_VALLEY',
    name: '城南桃谷',
    type: 'Wilderness',
    region: '城南',
    description: '桃树会移动的桃谷，深处藏着一扇漏出宝光的石门虚影。',
  },
  {
    id: 'LOC_MONKEY_MOUNTAIN',
    name: '猴山',
    type: 'Wilderness',
    region: '城郊',
    description: '会酿猴儿酒的猴群地盘，靠近的人会被猴子拎着酒坛追着灌。',
  },
  {
    id: 'LOC_FOREST',
    name: '幽林',
    type: 'Wilderness',
    region: '城郊',
    description: '三尾白狐骗人指路、会移动的老树所在的山林。',
    relatedNpcIds: ['NPC_BEAST_FOX'],
  },

  // ==================== 洞府/古墓/秘境（Dungeon）====================
  {
    id: 'LOC_ANCIENT_TOMB',
    name: '城北古墓',
    type: 'Dungeon',
    region: '城北',
    description: '夜有宝光的古墓，棺底血字"夺宝者死"，机关重重。',
  },
  {
    id: 'LOC_RUINED_TEMPLE',
    name: '荒废古刹',
    type: 'Dungeon',
    region: '城郊',
    description: '缺了半边脑袋的石佛歪在荒草间的破庙，哑尼慧净在此替人看病。',
    relatedNpcIds: ['NPC_NUN'],
  },
  {
    id: 'LOC_BLACK_MARKET',
    name: '黑市',
    type: 'Dungeon',
    region: '青云城',
    description: '城西赌坊柴房后暗门直通的黑市，仅三更至五更开放，什么都有，水很深。',
  },

  // ==================== 名胜/地标（Landmark）====================
  {
    id: 'LOC_QAINGZHU_SWORD_TOMB',
    name: '青竹山剑冢',
    type: 'Landmark',
    region: '青竹山',
    description: '百年来头一回发出剑鸣的剑冢，最深处传说插着天外神剑。',
  },
  {
    id: 'LOC_SWORD_WASHING_POOL',
    name: '洗剑池',
    type: 'Landmark',
    region: '青竹山',
    description: '池水常年不冻的洗剑池，池边打坐可孕养剑意，可"钓"起历代剑修的剑意残影。',
  },
  {
    id: 'LOC_FENGMING_MOUNTAIN',
    name: '凤鸣山',
    type: 'Landmark',
    region: '城南',
    description: '凤凰虚影冲天而起、满山梧桐一夜开花的山，山顶藏着凤凰巢的传说。',
  },
  {
    id: 'LOC_TEAR_SPRING',
    name: '泪泉',
    type: 'Landmark',
    region: '城郊',
    description: '传说中江女哭塌堤坝化成的泉，泉水微咸，掬水洗脸可洗净烦心事。',
  },
  {
    id: 'LOC_LOVER_BRIDGE',
    name: '情人桥',
    type: 'Landmark',
    region: '山涧',
    description: '传说一对恋人桥上执手同飞升的石桥，如今情侣过桥都要牵着手。',
  },
  {
    id: 'LOC_MATCHMAKER_TREE',
    name: '村口月老树',
    type: 'Landmark',
    region: '城郊村落',
    description: '树干缠满褪色红绳的老树，每年七夕结出会发光的红果，摘到的有情人来年必成眷属。',
  },
  {
    id: 'LOC_TIANCHI',
    name: '天池',
    type: 'Landmark',
    region: '雪峰',
    description: '传说仙人下棋的天池，六十年一遇的天象会在池水中映出仙人对弈的残局。',
  },
  {
    id: 'LOC_MIRROR_LAKE',
    name: '镜湖',
    type: 'Landmark',
    region: '群山',
    description: '湖水平整如镜的湖泊，湖底沉着一条翻覆的商船与五彩灵石。',
  },
  {
    id: 'LOC_SPIRIT_SPRING',
    name: '灵泉',
    type: 'Landmark',
    region: '群山',
    description: '泉眼深处卡着发光灵石的山间灵泉，泉边生着炼丹上好的灵草。',
  },
  {
    id: 'LOC_FLOATING_ISLAND',
    name: '悬空浮岛',
    type: 'Landmark',
    region: '云海',
    description: '云海中倒悬的浮岛，岛心有一座通体漆黑的八角石塔，塔顶亮着灯。',
  },
];

// ---- 查询函数 ----

/** 按 id 获取地点 */
export function getLocationById(id: string): GameLocation | undefined {
  return LOCATION_REGISTRY.find(l => l.id === id);
}

/** 按类型获取地点池 */
export function getLocationsByType(type: LocationType): GameLocation[] {
  return LOCATION_REGISTRY.filter(l => l.type === type);
}

/** 按区域获取地点池 */
export function getLocationsByRegion(region: string): GameLocation[] {
  return LOCATION_REGISTRY.filter(l => l.region === region);
}
