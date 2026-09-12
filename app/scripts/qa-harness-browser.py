#!/usr/bin/env python3
"""Actual homepage -> product -> rendered 3D -> undo/retain/save/reopen.
Requires local dev:experience with VITE_OPAI_QA_PROBE=1 and the user's existing
DeepSeek environment. No credentials, request headers or project creation body
are read/exported. No mock provider or direct scene writes are used.
"""
import argparse
import asyncio
import json
import math
import os
import shutil
from pathlib import Path
from urllib.parse import urlparse
from datetime import datetime, timezone

PROMPT = '回到家还是像坐在工位，我想放松一点，但书桌要留下，先别加大件。'
ANSWER = '我更在意一进门先注意到什么，希望先感觉这是个休息的地方。'


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    path.chmod(0o600)


def parse_turn(text):
    try:
        body = json.loads(text)
        return body
    except json.JSONDecodeError:
        frames = [json.loads(line) for line in text.splitlines() if line.strip()]
        final = next((f for f in reversed(frames) if f.get('type') in ['result', 'error']), {})
        return final.get('data', final)


def poses(snapshot):
    return {o['id']: o for o in snapshot['objects'] if o['roomId'] == 'room-flex'}


def mesh_signature(obj):
    # Ignores Three UUIDs (which legitimately change on a reloaded asset).
    return {'matrixWorld': obj.get('matrixWorld'), 'meshes': [
        {'matrixWorld': m['matrixWorld'], 'materials': m['materials'], 'vertices': m['vertices']}
        for m in obj.get('meshes', [])]}


def same_numbers(a, b, tolerance=1e-5):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return math.isclose(a, b, abs_tol=tolerance, rel_tol=tolerance)
    if type(a) != type(b):
        return False
    if isinstance(a, dict):
        return a.keys() == b.keys() and all(same_numbers(a[k], b[k], tolerance) for k in a)
    if isinstance(a, list):
        return len(a) == len(b) and all(same_numbers(x, y, tolerance) for x, y in zip(a, b))
    return a == b


