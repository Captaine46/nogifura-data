'use strict';
const OWN_COOKIE = 'nogifura_owned_v1_';
const OWN_COOKIE_MAX_AGE = 31536000;
const ownState = {keys: new Set(), scores: new Map(), awakenings: new Map(), bonusTarget: {role:'center',characterId:0}, view: 'roster', rosterKind: 'member', scoreCardId: 0, rank: 1, kind: 'member', filter: 'all', sort: 'roster', ascending: false, filters: {}, viewPrefs: {}, filtersOpen: false, page: 0, result: 'unlocked', resultPage: 0, loaded: false, storage: '', awakeningStorage: ''};
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
function writeOwnedCookie(name, value) {
  document.cookie = `${name}=${value}; Max-Age=${OWN_COOKIE_MAX_AGE}; Path=${ownedCookiePath()}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}
function renewOwnedCookies() {
  if (!['http:', 'https:'].includes(location.protocol)) return;
  try {
    const entries = (document.cookie || '').split(';').map(entry => entry.trim());
    const suffixes = ['m', 'c', 'r', ...Array.from({length:LEGACY_PLATE_PARTS}, (_,i) => 'p' + i)];
    for (const suffix of suffixes) {
      const name = OWN_COOKIE + suffix;
      const entry = entries.find(value => value.startsWith(name + '='));
      // Refresh existing values before any calculator data or selections load.
      if (entry) writeOwnedCookie(name, entry.slice(name.length + 1));
    }
  } catch (_) { /* Blocked Cookie access must not prevent the website opening. */ }
}
renewOwnedCookies();
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
  try {
    const rows = JSON.parse(localStorage.getItem(OWN_COOKIE + 'awakenings_' + ownedCookiePath()) || '[]');
    const cards = new Map(DATA.roster.filter(card => card.kind === 'center_memoria').map(card => [card.id, card]));
    ownState.awakenings = new Map(Array.isArray(rows) ? rows.filter(row => Array.isArray(row) && row.length === 2 &&
      Number.isSafeInteger(row[0]) && cards.has(row[0]) && Number.isSafeInteger(row[1]) && row[1] > 0 && row[1] <= cards.get(row[0]).maxAwakening) : []);
    ownState.awakeningStorage = '開花設定はこのブラウザに自動保存します。';
  } catch (_) {
    ownState.awakenings = new Map();
    ownState.awakeningStorage = '開花設定を読み込めません。現在の設定は一時的です。';
  }
  ownState.bonusTarget = {role:'center',characterId:0};
  try {
    const target = JSON.parse(localStorage.getItem(OWN_COOKIE + 'bonus_target_' + ownedCookiePath()) || '{}');
    if (target && typeof target === 'object') ownState.bonusTarget = {role:target.role === 'non_center' ? 'non_center' : 'center',
      characterId:Number.isSafeInteger(target.characterId) && DATA.roster.some(c => c.kind === 'member' && c.characterId === target.characterId) ? target.characterId : 0};
  } catch (_) { /* Invalid target preferences do not discard valid awakening settings. */ }
}
function saveOwnedAwakenings() {
  try {
    localStorage.setItem(OWN_COOKIE + 'awakenings_' + ownedCookiePath(), JSON.stringify([...ownState.awakenings]));
    localStorage.setItem(OWN_COOKIE + 'bonus_target_' + ownedCookiePath(), JSON.stringify(ownState.bonusTarget));
    ownState.awakeningStorage = '開花設定はこのブラウザに保存済みです。';
  } catch (_) { ownState.awakeningStorage = '開花設定を保存できませんでした。現在の設定は再読み込みで失われます。'; }
}
function setOwnedAwakening(id, value) {
  const card = DATA.roster.find(card => card.kind === 'center_memoria' && card.id === id);
  if (!card || !ownIsReleased(card.startAt) || !ownState.keys.has(card.ownershipKey) ||
      !Number.isSafeInteger(value) || value < 0 || value > card.maxAwakening) return false;
  if (value) ownState.awakenings.set(id, value); else ownState.awakenings.delete(id);
  saveOwnedAwakenings();
  return true;
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
        writeOwnedCookie(name, value);
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
    addOwnedPassiveEffects(rows, unsupported, item, item.passives);
  }
  return {rows: [...rows.values()], unlocked, unsupported};
}
function addOwnedPassiveEffects(rows, unsupported, item, passives) {
  // Deduplicate repeated source rows within each passive, never across cards/synchros.
  for (const passive of passives || []) for (const effect of uniqueEffects(passive.effects || [])) {
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
function maxAwakeningOwnership(card, owned, awakenings, now = Date.now()) {
  const maximum = card.maxAwakening;
  const awakening = awakenings.get(card.id) || 0;
  const supported = card.kind === 'center_memoria' && Number.isSafeInteger(maximum) && maximum > 0;
  // MemoriaMemoria.IsMaxAwakening (RVA 0x30A07BC) compares awakening_count
  // with MemoriaData.MaxAwakening; it never reads the card level.
  const unlocked = supported && ownIsReleased(card.startAt, now) && owned.has(card.ownershipKey) &&
    Number.isSafeInteger(awakening) && awakening >= maximum && (card.maxAwakeningBonuses || []).length > 0;
  return {unlocked, supported, awakening, maximum};
}
function ownBonusEffectApplies(effect, target) {
  const scope = effect.scope;
  if (!scope || !['center','non_center'].includes(target.role)) return false;
  if (scope.kind === 'all') return true;
  if (scope.kind === 'center') return target.role === 'center';
  if (scope.kind !== 'non_center' || target.role !== 'non_center') return false;
  const selected = DATA.roster.find(c => c.kind === 'member' && c.characterId === target.characterId && ownIsReleased(c.startAt));
  if (scope.characterIds && (!selected || !scope.characterIds.includes(selected.characterId))) return false;
  if (scope.generation && (!selected || scope.generation !== selected.generation)) return false;
  return true;
}
function maxAwakeningTotals(cards, owned, awakenings, now = Date.now(), target = ownState.bonusTarget) {
  const rows = new Map(), unlocked = [], unsupported = [];
  for (const card of cards) {
    if (!maxAwakeningOwnership(card, owned, awakenings, now).unlocked) continue;
    unlocked.push(card);
    for (const bonus of card.maxAwakeningBonuses) {
      if (!bonus.calculationSupported) {unsupported.push({item:card, effect:bonus});continue;}
      // Each description clause is a separate targeted effect. Do not merge
      // the center/non-center values or deduplicate across different clauses.
      for (const effect of bonus.calculationEffects || []) if (ownBonusEffectApplies(effect,target)) {
        addOwnedPassiveEffects(rows, unsupported, card, [{effects:[effect]}]);
      }
    }
  }
  return {rows: [...rows.values()], unlocked, unsupported};
}
function mergeOwnedTotals(...totals) {
  const rows = new Map();
  for (const total of totals) for (const row of total.rows) {
    if (!rows.has(row.key)) rows.set(row.key, {...row, add:0, ratio:0, by_level:0});
    for (const mode of ['add','ratio','by_level']) rows.get(row.key)[mode] += row[mode];
  }
  return {rows:[...rows.values()], unsupported:totals.flatMap(total => total.unsupported)};
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
  if (sort === 'original') return [...filtered];
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
function setOwnedCenterSort(sort) {
  const saved = ownState.viewPrefs.center_memoria ||= {filter:'all',sort:'original',ascending:false,filters:{}};
  saved.sort = sort === 'rarity' ? 'roster' : sort;
  saved.ascending = false;
  if (ownState.kind === 'center_memoria') {
    ownState.sort = saved.sort;
    ownState.ascending = saved.ascending;
    ownState.page = 0;
  }
}
function setOwnedKind(kind) {
  ownState.viewPrefs[ownState.kind] = {filter:ownState.filter,sort:ownState.sort,ascending:ownState.ascending,filters:ownState.filters};
  ownState.kind = kind;
  const saved = ownState.viewPrefs[kind] || {filter:'all',sort:kind === 'center_memoria' ? 'original' : 'roster',ascending:false,filters:{}};
  ownState.filter=saved.filter; ownState.sort=saved.sort; ownState.ascending=saved.ascending; ownState.filters=saved.filters;
  ownState.page=0;
}
function setOwnedView(view) {
  if (ownState.view === view || !['roster','bonus'].includes(view)) return;
  if (view === 'bonus') { ownState.rosterKind=ownState.kind; setOwnedKind('center_memoria'); }
  else setOwnedKind(ownState.rosterKind);
  ownState.view=view;
  renderOwnedSynchro();
}
function ownRosterCardHtml(c) {
  return `<button type="button" class="own-card ${ownState.keys.has(c.ownershipKey) ? 'is-owned' : ''}" data-own-key="${escapeHtml(c.ownershipKey)}" data-rarity="${escapeHtml(c.rarity || '')}" aria-pressed="${ownState.keys.has(c.ownershipKey)}" title="${escapeHtml(c.rarity || '')} · ${escapeHtml(c.displayName)}" aria-label="${escapeHtml(c.rarity || '')} ${escapeHtml(c.displayName)} ${ownState.keys.has(c.ownershipKey) ? '所持' : '未所持'}"><span class="own-picture">${ownState.keys.has(c.ownershipKey) ? '<span class="own-badge" aria-hidden="true">✓</span>' : ''}${c.image ? img(c.image, c.displayName, 'own-card-image') : '<span class="own-no-image">画像なし</span>'}${['N','R','SR','SSR','UR','LR'].includes(c.rarity) ? img('assets/game_ui/member_facelist_rarity_' + c.rarity.toLowerCase() + '.png', '', 'own-rarity') : ''}</span><span class="own-caption">${escapeHtml(c.displayName)}</span></button>`;
}
function ownBonusCardHtml(card) {
  const state = maxAwakeningOwnership(card, ownState.keys, ownState.awakenings);
  const owned = ownState.keys.has(card.ownershipKey);
  const options = state.supported ? Array.from({length:state.maximum+1}, (_,i) => [String(i),`Lv${i}${i === state.maximum ? '（最大）' : ''}`]) : [];
  return `<article class="own-bonus-entry ${state.unlocked ? 'bonus-active' : ''}">
    <div class="own-bonus-face">${ownRosterCardHtml(card)}<strong>${escapeHtml(card.displayName)}</strong></div>
    <label>開花 <select data-own-awakening="${card.id}" aria-label="${escapeHtml(card.displayName)} 開花" ${!owned || !state.supported ? 'disabled' : ''}>${ownOptions(options,String(state.awakening))}</select></label>
    <span class="own-bonus-status">${state.unlocked ? '✓ 最大開花' : !owned ? 'カードを押して所持登録' : !state.supported ? '開花上限を確認できません' : !(card.maxAwakeningBonuses || []).length ? '最大強化ボーナスなし' : `最大開花 Lv${state.maximum} で反映`}</span>
    <div class="own-bonus-effects">${(card.maxAwakeningBonuses || []).map(b => `<p>${escapeHtml(b.text)}</p>`).join('')}</div>
  </article>`;
}
function ownMaximumTotals(now = Date.now()) {
  const cards = DATA.roster.filter(card => ownIsReleased(card.startAt, now));
  const owned = new Set(cards.map(card => card.ownershipKey));
  const awakenings = new Map(cards.filter(card => card.kind === 'center_memoria').map(card => [card.id, card.maxAwakening]));
  return mergeOwnedTotals(
    synchroTotals(DATA.synchro.filter(item => ownRecordIsReleased(item, now)), owned),
    maxAwakeningTotals(cards, owned, awakenings, now, ownState.bonusTarget));
}
function ownTotalsTable(rows, maximumRows) {
  const valueText = (row, value) => (value >= 0 ? '+' : '') + ownNumber(value * (OWN_PERCENT.has(row.key) ? 100 : 1)) + (OWN_PERCENT.has(row.key) ? '％' : '');
  const current = new Map(rows.map(row => [row.key, row]));
  const maximum = new Map((maximumRows || []).map(row => [row.key, row]));
  const abilities = new Map([...maximum, ...current]);
  const cells = (row, attribute) => ['ratio','add','by_level'].map(mode => {
    const value = row[mode];
    const text = !value ? '—' : mode === 'ratio' ? `${ownNumber(value*100)}％` : valueText(row, value * (mode === 'by_level' ? ownState.rank : 1));
    return `<td ${attribute}="${mode}"${mode === 'by_level' && value ? ` title="C.Rank×${ownNumber(value)}"` : ''}>${text}</td>`;
  }).join('');
  const effects = [...abilities.values()].filter(row => [current.get(row.key), maximum.get(row.key)].some(value => value && (value.ratio || value.add || value.by_level))).map(row => {
    const empty = {key:row.key, ratio:0, add:0, by_level:0};
    return `<tr data-own-parameter="${escapeHtml(row.key)}"><th scope="row">${escapeHtml(row.name)}</th>${cells(current.get(row.key) || empty, 'data-own-effect')}${maximumRows ? cells(maximum.get(row.key) || empty, 'data-own-max-effect') : ''}</tr>`;
  });
  const headings = `<th>割合</th><th>固定増加</th><th>C.Rank ${ownState.rank} 増加</th>`;
  const header = maximumRows
    ? `<tr><th rowspan="2" scope="col">能力</th><th colspan="3" scope="colgroup">所持分の合計</th><th colspan="3" scope="colgroup" class="own-maximum-heading">最大値（全所持・最大開花）</th></tr><tr>${headings}${headings}</tr>`
    : `<tr><th>能力</th>${headings}</tr>`;
  return `<div class="table-wrap"><table${maximumRows ? ' class="own-comparison-table"' : ''}><thead>${header}</thead><tbody>${effects.join('') || `<tr><td colspan="${maximumRows ? 7 : 4}">計算対象の効果はありません</td></tr>`}</tbody></table></div>`;
}
function fitOwnedTotalsTable() {
  for (const table of document.querySelectorAll('.own-totals table')) {
    let columnWidth = 0;
    for (const cell of table.querySelectorAll('th,td')) {
      const range = document.createRange();
      range.selectNodeContents(cell);
      const style = getComputedStyle(cell);
      const width = range.getBoundingClientRect().width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 1;
      columnWidth = Math.max(columnWidth, Math.ceil(width / cell.colSpan));
    }
    const columns = table.classList.contains('own-comparison-table') ? 7 : 4;
    const tableWidth = columnWidth * columns;
    table.style.width = table.style.minWidth = `${tableWidth}px`;
    // Reserve the scrollbar and borders outside the table columns.
    const frame = table.parentElement;
    const frameWidth = frame.offsetWidth - frame.clientWidth;
    frame.style.width = `${tableWidth + frameWidth + 1}px`;
  }
}
addEventListener('resize', fitOwnedTotalsTable);
function renderOwnedSynchro() {
  loadOwned();
  const releasedSynchro = DATA.synchro.filter(item => ownRecordIsReleased(item));
  const totals = synchroTotals(releasedSynchro, ownState.keys);
  const bonuses = maxAwakeningTotals(DATA.roster, ownState.keys, ownState.awakenings);
  const combined = mergeOwnedTotals(totals, bonuses);
  const maximum = ownMaximumTotals();
  const bonusView = ownState.view === 'bonus';
  const roster = ownFilteredRoster();
  const pageSize = bonusView ? 24 : 240;
  const rosterPages = !['newest','oldest'].includes(ownState.sort)
    ? Array.from({length:Math.max(1,Math.ceil(roster.length/pageSize))},(_,i)=>roster.slice(i*pageSize,(i+1)*pageSize))
    : ownRosterPages(roster,pageSize);
  const pages = rosterPages.length;
  ownState.page = Math.min(ownState.page, pages-1);
  const memberCards = new Map();
  for (const card of DATA.roster) if (card.kind === 'member' && ownIsReleased(card.startAt) && !memberCards.has(String(card.characterId))) memberCards.set(String(card.characterId),card);
  const characterIds = new Set(DATA.roster.filter(c => c.kind === ownState.kind && ownIsReleased(c.startAt)).flatMap(c => c.kind === 'member' ? [c.characterId] : (c.characterIds || [])));
  const bonusTargetCharacters = [...memberCards.values()].sort((a,b) => ownPhonetic(a).localeCompare(ownPhonetic(b),'ja') || a.characterId-b.characterId).map(card => [String(card.characterId),card.characterName]);
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
    : ownState.sort === 'original'
      ? 'センターノギメモ一覧と同じ標準順。'
      : dateOrder
      ? '開始日を基準に並べ、日付未設定は末尾です（サイト追加の並び順）。'
      : ownState.sort === 'memoria_score'
        ? 'スコア順 → レアリティ高い順 → カード順。スコアは所持カードのゲーム表示値を入力してください。未入力は 0 として扱います。'
      : ownState.sort === 'memoria_type'
        ? 'Type順 → レアリティ高い順 → カード順。昇順／降順は Type にだけ適用します。'
        : 'レアリティ順 → Type の小さい順 → カード順。昇順／降順はレアリティにだけ適用します。';
  $('detail').innerHTML = `<h2>シンクロ計算 · ${bonusView ? '最大強化ボーナス' : '所持名簿'}</h2>
    <nav class="own-view-tabs" aria-label="計算設定"><button type="button" id="own-view-roster" aria-pressed="${!bonusView}">所持名簿</button><button type="button" id="own-view-bonus" aria-pressed="${bonusView}">最大強化ボーナス · 開花設定</button></nav>
    <p>${bonusView ? 'センターノギメモを所持登録して、開花 Lv を設定してください。各カードの最大開花に達すると、最大強化ボーナスをシンクロと合算します。初期値は Lv0 です。シンクロプレートで条件を補っただけのカードは、開花 Lv0 のままにしてください。' : 'カードを押して ✓ を付けます。実際に所持しているカードも、シンクロプレートで条件を補ったカードも、ここで同じようにチェックしてください。同じシリーズの下位レアリティも点灯します（LR → UR → SSR → SR → R → N）。もう一度押すと、そのカードだけ解除します。'}</p>
    <p id="own-storage" class="source">${escapeHtml(ownState.storage)}</p>
    ${bonusView ? `<p id="own-awakening-storage" class="source">${escapeHtml(ownState.awakeningStorage)}</p>` : ''}
    <div class="own-summary"><strong>チェック済 ${availableCards.filter(c => ownState.keys.has(c.ownershipKey)).length} / ${availableCards.length}</strong><strong>シンクロ ${totals.unlocked.length} / ${releasedSynchro.length}</strong><strong>最大強化ボーナス ${bonuses.unlocked.length}枚</strong><button id="own-jump">シンクロ別の効果 ↓</button></div>
    <div class="own-controls">
      <label>種類 <select id="own-kind" ${bonusView ? 'disabled' : ''}>${ownOptions([['member','メンバー'],['center_memoria','センターノギメモ']],ownState.kind)}</select></label>
      <label>表示 <select id="own-filter">${ownOptions([['all','すべて'],['owned','所持'],['missing','未所持']],ownState.filter)}</select></label>
      <label>並び順 <span class="own-sort-row"><select id="own-sort">${ownOptions(ownState.kind === 'member' ? [['roster','レアリティ順'],['generation','期別順'],['phonetic','五十音順'],['newest','開始日：新しい順（追加）'],['oldest','開始日：古い順（追加）']] : [['original','標準順'],['roster','レアリティ順'],['memoria_score','スコア順'],['memoria_type','Type順'],['newest','開始日：新しい順（追加）'],['oldest','開始日：古い順（追加）']],ownState.sort)}</select>${dateOrder || ownState.sort === 'original' ? '' : `<button type="button" id="own-direction" aria-label="${ownState.ascending ? '昇順' : '降順'}。押すと逆順" title="並び順を反転">${ownState.ascending ? '昇順 ↑' : '降順 ↓'}</button>`}</span></label>
    </div>${ownFilterPanel(characters)}<p class="source">${roster.length}枚 · ${orderDescription}</p>
    ${ownState.kind === 'center_memoria' && ownState.sort === 'memoria_score' ? `<div class="own-score-editor"><strong>所持スコア入力</strong>${scoreCards.length ? `<label>カード <select id="own-score-card">${ownOptions(scoreCards.map(card => [String(card.id),card.displayName]),String(ownState.scoreCardId))}</select></label><label>ゲーム表示スコア <input id="own-score-value" type="number" min="0" step="any" value="${ownState.scores.get(ownState.scoreCardId) || ''}" placeholder="0"></label>` : '<span>先にセンターノギメモを所持登録してください。</span>'}<small>入力したスコアはこのブラウザに保存します。</small></div>` : ''}
    ${ownPager('own-roster',ownState.page,pages)}
    <div class="${bonusView ? 'own-bonus-roster' : 'own-roster'}">${rosterPages[ownState.page].map(c => bonusView ? ownBonusCardHtml(c) : ownRosterCardHtml(c)).join('') || `<p>該当する${ownState.kind === 'member' ? 'メンバー' : 'センターノギメモ'}はありません</p>`}</div>
    <section class="card own-totals"><h3>能力値合計（シンクロ＋最大強化ボーナス）</h3>
      <label>C.Rank <input id="own-rank" type="number" min="1" step="1" value="${ownState.rank}"></label>
      <div class="own-bonus-target"><label>効果を受けるメンバー <select id="own-bonus-role">${ownOptions([['center','センター'],['non_center','センター以外']],ownState.bonusTarget.role)}</select></label>${ownState.bonusTarget.role === 'non_center' ? `<label>メンバー <select id="own-bonus-character">${ownOptions([['0','指定なし（全員対象のみ）'],...bonusTargetCharacters],String(ownState.bonusTarget.characterId))}</select></label>` : ''}</div>
      <p class="source">名簿のチェックで条件を満たしたシンクロと、開花設定で最大開花に達したセンターノギメモのボーナスを合計します。センター／センター以外を選び、特定メンバー・期生限定の効果は選んだメンバーにだけ反映します。C.Rank は効果を受けるメンバーの値です。同じ能力は1行にまとめ、割合・固定・C.Rank の増加分を別の列に表示します。カード本体の能力値は含みません。</p>
      <p class="source">左は所持チェックと開花設定に基づく合計です。右の最大値は、現在公開中のすべてのシンクロと、すべてのセンターノギメモの最大開花ボーナスの合計です。所持チェック・開花設定に関係なく表示します。C.Rank・対象メンバーは左右共通です。</p>
      ${ownTotalsTable(combined.rows, maximum.rows)}
      ${combined.unsupported.length ? `<p>個別確認が必要な効果：${combined.unsupported.length}件（合計から除外）</p>` : ''}
      ${maximum.unsupported.length ? `<p>最大値で個別確認が必要な効果：${maximum.unsupported.length}件（合計から除外）</p>` : ''}
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
  fitOwnedTotalsTable();
  scheduleImagePrefetch(rosterPages[ownState.page].map(c => c.image), (rosterPages[ownState.page + 1] || []).map(c => c.image));
  $('own-view-roster').onclick = () => setOwnedView('roster');
  $('own-view-bonus').onclick = () => setOwnedView('bonus');
  $('own-bonus-role').onchange = event => {ownState.bonusTarget.role=event.target.value; saveOwnedAwakenings(); renderOwnedSynchro();};
  if (ownState.bonusTarget.role === 'non_center') $('own-bonus-character').onchange = event => {ownState.bonusTarget.characterId=Number(event.target.value); saveOwnedAwakenings(); renderOwnedSynchro();};
  for (const field of ['kind','filter','sort']) $('own-'+field).onchange = event => {
    if (field === 'kind') {
      if (bonusView) return;
      setOwnedKind(event.target.value);
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
  document.querySelectorAll('[data-own-awakening]').forEach(select => select.onchange = event => {
    const id=Number(event.target.dataset.ownAwakening), value=Number(event.target.value);
    const scroll=$('detail').scrollTop;
    setOwnedAwakening(id,value); renderOwnedSynchro(); $('detail').scrollTop=scroll;
    const replacement=[...document.querySelectorAll('[data-own-awakening]')].find(el => Number(el.dataset.ownAwakening) === id);
    if (replacement) replacement.focus({preventScroll:true});
  });
  $('own-rank').onchange = event => { const rank=Number(event.target.value); if (!Number.isSafeInteger(rank) || rank<1) {event.target.value=ownState.rank; return;} ownState.rank=rank; saveOwned(); renderOwnedSynchro(); };
  $('own-result-filter').onchange = event => {ownState.result=event.target.value; ownState.resultPage=0; renderOwnedSynchro();};
  for (const [prefix,field,count] of [['own-roster','page',pages],['own-result','resultPage',resultPages]]) {
    $(prefix+'-prev').onclick=()=>{ownState[field]=Math.max(0,ownState[field]-1); renderOwnedSynchro();};
    $(prefix+'-next').onclick=()=>{ownState[field]=Math.min(count-1,ownState[field]+1); renderOwnedSynchro();};
  }
}
