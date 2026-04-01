create extension if not exists pgcrypto;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  assignee text not null default '',
  description text not null default '',
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'in-progress', 'done', 'blocked')),
  due_date date,
  completed_at date,
  link text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.assignees (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color_strong text not null default '#5f7cb6',
  color_soft text not null default 'rgba(95, 124, 182, 0.14)',
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.tasks add column if not exists assignee text not null default '';
alter table public.tasks add column if not exists completed_at date;
alter table public.tasks alter column status set default 'pending';
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks drop constraint if exists public_tasks_status_check;

alter table public.assignees add column if not exists color_strong text not null default '#5f7cb6';
alter table public.assignees add column if not exists color_soft text not null default 'rgba(95, 124, 182, 0.14)';

update public.tasks
set status = case
  when status = 'todo' then 'pending'
  when status = 'needs-attention' then 'in-progress'
  when status not in ('pending', 'in-progress', 'done', 'blocked') then 'pending'
  else status
end
where status in ('todo', 'needs-attention')
   or status not in ('pending', 'in-progress', 'done', 'blocked');

update public.tasks
set completed_at = coalesce(completed_at, updated_at::date)
where status = 'done'
  and completed_at is null;

alter table public.tasks
add constraint tasks_status_check
check (status in ('pending', 'in-progress', 'done', 'blocked'));

create or replace function public.set_tasks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
before update on public.tasks
for each row
execute function public.set_tasks_updated_at();

alter table public.tasks enable row level security;
alter table public.assignees enable row level security;

drop policy if exists "tasks_select_public" on public.tasks;
create policy "tasks_select_public"
on public.tasks
for select
to anon, authenticated
using (true);

drop policy if exists "tasks_insert_public" on public.tasks;
create policy "tasks_insert_public"
on public.tasks
for insert
to anon, authenticated
with check (true);

drop policy if exists "tasks_update_public" on public.tasks;
create policy "tasks_update_public"
on public.tasks
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "tasks_delete_public" on public.tasks;
create policy "tasks_delete_public"
on public.tasks
for delete
to anon, authenticated
using (true);

drop policy if exists "assignees_select_public" on public.assignees;
create policy "assignees_select_public"
on public.assignees
for select
to anon, authenticated
using (true);

drop policy if exists "assignees_insert_public" on public.assignees;
create policy "assignees_insert_public"
on public.assignees
for insert
to anon, authenticated
with check (true);

drop policy if exists "assignees_update_public" on public.assignees;
create policy "assignees_update_public"
on public.assignees
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "assignees_delete_public" on public.assignees;
create policy "assignees_delete_public"
on public.assignees
for delete
to anon, authenticated
using (true);

insert into public.assignees (name, color_strong, color_soft)
values
  ('Bea Montenegro', '#5f7cb6', 'rgba(95, 124, 182, 0.14)'),
  ('Christian Galang', '#739a69', 'rgba(115, 154, 105, 0.16)'),
  ('Margen Andallo', '#c17e49', 'rgba(193, 126, 73, 0.16)')
on conflict (name) do update
set color_strong = excluded.color_strong,
    color_soft = excluded.color_soft;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'assignees'
  ) then
    alter publication supabase_realtime add table public.assignees;
  end if;
end
$$;
