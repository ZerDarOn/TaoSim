// ============================================================
// 任务 5：童年成长事件链（诞生模式专用）
// 15 个事件：覆盖 6-18 岁，按家世（orphan / small-clan / ancient-clan）
// 提供叙事变体，体现"锦衣玉食"与"白手起家"的成长差异
// ============================================================

import type { AttributeKey } from '@taosim/contracts';

// 童年事件允许的属性键（Character 六大基础属性的子集）
type ChildhoodAttributeKey = Exclude<
  AttributeKey,
  'attack' | 'defense' | 'critRate' | 'spiritEnergyMax' | 'poisonResist' | 'lifespanBonus'
>;

export interface ChildhoodEvent {
  age: number;                    // 触发年龄（0-18）
  title: string;
  description: string;            // 叙事文本
  effects?: {
    attribute?: Partial<Record<ChildhoodAttributeKey, number>>;
    spiritStones?: number;
    items?: { itemId: string; count: number }[];
  };
  // 按家世区分的变体（不同家世有不同经历）
  variants?: {
    orphan?: { title: string; description: string };
    'small-clan'?: { title: string; description: string };
    'ancient-clan'?: { title: string; description: string };
  };
}

export const CHILDHOOD_EVENTS: ChildhoodEvent[] = [
  // ==================== 6 岁：开蒙测灵根 ====================
  {
    age: 6,
    title: '开蒙测灵根',
    description:
      '六岁生辰这天，一位路过的老修士为你们这批孩童开蒙测灵根。他以灵力探查你周身经脉，眉头微动，若有所思。这或许是决定你一生走向的一天。',
    effects: { attribute: { comprehension: 1 } },
    variants: {
      orphan: {
        title: '破庙开蒙',
        description:
          '你在破庙里被路过的老修士遇上。他看了你半晌，掐指一算："这孩子竟有灵根，是个可造之材。"你第一次知道，自己不是没人要的野孩子。',
      },
      'small-clan': {
        title: '祠堂测灵',
        description:
          '小家族的祠堂里挤满了人，族老们屏息凝神看着测灵盘。当灵光亮起时，他们松了口气——族里终于又出了一个有灵根的孩子。',
      },
      'ancient-clan': {
        title: '香火开蒙',
        description:
          '古老的祠堂中香火缭绕，三长老亲自为你开蒙。测灵盘亮起璀璨灵光，长老抚须颔首："此子灵根不凡，当以玉液栽培。"',
      },
    },
  },

  // ==================== 7-10 岁：幼年修炼/启蒙 ×4 ====================
  {
    age: 7,
    title: '第一次引气入体',
    description:
      '长辈教你最基础的吐纳之法。你盘膝打坐，第一次感受到天地间游走的灵气，如调皮的小鱼，在你的经脉外游弋，就是抓不住。',
    effects: { attribute: { physique: 1, comprehension: 1 } },
    variants: {
      orphan: {
        title: '油灯下的口诀',
        description:
          '老修士留下三页泛黄的吐纳口诀便云游去了。你对着口诀反复揣摩，在茅屋的油灯下熬了一个又一个夜晚，终于在一个清晨感受到一缕灵气入体，激动得眼眶发红。',
      },
      'small-clan': {
        title: '七夜引气',
        description:
          '族老亲自为你讲解口诀，你似懂非懂，却凭着过人的悟性，在第七天夜里成功引来第一缕灵气，让满屋长辈惊讶不已。',
      },
      'ancient-clan': {
        title: '玉髓洗脉',
        description:
          '家族以玉髓灵泉为你洗炼经脉，又有名师一对一指导。你在充足的资源下，第一次引气便引动周遭灵气漩涡，惊动了闭关的老祖。',
      },
    },
  },
  {
    age: 8,
    title: '读书明理',
    description:
      '你被送进私塾读书认字。先生教的都是些经史子集，枯燥得很，你却隐隐觉得，那些字里行间，藏着天地运行的道理。',
    effects: { attribute: { comprehension: 1 } },
    variants: {
      orphan: {
        title: '窗外旁听',
        description:
          '你没有钱上私塾，便蹲在窗外偷听。先生发现后没有赶你，反而默许你旁听，偶尔还点拨两句。你感恩在心，学得格外用心。',
      },
      'small-clan': {
        title: '族学受教',
        description:
          '族学里同窗多是族中孩童，你因灵根不错，被先生格外关照，多学了不少旁人学不到的东西。',
      },
      'ancient-clan': {
        title: '万卷藏书',
        description:
          '家族请来的先生是位退隐的读书人，家中藏书万卷。你除了课业，还能翻阅家族珍藏的典籍，眼界远胜同龄人。',
      },
    },
  },
  {
    age: 9,
    title: '山中奇遇',
    description:
      '你在后山玩耍时，发现一只受伤的小鹿卧在溪边，腿上扎着一根断箭。小鹿眼中满是惊恐与祈求，看到你时，竟微微低下了头。',
    effects: { attribute: { perception: 1, charm: 1 } },
    variants: {
      orphan: {
        title: '三夜守鹿',
        description:
          '你采来草药为小鹿包扎，又守了它三天三夜。小鹿伤愈离去时，回头看了你很久——仿佛记住了你的模样。那夜，你梦见自己在山巅乘风御剑。',
      },
      'small-clan': {
        title: '护鹿遭殃',
        description:
          '你小心翼翼为小鹿拔箭敷药，却惊动了林中一头野猪。你护着小鹿逃回村中，被大人们好一顿责备，但你不后悔。',
      },
      'ancient-clan': {
        title: '灵鹿赠种',
        description:
          '你为灵鹿包扎后，它叼来一枚泛着微光的种子放在你手心。族老见了大惊——那是传说中的灵兽幼崽信物，你竟因善心得了天大的机缘。',
      },
    },
  },
  {
    age: 10,
    title: '游方道人点化',
    description:
      '一个破衣烂衫的老道人在村口摆摊算命，他一眼看到你，眼睛一亮："小娃娃，你命里有仙缘！老道送你一句话——仙路漫漫，初心莫忘。"',
    effects: { attribute: { luck: 1 } },
    variants: {
      orphan: {
        title: '半个馒头与三句口诀',
        description:
          '老道人分了你半个馒头，又教你几句粗浅口诀："往北走，七里外有个灵药谷，去那儿碰碰运气吧。"你牢牢记住，命运的齿轮自此转动。',
      },
      'small-clan': {
        title: '一语惊族老',
        description:
          '老道人看你有灵根，指着你对你爹说："此子非池中物，与其困在族中，不如送去山上的宗门试试。"你爹听了，沉默良久。',
      },
      'ancient-clan': {
        title: '气运如虹',
        description:
          '老道人隔着人群望你一眼，忽然抚掌大笑："好个气运如虹的孩子！"族老们面面相觑，只有你知道，那老道留下的三枚铜钱，至今还在你怀里发烫。',
      },
    },
  },

  // ==================== 11-14 岁：少年历练/初入宗门 ×5 ====================
  {
    age: 11,
    title: '宗门收徒大典',
    description:
      '三年一度的宗门招收弟子大会在邻近的仙城召开。族中长辈带你前往，人山人海的测灵台前，轮到你时，周围忽然安静下来。',
    effects: { attribute: { comprehension: 1 } },
    variants: {
      orphan: {
        title: '寒门闯关',
        description:
          '你凭着在老道那儿学来的三脚猫功夫，混在散修孩子堆里参加了测试。测灵台亮起的瞬间，你看见台下那些仙长们纷纷看向你，眼神又惊又喜。',
      },
      'small-clan': {
        title: '族中骄傲',
        description:
          '你所在的家族在测试中无人被选中，唯独你，灵根品质让台上长老破例多问了两句。族人们激动得热泪盈眶。',
      },
      'ancient-clan': {
        title: '三家争聘',
        description:
          '家族早已与几大宗门互通款曲，测试不过是走个过场。三家门派的执事争相开出条件，你第一次意识到"出身"二字的分量。',
      },
    },
  },
  {
    age: 12,
    title: '拜入宗门',
    description:
      '经过重重考验，你正式拜入仙门。青石台阶直通云海，山门巍峨，灵气扑面。同门师兄师姐们好奇地打量着你这个新入门的师弟。',
    effects: { attribute: { charm: 1 } },
    variants: {
      orphan: {
        title: '青竹门记名弟子',
        description:
          '你拜入的是小门派"青竹门"，没有华丽的殿宇，却有温暖的人情。掌门收你为记名弟子，师父待你如子。你暗下决心，要出人头地。',
      },
      'small-clan': {
        title: '内门新袍',
        description:
          '你拜入中等宗门，凭测灵根时的表现分到了内门。一袭崭新的道袍穿在身上，你摸了摸腰间家族缝的平安符，心中百感交集。',
      },
      'ancient-clan': {
        title: '太虚宗入峰',
        description:
          '你拜入的是顶尖大宗"太虚宗"，入门的灵峰早有专人打点。长老亲自为你安排居所，一应修炼资源应有尽有。',
      },
    },
  },
  {
    age: 13,
    title: '初次下山历练',
    description:
      '师门派你下山采买药材，这是你入门以来第一次独自离开山门。山下的城镇热闹非凡，却也暗流涌动，你第一次见识到修仙界的险恶。',
    effects: { attribute: { agility: 1 } },
    variants: {
      orphan: {
        title: '坊市跑腿',
        description:
          '你身无分文，只能靠帮人跑腿赚些灵石。你机灵又肯吃苦，竟在坊市里混出了个"小滑头"的名号，也攒下了第一笔家底。',
      },
      'small-clan': {
        title: '精打细算',
        description:
          '族中给了你一笔盘缠，叮嘱你省着花。你精打细算，顺利买齐药材，还顺路替村里捎回了几封家书。',
      },
      'ancient-clan': {
        title: '飞舟随行',
        description:
          '家族为你备好了飞舟与随行仆从，一路护送周到。你虽有些哭笑不得，却也暗叹——难怪人说背靠大树好乘凉。',
      },
    },
  },
  {
    age: 14,
    title: '同门比试',
    description:
      '宗门例行考核，你在演武场上与一位同门师兄比试。对方修为比你高一个小境界，却在你凌厉的攻势下险些落败。散场后，他笑着拍你的肩膀："有意思，改日再切磋！"',
    effects: { attribute: { physique: 1 } },
    variants: {
      orphan: {
        title: '后山之约',
        description:
          '你与一位同样出身寒微的师姐相识，两人同病相怜，常在后山相互切磋印证。她教你剑法，你帮她跑腿，日子虽苦，却有了并肩的人。',
      },
      'small-clan': {
        title: '一战成名',
        description:
          '同门中有人轻视你的出身，你以一场比试的胜利堵住了所有闲言碎语。从此，再无人敢小瞧你。',
      },
      'ancient-clan': {
        title: '世家同修',
        description:
          '你与几位世家子弟同修，他们各有所长，你也不遑多让。一场比试下来，你们惺惺相惜，结为同门挚友。',
      },
    },
  },
  {
    age: 14,
    title: '藏书阁悟道',
    description:
      '你在宗门藏书阁翻阅古籍，无意间翻到一页残破的心法注释，字迹潦草却直指大道本源。你对着那行字静坐了整整一下午。',
    effects: { attribute: { comprehension: 1, perception: 1 } },
  },

  // ==================== 15-17 岁：青春期/结缘/矛盾 ×4 ====================
  {
    age: 15,
    title: '情窦初开',
    description:
      '宗门大比后的庆功宴上，你与一位同门少年四目相对，忽然心头小鹿乱撞。修仙之人讲究清心寡欲，可那一刻，你分明听见了自己心跳的声音。',
    effects: { attribute: { charm: 1 } },
    variants: {
      orphan: {
        title: '默默守望',
        description:
          '对方是宗门内门的首席弟子，众星捧月。你自惭形秽，只敢远远看着，把那份悸动深深埋进心底，化作修炼的动力。',
      },
      'small-clan': {
        title: '峰顶之约',
        description:
          '你们从相识到相知，常相约在峰顶看日出。他/她说等你突破筑基，便向师门请求结为道侣。那一年，风都是甜的。',
      },
      'ancient-clan': {
        title: '身不由己',
        description:
          '家族早已为你定下联姻之事。你站在长街尽头，看着那位心仪的同门少年，第一次懂得了什么叫身不由己。',
      },
    },
  },
  {
    age: 16,
    title: '宗门矛盾',
    description:
      '宗门内两派长老因资源分配起了争执，火气蔓延到弟子之间。你因立场问题被卷入纷争，同门之间出现了隔阂。',
    effects: { attribute: { perception: 1 } },
    variants: {
      orphan: {
        title: '暗流中的沉默',
        description:
          '你出身寒微，在两派之间如浮萍无依。你选择了沉默与隐忍，却也因此看清了宗门中的暗流涌动，学会了察言观色。',
      },
      'small-clan': {
        title: '仗义执言',
        description:
          '你仗义执言，为受委屈的师弟出头，得罪了某位长老的弟子。从此你在宗门的日子多了些暗箭，却也赢得了更多人的敬重。',
      },
      'ancient-clan': {
        title: '审时度势',
        description:
          '家族在宗门中有话语权，你的立场牵动着背后势力的平衡。你被长辈耳提面命，学会了审时度势、以退为进。',
      },
    },
  },
  {
    age: 16,
    title: '秘境初试锋芒',
    description:
      '宗门开放一处小秘境供弟子历练，你在秘境中独行，遭遇了一头二阶妖兽的伏击。生死之间，你爆发出远超平日的战力。',
    effects: { attribute: { physique: 1, agility: 1 } },
  },
  {
    age: 17,
    title: '心魔初现',
    description:
      '连日闭关冲击瓶颈，你急于求成，险些走火入魔。满头冷汗中惊醒，你忽然明白——修行路上，最难的从来不是天赋，而是守住本心。',
    effects: { attribute: { comprehension: 2 } },
  },

  // ==================== 18 岁：成人礼/正式踏入修仙界 ====================
  {
    age: 18,
    title: '成人礼',
    description:
      '十八岁成人礼，师门为你行及冠之礼，正式承认你为一名可以独立行走修仙界的修士。回首十八年，从懵懂孩童到如今的你，仙界的大门，终于向你正式敞开。',
    effects: { attribute: { luck: 1 }, spiritStones: 100 },
    variants: {
      orphan: {
        title: '一剑破命',
        description:
          '你站在山门外，身后是十几年的风霜。你摸出那三页发黄的口诀，郑重收好——从今天起，你不再是无依无靠的孤儿，而是要凭自己的剑，闯出一条路的修士。',
      },
      'small-clan': {
        title: '族宴加冠',
        description:
          '族中为你大办成人宴，族长亲自为你披上崭新的道袍。你望着满堂族人期待的目光，郑重叩首——这条路，你会走到底。',
      },
      'ancient-clan': {
        title: '祖像立誓',
        description:
          '家族为你举行隆重的成人仪典，历代先祖的画像前，你立下道誓。家族给予你的资源与期待，在此刻化作沉甸甸的责任。',
      },
    },
  },
];
