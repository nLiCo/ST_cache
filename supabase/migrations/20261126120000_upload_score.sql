-- 장소를 올린 사람에게도 점수를 준다(등록 점수). 랭킹 점수 = 찾기 점수 + 등록 점수.
-- 찾기만 보상하면 장소를 올릴 동기가 없어서, 올린 장소를 다른 사람이 적당히 찾을 때 점수를 준다.
-- 바꾸는 것: upload_score 함수 추가, leaderboard 뷰(등록 점수 합산·관리자 제외·새 칸 3개),
--           my_places 뷰(장소별 찾은 사람 수·등록 점수 칸 2개).
-- 뷰는 create or replace라 기존 칸의 이름·순서·타입은 그대로 두고 새 칸은 맨 뒤에만 붙인다.
-- Supabase 대시보드 SQL Editor에 통째로 붙여 넣어 한 번 실행한다.

-- 장소 하나의 등록 점수. 찾은 사람 수와 시도한 사람 수만 받는 순수 계산식이다.
-- 6 × min(찾은 수, 5) × (1 − (찾은 수 + 1) / (시도 수 + 2)).
-- 찾은 사람이 없으면 0, 5명을 넘으면 더 늘지 않고, 너무 쉬울수록(찾은 비율이 높을수록) 줄어든다.
create function public.upload_score(finders bigint, attempters bigint)
returns double precision
language sql immutable
set search_path = ''
as $$
  select 6 * least(finders, 5) * (1 - (finders + 1)::double precision / (attempters + 2));
$$;

revoke execute on function public.upload_score(bigint, bigint) from public;
-- place_score처럼 표를 읽지 않는 계산식이라 뷰를 읽는 사람 누구나 실행할 수 있어야 한다.
grant execute on function public.upload_score(bigint, bigint) to anon, authenticated;

-- 내 정보 화면. 내가 올린 장소 전부(대기·반려 포함) + 장소별 찾은 사람 수와 등록 점수.
-- 승인된 장소만 점수에 들어가므로 그 외 상태는 0점으로 보여 준다.
create or replace view public.my_places as
select
  p.id, p.name, p.hint, p.story, p.photo_path, p.status, p.created_at,
  (select count(*) from public.finds f where f.place_id = p.id) as finder_count,
  case when p.status = 'approved' then
    public.upload_score(
      (select count(*) from public.finds f where f.place_id = p.id),
      (select count(*) from public.attempts a where a.place_id = p.id)
    )
  else 0::double precision end as upload_score
from public.places p
where p.uploader_id = auth.uid();

-- 랭킹. 점수는 저장하지 않고 볼 때마다 계산한다. 승인된 장소만 센다.
-- 관리자 계정은 랭킹에서 뺀다(관리자의 시도·찾기는 다른 장소의 찾은 수·시도 수에는 그대로 들어간다).
create or replace view public.leaderboard as
with place_stats as (
  select
    p.id,
    p.uploader_id,
    (select count(*) from public.finds f where f.place_id = p.id)    as finders,
    (select count(*) from public.attempts a where a.place_id = p.id) as attempters
  from public.places p
  where p.status = 'approved'
),
find_scores as (
  select f.user_id,
         sum(public.place_score(st.finders, st.attempters)) as score,
         count(*) as found_count
  from public.finds f
  join place_stats st on st.id = f.place_id
  group by f.user_id
),
upload_scores as (
  select st.uploader_id,
         sum(public.upload_score(st.finders, st.attempters)) as score,
         count(*) as upload_count
  from place_stats st
  group by st.uploader_id
),
totals as (
  select
    pr.id,
    pr.nickname,
    coalesce(fs.score, 0)        as find_score,
    coalesce(us.score, 0)        as upload_score,
    coalesce(fs.found_count, 0)  as found_count,
    coalesce(us.upload_count, 0) as upload_count
  from public.profiles pr
  left join find_scores fs on fs.user_id = pr.id
  left join upload_scores us on us.uploader_id = pr.id
  where pr.nickname is not null and pr.role <> 'admin'
)
select
  rank() over (order by t.find_score + t.upload_score desc)     as rank,
  t.nickname,
  round((t.find_score + t.upload_score)::numeric, 1)            as score,
  t.found_count                                                 as found_count,
  coalesce(t.id = auth.uid(), false)                            as is_me,
  round(t.find_score::numeric, 1)                               as find_score,
  round(t.upload_score::numeric, 1)                             as upload_score,
  t.upload_count                                                as upload_count
from totals t;
