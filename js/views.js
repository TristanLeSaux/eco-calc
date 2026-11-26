'use strict';

const UPGRADE_ORDER = ['Basic', 'Advanced', 'Modern', 'Specialty'];
const UPGRADE_WORDS = { Basic: 'Basique', Advanced: 'Avancé', Modern: 'Moderne' };
const GROUP_RAW = '~raw';
const GROUP_NONE = '~none';

/* Rendu des trois colonnes (compétences et tables, contributions, sorties) à partir de l'état du Store. */
class Views {
  constructor({ D, C, I, i18n, icons, store }) {
    Object.assign(this, { D, C, I, i18n, icons, store });
    this.R = null;
  }

  get S() { return this.store.state; }

  /* ---------- Cycle de rendu ---------- */

  compute() { this.R = this.C.compute(this.D, this.I, this.S); }

  render() {
    this.compute();
    this.renderLeft();
    this.renderMid();
    this.renderRight();
  }

  /* Met à jour les chiffres sans toucher aux champs en cours de saisie. */
  refresh() {
    this.compute();
    for (const o of this.R.outputs) {
      if (o.raw) continue;
      const find = attr => document.querySelector(`[${attr}="${CSS.escape(o.item)}"]`);
      const cost = find('data-cost'), sell = find('data-sell'), row = find('data-item');
      if (cost) cost.textContent = fmt(o.cost);
      if (sell) sell.textContent = fmt(o.sell);
      if (row) row.title = this.tooltip(o);
    }
  }

  /* ---------- Groupes de sorties ---------- */

  groupKey(o) { return o.raw ? GROUP_RAW : (o.recipe.skill || GROUP_NONE); }

  groupName(k) {
    if (k === GROUP_RAW) return 'Matières premières';
    if (k === GROUP_NONE) return 'Sans métier';
    return (this.D.skills[k] || {}).name || k;
  }

  compareGroups(a, b) {
    return (a[0][0] === '~') - (b[0][0] === '~') || (a[0] === GROUP_RAW) - (b[0] === GROUP_RAW) || this.groupName(a[0]).localeCompare(this.groupName(b[0]));
  }

  /* ---------- Libellés ---------- */

  tooltip(o) {
    if (o.raw) return o.name;
    return `${(this.D.tables[o.recipe.table] || {}).name || ''} · ${fmt(o.labor)} cal · ` + (o.qty > 1 ? `${fmt(o.qty)} par craft · ` : '') + o.ings.map(g => `${fmt(g.qty)}× ${g.name}`).join(', ');
  }

  upgradeTitle(u) {
    const pc = v => (v > 0 ? '+' : '') + Math.round(v * 100) + ' %';
    const only = u.skills.length ? ' (seulement ' + u.skills.map(s => (this.D.skills[s] || {}).name || s).join(', ') + ')' : '';
    return `${u.name} : ressources ${pc(u.resource)}, calories ${pc(u.labor)}, temps ×${u.time}` + only;
  }

  upgradeLabel(u) {
    if (u.kind !== 'Specialty') return UPGRADE_WORDS[u.kind] || u.name;
    return u.name.replace(/ Upgrade$/, '').replace(/\b(Basic|Advanced|Modern)\b/g, w => UPGRADE_WORDS[w]);
  }

  /* ---------- Colonne de gauche ---------- */

  renderLeft() {
    let h = '<h2>Compétences</h2>';
    if (!this.R.skills.length) h += '<div class="hint">Les métiers apparaissent automatiquement quand tu ajoutes une sortie.</div>';
    for (const id of this.R.skills) h += this.skillBlock(id);
    h += '<h2 style="margin-top:22px">Tables</h2>';
    if (!this.R.tables.length) h += '<div class="hint">Les tables de craft apparaissent automatiquement.</div>';
    for (const t of this.R.tables) h += this.tableBlock(t);
    $('#left').innerHTML = h;
  }

  skillBlock(id) {
    const skill = this.D.skills[id], level = this.S.levels[id] ?? 1;
    const talents = this.C.TALENT_LEVELS.filter(L => level >= L).map(L => this.talentSelect(id, L)).join('');
    return `<div class="blk"><div class="row"><span>${esc(skill.name)}</span><input type="number" min="1" max="${skill.max || this.C.MAX_LEVEL}" value="${level}" data-act="level" data-id="${id}"></div>`
      + (talents ? `<div class="sub">${talents}</div>` : '') + '</div>';
  }

