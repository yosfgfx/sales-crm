alter table wasl.settings
  add column if not exists ai_model text not null default 'claude-sonnet-5-5' check (ai_model in ('claude-opus-5-5','claude-sonnet-5-5','claude-haiku-5-5')),
  add column if not exists ai_effort text not null default 'low' check (ai_effort in ('low','medium','high')),
  add column if not exists ai_instructions text not null default '' check (length(ai_instructions) <= 6000);
