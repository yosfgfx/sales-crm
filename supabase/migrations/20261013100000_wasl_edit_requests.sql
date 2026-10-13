create table wasl.idea_edit_requests (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  idea_id text not null references wasl.ideas(id) on delete cascade,
  requester_id text not null references wasl.members(id),
  note text not null check (length(btrim(note)) between 3 and 4000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_by text references wasl.members(id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 4000),
  constraint idea_edit_requests_decision check ((status = 'pending') = (decided_at is null))
);
create index idea_edit_requests_idea_idx on wasl.idea_edit_requests(idea_id, created_at);
create index idea_edit_requests_requester_idx on wasl.idea_edit_requests(requester_id);
create index idea_edit_requests_decided_by_idx on wasl.idea_edit_requests(decided_by) where decided_by is not null;
create unique index idea_edit_requests_one_pending_idx on wasl.idea_edit_requests(idea_id, requester_id) where status = 'pending';

alter table wasl.idea_edit_requests enable row level security;
alter table wasl.idea_edit_requests force row level security;
revoke all on wasl.idea_edit_requests from public, anon, authenticated;
grant select, insert, update, delete on wasl.idea_edit_requests to wasl_app;
create policy wasl_app_all on wasl.idea_edit_requests for all to wasl_app using (true) with check (true);
create trigger wasl_changed after insert or update or delete on wasl.idea_edit_requests for each statement execute function wasl.bump_change_cursor();

alter table wasl.idea_events drop constraint idea_events_action_check;
alter table wasl.idea_events add constraint idea_events_action_check check (action in ('created','edited','submitted','withdrawn','changes_requested','approved','rejected','cancelled','reopened','reassigned','scheduled','design_started','design_review','delivered','archived','attachments_added','attachment_removed','quotation_added','quotation_removed','comment','deleted','restored','edit_requested','edit_request_approved','edit_request_rejected'));
