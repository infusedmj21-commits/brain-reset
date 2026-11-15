// Checks a deck file before it ships: node scripts/check-deck.mjs src/decks/spanish.json
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const deck = JSON.parse(readFileSync(file, 'utf8'));
const TYPES = new Set(['recog', 'prod', 'audio', 'image', 'cloze', 'typed']);
// Latin American forms that should be their Spain equivalents in active vocabulary.
const LATAM = { carro: 'coche', celular: 'móvil', computadora: 'ordenador', jugo: 'zumo', boleto: 'billete', manejar: 'conducir', computador: 'ordenador', 'chévere': 'guay', 'platicar': 'charlar' };
const problems = [];
const seenId = new Set();
const seenEs = new Set();
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const stem = (s) => fold(s).replace(/^(el|la|los|las|un|una) /, '').replace(/[¿?¡!….,]/g, '').trim();

for (const n of deck.notes) {
  const where = `${n.id} (${n.es})`;
  for (const k of ['id', 'es', 'en', 'cards', 'stage']) if (n[k] == null || n[k] === '') problems.push(`${where}: missing ${k}`);
  if (seenId.has(n.id)) problems.push(`${where}: duplicate id`);
  if (seenEs.has(n.es.toLowerCase())) problems.push(`${where}: duplicate Spanish`);
  seenId.add(n.id);
  seenEs.add(n.es.toLowerCase());
  for (const c of n.cards ?? []) if (!TYPES.has(c)) problems.push(`${where}: unknown card type ${c}`);
  if (new Set(n.cards).size !== n.cards.length) problems.push(`${where}: repeated card type`);
  if (n.stage === 1 && n.cards.includes('cloze')) problems.push(`${where}: no cloze in stage 1`);
  if (n.cards.includes('cloze') && !/\[.+\]/.test(n.cloze?.es ?? '')) problems.push(`${where}: cloze needs one [gap]`);
  if (n.cards.includes('image') && !n.image) problems.push(`${where}: image card without image`);
  if (n.image && !/^(el|la|los|las) /.test(n.es)) problems.push(`${where}: pictures are for nouns`);
  const text = [n.es, n.example?.es ?? '', n.cloze?.es ?? ''].join(' ');
  for (const [la, es] of Object.entries(LATAM)) {
    if (new RegExp(`\\b${la}\\b`, 'i').test(fold(text))) problems.push(`${where}: “${la}” is Latin American, use “${es}”`);
  }
  if (n.example) {
    const target = fold(n.form ?? stem(n.say ?? n.es).split(' ')[0]).slice(0, 4);
    if (target.length >= 3 && !fold(n.example.es).includes(target)) problems.push(`${where}: example doesn’t use the word`);
    if (!/[.?!…]$/.test(n.example.es)) problems.push(`${where}: example should end with punctuation`);
  }
}
const counts = {};
for (const n of deck.notes) for (const c of n.cards) counts[c] = (counts[c] ?? 0) + 1;
console.log(`${deck.notes.length} notes, ${Object.values(counts).reduce((a, b) => a + b, 0)} cards`, counts);
if (problems.length) {
  console.log(problems.join('\n'));
  process.exit(1);
}
console.log('All checks passed.');
