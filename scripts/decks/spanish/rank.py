# Which words go in, decided by the SUBTLEX-ESP frequency list, not by Claude.
#
# 1. Rank every word form by its SUBTLEX-ESP count (film and TV subtitles).
# 2. Group forms under their base word (lemma) with the open lemmatization-lists table
#    (michmech, ODbL). Ambiguous forms go to the base word with the larger total count,
#    except the few listed in OVERRIDE where that rule is plainly wrong.
# 3. Rank base words by their best form, skipping the visible EXCLUDE list
#    (subtitle artefacts, abbreviations, names, interjections, swearing).
# 4. Swap Latin American forms for Spain ones in place (SWAPS), keeping the rank.
# Stage 1 = the first STAGE1 base words. Claude only writes the card text for them.
import json, sys, collections

SUBTLEX = sys.argv[1]   # ranked.json: [[form, count, per_million], ...]
LEMMAS = sys.argv[2]    # lemmatization-es.txt: lemma<TAB>form
STAGE_SIZES = [185, 245, 280, 260, 220]

OVERRIDE = {
            # Tool corrections: the lemma table misreads these (function words, nouns that look like verbs,
            # verb forms that look like nouns). Corrections only, never additions.
            'entre': 'entre', 'os': 'vosotros', 'para': 'para', 'son': 'ser', 'dije': 'decir', 'dicho': 'decir', 'debe': 'deber', 'estado': 'estar', 'haya': 'haber',
            'nueva': 'nuevo', 'nuevas': 'nuevo', 'nuevos': 'nuevo', 'habla': 'hablar', 'escucha': 'escuchar', 'toma': 'tomar', 'deja': 'dejar',
            'cinco': 'cinco', 'adelante': 'adelante', 'arriba': 'arriba', 'afuera': 'afuera', 'abajo': 'abajo', 'adentro': 'adentro',
            'encima': 'encima', 'veras': 'veras', 'vete': 'ir', 'amo': 'amar', 'queda': 'quedar', 'vino': 'venir', 'lista': 'listo',
            'trata': 'tratar', 'lamento': 'lamentar', 'recuerdo': 'recordar', 'pienso': 'pensar', 'haz': 'hacer', 'sal': 'salir',
            'dado': 'dar', 'primer': 'primero', 'primera': 'primero', 'primeras': 'primero', 'primeros': 'primero', 'primero': 'primero',
            'la': 'el', 'los': 'el', 'las': 'el', 'aun': 'aún', 'aún': 'aún', 'cual': 'cuál', 'seriar': 'serio',
            'sé': 'saber', 'fue': 'ser', 'era': 'ser', 'vamos': 'ir', 've': 'ver', 'vi': 'ver', 'sido': 'ser', 'siento': 'sentir',
            'dé': 'dar', 'di': 'decir', 'va': 'ir', 'voy': 'ir', 'vas': 'ir', 'van': 'ir', 'fui': 'ir', 'nada': 'nada', 'nadie': 'nadie',
            'como': 'como', 'cómo': 'cómo', 'qué': 'qué', 'que': 'que', 'más': 'más', 'mas': 'mas', 'sí': 'sí', 'si': 'si',
            'tú': 'tú', 'tu': 'tu', 'él': 'él', 'el': 'el', 'mí': 'mí', 'mi': 'mi', 'sólo': 'solo', 'solo': 'solo', 'bien': 'bien',
            'quién': 'quién', 'quien': 'quien', 'dónde': 'dónde', 'donde': 'donde', 'cuándo': 'cuándo', 'cuando': 'cuando',
            'cuál': 'cuál', 'cuánto': 'cuánto', 'esto': 'esto', 'eso': 'eso', 'aquello': 'aquello', 'gracias': 'gracias',
            'buenas': 'bueno', 'buenos': 'bueno', 'mañana': 'mañana', 'hola': 'hola', 'adiós': 'adiós', 'vale': 'vale',
            'mamá': 'mamá', 'papá': 'papá', 'hay': 'haber', 'ha': 'haber', 'he': 'haber', 'has': 'haber', 'hemos': 'haber', 'han': 'haber',
            'había': 'haber', 'nos': 'nosotros', 'favor': 'favor', 'acuerdo': 'acuerdo', 'verdad': 'verdad', 'claro': 'claro',
            'oye': 'oír', 'mira': 'mirar', 'llama': 'llamar', 'llamo': 'llamar', 'parece': 'parecer', 'pasa': 'pasar', 'pasó': 'pasar', 'importa': 'importar', 'gusta': 'gustar', 'cuenta': 'contar', 'sabes': 'saber', 'sabe': 'saber', 'quieres': 'querer', 'puedes': 'poder', 'puede': 'poder', 'creo': 'creer', 'dice': 'decir', 'dijo': 'decir', 'hace': 'hacer', 'hecho': 'hacer', 'tienes': 'tener', 'tiene': 'tener', 'mejor': 'mejor', 'espera': 'esperar', 'vaya': 'ir', 'ven': 'venir', 'perdón': 'perdón', 'casa': 'casa'}

