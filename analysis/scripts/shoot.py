"""Open the prototype headless, click each tab, collect console errors, save screenshots."""
import sys, os
from playwright.sync_api import sync_playwright
src = os.path.abspath(sys.argv[1]); outdir = sys.argv[2]; theme = sys.argv[3] if len(sys.argv) > 3 else "light"
os.makedirs(outdir, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1360, "height": 1000}, color_scheme=theme)
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + src)
    pg.wait_for_timeout(800)
    for i, t in enumerate(["flow", "map", "stations", "sensors", "comms", "budget"]):
        pg.click(f"#tab-{t}")
        if t == "map":
            pg.click("#viewSeg button[data-v=cov]")
        if t == "budget":
            pg.click("#failSeg button[data-v=hub]")
        pg.wait_for_timeout(400)
        pg.screenshot(path=f"{outdir}/{i+1}_{t}_{theme}.png", full_page=True)
    print("errors:", [e for e in errs if "fonts.g" not in e][:10])
    b.close()
