/**
 * Mini-Supabase fuer Tests ohne Internet (Lektion A14): leitet weiter wie die echte Plattform.
 *   /rest/v1/*       → PostgREST (Port 3001) auf der lokalen Datenbank mit allen Migrationen
 *   /auth/v1/*       → Anmeldung mit E-Mail/Passwort (jedes Passwort gilt), gibt ein JWT aus
 *   /storage/v1/*    → Dateien im Ordner TMP/speicher (hochladen, signierte Links, loeschen)
 *   /functions/v1/kunde → Edge Function "kunde" (Deno, Port 8000)
 *   sonst            → Dateien aus web/ (config.js zeigt auf diesen Server)
 * Aufruf: node test/mini-supabase/server.mjs   (Umgebung: JWT_SECRET, PORT=54321, SPEICHER)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 54321), SECRET = process.env.JWT_SECRET || 'testgeheimnis-mindestens-32-zeichen-lang!!';
const WEB = path.resolve(new URL('../../web/', import.meta.url).pathname), SPEICHER = process.env.SPEICHER || '/tmp/mini-speicher';
const ANON = jwt({ role: 'anon' }), SERVICE = jwt({ role: 'service_role' });
fs.mkdirSync(SPEICHER, { recursive: true });
function b64(x) { return Buffer.from(x).toString('base64url'); }
function jwt(claims) { const k = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), p = b64(JSON.stringify(Object.assign({ exp: Math.floor(Date.now() / 1000) + 86400 }, claims))); return k + '.' + p + '.' + crypto.createHmac('sha256', SECRET).update(k + '.' + p).digest('base64url'); }
function lies(token) { try { const [k, p, s] = token.split('.'); if (crypto.createHmac('sha256', SECRET).update(k + '.' + p).digest('base64url') !== s) return null; return JSON.parse(Buffer.from(p, 'base64url')); } catch (e) { return null; } }
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-expose-headers': 'content-range, content-profile' };
const body = (req) => new Promise(r => { const t = []; req.on('data', c => t.push(c)); req.on('end', () => r(Buffer.concat(t))); });
const json = (res, code, o) => { res.writeHead(code, Object.assign({ 'content-type': 'application/json' }, CORS)); res.end(JSON.stringify(o)); };
function weiter(req, res, ziel, inhalt) {
  const u = new URL(ziel); const h = Object.assign({}, req.headers); delete h.host; h['content-length'] = inhalt.length;
  const p = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: req.method, headers: h }, (r) => { const hh = Object.assign({}, r.headers, CORS); res.writeHead(r.statusCode, hh); r.pipe(res); });
  p.on('error', (e) => json(res, 502, { message: 'Weiterleitung: ' + e.message })); p.end(inhalt);
}
function multipartDatei(buf, ct) { // erster Teil mit Datei-Inhalt
  const m = /boundary=(.+)$/.exec(ct || ''); if (!m) return buf;
  const grenze = Buffer.from('--' + m[1]); let pos = 0; const teile = [];
  while ((pos = buf.indexOf(grenze, pos)) >= 0) { const start = pos + grenze.length + 2; const naechste = buf.indexOf(grenze, start); if (naechste < 0) break; teile.push(buf.slice(start, naechste - 2)); pos = naechste; }
  for (const t of teile) { const kopfEnde = t.indexOf('\r\n\r\n'); const kopf = t.slice(0, kopfEnde).toString(); if (/content-type/i.test(kopf) || /filename=/i.test(kopf) || /name=""/.test(kopf)) return t.slice(kopfEnde + 4); }
  return buf;
}
const sicher = (p) => { const z = path.resolve(SPEICHER, p); if (!z.startsWith(SPEICHER)) throw new Error('Pfad'); return z; };
const TYP = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.pdf': 'application/pdf', '.zip': 'application/zip', '.png': 'image/png' };

http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    const inhalt = await body(req);
    if (u.pathname.startsWith('/rest/v1/')) return weiter(req, res, 'http://127.0.0.1:3001' + u.pathname.slice(8) + u.search, inhalt);
    if (u.pathname.startsWith('/functions/v1/kunde')) return weiter(req, res, 'http://127.0.0.1:8000/' + u.search, inhalt);
    if (u.pathname === '/auth/v1/token') {
      const d = JSON.parse(inhalt.toString() || '{}'); const mail = d.email || 'x@y.de'; const id = crypto.createHash('md5').update(mail).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*/, '$1-$2-$3-$4-$5');
      const user = { id, email: mail, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
      return json(res, 200, { access_token: jwt({ role: 'authenticated', email: mail, sub: id, aud: 'authenticated' }), token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user });
    }
    if (u.pathname === '/auth/v1/user') { const c = lies((req.headers.authorization || '').replace(/^Bearer /, '')); return c && c.email ? json(res, 200, { id: c.sub, email: c.email, aud: 'authenticated', role: 'authenticated' }) : json(res, 401, { message: 'kein Nutzer' }); }
    if (u.pathname === '/auth/v1/logout') { res.writeHead(204, CORS); return res.end(); }
    if (u.pathname.startsWith('/storage/v1/object/sign/')) {
      const rest = decodeURIComponent(u.pathname.slice('/storage/v1/object/sign/'.length));
      if (req.method === 'POST') return json(res, 200, { signedURL: '/object/sign/' + rest + '?token=' + jwt({ url: rest }) });
      const c = lies(u.searchParams.get('token') || ''); if (!c || c.url !== rest) return json(res, 400, { message: 'Link ungültig' });
      const f = sicher(rest); if (!fs.existsSync(f)) return json(res, 404, { message: 'fehlt' });
      res.writeHead(200, Object.assign({ 'content-type': TYP[path.extname(f)] || 'application/octet-stream' }, CORS)); return fs.createReadStream(f).pipe(res);
    }
    if (u.pathname.startsWith('/storage/v1/object/')) {
      const rest = decodeURIComponent(u.pathname.slice('/storage/v1/object/'.length));
      const c = lies((req.headers.authorization || '').replace(/^Bearer /, ''));
      if (!c || (c.role !== 'service_role' && !c.email)) return json(res, 403, { message: 'nicht angemeldet' });
      if (req.method === 'DELETE') { const d = JSON.parse(inhalt.toString() || '{}'); (d.prefixes || []).forEach(p => { try { fs.unlinkSync(sicher(rest + '/' + p)); } catch (e) { /* */ } }); return json(res, 200, []); }
      const f = sicher(rest); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, multipartDatei(inhalt, req.headers['content-type']));
      return json(res, 200, { Key: rest, Id: crypto.randomUUID() });
    }
    // statische Seiten
    if (u.pathname === '/config.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end('window.AV_CONFIG = { supabaseUrl: "http://localhost:' + PORT + '", anonKey: "' + ANON + '", ki: false };'); }
    let f = path.join(WEB, decodeURIComponent(u.pathname)); if (!f.startsWith(WEB)) return json(res, 403, {});
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) return json(res, 404, { message: 'nicht gefunden' });
    res.writeHead(200, { 'content-type': TYP[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  } catch (e) { json(res, 500, { message: String(e.message || e) }); }
}).listen(PORT, () => console.log('Mini-Supabase auf http://localhost:' + PORT + '\nANON=' + ANON + '\nSERVICE=' + SERVICE));
