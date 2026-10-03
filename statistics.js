const statisticsState = {view: 'list', scope: 'all', member: '', rarity: '', ownership: 'all', page: 0, membersOpen: false, detailCardId: null};
const STATISTICS_CATEGORY = 'シンクロ登場回数ランキング（メンバー別・カード別）';

function statisticsOwnershipToggle(card) {
  return `<label class="statistics-owned-toggle"><input type="checkbox" data-statistics-own-key="${escapeHtml(card.ownershipKey)}" aria-label="${escapeHtml(card.displayName)} ${escapeHtml(card.rarity || '')}の所持" ${ownState.keys.has(card.ownershipKey) ? 'checked' : ''}><span>所持</span></label>`;
}

function bindStatisticsOwnership(root) {
  root.querySelectorAll('input[data-statistics-own-key]').forEach(input => {
    input.onchange = () => {
      const key = input.dataset.statisticsOwnKey;
      const detail = $('detail'), dialog = $('statistics-card-dialog');
      const scroll = detail.scrollTop, dialogScroll = dialog.scrollTop;
      const inDialog = dialog.contains(input);
      const origin = inDialog ? dialog : detail;
      const position = [...origin.querySelectorAll('input[data-statistics-own-key]')]
        .filter(element => element.dataset.statisticsOwnKey === key).indexOf(input);
      toggleOwnedCard(key);
      render();
      if (dialog.open) renderStatisticsCardDetail(statisticsState.detailCardId);
      detail.scrollTop = scroll;
      dialog.scrollTop = dialogScroll;
      const matches = [...origin.querySelectorAll('input[data-statistics-own-key]')]
        .filter(element => element.dataset.statisticsOwnKey === key);
      const replacement = matches[position] || matches[0];
      replacement?.focus({preventScroll: true});
    };
  });
}

const normalizedCardSearchName = name => normalizeSearchText(name).replace(/\s+/g, '');
let synchroSearchSource = null;
let synchroCardSearchNames = new Set();
function synchroCardSearchQuery(raw) {
  if (synchroSearchSource !== DATA.synchro) {
    synchroSearchSource = DATA.synchro;
    synchroCardSearchNames = new Set((DATA.synchro || []).flatMap(item => (item.conditions || [])
      .map(condition => normalizedCardSearchName(condition.displayName))));
  }
  const rarity = raw.match(/(?:\s+|\s*\/\s*)(LR|UR|SSR|SR|R|N)\s*$/i);
  const label = rarity ? raw.slice(0, rarity.index) : raw;
  const name = normalizedCardSearchName(label);
  // A complete card name must match one condition, not words from separate cards.
  const bracketedName = /^[\[【][^\]】]+[\]】]\s*\S/.test(label);
  return name && (bracketedName || synchroCardSearchNames.has(name)) ? {name, rarity: rarity?.[1].toUpperCase() || ''} : null;
}

function synchrosForCard(cardId, now = Date.now()) {
  return [...new Map((DATA.synchro || []).filter(item => ownRecordIsReleased(item, now) &&
    (item.conditions || []).some(condition => condition.conditionType === 1 && condition.conditionId === cardId))
    .map(item => [item.id, item])).values()];
}

function renderStatisticsCardDetail(cardId) {
  const card = (DATA.roster || []).find(card => card.kind === 'member' && card.id === cardId && ownRecordIsReleased(card));
  const dialog = $('statistics-card-dialog');
  if (!card) { dialog.close(); return; }
  const synchros = synchrosForCard(cardId);
  $('statistics-card-body').innerHTML = `<div class="statistics-dialog-card ${ownState.keys.has(card.ownershipKey) ? 'is-owned' : ''}">
    ${card.image ? img(card.image, card.displayName, 'own-card-image') : '<span class="statistics-no-image">画像なし</span>'}
    <div><span class="statistics-rarity">${escapeHtml(card.rarity)}</span><h3>${escapeHtml(card.displayName)}</h3><p id="statistics-dialog-count" role="status">${synchros.length}件のシンクロ</p>${statisticsOwnershipToggle(card)}</div>
  </div><div class="synchro-gallery">${synchros.map(item => synchroTileHtml(item, cardId, true)).join('') || '<p class="empty">このカードが登場するシンクロはありません。</p>'}</div>`;
  bindStatisticsOwnership($('statistics-card-body'));
  scheduleImagePrefetch(synchros.flatMap(item => (item.conditions || []).map(condition => window.VisualImages.source(condition.image, 'synchro-image'))).filter(Boolean));
}

