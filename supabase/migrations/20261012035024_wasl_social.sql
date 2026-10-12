alter type wasl.notification_type add value if not exists 'activity';
alter type wasl.notification_type add value if not exists 'achievement';
alter type wasl.notification_type add value if not exists 'chat';
alter type wasl.notification_type add value if not exists 'mention';

alter table wasl.notifications
  add column actor_id text references wasl.members(id),
  add column actor_name text,
  add column entity_type text check (entity_type in ('idea','company','category','member','settings','chat','workspace')),
  add column entity_id text,
  add column action text;
create index notifications_actor_idx on wasl.notifications(actor_id) where actor_id is not null;

alter table wasl.ideas
  add column deleted_at timestamptz,
  add column deleted_by text references wasl.members(id),
  add column deletion_reason text not null default '';
create index ideas_deleted_by_idx on wasl.ideas(deleted_by) where deleted_by is not null;
create index ideas_live_created_idx on wasl.ideas(created_at desc,id) where deleted_at is null;
alter table wasl.idea_events drop constraint idea_events_action_check;
alter table wasl.idea_events add constraint idea_events_action_check check (action in ('created','edited','submitted','withdrawn','changes_requested','approved','rejected','cancelled','reopened','reassigned','scheduled','design_started','design_review','delivered','archived','attachments_added','attachment_removed','quotation_added','quotation_removed','comment','deleted','restored'));

create table wasl.social_voices (
  id uuid primary key,
  owner_id text not null references wasl.members(id),
  mime text not null check (mime in ('audio/webm','audio/ogg','audio/mp4')),
  size integer not null check (size between 1 and 1048576),
  duration_seconds numeric(8,3) not null check (duration_seconds > 0 and duration_seconds <= 120),
  storage text not null check (storage in ('local','supabase')),
  storage_key text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  linked_at timestamptz,
  removed_at timestamptz
);
create index social_voices_owner_idx on wasl.social_voices(owner_id);
create index social_voices_unlinked_idx on wasl.social_voices(created_at) where linked_at is null and removed_at is null;

create table wasl.social_messages (
  id uuid primary key,
  scope text not null check (scope in ('team','idea','company','category','workspace')),
  scope_id text not null check (length(scope_id) between 1 and 100),
  author_id text not null references wasl.members(id),
  body text not null default '' check (length(body) <= 4000),
  mention_ids text[] not null default '{}' check (cardinality(mention_ids) <= 30),
  parent_id uuid references wasl.social_messages(id),
  voice_id uuid unique references wasl.social_voices(id),
  created_at timestamptz not null default now(),
  pinned_at timestamptz,
  pinned_by text references wasl.members(id),
  deleted_at timestamptz,
  deleted_by text references wasl.members(id),
  constraint social_messages_nonempty check (length(btrim(body)) > 0 or voice_id is not null)
);
create index social_messages_context_page_idx on wasl.social_messages(scope,scope_id,created_at desc,id desc) where parent_id is null;
create index social_messages_thread_page_idx on wasl.social_messages(parent_id,created_at desc,id desc) where parent_id is not null;
create index social_messages_author_idx on wasl.social_messages(author_id);
create index social_messages_pin_idx on wasl.social_messages(scope,scope_id,pinned_at desc) where pinned_at is not null and deleted_at is null;
create index social_messages_pinned_by_idx on wasl.social_messages(pinned_by) where pinned_by is not null;
create index social_messages_deleted_by_idx on wasl.social_messages(deleted_by) where deleted_by is not null;

create table wasl.social_reactions (
  message_id uuid not null references wasl.social_messages(id) on delete cascade,
  member_id text not null references wasl.members(id),
  emoji text not null check (emoji in ('👍','❤️','🎉','👏','🔥','✅','💡','😊','🙏','👀')),
  created_at timestamptz not null default now(),
  primary key (message_id,member_id,emoji)
);
create index social_reactions_member_idx on wasl.social_reactions(member_id);

create table wasl.social_rate_limits (
  member_id text not null references wasl.members(id) on delete cascade,
  kind text not null,
  started_at timestamptz not null default now(),
  used integer not null default 1,
  primary key(member_id,kind)
);
create table wasl.operation_receipts (
  request_id uuid primary key,
  actor_id text not null references wasl.members(id),
  request_hash text not null,
  result jsonb,
  created_at timestamptz not null default now()
);
create index operation_receipts_actor_idx on wasl.operation_receipts(actor_id);
create index operation_receipts_created_idx on wasl.operation_receipts(created_at);

create table wasl.change_cursor (
  id boolean primary key default true check (id),
  version bigint not null default 0,
  last_changed_at timestamptz not null default now()
);
insert into wasl.change_cursor(id) values(true);
create function wasl.bump_change_cursor() returns trigger language plpgsql set search_path=pg_catalog,wasl as $$
begin
  update wasl.change_cursor set version=version+1,last_changed_at=clock_timestamp() where id=true;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['social_voices','social_messages','social_reactions','social_rate_limits','operation_receipts','change_cursor'] loop
    execute format('alter table wasl.%I enable row level security',t);
    execute format('alter table wasl.%I force row level security',t);
    execute format('revoke all on wasl.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on wasl.%I to wasl_app',t);
    execute format('create policy wasl_app_all on wasl.%I for all to wasl_app using(true) with check(true)',t);
  end loop;
  foreach t in array array['members','accounts','companies','categories','ideas','idea_events','attachments','quotations','notifications','settings','google_integration','social_messages','social_reactions'] loop
    execute format('create trigger wasl_changed after insert or update or delete on wasl.%I for each statement execute function wasl.bump_change_cursor()',t);
  end loop;
end $$;
revoke all on function wasl.bump_change_cursor() from public,anon,authenticated;
grant execute on function wasl.bump_change_cursor() to wasl_app;
