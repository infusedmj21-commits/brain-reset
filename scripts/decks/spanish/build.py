# Builds src/decks/spanish.json.
#   1. rank.py decides the words (SUBTLEX-ESP order, lemma grouping, visible corrections/swaps).
#   2. text_stageN.py holds the card text Claude wrote for exactly those words.
#   3. This script joins them and refuses to build if text exists for a word the list didn't
#      choose, or a chosen word has no text.
#   4. scripts/check-deck.mjs checks format, duplicates and Spain vs Latin America forms.
# Run: python3 scripts/decks/spanish/rank.py SUBTLEX.json lemmatization-es.txt ranked-stages.json
#      python3 scripts/decks/spanish/build.py ranked-stages.json
import json, os, re, sys, unicodedata, glob
HERE = os.path.dirname(os.path.abspath(__file__))
ranked = json.load(open(sys.argv[1], encoding='utf-8'))
SWAPS = {'auto', 'autos', 'carro', 'carros', 'celular', 'computadora', 'jugo', 'boleto', 'plata', 'lindo', 'linda', 'acá'}
REGIONAL = {'vos', 'ustedes', 'usted'}
TEXT = {}
def T(lemma, es, en, cards=('recog',), **kw):
    if lemma in TEXT: raise SystemExit(f'text written twice for {lemma}')
    TEXT[lemma] = dict(es=es, en=en, cards=list(cards), **kw)
for f in sorted(glob.glob(os.path.join(HERE, 'text_stage*.py'))):
    exec(open(f, encoding='utf-8').read())

def slug(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

built_stages = sorted({int(re.search(r'stage(\d+)', f).group(1)) for f in glob.glob(os.path.join(HERE, 'text_stage*.py'))})
chosen = [e for e in ranked if e['stage'] in built_stages]
missing = [e['lemma'] for e in chosen if e['lemma'] not in TEXT]
extra = sorted(set(TEXT) - {e['lemma'] for e in chosen})
if missing or extra:
    raise SystemExit(f'words and text disagree.\n  chosen by the list but no text: {missing}\n  text for words the list did not choose: {extra}')

notes, ids = [], set()
for e in chosen:
    t = TEXT[e['lemma']]
    base = slug(e['lemma']) if e['lemma'] != 'tú' else 'tu-you'
    if base in ids: base += '-2'
    ids.add(base)
    note = {'id': f'es:{base}', 'stage': e['stage'], 'rank': e['rank'], 'es': t['es'], 'en': t['en'], 'cards': t['cards']}
    if 'image' in t['cards']: note['image'] = re.sub(r'^(el|la) ', '', t['es'])
    for k in ('hint', 'note', 'form', 'say'):  # card text extras
        if k in t: note[k] = t[k]
    if 'example' in t: note['example'] = {'es': t['example'][0], 'en': t['example'][1]}
    # Other forms you'll hear: common ones only (>= 10% of the top form), same word family
    # (shares the first two letters), and never a Latin American form that was swapped out.
    fold = lambda w: ''.join(c for c in unicodedata.normalize('NFD', w) if unicodedata.category(c) != 'Mn')
    shown = {fold(w.strip('¿?¡!')) for w in re.split(r'[ /]+', t['es'])}
    top = max((c for _, c in e['forms']), default=0)
    swapped = SWAPS
    heard = [f for f, c in e['forms']
             if fold(f) not in shown and c >= top * 0.1 and fold(f)[:2] == fold(e['lemma'])[:2] and f not in swapped and f not in REGIONAL]
    if heard and t.get('forms', True) is not False: note['forms'] = heard[:3]
    if e.get('swapped_from'): note['swapped_from'] = e['swapped_from']
    notes.append(note)

deck = {
    'id': 'es', 'name': 'Spanish (Spain)', 'order': 1, 'lang': 'es-ES',
    'credits': [
        'Word choice and order: SUBTLEX-ESP (Cuetos, Glez-Nosti, Barbón & Brysbaert, 2011), CC BY-NC-SA 4.0',
        'Word grouping: lemmatization-lists by Michal Boleslav Měchura, ODbL',
        'Card text written by Claude for the words the list chose; checked by scripts/check-deck.mjs'
    ],
    'stages': [
        {'id': 1, 'name': 'Sounds + survival'}, {'id': 2, 'name': 'Sentence building'}, {'id': 3, 'name': 'Everyday situations'},
        {'id': 4, 'name': 'Conversation'}, {'id': 5, 'name': 'Personal layer'}
    ],
    'notes': notes
}
out = os.path.join(HERE, '..', '..', '..', 'src', 'decks', 'spanish.json')
json.dump(deck, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{len(notes)} notes, {sum(len(n["cards"]) for n in notes)} cards, stages {built_stages}')
