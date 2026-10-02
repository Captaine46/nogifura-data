let seriesPartChoices = new Map();
const exclusiveVariantChoices = new Map();
const seriesNumber = value => Number(value).toLocaleString('ja-JP', {maximumFractionDigits: 2});

function seriesStatus(level, growLevel, starRate = null) {
  const f = Math.fround;
  const curves = level.growthCurve || DATA.coordinateGrowthCurves[level.GrowGroupId];
  const curve = curves.find(g => g.FromGrowLevel <= growLevel && growLevel <= g.ToGrowLevel);
  if (!curve) return null;
  const fraction = f(f(growLevel - curve.FromGrowLevel) / f(curve.ToGrowLevel - curve.FromGrowLevel));
  const percentage = f(curve.MinGrowPercentage + f(f(curve.MaxGrowPercentage - curve.MinGrowPercentage) * fraction));
  let value = f(f(level.MinStatus) + f(f(level.MaxStatus - level.MinStatus) * percentage));
  if (starRate !== null) value = f(value * f(f(starRate) * f(0.01)));
  const max = Math.floor(value);
  return {max, min: Math.trunc(f(f(max) * f(0.85)))};
}

function seriesStatText(part, values) {
  const [minName, maxName] = part.parameterNames;
  return (minName ? `${minName} ${seriesNumber(values.min)} / ` : '') + `${maxName} ${seriesNumber(values.max)}`;
}

// Read every premium level directly from unpacked masterdata; no interpolation.
function seriesAuraValue(part, kind, level) {
  const levelKey = kind === 'ace' ? 'AceAuraLevel' : 'LegendAuraLevel';
  const row = DATA.coordinateAuras[kind].find(r => r[levelKey] === level);
  if (!row) throw new Error(`Unknown ${kind} aura level: ${level}`);
  const value = row[part.aura[kind + 'Field']];
  return {row, value, text: `${part.aura[kind + 'Name']} +${seriesNumber(kind === 'legend' ? Math.fround(Math.fround(value) * 100) : value)}${kind === 'legend' ? '%' : ''}`};
}

function seriesAuraOptions(kind, selected) {
  const key = kind === 'ace' ? 'AceAuraLevel' : 'LegendAuraLevel';
  return DATA.coordinateAuras[kind].map(r => `<option value="${r[key]}" ${r[key] === selected ? 'selected' : ''}>Lv${r[key]}${r[key] === 0 ? '（未合成）' : ''}</option>`).join('');
}

function seriesFinalBonus(series, part, level, growLevel, choice = {}) {
  const basic = seriesStatus(level, growLevel, series.starRate);
  const entries = new Map();
  const add = (id, name, fixed = 0, rate = 0, byLevel = 0) => {
    const entry = entries.get(id) || {id, name, fixed: 0, rate: 0, byLevel: 0};
    entry.fixed += fixed;
    entry.rate = Math.fround(entry.rate + rate);
    entry.byLevel += byLevel;
    entries.set(id, entry);
  };
  part.basicParameters.forEach((id, index) => {
    if (id !== null) add(id, part.parameterNames[index], index === 0 ? basic.min : basic.max);
  });
  const ace = seriesAuraValue(part, 'ace', choice.aceLevel || 0);
  const legend = seriesAuraValue(part, 'legend', choice.legendLevel || 0);
  if (ace.value) add(part.aura.aceParameter, part.aura.aceName, ace.value);
  if (legend.value) add(part.aura.legendParameter, part.aura.legendName, 0, legend.value);
  for (const effect of part.exclusiveEffects || []) {
    const value = Number(effect.Value);
    if (effect.AddType === 2) add(effect.TargetParameter, effect.ParameterName, 0, 0, value);
    else if (effect.AddType === 1 || effect.TargetParameter >= 20) add(effect.TargetParameter, effect.ParameterName, 0, value);
    else add(effect.TargetParameter, effect.ParameterName, value);
  }
  // Fixed contributions can be added only to the same parameter. Ratio modifiers
  // remain member-wide modifiers; equipment stats are not the member's base.
  return [...entries.values()];
}

function seriesFinalBonusText(entry) {
  const values = [];
  if (entry.fixed) values.push('+' + seriesNumber(entry.fixed));
  if (entry.rate) values.push('+' + seriesNumber(Math.fround(entry.rate * 100)) + '%');
  if (entry.byLevel) values.push('+ C.Rank×' + seriesNumber(entry.byLevel));
  return values.join(' / ') || '+0';
}