  talentSelect(skillId, level) {
    const groups = Object.entries(this.D.talentGroups).filter(([, g]) => g.skill === skillId && g.level === level);
    if (!groups.length) return '';
    const current = (this.S.talents[skillId] || {})[level] || '';
    const options = groups.map(([k, g]) => {
      const value = g.talents.map(t => this.I.costTalents.has(t) && this.D.talents[t].value).find(Boolean);
      const max = this.C.maxStars(this.D, k);
      const note = value ? ` (ressources ×${value})` : max > 1 ? ` (jusqu'à ${max} étoiles)` : '';
      return `<option value="${k}"${k === current ? ' selected' : ''} title="${esc(g.desc || '')}">${esc(g.name)}${note}</option>`;
    }).join('');
    const max = current ? this.C.maxStars(this.D, current) : 1;
    const stars = max > 1
      ? `<span>Étoiles</span><input type="number" min="1" max="${max}" value="${Math.min(max, (this.S.stars || {})[current] || 1)}" data-act="stars" data-g="${current}">`
      : '';
    return `<span>Talent niv. ${level}</span><select data-act="talent" data-id="${skillId}" data-lv="${level}"><option value="">Aucun</option>${options}</select>${stars}`;
  }

  tableBlock(t) {
    const table = this.D.tables[t];
    const skills = new Set(this.R.outputs.filter(o => !o.raw && o.recipe.table === t).map(o => o.recipe.skill));
    const upgrades = table.upgrades.map(u => [u, this.D.upgrades[u]])
      .filter(([, x]) => x && !x.deprecated && (x.kind !== 'Specialty' || x.skills.some(s => skills.has(s))))
      .sort((a, b) => UPGRADE_ORDER.indexOf(a[1].kind) - UPGRADE_ORDER.indexOf(b[1].kind) || a[1].name.localeCompare(b[1].name));
    const checked = this.S.ups[t] || {};
    const list = upgrades.length
      ? '<div class="ups">' + upgrades.map(([u, x]) =>
        `<label class="chk" title="${esc(this.upgradeTitle(x))}"><input type="checkbox" data-act="up" data-t="${t}" data-u="${u}"${checked[u] ? ' checked' : ''}>${esc(this.upgradeLabel(x))}</label>`).join('') + '</div>'
      : '<div class="hint" style="margin-left:36px">Aucune amélioration possible.</div>';
    return `<div class="blk"><div class="thead">${this.icons.table(t)}<span>${esc(table.name)}</span></div>${list}</div>`;
  }

  /* ---------- Colonne du milieu ---------- */

  renderMid() {
    const S = this.S;
    let h = `<h2>Contributions</h2>
      <div class="row"><span>Prix par 1000 calories</span><input type="number" min="0" step="any" value="${S.ppk}" data-act="ppk"></div>
      <div class="row"><span>Pourcentage de profit par défaut</span><input type="number" min="0" step="any" value="${S.profit}" data-act="profit"></div>
      <h3>Matières premières</h3>`;
    if (!this.R.inputs.length) h += '<div class="hint">Ajoute une sortie à droite : ses ingrédients apparaissent ici. Entre leur coût pour calculer les prix.</div>';
    for (const i of this.R.inputs) h += this.inputRow(i);
    $('#mid').innerHTML = h;
  }

  inputRow(i) {
    const v = this.S.prices[i.key];
    const icon = i.tag ? this.icons.tag(i.key.replace(/^tag:/, '')) : this.icons.item(i.key);
    const name = i.tag ? esc(i.name) : this.i18n.label(i.key, i.name);
    return `<div class="row"><span class="nm">${icon}<span>${name}</span>${i.tag ? '<span class="tag">tag</span>' : ''}</span>`
      + `<input type="number" min="0" step="any" value="${v ?? ''}" placeholder="0" class="${num(v) ? '' : 'empty'}" data-act="price" data-k="${esc(i.key)}"></div>`;
  }

  /* ---------- Colonne de droite ---------- */

