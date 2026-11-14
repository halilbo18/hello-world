create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  phone text,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null constraint training_sessions_member_id_fkey references public.profiles (id) on delete cascade,
  workout_type text not null check (char_length(workout_type) between 1 and 100),
  scheduled_at timestamptz not null,
  status text not null default 'Planlandı' check (status in ('Planlandı', 'Tamamlandı', 'İptal')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index training_sessions_member_schedule_idx
  on public.training_sessions (member_id, scheduled_at desc);

alter table public.profiles enable row level security;
alter table public.training_sessions enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create policy "Users can read their own profile and admins can read all profiles"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "Members can read their own sessions and admins can read all sessions"
  on public.training_sessions for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));

create policy "Admins can create training sessions"
  on public.training_sessions for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));

create policy "Admins can update training sessions"
  on public.training_sessions for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins can delete training sessions"
  on public.training_sessions for delete to authenticated
  using ((select public.is_admin()));

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.training_sessions to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();
