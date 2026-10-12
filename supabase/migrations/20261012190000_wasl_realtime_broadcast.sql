alter table wasl.settings add column realtime_topic text not null default ('wasl-' || md5(random()::text || clock_timestamp()::text || random()::text));

create or replace function wasl.bump_change_cursor() returns trigger language plpgsql set search_path=pg_catalog,wasl as $$
declare
  next_version bigint;
  topic text;
begin
  update wasl.change_cursor set version=version+1,last_changed_at=clock_timestamp() where id=true returning version into next_version;
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    select realtime_topic into topic from wasl.settings where id;
    if topic is not null then
      begin
        execute 'select realtime.send($1, $2, $3, false)' using jsonb_build_object('cursor', next_version::text), 'update', topic;
      exception when others then
        null;
      end;
    end if;
  end if;
  return null;
end $$;
