// Supabase 클라이언트. 다른 모듈은 이 파일의 supabase만 가져다 쓴다.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// photos 버킷에 있는 사진의 공개 주소.
export function photoUrl(path) {
  return supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
}
