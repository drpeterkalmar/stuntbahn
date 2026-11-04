# n44: gemeinsamer Helfer – warten, bis das Menü steht (oder Zeitlimit)
import time, json
def warte(pg, T=45):
    t0 = time.time(); last = None; verlauf = []
    while time.time() - t0 < T:
        try: st = pg.evaluate("() => ({ t: (document.querySelector('#loading p')||{}).textContent, show: !!document.querySelector('#loading.show'), ready: !!(window.__app && window.__app.ready), sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller), err: (window.__errors||[]).slice(0,3) })")
        except Exception as e: st = {'t': 'eval ' + str(e)[:60]}
        k = json.dumps(st, ensure_ascii=False)
        if k != last: verlauf.append(f'{time.time()-t0:5.1f}s {k}'); last = k
        if st.get('ready') and not st.get('show'): return True, time.time() - t0, verlauf
        time.sleep(0.25)
    return False, time.time() - t0, verlauf
