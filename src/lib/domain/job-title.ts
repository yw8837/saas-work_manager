import type { Job } from "./types";

/**
 * 고객 이름이 바로 옆에 보이는 곳(일감 화면 제목 아래, 목록, 오늘, 카톡 문구)에서 쓰는 일감 제목.
 * 새 일감 기본 제목("고객 이름 · 패키지 이름")의 앞부분을 떼어 같은 이름이 두 번 보이지 않게 한다.
 * 저장된 제목은 바꾸지 않는다. 사용자가 바꾼 제목이나 떼면 비는 제목은 그대로 보여 준다.
 */
export function displayJobTitle(job: Pick<Job, "title" | "clientLabel">): string {
  const client = job.clientLabel.trim();
  const prefix = `${client} · `;
  if (!client || !job.title.startsWith(prefix)) return job.title;
  return job.title.slice(prefix.length).trim() || job.title;
}
