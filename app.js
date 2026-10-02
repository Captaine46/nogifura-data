const DATA = window.VISUAL_DATA;
const TAB_KEYS = {member: 'cards', center_memoria: 'centerMemoria', member_memoria: 'memberMemoria', series_coord: 'seriesCoordinates', synchro: 'synchro', synchro_calc: 'synchro', rank_exp: 'rankExp'};
const TAB_LABELS = {member: 'メンバー', center_memoria: 'センターノギメモ', member_memoria: 'メンバーノギメモ', series_coord: 'シリーズコーデ', synchro: 'シンクロ', synchro_calc: 'シンクロ計算', rank_exp: 'Rank EXP'};
const SEARCH_HINTS = {
  member: 'メンバー名、スキル、ステータスを検索...',
  center_memoria: 'メンバー名、センターノギメモ名、スキルを検索...',
  member_memoria: 'メンバー名、メンバーノギメモ名、効果を検索...',
  series_coord: 'メンバー名、シリーズコーデ名を検索...',
  synchro: 'シンクロ名、効果、共鳴条件を検索...',
  synchro_calc: 'メンバー名、ノギメモ名、スキルを検索...',
  rank_exp: 'Rank EXPを検索...'
};
let tab = TAB_KEYS[location.hash.slice(1)] ? location.hash.slice(1) : 'member';
function updateSearchLabels() {
  $('search').placeholder = SEARCH_HINTS[tab];
  $('search').ariaLabel = `${TAB_LABELS[tab]}${tab === 'synchro_calc' ? 'の名簿' : ''}を検索`;
}
let selectedId = null;
let selectedMember = '';
let selectedRarity = '';
let libraryFilters = {};
let libraryDraft = {};
let librarySort = 'original';
const libraryViewPrefs = {};
function isLibraryTab() { return ['member','center_memoria','member_memoria'].includes(tab); }
function libraryView() {
  if (tab === 'member') return {filters: libraryFilters, member: selectedMember, rarity: selectedRarity, sort: librarySort};
  return libraryViewPrefs[tab] ||= {filters: {}, member: '', rarity: '', sort: 'original'};
}
function setLibraryView(values) {
  if (tab !== 'member') { Object.assign(libraryView(), values); return; }
  if ('filters' in values) libraryFilters = values.filters;
  if ('member' in values) selectedMember = values.member;
  if ('rarity' in values) selectedRarity = values.rarity;
  if ('sort' in values) librarySort = values.sort;
}
let libraryRosterSource = null;
let libraryRosterMap = new Map();
function libraryRecord(card) {
  if (libraryRosterSource !== DATA.roster) {
    libraryRosterSource = DATA.roster;
    libraryRosterMap = new Map((DATA.roster || []).map(x => [x.kind + ':' + x.id, x]));
  }
  return libraryRosterMap.get(card.kind + ':' + card.id) || card;
}
function libraryMatchesFilters(card, filters) {
  if (!ownMatchesFilters(libraryRecord(card), filters)) return false;
  const bonuses = filters.bonus;
  return card.kind !== 'member_memoria' || !bonuses?.size || (card.bonusTypes || []).some(id => bonuses.has(String(id)));
}
function cloneLibraryFilters(filters) {
  return Object.fromEntries(Object.entries(filters).map(([key, values]) => [key, new Set(values)]));
}
function libraryFilterCount(filters) {
  return Object.values(filters).reduce((sum, values) => sum + values.size, 0);
}
function libraryMemberChoices() {
  const members = new Map();
  const names = new Map((DATA.libraryMembers || []).map(x => [String(x.id), x.name]));
  for (const card of currentItems()) {
    if (tab === 'member') members.set(String(card.characterId), card.characterName);
    else for (const id of card.characterIds || []) {
      const name = names.get(String(id));
      if (name) members.set(String(id), name);
    }
  }
  return [...members].sort((a,b) => a[1].localeCompare(b[1], 'ja'));
}
function libraryChoices() {
  const rarities = new Set(currentItems().map(card => card.rarity));
  return [
    ['rarity', 'レアリティ', (tab === 'member' ? ['LR','UR','SSR','SR','R','N'] : ['SSR','SR','R']).filter(x => rarities.has(x)).map(x => [x,x])],
    ...(tab === 'member_memoria' ? [['bonus', '強化ボーナス', (DATA.libraryMemoriaBonuses || []).map(x => [String(x.id), x.name])]] :
      [['type', 'タイプ', tab === 'center_memoria' ? OWN_MEMORIA_TYPES.map(([id,name]) => [String(id),name]) : Object.entries(UNIT_TYPE)]]),
    ['member', 'メンバー', libraryMemberChoices()],
    ...(tab === 'member' ? OWN_EFFECT_CATEGORIES.map(([id, name]) => ['effect_' + id, name,
      (DATA.libraryFilters || []).filter(x => x.category === id && ownIsReleased(x.startAt)).map(x => [String(x.id), x.name])]) : [])
  ];
}
function renderLibraryDraft() {
  $('library-filter-body').innerHTML = libraryChoices().map(([group, name, options]) => {
    const selected = libraryDraft[group] || new Set();
    const choices = `<fieldset class="library-choice-group"><legend>${escapeHtml(name)}</legend>${group === 'member' ? '<input id="library-member-search" class="member-find" placeholder="人名で探す" aria-label="フィルター内のメンバーを検索">' : ''}<div class="library-choices">${options.map(([value,label]) => `<label data-library-label="${escapeHtml(label)}"><input type="checkbox" data-library-group="${group}" value="${escapeHtml(value)}" ${selected.has(String(value)) ? 'checked' : ''}><span>${escapeHtml(label)}</span></label>`).join('')}</div></fieldset>`;
    return group.startsWith('effect_') ? `<details class="library-effect" ${selected.size ? 'open' : ''}><summary>${escapeHtml(name)}<span>${selected.size ? selected.size + '件選択' : options.length + '項目'}</span></summary>${choices}</details>` : choices;
  }).join('');
  document.querySelectorAll('[data-library-group]').forEach(input => input.addEventListener('change', () => {
    const values = libraryDraft[input.dataset.libraryGroup] ||= new Set();
    if (input.checked) values.add(input.value); else values.delete(input.value);
    updateLibraryPreview();
  }));
  $('library-member-search').addEventListener('input', event => {
    const query = normalizeSearchText(event.target.value).replaceAll(' ', '');
    document.querySelectorAll('[data-library-group="member"]').forEach(input => {
      const label = input.closest('label');
      label.hidden = !normalizeSearchText(label.dataset.libraryLabel).replaceAll(' ', '').includes(query);
    });
  });
  updateLibraryPreview();
}
function updateLibraryPreview() {
  $('library-preview-count').textContent = `${filteredItems(libraryDraft, true).length}件の${TAB_LABELS[tab]}`;
}
function openLibraryFilters() {
  const view = libraryView();
  libraryDraft = cloneLibraryFilters(view.filters);
  if (view.member) {
    const member = libraryMemberChoices().find(([, name]) => name === view.member);
    if (member) libraryDraft.member = new Set([member[0]]);
  }
  if (view.rarity) libraryDraft.rarity = new Set([view.rarity]);
  renderLibraryDraft();
  $('library-filter-dialog').showModal();
}
function commitLibraryFilters() {
  setLibraryView({filters: cloneLibraryFilters(libraryDraft), member: '', rarity: ''});
  selectedId = null;
  render();
  $('list').scrollTop = 0;
  $('detail').scrollTop = 0;
  $('library-filter-dialog').close();
}

