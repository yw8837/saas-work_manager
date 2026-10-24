"""Bounded isolated OMX lifecycle plus local prototype tests; no external mutations."""
from pathlib import Path
import json
import os
import subprocess

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / '_workspace/2026-10-25-qa-588a'
CLI = Path('C:/Users/최용우/AppData/Roaming/npm/node_modules/oh-my-codex/dist/cli/omx.js')
PY = 'C:/Users/최용우/.codex/skills/webapp-testing/.venv/Scripts/python.exe'

def main():
    RUN.mkdir(parents=True, exist_ok=True)
    old_log = RUN/'qa-execution.json'
    if old_log.exists():
        index = 1
        while (RUN/f'qa-execution-attempt-{index}.json').exists():
            index += 1
        (RUN/f'qa-execution-attempt-{index}.json').write_bytes(old_log.read_bytes())
    env = os.environ.copy()
    env.pop('OMX_ROOT', None)
    env.pop('OMX_STATE_ROOT', None)
    log = []
    def call(args, timeout=30, cwd=RUN):
        try:
            p = subprocess.run(args, cwd=cwd, env=env, text=True, encoding='utf-8', capture_output=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            log.append({'command':args, 'timeout':timeout})
            raise
        log.append({'command':args,'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr})
        if p.returncode:
            raise RuntimeError(p.stderr or p.stdout)
        return p.stdout
    def state(phase, active=True):
        result = json.loads(call(['node',str(CLI),'state','write','--input',json.dumps({'mode':'ultraqa','active':active,'current_phase':phase},ensure_ascii=False),'--json']))
        if result.get('success') is not True:
            raise RuntimeError(f'OMX state write failed: {result}')
    ok=False
    try:
        state('planning')
        state('qa')
        call([PY,str(ROOT/'docs/strategy/prototype-qa.py'),str(RUN/'prototype-desktop.png')],timeout=90,cwd=ROOT)
        state('adversarial-e2e')
        # Semantic arithmetic checks are proposals, never measured conversions.
        assert 132000+199000 == 331000
        assert 350000+199000 == 549000
        assert 220000+330000+199000 == 749000
        assert 550000+132000+199000 == 881000
        vendor = (ROOT/'docs/strategy/업체선택표.md').read_text(encoding='utf-8')
        for total in ['331,000원','549,000원','881,000원']:
            assert f'= {total}' in vendor, f'Missing documented sum: {total}'
        assert '등록 미확인으로 이 지원금에서 제외' in vendor
        assert 'VAT·사례비·수수료·매체비까지 포함한 총액 상한' in vendor
        assert round(14900/30) == 497
        assert round(14900/20000*60,1) == 44.7
        for rate, expected in [(0.05,800),(0.1,400),(0.2,200)]:
            assert 40/rate == expected
        log.append({'arithmetic':'PASS; documented sums checked, targets/sensitivity examples are not realized outcomes'})
        state('cleanup')
        state('complete',False)
        ok=True
    finally:
        (RUN/'qa-execution.json').write_text(json.dumps(log,ensure_ascii=False,indent=2),encoding='utf-8')
        cleared=json.loads(call(['node',str(CLI),'state','clear','--mode','ultraqa','--json']))
        if cleared.get('cleared') is not True:
            raise RuntimeError('OMX clear failed')
        after=json.loads(call(['node',str(CLI),'state','read','--mode','ultraqa','--json']))
        if after.get('exists') is not False:
            raise RuntimeError('OMX isolated state still exists')
        log.append({'state_after_clear':after})
        (RUN/'qa-execution.json').write_text(json.dumps(log,ensure_ascii=False,indent=2),encoding='utf-8')
    print('QA PASS' if ok else 'QA FAILED')
    print(json.dumps(after, ensure_ascii=False))

if __name__ == '__main__':
    main()
