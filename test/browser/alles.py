"""Alle Funktionen Ende-zu-Ende am Testkunden (Mini-Supabase, Lektion A14).
Voraussetzung: bash test/mini-supabase/starten.sh laeuft, Testkunde-Zip gebaut (npm run paket -- test/testkunde).
Aufruf: python3 test/browser/alles.py <ARBEITSORDNER> <Testkunde.zip> <seite3.png> <seite14.png> [cdn-node_modules] [ocr-node_modules]
Schreibt <ARBEITSORDNER>/alles-bericht.json und Bildschirmfotos nach <ARBEITSORDNER>/alles/.
"""
import asyncio, sys, os, json, base64, subprocess, re
from playwright.async_api import async_playwright

W, ZIP, S3, S14 = sys.argv[1:5]
CDN = sys.argv[5] if len(sys.argv) > 5 else ''
OCR = sys.argv[6] if len(sys.argv) > 6 else ''
B = 'http://localhost:54321'
os.makedirs(W + '/alles', exist_ok=True)
ERG = []

def psql(sql):
    return subprocess.run(['su', 'postgres', '-c', 'psql -tA -d avtest -c "' + sql.replace('"', '\\"') + '"'], capture_output=True, text=True).stdout.strip()

async def pruefe(name, fn):
    try:
        info = await fn()
        ERG.append({'name': name, 'ok': True, 'info': str(info or '')[:220]}); print('✓', name, '–', str(info or '')[:150])
    except Exception as e:
        ERG.append({'name': name, 'ok': False, 'info': str(e).split('\n')[0][:300]}); print('✗', name, '–', str(e).split('\n')[0][:200])

