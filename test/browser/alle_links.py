import asyncio, sys, json, re, subprocess, os
from urllib.parse import urlparse, parse_qs, unquote
from playwright.async_api import async_playwright
S=sys.argv[1]; BASE=sys.argv[2]; QUELLE=json.load(open(sys.argv[3]))
src={d['id']:os.path.dirname(sys.argv[3])+'/'+(d.get('kopie_datei') or d['datei']) for d in QUELLE['dokumente']}
def text(doc,n): return subprocess.run(['pdftotext','-f',str(n),'-l',str(n),src[doc],'-'],capture_output=True,text=True).stdout
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':1200,'height':900})
        await ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort()); await ctx.route('https://cdn.jsdelivr.net/**', lambda r: r.abort())
        pg=await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE); await pg.wait_for_timeout(800); await pg.select_option('#sel-ma','m1'); await pg.wait_for_timeout(300)
        alle={}
        async def sammeln(wo):
            for a in await pg.evaluate("() => [...document.querySelectorAll('a[href^=\"pdf.html\"]')].map(a => [a.getAttribute('href'), a.textContent.trim()])"):
                alle.setdefault(a[0], (a[1], wo))
        for k in ['tag','finden','fahrplan']:
            await pg.click('nav button[data-k='+k+']'); await pg.wait_for_timeout(500)
            if k=='fahrplan':
                for d in await pg.query_selector_all('details'): await d.evaluate('d => d.open = true')
            await sammeln(k)
        # Hilfe "Wo steht das?" bei allen Fahrplan-Fragen
        n = await pg.locator('.karte[data-f] [data-t=hilfe]').count()
        for i in range(n):
            await pg.locator('.karte[data-f] [data-t=hilfe]').nth(i).click(); await pg.wait_for_timeout(120)
        await pg.wait_for_timeout(800); await sammeln('hilfe')
        print('Links gesamt:', len(alle))
        v=await ctx.new_page(); falsch=0; geprueft=0
        for href,(t,wo) in alle.items():
            q=parse_qs(urlparse(href).query); d=re.search(r'(d\d+)\.pdf', unquote(q['d'][0])).group(1)
            await v.goto(BASE+href); await v.wait_for_function('window.__pdfBereit', timeout=30000); await v.wait_for_timeout(150)
            sichtbar = await v.evaluate("""() => { const y = document.querySelector('.leiste').offsetHeight + 40; let a = 1; document.querySelectorAll('.seite').forEach(s => { if (s.getBoundingClientRect().top <= y) a = +s.dataset.seite; }); return a; }""")
            gez = await v.evaluate("n => !!document.getElementById('seite-'+n).dataset.gezeichnet", sichtbar)
            soll = int(q['s'][0]) if 's' in q else 1
            inhalt_ok = True; info=''
            if t.startswith('S.'):
                want=int(re.search(r'\d+',t).group()); fm=re.search(r'Seite\s*(\d+)\s*von', text(d,sichtbar)); inhalt_ok = (int(fm.group(1))==want) if fm else (sichtbar==want); info='Fußzeile '+(fm.group(1) if fm else '-')
            elif '„' in t:
                name=re.search(r'„([^“]+)“',t).group(1); inhalt_ok = name.split()[0].lower() in text(d,sichtbar).lower(); info='Reiter'
            ok = sichtbar==soll and gez and inhalt_ok; geprueft+=1
            if not ok: falsch+=1; print('FALSCH', wo, d, t, 'soll', soll, 'sichtbar', sichtbar, 'gezeichnet', gez, info)
            if 'd1.pdf' in unquote(href) and q.get('s')==['5']: pass
        print('geprüft', geprueft, 'falsch', falsch, '| Fehler:', errs or 'keine'); await b.close()
asyncio.run(main())
