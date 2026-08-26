import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const [inputPath, outputPath = "public/og/ilgamcheck-social.png"] = process.argv.slice(2);

if (!inputPath) {
  console.error("사용법: node scripts/build-social-card.mjs <배경 이미지> [출력 경로]");
  process.exit(1);
}

const output = resolve(outputPath);
await mkdir(dirname(output), { recursive: true });

const overlay = Buffer.from(`
  <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <style>
      .brand { font: 600 28px 'Paperlogy', 'Noto Sans KR', sans-serif; fill: #181d26; }
      .title { font: 600 62px 'Paperlogy', 'Noto Sans KR', sans-serif; fill: #181d26; }
      .accent { fill: #b8320f; }
      .desc { font: 500 24px 'Paperlogy', 'Noto Sans KR', sans-serif; fill: #4c5564; }
    </style>
    <text class="brand" x="86" y="100">일감체크</text>
    <text class="title" x="86" y="245">혼자 일해도,</text>
    <text class="title accent" x="86" y="325">운영까지 혼자 할</text>
    <text class="title accent" x="86" y="405">필요는 없어요.</text>
    <text class="desc" x="86" y="500">주문 뒤의 할 일과 수정 요청을 한곳에서 정리하세요.</text>
  </svg>
`);

await sharp(resolve(inputPath))
  .resize(1200, 630, { fit: "cover", position: "center" })
  .composite([{ input: overlay }])
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(output);

const metadata = await sharp(output).metadata();
if (metadata.width !== 1200 || metadata.height !== 630 || metadata.format !== "png") {
  throw new Error("소셜 카드 출력 규격이 1200x630 PNG가 아닙니다.");
}

console.log(`[social-card] PASS ${output} (${metadata.width}x${metadata.height})`);