EXCLUDE = {
    # subtitle artefacts, English, abbreviations
    'dialogue', 'sr', 'sra', 'srta', 'ud', 'uds', 'ok', 'okay', 'hey', 'hi', 'the', 'you', 'mr', 'dr', 'etc', 'tv',
    # bare interjections and fillers (not worth a card)
    'oh', 'ah', 'eh', 'uh', 'mm', 'ay', 'bah', 'guau', 'ja', 'jaja', 'vaya', 'mas', 'maldición',
    # swearing (common in dubbed films; left out of the deck)
    'mierda', 'maldito', 'maldita', 'diablos', 'demonios', 'carajo', 'joder', 'puta', 'puto', 'coño', 'cabrón', 'idiota', 'estúpido',
    # Latin American plural address: Spain uses vosotros day to day (taught in stage 3)
}
SWAPS = {'auto': 'coche', 'carro': 'coche', 'celular': 'móvil', 'computadora': 'ordenador', 'jugo': 'zumo', 'boleto': 'billete',
         'manejar': 'conducir', 'lindo': 'bonito', 'acá': 'aquí', 'chamaco': 'chico', 'plata': 'dinero', 'papa': 'patata',
         'apartamento': 'piso', 'enojado': 'enfadado', 'enojar': 'enfadar', 'dólar': 'euro', 'muchacho': 'chico', 'muchacha': 'chica'}

forms = json.load(open(SUBTLEX, encoding='utf-8'))
count = {f.lower(): c for f, c, _ in forms}
lemma_of = collections.defaultdict(set)
for line in open(LEMMAS, encoding='utf-8-sig'):
    parts = line.rstrip('\n').split('\t')
    if len(parts) == 2:
        lemma_of[parts[1].lower()].add(parts[0].lower())
        lemma_of[parts[0].lower()].add(parts[0].lower())

# Total count per lemma, for resolving ambiguous forms.
total = collections.Counter()
for f, c in count.items():
    for l in lemma_of.get(f, {f}):
        total[l] += c

headwords = set()
for line in open(LEMMAS, encoding='utf-8-sig'):
    parts = line.rstrip('\n').split('\t')
    if len(parts) == 2: headwords.add(parts[0].lower())

def lemma(f):
    if f in OVERRIDE: return OVERRIDE[f]
    cands = lemma_of.get(f)
    if not cands: return None  # not a Spanish dictionary word: names, foreign words, typos
    if f in headwords: return f  # a dictionary headword is its own base word (para, cosa, nombre, cinco)
    # Otherwise the candidate whose own headword is most used in the subtitles (cosas -> cosa, not coser).
    cands = {OVERRIDE.get(c, c) for c in cands}  # follow corrections (debes -> debe -> deber)
    return max(cands, key=lambda l: (count.get(l, 0), total[l]))

ranked = []
seen = {}
for f, c, pm in forms:
    f = f.lower()
    if f in EXCLUDE or not f.isalpha(): continue
    l = lemma(f)
    if not l or l in EXCLUDE or not l.isalpha(): continue
    l = SWAPS.get(l, l)
    if l not in seen:
        seen[l] = {'lemma': l, 'rank': len(ranked) + 1, 'count': 0, 'forms': [], 'swapped_from': next((k for k, v in SWAPS.items() if v == l and lemma(f) == k), None)}
        ranked.append(seen[l])
    e = seen[l]
    e['count'] += c
    if len(e['forms']) < 6: e['forms'].append([f, c])

out = []
start = 0
for i, size in enumerate(STAGE_SIZES):
    for e in ranked[start:start + size]:
        out.append({**e, 'stage': i + 1})
    start += size
json.dump(out, open(sys.argv[3], 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(f'{len(ranked)} base words ranked; wrote stages 1–5 ({len(out)} words)')
