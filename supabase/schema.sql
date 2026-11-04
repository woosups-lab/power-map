-- 현장 전력지도 서버 구조 (Supabase SQL Editor에서 실행)
-- 권한은 members 표가 정한다: admin은 읽기·쓰기, viewer는 읽기만. 표에 없는 계정은 아무것도 못 한다.
-- 여러 번 실행해도 안전하다.

create table if not exists public.members (
  user_id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('admin', 'viewer'))
);

-- 현장 한 곳이 문서 하나(doc). 기록과 첨부 목록도 doc 안에 들어간다.
create table if not exists public.sites (
  id text primary key,
  doc jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

alter table public.members enable row level security;
alter table public.sites enable row level security;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = ''
as $$ select role from public.members where user_id = auth.uid() $$;

create or replace function public.touch_site() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists sites_touch on public.sites;
create trigger sites_touch before insert or update on public.sites for each row execute function public.touch_site();

drop policy if exists "본인 권한 조회" on public.members;
create policy "본인 권한 조회" on public.members for select to authenticated using (user_id = auth.uid());

drop policy if exists "회원 읽기" on public.sites;
drop policy if exists "관리자 추가" on public.sites;
drop policy if exists "관리자 수정" on public.sites;
drop policy if exists "관리자 삭제" on public.sites;
create policy "회원 읽기" on public.sites for select to authenticated using (public.my_role() is not null);
create policy "관리자 추가" on public.sites for insert to authenticated with check (public.my_role() = 'admin');
create policy "관리자 수정" on public.sites for update to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy "관리자 삭제" on public.sites for delete to authenticated using (public.my_role() = 'admin');

revoke all on public.members, public.sites from anon;
grant select on public.members to authenticated;
grant select, insert, update, delete on public.sites to authenticated;

-- 첨부 파일: 비공개 버킷, 경로는 "현장ID/첨부ID", 파일 하나 최대 50MB
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "첨부 회원 읽기" on storage.objects;
drop policy if exists "첨부 관리자 추가" on storage.objects;
drop policy if exists "첨부 관리자 수정" on storage.objects;
drop policy if exists "첨부 관리자 삭제" on storage.objects;
create policy "첨부 회원 읽기" on storage.objects for select to authenticated using (bucket_id = 'attachments' and public.my_role() is not null);
create policy "첨부 관리자 추가" on storage.objects for insert to authenticated with check (bucket_id = 'attachments' and public.my_role() = 'admin');
create policy "첨부 관리자 수정" on storage.objects for update to authenticated using (bucket_id = 'attachments' and public.my_role() = 'admin');
create policy "첨부 관리자 삭제" on storage.objects for delete to authenticated using (bucket_id = 'attachments' and public.my_role() = 'admin');

-- 관리자가 앱에서 이용자 공용 비밀번호를 바꿀 때 쓴다. 바꾸면 이용자는 다시 로그인해야 한다.
create or replace function public.set_viewer_password(new_password text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception '관리자만 바꿀 수 있습니다'; end if;
  if length(new_password) < 6 then raise exception '비밀번호는 6자 이상이어야 합니다'; end if;
  update auth.users set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')), updated_at = now()
   where id in (select user_id from public.members where role = 'viewer');
  delete from auth.sessions where user_id in (select user_id from public.members where role = 'viewer');
end $$;
revoke all on function public.set_viewer_password(text) from public, anon;
grant execute on function public.set_viewer_password(text) to authenticated;