async def run_viewport(browser, args, label, viewport):
    folder = args.out / label
    folder.mkdir(parents=True, exist_ok=True)
    report = {'viewport': viewport, 'provider': 'deepseek', 'evidenceType': 'LIVE_PRODUCT_BROWSER',
              'status': 'running', 'url': args.url, 'checks': {}, 'errors': [], 'warnings': [],
              'failedResources': [], 'turns': [], 'completeLedgerAcceptance': False}
    context = await browser.new_context(viewport=viewport, is_mobile=label == 'mobile', has_touch=label == 'mobile', device_scale_factor=1)
    page = await context.new_page()
    page.set_default_timeout(30000)
    page.on('pageerror', lambda error: report['errors'].append(str(error)))
    page.on('console', lambda msg: report['warnings' if msg.type == 'warning' else 'errors'].append(msg.text)
            if msg.type in ['warning', 'error'] else None)
    page.on('requestfailed', lambda req: report['failedResources'].append({'url': req.url.split('?')[0], 'failure': req.failure}))

    async def block_external_writes(route):
        if route.request.method != 'GET':
            report['errors'].append('FORBIDDEN_FAMILY_WRITE_ATTEMPT')
            await route.abort()
        else:
            await route.continue_()
    await page.route('**/api/experience/**/discussions**', block_external_writes)

    async def snapshot():
        await page.wait_for_function("""() => {
          const s=window.__OPAI_QA_READ_SCENE__?.();
          return s?.syncState==='synced' && ['object-flex-desk','object-flex-bed'].every(id=>{
            const o=s.objects.find(o=>o.id===id);return o?.assetSettled && o.meshes.some(m=>m.vertices>0);
          });
        }""", timeout=60000)
        # Studio finish application is polled at 4Hz; wait for a stable actual read.
        old = await page.evaluate('window.__OPAI_QA_READ_SCENE__()')
        for _ in range(30):
            await page.wait_for_timeout(250)
            new = await page.evaluate('window.__OPAI_QA_READ_SCENE__()')
            if same_numbers(poses(old), poses(new)):
                return new
            old = new
        raise AssertionError('RENDERED_OBJECTS_DID_NOT_SETTLE')

    async def turn(text):
        if len(report['turns']) >= 4:
            raise AssertionError('BROWSER_TURN_BUDGET')
        await page.get_by_label('告诉 Agent 你的设计需求', exact=True).fill(text)
        async with page.expect_response(lambda r: r.request.method == 'POST' and r.url.split('?')[0].endswith('/turn'), timeout=175000) as result:
            await page.get_by_label('发送给 Agent', exact=True).click()
        response = await result.value
        body = parse_turn(await response.text())
        trace = body.get('trace', {})
        # Raw provider trace includes actual model/parameters/usage, but no credentials.
        report['turns'].append({'input': text, 'httpStatus': response.status, 'trace': trace})
        write(folder / 'turns.json', report['turns'])
        if body.get('error'):
            raise AssertionError(body['error'])
        if trace.get('provider') != 'deepseek' or trace.get('model') not in ['deepseek-v4-flash', 'deepseek-flash']:
            raise AssertionError('REAL_DEEPSEEK_MODEL_NOT_VERIFIED')
        if trace.get('mode') == 'failed':
            raise AssertionError('DESIGN_CANDIDATE_NOT_ACCEPTED')
        return trace

    try:
        await page.goto(args.url, wait_until='domcontentloaded', timeout=30000)
        await page.get_by_role('link', name='开始我的设计', exact=True).click()
        await page.get_by_label('告诉 Agent 你的设计需求', exact=True).wait_for()
        report['checks']['homepage_to_new_project'] = True
        report['applicationContract'] = await page.evaluate("fetch('/api/experience/health').then(r=>r.json())")
        report['projectUrl'] = page.url
        report['title'] = await page.title()
        await page.get_by_label('前往房间', exact=True).select_option('room-flex')
        await page.locator('.pascal-view-switch').get_by_role('button', name='3D', exact=True).click()
        baseline = await snapshot()
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(folder / '01-before.png'), full_page=True)
        write(folder / '01-rendered-before.json', baseline)
        trace = await turn(PROMPT)
        if trace.get('mode') == 'clarify':
            trace = await turn(ANSWER)
        if trace.get('mode') != 'execute':
            raise AssertionError('EXPECTED_PREVIEW_AFTER_AT_MOST_ONE_CLARIFICATION')
        await page.get_by_role('button', name='撤销预览', exact=True).wait_for()
        preview = await snapshot()
        changed = [key for key, value in poses(preview).items()
                   if not same_numbers(value.get('matrixWorld'), poses(baseline)[key].get('matrixWorld'))]
        if not any(key in changed for key in ['object-flex-desk', 'object-flex-bed']):
            raise AssertionError('NO_ACTUAL_RENDERED_SPATIAL_CHANGE')
        report['checks']['actual_rendered_pose_change'] = changed
        write(folder / '02-rendered-preview.json', preview)
        await page.screenshot(path=str(folder / '02-preview.png'), full_page=True)
        await page.get_by_role('button', name='查看真实差异', exact=True).click()
        diff = page.get_by_label('版本差异', exact=True)
        await diff.wait_for()
        text = await diff.inner_text()
        if 'object-' in text or 'surface-' in text:
            raise AssertionError('INTERNAL_ID_LEAK_IN_DIFF')
        report['checks']['readable_difference_list'] = text
        await page.screenshot(path=str(folder / '03-readable-diffs.png'), full_page=True)
        await page.get_by_role('button', name='关闭版本与影响', exact=True).click()
        await page.get_by_role('button', name='撤销预览', exact=True).click()
        undone = await snapshot()
        if not all(same_numbers(mesh_signature(value), mesh_signature(poses(undone)[key])) for key, value in poses(baseline).items()):
            raise AssertionError('UNDO_RENDERED_STATE_MISMATCH')
        report['checks']['undo_restores_actual_meshes'] = True
        await page.screenshot(path=str(folder / '04-undone.png'), full_page=True)
        trace = await turn(PROMPT + ' 我更在意进门的第一眼。')
        if trace.get('mode') != 'execute':
            raise AssertionError('SECOND_PREVIEW_NOT_PRODUCED')
        kept = await snapshot()
        await page.get_by_role('button', name='保留这次调整', exact=True).click()
        await page.get_by_role('button', name='保存方案', exact=True).click()
        await page.get_by_role('button', name='V2 · 已保存', exact=True).wait_for()
        await page.screenshot(path=str(folder / '05-saved-v2.png'), full_page=True)
        await page.reload(wait_until='domcontentloaded')
        await page.get_by_label('告诉 Agent 你的设计需求', exact=True).wait_for()
        await page.get_by_label('前往房间', exact=True).select_option('room-flex')
        await page.locator('.pascal-view-switch').get_by_role('button', name='3D', exact=True).click()
        reopened = await snapshot()
        if not all(same_numbers(mesh_signature(value), mesh_signature(poses(reopened)[key])) for key, value in poses(kept).items()):
            raise AssertionError('SAVED_REOPEN_RENDERED_STATE_MISMATCH')
        await page.get_by_role('button', name='V2 · 已保存', exact=True).wait_for()
        report['checks']['saved_v2_reopens_actual_meshes'] = True
        write(folder / '06-rendered-reopened.json', reopened)
        await page.screenshot(path=str(folder / '06-reopened.png'), full_page=True)
        report['checks']['no_framework_overlay'] = await page.locator('vite-error-overlay').count() == 0
        report['checks']['not_blank'] = len(await page.locator('body').inner_text()) > 100
        report['checks']['no_horizontal_overflow'] = await page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2')
        if report['errors'] or report['failedResources'] or not all(report['checks'].values()):
            raise AssertionError('BROWSER_ERRORS_OR_LAYOUT_FAILURES')
        report['status'] = 'passed_mechanics_requires_human_visual_review'
        report['userDesignAcceptance'] = 'not_assessed'
    except Exception as error:
        report['status'] = 'blocked' if any(code in str(error) for code in ['ERR_CONNECTION_REFUSED', 'ERR_BLOCKED_BY_ADMINISTRATOR', 'Executable doesn’t exist']) else 'failed'
        report['error'] = str(error)
        if report['checks'].get('homepage_to_new_project'):
            await page.screenshot(path=str(folder / 'failure.png'), full_page=True)
    finally:
        write(folder / 'report.json', report)
        await context.close()
    return report


