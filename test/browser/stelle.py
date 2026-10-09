import asyncio, sys, json, re, subprocess, os
from urllib.parse import urlparse, parse_qs, unquote
from playwright.async_api import async_playwright
S=sys.argv[1]; BASE=sys.argv[2]; Q=json.load(open(sys.argv[3]))
src={d['id']:os.path.dirname(sys.argv[3])+'/'+(d.get('kopie_datei') or d['datei']) for d in Q['dokumente']}
def norm(t): return re.sub(r'[^a-z0-9äöüß]+',' ',t.lower())
def text(doc,a,b): return norm(subprocess.run(['pdftotext','-f',str(a),'-l',str(b),src[doc],'-'],capture_output=True,text=True).stdout)
ergebnis={'ok':0,'falsch':0}
async def main():
    async with async_playwright() as p:
        br=await p.chromium.launch(); ctx=await br.new_context(viewport={'width':1200,'height':900})
        await ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort()); await ctx.route('https://cdn.jsdelivr.net/**', lambda r: r.abort())
        pg=await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE); await pg.wait_for_timeout(800); await pg.select_option('#sel-ma','m1'); await pg.wait_for_timeout(300)
        gesehen=set()
        async def pruefe(scope, wo, kontext=None):
            btns = await scope.query_selector_all('button[data-ort]')
            for bt in btns:
                ort = await bt.get_attribute('data-ort'); lab=(await bt.text_content()).strip()
                if not ort or 'öffnen' not in lab or lab=='Dokument öffnen': continue
                ktext = kontext or await bt.evaluate("b => { const a = b.closest('.auszug'); return a ? (a.querySelector('.auszug-text')||{}).innerText || '' : '' }")
                async with ctx.expect_page() as neu: await bt.click()
                v = await neu.value; await v.wait_for_function('window.__pdfBereit', timeout=30000); await v.wait_for_timeout(100)
                q=parse_qs(urlparse(v.url).query); d=re.search(r'(d\d+)\.pdf', unquote(q['d'][0])).group(1); s=int(q['s'][0]); b=int(q['b'][0])
                sichtbar = await v.evaluate("""() => { const y = document.querySelector('.leiste').offsetHeight + 40; let a = 1; document.querySelectorAll('.seite').forEach(s => { if (s.getBoundingClientRect().top <= y) a = +s.dataset.seite; }); return a; }""")
                gez = await v.evaluate("n => !!document.getElementById('seite-'+n).dataset.gezeichnet", sichtbar)
                seiten_text = text(d, s, b)
                woerter=[w for w in norm(ktext).split() if len(w)>5][:4]
                inhalt = all(w in seiten_text for w in woerter) if woerter else True
                r = re.search(r'„([^“]+)“', lab)
                if r: oben = norm(' '.join([z for z in subprocess.run(['pdftotext','-f',str(s),'-l',str(s),src[d],'-'],capture_output=True,text=True).stdout.splitlines() if z.strip()][:3])); inhalt = norm(r.group(1)).split()[0][:6] in oben
                m = re.search(r'Seite (\d+)', lab); label_ok = (int(m.group(1))==s) if m else True
                ok = sichtbar==s and gez and inhalt and label_ok
                key=(wo,d,s,lab)
                if key not in gesehen:
                    gesehen.add(key); ergebnis['ok' if ok else 'falsch']+=1
                    if not ok: print('FALSCH', wo, d, lab, 'url-s', s, 'sichtbar', sichtbar, 'inhalt', inhalt, woerter)
                await v.close()
        # 1 Fahrplan-Hilfen
        await pg.click('nav button[data-k=fahrplan]'); await pg.wait_for_timeout(400)
        n = await pg.locator('.karte[data-f] [data-t=hilfe]').count()
        for i in range(n): await pg.locator('.karte[data-f] [data-t=hilfe]').nth(i).click(); await pg.wait_for_timeout(80)
        await pg.wait_for_timeout(800); await pruefe(pg, 'fahrplan')
        # 2 Suche
        for w in ['Lieferantenbewertung','Qualitätspolitik','Notfall','Feuerlöscher','Risiken','Schulung','Reklamation','Auditprogramm','Managementbewertung','Organigramm','Ziele','Wartung']:
            await pg.click('nav button[data-k=finden]'); await pg.wait_for_timeout(200); await pg.fill('#suche', w); await pg.click('#suchen'); await pg.wait_for_timeout(300)
            await pruefe(pg, 'suche:'+w)
        # 3 Azubi
        await pg.click('nav button[data-k=lernen]'); await pg.wait_for_timeout(500)
        ids = await pg.evaluate("() => [...document.querySelectorAll('#azubi [data-p]')].map(b => b.dataset.p)")
        for pid in ids:
            await pg.click('#azubi [data-p="'+pid+'"]'); await pg.wait_for_timeout(200)
            name = await pg.locator('#azubi b').first.text_content()
            await pruefe(pg.locator('#azubi').element_handle and await pg.query_selector('#azubi .zeile:has(#az-quelle)'), 'azubi '+name, kontext=re.sub(r'^\S+\s','',name))
            await pg.click('#az-quelle'); await pg.wait_for_timeout(150); await pruefe(await pg.query_selector('#az-quelltext'), 'azubi-text '+name)
            await pg.click('#az-zurueck'); await pg.wait_for_timeout(200)
        print('Azubi-Abläufe:', len(ids)); print(ergebnis, '| Seitenfehler:', errs or 'keine'); await br.close()
asyncio.run(main())