function openStatisticsCardDetail(cardId) {
  statisticsState.detailCardId = cardId;
  renderStatisticsCardDetail(cardId);
  const dialog = $('statistics-card-dialog');
  $('close-statistics-card').onclick = () => dialog.close();
  dialog.onclick = event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  };
  dialog.showModal();
  dialog.scrollTop = 0;
}

function synchroTabsHtml() {
  return `<nav class="synchro-subtabs" aria-label="シンクロの表示切り替え">${[['list', '一覧'], ['cards', '登場回数ランキング']].map(([view, label]) => `<button type="button" data-synchro-view="${view}" aria-pressed="${statisticsState.view === view}" class="${statisticsState.view === view ? 'active' : ''}">${label}</button>`).join('')}</nav>`;
}

function bindSynchroTabs() {
  document.querySelectorAll('[data-synchro-view]').forEach(button => {
    button.onclick = () => {
      if (statisticsState.view === button.dataset.synchroView) return;
      statisticsState.view = button.dataset.synchroView;
      $('search').value = '';
      showCategory();
      $('detail').scrollTop = 0;
    };
  });
}

function rankStatisticsRows(rows) {
  let rank = 0;
  return rows.map((row, index) => {
    if (!index || row.count !== rows[index - 1].count) rank = index + 1;
    return {...row, rank};
  });
}

function buildSynchroStatistics(roster = DATA.roster, synchros = DATA.synchro, now = Date.now()) {
  const cards = new Map((roster || []).filter(card => card.kind === 'member' && ownRecordIsReleased(card, now))
    .map(card => [card.id, {...card, synchroIds: new Set()}]));
  const available = (synchros || []).filter(item => ownRecordIsReleased(item, now));
  for (const item of available) {
    // A set of synchro IDs counts a card at most once within each synchro.
    for (const condition of item.conditions || []) {
      if (condition.conditionType === 1) cards.get(condition.conditionId)?.synchroIds.add(item.id);
    }
  }
  const cardRows = [...cards.values()].map(card => ({...card, count: card.synchroIds.size}))
    .sort((a, b) => b.count - a.count || a.id - b.id);
  const members = new Map();
  for (const card of cardRows) {
    if (!members.has(card.characterId)) members.set(card.characterId, {
      id: card.characterId, name: card.characterName, image: card.image, synchroIds: new Set(), cardCount: 0
    });
    const member = members.get(card.characterId);
    member.cardCount++;
    for (const id of card.synchroIds) member.synchroIds.add(id);
  }
  const memberRows = [...members.values()].map(member => ({...member, count: member.synchroIds.size}))
    .sort((a, b) => b.count - a.count || a.id - b.id);
  return {cards: rankStatisticsRows(cardRows), members: rankStatisticsRows(memberRows), synchroCount: available.length};
}

function filteredStatisticsCards(statistics) {
  const terms = normalizeSearchText($('search').value).split(/\s+/).filter(Boolean);
  return rankStatisticsRows(statistics.cards.filter(card => {
    if (statisticsState.scope === 'member' && statisticsState.member && String(card.characterId) !== statisticsState.member) return false;
    if (statisticsState.rarity && card.rarity !== statisticsState.rarity) return false;
    if (statisticsState.ownership !== 'all' && ownState.keys.has(card.ownershipKey) !== (statisticsState.ownership === 'owned')) return false;
    const text = normalizeSearchText([card.id, card.displayName, card.characterName, card.phonetic, card.rarity].join(' '));
    return terms.every(term => text.includes(term));
  }));
}

