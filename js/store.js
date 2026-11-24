'use strict';

/* État de l'application, sauvegardé dans le navigateur. Les vues s'abonnent aux changements.
   commit('full') : redessine tout ; commit('values') : met à jour les chiffres ; commit('silent') : sauvegarde seulement. */
class Store {
  constructor(key, createState) {
    this.key = key;
    this.createState = createState;
    this.listeners = new Set();
    this.state = this.load();
  }

  load() {
    const state = this.createState();
    try { Object.assign(state, JSON.parse(localStorage.getItem(this.key) || '{}')); } catch (e) { /* sauvegarde illisible : état neuf */ }
    state.collapsed = state.collapsed || {};
    return state;
  }

  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.state)); } catch (e) { /* stockage indisponible */ }
  }

  subscribe(listener) { this.listeners.add(listener); }

  commit(kind = 'full') {
    this.save();
    if (kind !== 'silent') for (const l of this.listeners) l(kind);
  }

  reset() {
    this.state = this.createState();
    this.state.collapsed = {};
    this.commit('reset');
  }
}