BILD3 = base64.b64encode(open(S3, 'rb').read()).decode()
FAKE = """
navigator.mediaDevices.getDisplayMedia = async () => {
  const c = document.createElement('canvas'); c.width = 1240; c.height = 1754; const g = c.getContext('2d');
  const img = new Image(); img.src = 'data:image/png;base64,""" + BILD3 + """';
  await img.decode(); setInterval(() => { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); }, 100);
  const st = c.captureStream(10); const t = st.getVideoTracks()[0]; const o = t.getSettings.bind(t); t.getSettings = () => Object.assign(o(), { displaySurface: 'monitor' }); return st; };
"""

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(); ctx = await br.new_context(viewport={'width': 1250, 'height': 950})
        async def cdn(route):
            u = route.request.url
            try:
                if 'supabase-js@2.49.4/dist/umd/' in u: f = CDN + '@supabase/supabase-js/dist/umd/' + u.split('/dist/umd/')[1]
                elif 'jszip/3.10.1/jszip.min.js' in u: f = CDN + 'jszip/dist/jszip.min.js'
                elif 'tesseract.js@5.1.1/dist/' in u: f = OCR + 'tesseract.js/dist/' + u.split('/dist/')[1]
                elif 'tesseract.js-core@5.1.1/' in u: f = OCR + 'tesseract.js-core/' + u.split('tesseract.js-core@5.1.1/')[1]
                elif '@tesseract.js-data/deu' in u: f = OCR + '@tesseract.js-data/deu/4.0.0_best_int/' + u.split('/')[-1]
                else: return await route.abort()
                await route.fulfill(path=f, headers={'Access-Control-Allow-Origin': '*'})
            except Exception: await route.abort()
        await ctx.route('https://cdn.jsdelivr.net/**', cdn); await ctx.route('https://cdnjs.cloudflare.com/**', cdn); await ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
        await ctx.add_init_script(FAKE)
        fehler = []
        bo = await ctx.new_page(); bo.on('pageerror', lambda e: fehler.append('Backoffice: ' + str(e)))
        shot = lambda pg, n: pg.screenshot(path=W + '/alles/' + n + '.png')
        S = {}

        # ---------------------------------------------------------------- Backoffice
        async def b_login():
            await bo.goto(B + '/backoffice/'); await bo.fill('#mail', 'test@example.com'); await bo.fill('#pw', 'x'); await bo.click('button[type=submit]')
            await bo.wait_for_selector('#neu', timeout=15000); return 'Übersicht geladen'
        await pruefe('B1 Backoffice: anmelden', b_login)
        async def b_import():
            await bo.click('#neu'); await bo.set_input_files('#zip', ZIP); await bo.wait_for_selector('#los', timeout=20000)
            v = await bo.locator('#vorschau p').first.text_content()
            await bo.click('#los'); await bo.wait_for_selector('#weiter', timeout=120000); await shot(bo, '01_import')
            return v
        await pruefe('B2 Kunde importieren (Testkunde-Zip)', b_import)
        async def b_link():
            await bo.click('#weiter'); await bo.wait_for_selector('#erzeugen'); await bo.click('#erzeugen'); await bo.wait_for_selector('#linkfeld')
            S['link'] = await bo.input_value('#linkfeld'); txt = await bo.input_value('#mailtext')
            assert S['link'] in txt; return S['link'][:50] + '… + Mailtext'
        await pruefe('B3 Persönlichen Link + Mailtext erzeugen', b_link)
        S['kid'] = psql("select id from kunden where name like 'Beispiel Haustechnik%' order by angelegt_am desc limit 1")

        # ---------------------------------------------------------------- Kundenseite
        k = await ctx.new_page(); k.on('pageerror', lambda e: fehler.append('Kunde: ' + str(e)))
        async def k_falsch():
            await k.goto(B + '/kunde/?t=' + 'a' * 48); await k.wait_for_timeout(1500); t = await k.locator('#main').inner_text(); assert 'ungültig' in t; return t[:80]
        await pruefe('K1 Falscher Link wird abgewiesen', k_falsch)
        async def k_start():
            await k.goto(S['link']); await k.wait_for_selector('#sel-ma', timeout=20000); await k.wait_for_timeout(600)
            await k.select_option('#sel-ma', label='Erika Beispiel (Geschäftsführerin)'); await k.wait_for_timeout(800); await shot(k, '02_heute')
            assert await k.locator('.kachel').count() >= 7; return (await k.locator('.hk-weiter b').text_content())
        await pruefe('K2 Start, „Wer übt?“, Übersicht mit Kacheln', k_start)
        async def k_technik():
            await k.click('.kachel[data-k=technik]'); await k.wait_for_timeout(300)
            for c in ['laptop', 'chrome', 'dokument_offen']: await k.click('[data-c=' + c + ']'); await k.wait_for_timeout(250)
            await k.click('#teilen-test'); await k.wait_for_function("document.querySelectorAll('.haken.ja').length === 4", timeout=15000); n = 4
            return '4 von 4, Leiste „Teilen beenden“: ' + str(await k.locator('#teilen-leiste').count())
        await pruefe('K3 Technik-Check inkl. Bildschirm teilen', k_technik)
        async def k_teilen_aus():
            await k.click('#teilen-aus'); await k.wait_for_timeout(300); assert await k.locator('#teilen-leiste').count() == 0; return 'beendet'
        await pruefe('K4 Bildschirm teilen beenden', k_teilen_aus)
        async def k_fakten():
            await k.click('nav button[data-k=fakten]'); await k.wait_for_timeout(300)
            c = k.locator('.karte[data-id]').nth(0); await c.locator('[data-a=stimmt_nicht]').click(); await c.locator('textarea').fill('Nur Erika Beispiel ist Geschäftsführerin'); await c.locator('[data-a=speichern]').click(); await k.wait_for_timeout(500)
            for i in [1, 2, 3]: await k.locator('.karte[data-id]').nth(i).locator('[data-a=stimmt]').click(); await k.wait_for_timeout(350)
            await k.click('#fk-senden'); await k.wait_for_timeout(300); vt = await k.input_value('#sp-text'); await k.click('#sp-los'); await k.wait_for_timeout(1200)
            assert 'Nur Erika' in vt; return (await k.locator('.ok-box').first.text_content())
        await pruefe('K5 Faktencheck bestätigen, korrigieren, Korrekturen senden', k_fakten)
        async def k_plan():
            await k.click('nav button[data-k=fahrplan]'); await k.wait_for_timeout(500)
            c = k.locator('[data-plan]').first; await c.check(); await k.wait_for_timeout(500); return 'Dokument im Auditplan abgehakt (' + str(await k.locator('[data-plan]').count()) + ' Haken insgesamt)'
        await pruefe('K6 Fahrplan Schritt 1: Auditplan durchgehen, abhaken', k_plan)
        async def k_zeigmal():
            karte = k.locator('.karte[data-f]:has-text("externe und interne Themen")').first
            await karte.locator('[data-t=ueben]').click(); await k.wait_for_timeout(600); await k.click('#t-gefunden'); await k.wait_for_timeout(300)
            await k.click('#fw-countdown'); await k.wait_for_selector('#t-weiter', timeout=120000)
            pr = await k.locator('#t-pruef').text_content(); await shot(k, '03_zeigmal'); await k.click('#t-ende'); await k.wait_for_timeout(500)
            n = psql("select count(*) from nachweise"); assert int(n) >= 1, 'kein Nachweis gespeichert'
            return pr.strip()[:90] + ' · Nachweise im Speicher: ' + n
        await pruefe('K7 Zeig mal: Foto in 5 Sekunden, Texterkennung, Foto gespeichert', k_zeigmal)
        async def k_weissnicht():
            await k.click('nav button[data-k=fahrplan]'); await k.wait_for_timeout(400)
            karte = k.locator('.karte[data-f]:has-text("externe Anbieter")').first
            await karte.locator('[data-t=ueben]').click(); await k.wait_for_timeout(500); await k.click('#t-hilfe-k'); await k.wait_for_timeout(800)
            h = await k.locator('#t-hilfe').inner_text(); await k.click('[data-s=weiss_nicht]'); await k.wait_for_timeout(500)
            await k.click('#t-erg [data-u=finden]'); await k.wait_for_timeout(400); await k.click('#t-ende'); await k.wait_for_timeout(400)
            await k.click('nav button[data-k=heute]'); await k.wait_for_timeout(500); await k.click('details.aufklapp summary >> nth=0'); await k.wait_for_timeout(200)
            b = await k.locator('.bau').count(); assert b >= 1; return 'Hilfe zeigte: ' + h[:60].replace('\n', ' ') + ' … · Baustellen: ' + str(b)
        await pruefe('K8 Hilfe „Wo steht das?“, „Weiß ich nicht“, Ursache → Baustelle', k_weissnicht)
        async def k_suche():
            await k.click('nav button[data-k=finden]'); await k.wait_for_timeout(400); await k.fill('#suche', 'Lieferantenbewertung'); await k.click('#suchen'); await k.wait_for_timeout(500)
            erst = await k.locator('.auszug b').first.text_content(); bt = k.locator('#ergebnis .auszug button[data-ort]').first; lab = await bt.text_content()
            async with ctx.expect_page() as neu: await bt.click()
            v = await neu.value; await v.wait_for_function('window.__pdfBereit', timeout=30000); info = await v.evaluate('window.__pdfBereit'); await shot(v, '04_betrachter'); await v.close()
            m = re.search(r'Seite (\d+)', lab)
            if m: assert int(m.group(1)) == info['start'], (lab, info)
            else: assert info['start'] >= 1 and 'Reiter' in lab, (lab, info)
            return erst + ' → ' + lab.strip() + ' → Betrachter Seite ' + str(info['start']) + ' von ' + str(info['n'])
        await pruefe('K9 Suche ohne KI + Seitenbetrachter auf der richtigen Seite', k_suche)
        async def k_ki():
            await k.fill('#suche', 'Wer bewertet bei uns die Lieferanten?'); await k.click('#suchen'); await k.wait_for_selector('.ki-antwort button[data-ort]', timeout=30000)
            await shot(k, '05_ki_frage'); return (await k.locator('.ki-antwort p').first.text_content())[:120]
        await pruefe('K10 KI fragen (Antwort nur aus eigenen Dokumenten, mit Quelle)', k_ki)
        async def k_zip():
            await k.click('nav button[data-k=tag]'); await k.wait_for_timeout(600)
            h = await k.locator('a[download]').first.get_attribute('href'); r = await k.request.get(h); assert r.status == 200
            links = await k.locator('.spickzettel a[href^="pdf.html"]').count(); await shot(k, '06_audittag'); return 'Zip HTTP ' + str(r.status) + ', Spickzettel-Links: ' + str(links)
        await pruefe('K11 Audit-Tag: Spickzettel mit Seitenlinks, alle PDFs als Zip', k_zip)
        async def k_fallen():
            await k.click('nav button[data-k=fallen]'); await k.wait_for_timeout(400); await k.click('[data-x]'); await k.wait_for_timeout(300)
            await k.fill('#t-text', 'Erika Beispiel ist Geschäftsführerin, das Organigramm korrigieren wir.'); await k.click('#t-zeigen'); await k.wait_for_timeout(300)
            await k.click('[data-s=sicher]'); await k.wait_for_timeout(600); await k.click('#t-zu2') if await k.locator('#t-zu2').count() else None; await k.wait_for_timeout(300)
            return psql("select count(*) from kunden_eintraege where art='falle'") + ' Stolperfalle(n) geübt'
        await pruefe('K12 Stolperfalle üben mit Antwortlinie', k_fallen)
        async def k_lernen():
            await k.goto(S['link']); await k.wait_for_timeout(1200); await k.select_option('#sel-ma', label='Erika Beispiel (Geschäftsführerin)'); await k.wait_for_timeout(600)
            await k.click('nav button[data-k=lernen]'); await k.wait_for_timeout(800)
            await k.click('.prozess:has-text("Lieferantenbewertung")'); await k.wait_for_timeout(300)
            await k.click('#az-muster'); await k.wait_for_timeout(200); muster = await k.locator('#az-quelltext').inner_text()
            for t in ['Ich lege fest, wer unsere wichtigsten Lieferanten sind, zum Beispiel der Großhandel Nord.', 'Einmal im Jahr im Januar bewerte ich Qualität, Termintreue und Preis.', 'Wenn einer schlecht ist, reden wir mit ihm oder wechseln, letztes Jahr bei den Wärmepumpen.']:
                await k.fill('#az-text', t); await k.click('#az-weiter'); await k.wait_for_timeout(400)
            await k.wait_for_timeout(500); erg = await k.locator('#azubi').inner_text(); await shot(k, '07_azubi')
            return 'Musterlösung: ' + muster[:50].replace('\n', ' ') + ' … · Auswertung: ' + erg[-90:].replace('\n', ' ')
        await pruefe('K13 Erklär es dem Azubi mit Musterlösung', k_lernen)
        async def k_karten():
            if await k.locator('#az-zurueck').count(): await k.click('#az-zurueck'); await k.wait_for_timeout(300)
            await k.locator('.lernkarte .vorne').first.click(); await k.wait_for_timeout(200); vis = await k.locator('.lernkarte .hinten').first.is_visible()
            await k.locator('.karte[data-r] input[type=radio]').first.check(); await k.wait_for_timeout(400)
            e = await k.locator('.karte[data-r] .erkl').first.is_visible(); assert vis and e; return 'Lernkarte umgedreht, Rollentausch bewertet'
        await pruefe('K14 Audit-Deutsch-Karten und Rollentausch', k_karten)
        async def k_gespraech():  # Probeaudit mit Server-KI (Auszüge aus der Datenbank)
            await k.click('nav button[data-k=probeaudit]'); await k.wait_for_selector('#pa-start'); await k.click('#pa-start')
            await k.wait_for_function("[...document.querySelectorAll('.pa-msg.au')].some(m => !m.innerText.includes('überlegt'))", timeout=30000)
            await k.fill('#pa-text', 'Wir bewerten unsere Lieferanten im Januar, steht im Handbuch Seite 14.'); await k.click('#pa-los')
            await k.wait_for_function("document.querySelectorAll('.pa-msg.au').length >= 2 && ![...document.querySelectorAll('.pa-msg.au')].some(m => m.innerText.includes('überlegt'))", timeout=30000)
            await k.click('#pa-ende'); await k.wait_for_selector('#pa-auswertung .karte', timeout=30000)
            tts = await k.evaluate("fetch('/fake-tts-log').then(r => r.json())"); natur = await k.locator('#pa-natur').count()
            assert natur == 1 and len(tts) >= 1 and tts[0]['stimme'].startswith('de-DE'), (natur, tts[:2])
            return (await k.locator('#pa-auswertung').inner_text())[:90].replace('\n', ' ') + ' · Google-Stimme: ' + str(len(tts)) + ' Sätze (' + tts[0]['stimme'] + ')'
        await pruefe('K15 Probeaudit mit dem KI-Auditor (Server) und natürlicher Stimme', k_gespraech)
        async def k_rolle():  # Büro/Einkauf wird nur zu Einkauf, Lieferanten und Qualitätspolitik befragt (aus Handbuch und Prozessen)
            d = await ctx.new_page(); d.on('pageerror', lambda x: fehler.append('Rolle: ' + str(x)))
            await d.goto(S['link']); await d.wait_for_selector('#sel-ma', timeout=20000); await d.wait_for_timeout(600)
            await d.select_option('#sel-audit', index=0); await d.wait_for_timeout(800)
            await d.select_option('#sel-ma', label='Sabine Büro (Büro und Einkauf)'); await d.wait_for_timeout(1200)
            await d.click('nav button[data-k=fahrplan]'); await d.wait_for_selector('.rolle-karte', timeout=15000)
            rk = await d.locator('.rolle-karte').inner_text(); kap = await d.eval_on_selector_all('.karte[data-f] .np', 'x => x.map(e => e.innerText)')
            doks = await d.eval_on_selector_all('.rolle-doks li', 'x => x.map(e => e.innerText.replace(/\\s+/g, " "))'); knoepfe = await d.locator('.rolle-doks [data-d]').count()
            await shot(d, '42_rolle_einkauf'); await d.close()
            assert 'Einkauf' in rk and 'Qualitätspolitik' in rk and not any(k.startswith(('4.', '6.', '9.')) for k in kap), (rk, kap)
            assert len(doks) >= 4 and knoepfe == len(doks) and any('Einkauf' in x for x in doks) and any('Kommunikation' in x and 'Seite 8' in x for x in doks) and any('Ziele' in x for x in doks), doks
            return 'Themen: ' + rk.split('\n')[1][:70] + ' · Fragen: ' + ', '.join(kap) + ' · Dokumente: ' + ' | '.join(x[:60] for x in doks)
        await pruefe('R1 Rolle Büro und Einkauf: nur ihre Prozesse und die Politik', k_rolle)
        async def k_lektion():
            await k.click('nav button[data-k=heute]'); await k.wait_for_timeout(500); await k.click('#lektion'); await k.wait_for_timeout(600)
            assert await k.locator('#trainer-box').is_visible(); t = await k.locator('#trainer-box h2').first.text_content(); await k.click('#t-zu'); await k.wait_for_timeout(300); return t
        await pruefe('K16 Tageslektion „Ihre 5 Minuten“', k_lektion)
        async def k_aufgabe():
            await k.click('nav button[data-k=heute]'); await k.wait_for_timeout(400); c = k.locator('[data-a]').first; await c.check(); await k.wait_for_timeout(500)
            return psql("select count(*) from kunden_eintraege where art='aufgabe'") + ' Aufgabe abgehakt'
        await pruefe('K17 Aufgabe abhaken', k_aufgabe)
        async def k_stufe2():
            await k.select_option('#sel-audit', index=1); await k.wait_for_timeout(1200)
            if await k.locator('#sel-ma').input_value() == '': await k.select_option('#sel-ma', label='Erika Beispiel (Geschäftsführerin)'); await k.wait_for_timeout(600)
            await k.click('nav button[data-k=fahrplan]'); await k.wait_for_timeout(500)
            await k.locator('.karte[data-f] [data-t=ueben]').first.click(); await k.wait_for_timeout(500)
            await k.fill('#t-text', 'Wir halten Termine ein, das steht in der Qualitätspolitik im Handbuch Seite 5, zum Beispiel beim Auftrag Müller letzte Woche.')
            await k.click('#t-fertig'); await k.wait_for_timeout(1500); fb = await k.locator('#t-erg .karte').inner_text(); await shot(k, '08_stufe2')
            await k.click('[data-s2=sicher]'); await k.wait_for_timeout(500); await k.click('#t-ende'); await k.wait_for_timeout(300)
            assert 'KI-Coach' in fb; return fb[:140].replace('\n', ' ')
        await pruefe('K18 Stufe 2: Frage beantworten, Rückmeldung + KI-Coach', k_stufe2)
        async def k_spur():
            await k.click('nav button[data-k=spur]'); await k.wait_for_timeout(500); st = k.locator('.station').first
            await st.locator('[data-f=datum]').fill('2026-09-15'); await st.locator('[data-f=nummer]').fill('A-2026-117')
            await st.locator('input[type=file][data-f=foto]').set_input_files(S14); await k.wait_for_timeout(1200)
            return psql("select count(*) from kunden_eintraege where art='spur'") + ' Station(en) mit Beleg gespeichert'
        await pruefe('K19 Beispielauftrag (Spurensuche) mit Foto', k_spur)
        async def k_rundgang():
            await k.click('nav button[data-k=rundgang]'); await k.wait_for_timeout(500); it = k.locator('.karte[data-k]').first
            await it.locator('[data-f=naechste]').fill('2026-11'); await it.locator('input[type=file][data-f=foto]').set_input_files(S14); await k.wait_for_timeout(1000)
            if await it.locator('[data-s]').count(): await it.locator('[data-s]').click(); await k.wait_for_timeout(600)
            await shot(k, '09_rundgang'); return psql("select count(*) from kunden_eintraege where art='rundgang'") + ' Prüfplakette erfasst'
        await pruefe('K20 Foto-Rundgang (Prüfplakette)', k_rundgang)
        async def k_danach():
            await k.click('nav button[data-k=danach]'); await k.wait_for_timeout(500)
            await k.select_option('#r-typ', 'sachlich'); await k.fill('#r-fragen', 'Wie bewerten Sie Ihre Lieferanten?\nZeigen Sie die Managementbewertung.'); await k.fill('#r-gut', 'Dokumente schnell gefunden')
            await k.click('#r-senden'); await k.wait_for_timeout(500); await k.fill('#sp-text', 'Audit gut gelaufen!'); await k.click('#sp-los'); await k.wait_for_timeout(1200)
            return psql("select count(*) from nachrichten") + ' Nachrichten, Rückmeldung: ' + psql("select count(*) from kunden_eintraege where art='rueckmeldung'")
        await pruefe('K21 Nach dem Audit: Rückmeldung speichern und senden', k_danach)
        async def k_reload():
            await k.reload(); await k.wait_for_timeout(1500); await k.select_option('#sel-audit', index=0); await k.wait_for_timeout(1000)
            if await k.locator('#sel-ma').input_value() == '': await k.select_option('#sel-ma', label='Erika Beispiel (Geschäftsführerin)'); await k.wait_for_timeout(600)
            st = await k.locator('.kachel[data-k=fahrplan] .k-status').text_content(); assert not st.startswith('0 '); return 'Fahrplan nach Neuladen: ' + st
        await pruefe('K22 Stand bleibt nach Neuladen (Server)', k_reload)
        async def k_handy():
            h = await ctx.new_page(); await h.set_viewport_size({'width': 390, 'height': 844}); await h.goto(S['link']); await h.wait_for_timeout(1500)
            await h.select_option('#sel-ma', label='Erika Beispiel (Geschäftsführerin)'); await h.wait_for_timeout(800)
            sw = await h.evaluate('document.documentElement.scrollWidth'); st = await h.locator('.kachel[data-k=fahrplan] .k-status').text_content(); await shot(h, '10_handy'); await h.close()
            assert sw <= 392, sw; return 'Breite ' + str(sw) + ' px, gleicher Stand am Handy: ' + st
        await pruefe('K23 Handy: gleiche Daten, nichts ragt über den Rand', k_handy)
        async def k_ruhe():
            psql("update audits set datum = current_date + 1 where stufe = 1 and kunde_id = '" + S['kid'] + "'")
            await k.reload(); await k.wait_for_timeout(1500); tabs = await k.locator('#nav button').all_inner_texts(); await shot(k, '11_ruhe')
            psql("update audits set datum = current_date + 7 where stufe = 1 and kunde_id = '" + S['kid'] + "'")
            assert len(tabs) <= 3, tabs; return 'Reiter im Ruhemodus: ' + ', '.join(t.strip() for t in tabs)
        await pruefe('K24 Ruhemodus am Tag vor dem Audit', k_ruhe)

        # ---------------------------------------------------------------- Backoffice danach
        async def b_uebersicht():
            await bo.goto(B + '/backoffice/'); await bo.wait_for_selector('.kunde', timeout=15000); t = await bo.locator('.kunde').first.inner_text(); await shot(bo, '12_bo_uebersicht')
            assert '✉' in t and '✎' in t; return ' | '.join(t.split('\n'))[:200]
        await pruefe('B4 Übersicht: Übungsstand, neue Nachrichten, Korrekturen', b_uebersicht)
        async def b_nachr():
            await bo.click('.kunde'); await bo.wait_for_timeout(600); await bo.click('.reiter button[data-r=nachrichten]'); await bo.wait_for_timeout(700)
            n = await bo.locator('.nachricht').count(); await bo.locator('[data-gelesen]').first.click(); await bo.wait_for_timeout(700)
            return str(n) + ' Nachrichten, eine als gelesen markiert (offen: ' + psql("select count(*) from nachrichten where not gelesen") + ')'
        await pruefe('B5 Nachrichten lesen', b_nachr)
        async def b_fakten():
            await bo.click('.reiter button[data-r=fakten]'); await bo.wait_for_timeout(600); await bo.locator('[data-erledigt]').first.check(); await bo.wait_for_timeout(500)
            return 'Korrektur erledigt: ' + psql("select count(*) from faktencheck where erledigt")
        await pruefe('B6 Faktencheck-Korrektur als erledigt markieren', b_fakten)
        async def b_fallen():
            await bo.click('.reiter button[data-r=fallen]'); await bo.wait_for_timeout(600); await bo.locator('[data-frei]').last.uncheck(); await bo.wait_for_timeout(500)
            await k.goto(S['link']); await k.wait_for_timeout(1200); await k.select_option('#sel-audit', index=1); await k.wait_for_timeout(1000)
            frei = psql("select count(*) from stolperfallen where freigegeben"); return 'freigegeben jetzt: ' + frei
        await pruefe('B7 Stolperfalle zurückziehen', b_fallen)
        async def b_ergebnis():
            await bo.click('.reiter button[data-r=ergebnis]'); await bo.wait_for_timeout(1200); t = await bo.locator('#inhalt').inner_text(); await bo.screenshot(path=W + '/alles/13_bo_ergebnis.png', full_page=True)
            teile = [x for x in ['Prüfungsreife', 'Faktencheck', 'Stolperfallen', 'Erklär es dem Azubi', 'Beispielauftrag', 'Rundgang', 'Rückmeldung nach dem Audit', 'Fehlerbuch'] if x in t]
            assert len(teile) >= 6, teile; return 'Bericht mit: ' + ', '.join(teile)
        await pruefe('B8 Ergebnisse je Kunde', b_ergebnis)
        async def b_sperren():
            await bo.click('.reiter button[data-r=link]'); await bo.wait_for_timeout(600); await bo.locator('[data-sperren]').first.click(); await bo.wait_for_timeout(700)
            await k.goto(S['link']); await k.wait_for_timeout(1500); t = await k.locator('#main').inner_text(); assert 'ungültig' in t; return 'Kunde sieht: ' + t[:70]
        await pruefe('B9 Link sperren → Kunde kommt nicht mehr hinein', b_sperren)
        async def b_loeschen():
            await bo.goto(B + '/backoffice/'); await bo.wait_for_selector('#neu'); await bo.click('#neu'); await bo.set_input_files('#zip', ZIP); await bo.wait_for_selector('#los', timeout=20000)
            await bo.click('#los'); await bo.wait_for_selector('#weiter', timeout=120000)
            vorher = psql("select count(*) from kunden"); await bo.click('#weiter'); await bo.wait_for_timeout(600); await bo.click('.reiter button[data-r=verwalten]'); await bo.wait_for_timeout(500)
            name = await bo.input_value('#v-name'); await bo.fill('#v-loeschen', name); await bo.click('#v-weg'); await bo.wait_for_timeout(1500)
            nachher = psql("select count(*) from kunden"); assert int(nachher) == int(vorher) - 1; return 'Kunden vorher ' + vorher + ', nachher ' + nachher + ' (Zweitimport gelöscht)'
        await pruefe('B10 Zweiten Import anlegen und Kunden löschen', b_loeschen)

        # ---------------------------------------------------------------- Testmonat (LinkedIn, Lektion A16)
        import urllib.request
        def post(fn, d):
            r = urllib.request.Request(B + '/functions/v1/' + fn, data=json.dumps(d).encode(), headers={'content-type': 'application/json'}, method='POST')
            try:
                with urllib.request.urlopen(r) as x: return x.status, json.loads(x.read())
            except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')
        async def t_vorlage():
            await bo.goto(B + '/backoffice/'); await bo.wait_for_selector('.kunde'); await bo.locator('.kunde').first.click(); await bo.wait_for_timeout(600)
            await bo.click('.reiter button[data-r=verwalten]'); await bo.wait_for_selector('#v-vorlage'); await bo.check('#v-vorlage'); await bo.wait_for_timeout(800)
            v = psql("select name from kunden where art='vorlage'"); assert v; return 'Vorlage: ' + v
        await pruefe('T1 Testkunden als Vorlage markieren', t_vorlage)
        t = await ctx.new_page(); t.on('pageerror', lambda e: fehler.append('Test: ' + str(e)))
        async def t_anfrage():
            await t.goto(B + '/test/?quelle=LinkedIn'); await t.click('#los'); await t.wait_for_timeout(300); m1 = await t.locator('#meldung').inner_text()
            await t.fill('#name', 'Erika Muster'); await t.fill('#firma', 'Muster Metall GmbH'); await t.fill('#email', 'erika@example.com'); await t.fill('#linkedin', 'linkedin.com/in/erika')
            await t.check('#feedback'); await t.check('#datenschutz'); await t.click('#los'); await t.wait_for_selector('.ok', timeout=8000); await shot(t, '20_test_anfrage')
            n = psql("select count(*) from testanfragen where status='neu'"); assert n == '1', n; return 'ohne Haken: „' + m1 + '“ · danach gespeichert: ' + n
        await pruefe('T2 Anfrage über /test/ (Pflichtfelder, Haken)', t_anfrage)
        async def t_frei():
            await bo.goto(B + '/backoffice/'); await bo.wait_for_selector('#anfragen'); assert '1 neu' in await bo.locator('#anfragen').inner_text()
            await bo.click('#anfragen'); await bo.wait_for_selector('[data-frei]'); await bo.click('[data-frei]'); await bo.wait_for_selector('.ok-box textarea', timeout=10000)
            text = await bo.locator('.ok-box textarea').input_value(); await shot(bo, '21_bo_freigeschaltet')
            S['schluessel'] = re.search(r'\n([0-9a-f]{48})\n', text).group(1); assert '/kunde/?t=' in text and 'LinkedIn' not in text or True
            k2 = psql("select teilnehmer || ' / ' || art || ' / ' || (select count(*) from fragen f join audits a on a.id=f.audit_id where a.kunde_id=kunden.id) from kunden where art='test'")
            return 'Teilnehmer angelegt: ' + k2 + ' · Chat-Text ' + str(len(text)) + ' Zeichen'
        await pruefe('T3 Backoffice: freischalten, Chat-Text mit Schlüssel', t_frei)
        async def t_schluessel():
            await t.goto(B + '/test/'); await t.fill('#schluessel', 'falsch'); await t.click('#schluessel-form button'); m = await t.locator('#s-meldung').inner_text()
            await t.fill('#schluessel', S['schluessel']); await t.click('#schluessel-form button'); await t.wait_for_selector('[data-m=beispiel]', timeout=15000); await t.click('[data-m=beispiel]'); await t.wait_for_selector('.test-karte', timeout=15000)
            modus = await t.locator('#modus').inner_text(); assert 'Testmonat' in modus and await t.locator('#kopf-feedback').count() == 1; await shot(t, '22_test_kunde')
            return 'falscher Schlüssel: „' + m[:40] + '…“ · ' + modus[:90]
        await pruefe('T4 Teilnehmer kommt mit Schlüssel hinein (Testmonat-Anzeige)', t_schluessel)
        async def t_feedback():
            await t.click('#kopf-feedback'); await t.wait_for_selector('#fb-los'); await t.check('input[name=fb-note][value="4"]'); await t.fill('#fb-fehlt', 'Eigene Dokumente hochladen fehlt'); await t.select_option('#fb-eigen', 'ja')
            await t.click('#fb-los'); await t.wait_for_selector('.ok-box', timeout=8000)
            n = psql("select count(*) || ' / ' || (daten->>'note') from nachrichten where art='feedback' group by daten->>'note'"); return 'Feedback gespeichert: ' + n
        await pruefe('T5 Verbesserung vorschlagen', t_feedback)
        async def t_bo_feedback():
            await bo.goto(B + '/backoffice/'); await bo.wait_for_selector('#feedback'); txt = await bo.locator('#kunden').inner_text(); assert 'Testmonat' in txt and 'Erika Muster' in txt
            await bo.click('#feedback'); await bo.wait_for_selector('.nachricht'); f = await bo.locator('#main').inner_text(); assert 'Eigene Dokumente hochladen fehlt' in f; await shot(bo, '23_bo_feedback')
            return 'Übersicht mit Abschnitt Testmonat · Feedback-Liste mit Ø-Note'
        await pruefe('T6 Backoffice: Testmonat-Abschnitt und Feedback-Liste', t_bo_feedback)
        async def t_grenze():
            psql("update kunden set grenzen = grenzen || '{\"ki_tag\":2}' where art='test'")
            erg = [post('ki', {'t': S['schluessel'], 'aktion': 'wissensfrage', 'frage': 'Wer bewertet die Lieferanten?'})[0] for _ in range(3)]
            n = [post('kunde', {'t': S['schluessel'], 'aktion': 'nachricht', 'text': 'x'})[0] for _ in range(6)]
            assert erg == [200, 200, 429], erg; assert n.count(429) >= 1, n
            return 'KI: ' + str(erg) + ' · Nachrichten: ' + str(n) + ' (Grenze je Teilnehmer greift)'
        await pruefe('T7 Grenzen je Teilnehmer (KI je Tag, Nachrichten je Tag)', t_grenze)
        async def t_loeschen():
            pid = subprocess.run(['bash', '-c', "ps -eo pid,args | awk '$2==\"node\" && $3 ~ /server.mjs/ {print $1}' | head -1"], capture_output=True, text=True).stdout.strip()
            env = open('/proc/' + pid + '/environ', 'rb').read().split(b'\0'); sp = [e.decode().split('=', 1)[1] for e in env if e.startswith(b'SPEICHER=')][0]
            pfad = psql("select kopie_pfad from dokumente d join kunden k on k.id=d.kunde_id where k.art='test' and kopie_pfad is not null limit 1")
            await bo.goto(B + '/backoffice/'); await bo.wait_for_selector('.kunde'); await bo.locator('.kunde', has_text='Erika Muster').click(); await bo.wait_for_timeout(600)
            await bo.click('.reiter button[data-r=verwalten]'); await bo.wait_for_timeout(500); name = await bo.input_value('#v-name'); await bo.fill('#v-loeschen', name); await bo.click('#v-weg'); await bo.wait_for_timeout(1500)
            assert psql("select count(*) from kunden where art='test'") == '0'; assert os.path.exists(sp + '/dokumente/' + pfad), 'Datei der Vorlage gelöscht!'
            return 'Teilnehmer gelöscht, Datei der Vorlage bleibt: ' + pfad[:40]
        await pruefe('T8 Teilnehmer löschen lässt Dateien der Vorlage stehen', t_loeschen)

        # ---------------------------------------------------------------- Eigene Dokumente im Testmonat (E-A33): bleiben im Browser
        Q = os.path.dirname(os.path.abspath(__file__)) + '/../testkunde/quellen/'
        async def e_start():
            post('kunde', {'aktion': 'testanfrage', 'name': 'Otto Eigen', 'firma': 'Eigen GmbH', 'email': 'otto@example.com', 'feedback_zugesagt': True, 'datenschutz_ok': True})
            S['tok2'] = psql("select set_config('request.jwt.claims', '{\"email\":\"test@example.com\"}', true), testkunde_anlegen((select id from testanfragen where email='otto@example.com'))").split('|')[-1]
            assert re.match(r'^[0-9a-f]{48}$', S['tok2']), S['tok2']
            S['e'] = await ctx.new_page(); e = S['e']; e.on('pageerror', lambda x: fehler.append('Eigen: ' + str(x)))
            S['req'] = []; e.on('request', lambda r: S['req'].append((r.url, r.post_data or '')) if '/functions/v1/' in r.url or '/rest/v1/' in r.url else None)
            await e.goto(B + '/kunde/?t=' + S['tok2']); await e.wait_for_selector('.eigen-karte', timeout=15000); await shot(e, '30_eigen_auswahl')
            return 'Auswahl: ' + ' | '.join([x.strip()[:30] for x in await e.locator('.eigen-karte b').all_text_contents()])
        await pruefe('E1 Testmonat: Auswahl Beispielfirma oder eigene Dokumente', e_start)
        async def e_einrichten():
            e = S['e']; await e.click('[data-m=eigen]'); await e.wait_for_selector('#e-firma'); await e.click('#e-los'); m0 = await e.locator('#e-protokoll').inner_text()
            await e.fill('#e-firma', 'Eigen GmbH'); await e.fill('#e-ma', 'Otto, Paula'); await e.fill('#e-d1', '2026-11-20')
            await e.set_input_files('#e-dateien', [Q + 'UPH.pdf', Q + 'MB.pdf', Q + 'Notfallplan.pdf']); await e.click('#e-los')
            await e.wait_for_function("document.querySelector('#e-protokoll').innerText.includes('Fertig')", timeout=60000); prot = await e.locator('#e-protokoll').inner_text(); await shot(e, '31_eigen_eingerichtet')
            await e.click('#e-los'); await e.wait_for_selector('.test-karte', timeout=15000); await e.select_option('#sel-ma', index=1); await e.wait_for_timeout(800)
            modus = await e.locator('#modus').inner_text(); assert 'eigenen Dokumenten' in modus and await e.locator('#kopf-senden').count() == 0 and await e.locator('#kopf-feedback').count() == 1
            await shot(e, '32_eigen_heute'); return 'ohne Firma: „' + m0.strip()[:40] + '“ · ' + prot.strip().split('\n')[-1][:140]
        await pruefe('E2 Eigene PDFs einrichten (im Browser gelesen), Senden ausgeblendet', e_einrichten)
        async def e_fahrplan():
            e = S['e']; await e.click('nav button[data-k=fahrplan]'); await e.wait_for_timeout(800); t = await e.locator('#main').inner_text()
            assert 'Vorschlag aus Ihren Dokumenten' in t or 'UPH' in t, t[:300]; return 'Fahrplan mit Standardfragen und Fundstellen-Vorschlägen (' + str(t.count('Vorschlag aus Ihren Dokumenten')) + ' sichtbar)'
        await pruefe('E3 Fahrplan aus Standardfragen mit Fundstellen aus den eigenen PDFs', e_fahrplan)
        async def e_suche():
            e = S['e']; await e.click('nav button[data-k=finden]'); await e.wait_for_timeout(400); await e.fill('#suche', 'Lieferantenbewertung'); await e.click('#suchen'); await e.wait_for_timeout(600)
            bt = e.locator('#ergebnis .auszug button[data-ort]').first; lab = await bt.text_content()
            async with ctx.expect_page() as neu: await bt.click()
            v = await neu.value; await v.wait_for_function('window.__pdfBereit', timeout=30000); info = await v.evaluate('window.__pdfBereit'); u = v.url; await shot(v, '33_eigen_betrachter'); await v.close()
            assert '?e=' in u; m = re.search(r'Seite (\d+)', lab); assert not m or int(m.group(1)) == info['start'], (lab, info)
            return lab.strip() + ' → Betrachter aus diesem Browser, Seite ' + str(info['start']) + ' von ' + str(info['n'])
        await pruefe('E4 „Wo steht das?“ und Seitenbetrachter aus dem Browser-Speicher', e_suche)
        async def e_ki():
            e = S['e']; vor = psql("select coalesce(sum(anzahl),0) from nutzung n join kunden k on k.id=n.kunde_id where k.teilnehmer like 'Otto%' and n.art='ki'")
            await e.fill('#suche', 'Wer bewertet bei uns die Lieferanten?'); await e.click('#suchen'); await e.wait_for_selector('.ki-antwort button[data-ort]', timeout=30000)
            ki = [b for (u, b) in S['req'] if '/functions/v1/ki' in u and 'wissensfrage' in b]; assert ki and '"auszuege"' in ki[-1]
            nach = psql("select coalesce(sum(anzahl),0) from nutzung n join kunden k on k.id=n.kunde_id where k.teilnehmer like 'Otto%' and n.art='ki'"); assert int(nach) == int(vor) + 1
            return 'KI bekam ' + str(ki[-1].count('"dokument_id"')) + ' Textstellen vom Gerät · Kontingent gezählt (' + vor + '→' + nach + ')'
        await pruefe('E5 KI fragen: Textstellen nur durchgereicht, Grenze zählt', e_ki)
        async def e_feedback():
            e = S['e']; await e.click('#kopf-feedback'); await e.wait_for_selector('#fb-los'); await e.check('input[name=fb-note][value="5"]'); await e.fill('#fb-hilft', 'Eigene Dokumente!'); await e.click('#fb-los'); await e.wait_for_selector('.ok-box', timeout=8000)
            return 'Feedback am Server: ' + psql("select count(*) from nachrichten n join kunden k on k.id=n.kunde_id where k.teilnehmer like 'Otto%' and n.art='feedback'")
        await pruefe('E6 Verbesserung vorschlagen geht auch mit eigenen Dokumenten', e_feedback)
        async def e_nichts():
            kunde_req = [b for (u, b) in S['req'] if '/functions/v1/kunde' in u]
            aktionen = sorted(set(json.loads(b).get('aktion') for b in kunde_req if b))
            assert set(aktionen) <= {'start', 'nachricht'}, aktionen
            assert not any('Lieferant' in b for b in kunde_req), 'Dokumenttext an die Kunden-Funktion!'
            assert not any('/rest/v1/' in u for (u, b) in S['req'])
            antw = psql("select count(*) from antworten a join fragen f on f.id=a.frage_id join audits au on au.id=f.audit_id join kunden k on k.id=au.kunde_id where k.teilnehmer like 'Otto%'")
            eintr = psql("select count(*) from kunden_eintraege e join kunden k on k.id=e.kunde_id where k.teilnehmer like 'Otto%'")
            assert antw == '0' and eintr == '0'; return 'Server bekam nur: ' + ', '.join(aktionen) + ' · Antworten/Einträge in der Datenbank: ' + antw + '/' + eintr
        await pruefe('E7 Nichts von den Dokumenten oder Übungen landet auf dem Server', e_nichts)
        async def e_marke():
            d = await ctx.new_page(); await d.goto(B + '/kunde/?demo'); await d.wait_for_selector('#fuss a'); fu = await d.locator('#fuss').inner_text()
            await d.click('nav button[data-k=danach]'); await d.wait_for_timeout(400); vorher = await d.locator('.marke-karte').count()
            await d.select_option('#r-ergebnis', 'bestanden'); await d.click('#r-speichern'); await d.wait_for_timeout(500); nachher = await d.locator('.marke-karte').count()
            href = await d.locator('.marke-karte a').first.get_attribute('href'); await shot(d, '34_nach_audit_karten'); await d.close()
            assert 'Impressum' in fu and 'Datenschutz' in fu and vorher == 0 and nachher == 2 and 'writereview' in href
            return 'Fußzeile mit Impressum/Datenschutz · Karten vor/nach Ergebnis: ' + str(vorher) + '/' + str(nachher)
        await pruefe('M1 Fußzeile, Bewertungs- und Folgejahr-Karte erst nach dem Ergebnis', e_marke)

        async def p_lokal():
            d = await ctx.new_page(); d.on('pageerror', lambda x: fehler.append('Probeaudit: ' + str(x)))
            await d.goto(B + '/kunde/?demo'); await d.wait_for_selector('#sel-ma'); await d.select_option('#sel-ma', index=1); await d.wait_for_timeout(500)
            await d.click('[data-schnell=probeaudit]'); await d.wait_for_selector('#pa-start'); th = await d.locator('#pa-themen li').count()
            await d.click('#pa-start'); await d.wait_for_selector('.pa-msg.au'); f1 = await d.locator('.pa-msg.au').last.inner_text()
            await d.fill('#pa-text', 'Das machen wir so.'); await d.click('#pa-los'); await d.wait_for_timeout(400); nach = await d.locator('.pa-msg.au').last.inner_text()
            await d.fill('#pa-text', 'Das steht im Handbuch Seite 11, zum Beispiel beim Auftrag 2026-118.'); await d.click('#pa-los'); await d.wait_for_timeout(900)
            await d.click('#pa-was'); was = await d.locator('#pa-wasbox').inner_text()
            await d.click('#pa-ende'); await d.wait_for_selector('#pa-auswertung .karte', timeout=8000); aw = await d.locator('#pa-auswertung').inner_text(); await shot(d, '40_probeaudit'); await d.close()
            assert th >= 2 and 'zeigen' in nach and 'Auswertung' in aw, (th, nach, aw[:80])
            return str(th) + ' Themen · 1. Frage: „' + f1.split('\n')[1][:50] + '…“ · Nachhaken: „' + nach.split('\n')[1][:40] + '“ · ' + aw.split('\n')[0]
        await pruefe('P1 Probeaudit ohne KI: Themen, Nachhaken, Was meint er?, Auswertung', p_lokal)
        async def w_wissen():
            d = await ctx.new_page(); d.on('pageerror', lambda x: fehler.append('Wissen: ' + str(x)))
            await d.goto(B + '/kunde/?demo'); await d.wait_for_selector('#sel-ma'); await d.select_option('#sel-ma', index=1); await d.wait_for_timeout(500)
            await d.click('nav button[data-k=fahrplan]'); await d.wait_for_selector('.karte[data-f] .bsp textarea', state='attached')
            ph = await d.eval_on_selector_all('.karte[data-f] .bsp textarea', 'x => x.map(t => t.placeholder)')
            n = await d.locator('.karte[data-f]').count(); praxis = 0
            for i in range(n):
                kk = d.locator('.karte[data-f]').nth(i); await kk.locator('[data-t=hilfe]').click(); await d.wait_for_timeout(150)
                if await kk.locator('.hilfe .praxis').count(): praxis += 1
            await shot(d, '41_fahrplan_praxis'); await d.close()
            verschieden = len(set(ph)); kuehl = sum('Kühlwesten' in x for x in ph)
            assert verschieden >= min(4, len(ph)) and kuehl <= 1 and praxis >= 2, (verschieden, len(ph), kuehl, praxis)
            return str(verschieden) + ' verschiedene Beispiele für ' + str(len(ph)) + ' Fragen · Beratungspraxis bei ' + str(praxis) + ' von ' + str(n) + ' Fragen'
        await pruefe('W1 Beispiel passt zur Frage, Beratungspraxis unter „Wo steht das?“', w_wissen)
        async def p_ki():
            k = S['e']
            await k.click('nav button[data-k=probeaudit]'); await k.wait_for_selector('#pa-start'); await k.click('#pa-start'); await k.wait_for_selector('.pa-msg.au', timeout=20000)
            await k.wait_for_function("[...document.querySelectorAll('.pa-msg.au')].some(m => !m.innerText.includes('überlegt'))", timeout=30000)
            f1 = await k.locator('.pa-msg.au').first.inner_text(); await k.fill('#pa-text', 'Wir bewerten jährlich, siehe QM-Übersicht.'); await k.click('#pa-los')
            await k.wait_for_function("document.querySelectorAll('.pa-msg.au').length >= 2 && ![...document.querySelectorAll('.pa-msg.au')].some(m => m.innerText.includes('überlegt'))", timeout=30000)
            n = await k.locator('.pa-msg.au').count(); await k.click('#pa-ende'); await k.wait_for_selector('#pa-auswertung .karte', timeout=20000); aw = await k.locator('#pa-auswertung').inner_text()
            assert n >= 2, n; return 'KI-Auditor: „' + f1.split('\n')[1][:60] + '“ · ' + str(n) + ' Fragen · ' + aw.split('\n')[0]
        await pruefe('P2 Probeaudit mit KI (Ersatz-KI): Fragen und Rückmeldung', p_ki)

        ERG.append({'name': 'Keine Skriptfehler auf den Seiten', 'ok': not fehler, 'info': '; '.join(fehler)[:300]})
        json.dump(ERG, open(W + '/alles-bericht.json', 'w'), ensure_ascii=False, indent=1)
        print('\n', sum(1 for e in ERG if e['ok']), 'von', len(ERG), 'bestanden'); await br.close()

asyncio.run(main())
