// ============================================================
// 补充任务：NPC 实体注册表（原子实体库）
// 为八卦（gossip-registry）、奇遇（adventure-events）提供可复用的
// 具名 NPC 实体。八卦/事件通过 npcId 引用本表，避免硬编码人名。
// 引擎可据此做实体校验、名字渲染与 AI 对话接入：
//   - 一条八卦 = 某个真实 NPC 的八卦（可挂到 NPC 信息面板）
//   - 一个事件 = 与某 NPC 的交互（可复用于不同存档的同一 NPC）
// 注：本数据文件的接口为自包含定义，无对应 @taosim/contracts 类型
// ============================================================

export type NpcGender = 'male' | 'female' | 'unknown';

export type NpcRole =
  | 'teahouse_keeper'   // 茶楼掌柜/茶博士
  | 'blacksmith'        // 铁匠
  | 'innkeeper'         // 客栈老板娘
  | 'alchemist'         // 炼丹师
  | 'herbalist'         // 药贩/采药人
  | 'mine_owner'        // 矿主
  | 'taoist'            // 游方/隐修道人
  | 'scholar'           // 书生
  | 'guard'             // 护卫
  | 'nun'               // 尼姑/出家人
  | 'orphanage'         // 育幼堂管事
  | 'sword_servant'     // 剑侍
  | 'sect_master'       // 掌门
  | 'elder'             // 长老
  | 'disciple'          // 弟子
  | 'cook'              // 厨娘/膳师
  | 'shopkeeper'        // 店铺老板
  | 'priest'            // 祭师/神棍
  | 'vendor'            // 摊贩
  | 'bandit'            // 匪修（负面 NPC）
  | 'spirit_beast';     // 通灵妖兽

export type NpcRealm =
  | 'Mortal'
  | 'QiRefinement'   // 炼气
  | 'Foundation'     // 筑基
  | 'CoreFormation'  // 金丹
  | 'NascentSoul'    // 元婴
  | 'Immortal';      // 化神及以上

export interface Npc {
  id: string;                // 如 'NPC_TEA_BLIND'
  name: string;              // 显示名（八卦/事件文本中应保持一致）
  title: string;             // 称号/身份
  gender: NpcGender;
  role: NpcRole;
  realm: NpcRealm;
  homeLocationId?: string;   // 常驻地点（location-registry.ts）
  biography: string;         // 一句话背景（AI 对话养料）
  traits?: string[];         // 性格标签（供 AI 行为参考）
}

