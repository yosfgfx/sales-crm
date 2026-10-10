create table wasl.upload_sessions (
  id text primary key,
  idea_id text not null references wasl.ideas (id) on delete cascade,
  kind wasl.attachment_kind not null,
  channel wasl.channel,
  name text not null check (length(name) between 1 and 255),
  size bigint not null check (size > 0),
  mime text not null,
  owner_id text not null references wasl.members (id),
  session_uri_enc text not null,
  received bigint not null default 0,
  inline_mime text,
  status text not null default 'open' check (status in ('open', 'done', 'failed')),
  attachment_id text references wasl.attachments (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 days'
);
create index upload_sessions_idea_idx on wasl.upload_sessions (idea_id);
create index upload_sessions_owner_idx on wasl.upload_sessions (owner_id);
create index upload_sessions_attachment_idx on wasl.upload_sessions (attachment_id) where attachment_id is not null;
create index upload_sessions_open_idx on wasl.upload_sessions (expires_at) where status = 'open';
alter table wasl.upload_sessions enable row level security;
alter table wasl.upload_sessions force row level security;
revoke all on wasl.upload_sessions from public, anon, authenticated;
grant select, insert, update, delete on wasl.upload_sessions to wasl_app;
create policy wasl_app_all on wasl.upload_sessions for all to wasl_app using (true) with check (true);

alter table wasl.attachments add column drive_parent_id text;
alter table wasl.archive_jobs add column notified_failure boolean not null default false;
