alter table wasl.attachments drop constraint attachments_storage_ref;
alter table wasl.attachments add constraint attachments_storage_ref check (
  (storage = 'drive' and drive_file_id is not null) or
  (storage = 'local' and local_path is not null) or
  (storage = 'supabase' and local_path is not null) or
  (storage = 'external' and external_url is not null)
);
alter table wasl.attachments drop constraint if exists attachments_size_check;
alter table wasl.attachments add constraint attachments_size_check check (size >= 0 and size <= 2147483648);
