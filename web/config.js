// Verbindung zu Supabase. Nur die öffentliche Projekt-URL und der anon-Schlüssel – NIE den service_role-Schlüssel.
// Leer = Demo-Modus (erfundene Daten, nichts wird gespeichert).
// Testfassung ohne Server: scripts/paket_bauen.mjs schreibt hier { paket: "paket.json" } hinein.
window.AV_CONFIG = {
  supabaseUrl: '',   // z. B. https://abcd1234.supabase.co
  anonKey: '',       // Project Settings → API → anon public
  ki: false          // true = KI-Coach und KI-Fotoprüfung (Edge Function "ki", Geheimnis ANTHROPIC_API_KEY)
};
