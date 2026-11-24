'use strict';

const $ = selector => document.querySelector(selector);

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = s => String(s).replace(/[&<>"]/g, c => ESCAPES[c]);

const fmt = n => (+n || 0).toLocaleString('fr-FR', { maximumFractionDigits: n < 1 ? 3 : 2 });

const num = v => {
  const x = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(x) ? x : 0;
};
