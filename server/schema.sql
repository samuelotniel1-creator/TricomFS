-- Ejecuta esto una vez en el SQL Editor de tu proyecto de Supabase
-- (Project > SQL Editor > New query) antes de configurar SUPABASE_URL / SUPABASE_SERVICE_KEY.

create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text not null,
  age integer not null,
  weight text not null,
  condition text not null,
  medications text not null,
  sleep text not null,
  caffeine_alcohol text not null,
  allergies text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  event_id text
);

-- El servidor accede con la Service Role Key (nunca se expone al navegador),
-- así que Row Level Security puede quedar activo y cerrado por defecto.
alter table patients enable row level security;
