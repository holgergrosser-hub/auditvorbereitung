# Link-Prüfung im Browser (Playwright)

Prüft nach jedem `npm run paket`, dass jeder Seiten- und Reiter-Link im Kundenbereich im Seitenbetrachter
genau die richtige Seite zeigt (Fußzeile „Seite N von“, Reiter-Überschrift bzw. Text des Auszugs).

    cd daten/<kunde>/netlify && python3 -m http.server 8790 &
    python3 test/browser/alle_links.py /tmp http://localhost:8790/kunde/ daten/<kunde>/paket-quelle.json   # Spickzettel, Plan, PDF-Sicherung
    python3 test/browser/stelle.py     /tmp http://localhost:8790/kunde/ daten/<kunde>/paket-quelle.json   # „Wo steht das?“, Suche, Azubi

Erwartet: `falsch 0`.
