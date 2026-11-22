-- 탐색 지도에 찾은 장소를 별로 찍으려면 좌표가 필요하다.
-- 내가 찾았거나 내가 올린 장소일 때만 lat, lng를 채운다. 찾기 전 장소의 좌표는 여전히 나오지 않는다.
-- create or replace view는 맨 뒤에 칸을 더하는 것만 허용하므로 lat, lng를 끝에 붙인다. 기존 권한은 유지된다.
create or replace view public.public_places as
select
  p.id,
  p.photo_path,
  p.hint,
  pr.nickname                          as uploader_nickname,
  (f.user_id is not null)              as found,
  coalesce(p.uploader_id = auth.uid(), false) as mine,  -- 로그인 안 했으면 false
  case when f.user_id is not null or p.uploader_id = auth.uid() then p.name end  as name,
  case when f.user_id is not null or p.uploader_id = auth.uid() then p.story end as story,
  p.created_at,
  case when f.user_id is not null or p.uploader_id = auth.uid() then p.lat end   as lat,
  case when f.user_id is not null or p.uploader_id = auth.uid() then p.lng end   as lng
from public.places p
join public.profiles pr on pr.id = p.uploader_id
left join public.finds f on f.place_id = p.id and f.user_id = auth.uid()
where p.status = 'approved';
