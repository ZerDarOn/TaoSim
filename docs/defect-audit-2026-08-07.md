﻿﻿# TaoSim 缂洪櫡涓庡緟鍔炲璁★紙2026-08-07锛?
> 鐢ㄩ€旓細鍏ㄩ潰瀹¤璁板綍锛岄伩鍏嶉仐蹇樸€傛瘡涓潯鐩彲鍦ㄤ慨澶嶅悗鍕鹃€?`[x]`銆?> 瀹¤鏂瑰紡锛氫笁涓苟琛屽瓙浠ｇ悊娣卞害鎵弿 + 鍏抽敭缁撹浜哄伐鏍稿疄锛圕1/I1 宸蹭翰鑷鐮佺‘璁わ紱C2 娴忚鍣ㄥ疄娴嬪鐜帮級銆?> 鑼冨洿锛歱ackages/contracts銆乸ackages/engine銆乸ackages/persistence銆乤pps/taosim-ui 鍏ㄤ粨锛涘鐓?`docs/superpowers/specs/`銆乣docs/superpowers/plans/`銆乣docs/phase-11-gap-analysis.md`銆?
---

## 0. 鎬昏

| 绫诲埆 | 鏁伴噺 | 璇存槑 |
|---|---|---|
| 馃敶 Critical | 2 | C1 瀛樻。蹇呯劧澶辫触锛堟暟鎹涪澶憋級銆丆2 濂囬亣蹇呯劧宕╂簝 |
| 馃煚 Important | 5 | I1 澧冪晫闂ㄦ澶辨晥銆両2 浼犻€佺嚎涓嶆覆鏌撱€両3 realm 濂戠害杩濊銆両4 姝讳唬鐮併€両5 閿欒澶勭悊榛戞礊 |
| 馃煛 Minor | 6 | 瑙?搂3 |
| 鈿狅笍 typecheck 瀛橀噺閿欒 | 4 | 闃诲鐢熶骇鏋勫缓锛坴ue-tsc && vite build锛?|
| 鈿?瑙勬牸鏈疄鐜?| 9 椤?| 瑙?搂4 |
| 鎵撶（缂哄彛 | 7 椤?| 瑙?搂5 |
| 鏈彁浜ゆ敼鍔?| 1 椤?| 閫冭窇杞攣淇锛堝伐浣滃尯锛?|

娴嬭瘯鍩虹嚎锛歟ngine 237/237 閫氳繃锛沀I 50/50 閫氳繃銆傛祴璇曠洸鍖鸿 搂6銆?
---

## 1. 馃敶 Critical锛堟暟鎹涪澶?/ 蹇呯劧宕╂簝锛?
### C1. 瀛樻。蹇呯劧澶辫触锛歏ue 鍝嶅簲寮?Proxy 鐩村啓 IndexedDB 鈫?DataCloneError

- [x] **鐘舵€?*锛氬緟淇
- **浣嶇疆**锛?  - `apps/taosim-ui/src/stores/app.ts:66-90`锛坄saveGame` 鏋勯€?payload锛?  - `packages/persistence/src/indexeddb-adapter.ts:36`锛坄store.put(payload)`锛?  - `apps/taosim-ui/src/components/SaveLoadPanel.vue:23-27`锛堟棤 catch锛?  - `apps/taosim-ui/src/composables/useWorld.ts:99`锛堥搧浜鸿嚜鍔ㄥ瓨妗?`.catch(() => {})` 鍚為敊锛?- **鏍瑰洜**锛歚playerStore.character`锛坄ref<Character>` 娣卞搷搴斿紡 Proxy锛変笌 `mapStore.state`锛坄ref<PlayerMapState>` Proxy锛夊師鏍峰杩?`SavePayload`锛屾棤 `toRaw`/JSON 搴忓垪鍖栵紱IndexedDB structured clone 鏃犳硶鍏嬮殕 Proxy 鈫?鎶?`DataCloneError`銆?- **褰卞搷**锛氭墜鍔ㄥ瓨妗ｄ竴娆￠兘娌″啓杩涘簱锛堜笖鐣岄潰闆舵彁绀猴級锛涢搧浜烘ā寮忓埛鏂板嵆鍏ㄤ涪銆?- **淇寤鸿**锛歴ave 鍓嶅 `player`/`playerMapState` 鍋氭繁鎷疯礉锛坄JSON.parse(JSON.stringify(...))` 鎴?`toRaw` + `structuredClone`锛夛紱缁?SaveLoadPanel 琛?catch + 鎴愬姛/澶辫触鎻愮ず锛涢搧浜鸿嚜鍔ㄥ瓨妗ｅけ璐ョ粰鍑鸿鍛娿€?- **楠岃瘉鏂瑰紡**锛氭祻瑙堝櫒瀹為檯鐐逛竴娆″瓨妗ｏ紝妫€鏌?IndexedDB `taosim_saves` 鏄惁鏈夎褰曪紱鏀瑰悗搴旇兘瀛樺彇鍒犮€?
### C2. 濂囬亣銆屽睘鎬с€嶇粨鏋滃繀鐒跺穿婧冿細`attr.split is not a function`

