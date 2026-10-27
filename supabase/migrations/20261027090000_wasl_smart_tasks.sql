alter type wasl.notification_type add value if not exists 'task';

alter table wasl.tasks
  add column if not exists description text not null default '' check (length(description) <= 4000),
  add column if not exists status text not null default 'todo' check (status in ('todo','doing','done')),
  add column if not exists priority text not null default 'normal' check (priority in ('urgent','high','normal','low')),
  add column if not exists kind text not null default 'other' check (kind in ('content','design','review','coordination','meeting','personal','other')),
  add column if not exists sequence integer check (sequence is null or sequence between 1 and 500),
  add column if not exists last_update text not null default '' check (length(last_update) <= 1000),
  add column if not exists ai jsonb not null default '{}',
  add column if not exists fields jsonb not null default '{}',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists reminded_on date;
update wasl.tasks set status = 'done' where done_at is not null and status <> 'done';
alter table wasl.tasks add constraint tasks_status_done check ((status = 'done') = (done_at is not null));
create index tasks_open_idx on wasl.tasks(due_date, priority) where done_at is null;
create index tasks_created_by_open_idx on wasl.tasks(created_by) where done_at is null;

create table wasl.task_updates (
  id uuid primary key,
  task_id uuid not null references wasl.tasks(id) on delete cascade,
  actor_id text not null references wasl.members(id),
  kind text not null check (kind in ('created','status','assigned','due','note','ai','priority','linked','title','deleted')),
  body text not null default '' check (length(body) <= 2000),
  at timestamptz not null default now()
);
create index task_updates_task_idx on wasl.task_updates(task_id, at desc);
create index task_updates_recent_idx on wasl.task_updates(at desc);
create index task_updates_actor_idx on wasl.task_updates(actor_id);

create table wasl.ai_usage (
  id bigserial primary key,
  at timestamptz not null default now(),
  member_id text references wasl.members(id) on delete set null,
  purpose text not null check (length(purpose) <= 60),
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cost_usd numeric(10,5) not null default 0,
  ok boolean not null default true,
  error text
);
create index ai_usage_at_idx on wasl.ai_usage(at desc);
create index ai_usage_member_idx on wasl.ai_usage(member_id) where member_id is not null;

alter table wasl.settings
  add column if not exists ai_enabled boolean not null default true,
  add column if not exists ai_budget_usd numeric(8,2) not null default 80 check (ai_budget_usd between 0 and 10000);

do $$
declare t text;
begin
  foreach t in array array['task_updates','ai_usage'] loop
    execute format('alter table wasl.%I enable row level security', t);
    execute format('alter table wasl.%I force row level security', t);
    execute format('revoke all on wasl.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on wasl.%I to wasl_app', t);
    execute format('create policy wasl_app_all on wasl.%I for all to wasl_app using (true) with check (true)', t);
  end loop;
end $$;
grant usage, select on sequence wasl.ai_usage_id_seq to wasl_app;
create trigger wasl_engagement_changed after insert or update or delete on wasl.task_updates for each statement execute function wasl.signal_engagement();
