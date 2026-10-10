/**
 * Holgers Beratungswissen zu den Übungsfragen (E-A38).
 * Quelle: anonymisierter Auszug der „QM-Wissensbasis aus Fireflies“ (Beratungsgespräche QM-Dienstleistungen Grosser),
 * wie im iso9001-portal (WISSEN.faq). Keine Firmen-, Personen- oder Produktnamen – das Repo ist öffentlich.
 * Nutzt: Fahrplan („Wo steht das?“, „Mein Beispiel“), Probeaudit („Was meint der Auditor?“, Nachhaken, KI-Auditor).
 */
import { NACHFRAGEN } from './nachfragen.js';
export const PRAXIS = [ { "kap": "4.3", "q": "Was gehört in den Geltungsbereich?", "a": "Ein Satz: was Sie tun, für wen, mit welchen Leistungen. Alle Tätigkeiten, mit denen Sie Geld verdienen, gehören hinein. Entwicklung (8.3) darf nur ausgeschlossen werden, wenn Sie ausschließlich nach Vorgabe des Kunden arbeiten.", "tags": "scope anwendungsbereich geltungsbereich eingrenzen ausschluss" },
  { "kap": "4.1", "q": "Müssen wir die Prozesse erst optimieren, bevor wir zertifizieren?", "a": "Nein. Für die Zertifizierung beschreiben Sie Ihre Abläufe so, wie sie heute funktionieren. Verbesserung läuft danach Schritt für Schritt – das ist ein eigenes Projekt.", "tags": "chaos optimieren verbessern vorher prozesse" },
  { "kap": "4.2", "q": "Welche Zulassungen müssen wir angeben?", "a": "Nur behördliche Genehmigungen, die Sie für Ihre Tätigkeit brauchen und die heute gültig sind (z. B. Erlaubnis zur Arbeitnehmerüberlassung, Sachkunde § 34a, Handwerksrolle). ISO 9001 selbst ist keine Zulassung. Wenn Sie keine brauchen: „keine“.", "tags": "zulassung genehmigung erlaubnis" },
  { "kap": "4.1", "q": "Was müssen wir zum Klimawandel angeben?", "a": "Seit 2024 muss jeder Betrieb einmal bewerten, ob der Klimawandel für ihn ein relevantes Thema ist – mit einem Satz Begründung. Bei den meisten Kleinbetrieben lautet die Antwort „nicht relevant, weil …“. Mehr ist nicht verlangt.", "tags": "klima klimawandel klimaschutz nachhaltigkeit umwelt" },
  { "kap": "5.3", "q": "Brauchen wir einen QMB?", "a": "Die Norm verlangt keinen QMB mit diesem Titel, aber klare Zuständigkeiten. Im Kleinbetrieb übernimmt das oft die Geschäftsführung oder die Büroleitung. Die Verantwortung für das QM-System bleibt immer bei der Geschäftsführung.", "tags": "qmb qualitätsmanagementbeauftragter beauftragter verantwortlich" },
  { "kap": "8.4", "q": "Was ist ein ausgelagerter Prozess?", "a": "Wenn ein anderer Betrieb einen Teil Ihrer Leistung erbringt und das Ergebnis zu Ihnen zurückkommt oder direkt an Ihren Kunden geht – z. B. Härten, Beschichten, Subunternehmer auf der Baustelle. Reine Zukaufteile sind kein ausgelagerter Prozess. Ausgelagerte Partner kommen in die Lieferantenbewertung.", "tags": "ausgelagert fremdvergabe subunternehmer outsourcing" },
  { "kap": "8.4", "q": "Wie viele Lieferanten müssen wir bewerten?", "a": "Ihre wichtigsten – im Kleinbetrieb meist 4–8, einschließlich Dienstleistern wie IT, Kalibrierdienst oder Subunternehmer. Einmal im Jahr, mit Schulnoten. Eine einfache Liste reicht.", "tags": "lieferantenbewertung lieferanten bewerten einkauf" },
  { "kap": "9.1.2", "q": "Müssen wir einen Fragebogen an Kunden schicken?", "a": "Nein, davon ist abzuraten – Fragebögen kommen selten ausgefüllt zurück. Besser: Sie bewerten Ihre Hauptkunden aus deren Sicht selbst und stützen das auf Belege wie Folgeaufträge, Dankes-Mails oder Google-Bewertungen. Das ist zulässig und im Audit glaubwürdig.", "tags": "kundenzufriedenheit fragebogen umfrage befragung" },
  { "kap": "5.3", "q": "Wie detailliert muss das Organigramm sein?", "a": "Funktionen statt Namen, wer an wen berichtet, und die externen Stellen: Steuerbüro, Fachkraft für Arbeitssicherheit, Betriebsarzt, IT, Datenschutz. Minijobber und Aushilfen müssen nicht einzeln rein.", "tags": "organigramm struktur extern steuerberater" },
  { "kap": "7.1.2", "q": "Brauchen wir eine Fachkraft für Arbeitssicherheit und einen Betriebsarzt?", "a": "Ja, sobald Sie Mitarbeiter beschäftigen – das ist Arbeitsschutzrecht, nicht ISO. Im Kleinbetrieb meist über einen externen Dienstleister oder das Unternehmermodell der Berufsgenossenschaft. Für das Audit reicht der Nachweis, wer das für Sie übernimmt.", "tags": "fasi fachkraft arbeitssicherheit betriebsarzt" },
  { "kap": "7.1.4", "q": "Brauchen wir Ersthelfer?", "a": "Ja, ab zwei Beschäftigten mindestens eine ausgebildete Ersthelferin bzw. einen Ersthelfer (Unfallverhütungsvorschrift DGUV Vorschrift 1). Die Ausbildung wird alle zwei Jahre aufgefrischt – das gehört in den Schulungsplan.", "tags": "ersthelfer erste hilfe büro" },
  { "kap": "6.1", "q": "Was bedeutet „Projekte und Investitionen“?", "a": "Ihre eigenen Investitionen und Vorhaben der letzten Jahre – Maschinen, Fahrzeuge, Software, Schulungen, Umbauten – nicht einzelne Kundenaufträge. Hinter jeder Investition steht ein Risiko, das Sie vermeiden, oder eine Chance, die Sie nutzen. Daraus entsteht die Risiken- und Chancenanalyse.", "tags": "projekte investitionen risiken chancen" },
  { "kap": "6.1.2", "q": "Wie finden wir Risiken und Chancen?", "a": "Nicht erfinden, sondern aus dem Alltag ableiten: Was ist schon schiefgegangen, was wäre teuer, wovon sind Sie abhängig? Seit ISO 9001:2026 werden Risiken und Chancen getrennt bewertet, und einmal im Jahr prüfen Sie, ob die Maßnahmen gewirkt haben.", "tags": "risiken chancen analyse finden bewerten wirksamkeit" },
  { "kap": "6.2", "q": "Welche Qualitätsziele sind realistisch?", "a": "3–7 Ziele mit Zahl, Verantwortlichem und Termin, gemessen mit Daten, die Sie schon haben: Reklamationen pro Jahr, Liefertreue, Kundenbewertung, Umsatz. Ziele dürfen angepasst werden, wenn sich die Lage ändert.", "tags": "ziele qualitätsziele kennzahlen messbar" },
  { "kap": "8.1", "q": "Wie detailliert muss ein Prozess beschrieben sein?", "a": "So, dass ein Fachfremder den Ablauf versteht: 5–12 Schritte, wer macht es, womit (Software, Formular). Keine Handgriffe, keine Arbeitsanweisungen. Beschreiben Sie Ihren Standardauftrag – Ausnahmen gibt es immer.", "tags": "prozess prozessbeschreibung detailliert ablauf schritte" },
  { "kap": "7.5", "q": "Brauchen wir viele Verfahrens- und Arbeitsanweisungen?", "a": "Nein. So wenig wie möglich, so viel wie nötig. Eine Tabelle oder ein Satz im Handbuch reicht oft. Anweisungen nur dort, wo ohne sie Fehler passieren würden.", "tags": "verfahrensanweisung arbeitsanweisung dokumentation viel" },
  { "kap": "7.5", "q": "Was müssen wir zur Datensicherung festhalten?", "a": "Zwei Sätze: wie oft, wohin (z. B. täglich NAS, wöchentlich Cloud) und wer zuständig ist. Einmal im Jahr eine Datei zurücksichern und das Datum notieren – dann wissen Sie, dass es funktioniert.", "tags": "datensicherung backup daten sichern" },
  { "kap": "7.1.5", "q": "Wie oft müssen Messmittel kalibriert werden?", "a": "Nach Nutzung und Herstellerangabe – jährlich ist üblich, bei seltener Nutzung auch zwei Jahre. Erfassen Sie alle Messmittel in einer Liste mit nächstem Prüftermin. Messmittel, die für die Produktqualität nicht zählen, kennzeichnen Sie als „nicht für Qualitätsmessungen“.", "tags": "kalibrieren messmittel prüfmittel messschieber" },
  { "kap": "7.2", "q": "Welche Schulungen müssen wir nachweisen?", "a": "Das, was tatsächlich gelaufen ist – nicht erfinden: Sicherheitsunterweisung, Erste Hilfe, Pflichtqualifikationen Ihrer Branche, fachliche Schulungen. Neu nach ISO 9001:2026: eine kurze jährliche Unterweisung zu Qualitätskultur und ethischem Verhalten. Teilnahmelisten und Zertifikate aufheben.", "tags": "schulung unterweisung nachweis schulungsplan" },
  { "kap": "7.1.3", "q": "Müssen elektrische Geräte jedes Jahr geprüft werden?", "a": "Die Frist legt die Gefährdungsbeurteilung fest; im Büro sind oft zwei Jahre üblich, auf Baustellen deutlich kürzer. Wichtig für das Audit: eine Übersicht der Geräte und der nächste Prüftermin. Ist die Prüfung beauftragt, aber noch nicht erledigt, reicht der Nachweis der Beauftragung.", "tags": "dguv prüfung elektrische geräte v3 ortsveränderlich" },
  { "kap": "7.1.4", "q": "Brauchen wir einen Datenschutzbeauftragten?", "a": "Pflicht in der Regel erst, wenn mindestens 20 Personen ständig mit personenbezogenen Daten arbeiten. Darunter braucht es einen Verantwortlichen, der sich kümmert, und eine kurze Datenschutzunterweisung für alle.", "tags": "datenschutz datenschutzbeauftragter dsgvo" },
  { "kap": "10.2", "q": "Was kommt in den Maßnahmenplan?", "a": "Alles, was Sie sich vorgenommen haben: Abweichungen aus Audits, Maßnahmen aus Reklamationen und aus der Managementbewertung. Mit Termin und Verantwortlichem – und am Ende ein Satz, ob es gewirkt hat.", "tags": "maßnahmenplan maßnahmen abweichung korrektur" },
  { "kap": "Zertifizierungsaudit", "q": "Wie läuft das Audit ab?", "a": "Der Auditor prüft die Dokumente, führt Gespräche und lässt sich Abläufe an echten Beispielen zeigen. Im Kleinbetrieb dauert das meist einen halben bis einen Tag, oft auch remote. Schicken Sie die Unterlagen vorab – dann kommen Rückfragen vorher und nicht am Audittag.", "tags": "audit ablauf zertifizierungsaudit vorbereitung auditor" },
  { "kap": "Zertifizierungsaudit", "q": "Müssen wir alles auswendig können?", "a": "Nein. Sie müssen nur wissen, wo es steht. Legen Sie die Dokumente griffbereit, zeigen Sie Ihren eigenen Ablauf an einem abgeschlossenen Beispiel und sagen Sie bei fremden Themen: „Das macht die Kollegin.“", "tags": "auswendig audit zeigen vorbereiten finden" },
  { "kap": "Zertifizierungsaudit", "q": "Müssen wir alle Vorschläge des Auditors umsetzen?", "a": "Nein. Nur echte Abweichungen müssen behoben werden. Verbesserungsvorschläge („könnte, sollte“) prüfen Sie in Ruhe: Macht das für uns Sinn? Alles, was Sie zusagen, müssen Sie jedes Jahr wieder nachweisen.", "tags": "vorschläge auditor verbesserung empfehlung umsetzen" },
  { "kap": "Zertifizierungsaudit", "q": "Was passiert, wenn im Audit etwas fehlt?", "a": "Dann wird es nachgereicht – meist mit einer Frist von einigen Wochen. Kleine Lücken sind normal und verhindern das Zertifikat nicht. Wichtig ist ein klarer Termin, bis wann Sie es liefern.", "tags": "fehlt abweichung nachreichen durchfallen" },
  { "kap": "9.2", "q": "Wie oft müssen interne Audits sein?", "a": "Einmal im Jahr, vor dem externen Audit. Im Kleinbetrieb am einfachsten: jedes Jahr das ganze System einmal durchgehen. Je Audit legen Sie Ziel, Kriterien und Umfang fest (neu nach ISO 9001:2026, 9.2.2 a).", "tags": "internes interne audit häufigkeit auditprogramm" },
  { "kap": "9.3", "q": "Was ist die Managementbewertung?", "a": "Einmal im Jahr bewertet die Geschäftsführung, ob das QM-System funktioniert: Ziele, Kundenzufriedenheit, Lieferanten, Audits, Risiken und Chancen (getrennt, mit Wirksamkeit), Änderungen im Umfeld und geplante Änderungen. Daraus folgen Entscheidungen und Maßnahmen. Sie ist das letzte Dokument vor dem Audit.", "tags": "managementbewertung bewertung geschäftsführung" } ];

