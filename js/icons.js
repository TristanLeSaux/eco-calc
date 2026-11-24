'use strict';

/* Icônes disponibles (data/icons.js) : une icône absente laisse un espace vide au lieu d'une requête perdue. */
class Icons {
  constructor(manifest) {
    this.available = {};
    for (const kind of ['items', 'tags', 'tables']) this.available[kind] = new Set((manifest && manifest[kind]) || []);
  }

  html(kind, id) {
    return this.available[kind].has(id)
      ? `<img class="ic" alt="" src="icons/${kind}/${encodeURIComponent(id)}.webp">`
      : '<span class="ic"></span>';
  }

  item(id) { return this.html('items', id); }
  tag(id) { return this.html('tags', id); }
  table(id) { return this.html('tables', id); }
}
