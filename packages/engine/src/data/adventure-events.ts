// ============================================================
// 任务 2：奇遇事件库
// 50 个事件：cultivation ×10 / exploration ×10 / social ×8
//           combat ×8 / fortune ×7 / misfortune ×7
// 风格参考：鬼谷八荒式的随机事件叙事，修仙小说氛围
// ============================================================

import type { AttributeKey } from '@taosim/contracts';

export type AdventureOutcomeType =
  | 'exp' | 'spiritStones' | 'item' | 'skill' | 'recipe' | 'hp' | 'attribute' | 'favorability' | 'death';

export interface AdventureOutcome {
  type: AdventureOutcomeType;
  // 数值或 itemId / recipeId / skillId
  value: number | string;
  // type 为 'attribute' 时指定生效的属性键
  attribute?: AttributeKey;
  // 0-1，默认 1.0（必定发生）
  probability?: number;
}

export interface AdventureChoice {
  label: string;
  description: string;               // 选择后的结果描述（2-3 句叙事）
  outcomes: AdventureOutcome[];
  // 选项前置条件（可选）
  condition?: {
    minRealm?: string;
    minLuck?: number;
    minAttribute?: string;           // 如 'physique'，需配合 minValue
    minValue?: number;
  };
  lockedText?: string;               // 条件不满足时的替代文字
}

export interface AdventureEvent {
  id: string;                        // 如 'EVT_HERMIT_GIFT'
  title: string;
  category: 'cultivation' | 'exploration' | 'social' | 'combat' | 'fortune' | 'misfortune';
  description: string;               // 2-4 句修仙风格叙事
  triggerCondition?: {
    minRealm?: string;
    minLuck?: number;
    minCharm?: number;
    nodeType?: string;               // 'City' | 'Wilderness' | 'Dungeon' 等
    probability: number;             // 0-1 触发概率
  };
  choices: AdventureChoice[];        // 2-4 个选项
  // —— 原子引用（v2）：引用实体注册表，事件与 NPC/地点解耦，可复用 ——
  // 引擎可据此在指定地点触发、与指定 NPC 交互，或做实体校验
  npcId?: string;                    // 事件主要涉及的 NPC（npc-registry.ts）
  locationId?: string;               // 事件发生地点（location-registry.ts）
}

