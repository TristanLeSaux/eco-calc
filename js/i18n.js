'use strict';

/* Noms français : affichés en gris à côté du nom anglais, ou seuls (non grisés) quand le nom anglais n'existe pas. */
class I18n {
  constructor(D, translations) {
    this.D = D;
    this.fr = (translations && translations.fr) || {};
    this.frOnly = new Set((translations && translations.only) || []);
  }

  frOf(id) {
    const item = this.D.items[id];
    return (item && item.fr) || this.fr[id] || null;
  }

  /* HTML du nom d'un item. */
  label(id, name) {
    const fr = id && this.frOf(id);
    if (!fr) return esc(name);
    const item = this.D.items[id];
    if (this.frOnly.has(id) || (item && item.fr && !item.name)) return esc(fr);
    return fr.toLowerCase() === String(name).toLowerCase() ? esc(name) : esc(name) + '<span class="fr">' + esc(fr) + '</span>';
  }

  /* Ajoute le nom français aux entrées de recherche (la recherche accepte alors FR et EN). */
  annotate(searchEntries, norm) {
    for (const x of searchEntries) {
      const fr = this.frOf(x.item);
      if (fr) { x.fr = fr; x.norm += ' ' + norm(fr); }
    }
  }
}
