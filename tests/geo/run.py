import json, sys, subprocess, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(["python3","-m","http.server","8765","-d","dist"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = b.new_page(viewport={"width":902,"height":508})
        pg.on("console", lambda m: print("console:", m.text[:200]) if m.type=="error" else None)
        pg.on("pageerror", lambda e: print("pageerror:", str(e)[:300]))
        pg.goto("http://localhost:8765/index.html"); pg.wait_for_timeout(500)
        mode = sys.argv[1] if len(sys.argv)>1 else ""
        if mode:
            pg.evaluate("globalThis.__partial = %s" % ("true" if mode=="partial" else "false")); pg.evaluate("createRootOnce()") if False else None; pg.evaluate("window.mountOnly()"); print(pg.evaluate("window.probeColor()")); raise SystemExit
        out = pg.evaluate("window.run()")
        json.dump(out, open("out.json","w"), ensure_ascii=False, indent=1)
        for k,v in out.items():
            print("==",k, v["n"], "items"); print(" rows:"); [print("  ",r) for r in v["rows"]]
            print(" down:", " > ".join(v["down"])); print(" up:", " > ".join(v["up"]))
        b.close()
finally: srv.kill()
