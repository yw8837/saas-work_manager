"""Verify rendered planning pages using an isolated browser and local files only."""
from pathlib import Path
import json
from urllib.parse import unquote
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent
RUN=ROOT.parents[1]/'_workspace/2026-10-25-qa-588a'

def main():
    RUN.mkdir(parents=True,exist_ok=True)
    results=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True)
        context=browser.new_context()
        errors=[]
        page=context.new_page()
        page.on('pageerror',lambda e:errors.append(str(e)))
        try:
            for name in ['일감체크_실행기획서','업체선택표']:
                page.goto((ROOT/f'{name}.html').as_uri())
                assert page.evaluate('getComputedStyle(document.documentElement).getPropertyValue("--ink").trim()')=='#242426'
                assert page.locator('body').evaluate('(e)=>getComputedStyle(e).color')=='rgb(36, 36, 38)'
                assert page.locator('.scope').evaluate('(e)=>getComputedStyle(e).backgroundColor')=='rgb(245, 245, 246)'
                assert page.locator('header').evaluate('(e)=>getComputedStyle(e).borderBottomStyle')=='solid'
                for link in page.locator('a[href]').evaluate_all('(els)=>els.map(e=>e.getAttribute("href"))'):
                    if link.startswith('#'):
                        assert page.locator(link).count()==1,link
                    elif not link.startswith(('http:','https:')):
                        assert (ROOT/unquote(link.split('#')[0])).exists(),link
                for width in [320,390,1440]:
                    page.set_viewport_size({'width':width,'height':1000})
                    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(name,width,'overflow')
                    assert page.locator('h1').count()==1
                    assert '\ufffd' not in page.locator('body').inner_text()
                    page.screenshot(path=str(RUN/f'{name}-{width}.png'),full_page=False)
                    results.append({'file':name,'width':width,'overflow':False,'links':'PASS','text':'PASS'})
            assert not errors,errors
        finally:
            context.close();browser.close()
    (RUN/'reading-pages-qa.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    print('PASS: 2 reading pages x 320/390/1440, anchors/local links, no replacement chars, no JS errors')

if __name__=='__main__':
    main()