/* Themen der Übungsfragen: passendes Beispiel (Platzhalter für „Mein Beispiel“) und typische Nachfrage des Auditors.
   Die Beispiele zeigen die Formel „Was wir machen – wo es steht – ein Beispiel“ an einem kleinen Betrieb. */
export const THEMEN = [
  { kap: [], rx: /notfall|brand|feuer|unfall|evakuier|erste hilfe|ersthelfer|leckage|auslaufen/i, beispiel: 'Unser Notfallplan hängt am Eingang; die letzte Räumungsübung war im April, das Protokoll liegt im QM-Ordner. Die Feuerlöscher sind bis 03/2027 geprüft.', nachfrage: 'Wann haben Sie den Notfall zuletzt geübt, und was kam dabei heraus?' },
  { kap: [], rx: /umwelt|abfall|entsorg|umweltaspekt|energie|gefahrstoff|emission/i, beispiel: 'Unsere Abfälle trennen wir nach dem Entsorgungskonzept; die Nachweise vom Entsorger heften wir im Umweltordner ab, zuletzt im September.', nachfrage: 'Welcher Umweltaspekt ist bei Ihnen der wichtigste, und was tun Sie dagegen?' },
  { kap: [], rx: /gefährdung|arbeitsschutz|arbeitssicherheit|psa|schutzausrüstung|sicherheitsunterweis/i, beispiel: 'Die Gefährdungsbeurteilung für die Montage haben wir im Frühjahr aktualisiert; daraus kam, dass jeder Monteur eine Absturzsicherung bekommt – unterwiesen im Mai.', nachfrage: 'Wie beteiligen Sie die Mitarbeiter an der Gefährdungsbeurteilung?' },
  { kap: ['4.3'], rx: /geltungsbereich|anwendungsbereich|ausschl/i, beispiel: 'Wir montieren und warten … für Gewerbekunden in der Region – so steht es im Handbuch Kapitel 1. Entwicklung schließen wir aus, weil wir nur nach Vorgabe des Kunden arbeiten.', nachfrage: 'Gibt es Leistungen, mit denen Sie Geld verdienen, die nicht im Geltungsbereich stehen?' },
  { kap: ['4.1', '4.2', '4'], rx: /kontext|interessierte|partei|umfeld|klima/i, beispiel: 'Zwei Großkunden verlangen seit diesem Jahr kürzere Lieferzeiten – das steht in unserer Kontextanalyse, und deshalb haben wir … geändert.', nachfrage: 'Wann haben Sie das zuletzt überprüft, und was hat sich seitdem geändert?' },
  { kap: ['5.2', '5.1'], rx: /politik|leitbild|führung|verpflicht|qualitätskultur|ethi/i, beispiel: 'Unsere Qualitätspolitik hängt im Aufenthaltsraum; in der Jahresbesprechung im Januar haben wir sie mit allen durchgesprochen – die Teilnehmerliste liegt im QM-Ordner.', nachfrage: 'Wie erfahren neue Mitarbeiter von der Politik?' },
  { kap: ['5.3'], rx: /verantwort|zuständig|befugnis|organigramm|qmb|stellvertret/i, beispiel: 'Die Zuständigkeiten stehen im Organigramm; wenn die Büroleitung im Urlaub ist, übernimmt … – so war es zuletzt im August.', nachfrage: 'Wer vertritt Sie, wenn Sie ausfallen?' },
  { kap: ['6.1'], rx: /risik|chance/i, beispiel: 'Unser erfahrenster Monteur geht nächstes Jahr in Rente – das steht als Risiko in der Analyse, deshalb arbeiten wir seit März einen Nachfolger ein.', nachfrage: 'Woran sehen Sie, ob die Maßnahme gewirkt hat?' },
  { kap: ['6.2'], rx: /ziel|kennzahl/i, beispiel: 'Ziel: höchstens drei Reklamationen im Jahr. Letztes Jahr waren es zwei – die Auswertung steht in der Managementbewertung.', nachfrage: 'Was tun Sie, wenn ein Ziel nicht erreicht wird?' },
  { kap: ['6.3'], rx: /änderung.*plan|geplante änderung/i, beispiel: 'Als wir die neue Auftragssoftware eingeführt haben, haben wir vorher festgelegt, wer schult, wie lange beide Systeme parallel laufen und woran wir merken, dass es klappt.', nachfrage: 'Welche Änderung haben Sie zuletzt so geplant?' },
  { kap: ['7.1.3'], rx: /wartung|infrastruktur|maschine|fahrzeug|gerät|dguv|prüfplakette|leiter|gurt/i, beispiel: 'Unsere Leitern und Gurte stehen im Wartungsplan; der Auffanggurt wird jährlich geprüft, die Plakette zeigt die nächste Prüfung.', nachfrage: 'Zeigen Sie mir bitte ein Gerät mit seiner letzten Prüfung.' },
  { kap: ['7.1.4'], rx: /arbeitsumgebung|hitze|klima|ersthelfer|datenschutz|belastung/i, beispiel: 'Im heißen Sommer haben wir Kühlwesten angeschafft und die Arbeitszeit auf den Baustellen früher gelegt – das steht in der Gefährdungsbeurteilung.', nachfrage: 'Wie stellen Sie fest, ob die Arbeitsbedingungen passen?' },
  { kap: ['7.1.5'], rx: /messmittel|prüfmittel|kalibr|messgerät/i, beispiel: 'Unsere Messgeräte stehen in der Prüfmittelliste mit dem nächsten Termin; der Messschieber wurde im Mai kalibriert, der Schein liegt im Ordner.', nachfrage: 'Was tun Sie, wenn ein Messmittel bei der Kalibrierung durchfällt?' },
  { kap: ['7.1.6'], rx: /wissen|know-how|erfahrung weiter/i, beispiel: 'Wissen sichern wir über Einarbeitung im Team und Checklisten, z. B. für die Inbetriebnahme – die liegt auf dem Server.', nachfrage: 'Was passiert mit dem Wissen, wenn ein erfahrener Kollege geht?' },
  { kap: ['7.2', '7.3'], rx: /schulung|kompetenz|qualifikation|unterweis|einarbeit|bewusstsein/i, beispiel: 'Ein neuer Monteur wird zwei Wochen von einem Kollegen eingearbeitet; die Checkliste unterschreiben beide, sie liegt in der Personalakte. Die Sicherheitsunterweisung war im Januar.', nachfrage: 'Wie prüfen Sie, ob eine Schulung etwas gebracht hat?' },
  { kap: ['7.4'], rx: /kommunikation|besprechung|informier/i, beispiel: 'Jeden Montag 15 Minuten Teambesprechung; wichtige Punkte schreiben wir in die Gruppe und ins Besprechungsprotokoll.', nachfrage: 'Wie erfahren die Kollegen auf der Baustelle von Änderungen?' },
  { kap: ['7.5'], rx: /dokument|lenkung|aufzeichnung|datensicherung|backup|archiv|version/i, beispiel: 'Unsere Dokumente liegen im QM-Ordner auf dem Server, jedes mit Stand; die Datensicherung läuft täglich, im März haben wir eine Datei testweise zurückgeholt.', nachfrage: 'Woran erkennen Sie, dass Sie mit dem aktuellen Stand arbeiten?' },
  { kap: ['8.2'], rx: /anfrage|angebot|auftrag|vertrag|kundenanforder|nachtrag|bestätig/i, beispiel: 'Beim letzten Auftrag kam ein Nachtrag dazu – den haben wir dem Kunden schriftlich bestätigt, bevor wir weitergearbeitet haben. Angebot und Bestätigung liegen in der Auftragsmappe.', nachfrage: 'Zeigen Sie mir bitte einen abgeschlossenen Auftrag von der Anfrage bis zur Rechnung.' },
  { kap: ['8.3'], rx: /entwicklung|konstruktion/i, beispiel: 'Wir entwickeln nicht selbst, sondern arbeiten nach Zeichnung des Kunden – deshalb ist 8.3 im Handbuch ausgeschlossen.', nachfrage: 'Passen Sie Zeichnungen oder Lösungen für den Kunden an?' },
  { kap: ['8.4'], rx: /lieferant|einkauf|bestell|subunternehm|fremdvergab|ausgelagert|dienstleister/i, beispiel: 'Unsere wichtigsten Lieferanten bewerten wir einmal im Jahr mit Schulnoten; einer bekam wegen verspäteter Lieferungen eine 4, seitdem bestellen wir dort früher.', nachfrage: 'Welche Konsequenz hatte die letzte schlechte Bewertung?' },
  { kap: ['8.5'], rx: /ausführung|montage|produktion|fertigung|baustelle|einsatz|dienstleistung|kennzeichnung|eigentum des kunden/i, beispiel: 'Für jeden Einsatz gibt es die Einsatzplanung mit Material und Team; vor Ort arbeitet der Monteur nach dem Auftrag und hakt das Prüfprotokoll ab.', nachfrage: 'Woher weiß der Monteur vor Ort, was genau zu tun ist?' },
  { kap: ['8.6'], rx: /freigabe|abnahme|endprüfung|prüfprotokoll|übergabe/i, beispiel: 'Vor der Übergabe prüfen wir mit dem Prüfprotokoll; der Kunde unterschreibt das Abnahmeprotokoll – beides kommt in die Auftragsmappe.', nachfrage: 'Wer darf freigeben, und wo sieht man das?' },
  { kap: ['8.7'], rx: /fehler|nichtkonform|sperr|ausschuss|mangel/i, beispiel: 'Fehlerhafte Teile kommen in die rote Kiste und werden notiert; im Juni hatten wir eine falsche Lieferung, die haben wir zurückgeschickt und im Reklamationsblatt festgehalten.', nachfrage: 'Wie verhindern Sie, dass fehlerhafte Ware versehentlich verbaut wird?' },
  { kap: ['9.1.2'], rx: /kundenzufrieden|zufriedenheit|bewertung.*kund|rückmeldung/i, beispiel: 'Wir bewerten unsere Hauptkunden einmal im Jahr selbst und stützen uns auf Folgeaufträge, Dankes-Mails und Google-Bewertungen – die Auswertung steht in der Managementbewertung.', nachfrage: 'Welche Rückmeldung eines Kunden hat zuletzt etwas verändert?' },
  { kap: ['9.1'], rx: /überwach|messung|analyse|auswert/i, beispiel: 'Reklamationen und Liefertreue werten wir einmal im Jahr aus; die Zahlen stehen in der Managementbewertung.', nachfrage: 'Welche Zahlen schauen Sie sich regelmäßig an?' },
  { kap: ['9.2'], rx: /internes audit|interne audit|auditprogramm|auditbericht/i, beispiel: 'Das interne Audit war im Juni; dabei kam heraus, dass die Prüfmittelliste nicht aktuell war – das steht im Maßnahmenplan und ist erledigt.', nachfrage: 'Wer hat auditiert, und war er unabhängig vom geprüften Bereich?' },
  { kap: ['9.3'], rx: /managementbewertung|management-review/i, beispiel: 'Die Managementbewertung hat die Geschäftsführung im September gemacht; daraus kam die Entscheidung, einen zweiten Transporter anzuschaffen.', nachfrage: 'Welche Entscheidungen sind aus der letzten Managementbewertung entstanden?' },
  { kap: ['10'], rx: /reklamation|beschwerde|korrektur|verbesserung|ursache|maßnahmen/i, beispiel: 'Im Frühjahr hat ein Kunde eine undichte Stelle reklamiert; wir haben nachgebessert, die Ursache besprochen und die Checkliste ergänzt – alles im Reklamationsblatt.', nachfrage: 'Wie prüfen Sie, ob eine Korrekturmaßnahme gewirkt hat?' }
];
const STANDARD = { beispiel: 'Ein echter Fall aus den letzten Monaten: Was war los, wer hat was gemacht, wo ist es festgehalten?', nachfrage: 'Haben Sie dazu ein aktuelles Beispiel? Zeigen Sie mir den letzten Fall.' };