- [x] **鐘舵€?*锛氬緟淇
- **浣嶇疆**锛?  - `apps/taosim-ui/src/game/panels/AdventureEventCard.vue:57-65`锛坄case 'attribute'`锛?  - 鏁版嵁婧?`packages/engine/src/data/adventure-events.ts`锛坄type:'attribute'` 鍏?71 澶勶紝value 鍏ㄤ负鏁板瓧锛?- **鏍瑰洜**锛氭暟鎹ā鍨嬫槸 `{ type:'attribute', attribute:'luck', value:1 }`锛屾秷璐圭鍗村 `outcome.value`锛堟暟瀛楋級璋?`attr.split(':')` 鈫?`1.split is not a function`銆?- **褰卞搷**锛氬懡涓€岃传鑻﹀嚒浜恒€嶇瓑 30+ 浜嬩欢鏃讹紝宸茬粨绠楀鍔辩敓鏁堛€佸悗缁粨鏋滃叏閮ㄤ涪澶憋紝鍗＄墖鍗婄粨绠楀崱姝伙紙娴忚鍣ㄥ疄娴嬪鐜帮級銆?- **淇寤鸿**锛歚case 'attribute'` 鏀硅 `outcome.attribute` + `outcome.value`锛涢『甯﹀鐞?`adventure-events.ts:1733` 鐨?`attribute:'attack'`锛堥潪 Character 灞炴€э紝浼氫涪锛夈€?- **楠岃瘉鏂瑰紡**锛氳ˉ寮曟搸 + 缁勪欢娴嬭瘯锛涙祻瑙堝櫒瑙﹀彂銆岃传鑻﹀嚒浜恒€嶈禒鑽€夐」銆?
---

## 2. 馃煚 Important锛堣涓洪敊璇?/ 鍔熻兘澶辨晥锛?
### I1. 澧冪晫闂ㄦ鍏ㄧ嚎澶辨晥锛坒ail-open锛?
- [x] **鐘舵€?*锛氬緟淇
- **浣嶇疆**锛?  - `packages/engine/src/overworld/travel-service.ts:78,97`
  - `packages/engine/src/overworld/venue-service.ts:54-56`
  - 姝ｇ‘鍙傜収锛歚packages/engine/src/content/adventure-engine.ts:13-20`
