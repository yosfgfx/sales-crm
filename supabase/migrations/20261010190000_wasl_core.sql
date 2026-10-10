create schema if not exists wasl;
revoke all on schema wasl from public, anon, authenticated;

create type wasl.member_role as enum ('superadmin', 'admin', 'content', 'manager', 'designer');
create type wasl.work_type as enum ('motion', 'video', 'design', 'report', 'presentation', 'document');
create type wasl.priority as enum ('urgent', 'high', 'normal', 'low');
create type wasl.idea_status as enum ('draft', 'quotations', 'review', 'changes', 'approved', 'scheduled', 'designing', 'design_review', 'delivered', 'cancelled', 'rejected');
create type wasl.channel as enum ('screens', 'whatsapp', 'email');
create type wasl.attachment_kind as enum ('brief', 'quotation', 'final', 'logo');
create type wasl.attachment_storage as enum ('drive', 'local', 'external');
create type wasl.notification_type as enum ('approval', 'feedback', 'assignment', 'quotation', 'delivery', 'comment', 'archive', 'reminder');
create type wasl.archive_status as enum ('not_started', 'pending', 'running', 'done', 'failed', 'needs_review');

create table wasl.members (
  id text primary key,
  name text not null check (length(name) between 1 and 200),
  title text not null default '' check (length(title) <= 200),
  role wasl.member_role not null,
  initials text not null default '',
  color text not null default '#8298AD',
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index members_single_superadmin on wasl.members (role) where role = 'superadmin';

create table wasl.accounts (
  member_id text primary key references wasl.members (id) on delete cascade,
  username text not null check (username = lower(username) and username ~ '^[a-z0-9][a-z0-9_.-]{1,63}$'),
  password_hash text not null check (password_hash ~ '^scrypt:[a-f0-9]{32,128}:[a-f0-9]{128}$'),
  auth_version integer not null default 1 check (auth_version >= 1),
  totp_secret_enc text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index accounts_username_key on wasl.accounts (username);

create table wasl.companies (
  id text primary key,
  name text not null check (length(name) between 1 and 200),
  short_name text not null,
  initials text not null default '',
  color text not null default '#749590',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index companies_name_key on wasl.companies (name);

create table wasl.categories (
  id text primary key,
  name text not null check (length(name) between 1 and 200),
  color text not null default '#9A81B9',
  target_per_month integer not null default 4 check (target_per_month between 0 and 1000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index categories_name_key on wasl.categories (name);

create table wasl.ideas (
  id text primary key,
  code text not null,
  title text not null check (length(title) between 1 and 300),
  company_id text not null references wasl.companies (id),
  department text not null default '',
  category_id text not null references wasl.categories (id),
  work_type wasl.work_type not null,
  description text not null default '' check (length(description) <= 20000),
  content text not null default '' check (length(content) <= 20000),
  execution_plan text not null default '' check (length(execution_plan) <= 20000),
  channels wasl.channel[] not null check (cardinality(channels) between 1 and 3),
  owner_id text not null references wasl.members (id),
  designer_id text references wasl.members (id),
  requested_at date not null,
  due_date date not null,
  scheduled_at date,
  approved_at timestamptz,
  approved_by text references wasl.members (id),
  delivered_at date,
  priority wasl.priority not null default 'normal',
  status wasl.idea_status not null default 'draft',
  needs_quotes boolean not null default false,
  manager_feedback text not null default '' check (length(manager_feedback) <= 20000),
  source_proposal jsonb,
  is_demo boolean not null default false,
  drive_folder_id text,
  archive_status wasl.archive_status not null default 'not_started',
  archived_at timestamptz,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ideas_due_after_request check (due_date >= requested_at),
  constraint ideas_due_after_schedule check (scheduled_at is null or due_date >= scheduled_at)
);
create unique index ideas_code_key on wasl.ideas (code);
create index ideas_status_due_idx on wasl.ideas (status, due_date);
create index ideas_owner_idx on wasl.ideas (owner_id);
create index ideas_designer_idx on wasl.ideas (designer_id) where designer_id is not null;
create index ideas_company_idx on wasl.ideas (company_id);
create index ideas_category_idx on wasl.ideas (category_id);
create index ideas_approved_by_idx on wasl.ideas (approved_by) where approved_by is not null;
create index ideas_archive_pending_idx on wasl.ideas (archive_status) where archive_status in ('pending', 'running', 'failed');

create table wasl.idea_events (
  id text primary key,
  idea_id text not null references wasl.ideas (id) on delete cascade,
  at timestamptz not null default now(),
  actor_id text not null references wasl.members (id),
  action text not null check (action in ('created', 'edited', 'submitted', 'withdrawn', 'changes_requested', 'approved', 'rejected', 'cancelled', 'reopened', 'reassigned', 'scheduled', 'design_started', 'design_review', 'delivered', 'archived', 'attachments_added', 'attachment_removed', 'quotation_added', 'quotation_removed', 'comment')),
  note text not null default '' check (length(note) <= 20000),
  from_status wasl.idea_status,
  to_status wasl.idea_status
);
create index idea_events_idea_at_idx on wasl.idea_events (idea_id, at);
create index idea_events_actor_idx on wasl.idea_events (actor_id);

create table wasl.attachments (
  id text primary key,
  idea_id text references wasl.ideas (id) on delete cascade,
  kind wasl.attachment_kind not null,
  channel wasl.channel,
  name text not null check (length(name) between 1 and 255),
  size bigint not null check (size >= 0),
  mime text not null default 'application/octet-stream',
  storage wasl.attachment_storage not null,
  drive_file_id text,
  local_path text,
  external_url text,
  inline_mime text,
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  owner_id text not null references wasl.members (id),
  created_at timestamptz not null default now(),
  linked_at timestamptz,
  removed_at timestamptz,
  constraint attachments_final_channel check ((kind = 'final') = (channel is not null)),
  constraint attachments_storage_ref check (
    (storage = 'drive' and drive_file_id is not null) or
    (storage = 'local' and local_path is not null) or
    (storage = 'external' and external_url is not null)
  )
);
create index attachments_idea_idx on wasl.attachments (idea_id) where removed_at is null;
create index attachments_owner_idx on wasl.attachments (owner_id);
create index attachments_orphan_idx on wasl.attachments (created_at) where idea_id is null or removed_at is not null;

create table wasl.quotations (
  id text primary key,
  idea_id text not null references wasl.ideas (id) on delete cascade,
  vendor text not null check (length(vendor) between 1 and 300),
  amount numeric(14, 2) not null check (amount > 0),
  scope text not null check (length(scope) between 1 and 4000),
  days integer not null check (days between 1 and 3650),
  attachment_id text references wasl.attachments (id),
  recommended boolean not null default false,
  created_at timestamptz not null default now()
);
create index quotations_idea_idx on wasl.quotations (idea_id);
create index quotations_attachment_idx on wasl.quotations (attachment_id) where attachment_id is not null;
create unique index quotations_one_recommended on wasl.quotations (idea_id) where recommended;

create table wasl.notifications (
  id text primary key,
  recipient_id text not null references wasl.members (id) on delete cascade,
  idea_id text references wasl.ideas (id) on delete cascade,
  type wasl.notification_type not null,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  emailed_at timestamptz
);
create index notifications_recipient_created_idx on wasl.notifications (recipient_id, created_at desc);
create index notifications_recipient_unread_idx on wasl.notifications (recipient_id) where read_at is null;
create index notifications_idea_idx on wasl.notifications (idea_id) where idea_id is not null;
create index notifications_email_pending_idx on wasl.notifications (created_at) where emailed_at is null;

create table wasl.settings (
  id boolean primary key default true check (id),
  department_name text not null,
  organization_name text not null default '',
  logo_attachment_id text references wasl.attachments (id),
  updated_at timestamptz not null default now()
);

create table wasl.google_integration (
  id boolean primary key default true check (id),
  account_email text not null,
  refresh_token_enc text not null,
  scopes text not null,
  root_folder_id text,
  root_folder_name text,
  connected_by text not null references wasl.members (id),
  connected_at timestamptz not null default now(),
  root_selected_by text references wasl.members (id),
  root_selected_at timestamptz,
  last_check_at timestamptz,
  last_check_ok boolean
);

create table wasl.drive_folders (
  key text primary key,
  root_folder_id text not null,
  folder_id text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table wasl.archive_jobs (
  id text primary key,
  idea_id text not null references wasl.ideas (id) on delete cascade,
  kind text not null check (kind in ('deliver', 'summary', 'repair')),
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed', 'needs_review')),
  attempts integer not null default 0,
  next_run_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index archive_jobs_due_idx on wasl.archive_jobs (next_run_at) where status in ('pending', 'failed');
create index archive_jobs_idea_idx on wasl.archive_jobs (idea_id);

create table wasl.login_attempts (
  key text primary key,
  failures integer not null default 0,
  window_started_at timestamptz not null default now(),
  delay_until timestamptz
);

create table wasl.code_counters (
  year integer primary key,
  last_value integer not null default 0
);

do $$
declare t text;
begin
  foreach t in array array['members', 'accounts', 'companies', 'categories', 'ideas', 'idea_events', 'attachments', 'quotations', 'notifications', 'settings', 'google_integration', 'drive_folders', 'archive_jobs', 'login_attempts', 'code_counters'] loop
    execute format('alter table wasl.%I enable row level security', t);
    execute format('alter table wasl.%I force row level security', t);
    execute format('revoke all on wasl.%I from public, anon, authenticated', t);
  end loop;
end $$;

create role wasl_app nologin;
grant usage on schema wasl to wasl_app;
grant select, insert, update, delete on all tables in schema wasl to wasl_app;
alter default privileges in schema wasl grant select, insert, update, delete on tables to wasl_app;

do $$
declare t text;
begin
  foreach t in array array['members', 'accounts', 'companies', 'categories', 'ideas', 'idea_events', 'attachments', 'quotations', 'notifications', 'settings', 'google_integration', 'drive_folders', 'archive_jobs', 'login_attempts', 'code_counters'] loop
    execute format('create policy wasl_app_all on wasl.%I for all to wasl_app using (true) with check (true)', t);
  end loop;
end $$;
