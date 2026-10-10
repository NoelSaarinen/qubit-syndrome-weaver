import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "QEC Surface Code Simulator" },
      { name: "description", content: "Interactive quantum error correction surface code visualizer with syndromes and MWPM matching." },
      { property: "og:title", content: "QEC Surface Code Simulator" },
      { property: "og:description", content: "Inject bit-flip errors, watch syndromes light up, and see MWPM-style correction." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const N = 7;
const CELL = 64;
const isData = (r: number, c: number) => (r + c) % 2 === 0;
const key = (r: number, c: number) => `${r},${c}`;
type P = { r: number; c: number };

function neighbors(r: number, c: number): P[] {
  return [
    { r: r - 1, c }, { r: r + 1, c }, { r, c: c - 1 }, { r, c: c + 1 },
  ].filter((p) => p.r >= 0 && p.r < N && p.c >= 0 && p.c < N);
}

// Greedy approximation of MWPM: repeatedly pair the globally closest syndromes;
// leftovers (odd count) match to the nearest boundary.
function match(lit: P[]) {
  const dist = (a: P, b: P) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
  const edges: { a: number; b: number; d: number }[] = [];
  for (let i = 0; i < lit.length; i++)
    for (let j = i + 1; j < lit.length; j++) edges.push({ a: i, b: j, d: dist(lit[i]!, lit[j]!) });
  edges.sort((x, y) => x.d - y.d);
  const used = new Set<number>();
  const pairs: [P, P][] = [];
  for (const e of edges) {
    if (used.has(e.a) || used.has(e.b)) continue;
    used.add(e.a); used.add(e.b);
    pairs.push([lit[e.a]!, lit[e.b]!]);
  }
  const boundary: [P, P][] = [];
  lit.forEach((p, i) => {
    if (used.has(i)) return;
    const opts: P[] = [{ r: -0.6, c: p.c }, { r: N - 0.4, c: p.c }, { r: p.r, c: -0.6 }, { r: p.r, c: N - 0.4 }];
    opts.sort((a, b) => dist(a, p) - dist(b, p));
    boundary.push([p, opts[0]!]);
  });
  return { pairs, boundary };
}

// Weighted Dijkstra over the lattice: stepping onto an errored data qubit is cheap,
// so shortest paths follow the physical error chain.
function dijkstra(src: P, errors: Set<string>) {
  const cost = (p: P) => (isData(p.r, p.c) ? (errors.has(key(p.r, p.c)) ? 0.1 : 1) : 0.05);
  const dist = new Map<string, number>([[key(src.r, src.c), 0]]);
  const prev = new Map<string, P>();
  const done = new Set<string>();
  const all: P[] = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) all.push({ r, c });
  while (true) {
    let best: P | null = null, bd = Infinity;
    for (const p of all) {
      const k = key(p.r, p.c), d = dist.get(k);
      if (!done.has(k) && d !== undefined && d < bd) { bd = d; best = p; }
    }
    if (!best) break;
    done.add(key(best.r, best.c));
    for (const n of neighbors(best.r, best.c)) {
      const nk = key(n.r, n.c), nd = bd + cost(n);
      if (nd < (dist.get(nk) ?? Infinity)) { dist.set(nk, nd); prev.set(nk, best); }
    }
  }
  const pathTo = (t: P) => {
    const out: P[] = [t];
    let cur = t;
    while (key(cur.r, cur.c) !== key(src.r, src.c)) { const p = prev.get(key(cur.r, cur.c)); if (!p) break; out.unshift(p); cur = p; }
    return out;
  };
  return { dist, pathTo };
}

function smartMatch(lit: P[], errors: Set<string>) {
  const runs = lit.map((p) => dijkstra(p, errors));
  const edges: { a: number; b: number; d: number }[] = [];
  for (let i = 0; i < lit.length; i++)
    for (let j = i + 1; j < lit.length; j++)
      edges.push({ a: i, b: j, d: runs[i]!.dist.get(key(lit[j]!.r, lit[j]!.c)) ?? Infinity });
  // boundary option per syndrome: cheapest edge cell
  const bnd = lit.map((_, i) => {
    let best: P = lit[i]!, bd = Infinity;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (r !== 0 && c !== 0 && r !== N - 1 && c !== N - 1) continue;
      const d = runs[i]!.dist.get(key(r, c)) ?? Infinity;
      if (d < bd) { bd = d; best = { r, c }; }
    }
    return { cell: best, d: bd + 0.5 };
  });
  edges.sort((x, y) => x.d - y.d);
  const used = new Set<number>();
  const paths: P[][] = [];
  const boundary: P[][] = [];
  for (const e of edges) {
    if (used.has(e.a) || used.has(e.b)) continue;
    if (e.d > bnd[e.a]!.d + bnd[e.b]!.d) continue; // cheaper to send both to boundary
    used.add(e.a); used.add(e.b);
    paths.push(runs[e.a]!.pathTo(lit[e.b]!));
  }
  lit.forEach((_, i) => {
    if (used.has(i)) return;
    const cell = bnd[i]!.cell;
    const path = runs[i]!.pathTo(cell);
    const off: P = cell.r === 0 ? { r: -0.6, c: cell.c } : cell.r === N - 1 ? { r: N - 0.4, c: cell.c } : cell.c === 0 ? { r: cell.r, c: -0.6 } : { r: cell.r, c: N - 0.4 };
    boundary.push([...path, off]);
  });
  return { paths, boundary };
}