- **鏍瑰洜**锛歚player.realm.split('_')[0]` 寰楀埌 `'QiRefinement'` 绛夊墠缂€锛岃€?`REALM_ORDER`锛坄packages/contracts/src/multi-layer-map.ts:17`锛夌殑閿槸 `RealmType`锛坄LianQi/ZhuJi/...`锛夈€傛煡涓嶅埌 鈫?`undefined < X` 鎭?false 鈫?鏍￠獙姘歌繙鏀捐銆?- **褰卞搷**锛氫换浣曠帺瀹跺彲杩涢珮闃跺満鎵€銆佽法澶ч檰浼犻€侊紙鍙鐏电煶澶燂級锛沀I 鐨勩€屽鐣屼笉瓒炽€嶆彁绀烘案涓嶅嚭鐜般€?- **淇寤鸿**锛氬鐣屾瘮杈冩敼鐢?`parseRealm(player.realm).realmType` 鎴栧畬鏁?RealmFullPath 琛紙鐓ф妱 adventure-engine 姝ｇ‘鍐欐硶锛夛紝琛?`travel-service.test.ts` / `venue-service.test.ts`銆?
### I2. MapPanel 浼犻€佽繛绾挎案涓嶆覆鏌擄紙v-if/v-for 浣滅敤鍩熷啿绐侊級

- [x] **鐘舵€?*锛氬緟淇
- **浣嶇疆**锛歚apps/taosim-ui/src/game/panels/MapPanel.vue:499-500`锛堝悓鍏冪礌 v-if 浼樺厛绾ч珮浜?v-for锛宍connId` 涓?undefined锛夛紱Cosmos 灞傝繛绾?`:458-467` 鍚屾牱鐢婚敊锛堣繛鍚?绗竴涓潪鍚屾槦绯?锛夈€?- **褰卞搷**锛氬ぇ闄嗗眰浼犻€佽繛绾夸竴鏉￠兘涓嶇敾锛堝嵆 typecheck (500,42) 鐨勮繍琛屾椂瀹炰綋锛夛紱鏄熷浘杩炵嚎鍧愭爣閿欒銆佺嚎閲嶅彔銆?- **淇寤鸿**锛氭敼涓?computed 杩囨护鍑哄瓨鍦ㄧ殑杩炵嚎鍐?v-for锛汣osmos 杩炵嚎淇閰嶅閫昏緫銆?
### I3. NPC 澧冪晫瀛楃涓茶繚鍙?RealmFullPath 濂戠害

- [x] **鐘舵€?*锛氬緟淇
- **浣嶇疆**锛?  - `packages/engine/src/interaction/npc-generator.ts:42`锛坄` realm: `${realmTier}_${subLevel}` as any ``锛?  - 涓嬫父 `packages/engine/src/market/npc-trade-engine.ts:16,43`锛坄parseRealm(realm as any)`锛?  - `packages/contracts/src/character.ts:53`锛坄map[realmStr]!` 闈炵┖鏂█锛?- **鏍瑰洜**锛歚subLevel` 瀵瑰叏閮?tier 鍙?1..5锛岀敓鎴?`Foundation_4/5`銆乣GoldenCore_4/5` 绛夐潪娉?RealmFullPath锛沗as any` 鎺╃洊绫诲瀷璋庤█銆?- **褰卞搷**锛氬綋鍓嶅悇娑堣垂鏂规湁鍏滃簳涓嶅穿锛屼絾浠讳綍鎸?`Record<RealmFullPath, X>` 鏌ヨ〃鎴栧瓨璇绘。杈圭晫涓ユ牸鏍￠獙鍗冲嚭閿欙紱`map[realmStr]!` 瀵?`'Mortal'` 绛夎８鍚嶈繑鍥?`{realmType: undefined, subLevel: NaN}` 闈欓粯閿欒鍊笺€?- **淇寤鸿**锛歴ubLevel 鎸夊鐣屼笂闄愭敹鏁涳紙QiRefinement 1..9 / 鍏朵綑 1..3 / SoulFormation 1锛夛紝鍒?`as any`锛沗map[realmStr]!` 鏀逛负闃插尽寮忚繑鍥炪€?
### I4. 鎴樻枟澧為噺鎻愪氦锛坈ommitBattleDelta锛夋槸姝讳唬鐮?
- [ ] **鐘舵€?*锛氬緟淇锛堟垨鏄庣‘搴熷純锛?- **浣嶇疆**锛歚apps/taosim-ui/src/stores/player.ts:12-15,98-107`锛涚湡瀹炵粨绠楄矾寰?`apps/taosim-ui/src/game/BattleOverlay.vue:112`锛坄applyOutcome` 鐩存帴鏀?store锛?- **鏍瑰洜**锛歚commitBattleDelta`/`battleRevision` 鍏ㄥ簱鏃犺皟鐢ㄦ柟锛沚attle-system-v2 瑙勬牸鎵胯鐨勩€屾垬鏂楀閲忎簨鍔″寲鎻愪氦銆嶆湭鎺ョ嚎銆?- **褰卞搷**锛氭垬鏂楀啓鍥炴棤骞傜瓑淇濇姢锛堥噸澶嶇粨绠楀彲鑳藉彔鍔狅級锛沗player-battle-delta.test.ts` 娴嬬殑鏄案涓嶈繍琛岀殑鍑芥暟銆?- **淇寤鸿**锛氫簩閫変竴鈥斺€旀帴鍏ョ湡瀹炵粨绠楋紝鎴栫Щ闄ゆ浠ｇ爜锛堜繚鐣欐祴璇曠函灞炶瀵硷級銆?
### I5. 閿欒澶勭悊榛戞礊锛堝瓨妗?璇绘。杈圭晫锛?
- [ ] **鐘舵€?*锛氬緟淇
- **浣嶇疆**锛?  - `apps/taosim-ui/src/stores/app.ts:94-112`锛坄loadGame` 瀵?payload.player 闆舵牎楠岋級
  - `apps/taosim-ui/src/composables/useWorld.ts:110-113`锛堟椂闂存帹杩涘紓甯歌鍚炲苟杩斿洖"鏈浜?锛?- **褰卞搷**锛氭崯鍧?鏃х増鏈瓨妗ｇ己瀛楁 鈫?娈嬬己 character 鍚庤闂?`character.attributes.physique` 澶勫穿婧冿紱鏃堕棿鎺ㄨ繘澶辫触闈欓粯銆?- **淇寤鸿**锛歭oadGame 鍔犲舰鐘舵牎楠岋紙缂哄瓧娈佃ˉ榛樿/鎷掔粷锛夛紱鏃堕棿鎺ㄨ繘寮傚父涓婃姤 UI銆?
---

## 3. 馃煛 Minor锛堢被鍨嬪畨鍏?/ 涓€鑷存€э級

- [ ] **M1. MarketTransaction 鏃犳暟閲忔牎楠?* 鈥?`packages/engine/src/market/market-transaction.ts:42-66`锛涜礋鏁伴噺鍊掔亴鐏电煶/搴撳瓨锛圲I 鎭掍紶 1锛屽綋鍓嶄笉鍙埄鐢級銆?- [ ] **M2. MarketPanel 鍑哄敭缁曞紩鎿?* 鈥?`apps/taosim-ui/src/game/panels/MarketPanel.vue:76-90`锛涙墜鏀瑰簱瀛樸€佸浐瀹?`tier*10*1.2` 瀹氫环锛屼笌寮曟搸瀹氫环/濂芥劅搴︽姌鎵ｄ綋绯讳笉涓€鑷达紱鍧婂競閿氬畾 `PRESET_MAP.continents[0]`锛坄:26`锛夛紝璺ㄥぇ闄嗗悗鍧婂競澶辨晥銆?- [ ] **M3. 鍒涜鐐规暟鍙墸璐?* 鈥?`apps/taosim-ui/src/pages/CreateCharacterPage.vue:40-45`锛沗selectBackground` 涓嶆牎楠屽ぉ閬撶偣鏁帮紝閫変笉璧风殑鍑鸿韩浠呭彉鑹蹭笉绂侀€夈€?- [ ] **M4. useCombat `state.engine as any`** 鈥?`apps/taosim-ui/src/composables/useCombat.ts:302`锛沘wait 鍚庣獎鍖栦涪澶憋紱`executeNpcTurn` 寮傚父 鈫?unhandled rejection + `currentTurn` 鍗℃锛堟垬鏂楄蒋閿侊級銆備慨娉曪細await 鍓?`const engine = state.engine`銆?- [ ] **M5. ai-service-facade 姝绘々** 鈥?`packages/engine/src/ai/ai-service-facade.ts`锛涢浂寮曠敤銆佹湭瀵煎嚭锛沗callLLM` 鎶涖€宯ot yet configured銆嶃€傚垹鎴栨帴绾裤€?- [ ] **M6. 鏉傞」**锛?  - `AdventureEngine.REALM_ORDER`锛坄adventure-engine.ts:13-20`锛夊惈 `SoulFormation_2/3`锛岀帺瀹舵渶楂?`SoulFormation_1` 鈫?渚濊禆闂ㄦ鐨勪簨浠舵案涓嶈Е鍙戯紱
  - `formatRealm`锛坄i18n-game.ts:54-59`锛夊瑁稿悕杈撳嚭銆寀ndefinedundefined灞傘€嶏紱
  - `useWorld.ts:58` 娈嬬暀璋冭瘯 console.log锛?  - `HexCanvas.vue:290,310` `(t as any)._ftId` 绉佹湁灞炴€ф寕杞斤紙浣庨闄╋級銆?