async def main(args):
    parsed = urlparse(args.url)
    if parsed.scheme != 'http' or parsed.hostname not in ['127.0.0.1', 'localhost']:
        raise ValueError('LOCAL_BROWSER_URL_REQUIRED: no production browser writes')
    args.out.mkdir(parents=True, exist_ok=True)
    try:
        from playwright.async_api import async_playwright
        executable = args.chromium or shutil.which('chromium') or shutil.which('google-chrome')
        mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        executable = executable or (mac if Path(mac).exists() else None)
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, executable_path=executable,
                args=['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
            results = []
            for name, viewport in [('desktop', {'width': 1440, 'height': 1000}), ('mobile', {'width': 390, 'height': 844})]:
                if args.viewport not in ['both', name]:
                    continue
                results.append(await run_viewport(browser, args, name, viewport))
            await browser.close()
        summary = {'createdAt': datetime.now(timezone.utc).isoformat(), 'browser': 'Chromium / software WebGL',
                   'browserPlugin': 'not available; regular Playwright',
                   'status': 'passed_mechanics' if all(r['status'].startswith('passed') for r in results) else 'blocked_or_failed',
                   'viewports': [{'viewport': r['viewport'], 'status': r['status'], 'error': r.get('error')} for r in results],
                   'completeLedgerAcceptance': False, 'humanVisualReviewStillRequired': True}
    except Exception as error:
        summary = {'status': 'blocked', 'error': str(error), 'completeLedgerAcceptance': False}
    write(args.out / 'summary.json', summary)
    print(json.dumps({'output': str(args.out), **summary}, ensure_ascii=False, indent=2))
    return 0 if summary['status'] == 'passed_mechanics' else 2


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:5180/')
    parser.add_argument('--out', type=Path, default=Path('.data/harness-browser') / datetime.now().strftime('%Y%m%d-%H%M%S'))
    parser.add_argument('--chromium', default=os.environ.get('CHROMIUM_PATH'))
    parser.add_argument('--viewport', choices=['both', 'desktop', 'mobile'], default='both')
    raise SystemExit(asyncio.run(main(parser.parse_args())))
