'use strict';
const OWN_COOKIE = 'nogifura_owned_v1_';
const ownState = {keys: new Set(), scores: new Map(), scoreCardId: 0, rank: 1, kind: 'member', filter: 'all', sort: 'roster', ascending: false, filters: {}, viewPrefs: {}, filtersOpen: false, page: 0, result: 'unlocked', resultPage: 0, loaded: false, storage: ''};
const LEGACY_PLATE_PARTS = 4;

function encodeOwned(ids) {
  let previous = 0;
  return [...new Set(ids)].sort((a,b) => a-b).map(id => { const delta = id-previous; previous=id; return delta.toString(36); }).join('.');
}
function decodeOwned(value) {
  if (!value) return [];
  let id = 0;
  return value.split('.').map(part => {
    if (!/^[0-9a-z]+$/.test(part)) throw new Error('Invalid saved card');
    id += parseInt(part, 36);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid saved card');
    return id;
  });
}
function ownedCookiePath() {
  const pathname = location.pathname || '/';
  return pathname.slice(0, pathname.lastIndexOf('/') + 1);
}
function readOwnedCookie(name) {
  const entry = (document.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='));
  return entry ? entry.slice(name.length + 1) : '';
}
function loadOwned() {
  if (ownState.loaded) return;
  ownState.loaded = true;
  try {
    let saved;
    if (location.protocol === 'file:') {
      saved = JSON.parse(localStorage.getItem(OWN_COOKIE + ownedCookiePath()) || '{}');
      ownState.storage = 'ローカルファイル：このブラウザに保存（Cookie は HTTPS 公開時に使用）';
    } else {
      saved = {member: readOwnedCookie(OWN_COOKIE + 'm'), center_memoria: readOwnedCookie(OWN_COOKIE + 'c'), rank: readOwnedCookie(OWN_COOKIE + 'r'), plate: Array.from({length:LEGACY_PLATE_PARTS},(_,i)=>readOwnedCookie(OWN_COOKIE + 'p' + i)).join('')};
      ownState.storage = '選択は Cookie に自動保存（このブラウザ・約1年）';
    }
    const keys = new Set();
    for (const kind of ['member', 'center_memoria']) for (const id of decodeOwned(saved[kind])) keys.add(`${kind}:${id}`);
    const legacyPlateIds = decodeOwned(saved.plate);
    if (legacyPlateIds.length) {
      const byId = new Map(DATA.synchro.map(item => [item.id, item]));
      for (const id of legacyPlateIds) for (const key of byId.get(id)?.ownershipRequirements?.cardKeys || []) keys.add(key);
    }
    ownState.keys = keys;
    ownState.rank = Number.isSafeInteger(Number(saved.rank)) && Number(saved.rank) > 0 ? Number(saved.rank) : 1;
    if (legacyPlateIds.length && saveOwned() && location.protocol !== 'file:') {
      for (let i = 0; i < LEGACY_PLATE_PARTS; i++) document.cookie = `${OWN_COOKIE}p${i}=; Max-Age=0; Path=${ownedCookiePath()}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    }
  } catch (_) { ownState.storage = '保存データを読み込めません。この画面の選択は一時的です。'; }
  try {
    const scoreRows = JSON.parse(localStorage.getItem(OWN_COOKIE + 'scores_' + ownedCookiePath()) || '[]');
    if (Array.isArray(scoreRows)) ownState.scores = new Map(scoreRows.filter(([id,score]) => Number.isSafeInteger(id) && id > 0 && Number.isFinite(score) && score > 0));
  } catch (_) { /* Scores are optional; Cookie ownership remains available. */ }
}
function saveOwnedScores() {
  try {
    localStorage.setItem(OWN_COOKIE + 'scores_' + ownedCookiePath(), JSON.stringify([...ownState.scores]));
  } catch (_) { ownState.storage = 'スコアを保存できませんでした。ブラウザの保存設定を確認してください。'; }
}
function saveOwned() {
  const saved = {rank: String(ownState.rank)};
  for (const kind of ['member', 'center_memoria']) saved[kind] = encodeOwned([...ownState.keys].filter(key => key.startsWith(kind + ':')).map(key => Number(key.split(':')[1])));
  try {
    if (location.protocol === 'file:') {
      localStorage.setItem(OWN_COOKIE + ownedCookiePath(), JSON.stringify(saved));
      ownState.storage = 'ローカルファイル：このブラウザに保存済み（Cookie は HTTPS 公開時に使用）';
    } else {
      for (const [kind, suffix] of [['member','m'], ['center_memoria','c'], ['rank','r']]) {
        const value = saved[kind];
        if (value.length > 3500) throw new Error('Cookie capacity');
        const name = OWN_COOKIE + suffix;
        document.cookie = `${name}=${value}; Max-Age=31536000; Path=${ownedCookiePath()}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
        if (readOwnedCookie(name) !== value) throw new Error('Cookie unavailable');
      }
      ownState.storage = 'Cookie に保存済み（このブラウザ・約1年）';
    }
    return true;
  } catch (_) { ownState.storage = '保存できませんでした。ブラウザの保存設定を確認してください（現在の選択は再読み込みで失われます）。'; return false; }
}
function synchroOwnership(item, owned, now = Date.now()) {
  const conditions = item.conditions || [];
  const supported = conditions.length > 0 && conditions.every(c => [1,2].includes(c.conditionType) && c.conditionValue === 0 && c.ownershipKey);
  const keys = [...new Set(conditions.map(c => c.ownershipKey))];
  const missing = keys.filter(key => !owned.has(key));
  const available = ownRecordIsReleased(item, now);
  return {unlocked: supported && available && missing.length === 0, missing, supported, available};
}
function toggleOwnedCard(key) {
  const selected = DATA.roster.find(card => card.ownershipKey === key);
  if (!selected || !ownIsReleased(selected.startAt)) return;
  if (ownState.keys.has(key)) ownState.keys.delete(key);
  else {
    ownState.keys.add(key);
    const ranks = {N:1,R:2,SR:3,SSR:4,UR:5,LR:6};
    if (selected.kind === 'member' && selected.seriesId && ranks[selected.rarity]) {
      for (const card of DATA.roster) {
        if (card.kind === 'member' && card.seriesId === selected.seriesId && ownIsReleased(card.startAt) && ranks[card.rarity] < ranks[selected.rarity]) ownState.keys.add(card.ownershipKey);
      }
    }
  }
  saveOwned();
}
function synchroTotals(items, owned) {
  const rows = new Map();
  const unlocked = [];
  const unsupported = [];
  for (const item of items) {
    if (!synchroOwnership(item, owned).unlocked) continue;
    unlocked.push(item);
    // Deduplicate repeated source rows within each passive, never across synchros.
    for (const passive of item.passives || []) for (const effect of uniqueEffects(passive.effects || [])) {
      let key, name, mode, value;
      if (effect.LogicType === 1 && ['add','ratio','by_level'].includes(effect.Param2)) {
        key = effect.Param1; name = OWN_PARAM_NAMES[key]; mode = effect.Param2; value = Number(effect.Param3);
      } else if ([2,6].includes(effect.LogicType) && ['12001','13001'].includes(effect.Param1)) {
        key = `resistance_${effect.LogicType}_${effect.Param1}`;
        name = (effect.Param1 === '12001' ? 'デバフ' : 'サゲ効果') + (effect.LogicType === 2 ? '耐性' : '耐性貫通');
        mode = 'add'; value = Number(effect.Param2);
      }
      if (!name || !Number.isFinite(value)) { unsupported.push({item, effect}); continue; }
      if (!rows.has(key)) rows.set(key, {key, name, add: 0, ratio: 0, by_level: 0});
      rows.get(key)[mode] += value;
    }
  }
  return {rows: [...rows.values()], unlocked, unsupported};
}
const OWN_PARAM_NAMES = {strength:'エフォート',agility:'サンクス',intelligence:'スマイル',vitality:'バイタリティ',max_hp:'HP上限',max_sp:'SP上限',attack:'アピール力',min_attack:'最小アピール',max_attack:'最大アピール',defense:'ディフェンス',physical_defense:'フィジカル',spiritual_defense:'メンタル',penetration_defense:'表現力',penetration_physical_defense:'演技力',penetration_spiritual_defense:'歌唱力',accuracy:'命中値',evasion:'回避値',critical:'会心値',patience:'会心回避',absorption_hp_rate:'HP吸収',reflection_rate:'リフレクト',hp_recovery_rate:'自動HP回復',critical_damage_rate:'会心アピール',physics_critical_damage_up_rate:'フィジカル会心アピール',spiritual_critical_damage_up_rate:'メンタル会心アピール',state_resistance_rate:'状態異常耐性',critical_damage_resistance_rate:'会心アピール耐性',reflection_resistance_rate:'リフレクト耐性'};
const OWN_PERCENT = new Set(['absorption_hp_rate','reflection_rate','hp_recovery_rate','critical_damage_rate','physics_critical_damage_up_rate','spiritual_critical_damage_up_rate','state_resistance_rate','critical_damage_resistance_rate','reflection_resistance_rate','debuff_resistance','debuff_penetration']);
const ownNumber = value => Number(value.toFixed(6)).toLocaleString('ja-JP', {maximumFractionDigits: 6});
for (const logic of [2,6]) for (const group of ['12001','13001']) OWN_PERCENT.add(`resistance_${logic}_${group}`);
function ownPager(prefix, page, pages) {
  return `<div class="synchro-pager"><button id="${prefix}-prev" ${page === 0 ? 'disabled' : ''}>前へ</button><span>${page + 1} / ${pages}</span><button id="${prefix}-next" ${page >= pages - 1 ? 'disabled' : ''}>次へ</button></div>`;
}
function ownOptions(values, selected) { return values.map(([value,label]) => `<option value="${escapeHtml(value)}" ${selected === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join(''); }
const OWN_EFFECT_CATEGORIES = [[1,'バフ'],[2,'状態アップ'],[3,'特殊'],[4,'デバフ'],[5,'状態ダウン'],[6,'特殊パッシブ']];
const OWN_MEMBER_TYPES = [[1,'エフォート'],[2,'サンクス'],[3,'スマイル']];
const OWN_MEMORIA_TYPES = [[1,'TypeA'],[2,'TypeB'],[3,'TypeC'],[4,'TypeD']];
function ownSelected(group) { return ownState.filters[group] || new Set(); }
function ownIsReleased(value, now = Date.now()) {
  // Direct local-file browsing is a full-data preview; hosted pages keep release gates.
  if (location.protocol === 'file:') return true;
  if (!value || value.startsWith('0001-')) return true;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now;
}
function ownRecordIsReleased(item, now = Date.now()) {
  return ownIsReleased(item.startAt, now) && (item.conditions || []).every(condition => ownIsReleased(condition.startAt, now));
}
function ownMatchesFilters(card, filters = ownState.filters) {
  const selected = key => filters[key] || new Set();
  const matches = (key, values) => !selected(key).size || values.some(value => selected(key).has(String(value)));
  if (!matches('type', [card.kind === 'member' ? card.unitType : card.slotType])) return false;
  if (!matches('rarity', [card.rarity])) return false;
  if (!matches('member', card.kind === 'member' ? [card.characterId] : (card.characterIds || []))) return false;
  if (card.kind === 'member') for (const [category] of OWN_EFFECT_CATEGORIES) {
    if (!matches('effect_' + category, card.filterTags || [])) return false;
  }
  return true;
}
function ownFilteredRoster() {
  const terms = searchTerms($('search').value);
  const filtered = DATA.roster.filter(c => c.kind === ownState.kind && ownIsReleased(c.startAt) && ownMatchesFilters(c) && (ownState.filter === 'all' || ownState.keys.has(c.ownershipKey) === (ownState.filter === 'owned')) && terms.every(t => normalizeSearchText([c.displayName,c.characterName,c.rarity].join(' ')).includes(t)));
  return sortOwnedRoster(filtered, DATA.roster, ownState.sort, ownState.ascending);
}
function ownFilterChoices(group, values) {
  const selected = ownSelected(group);
  return `<fieldset class="own-filter-group"><legend>${escapeHtml(values.title)}${selected.size ? ` · ${selected.size}` : ''}</legend><div class="own-filter-choices">${values.options.map(([value,label]) => `<label><input type="checkbox" data-own-filter-group="${group}" value="${escapeHtml(String(value))}" ${selected.has(String(value)) ? 'checked' : ''}><span>${escapeHtml(label)}</span></label>`).join('')}</div></fieldset>`;
}
function ownFilterPanel(characters) {
  const kind = ownState.kind;
  const rarity = kind === 'member' ? ['N','R','SR','SSR','UR','LR'] : ['R','SR','SSR'];
  const groups = [
    ownFilterChoices('type', {title:'タイプ',options:kind === 'member' ? OWN_MEMBER_TYPES : OWN_MEMORIA_TYPES}),
    ownFilterChoices('rarity', {title:'レアリティ',options:rarity.map(x => [x,x])}),
    ownFilterChoices('member', {title:'メンバー',options:characters}),
  ];
  if (kind === 'member') for (const [category,label] of OWN_EFFECT_CATEGORIES) {
    const options = (DATA.libraryFilters || []).filter(row => row.category === category && ownIsReleased(row.startAt)).map(row => [row.id,row.name]);
    groups.push(`<details class="own-effect-group" ${ownSelected('effect_' + category).size ? 'open' : ''}><summary>${escapeHtml(label)}${ownSelected('effect_' + category).size ? ` · ${ownSelected('effect_' + category).size}` : ''}</summary>${ownFilterChoices('effect_' + category,{title:label,options})}</details>`);
  }
  const active = Object.values(ownState.filters).reduce((sum,items) => sum + items.size, 0);
  return `<details id="own-filter-panel" class="own-filter-panel" ${ownState.filtersOpen ? 'open' : ''}><summary>絞り込み${active ? ` · ${active}件選択` : ''}</summary><div class="own-filter-body">${groups.join('')}<button type="button" id="own-clear-filters">絞り込みを解除</button></div></details>`;
}
function ownSeriesKey(card) {
  return card.kind === 'member' && card.seriesId ? `member:${card.seriesId}` : card.ownershipKey;
}
function ownReleaseTime(card) {
  if (!card.startAt || card.startAt.startsWith('0001-')) return null;
  const value = Date.parse(card.startAt);
  return Number.isFinite(value) ? value : null;
}
function ownGraduated(card, now = Date.now()) {
  if (!card.graduateDate || card.graduateDate.startsWith('0001-')) return false;
  const date = Date.parse(card.graduateDate);
  return Number.isFinite(date) && date <= now;
}
function ownGraduateTime(card) {
  const date = Date.parse(card.graduateDate || '');
  return Number.isFinite(date) ? date : Number.POSITIVE_INFINITY;
}
function ownGameCategoryOrder(a, b) {
  // Native MemberSortFilter.ExecuteSort (RVA 0x2F7893C):
  // OrderBy(IsOgValid), ThenByDescending(IsJoin), ThenBy(GraduateAtForSort).
  const og = Number(Boolean(a.ogFlag)) - Number(Boolean(b.ogFlag));
  if (og) return og;
  return Number(ownGraduated(a)) - Number(ownGraduated(b));
}
function ownGameMemberOrder(a, b) {
  const category = ownGameCategoryOrder(a, b);
  if (category) return category;
  // The game then sorts graduates by GraduateAtForSort before rarity/kana.
  if (ownGraduated(a) && ownGraduated(b)) {
    const at = ownGraduateTime(a), bt = ownGraduateTime(b);
    if (at !== bt) return at < bt ? -1 : 1;
  }
  return 0;
}
function ownPhonetic(card) {
  return String(card.phonetic || card.characterName || '')
    .normalize('NFKC').replace(/[\s　]+/g, '')
    .replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
}
function sortOwnedRoster(filtered, allCards, sort, ascending = false, scores = ownState.scores, owned = ownState.keys) {
  if (['roster','rarity','generation','phonetic','memoria_type','memoria_score'].includes(sort)) {
    const ranks = {N:1,R:2,SR:3,SSR:4,UR:5,LR:6};
    const direction = ascending ? 1 : -1;
    return [...filtered].sort((a,b) => {
      if (a.kind === 'center_memoria' && b.kind === 'center_memoria') {
        // CenterMemoriaSortFilter.ExecuteSort: chosen key, then fixed secondary
        // keys. Rarity's secondary Type is always ascending; Type's secondary
        // rarity is always descending. Both end with memoria ID ascending.
        if (sort === 'memoria_score') return direction*((owned.has(a.ownershipKey) ? scores.get(a.id) || 0 : 0)-(owned.has(b.ownershipKey) ? scores.get(b.id) || 0 : 0)) || (ranks[b.rarity] || 0)-(ranks[a.rarity] || 0) || a.id-b.id;
        if (sort === 'memoria_type') return direction*((a.slotType || 0)-(b.slotType || 0)) || (ranks[b.rarity] || 0)-(ranks[a.rarity] || 0) || a.id-b.id;
        return direction*((ranks[a.rarity] || 0)-(ranks[b.rarity] || 0)) || (a.slotType || 0)-(b.slotType || 0) || a.id-b.id;
      }
      // MemberSortFilter.ExecuteSort: OG / joining / graduation-date keys
      // precede the chosen key. Its final tie-break is avatar ID ascending.
      const gameOrder = ownGameMemberOrder(a,b);
      if (gameOrder) return gameOrder;
      if (sort === 'generation') return direction*((Number(a.generation) || 99)-(Number(b.generation) || 99)) || ownPhonetic(a).localeCompare(ownPhonetic(b), 'ja') || a.id-b.id;
      if (sort === 'phonetic') return direction*ownPhonetic(a).localeCompare(ownPhonetic(b), 'ja') || a.id-b.id;
      return direction*((ranks[a.rarity] || 0)-(ranks[b.rarity] || 0)) || ownPhonetic(a).localeCompare(ownPhonetic(b), 'ja') || a.id-b.id;
    });
  }
  const dates = new Map();
  for (const card of allCards) {
    const key = ownSeriesKey(card), date = ownReleaseTime(card);
    if (date !== null && (!dates.has(key) || date < dates.get(key))) dates.set(key, date);
  }
  const groups = new Map();
  for (const card of filtered) {
    const key = ownSeriesKey(card);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  const ranks = {N:1,R:2,SR:3,SSR:4,UR:5,LR:6};
  return [...groups.entries()].sort(([ak, av],[bk,bv]) => {
    if (av[0].kind === 'member' && bv[0].kind === 'member') {
      const category = ownGameCategoryOrder(av[0],bv[0]);
      if (category) return category;
    }
    if (sort !== 'member') {
      const ad = dates.get(ak), bd = dates.get(bk);
      if (ad === undefined && bd !== undefined) return 1;
      if (bd === undefined && ad !== undefined) return -1;
      if (ad !== undefined && bd !== undefined && ad !== bd) return sort === 'oldest' ? ad-bd : bd-ad;
    }
    return (av[0].characterId || 0)-(bv[0].characterId || 0) || (av[0].seriesId || av[0].id)-(bv[0].seriesId || bv[0].id);
  }).flatMap(([,cards]) => cards.sort((a,b) => (ranks[b.rarity] || 0)-(ranks[a.rarity] || 0) || a.id-b.id));
}
function ownRosterPages(cards, size = 240) {
  const groups = [];
  for (const card of cards) {
    const previous = groups[groups.length-1];
    if (previous && ownSeriesKey(previous[0]) === ownSeriesKey(card)) previous.push(card);
    else groups.push([card]);
  }
  const pages = [[]];
  for (const group of groups) {
    if (pages[pages.length-1].length && pages[pages.length-1].length + group.length > size) pages.push([]);
    pages[pages.length-1].push(...group);
  }
  return pages;
}
function renderOwnedSynchro() {
  loadOwned();
  const releasedSynchro = DATA.synchro.filter(item => ownRecordIsReleased(item));
  const totals = synchroTotals(releasedSynchro, ownState.keys);
  const roster = ownFilteredRoster();
  const rosterPages = !['newest','oldest'].includes(ownState.sort)
    ? Array.from({length:Math.max(1,Math.ceil(roster.length/240))},(_,i)=>roster.slice(i*240,(i+1)*240))
    : ownRosterPages(roster);
  const pages = rosterPages.length;
  ownState.page = Math.min(ownState.page, pages-1);
  const memberCards = new Map();
  for (const card of DATA.roster) if (card.kind === 'member' && ownIsReleased(card.startAt) && !memberCards.has(String(card.characterId))) memberCards.set(String(card.characterId),card);
  const characterIds = new Set(DATA.roster.filter(c => c.kind === ownState.kind && ownIsReleased(c.startAt)).flatMap(c => c.kind === 'member' ? [c.characterId] : (c.characterIds || [])));
  // TownMemberLibraryFilterDialogLayerBase orders its member choices by
  // OG, joining state, graduation date, generation, then phonetic name.
  const characters = [...characterIds].map(id => memberCards.get(String(id))).filter(Boolean)
    .sort((a,b) => ownGameMemberOrder(a,b) || (Number(a.generation) || 99)-(Number(b.generation) || 99) || ownPhonetic(a).localeCompare(ownPhonetic(b),'ja') || a.characterId-b.characterId)
    .map(card => [String(card.characterId),card.characterName]);
  const results = releasedSynchro.filter(item => ownState.result === 'all' || synchroOwnership(item, ownState.keys).unlocked === (ownState.result === 'unlocked'));
  const availableCards = DATA.roster.filter(card => ownIsReleased(card.startAt));
  const resultPages = Math.max(1, Math.ceil(results.length/24));
  ownState.resultPage = Math.min(ownState.resultPage, resultPages-1);
  const dateOrder = ['newest','oldest'].includes(ownState.sort);
  const scoreCards = ownState.kind === 'center_memoria' && ownState.sort === 'memoria_score'
    ? DATA.roster.filter(card => card.kind === 'center_memoria' && ownIsReleased(card.startAt) && ownState.keys.has(card.ownershipKey)).sort((a,b) => a.displayName.localeCompare(b.displayName,'ja') || a.id-b.id)
    : [];
  if (scoreCards.length && !scoreCards.some(card => card.id === ownState.scoreCardId)) ownState.scoreCardId = scoreCards[0].id;
  const orderDescription = ownState.kind === 'member'
    ? ownState.sort === 'roster'
      ? `現役カードは ${ownState.ascending ? 'N → LR' : 'LR → N'}、同レアリティ内は五十音順。卒業メンバーは卒業日が古い順で、その後に OG を表示します。`
      : dateOrder
        ? '現役カードの後に卒業メンバー、その後に OG を表示。各区分ではシリーズ内で最も早い記録日を基準に並べ、日付未設定は末尾。同シリーズは LR → N の順でまとめます。'
        : '現役カード、卒業日の古いメンバー、OG の順に区分し、選んだ項目だけ昇順／降順を切り替えます。期別・レアリティの同値は五十音、最後にカード順です。'
    : dateOrder
      ? '開始日を基準に並べ、日付未設定は末尾です（サイト追加の並び順）。'
      : ownState.sort === 'memoria_score'
        ? 'スコア順 → レアリティ高い順 → カード順。スコアは所持カードのゲーム表示値を入力してください。未入力は 0 として扱います。'
      : ownState.sort === 'memoria_type'
        ? 'Type順 → レアリティ高い順 → カード順。昇順／降順は Type にだけ適用します。'
        : 'レアリティ順 → Type の小さい順 → カード順。昇順／降順はレアリティにだけ適用します。';
  $('detail').innerHTML = `<h2>シンクロ計算 · 所持名簿</h2>
    <p>カードを押して ✓ を付けます。実際に所持しているカードも、シンクロプレートで条件を補ったカードも、ここで同じようにチェックしてください。同じシリーズの下位レアリティも点灯します（LR → UR → SSR → SR → R → N）。もう一度押すと、そのカードだけ解除します。</p>
    <p id="own-storage" class="source">${escapeHtml(ownState.storage)}</p>
    <div class="own-summary"><strong>チェック済 ${availableCards.filter(c => ownState.keys.has(c.ownershipKey)).length} / ${availableCards.length}</strong><strong>計算対象 ${totals.unlocked.length} / ${releasedSynchro.length}</strong><button id="own-jump">シンクロ別の効果 ↓</button></div>
    <div class="own-controls">
      <label>種類 <select id="own-kind">${ownOptions([['member','メンバー'],['center_memoria','センターノギメモ']],ownState.kind)}</select></label>
      <label>表示 <select id="own-filter">${ownOptions([['all','すべて'],['owned','所持'],['missing','未所持']],ownState.filter)}</select></label>
      <label>並び順 <span class="own-sort-row"><select id="own-sort">${ownOptions(ownState.kind === 'member' ? [['roster','レアリティ順'],['generation','期別順'],['phonetic','五十音順'],['newest','開始日：新しい順（追加）'],['oldest','開始日：古い順（追加）']] : [['roster','レアリティ順'],['memoria_score','スコア順'],['memoria_type','Type順'],['newest','開始日：新しい順（追加）'],['oldest','開始日：古い順（追加）']],ownState.sort)}</select>${dateOrder ? '' : `<button type="button" id="own-direction" aria-label="${ownState.ascending ? '昇順' : '降順'}。押すと逆順" title="並び順を反転">${ownState.ascending ? '昇順 ↑' : '降順 ↓'}</button>`}</span></label>
    </div>${ownFilterPanel(characters)}<p class="source">${roster.length}枚 · ${orderDescription}</p>
    ${ownState.kind === 'center_memoria' && ownState.sort === 'memoria_score' ? `<div class="own-score-editor"><strong>所持スコア入力</strong>${scoreCards.length ? `<label>カード <select id="own-score-card">${ownOptions(scoreCards.map(card => [String(card.id),card.displayName]),String(ownState.scoreCardId))}</select></label><label>ゲーム表示スコア <input id="own-score-value" type="number" min="0" step="any" value="${ownState.scores.get(ownState.scoreCardId) || ''}" placeholder="0"></label>` : '<span>先にセンターノギメモを所持登録してください。</span>'}<small>入力したスコアはこのブラウザに保存します。</small></div>` : ''}
    ${ownPager('own-roster',ownState.page,pages)}
    <div class="own-roster">${rosterPages[ownState.page].map(c => `<button type="button" class="own-card ${ownState.keys.has(c.ownershipKey) ? 'is-owned' : ''}" data-own-key="${escapeHtml(c.ownershipKey)}" data-rarity="${escapeHtml(c.rarity || "")}" aria-pressed="${ownState.keys.has(c.ownershipKey)}" title="${escapeHtml(c.rarity || '')} · ${escapeHtml(c.displayName)}" aria-label="${escapeHtml(c.rarity || '')} ${escapeHtml(c.displayName)} ${ownState.keys.has(c.ownershipKey) ? '所持' : '未所持'}"><span class="own-picture">${ownState.keys.has(c.ownershipKey) ? '<span class="own-badge" aria-hidden="true">✓</span>' : ''}${c.image ? `${img(c.image, c.displayName, '')}` : '<span class="own-no-image">画像なし</span>'}${["N","R","SR","SSR","UR","LR"].includes(c.rarity) ? `${img('assets/game_ui/member_facelist_rarity_' + c.rarity.toLowerCase() + '.png', '', 'own-rarity')}` : ""}</span><span class="own-caption">${escapeHtml(c.displayName)}</span></button>`).join('') || `<p>該当する${ownState.kind === 'member' ? 'メンバー' : 'センターノギメモ'}はありません</p>`}</div>
    <section class="card own-totals"><h3>能力値合計（シンクロ分）</h3>
      <label>C.Rank <input id="own-rank" type="number" min="1" step="1" value="${ownState.rank}"></label>
      <p class="source">上の名簿でチェックしたカードを条件達成として、シンクロの効果を合計します。シンクロプレートを使った条件も同じ名簿でチェックしてください。C.Rank は計算対象メンバーの値です。割合・固定値は別欄に表示し、カード本体の能力値は含みません。</p>
      <div class="table-wrap"><table><thead><tr><th>能力</th><th>割合加成</th><th>固定加成</th><th>指定 C.Rank の加算値</th></tr></thead><tbody>${totals.rows.map(row => `<tr><th>${escapeHtml(row.name)}</th><td>${row.ratio ? '+'+ownNumber(row.ratio*100)+'%' : '—'}</td><td>${row.add ? '+'+ownNumber(row.add*(OWN_PERCENT.has(row.key)?100:1))+(OWN_PERCENT.has(row.key)?'%':'') : '—'}</td><td>${OWN_PERCENT.has(row.key) ? '+'+ownNumber(row.add*100)+'%' : '+'+ownNumber(row.add+row.by_level*ownState.rank)}</td></tr>`).join('') || '<tr><td colspan="4">カードを選択すると能力合計が表示されます</td></tr>'}</tbody></table></div>
      ${totals.unsupported.length ? `<p>個別確認が必要な効果：${totals.unsupported.length}件（合計から除外）</p>` : ''}
    </section>
    <section id="own-results"><h3>シンクロ別の効果</h3><label>表示 <select id="own-result-filter">${ownOptions([['unlocked','計算対象'],['locked','未達成'],['all','すべて']],ownState.result)}</select></label><span> ${results.length}件</span>
      <p class="source">これは名簿のチェックに基づく簡易計算です。ゲーム内のシンクロプレートは選んだシンクロにだけ使われ、カード自体を所持したことにはなりません。名簿でプレート分をチェックすると、同じカードを条件に持つほかのシンクロも計算対象になり、実際より多くなる場合があります。カード条件が揃っていても、ゲーム内で共鳴するまで効果は発動しません。</p>
      ${ownPager('own-result',ownState.resultPage,resultPages)}
      <div class="synchro-gallery">${results.slice(ownState.resultPage*24,(ownState.resultPage+1)*24).map(item => {
        const state = synchroOwnership(item, ownState.keys);
        return `<article class="synchro-tile">
          <div class="synchro-info"><h3>${escapeHtml(item.displayName)}</h3><div class="synchro-effect">${item.passives.map(p => `<p>${escapeHtml(p.text)}</p>`).join('')}</div></div>
          <div class="synchro-conditions"><p class="synchro-condition-count">共鳴条件（${item.conditions.length - state.missing.length}/${item.conditions.length}） <span class="chip">${state.unlocked ? '✓ 条件達成' : !state.supported ? '条件の確認が必要' : !state.available ? '期間外' : '不足 '+state.missing.length+'枚'}</span></p><div class="synchro-faces">${item.conditions.map(c => { const checked=ownState.keys.has(c.ownershipKey); return `<figure class="synchro-face ${checked?'owned-face':'missing-face'}">${img(c.image,c.displayName,'condition-img')}<figcaption>${checked?'✓':'未チェック'} ${escapeHtml(c.displayName)}</figcaption></figure>`; }).join('')}</div></div>
        </article>`;
      }).join('') || '<p>該当するシンクロはありません</p>'}</div>
    </section>`;
  for (const field of ['kind','filter','sort']) $('own-'+field).onchange = event => {
    if (field === 'kind') {
      ownState.viewPrefs[ownState.kind] = {filter:ownState.filter,sort:ownState.sort,ascending:ownState.ascending,filters:ownState.filters};
      ownState.kind = event.target.value;
      const saved = ownState.viewPrefs[ownState.kind] || {filter:'all',sort:'roster',ascending:false,filters:{}};
      ownState.filter=saved.filter; ownState.sort=saved.sort; ownState.ascending=saved.ascending; ownState.filters=saved.filters;
    } else ownState[field] = event.target.value;
    ownState.page=0;
    renderOwnedSynchro();
  };
  if ($('own-direction')) $('own-direction').onclick = () => {ownState.ascending=!ownState.ascending; ownState.page=0; renderOwnedSynchro();};
  if (scoreCards.length) {
    $('own-score-card').onchange = event => {ownState.scoreCardId=Number(event.target.value); $('own-score-value').value=ownState.scores.get(ownState.scoreCardId) || '';};
    $('own-score-value').onchange = event => {
      const value=Number(event.target.value);
      if (!Number.isFinite(value) || value<0 || value>=1e9) {event.target.value=ownState.scores.get(ownState.scoreCardId) || ''; return;}
      if (value) ownState.scores.set(ownState.scoreCardId,value); else ownState.scores.delete(ownState.scoreCardId);
      saveOwnedScores(); ownState.page=0; renderOwnedSynchro();
    };
  }
  $('own-filter-panel').ontoggle = event => {ownState.filtersOpen = event.target.open;};
  document.querySelectorAll('[data-own-filter-group]').forEach(input => input.onchange = event => {
    const scroll = $('detail').scrollTop;
    const group = event.target.dataset.ownFilterGroup;
    const values = ownSelected(group);
    if (event.target.checked) values.add(event.target.value); else values.delete(event.target.value);
    ownState.filters[group] = values;
    ownState.filtersOpen = true;
    ownState.page = 0;
    renderOwnedSynchro();
    $('detail').scrollTop = scroll;
  });
  $('own-clear-filters').onclick = () => {const scroll=$('detail').scrollTop; ownState.filters={}; ownState.filtersOpen=true; ownState.page=0; renderOwnedSynchro(); $('detail').scrollTop=scroll;};
  $('own-jump').onclick = () => $('own-results').scrollIntoView({behavior:'smooth',block:'start'});
  document.querySelectorAll('[data-own-key]').forEach(button => button.addEventListener('click', () => {
    const key=button.dataset.ownKey;
    const scroll=$('detail').scrollTop;
    toggleOwnedCard(key); renderOwnedSynchro(); $('detail').scrollTop=scroll;
    const replacement=[...document.querySelectorAll('[data-own-key]')].find(b=>b.dataset.ownKey===key);
    if (replacement) replacement.focus({preventScroll:true});
  }));
  $('own-rank').onchange = event => { const rank=Number(event.target.value); if (!Number.isSafeInteger(rank) || rank<1) {event.target.value=ownState.rank; return;} ownState.rank=rank; saveOwned(); renderOwnedSynchro(); };
  $('own-result-filter').onchange = event => {ownState.result=event.target.value; ownState.resultPage=0; renderOwnedSynchro();};
  for (const [prefix,field,count] of [['own-roster','page',pages],['own-result','resultPage',resultPages]]) {
    $(prefix+'-prev').onclick=()=>{ownState[field]=Math.max(0,ownState[field]-1); renderOwnedSynchro();};
    $(prefix+'-next').onclick=()=>{ownState[field]=Math.min(count-1,ownState[field]+1); renderOwnedSynchro();};
  }
}