---

## 4. 鈿狅笍 瀛橀噺 typecheck 閿欒锛堥樆濉炵敓浜ф瀯寤猴級

UI 鏋勫缓鑴氭湰涓?`vue-tsc --noEmit && vite build`锛屼互涓?4 澶勯敊璇細**闃诲鐢熶骇鏋勫缓**锛?
- [x] **T1. MapPanel.vue(500,42) `connId`** 鈥?鐪?bug锛堣 I2锛夛紝鏃㈡槸绫诲瀷閿欒涔熸槸杩愯鏃舵覆鏌撳け鏁堛€?- [x] **T2. VenuePanel.vue(16,8) `VenueDef` 鏈鍑?* 鈥?import 婧愰敊璇細`VenueDef` 瀹氫箟浜?`@taosim/contracts/multi-layer-map.ts:86`锛宔ngine 鏈啀瀵煎嚭銆俈enuePanel 鏄椿璺冨姛鑳斤紙MapPanel.vue:444 娓叉煋锛夛紝闈炴浠ｇ爜銆備慨娉曪細鏀逛粠 `@taosim/contracts` 瀵煎叆銆?- [x] **T3. VenuePanel.vue(134,14)/(144,14) TS7053** 鈥?T2 鐨勮繛閿佸弽搴旓紙`venue.type` 鍔犲涓?string 鍚庣储寮?`Record<VenueType,string>`锛夛紝淇?T2 鍗虫秷澶便€?
---

