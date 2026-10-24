"""Render the reviewed Markdown sources into local, dependency-free reading pages."""
from pathlib import Path
import html
import re
from markdown_it import MarkdownIt

ROOT = Path(__file__).resolve().parent
STYLE = """:root{--ink:#242426;--muted:#68686e;--line:#e5e5e7;--paper:#fff;--wash:#f5f5f6;--accent:#b82248}
*{box-sizing:border-box}html{scroll-padding-top:24px}body{margin:0;color:var(--ink);background:var(--paper);font:16px/1.85 'Pretendard','Malgun Gothic',system-ui,sans-serif;word-break:keep-all;overflow-wrap:anywhere}
a{color:inherit;text-underline-offset:4px}a:focus-visible,summary:focus-visible{outline:2px solid var(--ink);outline-offset:4px}header{max-width:1280px;margin:auto;padding:30px 40px 20px;border-bottom:1px solid var(--ink);display:flex;justify-content:space-between;gap:20px;align-items:center}header strong{font-size:22px}header nav{display:flex;gap:24px;flex-wrap:wrap;font-size:14px}header a{display:inline-flex;align-items:center;min-height:44px}
.layout{max-width:1280px;margin:0 auto;display:grid;grid-template-columns:218px minmax(0,1fr);gap:50px;padding:38px 40px 80px}aside{align-self:start;position:sticky;top:24px;font-size:13px;line-height:1.6}aside strong{font-size:12px;color:var(--muted);font-weight:500}aside a{display:flex;align-items:center;padding:10px 0;min-height:44px;text-decoration:none;border-bottom:1px solid var(--line)}main{min-width:0}h1{font-size:38px;letter-spacing:-.045em;line-height:1.3;margin:0 0 18px;font-weight:700}h2{font-size:26px;letter-spacing:-.035em;line-height:1.4;margin:52px 0 20px;padding-top:28px;border-top:1px solid var(--ink)}h3{font-size:19px;letter-spacing:-.025em;line-height:1.5;margin:30px 0 12px}p{margin:0 0 20px}h1+p{font-size:13px;color:var(--muted);margin-bottom:30px}ul,ol{padding-left:23px}li+li{margin-top:8px}strong{font-weight:700}code{font-family:inherit;background:var(--wash);padding:2px 4px;border-radius:2px}.table-wrap{max-width:100%;overflow:auto;margin:24px 0 28px;outline-offset:3px}table{border-collapse:collapse;width:100%;font-size:14px;line-height:1.75}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:15px 12px;min-width:110px}th{background:var(--wash);font-weight:650;border-top:1px solid var(--ink)}td:first-child{font-weight:600}table td p{margin:0}blockquote{margin:24px 0;padding:2px 0 2px 20px;border-left:3px solid var(--accent);color:var(--ink)}.scope{padding:18px 20px;background:var(--wash);margin:0 0 30px;font-size:14px;line-height:1.75}.scope b{display:block;font-size:15px;margin-bottom:4px}.reading-note{font-size:12px;color:var(--muted);border-top:1px solid var(--line);padding-top:24px;margin-top:48px}.footer{max-width:1280px;margin:auto;padding:24px 40px 40px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}
@media(max-width:900px){.layout{grid-template-columns:1fr;padding:25px 24px 48px;gap:26px}aside{position:static;display:grid;grid-template-columns:1fr 1fr;gap:0 18px}aside strong{grid-column:1/-1}aside a{font-size:12px}header{padding:20px 24px;align-items:start;flex-direction:column;gap:8px}header nav{gap:18px}h1{font-size:30px}h2{font-size:23px}th,td{min-width:140px}table{min-width:560px}.footer{padding:24px}}
@media print{body{font-size:10pt;line-height:1.65}.layout{display:block;padding:0}aside,header nav,.scope,.reading-note,.footer{display:none}header{padding:0 0 10px;margin-bottom:18px}h1{font-size:26pt}h2{font-size:18pt;margin-top:26px;break-after:avoid}h3{break-after:avoid}.table-wrap{overflow:visible}table{font-size:9pt;min-width:0}th,td{min-width:0;padding:8px}tr{break-inside:avoid}a{text-decoration:none}@page{size:A4;margin:17mm}}
"""

def render(name, scope):
    source = (ROOT / f"{name}.md").read_text(encoding="utf-8")
    source = re.sub(r"<!-- HUMANIZE-SUMMARY -->.*?(?=\Z)", "", source, flags=re.S).rstrip()
    content = MarkdownIt('commonmark').enable('table').render(source)
    headings = []
    def heading(m):
        i = f"section-{len(headings)+1}"
        label = re.sub('<[^>]+>', '', m.group(1))
        headings.append((i, label))
        return f'<h2 id="{i}">{m.group(1)}</h2>'
    content = re.sub(r'<h2>(.*?)</h2>', heading, content)
    content = content.replace('<table>', '<div class="table-wrap" tabindex="0" role="region" aria-label="비교표"><table>').replace('</table>', '</table></div>')
    for n in ['일감체크_실행기획서','업체선택표']:
        content = content.replace(f'./{n}.md', f'./{n}.html')
    toc = ''.join(f'<a href="#{i}">{html.escape(label)}</a>' for i,label in headings)
    page = f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{name.replace('_',' ')} · 일감체크</title><style>{STYLE}</style></head><body>
<header><strong>일감체크</strong><nav aria-label="자료 이동"><a href="./일감체크_실행기획서.html">실행기획서</a><a href="./업체선택표.html">업체·예산 비교</a><a href="./일감체크_흐름시안.html">흐름 시안</a></nav></header>
<div class="layout"><aside aria-label="목차"><strong>읽는 순서</strong>{toc}</aside><main><div class="scope"><b>2026년 10월 25일 검토 자료</b>{html.escape(scope)}</div>{content}<p class="reading-note">숫자는 본문에서 실적·목표·계산 예시를 구분했습니다. 이 파일은 로컬 설명 자료이며 계정 연결·운영 반영·신청·결제를 실행하지 않습니다.</p></main></div><footer class="footer">일감체크 · 대표와 멘토가 같은 근거를 보며 설명하기 위한 자료</footer></body></html>'''
    (ROOT / f'{name}.html').write_text(page, encoding='utf-8')
    print(f'RENDERED {name}.html | headings={len(headings)}')

if __name__ == '__main__':
    render('일감체크_실행기획서', '구현한 MVP를 출발점으로, 크몽 밖 확장·고객 응대·11월 조사와 광고 계획을 연결했습니다. 새 응대 기능은 설계·검증 대상입니다.')
    render('업체선택표', '도구 구독과 실제 모집·광고 대행을 구분했습니다. 조건을 충족하는 등록 상품 조합이 확인되기 전에는 100만원을 임의로 채우지 않습니다.')
