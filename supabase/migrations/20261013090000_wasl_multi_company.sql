alter table wasl.ideas add column if not exists company_ids text[] not null default '{}';
alter table wasl.ideas add column if not exists all_companies boolean not null default false;
create index if not exists ideas_company_ids_idx on wasl.ideas using gin (company_ids);