## 5. 鈿?瑙勬牸瀛樺湪浣嗘湭瀹炵幇锛堟柟妗堝姣旓級

| # | 鏈仛椤?| 瑙勬牸鏉ユ簮 | 鐜扮姸 |
|---|---|---|---|
| S1 | **鎴樻枟 v2 鏈帴鍏?UI**锛堜粛璺戞棫 CombatEngine锛泇2 浠?Phase A锛涙妧鑳借В鏋愬櫒/鐘舵€佹晥鏋?鎴樻枟閬撳叿/鎴樺埄鍝?钃勫姏/BattleDelta 妯″潡鏂囦欢涓嶅瓨鍦級 | battle-system-v2 | 鈿?|
| S2 | **涓硅嵂鏃犳秷璐硅矾寰?*锛堢偧鍒朵骇鐗╁彧鑳藉崠锛涙垬鏂椼€岄亾鍏枫€峆hase C 鍗犱綅锛沗getPillEffect` 鏃?UI 娑堣垂鑰咃級 | phase-7/battle-ui-v2 | 鈿?|
| S3 | **鎶€鑳芥棤宸紓**锛堝皠绋嬬粺涓€ 1 鏍硷紱`skillCoefficient`/`elementMultiplier` 鎭掑€硷紱skill-registry 鏁版嵁鏈～锛?| phase-10 | 馃煛 |
| S4 | **涓栫晫鐘舵€佷笉鎸佷箙鍖?*锛堝潑甯?瀹楅棬/娲?NPC 瀛樻。鍐欑┖瀵硅薄锛涙椿涓栫晫妯℃嫙姣忔 `new WorldEngine` 閲嶅缓瀹為檯涓嶈繍琛岋級 | phase-2/6 | 馃煛 |
| S5 | **闄嶄复鏂瑰紡涓嶅彲杈?*锛坄arrival` 姝ラ鏈繘鍒涜 order锛涘垵濮嬫潗鏂欐湭鍙戞斁锛涚骞翠簨浠?`childhood-events.ts` 鏈帴绾匡級 | phase-9/11 | 鈿?|
| S6 | **瀹楅棬缂哄彛**锛堟棤浠诲姟姒滃唴瀹广€佹棤瀹楅棬鍔犲叆鍏ュ彛銆佹棤鍔熸硶瀛︿範锛?| phase-3 | 馃煛 |
| S7 | **鏃呰涓嶆帹杩涗笘鐣屾椂闂?*锛堜笖涓嶈Е鍙戦搧浜鸿嚜鍔ㄥ瓨妗ｏ級 | phase-8 | 馃煛 |
| S8 | 绐佺牬閾炬姝ュ寲绁烇紱绉樺鏃犳帰绱㈢帺娉曪紱鎮熼亾/鎷嶅崠琛?姝讳骸浼犳壙缂哄け | phase-5/8/11 | 馃煛 |
| S9 | AI/LLM/澶氫汉鑱旀満瀹屽叏鏈仛 | 鍚勫 | 鈿?|

> gap-analysis 閫愭潯鏍稿璇﹁瀹¤浼氳瘽锛涘凡瑙ｅ喅椤癸紙1.1/1.4/2.1/3.4/4.1/6.2/6.3锛夈€侀儴鍒嗚В鍐抽」锛?.2/1.3/2.3/2.4/3.1/4.2/4.3/5.2锛夈€佹湭瑙ｅ喅椤癸紙2.2/2.5/3.2/3.3/5.1/5.3/6.1锛夈€?
---

