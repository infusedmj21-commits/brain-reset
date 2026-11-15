# Builds src/decks/spanish.json from the stage batch files in this folder.
# Pipeline: frequency list picks the words -> Claude writes cards in batches of ~100
# (stageN_batchM.py) -> this script assembles them -> scripts/check-deck.mjs checks
# duplicates, format and Spain-vs-Latin-America forms -> a second pass reads every example.
# Run: python3 scripts/decks/spanish/build.py && node scripts/check-deck.mjs src/decks/spanish.json
import json, re, unicodedata
N = []
def n(es, en, cards=('recog',), **kw):
    N.append(dict(es=es, en=en, cards=list(cards), **kw))
import os, glob
HERE = os.path.dirname(os.path.abspath(__file__))
for f in sorted(glob.glob(os.path.join(HERE, 'stage*_batch*.py'))):
    src = open(f).read()
    src = src.replace('N = []\n', '').replace("def n(es, en, cards=('recog',), **kw):\n    N.append(dict(es=es, en=en, cards=list(cards), **kw))\n", '')
    exec(src)

def slug(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'^(el|la|los|las) ', '', s)
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

DROP = {'ya', 'todavía', 'es', 'está', 'no me gusta', 'muy bien', 'buscar', 'llamar', 'menos', 'la vez'}
NO_PROD = {'buenas tardes', 'buenas noches', 'adiós', 'de nada', 'lo siento', '¿qué tal?', '¿cómo te llamas?', '¿puedes repetir?',
           '¿cómo se dice…?', '¿cuántos?', '¿cuál?', 'ser', 'estar', 'tener', 'hacer', 'ir', 'querer', 'poder', 'saber', 'hablar',
           'comer', 'beber', 'trabajar', 'grande', 'pequeño', 'el fin de semana', '¿qué hora es?', 'hasta luego'}
N = [x for x in N if x['es'] not in DROP]
for x in N:
    if x['es'] in NO_PROD: x['cards'] = [c for c in x['cards'] if c != 'prod']
    if x['es'] in NO_PROD and 'hint' in x: del x['hint']
FORMS = {'ser': 'soy', 'estar': 'estoy', 'tener': 'tengo', 'vivir': 'vivo', 'otro': 'otra'}
notes = []
used = set()
for x in N:
    base = slug(x['es'])
    if x['es'] == 'tú': base = 'tu-you'
    if base in used: base = f"{base}-{slug(x['en'].split(' / ')[0].replace('the ', ''))}"
    used.add(base)
    note = {'id': f"es:{base}", 'stage': 1, 'es': x['es'], 'en': x['en'], 'cards': x['cards']}
    for k in ('say', 'hint', 'note', 'image'):
        if k in x: note[k] = x[k]
    if 'example' in x: note['example'] = {'es': x['example'][0], 'en': x['example'][1]}
    if x['es'] in FORMS: note['form'] = FORMS[x['es']]
    notes.append(note)

deck = {
    'id': 'es', 'name': 'Spanish (Spain)', 'order': 1, 'lang': 'es-ES',
    'source': 'Stage plan from the deep research report (15 Nov 2026). Word choice: report categories, ordered by wordfreq (CC BY-SA 4.0) frequency; Spain vocabulary throughout.',
    'stages': [
        {'id': 1, 'name': 'Sounds + survival'},
        {'id': 2, 'name': 'Sentence building'},
        {'id': 3, 'name': 'Everyday situations'},
        {'id': 4, 'name': 'Conversation'},
        {'id': 5, 'name': 'Personal layer'}
    ],
    'notes': notes
}
json.dump(deck, open(os.path.join(HERE, '..', '..', '..', 'src', 'decks', 'spanish.json'), 'w'), ensure_ascii=False, indent=1)
print(len(notes), 'notes,', sum(len(x['cards']) for x in notes), 'cards')
