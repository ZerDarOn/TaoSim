// ============================================================
// 任务 4：NPC 性格与对话模板
// 10 种性格 × 7 个场合 = 70 条对话
// 注：本数据文件的接口为自包含定义，无对应 @taosim/contracts 类型
// ============================================================

// NPC 性格类型
export interface NpcPersonality {
  id: string;                    // 如 'PERSONALITY_GENEROUS'
  name: string;                  // 如 '慷慨豪爽'
  description: string;           // 一句话描述
  // 该性格对互动的修正
  interactionModifiers: {
    discussExpBonus: number;         // 论道额外修为倍率，如 0.2 = +20%
    tradeDiscount: number;           // 交易折扣，如 -0.1 = 打九折
    favorabilityGainBonus: number;   // 好感度增长倍率，如 1.5
    initialFavorability: number;     // 初始好感度偏移，如 +10
  };
  // 该性格触发的事件 id 列表（关联 adventure-events.ts）
  relatedEventIds?: string[];
}

// 对话模板（NPC 首次相遇时的台词）
export interface NpcDialogue {
  personalityId: string;         // 关联的性格 id
  occasion: 'first_meet' | 'discuss' | 'duel_start' | 'duel_win' | 'duel_lose' | 'trade_start' | 'gift';
  text: string;                  // 对话内容
}

export const NPC_PERSONALITIES: NpcPersonality[] = [
  {
    id: 'PERSONALITY_GENEROUS',
    name: '慷慨豪爽',
    description: '视灵石如粪土，最喜结交朋友，出手大方，生平最恨虚伪之人。',
    interactionModifiers: {
      discussExpBonus: 0.3,
      tradeDiscount: -0.1,
      favorabilityGainBonus: 1.5,
      initialFavorability: 10,
    },
    relatedEventIds: ['EVT_SOC_POOR_MORTAL', 'EVT_SOC_WANDERING_TAOIST'],
  },
  {
    id: 'PERSONALITY_CUNNING',
    name: '阴险狡诈',
    description: '笑里藏刀，面上客气，心里却盘算着如何算计于人，睚眦必报。',
    interactionModifiers: {
      discussExpBonus: 0.1,
      tradeDiscount: 0.1,
      favorabilityGainBonus: 0.8,
      initialFavorability: -10,
    },
    relatedEventIds: ['EVT_COMBAT_EVIL_CULTIVATOR', 'EVT_MIS_AMBUSH'],
  },
  {
    id: 'PERSONALITY_ARROGANT',
    name: '高傲冷峻',
    description: '自视甚高，目中无人，只认可实力与家世，对弱者不屑一顾。',
    interactionModifiers: {
      discussExpBonus: 0.2,
      tradeDiscount: 0.05,
      favorabilityGainBonus: 0.6,
      initialFavorability: -15,
    },
    relatedEventIds: ['EVT_SOC_RIVAL_PROVOKE', 'EVT_CULT_ELDER_GUIDANCE'],
  },
  {
    id: 'PERSONALITY_GENTLE',
    name: '温和宽厚',
    description: '待人如春风化雨，与人为善，从不与人结怨，极好相处。',
    interactionModifiers: {
      discussExpBonus: 0.2,
      tradeDiscount: -0.05,
      favorabilityGainBonus: 1.2,
      initialFavorability: 10,
    },
    relatedEventIds: ['EVT_CULT_ELDER_GUIDANCE', 'EVT_SOC_ROAD_JUSTICE'],
  },
  {
    id: 'PERSONALITY_ERRATIC',
    name: '疯癫无常',
    description: '行事颠三倒四，言语疯疯癫癫，看似糊涂，实则偶有大智。',
    interactionModifiers: {
      discussExpBonus: 0.4,
      tradeDiscount: 0.15,
      favorabilityGainBonus: 0.5,
      initialFavorability: 0,
    },
    relatedEventIds: ['EVT_SOC_WANDERING_TAOIST', 'EVT_EXP_ILLUSION_ARRAY'],
  },
  {
    id: 'PERSONALITY_COLD',
    name: '冷漠疏离',
    description: '寡言少语，不喜与人来往，修行为上，其余皆为身外事。',
    interactionModifiers: {
      discussExpBonus: 0.15,
      tradeDiscount: 0.05,
      favorabilityGainBonus: 0.7,
      initialFavorability: -5,
    },
    relatedEventIds: ['EVT_MIS_DEBT', 'EVT_SOC_TEA_HOUSE'],
  },
  {
    id: 'PERSONALITY_HOT_BLOODED',
    name: '热血豪迈',
    description: '重情重义，快意恩仇，路见不平必拔刀相助，认定你是朋友便掏心掏肺。',
    interactionModifiers: {
      discussExpBonus: 0.25,
      tradeDiscount: -0.1,
      favorabilityGainBonus: 1.3,
      initialFavorability: 10,
    },
    relatedEventIds: ['EVT_COMBAT_ESCORT', 'EVT_SOC_ROAD_JUSTICE'],
  },
  {
    id: 'PERSONALITY_SLY',
    name: '奸猾世故',
    description: '八面玲珑，见人说人话，见鬼说鬼话，最善于在利益之间权衡周旋。',
    interactionModifiers: {
      discussExpBonus: 0.15,
      tradeDiscount: 0.1,
      favorabilityGainBonus: 0.9,
      initialFavorability: -5,
    },
    relatedEventIds: ['EVT_SOC_MARKET_OLD_MAN', 'EVT_MIS_DEBT'],
  },
  {
    id: 'PERSONALITY_RIGHTEOUS',
    name: '正直刚烈',
    description: '一身正气，认准的道理九头牛拉不回，宁折不弯，最恨宵小行径。',
    interactionModifiers: {
      discussExpBonus: 0.2,
      tradeDiscount: -0.05,
      favorabilityGainBonus: 1.0,
      initialFavorability: 5,
    },
    relatedEventIds: ['EVT_SOC_ROAD_JUSTICE', 'EVT_SOC_SECT_CONFLICT'],
  },
  {
    id: 'PERSONALITY_RECLUSIVE',
    name: '孤僻寡言',
    description: '独来独往，惜字如金，看似不通人情，实则恩怨分明、记性极好。',
    interactionModifiers: {
      discussExpBonus: 0.3,
      tradeDiscount: 0.1,
      favorabilityGainBonus: 0.6,
      initialFavorability: -10,
    },
    relatedEventIds: ['EVT_EXP_ANCIENT_CAVE', 'EVT_CULT_RIVER_DAO'],
  },
  {
    id: 'PERSONALITY_JEALOUS',
    name: '嫉贤妒能',
    description: '见不得旁人比自己强，天资卓绝者尤受其妒，暗地里使绊子、传闲话。',
    interactionModifiers: {
      discussExpBonus: 0.1,
      tradeDiscount: 0.05,
      favorabilityGainBonus: 0.5,
      initialFavorability: -10,
    },
    relatedEventIds: ['EVT_SOC_RIVAL_PROVOKE', 'EVT_COMBAT_EVIL_CULTIVATOR'],
  },
];

