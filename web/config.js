// Verbindung zu Supabase. Nur die öffentliche Projekt-URL und der öffentliche (publishable) Schlüssel – NIE den service_role-Schlüssel.
// Leer = Demo-Modus (erfundene Daten, nichts wird gespeichert).
// Testfassung ohne Server: scripts/paket_bauen.mjs schreibt hier { paket: "paket.json" } hinein.
window.AV_CONFIG = {
  supabaseUrl: 'https://xpqcivhywtwfhkevybvd.supabase.co',   // Projekt "auditvorbereitung" (Frankfurt)
  // öffentlicher anon-Schlüssel (darf im Browser stehen, RLS schützt die Daten). Alternative: sb_publishable_idlPLt3Xkrm8GjVx8QB1hA_Istd-ZCP
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwcWNpdmh5d3R3ZmhrZXZ5YnZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1ODMwNDksImV4cCI6MjEwNzE1OTA0OX0.TWh736tfmu6pMJkdkpAaG99XmqLfjkyGlTfSsK0JxRI',
  ki: true           // Geheimnis ANTHROPIC_API_KEY ist in Supabase gesetzt (Edge Function "ki")
};
