alter type wasl.notification_type add value if not exists 'meeting';
alter type wasl.notification_type add value if not exists 'honor';

alter table wasl.notifications drop constraint if exists notifications_entity_type_check;
alter table wasl.notifications add constraint notifications_entity_type_check check (entity_type in ('idea','company','category','member','settings','chat','workspace','meeting','task','honor'));

alter table wasl.social_messages drop constraint if exists social_messages_scope_check;
alter table wasl.social_messages add constraint social_messages_scope_check check (scope in ('team','idea','company','category','workspace','meeting'));

alter table wasl.members add column if not exists address_form text not null default 'm' check (address_form in ('m','f'));

create table wasl.member_presence (
  member_id text primary key references wasl.members(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  previous_visit_at timestamptz,
  session_started_at timestamptz,
  welcomed_on date
);

create table wasl.member_activity (
  member_id text not null references wasl.members(id) on delete cascade,
  day date not null,
  active_seconds integer not null default 0 check (active_seconds between 0 and 86400),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (member_id, day)
);

create table wasl.meetings (
  id uuid primary key,
  title text not null check (length(btrim(title)) between 1 and 200),
  starts_at timestamptz not null,
  duration_minutes integer not null default 45 check (duration_minutes between 5 and 600),
  teams_url text check (teams_url is null or teams_url ~ '^https://'),
  notes text not null default '' check (length(notes) <= 20000),
  status text not null default 'scheduled' check (status in ('scheduled','live','ended','cancelled')),
  created_by text not null references wasl.members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reminded_at timestamptz
);
create index meetings_starts_idx on wasl.meetings(starts_at desc);
create index meetings_created_by_idx on wasl.meetings(created_by);

create table wasl.tasks (
  id uuid primary key,
  member_id text not null references wasl.members(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 300),
  due_date date,
  done_at timestamptz,
  idea_id text references wasl.ideas(id) on delete set null,
  meeting_id uuid references wasl.meetings(id) on delete set null,
  source text not null default 'quick' check (source in ('quick','meeting','plan')),
  created_by text not null references wasl.members(id),
  created_at timestamptz not null default now()
);
create index tasks_member_idx on wasl.tasks(member_id, done_at, due_date);
create index tasks_idea_idx on wasl.tasks(idea_id) where idea_id is not null;
create index tasks_meeting_idx on wasl.tasks(meeting_id) where meeting_id is not null;
create index tasks_created_by_idx on wasl.tasks(created_by);
create unique index tasks_one_plan_per_idea_idx on wasl.tasks(member_id, idea_id) where source = 'plan' and done_at is null;

create table wasl.meeting_items (
  id uuid primary key,
  meeting_id uuid not null references wasl.meetings(id) on delete cascade,
  kind text not null check (kind in ('agenda','decision','action')),
  text text not null check (length(btrim(text)) between 1 and 1000),
  idea_id text references wasl.ideas(id) on delete set null,
  assignee_id text references wasl.members(id),
  task_id uuid references wasl.tasks(id) on delete set null,
  done boolean not null default false,
  sort integer not null default 0,
  created_by text not null references wasl.members(id),
  created_at timestamptz not null default now()
);
create index meeting_items_meeting_idx on wasl.meeting_items(meeting_id, kind, sort);
create index meeting_items_idea_idx on wasl.meeting_items(idea_id) where idea_id is not null;
create index meeting_items_assignee_idx on wasl.meeting_items(assignee_id) where assignee_id is not null;
create index meeting_items_task_idx on wasl.meeting_items(task_id) where task_id is not null;
create index meeting_items_created_by_idx on wasl.meeting_items(created_by);

create table wasl.meeting_attendance (
  meeting_id uuid not null references wasl.meetings(id) on delete cascade,
  member_id text not null references wasl.members(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (meeting_id, member_id)
);
create index meeting_attendance_member_idx on wasl.meeting_attendance(member_id);

create table wasl.work_sessions (
  id uuid primary key,
  member_id text not null references wasl.members(id) on delete cascade,
  idea_id text references wasl.ideas(id) on delete set null,
  task_id uuid references wasl.tasks(id) on delete set null,
  label text not null default '' check (length(label) <= 300),
  started_at timestamptz not null,
  ended_at timestamptz,
  seconds integer check (seconds is null or seconds between 0 and 86400),
  check ((ended_at is null) = (seconds is null))
);
create unique index work_sessions_running_idx on wasl.work_sessions(member_id) where ended_at is null;
create index work_sessions_member_idx on wasl.work_sessions(member_id, started_at desc);
create index work_sessions_idea_idx on wasl.work_sessions(idea_id) where idea_id is not null;
create index work_sessions_task_idx on wasl.work_sessions(task_id) where task_id is not null;

create table wasl.honor_awards (
  month text primary key check (month ~ '^\d{4}-\d{2}$'),
  member_id text not null references wasl.members(id),
  score numeric(6,2) not null,
  breakdown jsonb not null default '{}',
  summary text not null default '',
  announced_at timestamptz not null default now()
);
create index honor_awards_member_idx on wasl.honor_awards(member_id);

create table wasl.honor_cheers (
  month text not null references wasl.honor_awards(month) on delete cascade,
  from_id text not null references wasl.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (month, from_id)
);
create index honor_cheers_from_idx on wasl.honor_cheers(from_id);

create table wasl.push_subscriptions (
  id uuid primary key,
  member_id text not null references wasl.members(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  user_agent text not null default '' check (length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failures integer not null default 0
);
create index push_subscriptions_member_idx on wasl.push_subscriptions(member_id);

create table wasl.push_outbox (
  id bigserial primary key,
  notification_id text not null,
  member_id text not null references wasl.members(id) on delete cascade,
  title text not null,
  body text not null,
  url text not null default '/',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  claimed_until timestamptz,
  attempts integer not null default 0
);
create index push_outbox_pending_idx on wasl.push_outbox(created_at) where sent_at is null;
create index push_outbox_member_idx on wasl.push_outbox(member_id);

create function wasl.signal_engagement() returns trigger language plpgsql set search_path=pg_catalog,wasl as $$
declare
  topic text;
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    select realtime_topic into topic from wasl.settings where id;
    if topic is not null then
      begin
        execute 'select realtime.send($1, $2, $3, false)' using jsonb_build_object('table', TG_TABLE_NAME), 'engagement', topic;
      exception when others then
        null;
      end;
    end if;
  end if;
  return null;
end $$;
revoke all on function wasl.signal_engagement() from public, anon, authenticated;
grant execute on function wasl.signal_engagement() to wasl_app;

do $$
declare t text;
begin
  foreach t in array array['member_presence','member_activity','meetings','tasks','meeting_items','meeting_attendance','work_sessions','honor_awards','honor_cheers','push_subscriptions','push_outbox'] loop
    execute format('alter table wasl.%I enable row level security', t);
    execute format('alter table wasl.%I force row level security', t);
    execute format('revoke all on wasl.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on wasl.%I to wasl_app', t);
    execute format('create policy wasl_app_all on wasl.%I for all to wasl_app using (true) with check (true)', t);
  end loop;
  foreach t in array array['meetings','meeting_items','meeting_attendance','tasks','work_sessions','honor_awards','honor_cheers'] loop
    execute format('create trigger wasl_engagement_changed after insert or update or delete on wasl.%I for each statement execute function wasl.signal_engagement()', t);
  end loop;
end $$;
grant usage, select on sequence wasl.push_outbox_id_seq to wasl_app;

create function wasl.queue_push() returns trigger language plpgsql set search_path=pg_catalog,wasl as $$
begin
  if new.type::text not in ('activity','archive','chat') and exists (select 1 from wasl.push_subscriptions s join wasl.members m on m.id = s.member_id where s.member_id = new.recipient_id and m.active) then
    insert into wasl.push_outbox (notification_id, member_id, title, body, url) values (new.id, new.recipient_id, left(new.title, 200), left(new.body, 300), '/');
  end if;
  return null;
end $$;
revoke all on function wasl.queue_push() from public, anon, authenticated;
grant execute on function wasl.queue_push() to wasl_app;
create trigger wasl_queue_push after insert on wasl.notifications for each row execute function wasl.queue_push();

insert into wasl.job_runs (key) values ('honor:' || to_char(date_trunc('month', now() at time zone 'Asia/Riyadh') - interval '1 day', 'YYYY-MM')) on conflict (key) do nothing;