function seriesPartAuraHtml(part, choice) {
  return ['legend', 'ace'].map(kind => {
    const level = choice[kind + 'Level'] || 0;
    const result = seriesAuraValue(part, kind, level);
    const rows = DATA.coordinateAuras[kind];
    const key = kind === 'ace' ? 'AceAuraLevel' : 'LegendAuraLevel';
    const next = rows.find(r => r[key] === level + 1);
    const total = rows.filter(r => r[key] <= level).reduce((sum, r) => sum + r.DiffAuraCount, 0);
    return `<div class="series-aura-effect"><span>${kind.toUpperCase()} Lv${level}</span><b>${escapeHtml(result.text)}</b><small>累計 ${seriesNumber(total)}pt / ${next ? `次のLv：${seriesNumber(next.DiffAuraCount)}pt` : '最大Lv'}</small></div>`;
  }).join('');
}

function seriesTable(headers, rows, cls = '') {
  return `<div class="series-table-wrap ${cls}"><table><thead><tr>${headers.map(s => `<th>${escapeHtml(s)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(s => `<td>${escapeHtml(s)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function seriesEvolutionHtml(evolutions) {
  if (!evolutions.length) return '<p class="series-note">このRankからの進化はありません。</p>';
  return `<ul class="series-evolutions">${evolutions.map(e => `<li><strong>${escapeHtml(e.special ? '特別進化' : '進化')} → ${escapeHtml(e.name)} (${escapeHtml(e.rarity)} / Rank${e.rank})</strong><br>${e.resources.map(r => `${escapeHtml(r.name)} × ${seriesNumber(r.ItemQuantity)}`).join(' / ')}</li>`).join('')}</ul>`;
}

function seriesExclusiveStatusHtml(part) {
  if (!part.exclusiveEffects?.length) return '';
  return `<div class="series-exclusive-status"><div class="series-final-title">専用ステータス</div>
    <div class="series-final-values">${part.exclusiveEffects.map(effect => `<div data-series-exclusive-parameter="${effect.TargetParameter}"><strong>${escapeHtml(effect.formulaText)}</strong></div>`).join('')}</div>
    <small class="series-final-note">対象メンバー装備時に発動します。C.Rankはメンバーの値です。</small></div>`;
}

function seriesPartHtml(series, part) {
  const choice = seriesPartChoices.get(part.id) || {};
  const level = part.levels.find(r => r.Id === choice.levelId) || part.levels.at(-1);
  const growLevel = Math.min(level.maxGrowLevel, Math.max(0, Number.isFinite(choice.growLevel) ? choice.growLevel : level.maxGrowLevel));
  const normalized = {...choice, levelId: level.Id, growLevel, legendLevel: choice.legendLevel || 0, aceLevel: choice.aceLevel || 0};
  seriesPartChoices.set(part.id, normalized);
  const cost = level.enhanceCost;
  const progress = part.levels.map(r => [
    `Rank${r.EquipmentLevel}`, `Lv${r.maxGrowLevel}`, seriesStatText(part, seriesStatus(r, 0, series.starRate)),
    seriesStatText(part, r.fullyEnhancedStar), seriesNumber(r.BaseCustomizationValue)
  ]);
  const growthRows = Array.from({length: level.maxGrowLevel + 1}, (_, lv) => [
    lv, seriesStatText(part, seriesStatus(level, lv, series.starRate))
  ]);
  return `<article class="series-part" data-series-part="${part.id}">
    <div class="series-part-head">${img(part.image, part.name, 'series-part-image')}<div><div class="kind">${escapeHtml(part.coordinateLabel || part.unitTypeName)}</div><h3>${escapeHtml(part.name)}</h3><p>${escapeHtml(part.Text)}</p></div></div>
    <div class="series-part-inputs"><label>Rank <select data-series-rank="${part.id}">${part.levels.map(r => `<option value="${r.Id}" ${r.Id === level.Id ? 'selected' : ''}>Rank${r.EquipmentLevel}</option>`).join('')}</select></label><label>強化Lv <input data-series-level="${part.id}" type="number" min="0" max="${level.maxGrowLevel}" step="1" value="${growLevel}"></label><button data-series-max="${part.id}" type="button">最高Rank・Lv</button></div>
    <div class="series-part-inputs series-aura-inputs"><label>LEGEND <select data-series-legend="${part.id}">${seriesAuraOptions('legend', normalized.legendLevel)}</select></label><label>ACE <select data-series-ace="${part.id}">${seriesAuraOptions('ace', normalized.aceLevel)}</select></label><button data-series-aura-max="${part.id}" type="button">オーラLv最大</button></div>
    ${seriesExclusiveStatusHtml(part)}
    <div class="series-status" data-series-status="${part.id}" aria-live="polite">${seriesCurrentStatusHtml(series, part, level, growLevel)}</div>
    <div class="series-aura-status" data-series-aura-status="${part.id}" aria-live="polite">${seriesPartAuraHtml(part, normalized)}</div>
    <p class="series-note">Lv0 → Lv${level.maxGrowLevel} 強化費用：マニー ${seriesNumber(cost.NecessaryMoney)} / 強化ストーン ${seriesNumber(cost.NecessaryMaterialStone)} / 強化クリスタル ${seriesNumber(cost.NecessaryMaterialCrystal)}</p>
    <details><summary>全Rankの初期・最大性能 (${part.levels.length}段階)</summary>${seriesTable(['Rank', '強化上限', 'Lv0', '強化最大', 'カスタマイズ基準値'], progress)}</details>
    <details><summary>Rank${level.EquipmentLevel}の全強化Lv</summary>${seriesTable(['Lv', '基本性能'], growthRows, 'series-growth')}</details>
    <details><summary>プレミアム合成 全Lv・必要ポイント</summary>${seriesTable(['Lv', 'LEGEND', '必要pt', 'ACE', '必要pt'], DATA.coordinateAuras.legend.map(r => {
      const lv = r.LegendAuraLevel;
      const ace = seriesAuraValue(part, 'ace', lv);
      return [lv, seriesAuraValue(part, 'legend', lv).text, r.DiffAuraCount, ace.text, ace.row.DiffAuraCount];
    }), 'series-growth')}</details>
    <details><summary>進化先・必要素材</summary>${seriesEvolutionHtml([...(level.evolutions || []), ...part.specialEvolutions])}</details>
  </article>`;
}

function seriesCurrentStatusHtml(series, part, level, growLevel) {
  const star = seriesStatus(level, growLevel, series.starRate);
  const choice = seriesPartChoices.get(part.id) || {};
  const final = seriesFinalBonus(series, part, level, growLevel, choice);
  return `<div class="series-basic-status"><span>Rank${level.EquipmentLevel} / Lv${growLevel}・基本性能</span><div>${escapeHtml(seriesStatText(part, star))}</div></div>
    <div class="series-final-title">合計効果（このコーデ）</div>
    <div class="series-final-values">${final.map(entry => `<div data-series-final-parameter="${entry.id}"><span>${escapeHtml(entry.name)}</span><strong>${escapeHtml(seriesFinalBonusText(entry))}</strong></div>`).join('')}</div>
    <small class="series-final-note">固定値は合算、割合は対象能力ごとに表示しています。${part.exclusiveEffects?.length ? '専用ステータスを含み、C.Rankの増加分は式で表示しています。' : ''}</small>`;
}

function renderSeriesCoordinates(series) {
  const maximums = series.parts.map(part => {
    const level = part.levels.at(-1);
    return [part.name, part.unitTypeName, `Rank${level.EquipmentLevel} / Lv${level.maxGrowLevel}`,
      seriesStatText(part, level.fullyEnhancedStar),
      seriesAuraValue(part, 'legend', DATA.coordinateAuras.legend.at(-1).LegendAuraLevel).text,
      seriesAuraValue(part, 'ace', DATA.coordinateAuras.ace.at(-1).AceAuraLevel).text];
  });
  const grade = series.gradeSetting;
  $('detail').innerHTML = `<div class="card series-intro"><div class="kind">シリーズコーデ</div><h2>${escapeHtml(series.displayName)}</h2><div class="meta">${chip(series.rarity)}${chip(series.parts.length + '種')}${chip('最高Rank' + series.maxRank)}${chip('強化Lv' + Math.max(...series.parts.flatMap(p => p.levels.map(r => r.maxGrowLevel))))}${chip('★')}</div></div>
    <div class="card"><h3>シリーズ効果</h3>${seriesTable(['装備数', '効果'], series.setEffects.map(e => [e.EquipmentSetCount + 'シリーズ', e.effectText]))}</div>
    <div class="card"><h3>最高Rank・強化最大の基本性能</h3>${seriesTable(['コーデ', '装備タイプ', 'Rank / Lv', '基本性能', 'LEGEND 最大Lv', 'ACE 最大Lv'], maximums)}</div>
    <div class="series-parts">${series.parts.map(p => seriesPartHtml(series, p)).join('')}</div>
    <div class="card"><h3>カスタマイズ</h3><p class="series-note">付与される能力は装備ごとに異なります。以下はシリーズ共通設定で、基本性能への合算値ではありません。</p>${seriesTable(['項目', '値'], [['追加性能の枠数', grade.CustomizationCount], ['レアリティ補正', grade.GradeCustomizeValue], ['シリーズ補正', series.setCustomizeValue], ['基本マニー', grade.BaseCustomizationMoney], ['基本コイン', grade.BaseCustomizationCoin], ['ロック基本コイン', grade.BaseCustomizationLockCoin], ['基本売却価格', grade.BaseSalePrice], ['リメイクポイント', grade.RemakePrice]])}</div>
    ${seriesAuraHtml()}`;
  bindSeriesParts(series);
}

function replaceSeriesPart(series, id) {
  const part = series.parts.find(p => p.id === id);
  const current = document.querySelector(`[data-series-part="${id}"]`);
  current.outerHTML = seriesPartHtml(series, part);
  bindSeriesParts(series);
}

function bindSeriesParts(series) {
  // Assign handlers so replacing one article does not accumulate listeners.
  document.querySelectorAll('[data-series-rank]').forEach(input => input.onchange = () => {
    const id = Number(input.dataset.seriesRank);
    seriesPartChoices.set(id, {...seriesPartChoices.get(id), levelId: Number(input.value)});
    replaceSeriesPart(series, id);
  });
  document.querySelectorAll('[data-series-level]').forEach(input => input.onchange = () => {
    const id = Number(input.dataset.seriesLevel);
    const part = series.parts.find(p => p.id === id);
    const choice = seriesPartChoices.get(id);
    const level = part.levels.find(l => l.Id === choice.levelId);
    const growLevel = Math.min(level.maxGrowLevel, Math.max(0, Math.trunc(Number(input.value)) || 0));
    input.value = growLevel;
    seriesPartChoices.set(id, {...choice, growLevel});
    document.querySelector(`[data-series-status="${id}"]`).innerHTML = seriesCurrentStatusHtml(series, part, level, growLevel);
  });
  document.querySelectorAll('[data-series-max]').forEach(button => button.onclick = () => {
    const id = Number(button.dataset.seriesMax);
    const level = series.parts.find(p => p.id === id).levels.at(-1);
    seriesPartChoices.set(id, {...seriesPartChoices.get(id), levelId: level.Id, growLevel: level.maxGrowLevel});
    replaceSeriesPart(series, id);
  });
  for (const kind of ['legend', 'ace']) {
    document.querySelectorAll(`[data-series-${kind}]`).forEach(input => input.onchange = () => {
      const id = Number(input.dataset[kind === 'ace' ? 'seriesAce' : 'seriesLegend']);
      const part = series.parts.find(p => p.id === id);
      const choice = {...seriesPartChoices.get(id), [kind + 'Level']: Number(input.value)};
      seriesPartChoices.set(id, choice);
      document.querySelector(`[data-series-aura-status="${id}"]`).innerHTML = seriesPartAuraHtml(part, choice);
      const level = part.levels.find(l => l.Id === choice.levelId);
      document.querySelector(`[data-series-status="${id}"]`).innerHTML = seriesCurrentStatusHtml(series, part, level, choice.growLevel);
    });
  }
  document.querySelectorAll('[data-series-aura-max]').forEach(button => button.onclick = () => {
    const id = Number(button.dataset.seriesAuraMax);
    seriesPartChoices.set(id, {...seriesPartChoices.get(id),
      legendLevel: DATA.coordinateAuras.legend.at(-1).LegendAuraLevel,
      aceLevel: DATA.coordinateAuras.ace.at(-1).AceAuraLevel});
    replaceSeriesPart(series, id);
  });
}

function seriesAuraHtml() {
  const auras = DATA.coordinateAuras;
  if (!auras) return '';
  return `<div class="card"><h3>オーラ性能（共通・Lv0〜最大）</h3><p class="series-note">ACEは固定値、LEGENDは割合で能力を追加します。</p><details><summary>エースオーラ 全Lv</summary>${seriesTable(['Lv','ウエア等：最大アピール','シューズ等：演技力／歌唱力','ブック／ノート：会心値','バッグ：フィジカル','ウォレット：ディフェンス','アクセサリ：メンタル','必要ポイント（差分）'], auras.ace.map(r => [r.AceAuraLevel,r.WeaponAdditional,r.SubWeaponAdditional,r.RingAdditional,r.HelmetAdditional,r.ArmorAdditional,r.BeltAdditional,r.DiffAuraCount]))}</details><details><summary>レジェンドオーラ 全Lv</summary>${seriesTable(['Lv','ウエア等：アピール力','シューズ等：HP吸収','ブック／ノート：会心アピール','バッグ：フィジカル','ウォレット：自動HP回復','アクセサリ：メンタル','必要ポイント（差分）'], auras.legend.map(r => [r.LegendAuraLevel,...['WeaponRate','SubWeaponAdditionalRate','RingAdditionalRate','HelmetRate','ArmorAdditionalRate','BeltRate'].map(k => seriesNumber(Math.fround(Math.fround(r[k]) * 100)) + '%'),r.DiffAuraCount]))}</details></div>`;
}

function exclusiveEquipmentGroups(card) {
  const groups = new Map();
  for (const equipment of card.exclusiveEquipments || []) {
    if (!equipment.growth) continue;
    const part = equipment.growth;
    const key = `${card.id}-${part.EquipmentType}-${part.EquipableUnitType}`;
    if (!groups.has(key)) groups.set(key, {key, variants: []});
    groups.get(key).variants.push(equipment);
  }
  return [...groups.values()];
}

function exclusiveEquipmentPart(equipment) {
  return {...equipment.growth, exclusiveEffects: equipment.effects || [],
    coordinateLabel: [equipment.equipmentTypeName, equipment.grade, equipment.setName].filter(Boolean).join(' / ')};
}

function exclusiveSelectedVariant(group) {
  const selected = group.variants.find(e => e.id === exclusiveVariantChoices.get(group.key));
  if (selected) return selected;
  const grades = {N:1, R:2, SR:3, SSR:4, UR:5, LR:6};
  const highest = [...group.variants].sort((a,b) =>
    (grades[a.grade] || 0) - (grades[b.grade] || 0) || a.growth.maxRank - b.growth.maxRank || a.id - b.id).at(-1);
  exclusiveVariantChoices.set(group.key, highest.id);
  return highest;
}

function exclusiveGroupHtml(group) {
  const selected = exclusiveSelectedVariant(group);
  const variants = group.variants.map(eq => {
    const active = eq.id === selected.id;
    return `<button type="button" class="exclusive-variant${active ? ' active' : ''}" data-exclusive-group-key="${group.key}" data-exclusive-variant="${eq.id}" aria-pressed="${active}" aria-label="${escapeHtml([eq.grade, eq.setName, eq.name].filter(Boolean).join(' / '))}">
      ${img(eq.image, eq.name, 'exclusive-variant-image')}<b>${escapeHtml(eq.grade)}</b><small>${escapeHtml(eq.setName || '')}</small></button>`;
  }).join('');
  return `<div class="exclusive-coordinate" data-exclusive-group="${group.key}"><div class="exclusive-variants" aria-label="コーデのレアリティ・シリーズ">${variants}</div>${equipmentHtml(selected)}</div>`;
}

function exclusiveEquipmentHtml(card) {
  return exclusiveEquipmentGroups(card).map(exclusiveGroupHtml).join('') +
    (card.exclusiveEquipments || []).filter(e => !e.growth).map(equipmentHtml).join('');
}

function bindExclusiveEquipments(card) {
  const groups = exclusiveEquipmentGroups(card);
  const parts = groups.flatMap(g => g.variants).map(exclusiveEquipmentPart);
  if (parts.length) bindSeriesParts({parts, starRate: parts[0].starRate});
  document.querySelectorAll('[data-exclusive-variant]').forEach(button => button.onclick = () => {
    const group = groups.find(g => g.key === button.dataset.exclusiveGroupKey);
    const current = exclusiveSelectedVariant(group);
    const nextId = Number(button.dataset.exclusiveVariant);
    if (nextId === current.id) return;
    const choice = seriesPartChoices.get(current.id) || {};
    // Share enhancement and aura settings; each variant retains its own Rank.
    seriesPartChoices.set(nextId, {...seriesPartChoices.get(nextId),
      growLevel: choice.growLevel, legendLevel: choice.legendLevel, aceLevel: choice.aceLevel});
    exclusiveVariantChoices.set(group.key, nextId);
    document.querySelector(`[data-exclusive-group="${group.key}"]`).outerHTML = exclusiveGroupHtml(group);
    bindExclusiveEquipments(card);
  });
}
