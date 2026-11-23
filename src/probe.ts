// Sonda de rendimiento del QAM (solo observa; no modifica nada).
export interface Run {
  frames2_ms: number | null;
  nodes_added: number;
  longtasks_ms: Array<[number, number]>; // [inicio relativo, duracion]
}

export interface Summary {
  aperturas: number;
  frames2_mediana_ms: number | null;
  frames2_max_ms: number | null;
  tareas_largas_por_apertura: number | null; // solo primeros 1500 ms
  ms_bloqueados_por_apertura: number | null;
  peor_tarea_ms: number;
}

export interface Probe {
  runs(): Run[];
  summary(): Summary;
  reset(): void;
  mounted(): Array<{ id: string; nodos: number; visible: boolean }>;
  structure(): Array<Record<string, unknown>>;
  dispose(): void;
}

export function createProbe(doc: Document): Probe {
  const view = doc.defaultView!;
  const done: Run[] = [];
  let cur: (Run & { t0: number }) | null = null;
  const cleanups: Array<() => void> = [];

  const mo = new view.MutationObserver((m) => {
    if (cur) cur.nodes_added += m.reduce((n, r) => n + r.addedNodes.length, 0);
  });
  mo.observe(doc.documentElement, { childList: true, subtree: true });
  cleanups.push(() => mo.disconnect());

  try {
    const po = new (view as unknown as { PerformanceObserver: typeof PerformanceObserver }).PerformanceObserver((l) => {
      if (!cur) return;
      for (const e of l.getEntries()) {
        const rel = Math.round(e.startTime - cur.t0);
        if (rel <= 1500) cur.longtasks_ms.push([rel, Math.round(e.duration)]);
      }
    });
    po.observe({ entryTypes: ["longtask"] });
    cleanups.push(() => po.disconnect());
  } catch {
    /* longtask no disponible */
  }

  const onVis = () => {
    if (doc.visibilityState !== "visible") {
      cur = null; // con el QAM oculto no se atribuye nada a la apertura anterior
      return;
    }
    const run: Run & { t0: number } = { t0: view.performance.now(), frames2_ms: null, nodes_added: 0, longtasks_ms: [] };
    cur = run;
    view.requestAnimationFrame(() => view.requestAnimationFrame(() => {
      run.frames2_ms = Math.round(view.performance.now() - run.t0);
    }));
    view.setTimeout(() => {
      done.push({ frames2_ms: run.frames2_ms, nodes_added: run.nodes_added, longtasks_ms: run.longtasks_ms });
      if (done.length > 30) done.shift();
    }, 1500);
  };
  doc.addEventListener("visibilitychange", onVis);
  cleanups.push(() => doc.removeEventListener("visibilitychange", onVis));

  return {
    runs: () => done.slice(),
    reset: () => { done.length = 0; },
    summary: () => {
      const f = done.map((r) => r.frames2_ms).filter((x): x is number => x !== null).sort((a, b) => a - b);
      const tasks = done.map((r) => r.longtasks_ms.filter(([t]) => t >= 0));
      const count = tasks.reduce((n, t) => n + t.length, 0);
      const ms = tasks.reduce((n, t) => n + t.reduce((m, [, d]) => m + d, 0), 0);
      const worst = tasks.reduce((m, t) => Math.max(m, ...t.map(([, d]) => d), 0), 0);
      const n = done.length;
      return {
        aperturas: n,
        frames2_mediana_ms: f.length ? f[Math.floor(f.length / 2)] : null,
        frames2_max_ms: f.length ? f[f.length - 1] : null,
        tareas_largas_por_apertura: n ? Math.round((count / n) * 10) / 10 : null,
        ms_bloqueados_por_apertura: n ? Math.round(ms / n) : null,
        peor_tarea_ms: worst,
      };
    },
    mounted: () =>
      Array.from(doc.querySelectorAll<HTMLElement>('[id^="quickaccess_content_"]'), (e) => ({
        id: e.id,
        nodos: e.querySelectorAll("*").length,
        visible: e.getClientRects().length > 0 && view.getComputedStyle(e).display !== "none",
      })),
    structure: () => {
      const out: Array<Record<string, unknown>> = [];
      for (let e: Element | null = doc.querySelector('[id^="quickaccess_tab_"]'); e && e !== (doc as unknown as Element); e = e.parentElement) {
        const c = view.getComputedStyle(e);
        const b = e.getBoundingClientRect();
        out.push({
          tag: e.tagName, id: e.id, cls: String(e.className).slice(0, 50), disp: c.display, dir: c.flexDirection,
          pos: c.position, l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), hijos: e.children.length,
        });
      }
      return out;
    },
    dispose: () => cleanups.splice(0).forEach((fn) => fn()),
  };
}
