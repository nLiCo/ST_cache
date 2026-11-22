-- ST_cache 첫 스키마: 테이블, 판정·점수 함수, 공개 뷰, 권한 규칙(RLS), 사진 버킷.
-- Supabase 대시보드 SQL Editor에 통째로 붙여 넣어 한 번 실행한다.
--
-- 권한의 기본 생각
--   - 브라우저(anon, authenticated 역할)는 places, attempts, finds를 직접 읽지 못한다.
--   - 읽기는 뷰(public_places, my_places, leaderboard)로만 한다. 뷰는 소유자(postgres)
--     권한으로 테이블을 읽고, 정답 좌표는 어떤 뷰에도 넣지 않는다.
--   - 쓰기는 장소 추가(places insert)와 check_place 함수뿐이다.

-- ─────────────────────────────────────────────
-- 테이블
-- ─────────────────────────────────────────────

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nickname   text unique
             check (nickname = btrim(nickname) and char_length(nickname) between 2 and 12),
  role       text not null default 'user' check (role in ('user', 'trusted', 'admin')),
  created_at timestamptz not null default now()
);

create table public.places (
  id          uuid primary key default gen_random_uuid(),
  uploader_id uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 30),
  hint        text check (char_length(hint) <= 100),
  story       text check (char_length(story) <= 500),
  photo_path  text not null,
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  accuracy    double precision check (accuracy >= 0),
  radius      double precision not null default 25 check (radius > 0),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now()
);