  renderRight() {
    const query = $('#search') ? $('#search').value : '';
    let h = '<h2>Les sorties</h2><input id="search" placeholder="Rechercher un objet (3 caractères minimum)…" autocomplete="off"><div id="res" hidden></div>';
    if (!this.R.outputs.length) h += '<div class="hint">Cherche un objet à fabriquer, ou une matière première (ex. un log) pour y saisir son prix.</div>';
    const groups = new Map();
    for (const o of this.R.outputs) {
      const k = this.groupKey(o);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(o);
    }
    for (const [k, outputs] of [...groups].sort((a, b) => this.compareGroups(a, b))) h += this.groupBlock(k, outputs);
    $('#right').innerHTML = h;
    if (query) $('#search').value = query;
  }

  groupBlock(k, outputs) {
    const closed = this.S.collapsed[k] ? ' closed' : '';
    return `<div class="grp${closed}"><div class="gh" data-act="toggle" data-g="${esc(k)}"><span class="chev">▾</span><span class="t">${esc(this.groupName(k))}</span><small>${outputs.length}</small>`
      + `<button class="x" data-act="rmgrp" data-g="${esc(k)}" title="Retirer le groupe">✕</button></div><div class="gb">${outputs.map(o => this.outputRow(o)).join('')}</div></div>`;
  }

  outputRow(o) {
    const item = esc(o.item), S = this.S;
    const name = `${this.icons.item(o.item)}<div class="nmc"><b>${this.i18n.label(o.item, o.name)}</b>`;
    const remove = `<button class="x" data-act="rm" data-i="${item}" title="Retirer">✕</button>`;
    if (o.raw) {
      const v = S.prices[o.item];
      return `<div class="orow rawrow" data-item="${item}" title="${esc(this.tooltip(o))}">${name}</div>`
        + `<label class="f p"><small>Prix</small><input type="number" min="0" step="any" value="${v ?? ''}" placeholder="0" class="${num(v) ? '' : 'empty'}" data-act="price" data-k="${item}"></label>${remove}</div>`;
    }
    const alternatives = o.alts.length > 1
      ? `<select data-act="recipe" data-i="${item}">` + o.alts.map(r =>
        `<option value="${r.id}"${r.id === o.recipe.id ? ' selected' : ''}>${esc(r.name)}${r.src !== 'core' ? ' [' + esc(r.src.replace('mod:', '')) + ']' : ''}</option>`).join('') + '</select>'
      : '';
    const entry = S.outputs.find(x => x.item === o.item) || {};
    return `<div class="orow" data-item="${item}" title="${esc(this.tooltip(o))}">${name}${alternatives}</div>`
      + `<label class="f"><small>Coût</small><b data-cost="${item}">${fmt(o.cost)}</b></label>`
      + `<label class="f"><small>Profit %</small><input type="number" step="any" min="0" value="${entry.profit ?? ''}" placeholder="${S.profit}" data-act="oprofit" data-i="${item}"></label>`
      + `<label class="f"><small>Vendre</small><b data-sell="${item}">${fmt(o.sell)}</b></label>${remove}</div>`;
  }

  /* ---------- Recherche (à partir de 3 caractères, items fabricables et matières premières) ---------- */

  search(query) {
    const box = $('#res'), n = this.C.norm(query.trim());
    if (n.length < 3) { box.hidden = true; return; }
    const have = new Set(this.S.outputs.map(o => o.item));
    const startsWith = x => (this.C.norm(x.name).startsWith(n) || this.C.norm(x.fr || '').startsWith(n)) ? 0 : 1;
    const hits = this.I.search.filter(x => !have.has(x.item) && x.norm.includes(n))
      .sort((a, b) => startsWith(a) - startsWith(b) || a.name.localeCompare(b.name)).slice(0, 40);
    box.hidden = false;
    box.innerHTML = hits.length ? hits.map(x => this.searchHit(x)).join('') : '<div class="mut">Aucun résultat</div>';
  }

  searchHit(x) {
    const info = (x.raw ? 'matière première' : x.n > 1 ? x.n + ' recettes' : '') + (x.src !== 'core' ? ' · ' + esc(x.src.replace('mod:', '')) : '');
    return `<div data-act="add" data-i="${esc(x.item)}"><span class="nm">${this.icons.item(x.item)}${this.i18n.label(x.item, x.name)}</span><small class="mut">${info}</small></div>`;
  }
}
