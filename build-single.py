#!/usr/bin/env python3
"""Bundle index.html + styles.css + app.js + icon.svg into one self-contained file:
dist/miles-apart.html (handy for sharing / opening without a server)."""
import base64, pathlib, re

root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text()
css = (root / 'styles.css').read_text()
js = (root / 'app.js').read_text()
icon = 'data:image/svg+xml;base64,' + base64.b64encode((root / 'icon.svg').read_bytes()).decode()

# No sw.js / manifest sit next to a single file, so drop the service worker registration
js = re.sub(r"\n  if \('serviceWorker' in navigator.*?\n  \}\n", "\n", js, flags=re.S)
assert 'serviceWorker' not in js

html = html.replace('<link rel="stylesheet" href="styles.css" />', f'<style>\n{css}\n</style>')
html = html.replace('<script src="app.js"></script>', f'<script>\n{js}\n</script>')
# No sw.js / manifest next to a single file, so drop the service worker + manifest
js = re.sub(r"\n  if \('serviceWorker' in navigator.*?\n  \}\n", "\n", js, flags=re.S)
assert 'serviceWorker' not in js
html = html.replace('<script src="app.js"></script>', f'<script>\n{js}\n</script>')
html = html.replace('<link rel="manifest" href="manifest.webmanifest" />\n', '')
html = html.replace('href="icon.svg"', f'href="{icon}"')
assert 'styles.css' not in html and 'src="app.js"' not in html and 'icon.svg' not in html

out = root / 'dist' / 'miles-apart.html'
out.parent.mkdir(exist_ok=True)
out.write_text(html)
print(f'wrote {out} ({out.stat().st_size / 1024:.1f} KB)')