let synchroPage = 0;
const pendingLoads = {};
const pendingDetails = {};
let detailRenderVersion = 0;
function loadItemDetail(key, item) {
  if (item.detailPart === undefined) return Promise.resolve(item);
  const detailsKey = key + 'Details';
  const cached = window.VISUAL_PARTS[detailsKey]?.[item.detailPart]?.[0];
  if (cached) return Promise.resolve(cached);
  const cacheKey = detailsKey + ':' + item.detailPart;
  if (!pendingDetails[cacheKey]) {
    pendingDetails[cacheKey] = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = window.VISUAL_MANIFEST[detailsKey][item.detailPart];
      script.onload = () => {
        const detail = window.VISUAL_PARTS[detailsKey]?.[item.detailPart]?.[0];
        script.remove();
        if (detail && detail.id === item.id) resolve(detail);
        else { script.remove(); reject(new Error(script.src)); }
      };
      script.onerror = () => { script.remove(); reject(new Error(script.src)); };
      document.head.appendChild(script);
    }).then(detail => { delete pendingDetails[cacheKey]; return detail; }, error => { delete pendingDetails[cacheKey]; throw error; });
  }
  return pendingDetails[cacheKey];
}
function loadCategory(key) {
  if (!pendingLoads[key]) pendingLoads[key] = Promise.all(window.VISUAL_MANIFEST[key].map(src => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => { script.remove(); reject(new Error(src)); };
    document.head.appendChild(script);
  }))).then(() => { DATA[key] = window.VISUAL_PARTS[key].flat(); }).catch(error => {
    delete pendingLoads[key];
    throw error;
  });
  return pendingLoads[key];
}
let renderVersion = 0;
async function showCategory() {
  updateSearchLabels();
  ++detailRenderVersion;
  closeMobileDetail(false);
  const version = ++renderVersion;
  $('library-filter-dialog').close();
  $('member-controls').hidden = !isLibraryTab();
  $('series-controls').hidden = tab !== 'series_coord';
  document.querySelectorAll('button[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('count').textContent = '読み込み中…';
  $('list').innerHTML = '';
  $('detail').textContent = '読み込み中…';
  try {
    await loadCategory(TAB_KEYS[tab]);
    if (tab === 'synchro_calc' || tab === 'member') await loadCategory('roster');
    if (version === renderVersion) render();
  } catch (error) {
    if (version !== renderVersion) return;
    $('count').textContent = 'データの読み込みに失敗しました';
    $('detail').innerHTML = '<p>データファイルを確認してください。</p><button id="retry-load">再試行</button>';
    $('retry-load').onclick = showCategory;
    openMobileDetail();
  }
}

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const deferImages = window.VisualImages.deferred;
const img = (src, alt='', cls='thumb') => {
  if (!src) return '';
  const url = window.VisualImages.source(src, cls);
  const cached = window.VisualImages.ready.has(url);
  return `<img class="${escapeHtml(cls)}" loading="${cached ? 'eager' : 'lazy'}" decoding="async" ${deferImages && !cached ? 'data-src' : 'src'}="${escapeHtml(url)}" alt="${escapeHtml(alt)}">`;
};
const scheduleImagePrefetch = (current, next=[]) => window.VisualImages.prefetch(current, next);
function setupLazyImages() {
  window.VisualImages.setup();
}
const skillIconSrc = (skill) => {
  return skill?.image || '';
};
const skillIcon = (skill, cls='skill-icon') => {
  const src = skillIconSrc(skill);
  const alt = skill?.name || skill?.Name || 'skill';
  return img(src, alt, cls);
};
const chip = (s) => s ? `<span class="chip">${escapeHtml(s)}</span>` : '';
const UNIT_TYPE = Object.fromEntries(OWN_MEMBER_TYPES);
const PARAM_BY_ID = {
  1:'エフォート', 2:'サンクス', 3:'スマイル', 4:'バイタリティ', 5:'HP上限', 6:'SP上限',
  7:'アピール力', 8:'最小アピール', 9:'最大アピール', 10:'ディフェンス',
  11:'フィジカル', 12:'メンタル', 13:'表現力',
  14:'演技力', 15:'歌唱力', 16:'命中値',
  17:'回避値', 18:'会心値', 19:'会心回避', 20:'HP吸収',
  21:'リフレクト', 22:'自動HP回復', 23:'会心アピール',
  24:'フィジカル会心アピール', 25:'メンタル会心アピール',
  26:'状態異常耐性', 27:'会心アピール耐性', 28:'リフレクト耐性'
};
const cleanName = (s) => String(s || '').replaceAll('_', ' ');
const paramName = (v) => PARAM_BY_ID[Number(v)] || `パラメータ ${v}`;
function prettyFormulaText(text) {
  const s = String(text ?? '');
  if (/^-?0?\.\d+$/.test(s)) return `効果値 ${Math.round(Number(s) * 10000) / 100}%`;
  return s;
}
const percentValue = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function listSubtitle(x) {
  if (tab === 'series_coord') return [x.rarity, `Rank${x.maxRank}`, `${x.partCount ?? x.parts.length}種`].join(' / ');
  if (tab === 'member') return [x.characterName, x.rarity, UNIT_TYPE[x.unitType]].filter(Boolean).join(' / ');
  if (tab === 'center_memoria') return [x.rarity, x.shortName].filter(Boolean).join(' / ');
  if (tab === 'member_memoria') return [x.rarity, 'メンバーノギメモ'].filter(Boolean).join(' / ');
  if (tab === 'synchro') return [`共鳴条件 ${(x.conditions || []).length}`, x.effectText].filter(Boolean).join(' / ');
  return '';
}

function readableEffect(e) {
  if (e.formulaText) return prettyFormulaText(e.formulaText);
  const name = e.EffectTypeName || '';
  const p1 = e.EffectTypeParam1;
  if (name === 'nothing') return '条件分岐';
  if (name === 'normal_damage') return `${p1}% アピール`;
  if (name === 'normal_damage_by_variable') return '算出済みの倍率でアピール';
  if (name === 'normal_and_ignore_defense_damage') return 'スキル説明の倍率と固定値で耐性無視アピール';
  if (name === 'add_state' && e.state) return `付与「${e.state.name}」：${e.state.text}`;
  if (name === 'add_state') return '状態効果を付与';
  if (name === 'add_state_by_assigned_variable' && e.state) return `計算済み条件で付与「${e.state.name}」：${e.state.text}`;
  if (name === 'add_state_by_assigned_variable') return '条件達成時に状態効果を付与';
  if (name === 'add_state_effect_in_skill_to_used_unit') return `スキル中に自身へ一時効果を付与：${cleanName(e.EffectTypeParam1Name || e.EffectTypeParam1)}`;
  if (name === 'add_state_effect_in_skill_to_target_unit') return `スキル中に対象へ一時効果を付与：${cleanName(e.EffectTypeParam1Name || e.EffectTypeParam1)}`;
  if (name === 'detach_state_effect_in_skill_to_used_unit') return `自身の一時効果を解除：${cleanName(e.EffectTypeParam1Name || e.EffectTypeParam1)}`;
  if (name === 'detach_state_effect_in_skill_to_target_unit') return `対象の一時効果を解除：${cleanName(e.EffectTypeParam1Name || e.EffectTypeParam1)}`;
  if (name === 'recover_hp_by_variable_not_criticality') return '算出済みの値でHP回復（会心なし）';
  if (name === 'recover_hp_by_used_unit_parameter_not_criticality') return `HP回復：自身${paramName(p1)}参照`;
  if (name === 'variable_assignment_by_used_unit_attack') return '自身のアピール力を参照';
  if (name === 'variable_assignment_by_used_unit_parameter') return `自身の${paramName(p1)}を参照`;
  if (name === 'variable_assignment_by_target_unit_parameter') return `計算用：対象の${paramName(p1)}を参照`;
  if (name === 'variable_assignment_by_used_unit_hp') return `自身の残りHP×${p1}%を参照`;
  if (name === 'variable_assignment_by_target_unit_hp') return `計算用：対象の残りHP×${p1}%を参照`;
  if (name === 'variable_assignment_by_target_unit_hp_rate') return '計算用：対象の残りHP割合を参照';
  if (name === 'variable_assignment_by_used_unit_hp_rate') return '計算用：自身の残りHP割合を参照';
  if (name === 'variable_assignment_by_last_damage') return '直前のアピール値を参照';
  if (name.startsWith('variable_')) return 'スキル効果値を算出';
  return '特殊効果';
}

function stateMiniHtml(e) {
  if (!e.state) return '';
  const mods = (e.state.modifiers || []).map(m => `<span class="state-chip">${escapeHtml(m.label)} ${escapeHtml(m.operation)} ${escapeHtml(m.value)}</span>`).join('');
  const text = e.formulaText ? '' : `<div class="condition-sub">${escapeHtml(e.state.text || '')}</div>`;
  return `${text}${mods ? `<div class="state-mini">${mods}</div>` : ''}`;
}

function inferHitCount(fragment) {
  const s = String(fragment || '');
  const byHit = s.match(/(\d+)回/);
  if (byHit) return Number(byHit[1]);
  const byTarget = s.match(/ライバル(\d+)名/);
  if (byTarget) return Number(byTarget[1]);
  return 1;
}

function textAppealUnits(text) {
  const s = String(text || '');
  const out = [];
  const seen = new Set();
  const directPatterns = [
    /((?:[^。\n]*?)(\d+)回、[^。\n]*?)(\d+(?:\.\d+)?)％のアピール/g,
    /((?:[^。\n]*?)ライバル(\d+)名に[^。\n]*?)(\d+(?:\.\d+)?)％のアピール/g
  ];
  for (const pattern of directPatterns) {
    for (const match of s.matchAll(pattern)) {
      const count = Number(match[2]);
      const pct = Number(match[3]);
      const key = `${count}|${pct}|${match.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({kind: 'direct', count, pct, total: count * pct, label: `${count}hit×${percentValue(pct)}% = ${percentValue(count * pct)}%`});
    }
  }
  for (const match of s.matchAll(/合計アピールの(\d+(?:\.\d+)?)％分のアピール/g)) {
    const pct = Number(match[1]);
    const label = `追撃：合計アピール×${percentValue(pct)}%`;
    if (!seen.has(label)) { seen.add(label); out.push({kind: 'pursuit', count: 1, pct, total: 0, label}); }
  }
  for (const match of s.matchAll(/(\d+(?:\.\d+)?)％のアピール/g)) {
    const pct = Number(match[1]);
    if (out.some(x => x.pct === pct)) continue;
    const label = `${percentValue(pct)}%アピール`;
    if (!seen.has(label)) { seen.add(label); out.push({kind: 'direct', count: 1, pct, total: pct, label}); }
  }
  return out;
}

function textAppealSummaries(text) {
  return textAppealUnits(text).map(x => x.label);
}

function nearlyEqual(a, b) {
  return Math.abs(Number(a || 0) - Number(b || 0)) < 0.001;
}

function effectName(e) {
  return String(e?.EffectTypeName || '');
}

function isDirectDamageEffect(e) {
  return effectName(e) === 'normal_damage' && Number(e.EffectTypeParam1) > 0;
}

function isFixedDamageEffect(e) {
  return effectName(e) === 'normal_and_ignore_defense_damage';
}

function isVariableDamageEffect(e) {
  return ['normal_damage_by_variable', 'ignore_defense_damage_by_variable'].includes(effectName(e));
}

function countDamageGroups(effects, predicate) {
  let count = 0;
  let inGroup = false;
  for (const e of effects || []) {
    if (effectName(e) === 'nothing') {
      inGroup = false;
      continue;
    }
    if (predicate(e)) {
      if (!inGroup) {
        count += 1;
        inGroup = true;
      }
    }
  }
  return count;
}

function cleanFormulaSubject(s) {
  return String(s || '')
    .replace(/^自身の/, '自身')
    .replace(/^ライバルの/, 'ライバル')
    .replace(/^アピール対象の/, '対象')
    .replace(/^対象の/, '対象')
    .replaceAll('の', '');
}

function fixedSourceFormula(fragment, fullText) {
  const text = String(fragment || '');
  const rules = [
    [/自身の最大アピールの(\d+(?:\.\d+)?)％分/, m => `自身最大アピール×${percentValue(m[1])}%`],
    [/自身の最小アピールの(\d+(?:\.\d+)?)％分/, m => `自身最小アピール×${percentValue(m[1])}%`],
    [/自身の残りHPの?(\d+(?:\.\d+)?)％分/, m => `自身残りHP×${percentValue(m[1])}%`],
    [/自身のHP減少分の(\d+(?:\.\d+)?)％/, m => `自身HP減少分×${percentValue(m[1])}%`],
    [/ライバルのHP上限の?(\d+(?:\.\d+)?)％分/, m => `ライバルHP上限×${percentValue(m[1])}%`],
    [/対象のHP上限の?(\d+(?:\.\d+)?)％分/, m => `対象HP上限×${percentValue(m[1])}%`],
    [/アピール対象の最大アピールの?(\d+(?:\.\d+)?)％分/, m => `対象最大アピール×${percentValue(m[1])}%`],
    [/対象の最大アピールの?(\d+(?:\.\d+)?)％分/, m => `対象最大アピール×${percentValue(m[1])}%`],
    [/アピール対象のHP減少分の(\d+(?:\.\d+)?)％/, m => `対象HP減少分×${percentValue(m[1])}%`],
    [/対象のHP減少分の(\d+(?:\.\d+)?)％/, m => `対象HP減少分×${percentValue(m[1])}%`],
    [/(自身の(?:エフォート|サンクス|スマイル|バイタリティ|ディフェンス|フィジカル|メンタル|最大アピール|最小アピール))の?(\d+(?:\.\d+)?)倍/, m => `${cleanFormulaSubject(m[1])}×${percentValue(m[2])}`],
    [/(ライバルの(?:エフォート|サンクス|スマイル|バイタリティ|ディフェンス|フィジカル|メンタル|HP上限|最大アピール|最小アピール))の?(\d+(?:\.\d+)?)倍/, m => `${cleanFormulaSubject(m[1])}×${percentValue(m[2])}`],
    [/(対象の(?:エフォート|サンクス|スマイル|バイタリティ|ディフェンス|フィジカル|メンタル|HP上限|最大アピール|最小アピール))の?(\d+(?:\.\d+)?)倍/, m => `${cleanFormulaSubject(m[1])}×${percentValue(m[2])}`]
  ];
  let source = '固定値';
  for (const [re, fmt] of rules) {
    const m = text.match(re);
    if (m) {
      source = fmt(m);
      break;
    }
  }
  const cap = String(fullText || '').match(/上限は自身の最大アピールの(\d+(?:\.\d+)?)％まで/);
  if (cap) return `min(${source}, 自身最大アピール×${percentValue(cap[1])}%)`;
  return source;
}

function fixedAppealTerms(text, fixedGroups) {
  const s = String(text || '');
  const terms = [];
  for (const match of s.matchAll(/((?:[^。\n]*?)(?:(\d+)回、)?[^。\n]*?固定値[^。\n]*?)(\d+(?:\.\d+)?)％のアピール/g)) {
    const lead = match[1] || '';
    const count = match[2] ? Number(match[2]) : inferHitCount(lead);
    const pct = Number(match[3]);
    terms.push({
      count: count || null,
      pct,
      source: fixedSourceFormula(lead, s),
      text: lead
    });
  }
  if (!terms.length) return [];
  if (terms.length === 1 && !terms[0].count && fixedGroups) terms[0].count = fixedGroups;
  for (const term of terms) {
    if (!term.count) term.count = 1;
  }
  return terms;
}

function fixedValueSources(text, fallbackCount = 1) {
  const s = String(text || '');
  const sources = [];
  const seen = new Set();
  const sourcePattern = '(?:自身|対象|アピール対象|ライバル)の(?:エフォート|サンクス|スマイル|バイタリティ|ディフェンス|フィジカル|メンタル|最大アピール|最小アピール|HP上限|残りHP|HP減少分)(?:の?\\d+(?:\\.\\d+)?倍|の?\\d+(?:\\.\\d+)?％分|の\\d+(?:\\.\\d+)?％)';
  const fixedRe = new RegExp(`([^。\\n]{0,80}?${sourcePattern}[^。\\n]{0,80}?固定値[^。\\n]{0,80}?(?:上乗せ|加算|倍率))`, 'g');
  for (const match of s.matchAll(fixedRe)) {
    const fragment = match[1] || '';
    const source = fixedSourceFormula(fragment, s);
    if (source === '固定値') continue;
    const count = /各アピール/.test(fragment) ? fallbackCount : inferHitCount(fragment);
    const key = `${count}|${source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({count: count || fallbackCount || 1, source, text: fragment});
  }
  return sources;
}

function appealBoostSources(text, fallbackCount = 1) {
  const s = String(text || '');
  const sources = [];
  const seen = new Set();
  for (const match of s.matchAll(/([^。\n]*?自身のアピール力を(?:上昇|アップ)[^。\n]*)/g)) {
    const fragment = match[1] || '';
    const source = fixedSourceFormula(fragment, s);
    if (source === '固定値') continue;
    const count = /各アピール/.test(fragment) ? fallbackCount : inferHitCount(fragment);
    const key = `${count}|${source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({count: count || fallbackCount || 1, source, text: fragment});
  }
  return sources;
}

function variableStatAppealTerms(text, variableGroups) {
  const s = String(text || '');
  const terms = [];
  const seen = new Set();
  const statPattern = '(?:エフォート|サンクス|スマイル|バイタリティ|ディフェンス|フィジカル|メンタル|最大アピール|最小アピール|HP上限)';
  const patterns = [
    new RegExp(`(?:(\\d+)回、)?[^。\\n]*?((?:自身|ライバル|対象|アピール対象)の${statPattern})の?(\\d+(?:\\.\\d+)?)倍分のアピール`, 'g'),
    new RegExp(`(?:(\\d+)回、)?[^。\\n]*?((?:自身|ライバル|対象|アピール対象)の${statPattern})(\\d+(?:\\.\\d+)?)％分のアピール`, 'g')
  ];
  for (const pattern of patterns) {
    for (const match of s.matchAll(pattern)) {
      const unit = pattern === patterns[0] ? '' : '%';
      const count = match[1] ? Number(match[1]) : inferHitCount(match[0]);
      const subject = cleanFormulaSubject(match[2]);
      const value = Number(match[3]);
      const key = `${count || ''}|${subject}|${value}|${unit}`;
      if (seen.has(key)) continue;
      seen.add(key);
      terms.push({count: count || null, subject, value, unit});
    }
  }
  if (terms.length === 1 && !terms[0].count && variableGroups) terms[0].count = variableGroups;
  for (const term of terms) {
    if (!term.count) term.count = 1;
  }
  return terms;
}

function pursuitRateTerms(text) {
  const s = String(text || '');
  const terms = [];
  const patterns = [
    /合計アピール(?:の)?(\d+(?:\.\d+)?)％分のアピール/g,
    /合計値の(\d+(?:\.\d+)?)％のアピール/g
  ];
  for (const pattern of patterns) {
    for (const match of s.matchAll(pattern)) {
      terms.push({rate: Number(match[1])});
    }
  }
  return terms;
}

function maxAdditionalCount(text) {
  const nums = [...String(text || '').matchAll(/(?:追加回数は最大で|最大)(\d+)回/g)].map(m => Number(m[1])).filter(Number.isFinite);
  return nums.length ? Math.max(...nums) : 0;
}

function directDamageUnits(effects, hasDouble) {
  const rows = (effects || []).filter(isDirectDamageEffect).map(e => Number(e.EffectTypeParam1));
  const units = [];
  for (let i = 0; i < rows.length; i += 1) {
    const pct = rows[i];
    const next = rows[i + 1];
    if (hasDouble && Number.isFinite(next) && nearlyEqual(next, pct * 2)) {
      units.push({minPct: pct, maxPct: next, label: `${percentValue(pct)}% / ${percentValue(next)}%`});
      i += 1;
    } else {
      units.push({minPct: pct, maxPct: pct, label: `${percentValue(pct)}%`});
    }
  }
  return units;
}

function optionalFlowRange(units, text) {
  const s = String(text || '');
  if (!units.length) return {minUnits: [], maxUnits: [], optional: false};
  const optional = units.length > 1 && /アピール回数が1回増加|追加回数|再発動|アピール回数として/.test(s);
  return {
    minUnits: optional ? [units[0]] : units,
    maxUnits: units,
    optional
  };
}

function sumUnitPct(units, key) {
  return units.reduce((sum, x) => sum + Number(x[key] || 0), 0);
}

function skillAppealAnalysis(levelOrText) {
  const level = typeof levelOrText === 'string' ? {text: levelOrText, effects: []} : (levelOrText || {});
  const s = String(level.text || '');
  const effects = level.effects || [];
  const hasDouble = /倍率(?:と固定値倍率)?が2倍|アピール倍率[^。\n]*?2倍|固定値とアピール倍率が2倍/.test(s);
  const textUnits = textAppealUnits(s);
  const textDirectPct = textUnits.filter(x => x.kind === 'direct').reduce((sum, x) => sum + Number(x.total || 0), 0);
  const directUnits = directDamageUnits(effects, hasDouble);
  const directRange = optionalFlowRange(directUnits, s);
  const directMin = sumUnitPct(directRange.minUnits, 'minPct');
  const directMax = sumUnitPct(directRange.maxUnits, 'maxPct');
  const fixedGroups = countDamageGroups(effects, isFixedDamageEffect);
  const fixedTerms = fixedAppealTerms(s, fixedGroups);
  const fallbackHitCount = textUnits.find(x => x.kind === 'direct')?.count || fixedGroups || 1;
  const fixedTermKeys = new Set(fixedTerms.map(x => `${x.count}|${x.source}`));
  const fixedSources = fixedValueSources(s, fallbackHitCount).filter(x => !fixedTermKeys.has(`${x.count}|${x.source}`));
  const boostSources = appealBoostSources(s, fallbackHitCount);
  const fixedMin = fixedTerms.reduce((sum, x) => sum + x.count * x.pct, 0);
  const fixedMax = fixedTerms.reduce((sum, x) => sum + x.count * x.pct * (hasDouble ? 2 : 1), 0);
  const pursuitTerms = pursuitRateTerms(s);
  const variableGroups = countDamageGroups(effects, isVariableDamageEffect);
  const variableTerms = variableStatAppealTerms(s, variableGroups);
  const additional = maxAdditionalCount(s);
  let pursuitMin = 0;
  let pursuitMax = 0;
  const pursuitNotes = [];
  if (pursuitTerms.length && variableGroups) {
    const baseMin = directMin + fixedMin;
    const baseMax = directMax + fixedMax;
    const minHits = /発生した回数をアピール回数|アピール回数として/.test(s) && !/合計アピール/.test(s) ? 0 : 1;
    const maxHits = variableGroups || (minHits + additional);
    for (const term of pursuitTerms) {
      const minPart = baseMin * term.rate / 100 * minHits;
      const maxPart = baseMax * term.rate / 100 * maxHits;
      pursuitMin += minPart;
      pursuitMax += maxPart;
      pursuitNotes.push(`追撃：合計アピール×${percentValue(term.rate)}% × ${minHits}-${maxHits}hit = ${percentValue(minPart)}%-${percentValue(maxPart)}%`);
    }
  }
  const minPct = directMin + fixedMin + pursuitMin;
  const maxPct = directMax + fixedMax + pursuitMax;
  const hasEnginePct = Boolean(minPct || maxPct);
  const hasTextPct = textDirectPct > 0;
  const displayMinPct = hasEnginePct ? minPct : textDirectPct;
  const displayMaxPct = hasEnginePct ? maxPct : textDirectPct;
  const displaySource = hasEnginePct ? '合計アピール' : (hasTextPct ? 'スキル説明' : '');
  if (!hasEnginePct && !hasTextPct && !fixedTerms.length && !fixedSources.length && !boostSources.length && !variableGroups) return null;

  const parts = [];
  const textSources = textAppealSummaries(s);
  if (directUnits.length) {
    const hitLabel = directRange.optional
      ? `直接：最小${directRange.minUnits.length}回 / 最大${directRange.maxUnits.length}回`
      : `直接：${directUnits.length}回`;
    parts.push(`${hitLabel} = ${percentValue(directMin)}%-${percentValue(directMax)}%`);
  }
  if (textSources.length) parts.push(`スキル説明：${textSources.join(' / ')}`);
  for (const term of fixedTerms) {
    const baseFormula = `1hit = アピール力×${percentValue(term.pct)}% + 固定値(${term.source})`;
    parts.push(`固定値式：${term.count}hit / ${baseFormula}`);
    if (hasDouble) parts.push(`最大条件：アピール力×${percentValue(term.pct * 2)}% + 固定値(${term.source})×2`);
  }
  for (const term of variableTerms) {
    const unit = term.unit || '';
    const base = `${term.subject}×${percentValue(term.value)}${unit}`;
    const max = hasDouble ? `${term.subject}×${percentValue(term.value * 2)}${unit}` : base;
    parts.push(`変数アピール式：${term.count}hit / 1hit = ${base}${hasDouble ? ` / 最大条件 ${max}` : ''}`);
  }
  parts.push(...pursuitNotes);

  const notes = [];
  if (hasDouble) notes.push('条件達成時は該当アピール倍率（固定値倍率を含む）が2倍');
  if (directRange.optional) notes.push('追加回数・再発動を含む最大値です');
  if (fixedTerms.length) notes.push('固定値は%倍率に換算せず、アピール力×倍率に実数加算');
  const unknownVariable = variableGroups && !pursuitTerms.length && !variableTerms.length;
  if (unknownVariable) notes.push(`変数アピール ${variableGroups}列：ステータス参照型のため%合計には未加算`);
  if (variableTerms.length) notes.push('ステータス参照アピールはスキル説明の式で表示');

  return {
    source: 'skill',
    minPct,
    maxPct,
    displayMinPct,
    displayMaxPct,
    displaySource,
    hasEnginePct,
    hasTextPct,
    textUnits,
    textDirectPct,
    directUnits,
    fixedTerms,
    fixedSources,
    boostSources,
    pursuitTerms,
    variableTerms,
    variableGroups,
    unknownVariable,
    hasDouble,
    textSources,
    parts,
    notes
  };
}

function appealAnalysisHtml(level) {
  const analysis = skillAppealAnalysis(level);
  if (!analysis) return '';
  const detailRows = [
    analysis.textSources?.length ? ['スキル説明', analysis.textSources.join(' / ')] : null,
    analysis.hasEnginePct ? ['アピール倍率', `${percentValue(analysis.minPct)}%-${percentValue(analysis.maxPct)}%`] : null,
    (analysis.fixedTerms?.length || analysis.fixedSources?.length) ? ['固定値', [...(analysis.fixedTerms || []).map(x => `${x.count}hit: ${x.source}`), ...(analysis.fixedSources || []).map(x => `${x.count}hit: ${x.source}`)].join(' / ')] : null,
    analysis.boostSources?.length ? ['アピール力補正', analysis.boostSources.map(x => `${x.count}hit: ${x.source}`).join(' / ')] : null,
    analysis.variableTerms?.length ? ['ステータス参照アピール', analysis.variableTerms.map(x => `${x.count}hit: ${x.subject}×${percentValue(x.value)}${x.unit || ''}`).join(' / ')] : null,
    analysis.unknownVariable ? ['ステータス参照アピール', 'スキル説明の条件に応じて変動'] : null,
  ].filter(Boolean);
  const parts = detailRows.length ? `<div class="analysis-detail">${detailRows.map(([k, v]) => `<div class="analysis-row"><strong>${escapeHtml(k)}</strong>${escapeHtml(v)}</div>`).join('')}</div>` : '';
  const notes = analysis.notes.length ? `<div class="appeal-notes">${analysis.notes.map(escapeHtml).join(' / ')}</div>` : '';
  const formulaOnly = !analysis.displayMinPct && !analysis.displayMaxPct && analysis.variableTerms?.length;
  const range = formulaOnly
    ? `<span class="chip">ステータス参照アピール</span><span class="chip range-chip">スキル説明を参照</span>`
    : `<span class="chip">${escapeHtml(analysis.displaySource)} 最小条件 ${percentValue(analysis.displayMinPct)}%</span><span class="chip range-chip">${escapeHtml(analysis.displaySource)} 最大条件 ${percentValue(analysis.displayMaxPct)}%</span>`;
  return `<div class="appeal-range">
    ${range}
    ${parts}
    ${notes}
  </div>`;
}

function linkedSkillMiniHtml(e) {
  const skill = e.linkedSkill;
  if (!skill) return '';
  const level = (skill.levels || [])[0] || {};
  return `<div class="linked-skill">
    <div class="linked-skill-title">${escapeHtml(skill.name || 'リンクスキル')}</div>
    <div class="condition-sub">${escapeHtml(level.text || '')}</div>
    ${appealAnalysisHtml(level)}
  </div>`;
}

function effectLineHtml(e, i) {
  return `<li><span class="step">${i + 1}</span><span>${escapeHtml(readableEffect(e))}${stateMiniHtml(e)}${linkedSkillMiniHtml(e)}</span></li>`;
}

function damageSummaryHtml(level) {
  const effects = level.effects || [];
  const analysis = skillAppealAnalysis(level);
  const hasBranch = effects.some(e => e.EffectTypeName === 'nothing') || /場合|条件|応じて|確率/.test(level.text || '');
  const states = effects.filter(e => e.state).map(e => e.state.name).filter(Boolean);
  const textSummaries = textAppealSummaries(level.text);
  const chips = [];
  if (analysis?.directUnits?.length) chips.push(`<span class="chip">アピール ${analysis.directUnits.length}回</span>`);
  if (analysis?.variableTerms?.length) chips.push(`<span class="chip">ステータス参照 ${analysis.variableTerms.map(x => `${escapeHtml(x.subject)}×${percentValue(x.value)}${x.unit || ''}`).join(' / ')}</span>`);
  textSummaries.slice(0, 4).forEach(x => chips.push(`<span class="chip">スキル説明 ${escapeHtml(x)}</span>`));
  if (/倍率が2倍|倍率と固定値倍率が2倍/.test(level.text || '')) chips.push(`<span class="chip warn-chip">倍率2倍の条件あり</span>`);
  if (/固定値として上乗せ|固定値倍率/.test(level.text || '')) chips.push(`<span class="chip warn-chip">固定値上乗せあり</span>`);
  if (hasBranch) chips.push(`<span class="chip warn-chip">条件分岐あり</span>`);
  if (states.length) chips.push(`<span class="chip">付与状態 ${[...new Set(states)].map(escapeHtml).join(' / ')}</span>`);
  return `${appealAnalysisHtml(level)}${chips.length ? `<div class="summary-line">${chips.join('')}</div>` : ''}`;
}

function effectSignature(e) {
  return [e.LogicType, e.Param1, e.Param2, e.Param3, e.formulaText || ''].map(x => String(x ?? '')).join('|');
}

function uniqueEffects(effects) {
  const seen = new Set();
  return (effects || []).filter(e => {
    const key = effectSignature(e);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function currentItems() {
  const items = DATA[TAB_KEYS[tab]] || [];
  if (tab === 'rank_exp' || tab === 'series_coord') return items;
  return items.filter(item => ownRecordIsReleased(item));
}

let releaseTimer = null;
let releaseSnapshot = '';
function releaseState(now = Date.now()) {
  return ['cards','centerMemoria','memberMemoria','synchro','roster','libraryFilters']
    .map(key => (DATA[key] || []).filter(item => ownRecordIsReleased(item, now)).length).join(':');
}
function scheduleReleaseRefresh() {
  clearTimeout(releaseTimer);
  if (location.protocol === 'file:') { releaseTimer = null; return; }
  const now = Date.now();
  releaseSnapshot = releaseState(now);
  let wait = 60000;
  for (const key of ['cards','centerMemoria','memberMemoria','synchro','roster','libraryFilters']) {
    for (const item of DATA[key] || []) {
      for (const value of [item.startAt, ...(item.conditions || []).map(c => c.startAt)]) {
        const time = Date.parse(value || '');
        if (Number.isFinite(time) && time > now) wait = Math.min(wait, time - now + 20);
      }
    }
  }
  releaseTimer = setTimeout(refreshReleaseVisibility, wait);
}
function refreshReleaseVisibility() {
  if (releaseState() !== releaseSnapshot) {
    render();
    if ($('library-filter-dialog').open) renderLibraryDraft();
  }
  scheduleReleaseRefresh();
}

const SEARCH_TEXT_CACHE = new WeakMap();

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ja')
    .replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\[\]【】「」『』（）()〈〉《》・,，、。:：;；/／\\|｜&＆#＃_＿]+/g, ' ')
    .replace(/[\s　]+/g, ' ')
    .trim();
}

function searchTerms(raw) {
  return normalizeSearchText(raw).split(' ').filter(Boolean);
}

function normalizedItemSearchText(item) {
  const cached = SEARCH_TEXT_CACHE.get(item);
  if (cached !== undefined) return cached;
  const text = normalizeSearchText([
    item.displayName,
    item.name,
    item.title,
    item.characterName,
    item.shortName,
    item.rarity,
    item.search,
  ].filter(Boolean).join(' '));
  SEARCH_TEXT_CACHE.set(item, text);
  return text;
}

function renderMemberControls() {
  const controls = $('member-controls');
  controls.hidden = !isLibraryTab();
  if (!isLibraryTab()) return;
  const view = libraryView();
  const names = new Map(libraryMemberChoices());
  const counts = new Map();
  for (const card of currentItems()) {
    const ids = tab === 'member' ? [card.characterId] : card.characterIds || [];
    for (const id of ids) {
      const name = names.get(String(id));
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  $('library-member-label').textContent = tab === 'member' ? 'メンバーを選択' : '写真のメンバー';
  $('member-select').innerHTML = '<option value="">すべてのメンバー</option>' +
    [...counts].sort((a, b) => a[0].localeCompare(b[0], 'ja')).map(([name, count]) =>
      `<option value="${escapeHtml(name)}">${escapeHtml(name)} (${count})</option>`).join('');
  $('member-select').value = view.member;
  $('rarity-select').innerHTML = '<option value="">すべてのレアリティ</option>' + libraryChoices()[0][2].map(([value,label]) => `<option value="${value}">${label}</option>`).join('');
  $('rarity-select').value = view.rarity;
  const sortChoices = [['original','標準順'],['rarity','レアリティ順'],
    ...(tab === 'member' ? [['generation','期別順'],['phonetic','五十音順']] : []),
    ...(tab === 'center_memoria' ? [['memoria_type','タイプ順']] : []), ['newest','開始日：新しい順']];
  $('library-sort').innerHTML = sortChoices.map(([value,label]) => `<option value="${value}">${label}</option>`).join('');
  $('library-sort').value = view.sort;
  $('filter-badge').textContent = libraryFilterCount(view.filters) + (view.member ? 1 : 0) + (view.rarity ? 1 : 0);
  const labels = [];
  for (const [group, name, options] of libraryChoices()) {
    for (const [value, label] of options) if (view.filters[group]?.has(String(value))) labels.push(label);
  }
  $('active-library-filters').innerHTML = labels.slice(0, 3).map(label => `<span>${escapeHtml(label)}</span>`).join('') + (labels.length > 3 ? `<span>ほか${labels.length - 3}件</span>` : '');
}

function filteredItems(filters = null, draft = false) {
  const raw = $('search').value.trim();
  const terms = searchTerms(raw);
  const view = libraryView();
  filters ||= view.filters;
  const memberId = !draft && view.member ? libraryMemberChoices().find(([,name]) => name === view.member)?.[0] : null;
  let items = currentItems().filter(item => !isLibraryTab() ||
    ((draft || !view.member || (memberId && (tab === 'member' ? [item.characterId] : item.characterIds || []).some(id => String(id) === memberId))) &&
     (draft || !view.rarity || item.rarity === view.rarity) && libraryMatchesFilters(item, filters)));
  if (tab === 'series_coord' && $('series-rarity').value) items = items.filter(x => x.rarity === $('series-rarity').value);
  if (isLibraryTab() && view.sort !== 'original') {
    const originals = new Map(items.map(x => [String(x.id), x]));
    if (tab !== 'member' && view.sort === 'newest') {
      items = [...items].sort((a,b) => (ownReleaseTime(b) ?? -Infinity)-(ownReleaseTime(a) ?? -Infinity) || a.id-b.id);
    } else if (tab === 'member_memoria' && view.sort === 'rarity') {
      const ranks = {R:1,SR:2,SSR:3};
      items = [...items].sort((a,b) => (ranks[b.rarity] || 0)-(ranks[a.rarity] || 0) || a.id-b.id);
    } else {
      items = sortOwnedRoster(items.map(libraryRecord), DATA.roster || [], view.sort,
        ['phonetic','generation'].includes(view.sort)).map(x => originals.get(String(x.id)));
    }
  }
  if (!terms.length) return items;
  const rarityQuery = normalizeSearchText(raw).toUpperCase();
  if (terms.length === 1 && ['N', 'R', 'SR', 'SSR', 'UR', 'LR'].includes(rarityQuery) && tab !== 'synchro' && tab !== 'rank_exp') {
    return items.filter(x => String(x.rarity || '').toUpperCase() === rarityQuery);
  }
  return items.filter(item => {
    const haystack = normalizedItemSearchText(item);
    return terms.every(term => haystack.includes(term));
  });
}

let listLoadObserver = null;
function renderList() {
  listLoadObserver?.disconnect();
  const items = filteredItems();
  $('sidebar-heading').textContent = tab === 'series_coord' ? 'シリーズコーデ' : '名簿';
  renderMemberControls();
  if (!items.some(x => String(x.id) === String(selectedId))) selectedId = items.length ? String(items[0].id) : null;
  $('count').textContent = `${isLibraryTab() ? (libraryView().member || 'すべてのメンバー') + ' · ' : ''}${items.length}件の${TAB_LABELS[tab]}`;
  const listItemHtml = x => `
    <button type="button" aria-pressed="${String(x.id) === String(selectedId)}" class="list-item ${String(x.id) === String(selectedId) ? 'active' : ''} ${tab !== 'rank_exp' && !x.image ? 'no-thumb' : ''}" data-id="${escapeHtml(x.id)}">
      ${tab === 'rank_exp' ? '<div class="placeholder">EXP</div>' : (x.image ? img(x.image, x.displayName) : '')}
      <div>
        <div class="item-title">${escapeHtml(x.displayName || x.name || x.title)}</div>
        ${tab === 'rank_exp' ? '' : `<div class="item-sub">${escapeHtml(listSubtitle(x))}</div>`}
      </div>
    </button>`;
  const batchSize = 60;
  let shown = Math.min(items.length, Math.max(batchSize, Math.ceil((items.findIndex(x => String(x.id) === selectedId) + 1) / batchSize) * batchSize));
  const moreHtml = () => shown < items.length ? '<button type="button" class="list-more">もっと表示</button>' : '';
  $('list').innerHTML = items.slice(0, shown).map(listItemHtml).join('') + moreHtml() || `<div class="list-empty">該当する${TAB_LABELS[tab]}はありません。<br>検索や絞り込みを変更してください。</div>`;
  const watchMore = () => {
    const button = $('list').querySelector?.('.list-more');
    if (button && deferImages) {
      listLoadObserver?.disconnect();
      listLoadObserver = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) appendMore();
      }, {rootMargin: '160px'});
      listLoadObserver.observe(button);
    }
  };
  const appendMore = () => {
    listLoadObserver?.disconnect();
    $('list').querySelector('.list-more')?.remove();
    const start = shown;
    shown = Math.min(items.length, shown + batchSize);
    $('list').insertAdjacentHTML('beforeend', items.slice(start, shown).map(listItemHtml).join('') + moreHtml());
    watchMore();
    scheduleImagePrefetch(items.slice(start, shown).map(x => x.image), items.slice(shown, shown + 16).map(x => x.image));
  };
  $('list').onclick = event => {
    if (event.target.closest('.list-more')) { appendMore(); return; }
    const el = event.target.closest('.list-item');
    if (!el) return;
    selectedId = el.dataset.id;
    document.querySelectorAll('.list-item').forEach(item => {
      const active = item.dataset.id === selectedId;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    renderDetail();
    $('detail').scrollTop = 0;
    openMobileDetail(el);
  };
  watchMore();
  if (!selectedId && items.length) selectedId = String(items[0].id);
  scheduleImagePrefetch(items.slice(0, shown).map(x => x.image), items.slice(shown, shown + 16).map(x => x.image));
}

function effectPillsHtml(effects, limit = 3) {
  const items = uniqueEffects(effects || []).map(readableEffect).filter(Boolean);
  if (!items.length) return '';
  const visible = items.slice(0, limit).map(x => `<span class="effect-pill">${escapeHtml(x)}</span>`).join('');
  const more = items.length > limit ? `<span class="effect-pill">ほか${items.length - limit}件</span>` : '';
  return `<div class="effect-pills">${visible}${more}</div>`;
}

function skillHeadHtml(skill, title, meta = []) {
  const chips = meta.filter(Boolean).map(chip).join('');
  const iconHtml = skillIcon(skill);
  return `<div class="skill-head ${iconHtml ? '' : 'no-icon'}">
    ${iconHtml}
    <div>
      <h3>${escapeHtml(title)}</h3>
      ${chips ? `<div class="skill-meta">${chips}</div>` : ''}
    </div>
  </div>`;
}

function battleSkillHtml(s) {
  return `<div class="card">
    ${skillHeadHtml(s, `アクティブスキル：${s.name || ''}`)}
    ${(s.levels || []).map(l => `<div class="skill-title">Lv ${escapeHtml(l.toLevel)} / 消費SP ${escapeHtml(l.maxSp)}</div>
      <div class="skill-text">${escapeHtml(l.text)}</div>
      `).join('<hr>')}
  </div>`;
}

function passiveHtml(s) {
  return `<div class="card">
    ${skillHeadHtml(s, `パッシブスキル：${s.name || ''}`, [`開花 ${s.breakthrough ?? ''}`])}
    <div class="skill-text">${escapeHtml(s.text || '')}</div>
  </div>`;
}

function skillMainText(skill) {
  const level = (skill?.levels || [])[0];
  return skill?.text || skill?.Text || skill?.DescriptionLong || level?.text || '';
}

function skillMainEffects(skill, fallback = []) {
  const level = (skill?.levels || [])[0];
  return fallback?.length ? fallback : (skill?.effects || level?.effects || []);
}

function memoSkillEntryHtml({skill = {}, title = '', meta = [], text = '', effects = [], techPairs = [], effectLabel = '効果'}) {
  const shownText = text || skillMainText(skill);
  const shownEffects = uniqueEffects(skillMainEffects(skill, effects));
  const chips = meta.filter(Boolean).map(chip).join('');
  const iconHtml = skillIcon(skill);
  return `<div class="memo-skill-entry ${iconHtml ? '' : 'no-icon'}">
    ${iconHtml}
    <div>
      <div class="memo-skill-name">${escapeHtml(title || skill.name || skill.Name || '')}</div>
      ${chips ? `<div class="skill-meta">${chips}</div>` : ''}
      ${shownText ? `<div class="skill-text compact">${escapeHtml(shownText)}</div>` : ''}
    </div>
  </div>`;
}

function compactNumberRanges(values) {
  const nums = [...new Set((values || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  const ranges = [];
  for (const n of nums) {
    const last = ranges[ranges.length - 1];
    if (last && n === last.to + 1) last.to = n;
    else ranges.push({from: n, to: n});
  }
  return ranges.map(r => r.from === r.to ? String(r.from) : `${r.from}-${r.to}`).join(', ');
}

function memoSkillRowHtml({skill = {}, title = '', awakenings = [], meta = [], text = '', effects = [], techPairs = [], effectLabel = '効果', boostNote = ''}) {
  const shownText = text || skillMainText(skill);
  const shownEffects = uniqueEffects(skillMainEffects(skill, effects));
  const iconSrc = skillIconSrc(skill);
  const chips = meta.filter(Boolean).map(chip).join('');
  return `<div class="awakening-row ${iconSrc ? '' : 'no-icon'}">
    <div class="awake-badge"><span>開花</span><strong>${escapeHtml(compactNumberRanges(awakenings))}</strong></div>
    ${iconSrc ? skillIcon(skill, 'skill-icon skill-icon-small') : ''}
    <div>
      <div class="memo-skill-name">${escapeHtml(title || skill.name || skill.Name || '')}</div>
      ${chips ? `<div class="skill-meta">${chips}</div>` : ''}
      ${shownText ? `<div class="skill-text compact">${escapeHtml(shownText)}</div>` : ''}
    </div>
  </div>`;
}

function maxAwakeningBonusHtml(x) {
  const bonuses = x.maxAwakeningBonuses || [];
  if (!bonuses.length) return `<div class="card"><h3>最大強化ボーナス</h3><div class="empty">このノギメモには最大強化ボーナスがありません</div></div>`;
  return `<div class="card"><h3>最大強化ボーナス</h3>
    <div class="memo-skill-grid">
      ${bonuses.map(b => memoSkillEntryHtml({
        skill: b,
        title: b.name || '',
        meta: ['最大強化'],
        text: b.text || '',
        effects: b.effects || [],
        techPairs: [['MemoriaAwakeningBonusSetting', b.settingId], ['PassiveSkill', b.id], ['Thumbnail', b.thumbnailId]]
      })).join('')}
    </div>
  </div>`;
}

function memberMemoriaBonusHtml(x) {
  const bonus = x.levelUpBonus || {};
  const rows = bonus.rows || [];
  if (!rows.length) return '';
  return `<div class="card">
    <h3>強化ボーナス</h3>
    <div class="summary-line">
      ${chip(bonus.effectName)}
      ${chip('最大 ' + bonus.maxValueText)}
      ${chip('合計上限 ' + bonus.limitText)}
    </div>
    <div class="bonus-track">
      ${rows.map(r => `<div class="bonus-step">
        <strong>Lv ${escapeHtml(r.StartLevel)}</strong>
        <span>+${escapeHtml(r.valueText)}</span>
        <small>${escapeHtml(r.effectName)}${r.limitText ? ` / 上限 ${escapeHtml(r.limitText)}` : ''}</small>
      </div>`).join('')}
    </div>
  </div>`;
}

function equipmentHtml(eq) {
  if (eq.growth) {
    const part = {...eq.growth, coordinateLabel: [eq.equipmentTypeName, eq.grade, eq.setName].filter(Boolean).join(' / ')};
    return seriesPartHtml({starRate: part.starRate}, part);
  }
  const levelText = (eq.levels || []).map(l => `Rank${l.EquipmentLevel}`).join(' / ') || (eq.maxLevel ? `Rank${eq.maxLevel}` : '');
  const effects = (eq.effects || []).map(e => `<li>${escapeHtml(e.formulaText)}</li>`).join('');
  const setEffects = (eq.setEffects || []).map(e => `<li>${escapeHtml(e.EquipmentSetCount)}シリーズ：${escapeHtml(e.formulaText)}</li>`).join('');
  return `<div class="equipment-card">
    ${img(eq.image, eq.name, 'equipment-img')}
    <div>
      <div class="condition-type">${escapeHtml(eq.equipmentTypeName || '')}</div>
      <div class="equipment-name">${escapeHtml(eq.name || '')}</div>
      <div class="equipment-sub">${escapeHtml([eq.grade, eq.setName, levelText].filter(Boolean).join(' / '))}</div>
      <div class="equipment-sub">${escapeHtml(eq.text || '')}</div>
    </div>
  </div>`;
}

function equipmentSection(x) {
  const items = x.exclusiveEquipments || [];
  if (!items.length) return '';
  return `<div class="card"><h3>専用コーデ</h3><div class="series-parts">${exclusiveEquipmentHtml(x)}</div></div>`;
}

function slotLabel(s) {
  return `${s.SkillNumberMajor ?? '?'}-${s.SkillNumberMinor ?? '?'}`;
}

function slotSortKey(s) {
  const major = Number(s.SkillNumberMajor ?? 999);
  const minor = Number(s.SkillNumberMinor ?? 999);
  return major * 1000 + minor;
}

function effectSummaryText(effects, fallbackText = '') {
  return fallbackText || '';
}

function parseMemoSkillBoostText(text) {
  const s = String(text || '');
  const m = s.match(/((?:スキル\d(?:・|、|,|\/| )?)+)の強化倍率を(\d+(?:\.\d+)?)倍にする/);
  if (!m) return null;
  const targets = [...m[1].matchAll(/スキル(\d+)/g)].map(x => Number(x[1])).filter(Number.isFinite);
  const factor = Number(m[2]);
  if (!targets.length || !Number.isFinite(factor)) return null;
  return {targets, factor, text: s};
}

function memoSkillBoostInfo(row) {
  return parseMemoSkillBoostText(row?.text || row?.skill?.DescriptionLong || '');
}

function isMemoSkillBoostRow(row) {
  return !!memoSkillBoostInfo(row);
}

function memoBoostsByAwakening(rows) {
  const out = new Map();
  for (const row of rows || []) {
    const boost = memoSkillBoostInfo(row);
    if (!boost) continue;
    if (!out.has(row.awakening)) out.set(row.awakening, []);
    out.get(row.awakening).push({...boost, row});
  }
  return out;
}

function memoBoostForRow(row, boosts) {
  const candidates = boosts.get(row.awakening) || [];
  const slot = Number(row?.skillNumberMajor ?? row?.SkillNumberMajor ?? row?.major ?? 0);
  return candidates.find(b => b.targets.includes(slot)) || null;
}

function boostedFormulaText(text, factor) {
  const s = String(text || '');
  let m = s.match(/^(.+?) × (\d+(?:\.\d+)?)%$/);
  if (m) {
    const base = Number(m[2]);
    const finalValue = base * factor;
    return `${m[1]} × ${percentValue(finalValue)}%（強化後：${percentValue(base)}%×${percentValue(factor)}）`;
  }
  m = s.match(/^(.+?) \+ (\d+(?:\.\d+)?)$/);
  if (m) {
    const base = Number(m[2]);
    const finalValue = base * factor;
    return `${m[1]} + ${percentValue(finalValue)}（強化後：${percentValue(base)}×${percentValue(factor)}）`;
  }
  return `${s}（強化倍率×${percentValue(factor)} 適用）`;
}

function boostedEffects(effects, factor) {
  return (effects || []).map(e => {
    const baseText = readableEffect(e);
    return {
      ...e,
      originalFormulaText: e.formulaText || baseText,
      boostFactor: factor,
      formulaText: boostedFormulaText(baseText, factor)
    };
  });
}

function applyMemoBoostToRows(rows) {
  const boosts = memoBoostsByAwakening(rows);
  return (rows || []).map(row => {
    const boost = memoBoostForRow(row, boosts);
    if (!boost) return row;
    return {
      ...row,
      memoBoost: boost,
      effects: boostedEffects(row.effects || [], boost.factor),
      baseEffects: row.effects || [],
    };
  });
}

function awakeningNavHtml(counts) {
  const keys = [...counts.keys()].sort((a, b) => Number(a) - Number(b));
  return `<div class="awakening-tabs">${keys.map(k => chip(`開花 ${k}: ${counts.get(k)}件`)).join('')}</div>`;
}

function topAwakeningSummaryHtml(title, rows) {
  if (!rows.length) return '';
  return `<div class="card top-awakening">
    <h3>${escapeHtml(title)}</h3>
    <div class="active-summary-grid">
      ${rows.map(r => {
        const iconHtml = r.skill && skillIconSrc(r.skill) ? skillIcon(r.skill, 'skill-icon skill-icon-small') : '';
        return `<div class="summary-skill ${iconHtml ? '' : 'no-icon'}">
        ${iconHtml}
        <div>
          <div class="summary-skill-title">${escapeHtml(r.title)}</div>
          <div class="summary-skill-sub">${escapeHtml(r.text)}</div>
        </div>
      </div>`;
      }).join('')}
    </div>
  </div>`;
}

function centerAwakeningRows(x) {
  return applyMemoBoostToRows((x.skills || []).map(s => ({
    kind: 'center',
    awakening: Number(s.AwakeningCount ?? 0),
    sort: slotSortKey(s),
    slot: slotLabel(s),
    skillNumberMajor: Number(s.SkillNumberMajor ?? 0),
    skill: s.skill || {},
    title: `${s.skill?.Name || `スキル ${slotLabel(s)}`} (${slotLabel(s)})`,
    text: s.skill?.DescriptionLong || '',
    effects: s.effects || [],
    techPairs: [['MemoriaSkillMapping', s.Id], ['MemoriaSkill', s.MemoriaSkillId], ['Slot', slotLabel(s)]],
  }))).sort((a, b) => a.awakening - b.awakening || a.sort - b.sort || String(a.title).localeCompare(String(b.title), 'ja'));
}

function centerMemoriaTopSummaryHtml(x) {
  const allRows = centerAwakeningRows(x);
  const maxAwakening = allRows.reduce((m, r) => Math.max(m, r.awakening), 0);
  const rows = allRows.filter(r => r.awakening === maxAwakening);
  return topAwakeningSummaryHtml(`開花${maxAwakening} ボーナス`, rows.map(r => ({
    title: r.title,
    text: isMemoSkillBoostRow(r) ? r.text : effectSummaryText(r.effects, r.text),
    effects: isMemoSkillBoostRow(r) ? [] : r.effects,
    skill: r.skill,
    boostNote: r.memoBoost ? `ノギメモスキル強化適用：元効果×${percentValue(r.memoBoost.factor)}（${r.memoBoost.text}）` : (isMemoSkillBoostRow(r) ? 'この行は指定スキルの最終値に反映済み' : ''),
  })));
}

function centerMemoriaSkillsHtml(x) {
  const rows = centerAwakeningRows(x);
  if (!rows.length) return '';
  const counts = new Map();
  for (const r of rows) counts.set(r.awakening, (counts.get(r.awakening) || 0) + 1);
  const byAwakening = new Map();
  for (const r of rows) {
    if (!byAwakening.has(r.awakening)) byAwakening.set(r.awakening, []);
    byAwakening.get(r.awakening).push(r);
  }
  return `<div class="card">
    <h3>ノギメモ開花まとめ</h3>
    ${awakeningNavHtml(counts)}
    ${[...byAwakening.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([awakening, items]) => `
      <div class="awakening-section">
        <div class="awakening-title">${chip(`開花 ${awakening}`)}<span>${escapeHtml(items.length)} 件</span></div>
        <div class="awakening-list">
          ${items.map(r => memoSkillRowHtml({
            skill: r.skill,
            title: r.title,
            awakenings: [r.awakening],
            text: r.text,
            effects: isMemoSkillBoostRow(r) ? [] : r.effects,
            techPairs: r.techPairs,
            boostNote: r.memoBoost ? `ノギメモスキル強化適用：元効果×${percentValue(r.memoBoost.factor)}（${r.memoBoost.text}）` : (isMemoSkillBoostRow(r) ? 'この行は指定スキルの最終値に反映済み' : '')
          })).join('')}
        </div>
      </div>`).join('')}
  </div>`;
}

function memberAwakeningRows(x) {
  const groups = x.skillGroups || [];
  const rows = [];
  for (const g of groups) {
    for (const e of (g.entries || [])) {
      const skill = e.skill || {};
      const effects = e.effects?.length ? e.effects : skillMainEffects(skill);
      rows.push({
        awakening: Number(e.StartAwakeningCount ?? 0),
        sort: Number(g.Number ?? 999) * 1000 + Number(e.SkillType ?? 999),
        skillNumberMajor: Number(g.Number ?? 0),
        group: g,
        entry: e,
        skill,
        title: skill.name || skill.Name || 'スキル',
        text: skillMainText(skill),
        effects,
        meta: [e.SkillType === 1 ? 'アクティブ' : 'パッシブ'],
        techPairs: [['SkillGroup', g.Id], ['SkillGroupNo', g.Number], ['SkillType', e.SkillType], ['SkillId', e.SkillId]],
      });
    }
  }
  return applyMemoBoostToRows(rows).sort((a, b) => a.awakening - b.awakening || a.sort - b.sort || String(a.title).localeCompare(String(b.title), 'ja'));
}

function memberMemoriaTopSummaryHtml(x) {
  const rows = memberAwakeningRows(x);
  const maxAwakening = rows.reduce((m, r) => Math.max(m, r.awakening), 0);
  return topAwakeningSummaryHtml(`開花${maxAwakening} ボーナス`, rows.filter(r => r.awakening === maxAwakening).map(r => ({
    title: r.title,
    text: isMemoSkillBoostRow(r) ? r.text : effectSummaryText(r.effects, r.text),
    effects: isMemoSkillBoostRow(r) ? [] : r.effects,
    skill: r.skill,
    boostNote: r.memoBoost ? `ノギメモスキル強化適用：元効果×${percentValue(r.memoBoost.factor)}（${r.memoBoost.text}）` : (isMemoSkillBoostRow(r) ? 'この行は指定スキルの最終値に反映済み' : ''),
  })));
}

function memberMemoriaSkillsHtml(x) {
  const rows = memberAwakeningRows(x);
  if (!rows.length) return '';
  const counts = new Map();
  for (const r of rows) counts.set(r.awakening, (counts.get(r.awakening) || 0) + 1);
  const byAwakening = new Map();
  for (const r of rows) {
    if (!byAwakening.has(r.awakening)) byAwakening.set(r.awakening, []);
    byAwakening.get(r.awakening).push(r);
  }
  return `<div class="card">
    <h3>メンバーノギメモ 開花まとめ</h3>
    ${awakeningNavHtml(counts)}
    ${[...byAwakening.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([awakening, items]) => `<div class="awakening-section">
      <div class="awakening-title">${chip(`開花 ${awakening}`)}<span>${escapeHtml(items.length)} 件</span></div>
      <div class="awakening-list">
        ${items.map(r => memoSkillRowHtml({
          skill: r.skill,
          title: r.title,
          awakenings: [r.awakening],
          meta: r.meta,
          text: r.text,
          effects: isMemoSkillBoostRow(r) ? [] : r.effects,
          techPairs: r.techPairs,
          boostNote: r.memoBoost ? `ノギメモスキル強化適用：元効果×${percentValue(r.memoBoost.factor)}（${r.memoBoost.text}）` : (isMemoSkillBoostRow(r) ? 'この行は指定スキルの最終値に反映済み' : '')
        })).join('')}
      </div>
    </div>`).join('')}
  </div>`;
}

function activeSkillSummaryCard(x) {
  const rows = (x.activeSkills || []).map((skill, index) => {
    const level = (skill.levels || [])[0];
    const analysis = level?.appealAnalysis || null;
    const iconHtml = skillIcon(skill, 'skill-icon skill-icon-small');
    if (!analysis) {
      return `<div class="summary-skill ${iconHtml ? '' : 'no-icon'}">
        ${iconHtml}
        <div>
          <div class="summary-skill-title">スキル${index + 1}：${escapeHtml(skill.name || '')}</div>
          <div class="summary-skill-sub">アピール効果なし</div>
        </div>
      </div>`;
    }
    const sameTotal = nearlyEqual(analysis.minPct, analysis.maxPct);
    const totalChips = analysis.maxPct || analysis.minPct
      ? (sameTotal
        ? chip(`倍率合計 ${percentValue(analysis.maxPct)}%`)
        : `${chip(`通常倍率合計 ${percentValue(analysis.minPct)}%`)}${chip(`最大倍率合計 ${percentValue(analysis.maxPct)}%`)}`)
      : chip('ステータス参照アピール');
    const formulaLines = (analysis.lines || []).map(line => `<div class="summary-skill-sub">
      ${escapeHtml(line.label)}${line.detail ? ` <span class="appeal-notes">${escapeHtml(line.detail)}</span>` : ''}
    </div>`).join('');
    return `<div class="summary-skill ${iconHtml ? '' : 'no-icon'}">
      ${iconHtml}
      <div>
        <div class="summary-skill-title">スキル${index + 1}：${escapeHtml(skill.name || '')}</div>
        <div class="skill-meta">${totalChips}${analysis.fixedValues?.length ? chip('固定値は別計算') : ''}${analysis.hasVariable ? chip('ステータス値は別計算') : ''}${analysis.variableBonus ? chip('条件加算は状況で変動') : ''}</div>
        ${formulaLines}
      </div>
    </div>`;
  }).join('');
  return rows ? `<div class="card"><h3>アクティブスキル倍率まとめ</h3>
    <div class="active-summary-grid">${rows}</div>
  </div>` : '';
}

function memberBuffTagsHtml(x) {
  const states = new Map();
  const addState = (name, category) => {
    const clean = String(name || '').trim();
    const numericCategory = Number(category);
    if (!clean || ![1, 3].includes(numericCategory)) return;
    const special = numericCategory === 3;
    const previous = states.get(clean);
    if (!previous || special) states.set(clean, {name: clean, special});
  };
  const skills = [...(x.activeSkills || []), ...(x.passiveSkills || [])];
  for (const skill of skills) {
    const texts = [skill.text || ''];
    for (const effect of (skill.effects || [])) {
      if (effect.state) addState(effect.state.name, effect.state.category);
    }
    for (const level of (skill.levels || [])) {
      texts.push(level.text || '');
      for (const effect of (level.effects || [])) {
        if (effect.state) addState(effect.state.name, effect.state.category);
      }
    }
    for (const text of texts) {
      for (const match of String(text).matchAll(/※([^：\n]+)：/g)) {
        const name = match[1].trim();
        addState(name, DATA.stateCategories?.[name]);
      }
    }
  }
  if (!states.size) return '';
  return `<div class="member-buff-tags">
    ${[...states.values()].map(state => {
      return `<span class="buff-tag ${state.special ? 'special' : 'normal'}">${escapeHtml(state.name)}</span>`;
    }).join('')}
  </div>`;
}

function renderMember(x) {
  $('detail').innerHTML = `
    <div class="hero">
      ${img(x.image, x.displayName, '')}
      <div>
        <div class="kind">メンバー</div>
        <h2>${escapeHtml(x.displayName)}</h2>
        <div class="meta">
          ${chip(x.characterName)}${chip(x.rarity)}${chip(UNIT_TYPE[x.unitType])}${chip('欠片 ' + x.requiredFragment)}
        </div>
        ${memberBuffTagsHtml(x)}
      </div>
    </div>
    ${activeSkillSummaryCard(x)}
    <div class="grid">
      <div>${(x.activeSkills || []).map(battleSkillHtml).join('') || '<div class="card">アクティブスキルはありません</div>'}</div>
      <div>${(x.passiveSkills || []).map(passiveHtml).join('') || '<div class="card">パッシブスキルはありません</div>'}</div>
    </div>
    ${equipmentSection(x)}`;
  bindExclusiveEquipments(x);
}

function renderCenterMemoria(x) {
  $('detail').innerHTML = `
    <div class="hero">
      ${img(x.image, x.displayName, '')}
      <div>
        <div class="kind">センターノギメモ</div>
        <h2>${escapeHtml(x.displayName)}</h2>
        <div class="meta">${chip(x.rarity)}${chip(x.shortName)}</div>
        <p>${escapeHtml(x.appealText || '')}</p>
      </div>
    </div>
    ${centerMemoriaTopSummaryHtml(x)}
    ${maxAwakeningBonusHtml(x)}
    ${centerMemoriaSkillsHtml(x)}`;
}

function renderMemberMemoria(x) {
  $('detail').innerHTML = `
    <div class="hero">
      ${img(x.image, x.displayName, '')}
      <div>
        <div class="kind">メンバーノギメモ</div>
        <h2>${escapeHtml(x.displayName)}</h2>
        <div class="meta">${chip(x.rarity)}${chip('メンバーノギメモ')}</div>
      </div>
    </div>
    ${memberMemoriaTopSummaryHtml(x)}
    ${memberMemoriaBonusHtml(x)}
    ${memberMemoriaSkillsHtml(x)}`;
}

function renderSynchro() {
  const items = filteredItems();
  const pageSize = 24;
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  synchroPage = Math.min(synchroPage, pages - 1);
  const tiles = items.slice(synchroPage * pageSize, (synchroPage + 1) * pageSize);
  $('detail').innerHTML = `
    <h2>シンクロ一覧</h2>
    <p class="source">${items.length}件のシンクロ · 効果の説明はゲームのシンクロ表示に使われる文言です。所持カードやシンクロプレートで補った条件のチェックは「シンクロ計算」の名簿で行えます。</p>
    <div class="synchro-pager"><button id="synchro-prev" ${synchroPage === 0 ? 'disabled' : ''}>前へ</button><span>${synchroPage + 1} / ${pages}</span><button id="synchro-next" ${synchroPage + 1 >= pages ? 'disabled' : ''}>次へ</button></div>
    <div class="synchro-gallery">${tiles.map(item => `<article class="synchro-tile">
      <div class="synchro-info"><h3>${escapeHtml(item.displayName)}</h3>
        <p class="synchro-effect">${escapeHtml((item.passives || []).map(p => p.text).filter(Boolean).join(' / ') || item.effectText || '効果の説明なし')}</p>
      </div>
      <div class="synchro-conditions"><p class="synchro-condition-count">共鳴条件（${(item.conditions || []).length}）</p>
        <div class="synchro-faces">${(item.conditions || []).map(c => `<figure class="synchro-face" data-card-key="${escapeHtml(c.ownershipKey)}">${c.image ? img(c.image, c.displayName, 'synchro-image') : '<span>画像なし</span>'}<figcaption>${escapeHtml(c.displayName)}<br>${escapeHtml(c.subtitle)}</figcaption></figure>`).join('')}</div>
      </div>
    </article>`).join('')}</div>`;
  $('synchro-prev').onclick = () => { synchroPage = Math.max(0, synchroPage - 1); renderDetail(); $('detail').scrollTop = 0; };
  $('synchro-next').onclick = () => { synchroPage = Math.min(pages - 1, synchroPage + 1); renderDetail(); $('detail').scrollTop = 0; };
  const images = rows => rows.flatMap(x => (x.conditions || []).map(c => c.image));
  scheduleImagePrefetch(images(tiles), images(items.slice((synchroPage + 1) * pageSize, (synchroPage + 2) * pageSize)));
}

function isNumericValue(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function tableCell(v) {
  if (v === undefined || v === null || v === '') return '';
  if (isNumericValue(v)) return Number(v).toLocaleString();
  return String(v);
}

function dataTableHtml(section) {
  const columns = section.columns || [];
  const rows = section.rows || [];
  if (!columns.length || !rows.length) return '<div class="empty">データはありません</div>';
  return `<div class="table-wrap"><table>
    <thead><tr>${columns.map(c => `<th>${escapeHtml(c.label || c.key)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => `<tr>${columns.map(c => {
      const value = row[c.key];
      const cls = isNumericValue(value) ? ' class="number-cell"' : '';
      return `<td${cls}>${escapeHtml(tableCell(value))}</td>`;
    }).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

function renderRankExp(x) {
  $('detail').innerHTML = `<div class="card">
    <h2>${escapeHtml(x.displayName || '')}</h2>
    ${x.note ? `<div class="rank-note">${escapeHtml(x.note)}</div>` : ''}
    ${dataTableHtml(x)}
  </div>`;
}

function renderDetail() {
  const version = ++detailRenderVersion;
  const items = filteredItems();
  let x = items.find(i => String(i.id) === String(selectedId)) || items[0];
  if (!x) { $('detail').innerHTML = `<div class="empty">該当する${TAB_LABELS[tab]}はありません</div>`; return; }
  selectedId = String(x.id);
  if (x.detailPart !== undefined) {
    const key = TAB_KEYS[tab];
    const cached = window.VISUAL_PARTS[key + 'Details']?.[x.detailPart]?.[0];
    if (!cached) {
      $('detail').innerHTML = '<p role="status">詳細を読み込み中…</p>';
      loadItemDetail(key, x).then(() => {
        if (version === detailRenderVersion) renderDetail();
      }).catch(() => {
        if (version !== detailRenderVersion) return;
        $('detail').innerHTML = '<p>詳細を読み込めませんでした。</p><button id="retry-detail">再試行</button>';
        $('retry-detail').onclick = renderDetail;
      });
      return;
    }
    x = cached;
  }
  if (tab === 'member') renderMember(x);
  else if (tab === 'center_memoria') renderCenterMemoria(x);
  else if (tab === 'member_memoria') renderMemberMemoria(x);
  else if (tab === 'synchro') renderSynchro();
  else if (tab === 'rank_exp') renderRankExp(x);
  else if (tab === 'series_coord') renderSeriesCoordinates(x);
}

const mobileDetailQuery = typeof window.matchMedia === 'function'
  ? window.matchMedia('(max-width: 700px), (max-width: 1100px) and (max-height: 500px)') : null;
let mobileDetailReturn = null;
function isMobileDetailMode() {
  return Boolean(mobileDetailQuery?.matches) && ['member', 'center_memoria', 'member_memoria', 'rank_exp', 'series_coord'].includes(tab);
}
function syncMobileDetailMode() {
  if (!mobileDetailQuery) return;
  if (!isMobileDetailMode()) closeMobileDetail(false);
  document.body.classList.toggle('mobile-detail-mode', isMobileDetailMode());
}
function restoreMobileDetail() {
  if (!mobileDetailReturn) return;
  const state = mobileDetailReturn;
  mobileDetailReturn = null;
  document.querySelector('main').appendChild($('detail'));
  document.body.classList.remove('mobile-detail-open');
  document.body.style.top = state.bodyTop;
  $('mobile-detail-dialog').style.transform = '';
  $('list').scrollTop = state.listTop;
  if (state.restoreFocus && state.trigger?.isConnected) state.trigger.focus({preventScroll: true});
  window.scrollTo(state.x, state.y);
}
function closeMobileDetail(restoreFocus = true) {
  if (!mobileDetailReturn) return;
  mobileDetailReturn.restoreFocus = restoreFocus;
  $('mobile-detail-dialog').close();
  restoreMobileDetail();
}
function openMobileDetail(trigger = null) {
  if (!isMobileDetailMode()) return;
  $('mobile-detail-title').textContent = `${TAB_LABELS[tab]}詳細`;
  const dialog = $('mobile-detail-dialog');
  if (dialog.open) return;
  mobileDetailReturn = {trigger, x: window.scrollX, y: window.scrollY, listTop: $('list').scrollTop, bodyTop: document.body.style.top, restoreFocus: true};
  dialog.appendChild($('detail'));
  document.body.classList.add('mobile-detail-open');
  document.body.style.top = -mobileDetailReturn.y + 'px';
  $('detail').scrollTop = 0;
  dialog.showModal();
}
function setupMobileDetails() {
  if (!mobileDetailQuery) return;
  const dialog = $('mobile-detail-dialog');
  const toolbar = $('mobile-detail-toolbar');
  $('close-mobile-detail').addEventListener('click', () => closeMobileDetail());
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeMobileDetail(); });
  dialog.addEventListener('close', () => { if (!dialog.open) restoreMobileDetail(); });
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeMobileDetail();
  });
  let drag = null;
  const move = (x, y) => {
    const dx = x - drag.x, dy = y - drag.y;
    if (dy > 0 && dy > Math.abs(dx)) dialog.style.transform = `translateY(${Math.min(dy, 180)}px)`;
    return dy > 8 && dy > Math.abs(dx) * 1.4;
  };
  const end = (x, y) => {
    if (!drag) return;
    const dx = x - drag.x, dy = y - drag.y;
    drag = null;
    dialog.style.transform = '';
    if (dy >= 80 && dy > Math.abs(dx) * 1.4) window.requestAnimationFrame(() => closeMobileDetail());
  };
  toolbar.addEventListener('pointerdown', event => {
    if (event.target.closest('button') || (event.pointerType === 'mouse' && event.button !== 0)) return;
    drag = {x: event.clientX, y: event.clientY};
    toolbar.setPointerCapture(event.pointerId);
  });
  toolbar.addEventListener('pointermove', event => { if (drag) move(event.clientX, event.clientY); });
  toolbar.addEventListener('pointerup', event => end(event.clientX, event.clientY));
  toolbar.addEventListener('pointercancel', () => { drag = null; dialog.style.transform = ''; });
  // Pull-to-close only starts at the top; ordinary reading and table/control gestures remain scrollable.
  $('detail').addEventListener('touchstart', event => {
    if (!dialog.open || $('detail').scrollTop > 0 || event.touches.length !== 1 || event.target.closest('button,a,input,select,textarea,summary,.table-wrap,.series-table-wrap')) return;
    drag = {x: event.touches[0].clientX, y: event.touches[0].clientY};
  }, {passive: true});
  $('detail').addEventListener('touchmove', event => {
    if (!drag) return;
    if (event.touches.length !== 1) { drag = null; dialog.style.transform = ''; return; }
    if (move(event.touches[0].clientX, event.touches[0].clientY)) event.preventDefault();
  }, {passive: false});
  $('detail').addEventListener('touchend', event => { if (event.changedTouches.length) end(event.changedTouches[0].clientX, event.changedTouches[0].clientY); });
  $('detail').addEventListener('touchcancel', () => { drag = null; dialog.style.transform = ''; });
  mobileDetailQuery.addEventListener('change', syncMobileDetailMode);
  syncMobileDetailMode();
}
function render() {
  ++detailRenderVersion;
  updateSearchLabels();
  syncMobileDetailMode();
  if (!DATA[TAB_KEYS[tab]]) return;
  scheduleReleaseRefresh();
  if (tab === 'synchro_calc') { if (DATA.roster) renderOwnedSynchro(); return; }
  if (tab === 'synchro') { listLoadObserver?.disconnect(); $('list').innerHTML = ''; renderDetail(); return; }
  renderList();
  if (!isMobileDetailMode() || $('mobile-detail-dialog').open) renderDetail();
}

document.querySelectorAll('button[data-tab]').forEach(btn => btn.addEventListener('click', () => {
  tab = btn.dataset.tab;
  selectedId = null;
  history.replaceState(null, '', '#' + tab);
  showCategory();
}));
function applyMemberFilter() {
  setLibraryView({member: $('member-select').value, rarity: $('rarity-select').value});
  selectedId = null;
  render();
  $('list').scrollTop = 0;
  $('detail').scrollTop = 0;
}
$('member-select').addEventListener('change', () => { delete libraryView().filters.member; applyMemberFilter(); });
$('rarity-select').addEventListener('change', () => { delete libraryView().filters.rarity; applyMemberFilter(); });
$('series-rarity').addEventListener('change', () => { selectedId = null; render(); $('list').scrollTop = 0; });
$('library-sort').addEventListener('change', () => { setLibraryView({sort: $('library-sort').value}); render(); $('list').scrollTop = 0; });
$('open-library-filters').addEventListener('click', openLibraryFilters);
$('close-library-filters').addEventListener('click', () => $('library-filter-dialog').close());
$('apply-library-filters').addEventListener('click', commitLibraryFilters);
$('reset-library-draft').addEventListener('click', () => { libraryDraft = {}; renderLibraryDraft(); });
$('clear-filters').addEventListener('click', () => {
  setLibraryView({filters: {}});
  $('member-select').value = '';
  $('rarity-select').value = '';
  $('search').value = '';
  applyMemberFilter();
});
let searchRenderTimer = null;
$('search').addEventListener('input', () => {
  clearTimeout(searchRenderTimer);
  searchRenderTimer = setTimeout(() => { selectedId = null; synchroPage = 0; ownState.page = 0; render(); }, 120);
});
window.addEventListener('focus', refreshReleaseVisibility);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshReleaseVisibility(); });
window.addEventListener('hashchange', () => {
  if (TAB_KEYS[location.hash.slice(1)]) { tab = location.hash.slice(1); selectedId = null; showCategory(); }
});
setupMobileDetails();
setupLazyImages();
showCategory();
