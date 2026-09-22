#!/usr/bin/env node
/* ==========================================================================
   build.js — fabrique un fichier HTML autonome
   --------------------------------------------------------------------------
   Lit index.html, remplace chaque <link rel=stylesheet> et chaque <script src>
   par son contenu, dans l'ordre d'origine (cet ordre compte : les modules se
   déclarent sur `window` et se lisent entre eux au chargement).

   Usage : node build.js [sortie]
   Aucune dépendance. Le résultat se double-clique et marche hors ligne.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'index.html');
const OUT = path.resolve(ROOT, process.argv[2] || 'dodge-trainer.html');

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) throw new Error('fichier introuvable : ' + rel);
  return fs.readFileSync(p, 'utf8');
}

/* Une chaîne « </script> » à l'intérieur du JS refermerait la balise qui
   l'englobe. On neutralise la séquence sans changer la valeur exécutée. */
function safeForInlineScript(js) {
  return js.replace(/<\/script/gi, '<\\/script');
}

let html = read('index.html');
const inlined = [];
let bytes = 0;

// --- feuilles de style ---------------------------------------------------
html = html.replace(/[ \t]*<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>\s*/gi,
  (m, href) => {
    const css = read(href);
    inlined.push(href); bytes += css.length;
    return '<style>\n' + css.trim() + '\n</style>\n';
  });

// --- scripts -------------------------------------------------------------
html = html.replace(/[ \t]*<script[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>\s*/gi,
  (m, src) => {
    const js = read(src);
    inlined.push(src); bytes += js.length;
    return '<script>\n/* ==== ' + src + ' ==== */\n' + safeForInlineScript(js).trim() + '\n</script>\n';
  });

// Rien ne doit subsister qui pointe vers un fichier externe.
const leftover = html.match(/(?:src|href)=["'](?!data:|#|https?:)([^"']+)["']/gi) || [];
if (leftover.length) {
  console.error('ERREUR : références externes non résolues :', leftover.join(', '));
  process.exit(1);
}

const stamp = new Date().toISOString().slice(0, 10);
html = html.replace(/<head>/i,
  '<head>\n<!-- DODGE TRAINER — fichier autonome, généré le ' + stamp +
  ' par build.js.\n     ' + inlined.length + ' fichiers sources inlinés. ' +
  'Ne pas éditer : modifier les sources puis relancer `node build.js`. -->');

fs.writeFileSync(OUT, html, 'utf8');

const kb = n => (n / 1024).toFixed(0) + ' Ko';
console.log('✓ ' + path.relative(ROOT, OUT) + '  —  ' + kb(Buffer.byteLength(html, 'utf8')));
console.log('  ' + inlined.length + ' fichiers inlinés (' + kb(bytes) + ' de source)');
console.log('  aucune dépendance externe : se double-clique, marche hors ligne');
