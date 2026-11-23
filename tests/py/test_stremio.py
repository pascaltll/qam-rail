import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "py_modules"))
import qam_desktop as q

def t_stremio():
    p = q.launch_plan({"key": "com.stremio.Stremio", "exec": ["flatpak", "run", "com.stremio.Stremio"]}, which=lambda x: "/usr/bin/" + x)
    assert p["argv"] == ["/usr/bin/flatpak", "run", "com.stremio.Stremio"]  # Stremio rechaza --fullscreen: no se le añade nada
    p2 = q.launch_plan({"key": "x", "exec": ["gedit"]}, which=lambda x: "/usr/bin/" + x)
    assert "--fullscreen" not in p2["argv"]

def t_autofs():
    assert q.auto_fullscreen_key("com.stremio.Stremio") == "F11"
    assert q.auto_fullscreen_key("org.mozilla.firefox", "Firefox") is None

def t_browser_key():
    assert q.is_browser_key("org.mozilla.firefox") and q.is_browser_key("com.microsoft.Edge")
    assert not q.is_browser_key("com.stremio.Stremio")

if __name__ == "__main__":
    t_stremio(); t_autofs(); t_browser_key(); print("TODO OK")
