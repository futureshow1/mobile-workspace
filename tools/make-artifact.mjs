/* Buduje plik dla Artifactu z index.html.
   Artifact dokłada własne <head>, więc zostawiamy tylko <title>, <style> i treść <body>.
   Użycie: node tools/make-artifact.mjs <ścieżka-wyjściowa> */
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const out = process.argv[2];
if (!out) { console.error('podaj ścieżkę wyjściową'); process.exit(1); }

const pick = (re, label) => {
  const m = html.match(re);
  if (!m) throw new Error('nie znaleziono: ' + label);
  return m[0];
};
const title = pick(/<title>[\s\S]*?<\/title>/, '<title>');
const style = pick(/<style>[\s\S]*?<\/style>/, '<style>');
const body = html.match(/<body>([\s\S]*)<\/body>/);
if (!body) throw new Error('nie znaleziono <body>');

fs.writeFileSync(out, `${title}\n${style}\n${body[1].trim()}\n`);
console.log('zapisano', out, '·', fs.statSync(out).size, 'B');
