# Builds the bar decks.
#   bar.json (Bartending basics) is general knowledge and ships with the app (src/decks/).
#   dm-menu.json and classics.json come from Dirty Martini's internal recipe sheets, so they
#   are NEVER committed: the drink data lives outside the repo, and the built decks are
#   imported in the app (Cards → Import a deck), which saves them to the user's own account.
# Run: python3 -I scripts/decks/bar/build.py [PRIVATE_DIR]
#   PRIVATE_DIR holds drinks.py; the two private decks are written there too.
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from basics import BASICS
PRIVATE = sys.argv[1] if len(sys.argv) > 1 else None
if PRIVATE:
    sys.path.insert(0, PRIVATE)
    from drinks import MENU_NEW, MENU_OCT, CERTIFIED, JUNIOR

OUT = os.path.join(HERE, '..', '..', '..', 'src', 'decks')
def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower().replace('’', '').replace("'", '')).strip('-')

def drink_note(prefix, d, stage, source):
    lines = []
    for item in d['spec']:
        amount, kind, brand, *extra = item
        line = {'amount': f'{amount:g} ml' if isinstance(amount, (int, float)) else str(amount), 'type': kind}
        if brand: line['brand'] = brand
        if extra: line['extra'] = extra[0]
        lines.append(line)
    n = {'id': f'{prefix}:{slug(d["name"])}', 'stage': stage, 'name': d['name'], 'cards': ['spec', 'serve'],
         'spec': lines, 'glass': d['glass'], 'ice': d['ice'], 'garnish': d['garnish'], 'method': d['method'], 'source': source}
    for k in ('tip', 'section'):
        if d.get(k): n[k] = d[k]
    if d['allergens'] is not None: n['allergens'] = d['allergens']
    return n

def check(notes):
    ids = [n['id'] for n in notes]
    dupes = {i for i in ids if ids.count(i) > 1}
    assert not dupes, dupes
    for n in notes:
        if 'spec' in n:
            assert n['spec'] and all(l['type'] and l['amount'] for l in n['spec']), n['name']
            for k in ('glass', 'ice', 'garnish', 'method'): assert n[k], (n['name'], k)
    return notes

decks = {}
common = {'lang': 'en-GB', 'icon': 'glass', 'audio': False}
if PRIVATE:
  # Overlaps are resolved by hand in drinks.py; make sure none slipped through.
  names = [slug(d['name'].replace(' (alcohol-free)', '')) for d in MENU_NEW + MENU_OCT + CERTIFIED + JUNIOR]
  assert len(names) == len(set(names)), sorted({n for n in names if names.count(n) > 1})
  menu = check([drink_note('dm', d, 1, 'New menu') for d in MENU_NEW] + [drink_note('dm', d, 1, 'October 2025 menu') for d in MENU_OCT]
             + [{'id': 'dm:martini-offer', 'stage': 1, 'q': 'The £15 house martini offer includes…', 'a': 'A martini and a portion of fries', 'cards': ['qa'],
                 'note': 'Upgrade: Grey Goose (vodka) or Martin Miller’s (gin). Ultra premium: Beluga (vodka) or Oyster Gin.'}])
  classics = check([drink_note('cl', d, 1, '25 Certified compendium') for d in CERTIFIED] + [drink_note('cl', d, 2, '50 Junior compendium') for d in JUNIOR])
basics = []
for cat, q, a, note in BASICS:
    old_slug = re.sub(r'[^a-z0-9]+', '-', q.lower()).strip('-')[:40].strip('-')  # same ids as the first version
    n = {'id': f'bar:{cat}-{old_slug}', 'stage': 1, 'q': q, 'a': a, 'cards': ['qa']}
    if note: n['note'] = note
    basics.append(n)
check(basics)

if PRIVATE:
  decks[os.path.join(PRIVATE, 'dm-menu.json')] = {'id': 'dm-menu', 'name': 'Dirty Martini menu', 'order': 2, **common, 'newPerDay': 20,
    'credits': ['Specs from the Dirty Martini menu sheets. Where both menus had a drink, the newer sheet’s version is used.'],
    'stages': [{'id': 1, 'name': 'The menu'}], 'notes': menu}
  decks[os.path.join(PRIVATE, 'classics.json')] = {'id': 'classics', 'name': 'Classic cocktails', 'order': 3, **common, 'newPerDay': 10, 'after': 'dm-menu',
    'credits': ['Specs from the Dirty Martini 25 Certified and 50 Junior Classic compendiums. Drinks already on the menu are in the menu deck.'],
    'stages': [{'id': 1, 'name': 'Certified classics'}, {'id': 2, 'name': 'Junior classics'}], 'notes': classics}
decks[os.path.join(OUT, 'bar.json')] = {'id': 'bar', 'name': 'Bartending basics', 'order': 4, **common, 'newPerDay': 25,
    'credits': ['General bar knowledge and UK law, written by Claude.'],
    'stages': [{'id': 1, 'name': 'Tools, methods, spirits and the law'}], 'notes': basics}
for f, deck in decks.items():
    json.dump(deck, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{os.path.basename(f)}: {len(deck["notes"])} notes, {sum(len(n["cards"]) for n in deck["notes"])} cards')
