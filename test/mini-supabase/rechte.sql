grant anon, authenticated, service_role to authenticator;
alter role service_role bypassrls;
grant usage on schema public, extensions, auth to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