## 6. UI 鎵撶（缂哄彛

1. **FactionPage / OverworldPage 瀛ゅ効椤?* 鈥?涓嶅湪 `router/routes.ts`锛堜粎 `/` 鈫?AppRoot锛夛紱FactionPage 鏁撮〉 mock锛坄:12-19`锛夈€丱verworldPage 涓€閿灛绉诲悗闂紙`:48-52`锛夈€傚垹鎴栨帴鍥炰富娴佺▼銆?2. **VenuePanel 7 绫诲満鎵€浠?2 绫绘湁鐜╂硶** 鈥?shop鈫掑潑甯傘€乼raining_ground鈫掍慨鐐硷紱閰掗/浼犻€侀櫌/姘戝眳/浠诲姟姒?瀹楅棬澶ф杩涘叆鍚庝粎鍚嶇О+鎻忚堪+杩斿洖銆?3. **閿欒 UX 榛戞礊** 鈥?瀛樻。澶辫触闆舵彁绀猴紙C1/I5锛夛紱鍧婂競/NPC 浜ゆ槗鏈?message锛堟爣鍑嗗仛娉曪紝鍙弬鐓цˉ榻愶級銆?4. **CultivationTab 鏁板€煎弻婧?* 鈥?绐佺牬閰嶇疆纭紪鐮佸湪 UI锛坄:119-144`锛夈€乪stSuccessRate UI 鑷畻锛坄:221-250`锛変笌寮曟搸鍙兘婕傜Щ锛涘畻闂ㄨ础鐚湰鍦?ref 鍒囬〉娓呴浂锛坄:37`锛夈€?5. **鍙屼富棰樺壊瑁?* 鈥?鎴樻枟鍐呮祬鑹插崱鐗囷紙`bg-surface #faf8f3`锛夊祵娣辫壊鐣岄潰锛坄bg-slate-900`锛夛紱i18n 鍙槸鏋氫妇鏍煎紡鍖栵紝鏃?locale 鍒囨崲銆?6. **鐗╁搧鍚嶆硠婕忓師濮?ID** 鈥?MapPanel.vue:285銆丄dventureEventCard.vue:74銆?8 鐢?`evt.materialId`/`itemId` 褰撴樉绀哄悕锛汣raftingTab.vue:265 娣风敤鑻辨枃 "Tier"銆?7. **MapPanel 鏃犵缉鏀?* 鈥?瀵规瘮鎴樻枟 HexCanvas 鏈?+/鈭?閲嶇疆锛汿opBar銆岄棴鍏?1 骞淬€嶏紙`TopBar.vue:79`锛変笌淇偧椤?Isolated 妯″紡璇箟涓嶄竴鑷淬€?
---

## 7. 妯″潡瀹屾垚搴︾煩闃?
| 妯″潡 | 瀹屾垚搴?| 澶囨敞 |
|---|---|---|
| 瑁呭 (phase-4) | 鉁?| 绌挎埓/鍗镐笅/鎴樻枟鍔犳垚鍏ㄦ帴绾?|
| 鍝佽川/绋€鏈夊害 (phase-7) | 鉁?| 鍝佽川/鐗规晥/鑰愪箙/鍗囧搧閾?|
| 閫冭窇 (2026-08-07) | 鉁?| 鍏ㄩ摼璺紙杞攣淇寰呮彁浜わ紝瑙?搂8锛?|
| UI 鏋舵瀯 (phase-10) | 鉁?| 鍗曞睆闈㈡澘鍖栵紱娈嬬暀 2 瀛ゅ効椤?|
| 瑙掕壊鍒涘缓 (phase-9) | 馃煛 | 6/7 姝ワ紙闄嶄复涓嶅彲杈撅級銆佸垵濮嬫潗鏂欐湭鍙?|
| 澶у湴鍥?鏃呰 (phase-4/11) | 馃煛 | 4 灞傚湴鍥?瀵昏矾瀹屾暣锛涘鐣岄棬妲涘け鏁堛€佷紶閫佺嚎涓嶆覆鏌撱€? 澶ч檰鍗犱綅 |
| 绐佺牬/淇偧 (phase-5/8) | 馃煛 | 鏁板€煎弻婧愩€佹姝ュ寲绁炪€佷紶缁熸ā寮忔湭鍖哄垎 |
| NPC 浜や簰/浜ゆ槗 (phase-5/6) | 馃煛 | 鍒囩/璁洪亾/浜ゆ槗瀹屾暣锛涙棤甯堝緬閬撲荆閫佺ぜ |
| 鍧婂競 (phase-6) | 馃煛 | 涔板叆瀹屾暣锛涘嚭鍞粫寮曟搸銆佸簱瀛樹笉鎸佷箙鍖?|
| 鐐煎埗 (phase-7) | 馃煛 | 鍥涚被鐐煎埗瀹屾暣锛涗腹鑽棤娑堣垂鍑哄彛 |
| 鎴樻枟 v2 (battle-system-v2) | 鈿?| 浠?Phase A锛汢/C/D 鏈熷叏缂猴紝UI 鏈帴鍏?|
| 瀹楅棬 (phase-3) | 馃煛 | 寮曟搸+璐＄尞/鏅嬪崌 UI锛涙棤浠诲姟/鍔犲叆锛屼笉鎸佷箙鍖?|
| 娲讳笘鐣?(phase-2) | 鈿?| 寮曟搸閫昏緫鍦ㄤ絾杩愯鎬佷笉鐢熸晥 |
| AI 鏈嶅姟 | 鈿?| 鎶涘紓甯告々锛岄浂寮曠敤 |
| 瀛樻。/璇绘。 | 馃煛 | 褰撳墠蹇呯劧澶辫触锛圕1锛夈€佷笘鐣岀姸鎬佷笉鍏ㄦ寔涔呭寲 |

---

## 8. 宸ヤ綔鍖烘湭鎻愪氦鏀瑰姩

- **閫冭窇杞攣淇**锛堜笂涓€杞瘎瀹?Critical锛屽凡淇+6 鍗曟祴锛?*鏈彁浜?*锛夛細
  - `apps/taosim-ui/src/composables/useBattleUI.ts`锛坒leeCmd 澶辫触鍥?command 鐩镐綅锛?  - `apps/taosim-ui/src/composables/__tests__/useBattleUI.test.ts`锛?6 鐢ㄤ緥锛?- 寤鸿鎻愪氦涓虹嫭绔?fix commit锛堜笉 push锛夈€?
---

## 9. 寤鸿淇椤哄簭

1. **C1 瀛樻。**锛堟暟鎹涪澶辩骇锛屾渶楂樹紭鍏堬級鈫?娣辨嫹璐?+ 閿欒鎻愮ず
2. **C2 濂囬亣宕╂簝** 鈫?attribute 鍒嗘敮璇?`outcome.attribute`/`value` + 琛ユ祴璇?3. **I1 澧冪晫闂ㄦ** 鈫?`parseRealm` 姝ｇ‘姣旇緝 + 琛ユ祴璇?4. **I2 浼犻€佽繛绾?* 鈫?computed 杩囨护
5. **I3 realm 濂戠害** 鈫?subLevel 鏀舵暃銆佸垹 `as any`
6. **T2/T3** 鈫?淇?`VenueDef` import 婧愶紙娑?3 澶?typecheck锛夛紝鎭㈠鐢熶骇鏋勫缓
7. 娓呯悊瀛ゅ効椤点€佽ˉ閿欒鍙嶉銆佺粺涓€涓婚

---

## 10. 娴嬭瘯瑕嗙洊鐩插尯

- 鏃?`adventure-engine.test.ts` 鈫?C2 寮曟搸渚ч浂瑕嗙洊锛沀I 鏃?SFC 缁勪欢娴嬭瘯锛圓dventureEventCard/MapPanel/VenuePanel/BattleOverlay/HexCanvas 鍏ㄩ儴鏈祴锛夛紱vitest 寮€鐫€ `passWithNoTests: true`
- 鏃?`travel-service.test.ts` / `venue-service.test.ts` 鈫?I1 鏃犱汉瀵熻
- `packages/persistence` 鏁村寘闆舵祴璇?鈫?C1 鏃犱汉瀵熻
- `npc-generator.test.ts` 鍙柇瑷€ `realm.startsWith`锛屾紡闈炴硶瀛愰樁锛圛3锛?- `player-battle-delta.test.ts` 瑕嗙洊姝讳唬鐮侊紙I4锛?- engine 鍖呭唴鏃?`hex-overworld-engine`锛堢Щ鍔?瀵昏矾/鑷姩瀵昏矾锛夋祴璇?
