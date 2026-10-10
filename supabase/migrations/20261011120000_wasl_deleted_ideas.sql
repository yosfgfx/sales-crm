create table wasl.deleted_ideas (
  id text primary key,
  code text not null,
  title text not null,
  deleted_by text not null references wasl.members (id),
  deleted_at timestamptz not null default now(),
  reason text not null default '',
  snapshot jsonb not null
);
create index deleted_ideas_deleted_by_idx on wasl.deleted_ideas (deleted_by);
alter table wasl.deleted_ideas enable row level security;
alter table wasl.deleted_ideas force row level security;
revoke all on wasl.deleted_ideas from public, anon, authenticated;
grant select, insert, update, delete on wasl.deleted_ideas to wasl_app;
create policy wasl_app_all on wasl.deleted_ideas for all to wasl_app using (true) with check (true);