export const NPC_DIALOGUES: NpcDialogue[] = [
  // ---------- 慷慨豪爽 ----------
  { personalityId: 'PERSONALITY_GENEROUS', occasion: 'first_meet', text: '道友面生得很，相逢即是有缘，这壶灵茶请你喝！' },
  { personalityId: 'PERSONALITY_GENEROUS', occasion: 'discuss', text: '论道讲究一个痛快！来，坐我身边，咱们把酒论道，畅谈三天三夜！' },
  { personalityId: 'PERSONALITY_GENEROUS', occasion: 'duel_start', text: '既然要打，那就打个尽兴！不过咱们先说好，点到为止，别伤了和气！' },
  { personalityId: 'PERSONALITY_GENEROUS', occasion: 'duel_win', text: '承让承让！哈哈，你修为不俗，改日再战，我请你喝酒！' },
  { personalityId: 'PERSONALITY_GENEROUS', occasion: 'duel_lose', text: '输得好！这一战酣畅淋漓，老夫输得心服口服！来，这块灵石拿去补补身子！' },
  { personalityId: 'PERSONALITY_GENEROUS', occasion: 'trade_start', text: '瞧上什么尽管开口！你我投缘，价钱好商量，权当交个朋友！' },
  { personalityId: 'PERSONALITY_GENEROUS', occasion: 'gift', text: '区区薄礼，何足挂齿！你我意气相投，这点东西算得了什么！' },

  // ---------- 阴险狡诈 ----------
  { personalityId: 'PERSONALITY_CUNNING', occasion: 'first_meet', text: '呵呵，道友远道而来，在下久仰大名。这杯茶，不成敬意，还望道友赏脸。' },
  { personalityId: 'PERSONALITY_CUNNING', occasion: 'discuss', text: '道友高见，在下受益匪浅。只是……我观道友眉宇间似有晦气，不如让在下为你分说一二？' },
  { personalityId: 'PERSONALITY_CUNNING', occasion: 'duel_start', text: '道友执意相斗？也好……只是刀剑无眼，若是不慎伤了道友，还望莫要见怪。' },
  { personalityId: 'PERSONALITY_CUNNING', occasion: 'duel_win', text: '承让了。道友初来乍到，不懂规矩，本座便替你教教你，日后也好少吃些亏。' },
  { personalityId: 'PERSONALITY_CUNNING', occasion: 'duel_lose', text: '哼……今日之辱，本座记下了。你且等着，山水有相逢！' },
  { personalityId: 'PERSONALITY_CUNNING', occasion: 'trade_start', text: '我这儿的货，可都是千挑万选的好东西。价钱嘛……自然要配得上它的身价。' },
  { personalityId: 'PERSONALITY_CUNNING', occasion: 'gift', text: '这点心意，道友收下便是。滴水之恩，日后自当涌泉相报……呵呵。' },

  // ---------- 高傲冷峻 ----------
  { personalityId: 'PERSONALITY_ARROGANT', occasion: 'first_meet', text: '哼，面生得很。本座见过的人太多，记不得你这种无名小辈。' },
  { personalityId: 'PERSONALITY_ARROGANT', occasion: 'discuss', text: '就凭你这点见识，也配与本座谈道？也罢，权当施舍，你且听着。' },
  { personalityId: 'PERSONALITY_ARROGANT', occasion: 'duel_start', text: '蚍蜉撼树，不自量力。你出招吧，本座让你三招。' },
  { personalityId: 'PERSONALITY_ARROGANT', occasion: 'duel_win', text: '不堪一击。就这点本事，还是回去多修炼几年再来吧。' },
  { personalityId: 'PERSONALITY_ARROGANT', occasion: 'duel_lose', text: '……倒有几分本事。不过，也仅此而已。本座记住你了。' },
  { personalityId: 'PERSONALITY_ARROGANT', occasion: 'trade_start', text: '看上什么直说。本座不缺灵石，只是懒得与你斤斤计较。' },
  { personalityId: 'PERSONALITY_ARROGANT', occasion: 'gift', text: '倒是个懂礼数的。既如此，这份薄礼便赏你了。' },

  // ---------- 温和宽厚 ----------
  { personalityId: 'PERSONALITY_GENTLE', occasion: 'first_meet', text: '道友有礼了。相见是缘，若是不嫌弃，可愿与贫道共饮一盏清茶？' },
  { personalityId: 'PERSONALITY_GENTLE', occasion: 'discuss', text: '修行之道，各有所悟。道友不妨说来听听，你我相互印证，岂不快哉？' },
  { personalityId: 'PERSONALITY_GENTLE', occasion: 'duel_start', text: '切磋可以，点到即止。切记勿伤和气，胜负本无定数。' },
  { personalityId: 'PERSONALITY_GENTLE', occasion: 'duel_win', text: '道友承让了。修行之路漫漫，一时的胜负算不得什么。' },
  { personalityId: 'PERSONALITY_GENTLE', occasion: 'duel_lose', text: '道友修为精深，贫道输得心服口服。这枚丹药，权当贫道一番心意。' },
  { personalityId: 'PERSONALITY_GENTLE', occasion: 'trade_start', text: '道友看看需要什么。价钱好说，与人方便，与己方便。' },
  { personalityId: 'PERSONALITY_GENTLE', occasion: 'gift', text: '道友有心了。只是修行之人，身外之物看淡些也好，这份心意贫道收下了。' },

  // ---------- 疯癫无常 ----------
  { personalityId: 'PERSONALITY_ERRATIC', occasion: 'first_meet', text: '嘿嘿嘿……哈哈哈！道友，你身上有光！有大光！算命的说我今日有缘，果然应了！' },
  { personalityId: 'PERSONALITY_ERRATIC', occasion: 'discuss', text: '天机！天机啊！昨夜我梦见一条鲤鱼跳了龙门，你说这是不是天机？嗯？是不是？' },
  { personalityId: 'PERSONALITY_ERRATIC', occasion: 'duel_start', text: '打架？好啊好啊！我最喜欢打架了！你打我一拳，我打你一拳，公平！' },
  { personalityId: 'PERSONALITY_ERRATIC', occasion: 'duel_win', text: '赢了赢了！今日高兴！赏你一颗糖豆！吃了能长生不老——反正我是这么听说的！' },
  { personalityId: 'PERSONALITY_ERRATIC', occasion: 'duel_lose', text: '输了输了……呜……我输了一颗糖豆……你赔我！你赔我！' },
  { personalityId: 'PERSONALITY_ERRATIC', occasion: 'trade_start', text: '买卖？可以可以！你看这个破碗，其实是个宝贝！不买？不买是你不识货！' },
  { personalityId: 'PERSONALITY_ERRATIC', occasion: 'gift', text: '送我的？嘻嘻，那我就不客气了！礼尚往来，这个石头送给你——别问，问就是天机！' },

  // ---------- 冷漠疏离 ----------
  { personalityId: 'PERSONALITY_COLD', occasion: 'first_meet', text: '……何事？无事速走。' },
  { personalityId: 'PERSONALITY_COLD', occasion: 'discuss', text: '道在心中，不在口舌。你若能悟，自会明白；悟不了，说也无用。' },
  { personalityId: 'PERSONALITY_COLD', occasion: 'duel_start', text: '……啰嗦。要打便打。' },
  { personalityId: 'PERSONALITY_COLD', occasion: 'duel_win', text: '……不自量力。' },
  { personalityId: 'PERSONALITY_COLD', occasion: 'duel_lose', text: '……你赢了。走。' },
  { personalityId: 'PERSONALITY_COLD', occasion: 'trade_start', text: '要什么，说。快些，别耽误我清修。' },
  { personalityId: 'PERSONALITY_COLD', occasion: 'gift', text: '……不必。你若执意，放下便是。' },

  // ---------- 热血豪迈 ----------
  { personalityId: 'PERSONALITY_HOT_BLOODED', occasion: 'first_meet', text: '哈哈！在下姓雷名烈！最喜交朋友！道友这身气度，一看就是条汉子，交个朋友！' },
  { personalityId: 'PERSONALITY_HOT_BLOODED', occasion: 'discuss', text: '好！好！说得痛快！修行就该快意恩仇，哪有那么多弯弯绕绕！' },
  { personalityId: 'PERSONALITY_HOT_BLOODED', occasion: 'duel_start', text: '正合我意！今日不打个痛快，决不收手！接我一拳！' },
  { personalityId: 'PERSONALITY_HOT_BLOODED', occasion: 'duel_win', text: '好！打得痛快！你这个朋友我交定了，改日请你喝酒！' },
  { personalityId: 'PERSONALITY_HOT_BLOODED', occasion: 'duel_lose', text: '服了！输给你，我雷烈心服口服！你这朋友，我交定了！' },
  { personalityId: 'PERSONALITY_HOT_BLOODED', occasion: 'trade_start', text: '看中什么直说！我雷烈做生意，最重一个诚字，绝不少你一分！' },
  { personalityId: 'PERSONALITY_HOT_BLOODED', occasion: 'gift', text: '哈哈哈！好兄弟！这份情我记下了，日后你的事就是我的事！' },

  // ---------- 奸猾世故 ----------
  { personalityId: 'PERSONALITY_SLY', occasion: 'first_meet', text: '哟，这位道友气宇轩昂，一看便非池中之物。在下姓商，最会看人，咱们交个朋友？' },
  { personalityId: 'PERSONALITY_SLY', occasion: 'discuss', text: '道友有所不知，论道讲究的是个巧字。你听我慢慢道来，这里面可大有门道……' },
  { personalityId: 'PERSONALITY_SLY', occasion: 'duel_start', text: '道友这是要切磋？哎哟，我这老胳膊老腿的……不过道友盛情难却，那便点到为止吧。' },
  { personalityId: 'PERSONALITY_SLY', occasion: 'duel_win', text: '承让承让！其实吧，方才我是故意让你三分的，免得伤了和气，你说是不是这个理？' },
  { personalityId: 'PERSONALITY_SLY', occasion: 'duel_lose', text: '厉害厉害！道友果然深藏不露！这样，我这儿有份礼物，就当交个朋友，你看如何？' },
  { personalityId: 'PERSONALITY_SLY', occasion: 'trade_start', text: '道友眼光真毒，一眼就相中了我这儿的宝贝。价钱嘛——好商量，好商量，哈哈。' },
  { personalityId: 'PERSONALITY_SLY', occasion: 'gift', text: '哎呀，这怎么好意思！道友太客气了！日后但有差遣，只管开口，商某义不容辞！' },

  // ---------- 正直刚烈 ----------
  { personalityId: 'PERSONALITY_RIGHTEOUS', occasion: 'first_meet', text: '这位道友请了。在下姓刘，行事但求问心无愧。若道友有事相商，直言便是。' },
  { personalityId: 'PERSONALITY_RIGHTEOUS', occasion: 'discuss', text: '修行先修心。道友所言，在下不敢苟同——有些路，走得快，未必走得远。' },
  { personalityId: 'PERSONALITY_RIGHTEOUS', occasion: 'duel_start', text: '既然要战，便堂堂正正一战。不过丑话说在前头，胜败各凭本事，莫要使阴招。' },
  { personalityId: 'PERSONALITY_RIGHTEOUS', occasion: 'duel_win', text: '胜之不武，不足为道。道友不必介怀，日后多行正道，自有所成。' },
  { personalityId: 'PERSONALITY_RIGHTEOUS', occasion: 'duel_lose', text: '甘拜下风。道友一身正气，在下输得心服口服。' },
  { personalityId: 'PERSONALITY_RIGHTEOUS', occasion: 'trade_start', text: '公平买卖，童叟无欺。你出价，我看货，问心无愧即可。' },
  { personalityId: 'PERSONALITY_RIGHTEOUS', occasion: 'gift', text: '无功不受禄。道友若执意相赠，刘某记下这份情谊，日后必有所还。' },

  // ---------- 孤僻寡言 ----------
  { personalityId: 'PERSONALITY_RECLUSIVE', occasion: 'first_meet', text: '……嗯。' },
  { personalityId: 'PERSONALITY_RECLUSIVE', occasion: 'discuss', text: '……（沉默良久）你方才所说，有一句在理。……我记下了。' },
  { personalityId: 'PERSONALITY_RECLUSIVE', occasion: 'duel_start', text: '……好。（缓缓抽出兵刃）' },
  { personalityId: 'PERSONALITY_RECLUSIVE', occasion: 'duel_win', text: '……你输了。（收刀转身）' },
  { personalityId: 'PERSONALITY_RECLUSIVE', occasion: 'duel_lose', text: '……我输了。（微微颔首，转身欲走）' },
  { personalityId: 'PERSONALITY_RECLUSIVE', occasion: 'trade_start', text: '……这个，换那个。……要么？' },
  { personalityId: 'PERSONALITY_RECLUSIVE', occasion: 'gift', text: '……（接过，微微点头，转身离去，却记下了这份情）' },

  // ---------- 嫉贤妒能 ----------
  { personalityId: 'PERSONALITY_JEALOUS', occasion: 'first_meet', text: '（上下打量你一眼，皮笑肉不笑）哟，道友年纪轻轻便有此修为，真是……好福气。' },
  { personalityId: 'PERSONALITY_JEALOUS', occasion: 'discuss', text: '呵，不过是拾人牙慧罢了。贫道也曾见过比你悟性更高的，最后还不是……（冷笑不语）' },
  { personalityId: 'PERSONALITY_JEALOUS', occasion: 'duel_start', text: '既然道友执意要打，那便休怪贫道不客气了。免得你以为，天资高些就能目中无人！' },
  { personalityId: 'PERSONALITY_JEALOUS', occasion: 'duel_win', text: '哼，也不过如此。天资再好，终究不是自己的本事！' },
  { personalityId: 'PERSONALITY_JEALOUS', occasion: 'duel_lose', text: '……今日之耻，贫道记下了。他日风水轮流转，莫怪贫道不讲情面！' },
  { personalityId: 'PERSONALITY_JEALOUS', occasion: 'trade_start', text: '要买什么？价钱嘛……（瞥你一眼）好东西自然贵，你这样的天骄，想必不缺这点灵石吧？' },
  { personalityId: 'PERSONALITY_JEALOUS', occasion: 'gift', text: '哼，假惺惺地送什么礼。……既给了，贫道便收下，日后自有分晓。' },
];

/**
 * 按字符 id 哈希确定性挑选一个性格（djb2 变体，与旧 UI 侧逻辑一致）。
 * 用于 NPC 生成时分配 personalityId，保证同一 NPC id 恒定同性格。
 */
export function resolvePersonalityId(characterId: string): string {
  const pool = NPC_PERSONALITIES;
  if (pool.length === 0) return 'PERSONALITY_GENEROUS';
  let hash = 0;
  for (const ch of characterId) {
    hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  }
  const idx = Math.abs(hash) % pool.length;
  return pool[idx]!.id;
}
