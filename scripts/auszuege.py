#!/usr/bin/env python3
"""
Auszuege aus Kundendokumenten fuer "Wo steht das?" (Lektion A08).
PDF  -> je Seite Absaetze (Ort "Seite N"), wiederkehrende Kopf-/Fusszeilen werden entfernt.
XLSX -> je Reiter Zeilen als "Spalte: Wert" (Ort "Reiter „Name“").
DOCX -> Absaetze ohne Seitenzahl (Ort "Abschnitt N").

Aufruf:  python3 scripts/auszuege.py dokumente.json > auszuege.json
dokumente.json: [{"id":"d1","titel":"…","datei":"pfad/zur/datei.pdf"}, …]
Laeuft lokal (Kundendaten bleiben in daten/, nie in Git). Benoetigt pdftotext (poppler) und openpyxl.
"""
import json, re, subprocess, sys, zipfile, collections

MAX = 700  # Zeichen je Auszug


def stuecke(text, maxlen=MAX):
    """Absaetze zu Auszuegen bis maxlen zusammenfassen."""
    abs_ = [a.strip() for a in re.split(r'\n\s*\n', text) if a.strip()]
    out, akt = [], ''
    for a in abs_:
        a = re.sub(r'[ \t]+', ' ', a)
        if len(akt) + len(a) + 1 > maxlen and akt:
            out.append(akt); akt = ''
        while len(a) > maxlen:  # sehr lange Absaetze am Satzende teilen
            cut = a.rfind('. ', 0, maxlen)
            if cut > maxlen // 2:
                cut += 1
            else:
                cut = a.rfind(' ', 0, maxlen)
                cut = cut if cut > 0 else maxlen
            out.append(a[:cut].strip()); a = a[cut:].strip()
        akt = (akt + '\n' + a).strip()
    if akt:
        out.append(akt)
    return out


def pdf(datei):
    seiten = int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', datei], capture_output=True, text=True).stdout).group(1))
    texte = [subprocess.run(['pdftotext', '-f', str(s), '-l', str(s), datei, '-'], capture_output=True, text=True).stdout for s in range(1, seiten + 1)]
    # Kopf-/Fusszeilen: Zeilen, die auf mehr als der Haelfte der Seiten vorkommen
    zaehler = collections.Counter(l.strip() for t in texte for l in set(t.splitlines()) if l.strip())
    kopf = {l for l, n in zaehler.items() if seiten > 2 and n > seiten / 2}
    out = []
    for s, t in enumerate(texte, 1):
        t = '\n'.join(l for l in t.splitlines() if l.strip() not in kopf and not re.fullmatch(r'\s*(Seite\s*)?\d+\s*(von\s*\d+)?\s*', l))
        t = re.sub(r'Seite\s*\d+\s*von\s*\d+', '', t.replace('​', '').replace('\f', ''))
        # Zeilenumbrueche innerhalb von Saetzen glaetten, Absaetze behalten
        t = re.sub(r'(?<![.:;!?])\n(?=[a-zäöüß(0-9])', ' ', t)
        for i, st in enumerate(stuecke(t)):
            out.append({'ort': 'Seite %d' % s, 'seite': s, 'text': st})
    return out


def xlsx(datei):
    import openpyxl
    wb = openpyxl.load_workbook(datei, data_only=True)
    out = []
    for ws in wb.worksheets:
        rows = [[('' if c is None else (c.strftime('%d.%m.%Y') if hasattr(c, 'strftime') else str(c))).strip() for c in r] for r in ws.iter_rows(values_only=True)]
        rows = [r for r in rows if any(r)]
        if not rows:
            continue
        # Kopfzeile = erste Zeile mit mindestens 3 gefuellten Zellen
        kopf_i = next((i for i, r in enumerate(rows) if sum(1 for c in r if c) >= 3), 0)
        kopf = rows[kopf_i]
        vorspann = ' · '.join(' '.join(c for c in r if c) for r in rows[:kopf_i])
        zeilen = []
        for r in rows[kopf_i + 1:]:
            teile = ['%s: %s' % (kopf[j] or 'Spalte %d' % (j + 1), c) for j, c in enumerate(r) if c and j < len(kopf)]
            teile += [c for j, c in enumerate(r) if c and j >= len(kopf)]
            if teile:
                zeilen.append(' | '.join(teile))
        text = (vorspann + '\n\n' if vorspann else '') + '\n\n'.join(zeilen)
        for st in stuecke(text, 900):
            out.append({'ort': 'Reiter „%s“' % ws.title, 'reiter': ws.title, 'text': st})
    return out, [ws.title for ws in wb.worksheets]


def docx(datei):
    xml = zipfile.ZipFile(datei).read('word/document.xml').decode('utf8')
    paras = re.findall(r'<w:p[ >].*?</w:p>', xml, flags=re.S)
    text = '\n\n'.join(re.sub(r'<[^>]+>', '', re.sub(r'<w:tab/>', ' ', p)) for p in paras)
    return [{'ort': 'Abschnitt %d' % (i + 1), 'text': st} for i, st in enumerate(stuecke(text))]


def main():
    doks = json.load(open(sys.argv[1], encoding='utf8'))
    alle = []
    for d in doks:
        f = d['datei']
        if f.lower().endswith('.pdf'):
            a = pdf(f)
        elif f.lower().endswith('.xlsx'):
            a, reiter = xlsx(f)
            d.setdefault('inhalt_kurz', {})['reiter'] = reiter
        elif f.lower().endswith('.docx'):
            a = docx(f)
        else:
            continue
        for i, x in enumerate(a):
            x.update({'id': '%s-%d' % (d['id'], i + 1), 'dokument_id': d['id']})
        alle += a
        print('%-45s %4d Auszüge' % (d.get('titel', f)[:45], len(a)), file=sys.stderr)
    json.dump({'auszuege': alle, 'reiter': {d['id']: d.get('inhalt_kurz', {}).get('reiter') for d in doks if d.get('inhalt_kurz')}}, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    main()