function renderStatistics() {
  loadOwned();
  const statistics = buildSynchroStatistics();
  if (!statistics.members.some(member => String(member.id) === statisticsState.member)) {
    statisticsState.member = '';
    statisticsState.scope = 'all';
  }
  const cards = filteredStatisticsCards(statistics);
  const pageSize = 48;
  const pages = Math.max(1, Math.ceil(cards.length / pageSize));
  statisticsState.page = Math.min(statisticsState.page, pages - 1);
  const visible = cards.slice(statisticsState.page * pageSize, (statisticsState.page + 1) * pageSize);
  const selectedMember = statisticsState.scope === 'member' ? statistics.members.find(member => String(member.id) === statisticsState.member) : null;
  const pager = position => paginationHtml(`statistics-${position}`, statisticsState.page, pages, 'statistics-pager');
  $('count').textContent = `${cards.length}枚のカード`;
  $('detail').innerHTML = `${synchroTabsHtml()}<div class="statistics-view">
    <div class="statistics-heading"><h2>${STATISTICS_CATEGORY}</h2>
      <p class="statistics-note">共鳴条件に登場するメンバー・カードを多い順に表示します。同じシンクロ内の同じメンバー・カードは、それぞれ1回。レアリティが異なるカードは別々に集計します。</p>
      <p class="statistics-scope">${location.protocol === 'file:' ? '全データ' : '公開済みデータ'}：${statistics.synchroCount.toLocaleString()}件のシンクロ / ${statistics.members.length}人 / ${statistics.cards.length.toLocaleString()}枚</p>
    </div>
    <nav class="statistics-ranking-tabs" aria-label="カードランキングの表示切り替え">
      <button id="statistics-all-cards" type="button" aria-pressed="${statisticsState.scope === 'all'}" class="${statisticsState.scope === 'all' ? 'active' : ''}">カード総合ランキング</button>
      <button id="statistics-member-cards" type="button" aria-pressed="${statisticsState.scope === 'member'}" class="${statisticsState.scope === 'member' ? 'active' : ''}">メンバー別カードランキング</button>
    </nav>
    <div class="statistics-controls">
      <label>メンバー（個別ランキング）<select id="statistics-member">${ownOptions([['', 'すべてのメンバー'], ...statistics.members.map(member => [String(member.id), `${member.name}（${member.count}回）`])], selectedMember ? statisticsState.member : '')}</select></label>
      <label>レアリティ<select id="statistics-rarity">${ownOptions([['', 'すべて'], ...['LR','UR','SSR','SR','R','N'].filter(rarity => statistics.cards.some(card => card.rarity === rarity)).map(rarity => [rarity, rarity])], statisticsState.rarity)}</select></label>
      <label>所持状態<select id="statistics-ownership">${ownOptions([['all', 'すべて'], ['owned', '所持'], ['missing', '未所持']], statisticsState.ownership)}</select></label>
      <button id="statistics-reset" type="button">絞り込みをリセット</button>
    </div>
    <details id="statistics-members" class="statistics-members" ${statisticsState.membersOpen ? 'open' : ''}>
      <summary>メンバー別の登場回数を見る（${statistics.members.length}人）</summary>
      <p class="statistics-note">同じシンクロに同じメンバーのカードが複数あっても1回。メンバーを選ぶと、そのメンバーのカードを多い順に表示します。</p>
      <div class="statistics-member-list">${statistics.members.map(member => `<button type="button" class="statistics-member-row ${statisticsState.scope === 'member' && String(member.id) === statisticsState.member ? 'is-selected' : ''}" data-statistics-member="${member.id}" aria-pressed="${statisticsState.scope === 'member' && String(member.id) === statisticsState.member}">
        <span class="statistics-rank">${member.rank}位</span>${member.image ? img(member.image, member.name, 'own-card-image') : '<span class="statistics-no-image">画像なし</span>'}<span class="statistics-member-name">${escapeHtml(member.name)}</span><strong>${member.count}<small>回</small></strong>
      </button>`).join('')}</div>
    </details>
    <div class="statistics-results"><h3>${selectedMember ? escapeHtml(selectedMember.name) + 'のカードランキング' : '全メンバーのカード総合ランキング'}</h3><p id="statistics-result-count" role="status">${cards.length}枚 / 登場回数が多い順・同数は同順位</p>${pager('top')}</div>
    <p class="statistics-note">所持のチェックは「シンクロ計算」の所持名簿と共通で、自動保存します。カードを選ぶと、対応するシンクロの効果と共鳴条件を確認できます。</p>
    ${/できません|失われます|一時的/.test(ownState.storage) ? `<p class="statistics-note" role="status">${escapeHtml(ownState.storage)}</p>` : ''}
    <div class="statistics-card-grid">${visible.map(card => `<article class="statistics-card ${ownState.keys.has(card.ownershipKey) ? 'is-owned' : ''}" data-card-id="${card.id}" data-count="${card.count}" data-rank="${card.rank}"><button type="button" class="statistics-card-detail" data-statistics-detail="${card.id}" aria-haspopup="dialog" aria-label="${escapeHtml(card.displayName)} ${escapeHtml(card.rarity)}：${card.count}件のシンクロを見る">
      <span class="statistics-card-top"><span class="statistics-rank">${card.rank}位</span><strong>${card.count}<small>回</small></strong></span>
      <span class="statistics-picture">${ownState.keys.has(card.ownershipKey) ? '<span class="statistics-owned-badge" aria-hidden="true">✓</span>' : ''}${card.image ? img(card.image, card.displayName, 'own-card-image') : '<span class="statistics-no-image">画像なし</span>'}</span>
      <span class="statistics-rarity">${escapeHtml(card.rarity)}</span><span class="statistics-card-title">${escapeHtml(card.displayName)}</span><span class="statistics-card-member">${escapeHtml(card.characterName)}</span>
    </button>${statisticsOwnershipToggle(card)}</article>`).join('')}</div>
    ${cards.length ? pager('bottom') : '<div class="empty">該当するカードはありません</div>'}
  </div>`;
  const update = () => { statisticsState.page = 0; render(); $('detail').scrollTop = 0; };
  bindSynchroTabs();
  $('statistics-all-cards').onclick = () => { statisticsState.scope = 'all'; statisticsState.rarity = ''; statisticsState.ownership = 'all'; $('search').value = ''; update(); };
  $('statistics-member-cards').onclick = () => {
    statisticsState.member ||= String(statistics.members[0]?.id || '');
    statisticsState.scope = statisticsState.member ? 'member' : 'all';
    update();
  };
  $('statistics-member').onchange = () => {
    const member = $('statistics-member').value;
    if (member) statisticsState.member = member;
    statisticsState.scope = member ? 'member' : 'all';
    update();
  };
  $('statistics-rarity').onchange = () => { statisticsState.rarity = $('statistics-rarity').value; update(); };
  $('statistics-ownership').onchange = () => { statisticsState.ownership = $('statistics-ownership').value; update(); };
  $('statistics-reset').onclick = () => { statisticsState.scope = 'all'; statisticsState.member = ''; statisticsState.rarity = ''; statisticsState.ownership = 'all'; $('search').value = ''; update(); };
  $('statistics-members').ontoggle = () => { statisticsState.membersOpen = $('statistics-members').open; };
  document.querySelectorAll('[data-statistics-member]').forEach(button => {
    button.onclick = () => { statisticsState.member = button.dataset.statisticsMember; statisticsState.scope = 'member'; update(); };
  });
  document.querySelectorAll('[data-statistics-detail]').forEach(button => {
    button.onclick = () => openStatisticsCardDetail(Number(button.dataset.statisticsDetail));
  });
  bindStatisticsOwnership($('detail'));
  for (const position of ['top', 'bottom']) {
    if (!$(`statistics-${position}-prev`)) continue;
    bindPagination(`statistics-${position}`, statisticsState.page, pages, page => { statisticsState.page = page; render(); $('detail').scrollTop = 0; });
  }
  scheduleImagePrefetch(visible.map(card => window.VisualImages.source(card.image, 'own-card-image')).filter(Boolean),
    cards.slice((statisticsState.page + 1) * pageSize, (statisticsState.page + 2) * pageSize)
      .map(card => window.VisualImages.source(card.image, 'own-card-image')).filter(Boolean));
}
