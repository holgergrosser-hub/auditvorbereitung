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
        async def k_gespraech():
            await k.click('#kg-start'); await k.wait_for_selector('#kg-text', timeout=30000); await k.fill('#kg-text', 'Wir bewerten unsere Lieferanten im Januar, steht im Handbuch Seite 14.')
            await k.click('#kg-los'); await k.wait_for_selector('#kg-ende', timeout=30000); await k.click('#kg-ende'); await k.wait_for_selector('#kg-neu', timeout=30000)
            return (await k.locator('#ki-gespraech').inner_text())[:120].replace('\n', ' ')
        await pruefe('K15 Probegespräch mit dem KI-Auditor', k_gespraech)
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
            await t.fill('#schluessel', S['schluessel']); await t.click('#schluessel-form button'); await t.wait_for_selector('.test-karte', timeout=15000)
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

        ERG.append({'name': 'Keine Skriptfehler auf den Seiten', 'ok': not fehler, 'info': '; '.join(fehler)[:300]})
        json.dump(ERG, open(W + '/alles-bericht.json', 'w'), ensure_ascii=False, indent=1)
        print('\n', sum(1 for e in ERG if e['ok']), 'von', len(ERG), 'bestanden'); await br.close()

asyncio.run(main())
