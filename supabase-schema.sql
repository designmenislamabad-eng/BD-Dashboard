create extension if not exists pgcrypto;

-- Supabase Auth owns passwords. This table stores only portal profile data.
create table if not exists public."Login" (
  id uuid not null default gen_random_uuid(),
  user_name text null,
  "Password" text null,
  "Role" text not null,
  "Email" text not null,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint Login_pkey primary key (id),
  constraint Login_Email_key unique ("Email"),
  constraint Login_user_name_key unique (user_name),
  constraint Login_Role_check check ("Role" in ('admin', 'employee'))
);

create unique index if not exists login_single_admin_idx
  on public."Login" ((1)) where "Role" = 'admin';

create table if not exists public."Project_Entries_Detailed" (
  id uuid not null default gen_random_uuid(),
  sr_no bigint null,
  project_name text null,
  nature text null,
  sector text null,
  region text null,
  lead_form text null,
  associated_jvs text null,
  client_employer text null,
  client_address text null,
  contact text null,
  dealing_person text null,
  advertising_date date null,
  submission_date date null,
  technical_opening date null,
  financial_opening date null,
  project_progress text null,
  current_status text null,
  bid_security text null,
  quoted_financial_amount numeric null,
  financial_bid_ranking text null,
  final_status text null,
  awarded_granted_date date null,
  participants_detail text null,
  progress_tracking text null,
  remarks text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint Project_Entries_Detailed_pkey primary key (id),
  constraint Project_Entries_Detailed_sr_no_key unique (sr_no)
) TABLESPACE pg_default;

alter table public."Project_Entries_Detailed"
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists sr_no bigint,
  add column if not exists project_name text,
  add column if not exists nature text,
  add column if not exists sector text,
  add column if not exists region text,
  add column if not exists lead_form text,
  add column if not exists associated_jvs text,
  add column if not exists client_employer text,
  add column if not exists client_address text,
  add column if not exists contact text,
  add column if not exists dealing_person text,
  add column if not exists advertising_date date,
  add column if not exists submission_date date,
  add column if not exists technical_opening date,
  add column if not exists financial_opening date,
  add column if not exists project_progress text,
  add column if not exists current_status text,
  add column if not exists bid_security text,
  add column if not exists quoted_financial_amount numeric,
  add column if not exists financial_bid_ranking text,
  add column if not exists final_status text,
  add column if not exists awarded_granted_date date,
  add column if not exists participants_detail text,
  add column if not exists progress_tracking text,
  add column if not exists remarks text,
  add column if not exists created_at timestamp with time zone not null default now(),
  add column if not exists updated_at timestamp with time zone not null default now();

-- Passwords are managed securely by Supabase Auth, not stored in this profile table.
-- Existing databases may not have a "Password" column, so no password-column
-- migration is needed here.
alter table if exists public."Login" enable row level security;

drop policy if exists "Admins can read login profiles" on public."Login";
create policy "Admins can read login profiles"
  on public."Login" for select
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'designmenislamabad@gmail.com'
  );

-- No direct insert, update, or delete policy is created.
-- The security-definer auth trigger can still sync profile records.

-- Recommended after confirming no old client reads this column:
-- alter table public."Login" drop column if exists "Password";

create table if not exists public.admin_accounts (
  username text primary key,
  email text not null unique,
  created_at timestamptz not null default now()
);

insert into public.admin_accounts (username, email)
values ('admin', 'designmenislamabad@gmail.com')
on conflict (username) do update set email = excluded.email;

alter table public.admin_accounts enable row level security;
drop policy if exists "Allow admin username lookup" on public.admin_accounts;
create policy "Allow admin username lookup"
  on public.admin_accounts for select
  to anon, authenticated
  using (username = 'admin');

alter table public."Project_Entries_Detailed" enable row level security;

drop policy if exists "Admin can read project records" on public."Project_Entries_Detailed";
drop policy if exists "Admin can insert project records" on public."Project_Entries_Detailed";
drop policy if exists "Admin can update project records" on public."Project_Entries_Detailed";
drop policy if exists "Admin can delete project records" on public."Project_Entries_Detailed";

create policy "Admin can read project records"
  on public."Project_Entries_Detailed" for select
  to authenticated
  using (true);

create policy "Admin can insert project records"
  on public."Project_Entries_Detailed" for insert
  to authenticated
  with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'designmenislamabad@gmail.com'
  );

create policy "Admin can update project records"
  on public."Project_Entries_Detailed" for update
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'designmenislamabad@gmail.com'
  )
  with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'designmenislamabad@gmail.com'
  );

create policy "Admin can delete project records"
  on public."Project_Entries_Detailed" for delete
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'designmenislamabad@gmail.com'
  );

create or replace function public.set_project_entries_detailed_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists project_entries_detailed_updated_at on public."Project_Entries_Detailed";
create trigger project_entries_detailed_updated_at
before update on public."Project_Entries_Detailed"
for each row execute function public.set_project_entries_detailed_updated_at();

-- Keep the custom profile and audit tables synchronized with Supabase Auth.
create table if not exists public."Audit_Log" (
  id uuid primary key default gen_random_uuid(),
  user_email text,
  user_role text,
  action text not null,
  target_table text,
  target_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

alter table public."Audit_Log"
  add column if not exists target_id text,
  add column if not exists details jsonb;

alter table public."Audit_Log" enable row level security;

drop policy if exists "Admins can read audit logs" on public."Audit_Log";
create policy "Admins can read audit logs"
  on public."Audit_Log" for select
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'designmenislamabad@gmail.com'
  );

-- No direct insert, update, or delete policy is created.
-- The security-definer auth trigger can still write audit entries.

create or replace function public.sync_auth_user_to_portal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_role text;
begin
  resolved_role := case
    when lower(coalesce(new.email, '')) = 'designmenislamabad@gmail.com' then 'admin'
    else 'employee'
  end;

  insert into public."Login" (user_name, "Role", "Email", is_verified)
  values (
    split_part(coalesce(new.email, new.id::text), '@', 1),
    case when resolved_role = 'admin' then 'admin' else 'employee' end,
    lower(new.email),
    new.email_confirmed_at is not null
  )
  on conflict ("Email") do update set
    "Role" = excluded."Role",
    is_verified = excluded.is_verified;

  insert into public."Audit_Log" (user_email, user_role, action, target_table)
  values (lower(new.email), resolved_role, tg_op || '_AUTH_USER', 'auth.users');

  return new;
end;
$$;

drop trigger if exists sync_auth_user_to_portal on auth.users;
create trigger sync_auth_user_to_portal
after insert or update of email, raw_user_meta_data, email_confirmed_at on auth.users
for each row execute function public.sync_auth_user_to_portal();

-- Security Advisor hardening for SECURITY DEFINER functions.
-- Trigger execution is unchanged; direct API execution is blocked.
do $$
declare
  function_row record;
begin
  for function_row in
    select n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as arguments
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'handle_new_user',
        'sync_auth_user_to_login',
        'sync_auth_user_to_portal',
        'set_project_entries_detailed_updated_at'
      )
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = public',
      function_row.schema_name,
      function_row.function_name,
      function_row.arguments
    );
    execute format(
      'revoke execute on function %I.%I(%s) from public, anon, authenticated',
      function_row.schema_name,
      function_row.function_name,
      function_row.arguments
    );
  end loop;
end
$$;
