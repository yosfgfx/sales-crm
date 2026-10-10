alter table wasl.accounts add column totp_pending_enc text;
alter table wasl.accounts add column totp_enabled_at timestamptz;
alter table wasl.accounts add column totp_last_step bigint;
