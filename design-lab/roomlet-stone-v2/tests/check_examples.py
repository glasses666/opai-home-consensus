#!/usr/bin/env python3
"""Check every entrypoint in an isolated browser process.

Process isolation also releases software-GL/Chromium resources between cases.
Run the whole suite, or one case: python tests/check_examples.py --case preview.html
"""
from pathlib import Path
import argparse
import json
import os
import shutil
import subprocess
import sys
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CASES = {
    'index.html': (1000, 820, False),
    'example.html': (1200, 820, False),
    'minimal-example.html': (340, 380, False),
    'preview.html': (700, 820, True),
}
RESULT = ROOT / 'docs/entrypoints-qa.json'


def owned_html(name):
    text = (ROOT / name).read_text()
    text = text.replace('<link rel="stylesheet" href="src/styles.css">',
                        '<style>' + (ROOT / 'src/styles.css').read_text() + '</style>')
    for script in ['scene-data', 'renderer', 'viewer', 'exporters', 'app']:
        text = text.replace(f'<script src="src/{script}.js"></script>',
                            '<script>' + (ROOT / f'src/{script}.js').read_text() + '</script>')
    return text


def check(entry):
    width, height, reduced = CASES[entry]
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=os.environ.get('CHROMIUM') or shutil.which('chromium'),
            headless=not bool(os.environ.get('DISPLAY')),
            args=['--no-sandbox', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width': width, 'height': height},
                                device_scale_factor=1,
                                reduced_motion='reduce' if reduced else 'no-preference')
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content(owned_html(entry), wait_until='load', timeout=20000)
        page.wait_for_function('window.ROOMLET_READY===true||window.EXAMPLE_READY===true', timeout=20000)
        v = 'roomlet' if entry in ['index.html', 'preview.html'] else 'viewer'
        data = {'title': page.title(), 'viewport': [width, height], 'errors': errors,
                'glError': page.evaluate(v + '.renderer.gl.getError()')}
        if reduced:
            data['startsPaused'] = not page.evaluate(v + '.playing')
            page.locator('#play-toggle').click(timeout=5000)
            data['canOptIn'] = page.evaluate(v + '.playing')
            assert data['startsPaused'] and data['canOptIn']
        else:
            page.evaluate(v + '.seek(8.2)')
            page.wait_for_timeout(300)
            data['canvas'] = page.locator('canvas').bounding_box()
            if entry != 'index.html':
                name = 'example-webpage.png' if entry == 'example.html' else 'small-embed-340px.png'
                page.screenshot(path=str(ROOT / 'samples' / name), timeout=20000)
        assert not errors and data['glError'] == 0
        report = json.loads(RESULT.read_text()) if RESULT.exists() else {
            'method': 'Playwright Chromium; owned HTML in memory. Browser plugin unavailable; navigation URLs restricted in creation environment.',
            'entries': {}}
        report['entries'][entry] = data
        RESULT.write_text(json.dumps(report, ensure_ascii=False, indent=2))
        page.evaluate(v + '.dispose()')
        browser.close()
    print('Verified ' + entry, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', choices=CASES)
    args = parser.parse_args()
    if args.case:
        check(args.case)
    else:
        for entry in CASES:
            subprocess.run([sys.executable, str(Path(__file__).resolve()), '--case', entry],
                           check=True, timeout=65)
        print(RESULT.read_text())