-- 확인 버튼을 누른 기록. 사용자·장소당 한 줄(처음 누른 시각).
create table public.attempts (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  first_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

-- 찾은 기록. 사용자·장소당 한 줄.
create table public.finds (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  found_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create index attempts_place_idx on public.attempts (place_id);
create index finds_place_idx on public.finds (place_id);

-- ─────────────────────────────────────────────
-- 내부 함수
-- ─────────────────────────────────────────────

-- 두 좌표 사이 거리(m), 하버사인 공식.
create function public.distance_m(lat1 double precision, lng1 double precision,
                                  lat2 double precision, lng2 double precision)
returns double precision
language sql immutable
set search_path = ''
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- 장소 하나의 점수(E안). 찾은 사람 수와 시도한 사람 수만 받는 순수 계산식이다.
-- 기본 10점 + 난이도 보너스 0~10점. +1, +2는 사람이 적을 때 값이 튀지 않게 하는 완충.
create function public.place_score(finders bigint, attempters bigint)
returns double precision
language sql immutable
set search_path = ''
as $$
  select 10 + 10 * (1 - (finders + 1)::double precision / (attempters + 2));
$$;

-- ─────────────────────────────────────────────
-- 트리거
-- ─────────────────────────────────────────────

-- 가입하면 profiles 줄을 만든다. 닉네임은 비워 두고 첫 로그인 때 정한다.
create function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 이 마이그레이션 전에 이미 로그인한 계정의 profiles 줄도 만든다.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- 장소 등록. 브라우저가 넣은 uploader_id, status, radius, created_at은 무시하고 서버가 정한다.
-- 대시보드·SQL Editor에서 관리자가 직접 넣을 때(auth.uid()가 없음)는 넣은 값을 그대로 쓴다.
create function public.before_place_insert()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  my_role     text;
  my_nickname text;
begin
  if auth.uid() is null then
    return new;
  end if;

  select role, nickname into my_role, my_nickname
  from public.profiles where id = auth.uid();

  if my_nickname is null then
    raise exception '닉네임을 먼저 정해 주세요';
  end if;
  if new.accuracy is null or new.accuracy > 30 then
    raise exception '위치 정확도가 30m보다 나빠요';
  end if;
  if split_part(new.photo_path, '/', 1) <> auth.uid()::text then
    raise exception '사진 경로가 올바르지 않아요';
  end if;

  new.uploader_id := auth.uid();
  new.status      := case when my_role in ('trusted', 'admin') then 'approved' else 'pending' end;
  new.radius      := 25;
  new.created_at  := now();
  return new;
end;
$$;

create trigger before_place_insert
  before insert on public.places
  for each row execute function public.before_place_insert();

-- ─────────────────────────────────────────────
-- 공개 함수: 확인 버튼
-- ─────────────────────────────────────────────

-- 결과: 'inaccurate' | 'own' | 'already' | 'found' | 'not_here'
-- 검사, attempts·finds 기록, 결과 반환을 한 번에 한다(나눠 두면 검사를 건너뛰고 기록만 부를 수 있다).
create function public.check_place(place_id uuid, lat double precision,
                                   lng double precision, accuracy double precision)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  me    uuid := auth.uid();
  place public.places%rowtype;
begin
  if me is null then
    raise exception '로그인이 필요해요';
  end if;
  if (select nickname from public.profiles where id = me) is null then
    raise exception '닉네임을 먼저 정해 주세요';
  end if;
  if lat is null or lng is null or accuracy is null
     or lat not between -90 and 90 or lng not between -180 and 180 or accuracy < 0 then
    raise exception '위치 값이 올바르지 않아요';
  end if;

  select * into place from public.places p
  where p.id = check_place.place_id and p.status = 'approved';
  if not found then
    raise exception '없는 장소예요';
  end if;

  -- 정확도 미달은 시도로 세지 않는다.
  if accuracy > 50 then
    return 'inaccurate';
  end if;
  if place.uploader_id = me then
    return 'own';
  end if;
  if exists (select 1 from public.finds f where f.user_id = me and f.place_id = place.id) then
    return 'already';
  end if;

  insert into public.attempts (user_id, place_id) values (me, place.id)
  on conflict do nothing;

  if public.distance_m(lat, lng, place.lat, place.lng) <= place.radius then
    insert into public.finds (user_id, place_id) values (me, place.id)
    on conflict do nothing;
    return 'found';
  end if;
  return 'not_here';
end;
$$;

-- ─────────────────────────────────────────────
-- 뷰 (소유자 권한으로 테이블을 읽는다. 좌표는 넣지 않는다)
-- ─────────────────────────────────────────────

-- 탐색 화면. 승인된 장소 전부. 이름·이야기는 내가 찾았거나 내가 올린 장소일 때만 채운다.
create view public.public_places as
select
  p.id,
  p.photo_path,
  p.hint,
  pr.nickname                          as uploader_nickname,
  (f.user_id is not null)              as found,
  coalesce(p.uploader_id = auth.uid(), false) as mine,  -- 로그인 안 했으면 false
  case when f.user_id is not null or p.uploader_id = auth.uid() then p.name end  as name,
  case when f.user_id is not null or p.uploader_id = auth.uid() then p.story end as story,
  p.created_at
from public.places p
join public.profiles pr on pr.id = p.uploader_id
left join public.finds f on f.place_id = p.id and f.user_id = auth.uid()
where p.status = 'approved';

-- 내 정보 화면. 내가 올린 장소 전부(대기·반려 포함).
create view public.my_places as
select p.id, p.name, p.hint, p.story, p.photo_path, p.status, p.created_at
from public.places p
where p.uploader_id = auth.uid();

-- 랭킹. 점수는 저장하지 않고 볼 때마다 계산한다. 승인된 장소만 센다.
create view public.leaderboard as
with place_scores as (
  select
    p.id,
    public.place_score(
      (select count(*) from public.finds f where f.place_id = p.id),
      (select count(*) from public.attempts a where a.place_id = p.id)
    ) as score
  from public.places p
  where p.status = 'approved'
),
user_scores as (
  select f.user_id, sum(ps.score) as score, count(*) as found_count
  from public.finds f
  join place_scores ps on ps.id = f.place_id
  group by f.user_id
)
select
  rank() over (order by coalesce(us.score, 0) desc) as rank,
  pr.nickname,
  round(coalesce(us.score, 0)::numeric, 1)         as score,
  coalesce(us.found_count, 0)                      as found_count,
  coalesce(pr.id = auth.uid(), false)              as is_me
from public.profiles pr
left join user_scores us on us.user_id = pr.id
where pr.nickname is not null;

-- ─────────────────────────────────────────────
-- 권한
-- ─────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.places   enable row level security;
alter table public.attempts enable row level security;
alter table public.finds    enable row level security;

-- Supabase는 public 스키마의 새 테이블·함수에 anon, authenticated 권한을 자동으로 준다.
-- 전부 거둬들이고 필요한 것만 다시 준다.
revoke all on public.profiles, public.places, public.attempts, public.finds
  from anon, authenticated;
revoke all on public.public_places, public.my_places, public.leaderboard
  from anon, authenticated;
revoke execute on function
  public.distance_m(double precision, double precision, double precision, double precision),
  public.handle_new_user(),
  public.before_place_insert(),
  public.check_place(uuid, double precision, double precision, double precision)
  from public, anon, authenticated;

-- profiles: 본인 줄만 읽고, 닉네임만 바꿀 수 있다. role은 대시보드에서만 바꾼다.
grant select on public.profiles to authenticated;
grant update (nickname) on public.profiles to authenticated;
create policy "본인 프로필 읽기" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "본인 닉네임 바꾸기" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- places: 로그인한 사람은 추가만. 넣을 수 있는 칸도 정해 둔다.
grant insert (name, hint, story, photo_path, lat, lng, accuracy) on public.places to authenticated;
create policy "로그인하면 장소 추가" on public.places
  for insert to authenticated with check (true);

-- attempts, finds: 정책 없음 = 브라우저에서 읽기·쓰기 불가. check_place만 쓴다.

grant select on public.public_places, public.leaderboard to anon, authenticated;
grant select on public.my_places to authenticated;
grant execute on function
  public.check_place(uuid, double precision, double precision, double precision)
  to authenticated;
-- place_score는 표에 접근하지 않는 계산식이라 뷰를 읽는 사람 누구나 실행할 수 있어야 한다.
grant execute on function public.place_score(bigint, bigint) to anon, authenticated;

-- ─────────────────────────────────────────────
-- 사진 버킷
-- ─────────────────────────────────────────────

-- 공개 버킷: 주소를 알면 누구나 읽는다(파일 이름은 무작위). 5MB, JPEG·WebP만.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg', 'image/webp']);

-- 로그인한 사람은 자기 폴더(<user id>/)에만 올린다. 덮어쓰기·삭제는 못 한다.
create policy "자기 폴더에 사진 올리기" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
