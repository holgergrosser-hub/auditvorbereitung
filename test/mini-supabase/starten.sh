#!/bin/bash
# Startet Datenbank (alle Migrationen), PostgREST, Edge Function "kunde" und den Mini-Supabase-Server.
# Braucht: postgresql, postgrest (PGRST), deno (DENO). Aufruf: PGRST=… DENO=… bash test/mini-supabase/starten.sh > /tmp/mini-start.log
set -e
cd "$(dirname "$0")/../.."
: "${PGRST:?Pfad zu postgrest}"; : "${DENO:?Pfad zu deno}"
SECRET='testgeheimnis-mindestens-32-zeichen-lang!!'
# alte Prozesse beenden (nicht mit pkill -f: das traefe auch diese Shell)
for p in $(pgrep -x postgrest) $(pgrep -x deno) $(ps -eo pid,args | awk '$2=="node" && ($3 ~ /server.mjs/ || $3 ~ /deno/) {print $1}'); do kill $p 2>/dev/null || true; done; sleep 1
TMP=$(mktemp -d); chmod 755 "$TMP"; cp test/mini-supabase/*.sql supabase/migrations/*.sql "$TMP"/; chmod -R a+r "$TMP"
service postgresql start >/dev/null 2>&1 || true; sleep 1
su postgres -c "dropdb --if-exists --force avtest; createdb avtest"
su postgres -c "psql -q -d avtest -f $TMP/stub.sql" 2>&1 | grep -v NOTICE || true
for f in "$TMP"/2026*.sql; do su postgres -c "psql -q -v ON_ERROR_STOP=1 -d avtest -f $f" 2>&1 | grep -v NOTICE || true; done
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d avtest -f $TMP/rechte.sql"
su postgres -c "psql -q -d avtest -c \"alter role authenticator password 'auth'; insert into backoffice_nutzer(email,name) values('test@example.com','Test') on conflict do nothing;\""
cat > "$TMP/pgrst.conf" <<CONF
db-uri = "postgres://authenticator:auth@127.0.0.1:5432/avtest"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-port = 3001
CONF
setsid nohup "$PGRST" "$TMP/pgrst.conf" > /tmp/mini-pgrst.log 2>&1 < /dev/null &
FN=$TMP/fn; mkdir -p $FN; cp -r supabase/functions $FN/; echo '{"nodeModulesDir":"auto"}' > $FN/deno.json
SERVICE=$(node -e "
const c=require('crypto');const b=x=>Buffer.from(x).toString('base64url');const k=b(JSON.stringify({alg:'HS256',typ:'JWT'})),p=b(JSON.stringify({role:'service_role',exp:Math.floor(Date.now()/1000)+86400}));
console.log(k+'.'+p+'.'+c.createHmac('sha256',process.argv[1]).update(k+'.'+p).digest('base64url'))" "$SECRET")
(cd $FN && SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=$SERVICE setsid nohup "$DENO" run -A functions/kunde/index.ts > /tmp/mini-deno.log 2>&1 < /dev/null &)
# Edge Function "ki" auf Port 8002 (Deno.serve wird umgelenkt), KI-Antworten vom Ersatz im Mini-Server
cat > $FN/ki8002.ts <<'TS'
const orig = Deno.serve; // @ts-ignore Testumlenkung
Deno.serve = (h: any) => orig({ port: 8002 }, h);
await import('./functions/ki/index.ts');
TS
(cd $FN && SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=$SERVICE ANTHROPIC_API_KEY=test KI_API_URL=http://localhost:54321/fake-anthropic GOOGLE_TTS_KEY=test TTS_API_URL=http://localhost:54321/fake-tts setsid nohup "$DENO" run -A ki8002.ts > /tmp/mini-ki.log 2>&1 < /dev/null &)
JWT_SECRET=$SECRET SPEICHER=$TMP/speicher setsid nohup node test/mini-supabase/server.mjs > /tmp/mini-server.log 2>&1 < /dev/null &
sleep 8; echo "Bereit: http://localhost:54321  (Logs /tmp/mini-*.log)"