function Index() {
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [rate, setRate] = useState(8);
  const [showCorrection, setShowCorrection] = useState(false);
  const [smart, setSmart] = useState(false);

  const toggle = (r: number, c: number) =>
    setErrors((prev) => {
      const n = new Set(prev);
      const k = key(r, c);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  const simulate = () => {
    const n = new Set<string>();
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++)
        if (isData(r, c) && Math.random() < rate / 100) n.add(key(r, c));
    setErrors(n);
  };

  const lit = useMemo(() => {
    const out: P[] = [];
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++)
        if (!isData(r, c)) {
          const count = neighbors(r, c).filter((p) => errors.has(key(p.r, p.c))).length;
          if (count % 2 === 1) out.push({ r, c });
        }
    return out;
  }, [errors]);
  const litSet = useMemo(() => new Set(lit.map((p) => key(p.r, p.c))), [lit]);
  const { pairs, boundary } = useMemo(() => match(lit), [lit]);

  const size = N * CELL;
  const cx = (p: P) => p.c * CELL + CELL / 2;
  const cy = (p: P) => p.r * CELL + CELL / 2;

  return (
    <div className="min-h-screen bg-grid-glow text-foreground">
      <header className="border-b border-border/60 px-6 py-5 backdrop-blur">
        <h1 className="font-mono text-2xl font-bold tracking-tight">
          <span className="text-primary">QEC</span> Surface Code Simulator
        </h1>
        <p className="text-sm text-muted-foreground">Click data qubits to inject X-errors (bit-flips).</p>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col items-center gap-8 p-6 lg:flex-row lg:items-start lg:justify-center">
        <div className="rounded-2xl border border-border bg-card/60 p-6 shadow-2xl">
          <div className="relative" style={{ width: size, height: size }}>
            {/* lattice lines */}
            <svg className="pointer-events-none absolute inset-0" width={size} height={size}>
              {Array.from({ length: N }).map((_, i) => (
                <g key={i} className="stroke-border" strokeWidth={1}>
                  <line x1={CELL / 2} x2={size - CELL / 2} y1={i * CELL + CELL / 2} y2={i * CELL + CELL / 2} />
                  <line y1={CELL / 2} y2={size - CELL / 2} x1={i * CELL + CELL / 2} x2={i * CELL + CELL / 2} />
                </g>
              ))}
            </svg>

            {Array.from({ length: N * N }).map((_, i) => {
              const r = Math.floor(i / N), c = i % N;
              const style = { left: c * CELL, top: r * CELL, width: CELL, height: CELL };
              if (isData(r, c)) {
                const err = errors.has(key(r, c));
                return (
                  <div key={i} className="absolute flex items-center justify-center" style={style}>
                    <button
                      onClick={() => toggle(r, c)}
                      aria-label={`Data qubit ${r},${c}`}
                      className={`h-9 w-9 rounded-full transition-all duration-300 hover:scale-110 ${
                        err ? "bg-x-error glow-error scale-110" : "bg-data-qubit"
                      }`}
                    />
                  </div>
                );
              }
              const on = litSet.has(key(r, c));
              return (
                <div key={i} className="absolute flex items-center justify-center" style={style}>
                  <div
                    className={`h-7 w-7 rounded-sm transition-all duration-300 ${
                      on ? "bg-syndrome glow-syndrome rotate-45" : "bg-measure-qubit/80"
                    }`}
                  />
                </div>
              );
            })}

            {showCorrection && (
              <svg className="pointer-events-none absolute inset-0 overflow-visible" width={size} height={size}>
                <defs>
                  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="4" result="b" />
                    <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                {pairs.map(([a, b], i) => (
                  <line key={`p${i}`} x1={cx(a)} y1={cy(a)} x2={cx(b)} y2={cy(b)}
                    className="stroke-match animate-in fade-in duration-500" strokeWidth={4} strokeLinecap="round" filter="url(#glow)" />
                ))}
                {boundary.map(([a, b], i) => (
                  <line key={`b${i}`} x1={cx(a)} y1={cy(a)} x2={cx(b)} y2={cy(b)}
                    className="stroke-match animate-in fade-in duration-500" strokeWidth={3} strokeDasharray="6 6" strokeLinecap="round" filter="url(#glow)" />
                ))}
              </svg>
            )}
          </div>
        </div>

        <aside className="w-full max-w-sm space-y-6 rounded-2xl border border-border bg-card/60 p-6 font-mono">
          <h2 className="text-sm uppercase tracking-widest text-muted-foreground">Control Panel</h2>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Noise Injection</span>
              <span className="text-primary">{rate}%</span>
            </div>
            <Slider min={0} max={20} step={1} value={[rate]} onValueChange={(v) => setRate(v[0] ?? 0)} />
            <Button className="w-full" onClick={simulate}>Simulate Noise</Button>
          </div>
          <label className="flex items-center justify-between text-sm">
            Show Error Correction
            <Switch checked={showCorrection} onCheckedChange={setShowCorrection} />
          </label>
          <Button variant="outline" className="w-full" onClick={() => setErrors(new Set())}>Reset</Button>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-secondary p-3"><div className="text-muted-foreground">X-Errors</div><div className="text-xl text-x-error">{errors.size}</div></div>
            <div className="rounded-lg bg-secondary p-3"><div className="text-muted-foreground">Syndromes</div><div className="text-xl text-syndrome">{lit.length}</div></div>
          </div>

          <ul className="space-y-2 text-xs text-muted-foreground">
            <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-data-qubit" /> Data qubit</li>
            <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-x-error" /> X-error</li>
            <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-md bg-measure-qubit" /> Measure qubit</li>
            <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-md bg-syndrome" /> Odd parity syndrome</li>
            <li className="flex items-center gap-2"><span className="h-0.5 w-4 bg-match" /> MWPM pair (dashed = boundary)</li>
          </ul>
        </aside>
      </main>
    </div>
  );
}
