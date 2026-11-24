'use strict';

/* Démarrage et gestion des événements (délégation sur le document). */
class App {
  static STORAGE_KEY = 'eco-calc-14';

  constructor() {
    const D = window.ECO_DATA, C = window.EcoCalc, I = C.index(D);
    const i18n = new I18n(D, (window.ECO_FR || {}).items);
    i18n.annotate(I.search, C.norm);

    this.C = C;
    this.I = I;
    this.store = new Store(App.STORAGE_KEY, C.newState);
    this.views = new Views({ D, C, I, i18n, icons: new Icons(window.ECO_ICONS), store: this.store });

    this.store.subscribe(kind => this.onChange(kind));
    this.bindEvents();
    $('#resMod').value = this.S.resMod || 1;
    this.views.render();
  }

  get S() { return this.store.state; }

  onChange(kind) {
    if (kind === 'values') return this.views.refresh();
    if (kind === 'reset') $('#resMod').value = 1;
    this.views.render();
  }

  outputOf(item) { return this.S.outputs.find(x => x.item === item); }

  /* ---------- Événements ---------- */

  bindEvents() {
    document.addEventListener('input', e => this.onInput(e.target));
    document.addEventListener('change', e => this.onFieldChange(e.target));
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-act]');
      if (t) this.onClick(t);
    });
    $('#reset').onclick = () => { if (confirm('Tout réinitialiser ?')) this.store.reset(); };
  }

  onInput(t) {
    const S = this.S, store = this.store;
    if (t.id === 'search') return this.views.search(t.value);
    if (t.id === 'resMod') { S.resMod = num(t.value) || 1; return store.commit('values'); }
    switch (t.dataset.act) {
      case 'ppk': S.ppk = num(t.value); return store.commit('values');
      case 'profit': S.profit = num(t.value); return store.commit('values');
      case 'price':
        S.prices[t.dataset.k] = t.value;
        t.classList.toggle('empty', !num(t.value));
        return store.commit('values');
      case 'oprofit': {
        const o = this.outputOf(t.dataset.i);
        if (!o) return;
        o.profit = t.value === '' ? null : num(t.value);
        return store.commit('values');
      }
    }
  }

  onFieldChange(t) {
    const S = this.S, store = this.store, d = t.dataset;
    switch (d.act) {
      case 'level':
        S.levels[d.id] = Math.min(this.C.MAX_LEVEL, Math.max(1, Math.round(num(t.value)) || 1));
        return store.commit('full');
      case 'talent':
        (S.talents[d.id] = S.talents[d.id] || {})[d.lv] = t.value;
        return store.commit('values');
      case 'up':
        (S.ups[d.t] = S.ups[d.t] || {})[d.u] = t.checked;
        return store.commit('values');
      case 'recipe': {
        const o = this.outputOf(d.i);
        if (!o) return;
        o.recipeId = t.value;
        return store.commit('full');
      }
    }
  }

  onClick(t) {
    const S = this.S, store = this.store, d = t.dataset, views = this.views;
    switch (d.act) {
      case 'add': {
        const recipes = this.I.byItem.get(d.i);
        S.outputs.push({ item: d.i, recipeId: recipes ? recipes[0].id : null, profit: null });
        store.commit('full');
        return $('#search').focus();
      }
      case 'rm':
        S.outputs = S.outputs.filter(o => o.item !== d.i);
        return store.commit('full');
      case 'toggle':
        S.collapsed[d.g] = !S.collapsed[d.g];
        t.closest('.grp').classList.toggle('closed', !!S.collapsed[d.g]);
        return store.commit('silent');
      case 'rmgrp': {
        const ids = views.R.outputs.filter(o => views.groupKey(o) === d.g).map(o => o.item);
        if (!confirm(`Retirer les ${ids.length} sorties du groupe « ${views.groupName(d.g)} » ?`)) return;
        S.outputs = S.outputs.filter(o => !ids.includes(o.item));
        return store.commit('full');
      }
    }
  }
}

new App();
