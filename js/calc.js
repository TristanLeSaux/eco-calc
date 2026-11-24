/* Logique de calcul d'ECO Calc (sans DOM, testable sous Node).
   labeur    = base x modificateur du niveau de skill x (1 + somme % labeur des upgrades)
   ressource = base x multiplicateur global x (1 + somme % ressources des upgrades) x talent (ex. Lavish 0,95)
   coût      = (somme ingredients x prix + labeur x prix/1000) / quantité produite
   Les upgrades de spécialité ne s'appliquent qu'aux recettes de leur skill. Un ingrédient « fixe » n'est pas réduit. */
(function (root) {
  'use strict';

  const MAX_LEVEL = 7;
  const TALENT_LEVELS = [3, 6];

  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const byName = (a, b) => a.name.localeCompare(b.name);
  const push = (map, key, value) => { if (!map.has(key)) map.set(key, []); map.get(key).push(value); };

  /* Index des recettes, des tags et de la recherche. */
  class RecipeIndex {
    constructor(D) {
      this.byId = new Map();
      this.byItem = new Map();
      this.tagItems = new Map();
      this.search = [];
      this.costTalents = new Set();
      this.raw = new Set();
      this.indexRecipes(D);
      this.indexTags(D);
      this.indexCraftable();
      this.indexRawMaterials(D);
      this.search.sort(byName);
    }

    indexRecipes(D) {
      for (const r of D.recipes) {
        if (r.kind && r.kind !== 'family' || !r.outputs.length) continue;
        this.byId.set(r.id, r);
        push(this.byItem, r.outputs[0].item, r);
        for (const g of r.ingredients) if (g.talent) this.costTalents.add(g.talent);
      }
    }

    indexTags(D) {
      for (const [id, e] of Object.entries(D.items))
        for (const t of e.tags || []) push(this.tagItems, t, id);
    }

    indexCraftable() {
      for (const [item, rs] of this.byItem) {
        rs.sort((a, b) => ((a.reqLevel || 0) - (b.reqLevel || 0)) || (a.ingredients.length - b.ingredients.length) || a.name.localeCompare(b.name));
        const name = rs[0].outputs[0].name;
        this.search.push({ item, name, norm: norm(name + ' ' + rs.map(r => r.name).join(' ')), src: rs[0].src, n: rs.length });
      }
    }

    /* Matières premières : items jamais fabriqués, utilisés comme ingrédient ou portant un tag d'ingrédient (ex. les logs du tag Wood). */
    indexRawMaterials(D) {
      const ingItems = new Set(), ingTags = new Set();
      for (const r of this.byId.values()) for (const g of r.ingredients) (g.item ? ingItems : ingTags).add(g.item || g.tag);
      for (const [id, e] of Object.entries(D.items)) {
        if (!id.endsWith('Item') || this.byItem.has(id)) continue;
        if (ingItems.has(id) || (e.tags || []).some(t => ingTags.has(t))) {
          this.raw.add(id);
          this.search.push({ item: id, name: e.name, norm: norm(e.name), src: e.src, n: 0, raw: true });
        }
      }
    }
  }

  /* Calcul des coûts pour un état donné (niveaux, talents, upgrades cochés, prix saisis). */
  class Pricing {
    constructor(D, I, S) {
      this.D = D; this.I = I; this.S = S;
      this.memo = new Map();
      this.outSet = new Map();
      for (const o of S.outputs) {
        const r = I.byId.get(o.recipeId) || (I.byItem.get(o.item) || [])[0];
        this.outSet.set(o.item, r ? { o, r } : { o, r: null, raw: true });   // sans recette : matière première, prix saisi à la main
      }
    }

    level(sk) { return Math.min(Math.max(this.S.levels[sk] ?? 1, 0), MAX_LEVEL); }

    talentSet(sk) {
      const set = new Set();
      for (const L of TALENT_LEVELS) {
        const g = this.D.talentGroups[(this.S.talents[sk] || {})[L]];
        if (g && g.skill === sk && this.level(sk) >= L) g.talents.forEach(t => set.add(t));
      }
      return set;
    }

    activeUps(r) {
      const t = this.D.tables[r.table], checked = this.S.ups[r.table] || {}, out = [];
      if (!t) return out;
      for (const id of t.upgrades) {
        const u = this.D.upgrades[id];
        if (!u || u.deprecated || !checked[id]) continue;
        if (u.skills.length && !u.skills.includes(r.skill)) continue;
        out.push(u);
      }
      return out;
    }

    labor(r) {
      const sk = r.skill && this.D.skills[r.skill];
      const mod = sk ? (sk.levels[this.level(r.skill)] ?? 1) : 1;
      return r.labor * mod * Math.max(0, 1 + this.activeUps(r).reduce((a, u) => a + u.labor, 0));
    }

    quantity(r, ing) {
      let q = ing.qty * (this.S.resMod || 1);
      if (ing.fixed) return q;
      q *= Math.max(0, 1 + this.activeUps(r).reduce((a, u) => a + u.resource, 0));
      if (ing.talent && r.skill && this.talentSet(r.skill).has(ing.talent)) {
        const v = this.D.talents[ing.talent] && this.D.talents[ing.talent].value;
        if (v) q *= v;
      }
      return q;
    }

    price(key) { return parseFloat(this.S.prices[key]) || 0; }

    hasTag(item, tag) { return ((this.D.items[item] || {}).tags || []).includes(tag); }

    /* Prix unitaire d'un ingrédient : sortie de la liste, sinon prix saisi. Pour un tag, le moins cher des items présents en sortie. */
    unitPrice(ing, visited) {
      if (ing.item) return this.outSet.has(ing.item) && !visited.has(ing.item) ? this.cost(ing.item, visited) : this.price(ing.item);
      const candidates = [...this.outSet.keys()].filter(i => !visited.has(i) && this.hasTag(i, ing.tag));
      if (!candidates.length) return this.price('tag:' + ing.tag);
      const costs = candidates.map(i => this.cost(i, visited)), positive = costs.filter(x => x > 0);   // un prix non renseigné (0) n'écrase pas les autres
      return positive.length ? Math.min(...positive) : 0;
    }

    cost(item, visited) {
      if (this.memo.has(item)) return this.memo.get(item);
      const { r, raw } = this.outSet.get(item);
      if (raw) return this.price(item);
      const seen = new Set(visited).add(item);
      let x = 0;
      for (const ing of r.ingredients) x += this.quantity(r, ing) * this.unitPrice(ing, seen);
      x += this.labor(r) * (this.S.ppk || 0) / 1000;
      x /= r.outputs[0].qty;
      this.memo.set(item, x);
      return x;
    }

    run() {
      const { D, I, S } = this;
      const outputs = [], inputs = new Map(), skills = new Set(), tables = new Set();
      for (const [item, { o, r, raw }] of this.outSet) {
        if (raw) {
          const c = this.price(item);
          outputs.push({ item, name: (D.items[item] || {}).name || item, raw: true, recipe: null, alts: [], cost: c, profit: 0, sell: c, labor: 0, ings: [] });
          continue;
        }
        const c = this.cost(item, new Set()), profit = o.profit == null || o.profit === '' ? (S.profit || 0) : o.profit;
        outputs.push({ item, name: r.outputs[0].name, recipe: r, alts: I.byItem.get(item) || [r], cost: c, profit, sell: c * (1 + profit / 100),
          labor: this.labor(r), ings: r.ingredients.map(g => ({ name: g.name, qty: this.quantity(r, g) })) });
        if (r.skill && D.skills[r.skill]) skills.add(r.skill);
        if (r.table) tables.add(r.table);
        for (const g of r.ingredients) {
          if (g.item) { if (!this.outSet.has(g.item)) inputs.set(g.item, { key: g.item, name: g.name, tag: false }); }
          else if (![...this.outSet.keys()].some(i => this.hasTag(i, g.tag))) inputs.set('tag:' + g.tag, { key: 'tag:' + g.tag, name: g.tag, tag: true });
        }
      }
      return {
        outputs,
        inputs: [...inputs.values()].sort(byName),
        skills: [...skills].sort((a, b) => D.skills[a].name.localeCompare(D.skills[b].name)),
        tables: [...tables].sort((a, b) => D.tables[a].name.localeCompare(D.tables[b].name)),
      };
    }
  }

  const newState = () => ({ ppk: 1, profit: 0, resMod: 1, outputs: [], levels: {}, talents: {}, ups: {}, prices: {} });

  const api = {
    norm, newState, MAX_LEVEL, TALENT_LEVELS,
    index: D => new RecipeIndex(D),
    compute: (D, I, S) => new Pricing(D, I, S).run(),
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.EcoCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);
