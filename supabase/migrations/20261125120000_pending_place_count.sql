-- 디버그 패널(?debug=1)용. 승인 대기 장소가 몇 개인지 숫자만 돌려준다.
-- 이름·좌표·사진 등 다른 정보는 주지 않으므로 비로그인에게도 열어 둔다.
create function public.pending_place_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from public.places where status = 'pending';
$$;

revoke execute on function public.pending_place_count() from public;
grant execute on function public.pending_place_count() to anon, authenticated;
