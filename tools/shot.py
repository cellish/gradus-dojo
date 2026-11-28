#!/usr/bin/env python3
"""Take screenshots of the practice view at 1280px and 390px, light and dark.

Usage: python3 tools/shot.py [--sp N] [--below] [--view practice|drill|review|history|learn]
Images are written to tools/out/. Needs Playwright (Python) with Chromium.
"""
import argparse, http.server, os, socketserver, sys, threading, functools

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tools', 'out')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sp', type=int, default=1)
    ap.add_argument('--below', action='store_true')
    ap.add_argument('--view', default='practice')
    ap.add_argument('--port', type=int, default=8791)
    a = ap.parse_args()
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('Playwright (Python) が見つかりません。pip install playwright のうえで実行してください。')
        return 0
    os.makedirs(OUT, exist_ok=True)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    handler = functools.partial(Quiet, directory=ROOT)
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', a.port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    errors = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            for w, h in ((1280, 1000), (390, 844)):
                for scheme in ('light', 'dark'):
                    pg = b.new_page(viewport={'width': w, 'height': h}, color_scheme=scheme)
                    pg.on('pageerror', lambda e: errors.append(str(e)))
                    pg.goto(f'http://127.0.0.1:{a.port}/index.html')
                    pg.wait_for_timeout(1200)
                    if a.view != 'practice':
                        pg.click(f'[data-view="{a.view}"]')
                        pg.wait_for_timeout(800)
                    else:
                        pg.click(f'#spSeg button[data-sp="{a.sp}"]')
                        pg.click('#posBelow' if a.below else '#posAbove')
                        pg.wait_for_timeout(500)
                    name = f'{a.view}-sp{a.sp}{"-below" if a.below else ""}-{w}-{scheme}.png'
                    pg.screenshot(path=os.path.join(OUT, name), full_page=True)
                    print('saved', os.path.join('tools', 'out', name))
                    pg.close()
            b.close()
    finally:
        srv.shutdown()
    if errors:
        print('page errors:'); [print(' ', e) for e in errors]
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