export const NPC_REGISTRY: Npc[] = [
  // ==================== 青云城·市井人物 ====================
  {
    id: 'NPC_TEA_BLIND',
    name: '阿善',
    title: '东街茶馆·盲眼茶博士',
    gender: 'male',
    role: 'teahouse_keeper',
    realm: 'Mortal',
    homeLocationId: 'LOC_EAST_TEAHOUSE',
    biography: '瞎眼的茶博士，年轻时曾一手剑法压得半个江湖抬不起头，因故双目失明后隐姓埋名，如今只在茶香中过活。',
    traits: ['隐忍', '通透', '剑意未熄'],
  },
  {
    id: 'NPC_FORGE_MUTE',
    name: '老锤',
    title: '城南打铁铺·哑巴铁匠',
    gender: 'male',
    role: 'blacksmith',
    realm: 'QiRefinement',
    homeLocationId: 'LOC_SOUTH_FORGE',
    biography: '从不多话的铁匠，祖上给仙人铸过剑。铺子后院那扇从不开的门里，传说藏着半部炼器古卷。',
    traits: ['沉默', '手巧', '有旧怨'],
  },
  {
    id: 'NPC_INN_WIDOW',
    name: '柳三娘',
    title: '城西客栈·老板娘',
    gender: 'female',
    role: 'innkeeper',
    realm: 'Mortal',
    homeLocationId: 'LOC_WEST_INN',
    biography: '雨夜谢客的客栈老板娘，对着后院一口封死的井说话，等一个永远不会回来的人。',
    traits: ['念旧', '外冷内热', '深藏秘密'],
  },
  {
    id: 'NPC_ALCHEMIST_MAD',
    name: '石疯子',
    title: '城郊丹庐·疯癫丹师',
    gender: 'male',
    role: 'alchemist',
    realm: 'Foundation',
    homeLocationId: 'LOC_ALCHEMIST_HUT',
    biography: '炼丹手法疯疯癫癫，半夜往丹炉里加血。凡吃过他丹的人都活过了百岁——没人知道他炼的到底是什么。',
    traits: ['疯癫', '丹道通神', '有难言之隐'],
  },
  {
    id: 'NPC_PILL_SELLER',
    name: '孙掌柜',
    title: '坊市·药贩子',
    gender: 'male',
    role: 'herbalist',
    realm: 'QiRefinement',
    homeLocationId: 'LOC_MARKET',
    biography: '笑脸迎人的药贩子，药价便宜得不像话。他的"灵丹"大多是药渣揉的丸子，吃不死人，也治不好病。',
    traits: ['圆滑', '奸商', '消息灵通'],
  },
  {
    id: 'NPC_MINE_OWNER',
    name: '王守山',
    title: '城北灵矿·矿主',
    gender: 'male',
    role: 'mine_owner',
    realm: 'Foundation',
    homeLocationId: 'LOC_NORTH_MINE',
    biography: '看着风光的灵石矿主，实则早被宗门架空。矿里每月产出七成不上账，账本在谁手里，谁说了算。',
    traits: ['精明', '身不由己', '墙头草'],
  },
  {
    id: 'NPC_MARKET_OLD',
    name: '老卜',
    title: '坊市·破烂摊老翁',
    gender: 'male',
    role: 'vendor',
    realm: 'QiRefinement',
    homeLocationId: 'LOC_MARKET',
    biography: '总摆着破烂摊的老翁，年轻时是位符箓大师。摊上真有宝贝，就看买家识不识货。',
    traits: ['藏拙', '慧眼识人', '爱戏耍'],
  },
  {
    id: 'NPC_FOOD_STALL',
    name: '阿膳',
    title: '坊市·灵膳老板娘',
    gender: 'female',
    role: 'cook',
    realm: 'Mortal',
    homeLocationId: 'LOC_MARKET',
    biography: '灵膳摊老板娘，蛋炒饭据说加了天材地宝，吃了头发会发光。曾让食客顶着绿莹莹的脑袋在坊市走了三天。',
    traits: ['热情', '手艺惊人', '常加错料'],
  },
  {
    id: 'NPC_MIRROR_SHOP',
    name: '明镜',
    title: '坊市·照心镜铺',
    gender: 'female',
    role: 'shopkeeper',
    realm: 'QiRefinement',
    homeLocationId: 'LOC_MARKET',
    biography: '照心镜铺的老板娘，她家的镜子能照出人心里最想要的东西。排队的散修进去时笑着，出来时大多红着眼眶。',
    traits: ['神秘', '洞察人心', '寡言'],
  },
  {
    id: 'NPC_SILENT_GUARD',
    name: '阿刀',
    title: '王宅·哑巴护卫',
    gender: 'male',
    role: 'guard',
    realm: 'Foundation',
    biography: '从不开口的护卫，曾在一次围杀中以命换命护主。腰间挂着一枚玉坠，是主家亡母当年的信物。',
    traits: ['忠诚', '寡言', '身世成谜'],
  },
  {
    id: 'NPC_ORPHAN_MASTER',
    name: '白发阿婆',
    title: '城东育幼堂·管事',
    gender: 'female',
    role: 'orphanage',
    realm: 'Mortal',
    homeLocationId: 'LOC_ORPHANAGE',
    biography: '总给孤儿发糖的老妪，年轻时是名震一方的女剑仙。散尽家财养了六十个孤儿，只说自己当年欠了一个孩子一生。',
    traits: ['慈爱', '深藏不露', '有旧债'],
  },
  {
    id: 'NPC_NUN',
    name: '慧净',
    title: '城郊破庙·哑尼',
    gender: 'female',
    role: 'nun',
    realm: 'Mortal',
    homeLocationId: 'LOC_RUINED_TEMPLE',
    biography: '从不说话的尼姑，替人看病分文不取。有人说是某个大人物的女儿，为赎一桩旧业才落发修行。',
    traits: ['慈悲', '沉默', '赎罪'],
  },

  // ==================== 城郊·田园与山林 ====================
  {
    id: 'NPC_SCHOLAR_FARM',
    name: '沈砚',
    title: '城郊·种地书生',
    gender: 'male',
    role: 'scholar',
    realm: 'QiRefinement',
    homeLocationId: 'LOC_SCHOLAR_FARM',
    biography: '不修炼只种地的书生修士，萝卜比人还高。他坚信"种地才是大道"，上个月萝卜真成了精，半夜顶着土在田里跑。',
    traits: ['执拗', '赤诚', '有大智慧'],
  },
  {
    id: 'NPC_RAIN_PRIEST',
    name: '老马',
    title: '城郊村落·求雨祭师',
    gender: 'male',
    role: 'priest',
    realm: 'Mortal',
    homeLocationId: 'LOC_VILLAGE',
    biography: '跳三天大神的雨只下自家田里的祭师，被骂了半辈子，却从没让村民饿过肚子。',
    traits: ['圆滑', '务实', '心善'],
  },
  {
    id: 'NPC_TAOIST_ROOSTER',
    name: '玄真子',
    title: '山间草庐·独居老道',
    gender: 'male',
    role: 'taoist',
    realm: 'CoreFormation',
    homeLocationId: 'LOC_MOUNTAIN_COTTAGE',
    biography: '养了只会打鸣报时还会记账的灵鸡的独居老道。炼丹误了时辰靠鸡啄醒，欠酒钱靠鸡叼账本追着还。',
    traits: ['豁达', '懒散', '道行深不可测'],
  },
  {
    id: 'NPC_BEAST_RAVEN',
    name: '鸦九',
    title: '城中·传话乌鸦',
    gender: 'unknown',
    role: 'spirit_beast',
    realm: 'QiRefinement',
    homeLocationId: 'LOC_CITY',
    biography: '通人性的传话乌鸦，替人传话送信收费一根肉干。不喂它，它就站在你肩上用嘴敲你脑门。',
    traits: ['机灵', '记仇', '贪吃'],
  },
  {
    id: 'NPC_BEAST_CARP',
    name: '金鲤',
    title: '城隍庙荷花池·锦鲤',
    gender: 'unknown',
    role: 'spirit_beast',
    realm: 'QiRefinement',
    homeLocationId: 'LOC_TEMPLE_POND',
    biography: '会吐泡泡拼字的金色锦鲤，拼出过"快跑"二字，把守庙的老庙祝吓得辞了职。',
    traits: ['灵性', '有预兆', '嘴碎'],
  },

  // ==================== 青云宗·宗门人物 ====================
  {
    id: 'NPC_SECT_MASTER',
    name: '云沧澜',
    title: '青云宗·掌门',
    gender: 'male',
    role: 'sect_master',
    realm: 'NascentSoul',
    homeLocationId: 'LOC_QAINGZHU_SECT',
    biography: '每年开春亲手种一株桃树、从不让旁人插手的掌门。满山一百零三棵桃树，是他早逝道侣生前最爱做的事。',
    traits: ['威严', '深情', '藏锋'],
  },
  {
    id: 'NPC_ELDER_OLD',
    name: '孟三桥',
    title: '青云宗·三长老',
    gender: 'male',
    role: 'elder',
    realm: 'NascentSoul',
    homeLocationId: 'LOC_QAINGZHU_SECT',
    biography: '德高望重的三长老。有人压着嗓子说他百年前是魔道"血手人屠"的亲传弟子，后来金盆洗手——听的人将信将疑。',
    traits: ['宽厚', '有过去', '滴水不漏'],
  },
  {
    id: 'NPC_DISCIPLE_SECRET',
    name: '顾长歌',
    title: '青云宗·亲传弟子',
    gender: 'male',
    role: 'disciple',
    realm: 'Foundation',
    homeLocationId: 'LOC_QAINGZHU_SECT',
    biography: '掌门最器重的亲传弟子，却是当年被掌门亲手平灭的某一门的遗孤。他早已知道，只是从不提起。',
    traits: ['温润', '背负', '聪慧'],
  },
  {
    id: 'NPC_SWORD_SERVANT',
    name: '清尘',
    title: '青云宗·剑侍',
    gender: 'male',
    role: 'sword_servant',
    realm: 'CoreFormation',
    homeLocationId: 'LOC_QAINGZHU_SECT',
    biography: '形影不离的两位剑侍中活下来的那位。师兄早在百年前战死，他每天还是对着空气说"师兄，今日的风不错"。',
    traits: ['孤寂', '忠诚', '剑心通明'],
  },
  {
    id: 'NPC_BEAST_CAT',
    name: '大橘',
    title: '青云宗山门·肥猫',
    gender: 'unknown',
    role: 'spirit_beast',
    realm: 'QiRefinement',
    homeLocationId: 'LOC_QAINGZHU_SECT',
    biography: '见谁都爱搭不理、偏对扫地哑巴小童亲热的山门肥猫。有人开玩笑说它是长老转世，当晚就被它糊了一身泥。',
    traits: ['傲娇', '记仇', '黏特定的人'],
  },

  // ==================== 野外·妖兽与凶徒 ====================
  {
    id: 'NPC_BEAST_WOLF',
    name: '苍岭狼王',
    title: '苍岭·狼王',
    gender: 'unknown',
    role: 'spirit_beast',
    realm: 'Foundation',
    homeLocationId: 'LOC_CANGLING',
    biography: '通体银灰、体型堪比小山的狼王，刀枪不入，唯独怕火。月圆之夜最是凶戾，苍岭猎户闻之色变。',
    traits: ['凶戾', '护领地', '畏火'],
  },
  {
    id: 'NPC_BEAST_SERPENT',
    name: '黑沼妖蟒',
    title: '黑沼·剧毒妖蟒',
    gender: 'unknown',
    role: 'spirit_beast',
    realm: 'Foundation',
    homeLocationId: 'LOC_SWAMP',
    biography: '盘踞黑沼的剧毒妖蟒，每年春末蜕皮前后七日最是虚弱。毒涎落地生烟，护着一株腥臭的毒花。',
    traits: ['阴毒', '护宝', '有蜕皮弱点'],
  },
  {
    id: 'NPC_BEAST_FOX',
    name: '三尾白狐',
    title: '幽林·三尾白狐',
    gender: 'unknown',
    role: 'spirit_beast',
    realm: 'QiRefinement',
    homeLocationId: 'LOC_FOREST',
    biography: '会说人话的三尾妖狐，能指路能骗人。上月把个采药人指进深渊，自己却在崖边笑得人毛骨悚然。',
    traits: ['狡黠', '爱骗人', '亦正亦邪'],
  },
  {
    id: 'NPC_BANDIT_LEADER',
    name: '黑牙',
    title: '十里坡·匪首',
    gender: 'male',
    role: 'bandit',
    realm: 'Foundation',
    homeLocationId: 'LOC_SHILI_SLOPE',
    biography: '十里坡劫道匪首，专盯落单行人。手下七八条汉子，见宗门腰牌便退避三分，欺软怕硬。',
    traits: ['凶悍', '欺软怕硬', '地头蛇'],
  },
  {
    id: 'NPC_BEAST_DRAGON',
    name: '铁背苍龙',
    title: '苍岭深潭·铁背苍龙',
    gender: 'unknown',
    role: 'spirit_beast',
    realm: 'NascentSoul',
    homeLocationId: 'LOC_CANGLING',
    biography: '盘踞苍岭深潭的铁背苍龙，鳞甲如铁，气息如渊。传说潭底沉着远古龙珠，它不过是龙珠气机养出的小兽。',
    traits: ['沉睡', '领地极强', '接近即死'],
  },
];

// ---- 查询函数 ----

/** 按 id 获取 NPC */
export function getNpcById(id: string): Npc | undefined {
  return NPC_REGISTRY.find(n => n.id === id);
}

/** 按身份获取 NPC 池 */
export function getNpcsByRole(role: NpcRole): Npc[] {
  return NPC_REGISTRY.filter(n => n.role === role);
}

/** 按常驻地点获取 NPC 池 */
export function getNpcsByLocation(locationId: string): Npc[] {
  return NPC_REGISTRY.filter(n => n.homeLocationId === locationId);
}
