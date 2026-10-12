alter table wasl.settings add column api_access text not null default 'admins' check (api_access in ('admins', 'everyone'));

create table wasl.oauth_clients (
  client_id text primary key,
  client_name text not null check (length(client_name) between 1 and 120),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table wasl.api_keys (
  id text primary key,
  member_id text not null references wasl.members (id) on delete cascade,
  kind text not null check (kind in ('key', 'oauth')),
  name text not null check (length(name) between 1 and 120),
  prefix text not null,
  token_hash text not null unique,
  refresh_hash text unique,
  client_id text references wasl.oauth_clients (client_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  last_used_at timestamptz,
  last_used_ip text,
  revoked_at timestamptz
);
create index api_keys_member_idx on wasl.api_keys (member_id) where revoked_at is null;

create table wasl.oauth_codes (
  code_hash text primary key,
  client_id text not null references wasl.oauth_clients (client_id) on delete cascade,
  member_id text not null references wasl.members (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  resource text,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table wasl.api_audit (
  id bigserial primary key,
  key_id text,
  member_id text references wasl.members (id) on delete set null,
  channel text not null check (channel in ('api', 'mcp', 'oauth')),
  action text not null check (length(action) <= 200),
  target text check (length(target) <= 200),
  status integer,
  at timestamptz not null default now()
);
create index api_audit_key_at_idx on wasl.api_audit (key_id, at desc);

do $$
declare t text;
begin
  foreach t in array array['oauth_clients', 'api_keys', 'oauth_codes', 'api_audit'] loop
    execute format('alter table wasl.%I enable row level security', t);
    execute format('alter table wasl.%I force row level security', t);
    execute format('revoke all on wasl.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on wasl.%I to wasl_app', t);
    execute format('create policy wasl_app_all on wasl.%I for all to wasl_app using (true) with check (true)', t);
  end loop;
end $$;
grant usage on sequence wasl.api_audit_id_seq to wasl_app;
