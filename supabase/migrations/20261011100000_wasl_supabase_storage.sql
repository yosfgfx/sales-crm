alter type wasl.attachment_storage add value if not exists 'supabase';

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'storage' and c.relname = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit) values ('wasl-files', 'wasl-files', false, 26214400) on conflict (id) do nothing;
  end if;
end $$;
