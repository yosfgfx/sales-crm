alter table wasl.members add column email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

create table wasl.reminders (
  idea_id text not null references wasl.ideas (id) on delete cascade,
  kind text not null check (kind in ('due_soon', 'overdue')),
  sent_on date not null,
  primary key (idea_id, kind, sent_on)
);

create table wasl.job_runs (
  key text primary key,
  started_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['reminders', 'job_runs'] loop
    execute format('alter table wasl.%I enable row level security', t);
    execute format('alter table wasl.%I force row level security', t);
    execute format('revoke all on wasl.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on wasl.%I to wasl_app', t);
    execute format('create policy wasl_app_all on wasl.%I for all to wasl_app using (true) with check (true)', t);
  end loop;
end $$;