export const ADVENTURE_EVENTS: AdventureEvent[] = [
  // ============================================================
  // 【一】cultivation 修炼类 ×10
  // ============================================================
  {
    id: 'EVT_CULT_INSIGHT',
    title: '顿悟之夜',
    category: 'cultivation',
    description:
      '今夜山风清冽，你于洞府外石台打坐。月光洒落，忽然心念一动，诸多功法关窍竟在此刻豁然开朗，如同云开见月。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.25 },
    choices: [
      {
        label: '静心参悟',
        description: '你摒弃杂念，任由那缕灵光在识海中生根发芽。一夜之间修为突飞猛进，只觉体内灵力滚滚如江河。',
        outcomes: [
          { type: 'exp', value: 120 },
          { type: 'exp', value: 80, probability: 0.4 },
        ],
      },
      {
        label: '提笔记下感悟',
        description: '你取出随身纸笔，将今夜所思尽数录下。虽误了参悟的时辰，却换来一份日后时时参详的心得。',
        outcomes: [
          { type: 'attribute', attribute: 'comprehension', value: 1 },
          { type: 'exp', value: 40 },
        ],
      },
      {
        label: '就此歇息',
        description: '你不敢贪功，早早回洞安歇。一夜无梦，精神饱满，明日再图精进。',
        outcomes: [{ type: 'exp', value: 20 }],
      },
    ],
  },
  {
    id: 'EVT_CULT_DEVIATION',
    title: '走火入魔',
    category: 'cultivation',
    description:
      '闭关之中，灵力忽然逆行冲撞经脉，丹田燥热如火。你心知是急于求成、根基不稳之故，此刻气机紊乱，稍有不慎便是修为尽毁。',
    triggerCondition: { minRealm: 'QiRefinement_3', nodeType: 'City', probability: 0.2 },
    choices: [
      {
        label: '强行镇压',
        description: '你咬牙运转灵力与心魔相抗，额角青筋暴起。半个时辰后气机终于平复，却已元气大伤，经脉隐隐作痛。',
        outcomes: [
          { type: 'exp', value: 60 },
          { type: 'hp', value: -30 },
        ],
      },
      {
        label: '运转口诀疏导',
        description: '你想起师门所授的静心口诀，一点点引动逆行之气归位。虽损耗些时日，总算无碍。',
        condition: { minRealm: 'QiRefinement_5' },
        lockedText: '境界不足，尚不能领悟此口诀的奥妙。',
        outcomes: [
          { type: 'exp', value: 30 },
          { type: 'attribute', attribute: 'perception', value: 1 },
        ],
      },
      {
        label: '服下随身丹药',
        description: '你摸出一枚温养经脉的丹药吞下，药力化开，如甘霖浇灌焦土。心魔退散，此番有惊无险。',
        outcomes: [
          { type: 'item', value: 'MAT_BLOOD_FLOWER', probability: 0.6 },
          { type: 'hp', value: -10 },
        ],
      },
    ],
  },
  {
    id: 'EVT_CULT_ELDER_GUIDANCE',
    title: '前辈指点',
    category: 'cultivation',
    description:
      '城中茶楼偶遇一位鹤发童颜的老修士，他看你两眼，抚须而笑："小友骨骼清奇，只是修行路上走岔了一步，可惜，可惜。"',
    triggerCondition: { nodeType: 'City', probability: 0.3 },
    choices: [
      {
        label: '上前虚心求教',
        description: '你躬身行礼，言辞恳切。老修士颇为受用，与你论道半日，寥寥数语便点破你修行多年未曾想通的关窍。',
        outcomes: [
          { type: 'exp', value: 150 },
          { type: 'favorability', value: 20 },
        ],
      },
      {
        label: '奉上灵石求指点',
        description: '你双手奉上一袋灵石，老修士眉眼舒展，指点得格外用心，连你未曾问及的瓶颈都一并提点。',
        outcomes: [
          { type: 'spiritStones', value: -50 },
          { type: 'exp', value: 220 },
        ],
      },
      {
        label: '道谢离去',
        description: '你谢过好意，不敢叨扰前辈清修。老修士也不在意，只留下一句"缘法未到"便飘然而去。',
        outcomes: [{ type: 'exp', value: 30 }],
      },
    ],
  },
  {
    id: 'EVT_CULT_SPIRIT_VEIN',
    title: '灵脉涌动',
    category: 'cultivation',
    description:
      '行至一座荒山，脚下忽然传来隆隆异响。山腹中灵光隐现，竟是一条沉睡多年的灵脉在此刻苏醒，浓郁灵气如山泉般喷涌而出。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.2 },
    choices: [
      {
        label: '就地打坐吸纳',
        description: '你盘膝坐于灵脉之上，疯狂汲取精纯灵气。衣袍鼓荡，发丝飞扬，修为以肉眼可见的速度攀升。',
        outcomes: [
          { type: 'exp', value: 200 },
          { type: 'hp', value: -20, probability: 0.3 },
        ],
      },
      {
        label: '掘取灵脉矿石',
        description: '你取出工具凿开岩层，灵光四溅。矿石虽失了脉气，却仍是上等的炼器材料。',
        outcomes: [{ type: 'item', value: 'MAT_SPIRIT_STONE', probability: 0.7 }],
      },
      {
        label: '布阵守护慢慢采',
        description: '你谨慎地布下聚灵阵，欲将灵脉封存细水长流。然阵法尚未成形，灵气便已四散，只捞得些许余韵。',
        outcomes: [
          { type: 'exp', value: 60 },
          { type: 'spiritStones', value: 30 },
        ],
      },
    ],
  },
  {
    id: 'EVT_CULT_TRANCE',
    title: '入定参禅',
    category: 'cultivation',
    description:
      '你在静室中点燃一支檀香，心神渐渐沉入一片澄澈空明之境。梵音隐约，天地法则的纹理在眼前缓缓展开，仿佛触手可及。',
    triggerCondition: { minLuck: 60, nodeType: 'City', probability: 0.25 },
    choices: [
      {
        label: '沉浸于法则之海',
        description: '你放任神识在法则海洋中遨游，一花一世界，一叶一菩提。待到回神，竟已过去三日，收获却远超三年苦修。',
        outcomes: [
          { type: 'exp', value: 300 },
          { type: 'hp', value: -20 },
        ],
      },
      {
        label: '只取一缕道韵',
        description: '你知贪多嚼不烂，只截取一缕道韵细细体味。虽收获平平，却为日后留下了参悟的种子。',
        outcomes: [
          { type: 'exp', value: 80 },
          { type: 'attribute', attribute: 'comprehension', value: 1 },
        ],
      },
      {
        label: '强行挣脱入定',
        description: '你唯恐深陷其中难以自拔，强行掐断神识。一阵头晕目眩之后，倒也算全身而退。',
        outcomes: [{ type: 'exp', value: 30 }],
      },
    ],
  },
  {
    id: 'EVT_CULT_SWORD_INTENT',
    title: '剑气感悟',
    category: 'cultivation',
    description:
      '瀑布之下，一柄无名古剑插于青石之上，剑身虽锈迹斑斑，却有一缕凌厉剑气萦绕不去，仿佛在诉说着它当年的锋芒。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.3 },
    choices: [
      {
        label: '以手触剑参悟',
        description: '指尖触及剑身的刹那，一道剑意贯入识海。你于剑意幻境中看见一位持剑老者斩碎星辰的一剑，久久无言。',
        outcomes: [
          { type: 'exp', value: 180 },
          { type: 'attribute', attribute: 'perception', value: 1, probability: 0.5 },
        ],
      },
      {
        label: '拔剑一试锋芒',
        description: '你双手握住剑柄用力拔出，锈剑铮然长鸣，剑光如水。此剑虽旧，锋锐不减当年。',
        outcomes: [
          { type: 'item', value: 'ITEM_IRON_SWORD', probability: 0.4 },
          { type: 'exp', value: 60 },
        ],
      },
      {
        label: '敬香离去',
        description: '你对此剑执礼一拜，心中默念"前辈剑意长存"，然后转身离去，不留因果。',
        outcomes: [{ type: 'exp', value: 40 }],
      },
    ],
  },
  {
    id: 'EVT_CULT_HEART_DEMON',
    title: '心魔作祟',
    category: 'cultivation',
    description:
      '夜半打坐，识海深处忽然涌起重重幻象。你在幻境中看见自己名震天下，又看见自己跌落凡尘——执念化作心魔，缠上了你的道心。',
    triggerCondition: { probability: 0.2 },
    choices: [
      {
        label: '直面心魔',
        description: '你坦然面对自己的贪欲与恐惧，任其如潮水般冲刷道心。幻象破碎的瞬间，道心愈发通明。',
        condition: { minAttribute: 'comprehension', minValue: 8 },
        lockedText: '悟性不足，尚无法勘破虚妄。',
        outcomes: [
          { type: 'exp', value: 150 },
          { type: 'hp', value: -40, probability: 0.4 },
        ],
      },
      {
        label: '诵念清心咒',
        description: '你盘膝而坐，一遍遍诵念清心咒。心魔虽强，终究不敌你稳如磐石的定力，缓缓退去。',
        outcomes: [
          { type: 'hp', value: -15 },
          { type: 'exp', value: 50 },
        ],
      },
      {
        label: '暂避锋芒',
        description: '你不敢硬撼心魔，强收功休息。心魔虽蛰伏，却在你道心上留下一道浅浅的裂痕。',
        outcomes: [
          { type: 'hp', value: -10 },
          { type: 'exp', value: -20 },
        ],
      },
    ],
  },
  {
    id: 'EVT_CULT_RIVER_DAO',
    title: '观水悟道',
    category: 'cultivation',
    description:
      '你驻足长河之畔，看滔滔江水奔涌不息。水无常形，随物而变，这一瞬你仿佛看见了自己修行路上一味求快、失了圆融的偏执。',
    choices: [
      {
        label: '临水盘膝静观',
        description: '你索性盘坐河畔，任水声入耳，观浪起浪落整整一日。再睁眼时，眸中多了一分不疾不徐的从容。',
        outcomes: [
          { type: 'exp', value: 100 },
          { type: 'attribute', attribute: 'comprehension', value: 1, probability: 0.4 },
        ],
      },
      {
        label: '掬水而饮',
        description: '你掬起一捧清水饮下，清冽入喉。水中竟含一丝稀薄灵气，涤荡经脉，神清气爽。',
        outcomes: [
          { type: 'hp', value: 20 },
          { type: 'spiritStones', value: 10 },
        ],
      },
    ],
  },
  {
    id: 'EVT_CULT_STAR_GAZE',
    title: '夜观星象',
    category: 'cultivation',
    description:
      '荒野夜寒，你仰卧高岗之上仰望星河。北斗闪烁，周天星斗运转有序，其间仿佛暗合一门旷世功法的行功路线。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.2 },
    choices: [
      {
        label: '夜以继日参详',
        description: '你对着星图冥思苦想，渐渐在脑海中勾勒出一条迥异于常法的行功路线。虽未能尽数参透，却已获益良多。',
        outcomes: [
          { type: 'exp', value: 140 },
          { type: 'hp', value: -10 },
        ],
      },
      {
        label: '闭目感悟周天',
        description: '你闭目凝神，以神识循着星斗运转的轨迹在体内运转周天，竟与平时行功大相径庭，灵力隐隐有突破之兆。',
        outcomes: [
          { type: 'exp', value: 90 },
          { type: 'attribute', attribute: 'perception', value: 1, probability: 0.5 },
        ],
      },
    ],
  },
  {
    id: 'EVT_CULT_BODY_REFINE',
    title: '天地灵气灌体',
    category: 'cultivation',
    description:
      '秘境深处，一道七彩灵光自天穹垂落，正罩在你身上。磅礴的天地灵气如潮水般涌入你的四肢百骸，每一寸血肉都在发出欢鸣。',
    triggerCondition: { nodeType: 'Dungeon', probability: 0.15 },
    choices: [
      {
        label: '放开心神承受',
        description: '你敞开心扉任灵气冲刷，骨骼咔咔作响，血肉重塑。痛楚与畅快交织，肉身强度有了质的飞跃。',
        outcomes: [
          { type: 'attribute', attribute: 'physique', value: 2 },
          { type: 'hp', value: -30, probability: 0.4 },
        ],
      },
      {
        label: '引导灵气入丹田',
        description: '你小心翼翼地将灵气引入丹田炼化，虽只得十之二三，修为却稳步精进。',
        outcomes: [{ type: 'exp', value: 180 }],
      },
      {
        label: '以玉瓶收取灵光',
        description: '你取出玉瓶欲收取这道灵光，却不想灵光有灵，你只能截下一缕存入瓶中。',
        outcomes: [{ type: 'item', value: 'MAT_STARLIGHT', probability: 0.6 }],
      },
    ],
  },

  // ============================================================
  // 【二】exploration 探索类 ×10
  // ============================================================
  {
    id: 'EVT_EXP_ANCIENT_CAVE',
    title: '上古洞府',
    category: 'exploration',
    description:
      '藤蔓掩映的山壁上，一道古朴石门半掩于云雾中，门楣上刻着三个古篆："听雪斋"。石缝间渗出丝丝寒气，不知已封存多少年月。',
    triggerCondition: { nodeType: 'Dungeon', probability: 0.2 },
    choices: [
      {
        label: '推开石门探索',
        description: '石门应声而开，洞中石桌、蒲团俱全，积灰之下竟还摆着一只未开封的玉匣。只是寒气刺骨，越往里走越难坚持。',
        outcomes: [
          { type: 'item', value: 'MAT_JADE', probability: 0.8 },
          { type: 'hp', value: -20, probability: 0.5 },
        ],
      },
      {
        label: '以神识探路',
        description: '你放出神识小心探查，避开机关暗格，在最深处的暗格里摸到一本泛黄的功法残卷。',
        condition: { minAttribute: 'perception', minValue: 8 },
        lockedText: '神识太弱，探不清洞府深处的虚实。',
        outcomes: [
          { type: 'exp', value: 200 },
          { type: 'spiritStones', value: 100 },
        ],
      },
      {
        label: '记下位置退走',
        description: '你自忖修为尚浅，记下此间方位后悄然退走，留待日后修为有成再来一探。',
        outcomes: [{ type: 'exp', value: 20 }],
      },
    ],
  },
  {
    id: 'EVT_EXP_TORN_SCRIPT',
    title: '残破功法',
    category: 'exploration',
    description:
      '一处新塌的土坡下，半卷残破的兽皮露出土外。皮上字迹古朴苍劲，隐约可见"太玄真解"四字，只是缺页少字，难以通读。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.3 },
    choices: [
      {
        label: '拾起仔细研读',
        description: '你以灵力托起兽皮逐字辨认，虽残缺不全，却仍能窥见其中深奥道法的一角，颇有收获。',
        outcomes: [
          { type: 'exp', value: 120 },
          { type: 'hp', value: -20, probability: 0.3 },
        ],
      },
      {
        label: '焚香祭拜后收下',
        description: '你心怀敬畏，先祭拜再拾取。或许是这份诚意，兽皮上浮现出一道淡淡金光，原来其中藏着一门疗伤法诀。',
        outcomes: [{ type: 'skill', value: 'SKILL_HEALING_ART', probability: 0.3 }],
      },
      {
        label: '将残卷埋回原处',
        description: '你觉得此物因果太重，悄然将兽皮埋回土中。山风拂过，仿佛什么都没有发生过，但你隐约感到一丝气运眷顾。',
        outcomes: [
          { type: 'attribute', attribute: 'luck', value: 1, probability: 0.5 },
          { type: 'exp', value: 10 },
        ],
      },
    ],
  },
  {
    id: 'EVT_EXP_ILLUSION_ARRAY',
    title: '踏入幻阵',
    category: 'exploration',
    description:
      '一步踏出，天地骤变。你明明记得自己走在山道上，四周却化作无边桃林，落英缤纷，花香扑鼻，怎么走都走不到尽头。',
    triggerCondition: { nodeType: 'Dungeon', probability: 0.25 },
    choices: [
      {
        label: '以神识破阵',
        description: '你闭目凝神，以神识搜寻阵眼。桃林在识海中逐渐虚化，终于发现阵眼所在，一掌拍碎，幻境轰然破碎。',
        condition: { minAttribute: 'perception', minValue: 7 },
        lockedText: '神识不足，辨不清虚实的破绽。',
        outcomes: [
          { type: 'exp', value: 100 },
          { type: 'spiritStones', value: 50 },
        ],
      },
      {
        label: '沿记忆原路退回',
        description: '你强记来路，一步步原路退回。虽费了些工夫，总算在阵法的缝隙间寻得生门脱身。',
        outcomes: [{ type: 'exp', value: 40 }],
      },
      {
        label: '以力破法强行冲阵',
        description: '你怒吼一声，运起全身灵力向前猛冲。幻象如琉璃般碎裂又重组，你撞得头破血流，却终究冲了出来。',
        outcomes: [
          { type: 'hp', value: -30 },
          { type: 'exp', value: 70 },
        ],
      },
    ],
  },
  {
    id: 'EVT_EXP_SPIRIT_SPRING',
    title: '灵泉',
    category: 'exploration',
    description:
      '石缝间一泓清泉汩汩涌出，泉水呈淡碧色，灵气氤氲，泉边还生着几株亭亭玉立的灵草，叶片上凝着晶莹的水珠。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.3 },
    choices: [
      {
        label: '装满水壶',
        description: '你取出玉瓶水壶灌满灵泉水，饮下一口，四肢百骸暖洋洋的，连日赶路的疲惫一扫而空。',
        outcomes: [
          { type: 'hp', value: 30 },
          { type: 'item', value: 'MAT_SPIRIT_GRASS', probability: 0.5 },
        ],
      },
      {
        label: '采下泉边灵草',
        description: '你小心翼翼采下灵草，根须完整。这株灵草灵气充盈，正是炼丹的上好材料。',
        outcomes: [
          { type: 'item', value: 'MAT_SPIRIT_GRASS' },
          { type: 'item', value: 'MAT_BLOOD_FLOWER', probability: 0.3 },
        ],
      },
      {
        label: '循泉流探查源头',
        description: '你逆流而上，行至一处石壁前，发现泉眼深处隐约有宝光闪烁，但寒气逼人，难以接近。',
        outcomes: [
          { type: 'hp', value: -15 },
          { type: 'item', value: 'MAT_JADE', probability: 0.5 },
        ],
      },
    ],
  },
  {
    id: 'EVT_EXP_ANCIENT_PALACE',
    title: '废弃宫殿',
    category: 'exploration',
    description:
      '荒山深处竟藏着一座巨大的宫殿废墟，断壁残垣间依稀可见昔日雕梁画栋的辉煌。正殿大门洞开，里面黑漆漆的，仿佛一张择人而噬的巨口。',
    triggerCondition: { nodeType: 'Dungeon', probability: 0.15 },
    choices: [
      {
        label: '入殿搜寻',
        description: '你点燃火折子踏入正殿，殿中散落着不少瓷瓶器皿，大多已碎裂，只在角落找到几枚尘封的灵石。',
        outcomes: [
          { type: 'spiritStones', value: 120 },
          { type: 'hp', value: -15, probability: 0.3 },
        ],
      },
      {
        label: '搜寻地下密室',
        description: '你以神识扫过地面，发现正殿神像下方竟有空腔，是间密室！推开暗门，里面静静躺着一柄古朴长剑。',
        condition: { minAttribute: 'perception', minValue: 9 },
        lockedText: '神识不足，察觉不到地下的玄机。',
        outcomes: [
          { type: 'item', value: 'ITEM_SPIRIT_SWORD', probability: 0.7 },
          { type: 'exp', value: 80 },
        ],
      },
      {
        label: '只在殿外探查',
        description: '你心存警惕，只在殿外石阶与廊柱间搜寻，捡到几枚雕着云纹的古钱，也算不虚此行。',
        outcomes: [{ type: 'spiritStones', value: 40 }],
      },
    ],
  },
  {
    id: 'EVT_EXP_MYSTERY_FOREST',
    title: '迷踪林',
    category: 'exploration',
    description:
      '你踏入一片古怪的林子，树木高耸如墨，雾气弥漫不散。不论你朝哪个方向走，最终都会回到一棵缠着枯藤的老树前。',
    choices: [
      {
        label: '砍倒老树',
        description: '你抡起兵器砍向老树，枯藤应声断裂，树心处竟空洞如箱，里面藏着一只巴掌大的玉匣。',
        outcomes: [
          { type: 'item', value: 'MAT_YIN_DEW', probability: 0.7 },
          { type: 'exp', value: 60 },
        ],
      },
      {
        label: '循鸟鸣而行',
        description: '你静立片刻，听见雾深处传来几声清脆鸟鸣，循声行去，果然找到一条通往林外的秘径。',
        condition: { minAttribute: 'perception', minValue: 6 },
        lockedText: '神识不足以分辨雾中的声音方位。',
        outcomes: [
          { type: 'exp', value: 50 },
          { type: 'hp', value: -5 },
        ],
      },
      {
        label: '燃火驱雾',
        description: '你以火属性灵力点燃枯枝，浓雾遇火纷纷消散，迷踪林的真容显露，不过是几株普通老树布下的障眼法。',
        outcomes: [{ type: 'exp', value: 30 }],
      },
    ],
  },
  {
    id: 'EVT_EXP_UNDERGROUND_RIVER',
    title: '地下暗河',
    category: 'exploration',
    description:
      '一处塌陷的地缝下传来隐隐水声，你顺着地缝滑落，眼前豁然开朗——一条幽深的地下暗河奔流而过，水面上浮着点点荧光，如梦似幻。',
    triggerCondition: { nodeType: 'Dungeon', probability: 0.2 },
    choices: [
      {
        label: '沿河岸溯流而上',
        description: '你沿着湿滑的河岸前行，荧光渐亮，尽头处一株会发光的菌菇丛生，正散发着浓郁灵气。',
        outcomes: [
          { type: 'item', value: 'MAT_SPIRIT_GRASS', probability: 0.6 },
          { type: 'exp', value: 60 },
        ],
      },
      {
        label: '潜水探查河底',
        description: '你深吸一口气潜入河中，河底沉着一截断剑和几块发光的石头，你抓了块石头浮上来，竟是块品质不俗的灵玉。',
        condition: { minAttribute: 'physique', minValue: 7 },
        lockedText: '肉身强度不足，承受不了暗河的寒意与暗流。',
        outcomes: [
          { type: 'item', value: 'MAT_JADE' },
          { type: 'hp', value: -15 },
        ],
      },
      {
        label: '折返离开',
        description: '暗河幽深，不知通向何处，你权衡再三，决定原路返回。',
        outcomes: [{ type: 'exp', value: 10 }],
      },
    ],
  },
  {
    id: 'EVT_EXP_SPIRIT_VINE',
    title: '千年灵藤',
    category: 'exploration',
    description:
      '悬崖峭壁上，一株紫红色的灵藤攀岩而生，藤叶间挂着三枚赤红的果实，果香醉人，灵气四溢，一看便知是难得的天材地宝。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.3 },
    choices: [
      {
        label: '攀崖采摘',
        description: '你手脚并用地攀上峭壁，小心翼翼摘下果实。许是动作太大惊动了藤下的毒蛇，你险些坠落。',
        outcomes: [
          { type: 'item', value: 'MAT_DRAGON_BLOOD', probability: 0.4 },
          { type: 'hp', value: -25, probability: 0.5 },
        ],
      },
      {
        label: '以灵力摄物',
        description: '你放出灵力化作无形之手，隔空摘果。可惜距离太远，灵力不稳，只够到一枚，另一枚坠入深渊。',
        outcomes: [
          { type: 'spiritStones', value: 80 },
          { type: 'exp', value: 40 },
        ],
      },
    ],
  },
  {
    id: 'EVT_EXP_MIRROR_LAKE',
    title: '镜湖',
    category: 'exploration',
    description:
      '群山环抱之中，一潭湖水平整如镜，倒映着蓝天白云。湖水极浅极清，湖底铺满五彩鹅卵石，宛如一幅天然的画卷。',
    choices: [
      {
        label: '临湖照影',
        description: '你蹲在湖边，湖水忽然泛起涟漪，映出的却不是你的脸，而是一位白发仙人含笑看着你。你心头一凛，再低头时湖面已复归平静。',
        outcomes: [
          { type: 'exp', value: 100 },
          { type: 'attribute', attribute: 'luck', value: 1, probability: 0.3 },
        ],
      },
      {
        label: '捞取湖底彩石',
        description: '你伸手入水捞起几枚彩石，入手温润。仔细一看，其中一枚竟是上好的灵玉原石。',
        outcomes: [
          { type: 'item', value: 'MAT_JADE', probability: 0.5 },
          { type: 'spiritStones', value: 20 },
        ],
      },
      {
        label: '取水一尝',
        description: '湖水清冽甘甜，隐有灵气。你饮下两口，只觉神清气爽，连日损耗的神识恢复了不少。',
        outcomes: [
          { type: 'hp', value: 15 },
          { type: 'attribute', attribute: 'perception', value: 1, probability: 0.3 },
        ],
      },
    ],
  },
  {
    id: 'EVT_EXP_ANCIENT_CITY',
    title: '废墟古城',
    category: 'exploration',
    description:
      '黄沙之下露出一截残破的城墙，这是一座被岁月掩埋的古城。城中街道、屋舍依稀可辨，只是早已空无一人，风穿过残垣发出呜咽之声。',
    triggerCondition: { nodeType: 'Dungeon', probability: 0.15 },
    choices: [
      {
        label: '搜寻城主府',
        description: '你直奔城中最高大的建筑，城主府的库房虽已被前人翻过多次，你还是在暗格里找到一只封存完好的玉盒。',
        outcomes: [
          { type: 'spiritStones', value: 150 },
          { type: 'hp', value: -20, probability: 0.4 },
        ],
      },
      {
        label: '探查城中药铺',
        description: '你翻遍药铺的废墟，在破碎的丹炉下找到几枚保存完好的丹药，药香扑鼻，不知是何丹方所炼。',
        outcomes: [
          { type: 'recipe', value: 'RECIPE_MERIDIAN_PILL', probability: 0.3 },
          { type: 'exp', value: 50 },
        ],
      },
      {
        label: '在城门口歇脚',
        description: '你在城门楼的阴影下歇息，风沙掩埋的角落里露出一角锈迹斑斑的铁器，竟是一柄古剑的剑尖。',
        outcomes: [{ type: 'item', value: 'MAT_IRON_ORE', probability: 0.5 }],
      },
    ],
  },

  // ============================================================
  // 【三】social 社交类 ×8
  // ============================================================
  {
    id: 'EVT_SOC_WANDERING_TAOIST',
    title: '游方道人',
    category: 'social',
    description:
      '你正赶路，迎面走来一位破衣烂衫、脚踩芒鞋的老道人。他腰间挂一只破葫芦，见你便咧嘴一笑："小友且慢，贫道观你印堂发亮，有仙缘啊！"',
    triggerCondition: { nodeType: 'City', probability: 0.3 },
    choices: [
      {
        label: '请教仙缘',
        description: '老道人絮絮叨叨讲了半日天机，临了从葫芦里倒出一枚丹药塞给你："拿着，缘法自在其中。"',
        outcomes: [
          { type: 'recipe', value: 'RECIPE_QI_CONDENSE_PILL', probability: 0.3 },
          { type: 'exp', value: 80 },
        ],
      },
      {
        label: '请他喝碗茶',
        description: '你拉着老道人在路边茶摊坐下，请他喝了一碗粗茶。老道人笑着摸出几枚破旧铜钱，说是有缘人才能看见上面的字。',
        outcomes: [
          { type: 'spiritStones', value: -5 },
          { type: 'spiritStones', value: 50, probability: 0.6 },
        ],
      },
      {
        label: '婉拒而去',
        description: '你谨记"无事献殷勤"的教训，客客气气推辞了。老道人也不恼，哼着不知名的小调飘然远去。',
        outcomes: [{ type: 'exp', value: 10 }],
      },
    ],
  },
  {
    id: 'EVT_SOC_FLIRTING',
    title: '被修士搭讪',
    category: 'social',
    description:
      '坊市人潮中，一位锦衣玉带的年轻修士拦住你的去路，拱手一笑："这位道友气度不凡，不知可愿与在下同游坊市，共论大道？"',
    triggerCondition: { minCharm: 5, nodeType: 'City', probability: 0.25 },
    choices: [
      {
        label: '欣然应约',
        description: '你们并肩逛遍坊市，他出手阔绰，为你买下不少灵材，又说了许多城中秘闻，宾主尽欢。',
        outcomes: [
          { type: 'favorability', value: 30 },
          { type: 'spiritStones', value: 60 },
        ],
      },
      {
        label: '借故脱身',
        description: '你以尚有要事为由婉言谢绝。那修士也不强求，只笑吟吟地望着你离去。',
        outcomes: [{ type: 'favorability', value: 5 }],
      },
      {
        label: '冷脸相拒',
        description: '你面无表情地绕过他继续前行。身后传来一声轻笑："有意思。"',
        outcomes: [
          { type: 'favorability', value: -10 },
          { type: 'exp', value: 5 },
        ],
      },
    ],
  },
  {
    id: 'EVT_SOC_SECT_CONFLICT',
    title: '目睹宗门冲突',
    category: 'social',
    description:
      '你行至一处山门，正撞上两派修士对峙。一派出言讥讽，另一派不肯相让，灵光法器齐出，眼看就要大打出手。围观者纷纷退避。',
    triggerCondition: { nodeType: 'City', probability: 0.25 },
    choices: [
      {
        label: '上前劝解',
        description: '你深吸一口气，朗声劝和，晓之以理动之以情。双方见你气度不凡，竟当真收敛了火气，各自散去。',
        condition: { minRealm: 'QiRefinement_5' },
        lockedText: '境界不足，只怕上去劝和反而成了炮灰。',
        outcomes: [
          { type: 'favorability', value: 20 },
          { type: 'exp', value: 60 },
        ],
      },
      {
        label: '在旁旁观',
        description: '你混在人群中旁观，记住了双方的路数与口角缘由，心里暗暗记下这两派的恩怨纠葛。',
        outcomes: [
          { type: 'exp', value: 30 },
          { type: 'attribute', attribute: 'perception', value: 1, probability: 0.3 },
        ],
      },
      {
        label: '趁乱开溜',
        description: '眼见刀剑无眼，你毫不犹豫地转身就走，免得殃及池鱼。',
        outcomes: [{ type: 'exp', value: 5 }],
      },
    ],
  },
  {
    id: 'EVT_SOC_ROAD_JUSTICE',
    title: '路见不平',
    category: 'social',
    description:
      '官道旁，一名黑衣修士正强逼一位年迈的采药老人交出背篓里的灵草，老人跪地哀求，围观者却无人敢上前。',
    choices: [
      {
        label: '仗义出手',
        description: '你挺身而出，挡在老人身前。黑衣修士打量你两眼，哼了一声，丢下狠话悻悻而去。老人千恩万谢，执意将灵草相赠。',
        condition: { minRealm: 'QiRefinement_4' },
        lockedText: '实力不济，贸然出头只会白白送命。',
        outcomes: [
          { type: 'item', value: 'MAT_SPIRIT_GRASS' },
          { type: 'favorability', value: 15 },
        ],
      },
      {
        label: '暗中记下此事',
        description: '你自知不敌，悄悄记下黑衣修士的相貌与去向，等日后修为有成，再寻他讨个说法。',
        outcomes: [
          { type: 'exp', value: 20 },
          { type: 'favorability', value: 5 },
        ],
      },
      {
        label: '出手相助并报官',
        description: '你上前喝止，又暗中放出一枚传讯符通知城中执法修士。片刻后执法修士赶到，将恶徒绳之以法。',
        outcomes: [
          { type: 'spiritStones', value: 40 },
          { type: 'favorability', value: 25 },
        ],
      },
    ],
  },
  {
    id: 'EVT_SOC_POOR_MORTAL',
    title: '贫苦凡人',
    category: 'social',
    description:
      '城郊茅屋前，一个面黄肌瘦的村童抱着空碗坐在门槛上，屋里传来老人断续的咳嗽声。他看见你，怯生生地喊了声"仙人"。',
    triggerCondition: { nodeType: 'City', probability: 0.35 },
    choices: [
      {
        label: '赠予丹药',
        description: '你取出随身丹药为老人医治，又留下些银钱。村童跪地叩首，从此逢人便说你是活神仙。',
        outcomes: [
          { type: 'item', value: 'MAT_BLOOD_FLOWER', probability: 0.3 },
          { type: 'attribute', attribute: 'luck', value: 1, probability: 0.4 },
        ],
      },
      {
        label: '留下灵石与药',
        description: '你留下一袋灵石和几株灵草，教村童如何煎服。村童拜谢而去，你的心也平静了几分。',
        outcomes: [
          { type: 'spiritStones', value: -20 },
          { type: 'favorability', value: 10 },
        ],
      },
      {
        label: '留下一句点拨',
        description: '你指点村童去城中药铺做学徒，算是给这孩子一条生路。村童似懂非懂，郑重地点头。',
        outcomes: [
          { type: 'exp', value: 15 },
          { type: 'attribute', attribute: 'charm', value: 1, probability: 0.3 },
        ],
      },
    ],
  },
  {
    id: 'EVT_SOC_MARKET_OLD_MAN',
    title: '集市老翁',
    category: 'social',
    description:
      '坊市角落里，一个摆摊的老翁见你驻足，笑眯眯地从摊下摸出一只蒙尘的青铜小鼎："小友，老夫看你有缘，此物便宜卖你如何？"',
    triggerCondition: { nodeType: 'City', probability: 0.3 },
    choices: [
      {
        label: '用灵石买下',
        description: '你花了几枚灵石买下小鼎，回去细看，鼎内竟刻着一篇残缺的炼丹心得，价值远超你付的灵石。',
        outcomes: [
          { type: 'spiritStones', value: -30 },
          { type: 'recipe', value: 'RECIPE_TONIFY_PILL', probability: 0.5 },
          { type: 'exp', value: 40 },
        ],
      },
      {
        label: '砍价一番再买',
        description: '你与老翁讨价还价半天，老翁"忍痛"半价卖你。你心满意足地离开，隐约觉得自己似乎还是被宰了。',
        outcomes: [
          { type: 'spiritStones', value: -15 },
          { type: 'item', value: 'MAT_IRON_ORE', probability: 0.5 },
        ],
      },
    ],
  },
  {
    id: 'EVT_SOC_TEA_HOUSE',
    title: '茶馆听闻',
    category: 'social',
    description:
      '你在一间茶馆落座，邻桌两名修士正压着嗓子议论："听说了吗？青云谷的秘境近日有异动，传闻是千年一遇的天材地宝要出世了……"',
    triggerCondition: { nodeType: 'City', probability: 0.3 },
    choices: [
      {
        label: '侧耳细听',
        description: '你不动声色地听完，将秘境方位、开启时机暗暗记下。这消息若为真，便是一场大机缘。',
        outcomes: [
          { type: 'exp', value: 30 },
          { type: 'item', value: 'MAT_SPIRIT_STONE', probability: 0.4 },
        ],
      },
      {
        label: '上前搭话',
        description: '你端着茶盏凑过去，自称初来乍到，请两位道友细说分明。二人见你大方，将所知秘闻和盘托出。',
        outcomes: [
          { type: 'spiritStones', value: -10 },
          { type: 'exp', value: 60 },
        ],
      },
    ],
  },
  {
    id: 'EVT_SOC_RIVAL_PROVOKE',
    title: '同辈挑衅',
    category: 'social',
    description:
      '一名与你年纪相仿的修士拦住去路，下巴微抬："听说你最近风头很盛？敢不敢与我在演武场上一较高下，赢的人才有资格继续出风头。"',
    triggerCondition: { nodeType: 'City', probability: 0.2 },
    choices: [
      {
        label: '应战',
        description: '演武场上，你与他对拆数十招，最终险胜半招。他倒也光棍，拱手认输，还送你一件小礼物当作彩头。',
        outcomes: [
          { type: 'exp', value: 100 },
          { type: 'item', value: 'MAT_YANG_STONE', probability: 0.5 },
          { type: 'hp', value: -15 },
        ],
      },
      {
        label: '以谦逊化解',
        description: '你自称实力低微，不敢献丑，言语间却滴水不漏。他讨了个没趣，悻悻离去。',
        outcomes: [
          { type: 'exp', value: 20 },
          { type: 'attribute', attribute: 'charm', value: 1, probability: 0.4 },
        ],
      },
      {
        label: '约他改日再战',
        description: '你推说今日有事，约他三日后演武场见。三日后你以实力将他彻底折服，从此多了一位朋友。',
        outcomes: [
          { type: 'favorability', value: 15 },
          { type: 'exp', value: 80 },
        ],
      },
    ],
  },

  // ============================================================
  // 【四】combat 战斗类 ×8
  // ============================================================
  {
    id: 'EVT_COMBAT_BEAST_BLOCK',
    title: '妖兽拦路',
    category: 'combat',
    description:
      '林间小径上，一头丈许高的黑纹巨虎横卧于前，虎目微眯，喉咙里发出低沉的轰鸣。它的皮毛油亮，利爪深深嵌进泥土，显然已通了些灵智。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.3 },
    choices: [
      {
        label: '正面迎战',
        description: '你拔出兵刃与巨虎周旋，虎爪擦过肩头留下一道血痕，但你终究找到破绽，一击中的。巨虎负伤遁走。',
        outcomes: [
          { type: 'exp', value: 120 },
          { type: 'hp', value: -25 },
          { type: 'item', value: 'MAT_BLOOD_FLOWER', probability: 0.4 },
        ],
      },
      {
        label: '绕路而行',
        description: '你权衡再三，悄然绕道。虽耽搁了些行程，但省去一场恶战，也算明智。',
        outcomes: [{ type: 'exp', value: 20 }],
      },
      {
        label: '以食物诱之',
        description: '你抛出一块灵兽肉干，巨虎果然被吸引。趁它低头进食，你大步流星地越过山道。',
        condition: { minAttribute: 'agility', minValue: 6 },
        lockedText: '身法不够快，恐怕诱虎不成反被扑杀。',
        outcomes: [
          { type: 'exp', value: 30 },
          { type: 'attribute', attribute: 'luck', value: 1, probability: 0.4 },
        ],
      },
    ],
  },
  {
    id: 'EVT_COMBAT_EVIL_CULTIVATOR',
    title: '邪修偷袭',
    category: 'combat',
    description:
      '行至荒僻处，一道黑影从天而降，阴风扑面。一名满脸戾气的修士桀桀怪笑："识相的，把储物袋留下，本座饶你一条小命！"',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.2 },
    choices: [
      {
        label: '奋起反抗',
        description: '你与邪修缠斗数十回合，凭着一股血勇将他击退。他留下半句狠话仓皇遁走，你也浑身是伤。',
        outcomes: [
          { type: 'exp', value: 150 },
          { type: 'hp', value: -40 },
          { type: 'spiritStones', value: 80, probability: 0.5 },
        ],
      },
      {
        label: '虚张声势',
        description: '你故意放出强横气息，大喝一声"师门长辈就在附近"，唬得邪修惊疑不定，最终退去。',
        outcomes: [
          { type: 'exp', value: 40 },
          { type: 'attribute', attribute: 'luck', value: 1, probability: 0.3 },
        ],
      },
      {
        label: '交出财物保命',
        description: '好汉不吃眼前亏，你抛出一小袋灵石引开他，转身便逃。邪修果然去捡灵石，你得以脱身，只是损失了些灵石。',
        outcomes: [
          { type: 'spiritStones', value: -50 },
          { type: 'hp', value: -10 },
        ],
      },
    ],
  },
  {
    id: 'EVT_COMBAT_ESCORT',
    title: '护送商队',
    category: 'combat',
    description:
      '一支满载灵药的商队正被一群山匪围住，商队护卫浴血苦战。商队管事看见你，大声呼救："道友救命！事成之后必有重谢！"',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.25 },
    choices: [
      {
        label: '拔刀相助',
        description: '你杀入匪群，三下五除二放倒几个山匪。匪首见势不妙，一声呼哨带人撤走。管事千恩万谢，奉上丰厚报酬。',
        outcomes: [
          { type: 'spiritStones', value: 100 },
          { type: 'exp', value: 80 },
          { type: 'hp', value: -20 },
        ],
      },
      {
        label: '提出护卫费',
        description: '你与管事谈妥报酬后出手，护送商队走出十里险地。管事依约付酬，又赠你一枚灵果。',
        outcomes: [
          { type: 'spiritStones', value: 60 },
          { type: 'item', value: 'MAT_SPIRIT_GRASS', probability: 0.5 },
        ],
      },
      {
        label: '冷眼旁观',
        description: '江湖恩怨难辨，你只作壁上观。商队最终击退山匪，管事瞥了你一眼，神色复杂。',
        outcomes: [
          { type: 'exp', value: 10 },
          { type: 'favorability', value: -10 },
        ],
      },
    ],
  },
  {
    id: 'EVT_COMBAT_TREASURE_RUSH',
    title: '争夺天材地宝',
    category: 'combat',
    description:
      '一处灵气喷涌的谷底，一株通体荧白的灵花正缓缓绽放，花蕊间凝着一滴乳白色的灵露。四周已围了数名虎视眈眈的修士，谁也不敢先动手。',
    triggerCondition: { nodeType: 'Dungeon', probability: 0.2 },
    choices: [
      {
        label: '强冲夺宝',
        description: '你趁着众人僵持之际暴起夺花，灵露到手，却也被三四名修士联手追击，你拼着挨了一记重击才脱身。',
        outcomes: [
          { type: 'item', value: 'MAT_DRAGON_BLOOD', probability: 0.6 },
          { type: 'hp', value: -50 },
        ],
      },
      {
        label: '趁乱浑水摸鱼',
        description: '你故作离开，实则绕到谷侧隐蔽处。待众人为争夺灵花大打出手时，你从旁截下一名败退者遗落的储物袋。',
        outcomes: [
          { type: 'spiritStones', value: 120, probability: 0.7 },
          { type: 'exp', value: 60 },
        ],
      },
      {
        label: '静观其变',
        description: '你按捺住贪念远远观望，看众人厮杀良久才分胜负。胜者拿着灵花志得意满地离去，你记住了那张脸。',
        outcomes: [
          { type: 'exp', value: 40 },
          { type: 'attribute', attribute: 'perception', value: 1, probability: 0.3 },
        ],
      },
    ],
  },
  {
    id: 'EVT_COMBAT_BANDITS',
    title: '劫道匪修',
    category: 'combat',
    description:
      '官道两旁的乱石后忽然跳出四五名修士，为首者狞笑道："此山是我开，此树是我栽。留下买路财，放你过此关！"',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.3 },
    choices: [
      {
        label: '且战且退',
        description: '你且战且退，凭借地形甩开匪众。虽受了些轻伤，却保住了财物，还反手撂倒了两个追得最急的匪修。',
        outcomes: [
          { type: 'exp', value: 90 },
          { type: 'hp', value: -20 },
          { type: 'spiritStones', value: 40, probability: 0.5 },
        ],
      },
      {
        label: '破财消灾',
        description: '你丢出一袋灵石，匪众争抢之际，你脚下生风，眨眼间跑得无影无踪。',
        outcomes: [
          { type: 'spiritStones', value: -30 },
          { type: 'hp', value: -5 },
        ],
      },
      {
        label: '亮出宗门腰牌',
        description: '你亮出宗门腰牌，义正词严。匪首掂量再三，终究不敢招惹你背后的宗门，悻悻放行。',
        condition: { minRealm: 'QiRefinement_6' },
        lockedText: '境界太低，亮腰牌只怕被当成肥羊。',
        outcomes: [{ type: 'exp', value: 50 }],
      },
    ],
  },
  {
    id: 'EVT_COMBAT_POISON_FOG',
    title: '毒雾围困',
    category: 'combat',
    description:
      '你踏入一片灰蒙蒙的瘴气林，浓得化不开的毒雾从四面八方涌来，口鼻吸入后头昏目眩，视线也开始模糊。',
    triggerCondition: { nodeType: 'Dungeon', probability: 0.25 },
    choices: [
      {
        label: '运功逼毒',
        description: '你盘膝运功，以灵力强行逼出毒气，只觉经脉一阵刺痛，毒去之后反而神清气爽。',
        outcomes: [
          { type: 'hp', value: -20 },
          { type: 'attribute', attribute: 'poisonResist', value: 3, probability: 0.5 },
        ],
      },
      {
        label: '服解毒丹药',
        description: '你摸出一枚解毒丹吞下，药力化开，毒雾如遇克星般退散。你循着丹香气息的指引，找到了离开瘴林的路径。',
        outcomes: [
          { type: 'item', value: 'MAT_YIN_DEW', probability: 0.5 },
          { type: 'exp', value: 50 },
        ],
      },
      {
        label: '屏息疾行',
        description: '你憋住一口气埋头疾冲，在肺中的空气耗尽前冲出了瘴林，瘫倒在地大口喘息，好险。',
        outcomes: [
          { type: 'hp', value: -30 },
          { type: 'exp', value: 30 },
        ],
      },
    ],
  },
  {
    id: 'EVT_COMBAT_VENOM_SERPENT',
    title: '剧毒妖蟒',
    category: 'combat',
    description:
      '沼泽深处，一条水桶粗的妖蟒缓缓抬起身子，竖瞳死死锁住你。它浑身鳞片泛着幽绿光芒，口中信子嘶嘶吐动，毒涎滴落地面竟冒出青烟。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.25 },
    choices: [
      {
        label: '斩其七寸',
        description: '你抓住妖蟒扑击的瞬间，身形一闪，全力斩向它的七寸。蟒鳞坚硬，你连斩数剑才破开，自己也中了蛇尾一扫。',
        outcomes: [
          { type: 'exp', value: 160 },
          { type: 'hp', value: -35 },
          { type: 'item', value: 'MAT_DRAGON_BLOOD', probability: 0.3 },
        ],
      },
      {
        label: '诱它出洞再取药',
        description: '你见妖蟒护着一株腥臭的毒花，心中一动，引开妖蟒后绕后摘花。妖蟒回头发现，怒追不舍，你险险逃脱。',
        outcomes: [
          { type: 'item', value: 'MAT_YIN_DEW', probability: 0.6 },
          { type: 'hp', value: -25, probability: 0.5 },
        ],
      },
      {
        label: '退避三舍',
        description: '毒蟒之威不可轻犯，你缓缓后退，退出它的领地。蟒蛇也不追赶，重新盘起身子。',
        outcomes: [{ type: 'exp', value: 10 }],
      },
    ],
  },
  {
    id: 'EVT_COMBAT_MARAUDING_BIRD',
    title: '掠食妖禽',
    category: 'combat',
    description:
      '山道之上，一道黑影自云端俯冲而下，翼展数丈的妖禽钢爪如钩，直取你的天灵盖。腥风扑面，你来不及多想，就地一滚。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.2 },
    choices: [
      {
        label: '引弓射鸟',
        description: '你张弓搭箭，一箭射中妖禽左翼。它惨鸣一声坠向山崖，带走了你一只箭袋，却也留下几根坚韧的翎羽。',
        outcomes: [
          { type: 'exp', value: 100 },
          { type: 'item', value: 'MAT_PHOENIX_FEATHER', probability: 0.4 },
          { type: 'hp', value: -10 },
        ],
      },
      {
        label: '遁入林间躲避',
        description: '你一个翻滚钻进密林，妖禽在树冠上方盘旋数圈，终究不敢俯冲进入林木茂密处，悻悻而去。',
        outcomes: [{ type: 'exp', value: 30 }],
      },
      {
        label: '以灵力轰击',
        description: '你凝起灵力光弹轰向妖禽，虽未击中要害，却惊退了它。它留下几根羽翼毛，仓皇飞走。',
        outcomes: [
          { type: 'exp', value: 60 },
          { type: 'spiritStones', value: 20, probability: 0.5 },
        ],
      },
    ],
  },

  // ============================================================
  // 【五】fortune 机缘类 ×7
  // ============================================================
  {
    id: 'EVT_FOR_METEOR',
    title: '天降陨石',
    category: 'fortune',
    description:
      '夜幕低垂，一道炽亮的火光划破天际，轰然砸落在数里外的山野中，震得大地微微颤抖。这等天外之物，向来蕴含稀世矿材。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.2 },
    choices: [
      {
        label: '连夜赶赴坠点',
        description: '你运起轻身功法连夜赶路，率先抵达陨坑。坑底的陨石尚自灼热，你忍着滚烫凿下一大块。',
        outcomes: [
          { type: 'item', value: 'MAT_METEORITE', probability: 0.8 },
          { type: 'hp', value: -15 },
        ],
      },
      {
        label: '天明再去',
        description: '你不敢摸黑赶路，次日清晨才到。陨坑已被早到的修士翻了个底朝天，你只在边缘捡到几块碎屑。',
        outcomes: [{ type: 'item', value: 'MAT_IRON_ORE', probability: 0.5 }],
      },
      {
        label: '以神识定位灵核',
        description: '你隔空放出神识锁定陨石最精华的灵核位置，摸黑精准开采。灵核入手，温润生辉，价值连城。',
        condition: { minAttribute: 'perception', minValue: 10 },
        lockedText: '神识不足，无法在夜色中定位灵核。',
        outcomes: [
          { type: 'item', value: 'MAT_STARLIGHT', probability: 0.7 },
          { type: 'exp', value: 60 },
        ],
      },
    ],
  },
  {
    id: 'EVT_FOR_ANCIENT_HERITAGE',
    title: '古人传承',
    category: 'fortune',
    description:
      '你无意间触动了一处隐蔽的禁制，眼前石壁缓缓裂开，露出一间狭小的石室。蒲团上一具枯骨盘膝而坐，枯骨怀中抱着一枚流光溢彩的玉简。',
    triggerCondition: { nodeType: 'Dungeon', probability: 0.15 },
    choices: [
      {
        label: '以神识探入玉简',
        description: '神识触碰到玉简的刹那，洪流般的传承信息灌入识海。你凝神接收，隐约是一位前辈毕生的功法心得。',
        outcomes: [
          { type: 'skill', value: 'SKILL_THUNDER_SLASH', probability: 0.6 },
          { type: 'exp', value: 200 },
          { type: 'hp', value: -30, probability: 0.4 },
        ],
      },
      {
        label: '谨慎抽取传承',
        description: '你不敢贪多，只从玉简中截取一段最稳妥的心法记下。虽然收获有限，胜在安全。',
        outcomes: [
          { type: 'exp', value: 120 },
          { type: 'attribute', attribute: 'comprehension', value: 1, probability: 0.5 },
        ],
      },
      {
        label: '以精血入简',
        description: '你福至心灵，以一滴精血滴入玉简。玉简嗡鸣一声，从中飘出一段金文，正是前人遗留的炼器秘法。',
        outcomes: [
          { type: 'recipe', value: 'RECIPE_HEAVEN_GANG_SWORD', probability: 0.5 },
          { type: 'hp', value: -10 },
        ],
      },
    ],
  },
  {
    id: 'EVT_FOR_SPIRIT_BEAST',
    title: '灵兽认主',
    category: 'fortune',
    description:
      '你救下一只被猎网困住的白狐，它通体雪白，尾巴尖却缀着一撮金色绒毛，双目灵动似有灵智。它伏在你脚边，轻轻蹭了蹭你的裤脚。',
    triggerCondition: { minLuck: 50, nodeType: 'Wilderness', probability: 0.15 },
    choices: [
      {
        label: '滴血认主',
        description: '你以指血点在白狐眉心，一道金光闪过，你与它之间便有了无形的羁绊。白狐欢呼一声，跃上你的肩头。',
        outcomes: [
          { type: 'attribute', attribute: 'luck', value: 2, probability: 0.6 },
          { type: 'favorability', value: 30 },
        ],
      },
      {
        label: '解网放归山林',
        description: '你解开猎网，白狐回头望了你一眼，叼来一枚闪着星辉的种子放在你掌心，然后化作白光消失在山林深处。',
        outcomes: [
          { type: 'item', value: 'MAT_STARLIGHT', probability: 0.6 },
          { type: 'attribute', attribute: 'luck', value: 1, probability: 0.5 },
        ],
      },
      {
        label: '带回去养着',
        description: '你抱着白狐回去，打算日后再议认主之事。白狐在你怀里打了个哈欠，睡得安稳。',
        outcomes: [{ type: 'favorability', value: 10 }],
      },
    ],
  },
  {
    id: 'EVT_FOR_STORAGE_BAG',
    title: '捡到储物袋',
    category: 'fortune',
    description:
      '路边草丛中，一只灰扑扑的储物袋半埋在泥里。袋口微敞，露出半截绣着云纹的衣角。不知是前人遗落，还是旁人故意设下的圈套。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.3 },
    choices: [
      {
        label: '拾起查看',
        description: '你以灵力抹去袋上残留的神识印记，打开一看——里面竟装着上百枚灵石和几株珍稀灵草！',
        outcomes: [
          { type: 'spiritStones', value: 150 },
          { type: 'item', value: 'MAT_SPIRIT_GRASS', probability: 0.6 },
        ],
      },
      {
        label: '以神识探查暗手',
        description: '你谨慎地以神识探入储物袋，果然在袋底发现一道阴损的追踪印记。你小心地将其抹除，白得一场富贵。',
        outcomes: [
          { type: 'spiritStones', value: 100 },
          { type: 'exp', value: 40 },
        ],
      },
    ],
  },
  {
    id: 'EVT_FOR_SPIRIT_FRUIT',
    title: '灵果成熟',
    category: 'fortune',
    description:
      '幽谷深处，一株老树挂满红彤彤的灵果，果香随风飘散，连空气都变得甘甜。树干上刻着古篆"朱果"，每颗果子都蕴着充沛灵气。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.25 },
    choices: [
      {
        label: '采下灵果',
        description: '你攀上老树，将熟透的朱果尽数采下，足有七八枚。果香醉人，你忍不住当场吃了一枚。',
        outcomes: [
          { type: 'exp', value: 100 },
          { type: 'spiritStones', value: 60, probability: 0.5 },
        ],
      },
      {
        label: '只取三枚',
        description: '你知天材地宝不可竭泽而渔，只采三枚，向老树躬身一礼后离去。',
        outcomes: [
          { type: 'spiritStones', value: 80 },
          { type: 'attribute', attribute: 'luck', value: 1, probability: 0.4 },
        ],
      },
      {
        label: '守候至果落再捡',
        description: '你在树下守了一日，等到一枚自然坠落的熟果。虽只有一枚，胜在不伤灵树，因果圆满。',
        outcomes: [
          { type: 'exp', value: 60 },
          { type: 'item', value: 'MAT_YANG_STONE', probability: 0.5 },
        ],
      },
    ],
  },
  {
    id: 'EVT_FOR_ANCIENT_COIN',
    title: '神秘古钱',
    category: 'fortune',
    description:
      '地摊上一枚锈迹斑斑的古钱引起你的注意，钱面刻着看不懂的符文，摊主开价极低，只当是件寻常物件。',
    triggerCondition: { nodeType: 'City', probability: 0.3 },
    choices: [
      {
        label: '买下古钱',
        description: '你花了几枚灵石买下古钱，回住处以灵力灌注，钱面符文忽然亮起——竟是上古某位大能留下的信物。',
        outcomes: [
          { type: 'spiritStones', value: -10 },
          { type: 'attribute', attribute: 'luck', value: 1, probability: 0.7 },
          { type: 'exp', value: 50 },
        ],
      },
      {
        label: '讨价还价',
        description: '你与摊主一番讨价，最终白捡般拿到古钱。回去研究半天，却始终参不透其中奥妙。',
        outcomes: [
          { type: 'spiritStones', value: -5 },
          { type: 'exp', value: 20 },
        ],
      },
    ],
  },
  {
    id: 'EVT_FOR_MIRACLE_SPRING',
    title: '天降甘霖',
    category: 'fortune',
    description:
      '久旱的山谷忽然乌云密布，一场带着灵气的细雨洒落。雨水落地生光，草木以肉眼可见的速度疯长，枯枝上竟开出了朵朵灵花。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.2 },
    choices: [
      {
        label: '雨中打坐',
        description: '你盘膝坐在雨中，任由灵雨冲刷肉身。灵气随雨丝渗入经脉，功法自动运转，修为稳步攀升。',
        outcomes: [
          { type: 'exp', value: 150 },
          { type: 'hp', value: 15 },
        ],
      },
      {
        label: '以玉瓶接雨',
        description: '你取出玉瓶接满灵雨，雨停之后仔细封存。这灵雨日后无论是炼丹还是炼器，都是难得的好材料。',
        outcomes: [
          { type: 'item', value: 'MAT_YIN_DEW', probability: 0.7 },
          { type: 'exp', value: 30 },
        ],
      },
    ],
  },

  // ============================================================
  // 【六】misfortune 灾厄类 ×7
  // ============================================================
  {
    id: 'EVT_MIS_LIGHTNING_TRIB',
    title: '雷劫降临',
    category: 'misfortune',
    description:
      '你正于荒野赶路，头顶忽然乌云密布，一道粗壮的紫色雷霆毫无征兆地当头劈落！你这才惊觉——不知何时，自己竟触碰了某种天道的禁忌。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.15 },
    choices: [
      {
        label: '以肉身硬抗',
        description: '你运起护体功法硬接雷霆，雷光在体表炸开，皮开肉绽。你痛得眼前发黑，却硬生生扛了下来，经脉被雷力淬炼得更加坚韧。',
        outcomes: [
          { type: 'hp', value: -50 },
          { type: 'attribute', attribute: 'physique', value: 1, probability: 0.6 },
        ],
      },
      {
        label: '祭出法器格挡',
        description: '你祭出随身法器迎向雷霆，法器被劈得灵光暗淡，但你也趁着雷光间隙逃出了劫云范围。',
        outcomes: [
          { type: 'item', value: 'MAT_METEORITE', probability: 0.4 },
          { type: 'hp', value: -20 },
        ],
      },
      {
        label: '以遁术闪避',
        description: '你拼尽全力施展遁术，抢在第二道天雷落下前冲出劫云笼罩之地。天雷在身后轰然炸开，你瘫坐在地，心有余悸。',
        condition: { minAttribute: 'agility', minValue: 8 },
        lockedText: '身法不足，逃不过天雷的锁定。',
        outcomes: [
          { type: 'hp', value: -10 },
          { type: 'exp', value: 80 },
        ],
      },
    ],
  },
  {
    id: 'EVT_MIS_EVIL_QI',
    title: '邪气入体',
    category: 'misfortune',
    description:
      '你在一片阴煞之地歇脚，却不料地底的邪煞之气趁你运功时悄然侵入经脉。起初不察，等到发现时，一丝黑气已盘踞在丹田深处。',
    triggerCondition: { nodeType: 'Dungeon', probability: 0.25 },
    choices: [
      {
        label: '运功强行逼出',
        description: '你闭关三日，以纯阳灵力围剿黑气，终于将其逼出体外。只是连日苦战，修为不进反退。',
        outcomes: [
          { type: 'hp', value: -30 },
          { type: 'exp', value: 40 },
        ],
      },
      {
        label: '寻药化解',
        description: '你购来驱邪丹药服下，药力与邪气相搏，你疼得满地打滚，最终邪气被连根拔除，丹田反而更加稳固。',
        outcomes: [
          { type: 'spiritStones', value: -40 },
          { type: 'attribute', attribute: 'physique', value: 1, probability: 0.4 },
        ],
      },
      {
        label: '暂时压制',
        description: '你以灵力将邪气压入经脉角落，暂缓其发。只是这邪气如附骨之疽，日后恐有反复。',
        outcomes: [
          { type: 'hp', value: -15 },
          { type: 'exp', value: -20 },
        ],
      },
    ],
  },
  {
    id: 'EVT_MIS_AMBUSH',
    title: '被人暗算',
    category: 'misfortune',
    description:
      '你在荒野行走时后脑忽然一阵刺痛——一枚细如牛毛的暗器不知何时已钉入你的后颈。你回头望去，一道黑影正没入林中。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.2 },
    choices: [
      {
        label: '运功逼出暗器',
        description: '你盘膝而坐，以灵力逼出暗器。暗器上淬的毒已被你及时化解，只是伤口仍隐隐作痛。',
        outcomes: [
          { type: 'hp', value: -25 },
          { type: 'exp', value: 30 },
        ],
      },
      {
        label: '反向追踪',
        description: '你放出神识锁定黑影的去向，一路追至一处山洞。可惜对方早已设下陷阱脱身，你只搜到一枚毒镖。',
        outcomes: [
          { type: 'exp', value: 60 },
          { type: 'item', value: 'MAT_BLOOD_FLOWER', probability: 0.4 },
        ],
      },
      {
        label: '忍痛离开',
        description: '你不敢久留，强压伤势连夜赶回城中疗伤，算是躲过一劫。',
        outcomes: [
          { type: 'hp', value: -20 },
          { type: 'spiritStones', value: -20 },
        ],
      },
    ],
  },
  {
    id: 'EVT_MIS_POISON_TRAP',
    title: '中毒被困',
    category: 'misfortune',
    description:
      '你闯入一间布满机关的洞窟，脚下石板骤然塌陷，落入地牢之中。牢中瘴气弥漫，你吸了几口便头晕目眩，四肢乏力，石门紧闭难以推开。',
    triggerCondition: { nodeType: 'Dungeon', probability: 0.25 },
    choices: [
      {
        label: '寻解毒之物',
        description: '你强撑着在牢中搜寻，在角落发现几株苔藓竟泛着灵光，碾碎敷在伤口上，剧毒缓缓退去。',
        outcomes: [
          { type: 'hp', value: -20 },
          { type: 'attribute', attribute: 'poisonResist', value: 2, probability: 0.5 },
        ],
      },
      {
        label: '以力轰开石门',
        description: '你积聚灵力一拳轰向石门，石门纹丝不动，反震之力却让你喉头一甜。你接连轰出十余拳，石门终于出现裂缝。',
        outcomes: [
          { type: 'hp', value: -40 },
          { type: 'spiritStones', value: 50, probability: 0.6 },
        ],
      },
      {
        label: '寻找机关',
        description: '你忍着眩晕一寸寸摸索墙壁，终于在一处凹陷的砖缝中找到机关。石门缓缓升起，你狼狈地爬了出去。',
        outcomes: [
          { type: 'hp', value: -15 },
          { type: 'exp', value: 50 },
        ],
      },
    ],
  },
  {
    id: 'EVT_MIS_HIDDEN_DANGER',
    title: '凶兽巢穴',
    category: 'misfortune',
    description:
      '你循着兽道前行，忽然闻到一股浓烈的腥臊味。抬头望去，前方山壁下竟是一个巨大的兽巢，洞口堆满森森白骨，数道粗重的呼吸声从深处传出。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.2 },
    choices: [
      {
        label: '悄悄退走',
        description: '你屏住呼吸，蹑手蹑脚地原路退回。直到走出百丈远，你才敢长出一口气。',
        outcomes: [{ type: 'exp', value: 10 }],
      },
      {
        label: '潜入盗取兽卵',
        description: '你趁着母兽外出觅食潜入巢穴，抱走一枚散发灵光的兽卵。归途母兽归来，发现后发出震天怒吼，你抱卵狂奔而逃。',
        outcomes: [
          { type: 'hp', value: -30 },
          { type: 'attribute', attribute: 'luck', value: 2, probability: 0.5 },
        ],
      },
      {
        label: '布下陷阱等凶兽归巢',
        description: '你在巢穴口布下困兽阵，待凶兽归来时趁其挣扎之际偷袭得手，收获颇丰。',
        outcomes: [
          { type: 'exp', value: 120 },
          { type: 'item', value: 'MAT_DRAGON_BLOOD', probability: 0.4 },
          { type: 'hp', value: -20 },
        ],
      },
    ],
  },
  {
    id: 'EVT_MIS_CURSE',
    title: '无名诅咒',
    category: 'misfortune',
    description:
      '你在一座古墓中碰倒了一尊石像，一道黑光忽然没入你的眉心。你只觉浑身一寒，仿佛有什么东西缠上了你的魂魄，怎么驱都驱不散。',
    triggerCondition: { nodeType: 'Dungeon', probability: 0.15 },
    choices: [
      {
        label: '以灵石献祭化解',
        description: '你按着石像底座刻着的献祭之法，摆放灵石行祭。黑光渐渐从眉心散去，你只损失了些灵石。',
        outcomes: [
          { type: 'spiritStones', value: -60 },
          { type: 'exp', value: 20 },
        ],
      },
      {
        label: '强运功法对抗',
        description: '你盘膝而坐，以功法对抗诅咒之力。诅咒如跗骨之蛆，你与它僵持整夜，终究略占上风，将其压制。',
        outcomes: [
          { type: 'hp', value: -40 },
          { type: 'exp', value: 80 },
          { type: 'hp', value: -10, probability: 0.4 },
        ],
      },
      {
        label: '硬扛诅咒离开',
        description: '你视诅咒如无物，大步走出古墓。此后数日，你总觉得夜里有黑影窥视，心神不宁。',
        outcomes: [
          { type: 'hp', value: -15 },
          { type: 'spiritStones', value: 80, probability: 0.5 },
        ],
      },
    ],
  },
  {
    id: 'EVT_MIS_DEBT',
    title: '讨债上门',
    category: 'misfortune',
    description:
      '你前脚进城，后脚便被两名膀大腰圆的修士拦住："道友，三个月前你欠周老大的五十枚灵石，该还了吧？今天可别想再拖。"',
    triggerCondition: { nodeType: 'City', probability: 0.2 },
    choices: [
      {
        label: '如数偿还',
        description: '你取出灵石结清债务。讨债的修士倒也客气，拱了拱手便转身离去，临了还提醒你最近别在城中惹事。',
        outcomes: [
          { type: 'spiritStones', value: -50 },
          { type: 'favorability', value: 5 },
        ],
      },
      {
        label: '请求宽限',
        description: '你好说歹说，又奉上一小袋灵石作利钱，才换来十日期限。讨债人临走时叮嘱你千万别耍花样。',
        outcomes: [
          { type: 'spiritStones', value: -20 },
          { type: 'hp', value: -5 },
        ],
      },
      {
        label: '赖账逃遁',
        description: '你趁人不备夺路而逃，跳墙翻屋甩开追兵。只是从今往后，城中多了一双盯着你的眼睛。',
        outcomes: [
          { type: 'exp', value: 20 },
          { type: 'favorability', value: -15 },
        ],
      },
    ],
  },

  // ============================================================
  // 【七】补充事件 ×18（部分与八卦机制 gossip-registry 联动）
  // ============================================================
  {
    id: 'EVT_CULT_ALCHEMY_FLASH',
    title: '丹道灵光',
    category: 'cultivation',
    description:
      '你在洞府中反复推演一道丹方，正自苦恼之际，炉中火焰忽地一颤。那一瞬你福至心灵，药性君臣佐使的搭配如画卷般在脑中展开，平日想不通的关窍豁然贯通。',
    triggerCondition: { nodeType: 'City', probability: 0.2 },
    choices: [
      {
        label: '趁热开炉炼丹',
        description: '你立刻取药开炉，循着那缕灵光控火。三日后丹成开炉，丹香满室，成色竟是远超平日。',
        outcomes: [
          { type: 'recipe', value: 'RECIPE_QI_CONDENSE_PILL', probability: 0.5 },
          { type: 'exp', value: 80 },
        ],
      },
      {
        label: '记下心得',
        description: '你取出玉简，将这一瞬的感悟尽数铭刻。日后炼丹时再行参详，无异于多了一位无声的丹道老师。',
        outcomes: [
          { type: 'attribute', attribute: 'comprehension', value: 1, probability: 0.6 },
          { type: 'exp', value: 60 },
        ],
      },
      {
        label: '以火炼气',
        description: '你借炉火之烈炼化丹田灵气，虽未参透丹理，修为却借势精进了一分。',
        outcomes: [{ type: 'exp', value: 120 }],
      },
    ],
  },
  {
    id: 'EVT_CULT_BATTLE_ENLIGHT',
    title: '观战悟道',
    category: 'cultivation',
    description:
      '你路过一处演武场，恰逢两位高境界修士切磋。剑光纵横间，两人身法、法诀的运用妙到毫巅，你驻足凝望，竟觉其中暗合一门功法的运劲之理。',
    choices: [
      {
        label: '凝神观摩',
        description: '你整整看了一日，将两人出招的起承转合深深印入脑海。夜里打坐，白日所见化作源源不断的灵感。',
        outcomes: [
          { type: 'exp', value: 100 },
          { type: 'attribute', attribute: 'perception', value: 1, probability: 0.4 },
        ],
      },
      {
        label: '席地摹演',
        description: '你席地而坐，以指代剑临摹二位的招式，惹来围观者窃笑。但你浑然不觉，反倒真的揣摩出几分攻守之道。',
        outcomes: [
          { type: 'exp', value: 70 },
          { type: 'attribute', attribute: 'attack', value: 1, probability: 0.5 },
        ],
      },
      {
        label: '向胜者请教',
        description: '散场后你追上那位胜者，执礼请教。他见你有心，便指点了三句攻伐要诀，字字珠玑。',
        outcomes: [
          { type: 'exp', value: 130 },
          { type: 'favorability', value: 10 },
        ],
      },
    ],
  },
  {
    id: 'EVT_CULT_MOON_TRIBUTE',
    title: '月华凝露',
    category: 'cultivation',
    description:
      '中秋月圆之夜，你在山巅静坐。月光如银瀑倾泻，草丛间竟凝出一层薄薄的露珠，每一滴都泛着清冷的月华灵光，这是难得的月华之露。',
    triggerCondition: { minLuck: 40, nodeType: 'Wilderness', probability: 0.15 },
    choices: [
      {
        label: '以玉瓶采集',
        description: '你小心翼翼地将月华之露收入玉瓶，足有大半瓶。此露炼入丹药，可增三分药力。',
        outcomes: [
          { type: 'item', value: 'MAT_YIN_DEW', probability: 0.8 },
          { type: 'exp', value: 40 },
        ],
      },
      {
        label: '就着月光炼化',
        description: '你直接引月华入体，与自身灵力交融。月光清冷，灵力却被淬炼得愈发精纯。',
        outcomes: [
          { type: 'exp', value: 150 },
          { type: 'spiritStones', value: 20, probability: 0.4 },
        ],
      },
      {
        label: '采露兼观月',
        description: '你采得半瓶露水，又在月下打坐参悟。月行中天，你似有所感，却又说不清那丝明悟落在何处。',
        outcomes: [
          { type: 'exp', value: 90 },
          { type: 'attribute', attribute: 'comprehension', value: 1, probability: 0.4 },
        ],
      },
    ],
  },
  {
    id: 'EVT_EXP_BLACK_MARKET',
    title: '黑市寻宝',
    category: 'exploration',
    description:
      '循着传闻，你在城西赌坊的柴房后找到那扇不起眼的暗门。门后别有洞天，灯火通明的黑市里摆满了各式法器丹方，摊主们个个蒙面，目光警惕地扫过你。',
    triggerCondition: { nodeType: 'City', probability: 0.15 },
    choices: [
      {
        label: '花灵石淘货',
        description: '你挨个摊子看过去，在一个蒙面老者摊前停住，花灵石买下他那只看着平平无奇的旧木盒。回去打开，里面竟藏着一篇炼器心得。',
        outcomes: [
          { type: 'spiritStones', value: -60 },
          { type: 'recipe', value: 'RECIPE_TONIFY_PILL', probability: 0.4 },
          { type: 'exp', value: 50 },
        ],
      },
      {
        label: '以物易物',
        description: '你拿出闲置的材料换购了几株黑市特有的暗纹灵草，摊主看在你是生面孔的份上，倒也没狮子大开口。',
        outcomes: [
          { type: 'item', value: 'MAT_SPIRIT_GRASS', probability: 0.7 },
          { type: 'spiritStones', value: -20 },
        ],
      },
      {
        label: '只逛不买',
        description: '你默默把黑市的货色、价码记在心里，便转身离开。黑市水深，初来乍到还是谨慎为上。',
        outcomes: [
          { type: 'exp', value: 30 },
          { type: 'attribute', attribute: 'perception', value: 1, probability: 0.3 },
        ],
      },
    ],
  },
  {
    id: 'EVT_EXP_ANCIENT_TOMB',
    title: '城北古墓',
    category: 'exploration',
    description:
      '夜半时分，城北三十里外的古墓果然透出幽幽宝光。墓道入口的封土早已被人掘开，两侧石壁上刻着狰狞的镇墓兽，阴风从深处灌出，呜呜作响。',
    triggerCondition: { nodeType: 'Dungeon', probability: 0.15 },
    choices: [
      {
        label: '循宝光而入',
        description: '你壮着胆子摸进墓室，宝光来自一口石棺。你以灵力推开棺盖，棺中陪葬的玉器灵石尚在，只是棺底赫然留着一行血字："夺宝者死"。',
        outcomes: [
          { type: 'spiritStones', value: 180 },
          { type: 'hp', value: -30, probability: 0.5 },
        ],
      },
      {
        label: '以神识探路',
        description: '你放出神识顺着墓道缓缓推进，绕开三处翻板暗箭，在最深处的暗格中找到一卷完好的功法残篇。',
        condition: { minAttribute: 'perception', minValue: 8 },
        lockedText: '神识不足，探不清墓道深处的杀机。',
        outcomes: [
          { type: 'exp', value: 200 },
          { type: 'spiritStones', value: 80 },
        ],
      },
      {
        label: '在墓外掘宝',
        description: '你不敢深入，只在外围掘了几处土坑，倒也挖到几枚散落的古钱与玉佩。',
        outcomes: [
          { type: 'spiritStones', value: 50 },
          { type: 'item', value: 'MAT_JADE', probability: 0.5 },
        ],
      },
    ],
  },
  {
    id: 'EVT_EXP_RUINED_TEMPLE',
    title: '荒废古刹',
    category: 'exploration',
    description:
      '传闻中那位失踪仙尊曾驻留的寺庙，如今只剩残垣断壁，一尊缺了半边脑袋的石佛歪在荒草间，佛掌却依然结着古怪的印诀。檐角风铃早已锈死，在风中发出刺耳的嘶鸣。',
    triggerCondition: { nodeType: 'Dungeon', probability: 0.2 },
    choices: [
      {
        label: '叩拜石佛',
        description: '你对着残佛郑重叩拜。起身时，佛掌印诀处竟裂开一道缝隙，掉出一枚泛黄的玉简，上刻四个古篆："有缘得之"。',
        outcomes: [
          { type: 'exp', value: 150 },
          { type: 'skill', value: 'SKILL_HEALING_ART', probability: 0.3 },
        ],
      },
      {
        label: '搜寻殿基',
        description: '你翻遍倒塌的殿基，在蒲团灰烬下找到一只半埋的铜匣，匣中躺着几枚灵石与一张残破的符箓。',
        outcomes: [
          { type: 'spiritStones', value: 100 },
          { type: 'item', value: 'MAT_STARLIGHT', probability: 0.4 },
        ],
      },
      {
        label: '在佛前打坐',
        description: '你盘膝于残佛前闭目静坐，古刹虽破，一缕若有若无的禅意却萦绕不去，涤荡心神。',
        outcomes: [
          { type: 'hp', value: 15 },
          { type: 'attribute', attribute: 'comprehension', value: 1, probability: 0.4 },
        ],
      },
    ],
  },
  {
    id: 'EVT_EXP_FLOATING_ISLAND',
    title: '悬空浮岛',
    category: 'exploration',
    description:
      '云海翻涌处，一座倒悬的浮岛静静悬浮于空。岛上草木葱茏，溪水自岛缘跌落化作飞瀑，隐约可见岛心有一座通体漆黑的八角石塔。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.1 },
    choices: [
      {
        label: '御风登岛',
        description: '你提气纵身，借着风势落在岛上。石塔塔门虚掩，塔内石阶盘旋而上，每层都散落着前人遗落的物件。',
        outcomes: [
          { type: 'spiritStones', value: 120 },
          { type: 'exp', value: 80 },
          { type: 'hp', value: -20, probability: 0.4 },
        ],
      },
      {
        label: '隔空探查塔顶',
        description: '你立在崖边以神识远探，塔顶石室中有一缕灵气格外精纯，可惜距离太远，只能记下方位以待来日。',
        outcomes: [
          { type: 'exp', value: 60 },
          { type: 'attribute', attribute: 'perception', value: 1, probability: 0.5 },
        ],
      },
      {
        label: '只采岛边灵草',
        description: '你只在浮岛边缘采了几株迎风生长的灵草，便匆忙跃回。云海之下，那座黑塔的塔影依然矗立在你心头。',
        outcomes: [
          { type: 'item', value: 'MAT_SPIRIT_GRASS', probability: 0.8 },
          { type: 'exp', value: 30 },
        ],
      },
    ],
  },
  {
    id: 'EVT_SOC_BLIND_TEA_MASTER',
    title: '盲眼茶博士',
    category: 'social',
    description:
      '东街茶馆里，那位瞎眼的茶博士正慢条斯理地沏茶。你想到坊间那句"他年轻时剑法曾压得半个江湖抬不起头"的传闻，不由多看了他一眼。他忽然偏过头，"看"向你的方向。',
    triggerCondition: { nodeType: 'City', probability: 0.25 },
    choices: [
      {
        label: '上前敬茶',
        description: '你双手奉上一杯茶，恭恭敬敬。茶博士接茶时指尖微不可察地在你腕上一搭，笑了："有心人。"他留下一句箴言便不再多言。',
        outcomes: [
          { type: 'exp', value: 120 },
          { type: 'attribute', attribute: 'comprehension', value: 1, probability: 0.5 },
        ],
      },
      {
        label: '旁听老人讲故事',
        description: '你在角落坐下，听茶博士给旁人说些陈年旧事。他讲得云淡风轻，你却从中听出几分剑道真意。',
        outcomes: [
          { type: 'exp', value: 80 },
          { type: 'attribute', attribute: 'perception', value: 1, probability: 0.4 },
        ],
      },
      {
        label: '试探其来历',
        description: '你以闲谈之名试探他的出身，他只笑着摇头："陈年旧事，提它作甚。"你问不出所以然，却也混了杯好茶。',
        outcomes: [
          { type: 'favorability', value: 5 },
          { type: 'hp', value: 10 },
        ],
      },
    ],
  },
  {
    id: 'EVT_SOC_ELDER_SECRET',
    title: '长老往事',
    category: 'social',
    description:
      '你从茶馆的窃窃私语里拼凑出一桩旧事：城中那位德高望重的长老，年轻时竟与魔道有过一段渊源。正自思量，那位长老却带着随从从街角缓缓走来，目光扫过你时顿了一顿。',
    triggerCondition: { nodeType: 'City', probability: 0.2 },
    choices: [
      {
        label: '上前执礼问候',
        description: '你上前行礼，言谈间不卑不亢，只字不提那些传闻。长老抚须点头，临别赠你一句点拨："有些事，知道就好。"',
        outcomes: [
          { type: 'favorability', value: 25 },
          { type: 'exp', value: 80 },
        ],
      },
      {
        label: '装作不知回避',
        description: '你垂下眼帘让到一旁，装作只是路过。长老从你身侧经过，脚步未停，你悬着的心才放了下来。',
        outcomes: [
          { type: 'exp', value: 20 },
          { type: 'attribute', attribute: 'luck', value: 1, probability: 0.3 },
        ],
      },
      {
        label: '借故攀谈打探',
        description: '你凑上前去套话，长老只淡淡一笑："年轻人，别打听不该打听的事。"你碰了个软钉子，悻悻退开。',
        outcomes: [
          { type: 'favorability', value: -15 },
          { type: 'exp', value: 30 },
        ],
      },
    ],
  },
  {
    id: 'EVT_SOC_HALF_PRICE_PILLS',
    title: '百草堂半价日',
    category: 'social',
    description:
      '初一这天，城东百草堂门口排起长队，掌柜亲自主持，丹药一律半价。柜台上的丹药转眼便空了大半，掌柜却依然笑呵呵地招呼着熟客。',
    triggerCondition: { nodeType: 'City', probability: 0.2 },
    choices: [
      {
        label: '排队买丹药',
        description: '你排了小半个时辰，抢到几枚平日舍不得买的丹药，算下来省下不少灵石。',
        outcomes: [
          { type: 'spiritStones', value: -40 },
          { type: 'item', value: 'MAT_BLOOD_FLOWER', probability: 0.6 },
        ],
      },
      {
        label: '与掌柜攀谈',
        description: '散场后你与掌柜攀谈几句，他见你懂些药理，破例给你指了一条采药的路子。',
        outcomes: [
          { type: 'exp', value: 60 },
          { type: 'item', value: 'MAT_SPIRIT_GRASS', probability: 0.5 },
        ],
      },
      {
        label: '只看看不买',
        description: '你围观了一阵热闹，将药价行情记在心里，便转身离开。省下的灵石，或许比半价的丹药更值。',
        outcomes: [
          { type: 'spiritStones', value: 10 },
          { type: 'attribute', attribute: 'perception', value: 1, probability: 0.3 },
        ],
      },
    ],
  },
  {
    id: 'EVT_COMBAT_WOLF_KING',
    title: '苍岭狼王',
    category: 'combat',
    description:
      '苍岭深处，一声狼嚎震彻山林。月光下，一头通体银灰、体型堪比小山的狼王缓缓走出，刀枪不入的皮毛泛着冷光。你想起猎户的话——它最怕火。',
    triggerCondition: { minLuck: 30, nodeType: 'Wilderness', probability: 0.15 },
    choices: [
      {
        label: '燃起一堆火',
        description: '你迅速堆起柴薪点燃，火光冲天。狼王果然顿住脚步，隔着火堆低吼，最终不甘地退入黑暗。',
        outcomes: [
          { type: 'exp', value: 90 },
          { type: 'item', value: 'MAT_DRAGON_BLOOD', probability: 0.3 },
        ],
      },
      {
        label: '正面硬撼',
        description: '你拔出兵器冲向狼王，利爪擦过你的肩头火辣辣地疼。你拼尽全力才将它逼退，自己也被挠得鲜血淋漓。',
        outcomes: [
          { type: 'exp', value: 160 },
          { type: 'hp', value: -45 },
          { type: 'spiritStones', value: 60, probability: 0.4 },
        ],
      },
      {
        label: '绕道而行',
        description: '你掂量一番自己的斤两，决定不跟这头凶兽过不去，悄然绕出它的领地。',
        outcomes: [{ type: 'exp', value: 15 }],
      },
    ],
  },
  {
    id: 'EVT_COMBAT_IRON_DRAGON',
    title: '铁背苍龙',
    category: 'combat',
    description:
      '苍岭最深处，你终于见到了传闻中的铁背苍龙。它盘踞在深潭之畔，鳞甲如铁，呼吸间气流卷动落叶，气息压得你几乎喘不过气。龙躯之下，隐约露出一枚闪着幽光的鳞片。',
    triggerCondition: { nodeType: 'Dungeon', probability: 0.1 },
    choices: [
      {
        label: '趁其沉睡取鳞',
        description: '你屏息潜近，趁苍龙鼾声如雷时，出手如电地撬下一枚鳞片。苍龙猛地睁眼，一声龙吟震得你气血翻涌，你头也不回地夺路狂奔。',
        condition: { minAttribute: 'agility', minValue: 9 },
        lockedText: '身法不足，在苍龙面前取鳞无异于送死。',
        outcomes: [
          { type: 'item', value: 'MAT_METEORITE', probability: 0.7 },
          { type: 'hp', value: -40 },
          { type: 'exp', value: 100 },
        ],
      },
      {
        label: '献上灵物示好',
        description: '你取出随身灵材远远抛出，苍龙抬眼嗅了嗅，垂下眼帘不再理会。你趁机全身而退，还得了它一个不轻不重的"认可"。',
        outcomes: [
          { type: 'spiritStones', value: -30 },
          { type: 'attribute', attribute: 'luck', value: 2, probability: 0.5 },
        ],
      },
      {
        label: '知难而退',
        description: '铁背苍龙的气息非你所能撼动，你缓缓后退，退出它的领地后才长出一口气。',
        outcomes: [{ type: 'exp', value: 20 }],
      },
    ],
  },
  {
    id: 'EVT_COMBAT_GHOST_AMBUSH',
    title: '夜半阴兵',
    category: 'combat',
    description:
      '夜宿荒庙，三更时分庙外忽然传来整齐的甲胄碰撞声。你从门缝窥去，只见一队半透明的阴兵踏雾而来，为首者面目模糊，手中长戈泛着幽绿磷火。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.15 },
    choices: [
      {
        label: '藏匿气息',
        description: '你收敛全部气息，屏息贴墙而立。阴兵列队而过，带起一阵彻骨阴风，竟无人发觉庙中有人。',
        condition: { minAttribute: 'perception', minValue: 6 },
        lockedText: '神识不够凝练，藏不住活人气息。',
        outcomes: [
          { type: 'exp', value: 60 },
          { type: 'attribute', attribute: 'perception', value: 1, probability: 0.4 },
        ],
      },
      {
        label: '祭出法器迎战',
        description: '你大喝一声冲出庙门，法器裹着灵光斩向阴兵。为首阴兵身形虚晃，一戈扫来，你硬接之下虎口迸裂，却终究将它们逼退。',
        outcomes: [
          { type: 'exp', value: 120 },
          { type: 'hp', value: -35 },
          { type: 'spiritStones', value: 50, probability: 0.5 },
        ],
      },
      {
        label: '诵经驱邪',
        description: '你盘坐庙中，一遍遍诵念驱邪咒。阴兵在庙外盘旋数圈，终究退去，只留下一地渐渐消散的磷火。',
        outcomes: [
          { type: 'hp', value: -15 },
          { type: 'exp', value: 40 },
        ],
      },
    ],
  },
  {
    id: 'EVT_FOR_PHOENIX_SIGHTING',
    title: '凤鸣山异象',
    category: 'fortune',
    description:
      '你夜经凤鸣山，忽见一道凤凰虚影自山顶冲天而起，满山梧桐一夜之间花开如锦。花雨纷落中，山巅一块青石上凝着三滴殷红如血的凤血灵露。',
    triggerCondition: { minLuck: 50, nodeType: 'Wilderness', probability: 0.12 },
    choices: [
      {
        label: '收拢凤血灵露',
        description: '你以玉器小心收拢灵露，入瓶时凤露自瓶中传来一声清鸣。此物蕴含凤凰真血，乃是淬体的无上珍材。',
        outcomes: [
          { type: 'item', value: 'MAT_DRAGON_BLOOD', probability: 0.8 },
          { type: 'exp', value: 60 },
        ],
      },
      {
        label: '于梧桐下打坐',
        description: '你盘坐于满树繁花的梧桐下，花香裹着灵气涌入肺腑，体内灵力随之活跃异常。',
        outcomes: [
          { type: 'exp', value: 140 },
          { type: 'attribute', attribute: 'luck', value: 1, probability: 0.4 },
        ],
      },
      {
        label: '折枝为念',
        description: '你折下一枝开满花的梧桐枝插在发间，转身离去。枝头花瓣竟三月不谢，伴你一路同行。',
        outcomes: [
          { type: 'attribute', attribute: 'charm', value: 1, probability: 0.6 },
          { type: 'exp', value: 30 },
        ],
      },
    ],
  },
  {
    id: 'EVT_FOR_SPIRIT_ORCHID',
    title: '幽谷仙兰',
    category: 'fortune',
    description:
      '幽谷背阴处，一株通体莹白的兰花静静绽放，花瓣上流转着星星点点的灵光。谷中静谧异常，连虫鸣都没有，仿佛整片山谷都在守护着这株仙兰。',
    triggerCondition: { minLuck: 40, nodeType: 'Wilderness', probability: 0.15 },
    choices: [
      {
        label: '连根移栽',
        description: '你小心地将仙兰连土带根挖出，装入玉盒。此兰移栽成活，便是一株源源不断的灵材。',
        outcomes: [
          { type: 'item', value: 'MAT_SPIRIT_GRASS', probability: 0.9 },
          { type: 'spiritStones', value: 80 },
        ],
      },
      {
        label: '采花不伤根',
        description: '你只摘下一朵兰花，留根于土。兰香入鼻，清心明神，你离开时回望，那株兰花的根须竟微微摆动，仿佛在道谢。',
        outcomes: [
          { type: 'exp', value: 100 },
          { type: 'attribute', attribute: 'luck', value: 1, probability: 0.5 },
        ],
      },
      {
        label: '原地参悟',
        description: '你索性在兰花旁打坐，幽香沁脾，杂念尽消，识海一片澄明。',
        outcomes: [
          { type: 'exp', value: 120 },
          { type: 'attribute', attribute: 'comprehension', value: 1, probability: 0.4 },
        ],
      },
    ],
  },
  {
    id: 'EVT_FOR_LUCKY_TREE',
    title: '福禄之树',
    category: 'fortune',
    description:
      '村口老槐树下，系满褪色的红绳，树身挂着一块木牌："许愿灵树，有求必应。"村童说，只要诚心绕着树走三圈，许下的愿望便会实现。',
    triggerCondition: { nodeType: 'City', probability: 0.3 },
    choices: [
      {
        label: '绕树三圈许愿',
        description: '你依言绕树三圈，心中默念所求。起身时，一阵清风拂过，檐角一枚旧铜钱落入你掌心，仿佛冥冥中的回应。',
        outcomes: [
          { type: 'attribute', attribute: 'luck', value: 1, probability: 0.7 },
          { type: 'spiritStones', value: 30 },
        ],
      },
      {
        label: '系上红绳',
        description: '你买来一根红绳系在枝头，郑重许愿。旁观的村童咯咯直笑，你也跟着笑起来，心头的阴霾散了大半。',
        outcomes: [
          { type: 'hp', value: 10 },
          { type: 'attribute', attribute: 'charm', value: 1, probability: 0.3 },
        ],
      },
      {
        label: '拜而不求',
        description: '你对着老树郑重一拜，却什么也没求。老树无言，你在树下坐了半日，心境竟前所未有地平和。',
        outcomes: [
          { type: 'exp', value: 50 },
          { type: 'hp', value: 10 },
        ],
      },
    ],
  },
  {
    id: 'EVT_MIS_NIGHT_GRAVEYARD',
    title: '乱葬岗夜行',
    category: 'misfortune',
    description:
      '你贪近路，夜经城北乱葬岗。鬼火磷光间，果然有几个黑袍人围成一圈，对着一具新掘的尸骨念念有词。你脚步一滞，为首的黑袍人已经缓缓转头，兜帽下露出一双泛红的眼睛。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.15 },
    choices: [
      {
        label: '夺路而逃',
        description: '你转身就跑，身后传来桀桀怪笑与风声。你一路狂奔直到天亮才敢停下，冷汗湿透了衣背。',
        outcomes: [
          { type: 'hp', value: -20 },
          { type: 'exp', value: 30 },
        ],
      },
      {
        label: '悄悄潜行观察',
        description: '你屏息藏入乱石后，偷看黑袍人的仪式。他们用尸骨炼制邪器，手法阴毒。你记住了其中两人的形貌，日后也好避着走。',
        outcomes: [
          { type: 'exp', value: 70 },
          { type: 'attribute', attribute: 'perception', value: 1, probability: 0.4 },
        ],
      },
      {
        label: '祭出雷符驱邪',
        description: '你祭出一枚雷符掷向黑袍人，雷光炸开，几人惊叫着四散。你趁机脱身，只是那雷符花了不少灵石。',
        outcomes: [
          { type: 'spiritStones', value: -40 },
          { type: 'exp', value: 80 },
        ],
      },
    ],
  },
  {
    id: 'EVT_MIS_BEAST_MOTHER',
    title: '妖兽追袭',
    category: 'misfortune',
    description:
      '你路过一片灌木丛，惊起一只幼兽的尖叫。下一秒，一头双目赤红的母兽从林中暴起，獠牙森然，死死盯住你——你把它的幼崽吓着了。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.2 },
    choices: [
      {
        label: '且战且退',
        description: '你一边格挡一边后退，母兽攻势如潮。你拼着挨了两记重击，才脱离它的领地，浑身是血。',
        outcomes: [
          { type: 'exp', value: 90 },
          { type: 'hp', value: -40 },
        ],
      },
      {
        label: '跃上高树躲避',
        description: '你三两步窜上高树，母兽在树下低吼半晌，终究够不着你，悻悻带着幼崽离去。',
        condition: { minAttribute: 'agility', minValue: 7 },
        lockedText: '身法不够，怕是爬不过那头母兽的扑击。',
        outcomes: [
          { type: 'exp', value: 40 },
          { type: 'attribute', attribute: 'luck', value: 1, probability: 0.3 },
        ],
      },
      {
        label: '丢出灵材引开',
        description: '你掏出随身灵材远远抛出，母兽犹豫片刻，还是扑向灵材。你趁机悄然遁走，损失了些许材料。',
        outcomes: [
          { type: 'spiritStones', value: -20 },
          { type: 'hp', value: -10 },
        ],
      },
    ],
  },

  // ============================================================
  // 【八】补充事件 ×15（全部携带 npcId/locationId 原子引用，
  //      与 npc-registry / location-registry / gossip-registry 闭环）
  // ============================================================
  {
    id: 'EVT_SOC_TEA_MASTER_TEST',
    title: '茶博士试茶',
    category: 'social',
    description:
      '东街茶馆里，盲眼茶博士阿善忽然叫住你："小友，来，替我尝尝这壶新茶。"他递来一杯茶水，指尖却在你腕上轻轻一搭——那分明是剑修的指法。',
    triggerCondition: { nodeType: 'City', probability: 0.2 },
    npcId: 'NPC_TEA_BLIND',
    locationId: 'LOC_EAST_TEAHOUSE',
    choices: [
      {
        label: '坦然接茶品饮',
        description: '你接过茶盏一饮而尽，茶香清冽，回味竟有一丝剑意缭绕。阿善笑而不语，又从袖中摸出一枚洗得发亮的铜钱递给你："拿去，买碗茶喝。"',
        outcomes: [
          { type: 'exp', value: 90 },
          { type: 'attribute', attribute: 'comprehension', value: 1, probability: 0.5 },
        ],
      },
      {
        label: '请教当年剑法',
        description: '你压低声音问起他当年的剑。阿善沉默良久，只蘸着茶水在桌上划了一道："剑道至此，便够了。"那一道水痕，你看了整整半日。',
        outcomes: [
          { type: 'exp', value: 150 },
          { type: 'favorability', value: 10 },
        ],
      },
      {
        label: '以灵石回礼',
        description: '你取出几枚灵石推过去。阿善笑了笑没有推辞，却随手把灵石摆成了一个小小的剑阵形状——那是他给你的见面礼。',
        outcomes: [
          { type: 'spiritStones', value: -30 },
          { type: 'attribute', attribute: 'perception', value: 1, probability: 0.4 },
        ],
      },
    ],
  },
  {
    id: 'EVT_SOC_WIDOW_NIGHTTALK',
    title: '客栈夜话',
    category: 'social',
    description:
      '雨夜，城西客栈果然谢了客。你被柳三娘留在檐下避雨，她给你沏了碗姜茶，望着后院的枯井出神。半晌，她忽然开口："年轻人，你要是哪天路过东海边，替我看看那里的潮。"',
    triggerCondition: { nodeType: 'City', probability: 0.15 },
    npcId: 'NPC_INN_WIDOW',
    locationId: 'LOC_WEST_INN',
    choices: [
      {
        label: '应下这桩托付',
        description: '你郑重应下。柳三娘愣了愣，眼眶微红，从袖中取出一枚半旧的木簪塞进你手里："拿着，算个信物。"',
        outcomes: [
          { type: 'exp', value: 120 },
          { type: 'attribute', attribute: 'charm', value: 1, probability: 0.5 },
        ],
      },
      {
        label: '询问那口枯井',
        description: '你问起后院那口封死的井。柳三娘的目光骤然黯淡："井里……埋着一把伞。"她说完便起身回了房，再没有出来。',
        outcomes: [
          { type: 'exp', value: 60 },
          { type: 'attribute', attribute: 'luck', value: 1, probability: 0.3 },
        ],
      },
      {
        label: '告辞离去',
        description: '雨停了你起身告辞。柳三娘在门边站了很久，直到你的背影消失在长街尽头，才轻轻掩上门。',
        outcomes: [{ type: 'exp', value: 20 }],
      },
    ],
  },
  {
    id: 'EVT_CULT_MAD_ALCHEMIST_PILL',
    title: '疯丹师赠药',
    category: 'cultivation',
    description:
      '你路过城郊丹庐，被一股刺鼻的药味呛得直打喷嚏。石疯子从炉灰里抬起头，盯着你看了半晌，忽然把一枚乌漆嘛黑、还冒着热气的丹药塞进你手里："尝尝，死不了。"',
    triggerCondition: { nodeType: 'City', probability: 0.15 },
    npcId: 'NPC_ALCHEMIST_MAD',
    locationId: 'LOC_ALCHEMIST_HUT',
    choices: [
      {
        label: '硬着头皮服下',
        description: '你闭眼吞下丹药，一股滚烫的热流顺着经脉窜遍全身，痛得你当场打坐炼化。等再睁眼时，丹田灵力竟凝实了几分。',
        outcomes: [
          { type: 'exp', value: 180 },
          { type: 'hp', value: -20, probability: 0.5 },
        ],
      },
      {
        label: '只收下不服用',
        description: '你把丹药收入玉瓶贴身放好。石疯子咧嘴一笑："有眼光，这炉可是加了心头血的。"你一阵恶寒。',
        outcomes: [
          { type: 'exp', value: 40 },
          { type: 'item', value: 'MAT_BLOOD_FLOWER', probability: 0.5 },
        ],
      },
      {
        label: '帮他清理丹炉',
        description: '你撸起袖子帮他收拾满地的药渣。石疯子看着你忙前忙后，忽然没头没脑地说了一句："那药渣里泡的茶，能解百毒。"',
        outcomes: [
          { type: 'exp', value: 70 },
          { type: 'attribute', attribute: 'poisonResist', value: 5, probability: 0.6 },
        ],
      },
    ],
  },
  {
    id: 'EVT_EXP_FORGE_TASK',
    title: '铁匠的委托',
    category: 'exploration',
    description:
      '城南打铁铺里，哑巴铁匠老锤把一柄断剑拍在你面前，又塞给你一张磨破的图纸，指了指图上的山。他比划了半天，意思很明白：去苍岭，替他带一截会发光的铁矿石回来。',
    triggerCondition: { nodeType: 'City', probability: 0.2 },
    npcId: 'NPC_FORGE_MUTE',
    locationId: 'LOC_SOUTH_FORGE',
    choices: [
      {
        label: '接下委托',
        description: '你收了图纸和定金，踏上前往苍岭的路。铁匠在你身后，破天荒地朝你拱了拱手。',
        outcomes: [
          { type: 'spiritStones', value: 20 },
          { type: 'exp', value: 50 },
        ],
      },
      {
        label: '打探后院那扇门',
        description: '你目光扫向铁匠铺后院那扇从不开的门。老锤的脸一下子沉下来，缓缓摇头，比了个"斩"的手势。',
        outcomes: [
          { type: 'exp', value: 20 },
          { type: 'favorability', value: -10 },
        ],
      },
      {
        label: '婉言谢绝',
        description: '你拱手告辞。老锤也不挽留，只是把断剑收进柜底，继续叮叮当当地打铁。',
        outcomes: [{ type: 'exp', value: 10 }],
      },
    ],
  },
  {
    id: 'EVT_SOC_PILL_TRAP',
    title: '药贩的陷阱',
    category: 'social',
    description:
      '坊市药贩子孙掌柜拉住你，神秘兮兮地掏出一个木盒："兄弟，上好灵丹，半价！"盒子一开，一股子药渣的馊味扑面而来。你想起茶楼里那条"他卖假药"的传闻，心里有了数。',
    triggerCondition: { nodeType: 'City', probability: 0.2 },
    npcId: 'NPC_PILL_SELLER',
    locationId: 'LOC_MARKET',
    choices: [
      {
        label: '当面拆穿',
        description: '你掀开盒子把"灵丹"倒在掌心，捏开一看，果然是一包药渣。孙掌柜脸色大变，连连告饶，你懒得计较，转身就走。',
        outcomes: [
          { type: 'exp', value: 50 },
          { type: 'favorability', value: -20 },
        ],
      },
      {
        label: '将计就计压价',
        description: '你故作不识货，狠狠压了价，用一成的价钱买下他的"灵丹"。孙掌柜赔着笑送你走，心里直骂晦气。',
        outcomes: [
          { type: 'spiritStones', value: -10 },
          { type: 'attribute', attribute: 'luck', value: 1, probability: 0.4 },
        ],
      },
      {
        label: '不动声色离开',
        description: '你笑着说"改日再来"，转身离去。孙掌柜还在身后热情地喊："回头客打八折！"',
        outcomes: [{ type: 'exp', value: 20 }],
      },
    ],
  },
  {
    id: 'EVT_MIS_MINE_ACCIDENT',
    title: '矿难',
    category: 'misfortune',
    description:
      '你刚走到城北灵矿附近，地底忽然传来一声闷响，紧接着矿口涌出滚滚烟尘。矿工们哭喊着往外跑——塌方了！矿主王守山脸色煞白，嘶吼着让人救人。',
    triggerCondition: { nodeType: 'City', probability: 0.12 },
    npcId: 'NPC_MINE_OWNER',
    locationId: 'LOC_NORTH_MINE',
    choices: [
      {
        label: '冲进矿洞救人',
        description: '你提气冲进烟尘弥漫的矿洞，凭神识在塌方边缘救出了三个被困的矿工。出来时你浑身灰土，矿主王守山当众向你深鞠一躬。',
        condition: { minAttribute: 'physique', minValue: 7 },
        lockedText: '矿洞不稳，肉身不够强横怕是救人不成反被埋。',
        outcomes: [
          { type: 'favorability', value: 30 },
          { type: 'spiritStones', value: 60 },
          { type: 'hp', value: -25 },
        ],
      },
      {
        label: '协助组织救援',
        description: '你帮忙稳住骚动的矿工，指挥他们有序清挖塌方。忙了大半日，总算挖通一个通风口，救出两人。',
        outcomes: [
          { type: 'exp', value: 90 },
          { type: 'favorability', value: 15 },
        ],
      },
      {
        label: '远远旁观',
        description: '你站在远处看着乱成一团的矿口，帮不上忙，也不愿冒险。看着看着，你忽然注意到矿主王守山看账本的眼神，有几分不对劲。',
        outcomes: [
          { type: 'exp', value: 30 },
          { type: 'attribute', attribute: 'perception', value: 1, probability: 0.3 },
        ],
      },
    ],
  },
  {
    id: 'EVT_SOC_VEGETABLE_SPIRIT',
    title: '萝卜成精',
    category: 'social',
    description:
      '城郊农田里，沈书生正对着一个半人高的坑唉声叹气。坑里还剩半截萝卜，正吱吱乱叫地往土里钻。见你来了，他眼睛一亮："道友！帮我抓住它，今晚萝卜宴！"',
    triggerCondition: { nodeType: 'City', probability: 0.18 },
    npcId: 'NPC_SCHOLAR_FARM',
    locationId: 'LOC_SCHOLAR_FARM',
    choices: [
      {
        label: '帮忙捉萝卜',
        description: '你眼疾手快，一把揪住萝卜缨子。那萝卜精在你手里扭来扭去，最后化作一缕灵气散去，原地留下半截甜滋滋的萝卜。沈书生笑得合不拢嘴。',
        outcomes: [
          { type: 'exp', value: 60 },
          { type: 'item', value: 'MAT_SPIRIT_GRASS', probability: 0.5 },
        ],
      },
      {
        label: '与萝卜精讲道理',
        description: '你蹲下身，好声好气地劝那萝卜精："修炼不易，何必当人家的菜。"萝卜精安静下来，叶子摆了摆，沈书生愣了愣，竟然放它钻回了土里。',
        outcomes: [
          { type: 'exp', value: 80 },
          { type: 'attribute', attribute: 'comprehension', value: 1, probability: 0.4 },
        ],
      },
      {
        label: '向沈书生讨教种地',
        description: '你绕开萝卜的事，向沈书生请教他"种地即大道"的道理。他来了兴致，给你讲了一炷香的"土中自有乾坤"。',
        outcomes: [
          { type: 'exp', value: 70 },
          { type: 'favorability', value: 10 },
        ],
      },
    ],
  },
  {
    id: 'EVT_SOC_ROOSTER_ACCOUNT',
    title: '灵鸡对账',
    category: 'social',
    description:
      '山间草庐外，玄真子正被一只通体火红的灵鸡追着跑。那鸡叼着一张纸，上面歪歪扭扭地写着"酒钱 三百文"。老道一边躲一边喊："这账能不能下次再结！"',
    triggerCondition: { nodeType: 'City', probability: 0.15 },
    npcId: 'NPC_TAOIST_ROOSTER',
    locationId: 'LOC_MOUNTAIN_COTTAGE',
    choices: [
      {
        label: '替老道还账',
        description: '你替玄真子付了三百文酒钱。灵鸡啄了啄你的手背，算作道谢。老道感激不尽，拉你进屋："贫道无以为报，送你一句道机。"',
        outcomes: [
          { type: 'spiritStones', value: -30 },
          { type: 'exp', value: 120 },
          { type: 'attribute', attribute: 'comprehension', value: 1, probability: 0.5 },
        ],
      },
      {
        label: '看老道如何赖账',
        description: '你饶有兴致地看着一人一鸡斗智斗勇。最后灵鸡叼着账本飞上房梁，老道在下面跳脚，你在旁边笑得直不起腰。',
        outcomes: [
          { type: 'exp', value: 40 },
          { type: 'attribute', attribute: 'charm', value: 1, probability: 0.3 },
        ],
      },
      {
        label: '向灵鸡请教',
        description: '你好奇地问灵鸡怎么记账，它歪头看了你半天，用爪子在地上画了个"守"字。老道啧啧称奇："连它都看出你是个守财的。"',
        outcomes: [
          { type: 'exp', value: 60 },
          { type: 'attribute', attribute: 'luck', value: 1, probability: 0.3 },
        ],
      },
    ],
  },
  {
    id: 'EVT_FOR_MIRROR_SELF',
    title: '照心镜',
    category: 'fortune',
    description:
      '坊市那家照心镜铺门口排着长队。轮到你了，老板娘明镜递过一面铜镜："看吧，你心里最想要的东西。"你屏息望去，镜面上漾开一圈涟漪。',
    triggerCondition: { nodeType: 'City', probability: 0.15 },
    npcId: 'NPC_MIRROR_SHOP',
    locationId: 'LOC_MARKET',
    choices: [
      {
        label: '凝视镜中景象',
        description: '镜中出现一幕画面，你怔怔看了许久，心头百味杂陈。明镜轻声说："看清了就好。"出铺时，你的心境竟前所未有地通透。',
        outcomes: [
          { type: 'exp', value: 120 },
          { type: 'attribute', attribute: 'comprehension', value: 1, probability: 0.6 },
        ],
      },
      {
        label: '问老板娘镜子的真假',
        description: '你问明镜这镜子是不是障眼法。她轻笑："真亦假时假亦真，你心里信什么，它就照什么。"',
        outcomes: [
          { type: 'exp', value: 60 },
          { type: 'attribute', attribute: 'perception', value: 1, probability: 0.4 },
        ],
      },
      {
        label: '付钱买下镜子',
        description: '你花灵石买下这面铜镜。明镜却摇了摇头："镜子卖给谁，是它自己选的。"她把灵石推了回来。',
        outcomes: [
          { type: 'exp', value: 40 },
          { type: 'attribute', attribute: 'luck', value: 1, probability: 0.4 },
        ],
      },
    ],
  },
  {
    id: 'EVT_EXP_RAVEN_MESSAGE',
    title: '乌鸦传书',
    category: 'exploration',
    description:
      '一只黑乌鸦扑棱棱落在你肩头，歪着脑袋看你，爪子下夹着一封信。信上的字歪歪扭扭，落款是"你的一位故人"。乌鸦盯着你，显然在等你的肉干。',
    triggerCondition: { nodeType: 'City', probability: 0.2 },
    npcId: 'NPC_BEAST_RAVEN',
    locationId: 'LOC_CITY',
    choices: [
      {
        label: '喂它肉干取信',
        description: '你喂了它一根肉干，乌鸦叼住信翅膀一抖，竟把信拆开递到你面前。信里只有一句话："小心今晚的雨。"你心头一凛。',
        outcomes: [
          { type: 'exp', value: 80 },
          { type: 'attribute', attribute: 'luck', value: 1, probability: 0.5 },
        ],
      },
      {
        label: '不喂肉干硬抢',
        description: '你伸手去抢信，乌鸦振翅躲开，站在屋檐上"嘎嘎"嘲笑你。最后你只好破费买了一串肉干，才换来那封信。',
        outcomes: [
          { type: 'spiritStones', value: -15 },
          { type: 'exp', value: 50 },
        ],
      },
      {
        label: '请它带一封信',
        description: '你写下一封回信系在它爪上，又喂了两根肉干。乌鸦满意地扑棱棱飞走——它认得路，也认得出谁心诚。',
        outcomes: [
          { type: 'exp', value: 40 },
          { type: 'attribute', attribute: 'charm', value: 1, probability: 0.3 },
        ],
      },
    ],
  },
  {
    id: 'EVT_EXP_CARP_OMEN',
    title: '锦鲤示警',
    category: 'exploration',
    description:
      '城隍庙荷花池边，一条金色锦鲤跃出水面，吐出一串泡泡。你蹲下细看——那泡泡竟拼出两个字："快跑"。池水无风自动，一股说不清的危险气息正朝这边蔓延。',
    triggerCondition: { nodeType: 'City', probability: 0.15 },
    npcId: 'NPC_BEAST_CARP',
    locationId: 'LOC_TEMPLE_POND',
    choices: [
      {
        label: '信它，立即离开',
        description: '你毫不犹豫地转身就走。刚离开城隍庙，身后便传来一阵骚动——一伙寻衅的散修冲进庙里，却扑了个空。那金鲤的示警，救了你一回。',
        outcomes: [
          { type: 'exp', value: 90 },
          { type: 'attribute', attribute: 'luck', value: 1, probability: 0.5 },
        ],
      },
      {
        label: '留下戒备',
        description: '你留在池边暗中戒备，果然等到两个鬼鬼祟祟的身影摸进庙里翻找香火钱。你出手制服了他们，庙祝感激不尽。',
        outcomes: [
          { type: 'exp', value: 110 },
          { type: 'favorability', value: 20 },
          { type: 'hp', value: -15, probability: 0.3 },
        ],
      },
      {
        label: '与锦鲤对视',
        description: '你与金鲤隔水对视。它又吐了一串泡泡，这次拼出的是"小心"二字。你记在心里，朝它拱了拱手。',
        outcomes: [
          { type: 'exp', value: 60 },
          { type: 'attribute', attribute: 'perception', value: 1, probability: 0.4 },
        ],
      },
    ],
  },
  {
    id: 'EVT_EXP_ORPHAN_RESCUE',
    title: '育幼堂险情',
    category: 'exploration',
    description:
      '你路过城东育幼堂，正撞见几个地痞在门口撒泼，要抢孤儿们攒的积蓄。白发阿婆护在孩子们身前，佝偻的身影在日光下显得格外单薄——你想起关于她曾是女剑仙的传闻。',
    triggerCondition: { nodeType: 'City', probability: 0.15 },
    npcId: 'NPC_ORPHAN_MASTER',
    locationId: 'LOC_ORPHANAGE',
    choices: [
      {
        label: '出手驱赶地痞',
        description: '你三拳两脚撂倒为首的地痞，剩下的抱头鼠窜。阿婆拉着你絮絮叨叨道谢，非要留你吃晚饭。孩子们围着你叽叽喳喳，像一群麻雀。',
        outcomes: [
          { type: 'exp', value: 80 },
          { type: 'favorability', value: 25 },
          { type: 'spiritStones', value: -10, probability: 0.3 },
        ],
      },
      {
        label: '暗中警告地痞',
        description: '你不屑动手，只是报出青云宗的名号，吓得几个地痞灰溜溜地跑了。阿婆在门口朝你欠了欠身，眼里有看透一切的清明。',
        outcomes: [
          { type: 'exp', value: 50 },
          { type: 'attribute', attribute: 'charm', value: 1, probability: 0.4 },
        ],
      },
      {
        label: '留下一袋灵石',
        description: '你趁乱悄悄往门槛下塞了一袋灵石便转身离开。刚走出几步，身后传来阿婆的声音："好孩子，你的剑，和她当年很像。"',
        outcomes: [
          { type: 'spiritStones', value: -40 },
          { type: 'attribute', attribute: 'luck', value: 2, probability: 0.5 },
        ],
      },
    ],
  },
  {
    id: 'EVT_COMBAT_FOX_TRAP',
    title: '狐言惑路',
    category: 'combat',
    description:
      '幽林深处，一只三尾白狐蹲在岔路口，慢悠悠地开口："那边有宝藏哦，往右走。"它笑盈盈地看着你，尾巴尖轻轻摆动。你想起了那个被骗进深渊的采药人。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.18 },
    npcId: 'NPC_BEAST_FOX',
    locationId: 'LOC_FOREST',
    choices: [
      {
        label: '反向而行',
        description: '你偏要往左走。左路尽头是一处深坑，坑底散落着白骨与锈剑——那狐狸果然没安好心。你冷笑一声，绕道离开。',
        outcomes: [
          { type: 'exp', value: 90 },
          { type: 'attribute', attribute: 'perception', value: 1, probability: 0.5 },
        ],
      },
      {
        label: '识破并反将一军',
        description: '你识破了它的把戏，反手布下一个困阵。白狐中计被困，气得直跳脚，最后化作一缕白烟遁走，留下几根银色狐毛。',
        condition: { minAttribute: 'comprehension', minValue: 8 },
        lockedText: '心机不够，怕是玩不过这头老狐狸。',
        outcomes: [
          { type: 'exp', value: 150 },
          { type: 'item', value: 'MAT_STARLIGHT', probability: 0.6 },
        ],
      },
      {
        label: '将计就计跟它走',
        description: '你装作上钩跟着白狐往右走。它在前面带路，你殿后戒备。走了半里地，它忽然停住，回头看了你一眼——那眼神里竟有一丝欣赏。',
        outcomes: [
          { type: 'exp', value: 60 },
          { type: 'spiritStones', value: 50, probability: 0.4 },
        ],
      },
    ],
  },
  {
    id: 'EVT_EXP_MONKEY_BET',
    title: '猴山赌酒',
    category: 'exploration',
    description:
      '猴山上，一群猴子拦住了你的去路，为首的捧着个石坛，坛口封着泥，酒香扑鼻——是猴儿酒！猴子们吱吱叫着，比划着：喝下这坛酒，就放你过去。',
    triggerCondition: { nodeType: 'Wilderness', probability: 0.15 },
    locationId: 'LOC_MONKEY_MOUNTAIN',
    choices: [
      {
        label: '豪饮半坛',
        description: '你拍开泥封，仰头灌下半坛猴儿酒，只觉一股热流直冲天灵盖，当场醉得人事不省。醒来时，你躺在猴窝里，一群猴子正围着你嘻嘻哈哈，掌心里还捏着一颗甜果。',
        outcomes: [
          { type: 'exp', value: 120 },
          { type: 'hp', value: -15, probability: 0.5 },
        ],
      },
      {
        label: '以物换酒',
        description: '你掏出几枚灵石想买下整坛。猴子们看着灵石面面相觑，最后为首的猴子叼起一枚灵石，扔回给你，又指着你的干粮袋。',
        outcomes: [
          { type: 'spiritStones', value: -10 },
          { type: 'item', value: 'MAT_SPIRIT_GRASS', probability: 0.6 },
        ],
      },
      {
        label: '不喝酒硬闯',
        description: '你仗着身法要硬闯猴山，猴子们顿时炸了窝，抱着酒坛子从四面八方砸过来。你左躲右闪还是被浇了一身酒，灰头土脸地败退下山。',
        condition: { minAttribute: 'agility', minValue: 6 },
        lockedText: '身法不够，怕是躲不过漫天的酒坛。',
        outcomes: [
          { type: 'exp', value: 30 },
          { type: 'hp', value: -20 },
        ],
      },
    ],
  },
  {
    id: 'EVT_FOR_LOVER_BRIDGE_PASS',
    title: '情人桥同行',
    category: 'fortune',
    description:
      '山涧上那座窄窄的情人桥横在两崖之间，桥下云雾翻涌。传说情侣牵手过桥便能得到祝福，松手的人则会坠入山涧。你独自站在桥头，山风裹着花香拂过。',
    triggerCondition: { minLuck: 35, nodeType: 'Wilderness', probability: 0.15 },
    locationId: 'LOC_LOVER_BRIDGE',
    choices: [
      {
        label: '孤身过桥',
        description: '你独自踏上石桥，走到桥心时，山涧忽然传来一声清越的鸾鸣，一道淡淡的灵光托着你稳稳走到对岸。桥的祝福，给了心无挂碍的你。',
        outcomes: [
          { type: 'exp', value: 140 },
          { type: 'attribute', attribute: 'luck', value: 2, probability: 0.5 },
        ],
      },
      {
        label: '折一枝花作伴',
        description: '你在桥头折了一枝山花握在手中，权当作伴。过桥时那枝花竟绽放得更艳，回到对岸，花瓣落在你掌心，凝成一枚花形灵石。',
        outcomes: [
          { type: 'spiritStones', value: 80 },
          { type: 'attribute', attribute: 'charm', value: 1, probability: 0.4 },
        ],
      },
      {
        label: '在桥头静坐',
        description: '你没有过桥，只在桥头坐下，听山风、闻花香。桥的那头是什么，似乎也没那么重要了。',
        outcomes: [
          { type: 'exp', value: 60 },
          { type: 'hp', value: 10 },
        ],
      },
    ],
  },
];
