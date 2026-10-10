alter table wasl.attachments add column requested_idea_id text references wasl.ideas (id) on delete cascade;
create index attachments_requested_idea_idx on wasl.attachments (requested_idea_id) where requested_idea_id is not null;
