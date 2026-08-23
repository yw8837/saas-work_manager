import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// 일감체크의 원본 데이터는 Supabase에만 둔다. 캐시 저장소는 실제 운영에서
// 필요성이 확인된 뒤 별도 R2 binding으로 추가한다.
export default defineCloudflareConfig();