const kapitelListe = (f) => String((f && f.normkapitel) || '').split(/[,;/\s]+/).map(k => k.replace(/[^\d.]/g, '').replace(/\.$/, '')).filter(Boolean);
const passtKap = (eigen, ziel) => eigen.some(k => k === ziel || k.startsWith(ziel + '.') || (ziel.includes('.') && ziel.startsWith(k + '.') && k.includes('.')));

/** Passendes Thema zur Frage (Beispiel + Nachfrage). Text schlägt Normkapitel, beides zusammen am stärksten. */
export function themaZu(f) {
  const text = ((f && f.frage) || '') + ' ' + ((f && f.titel) || '');
  const kap = kapitelListe(f);
  let best = null, bestP = 0;
  THEMEN.forEach((t, i) => {
    const p = (t.rx.test(text) ? 2 : 0) + (t.kap.some(k => passtKap(kap, k)) ? 1.5 : 0) - i * 0.001;
    if (p > bestP) { bestP = p; best = t; }
  });
  return best || STANDARD;
}
export const beispielZu = (f) => themaZu(f).beispiel;

/** Echte Nachfragen von Auditoren (aus der Wissensbasis, anonymisiert) zum Thema der Frage */
export function nachfragenZu(f, max = 2, liste = NACHFRAGEN) {
  const t = themaZu(f); if (!t.rx || !liste.length) return [];
  const passend = liste.filter(n => t.rx.test(n.frage));
  const start = [...String((f && (f.id || f.frage)) || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % (passend.length || 1); // je Frage fest, aber verschieden
  return passend.slice(start).concat(passend.slice(0, start)).slice(0, max).map(n => n.frage);
}
/** Nachhaken ohne KI: echte Nachfrage aus der Praxis, sonst die typische des Themas */
export const nachfrageZu = (f) => nachfragenZu(f, 1)[0] || themaZu(f).nachfrage;

/** Passende Einträge aus Holgers Beratungspraxis (höchstens max). */
export function praxisZu(f, max = 2) {
  const text = (((f && f.frage) || '') + ' ' + ((f && f.titel) || '') + ' ' + ((f && f.hilfe) || '')).toLowerCase();
  const kap = kapitelListe(f);
  return PRAXIS.map(e => {
    let p = passtKap(kap, e.kap) ? 3 : 0;
    e.tags.split(/\s+/).forEach(w => { if (w.length >= 5 && text.includes(w)) p += 1; });
    return { e, p };
  }).filter(x => x.p >= 2).sort((a, b) => b.p - a.p).slice(0, max).map(x => x.e);
}

/** HTML-Kasten „Aus Holgers Beratungspraxis“ (esc = Escape-Funktion der Seite) */
export function praxisHtml(f, esc, max = 2) {
  const p = praxisZu(f, max), n = nachfragenZu(f, 2);
  if (!p.length && !n.length) return '';
  return '<div class="praxis">'
    + (p.length ? '<div class="praxis-kopf">💬 Aus der Beratungspraxis – das fragen andere Betriebe dazu</div>'
      + p.map(e => '<details><summary>' + esc(e.q) + ' <span class="np">' + esc(e.kap) + '</span></summary><div>' + esc(e.a) + '</div></details>').join('') : '')
    + (n.length ? '<div class="praxis-kopf" style="margin-top:6px">🎯 So haken Auditoren in der Praxis nach</div><ul class="praxis-nach">' + n.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '')
    + '</div>';
}
