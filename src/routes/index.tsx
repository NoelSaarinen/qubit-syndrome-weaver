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

// Smart decoder: Dijkstra on the graph of Measure Qubits. Two measure qubits are
// connected through each shared data qubit; crossing an errored data qubit costs 1,
// a clean one costs 10. Border data qubits also connect to a virtual BOUNDARY node.
const BASE = 10, ERR = 1, BOUNDARY = "B";
type Step = { to: string; via: P; cost: number };

function buildGraph(errors: Set<string>) {
  const g = new Map<string, Step[]>();
  const add = (a: string, s: Step) => { if (!g.has(a)) g.set(a, []); g.get(a)!.push(s); };
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (!isData(r, c)) continue;
    const cost = errors.has(key(r, c)) ? ERR : BASE;
    const ms = neighbors(r, c);
    for (const a of ms) for (const b of ms) if (a !== b) add(key(a.r, a.c), { to: key(b.r, b.c), via: { r, c }, cost });
    if (ms.length < 4) for (const a of ms) add(key(a.r, a.c), { to: BOUNDARY, via: { r, c }, cost });
  }
  return g;
}

function shortest(src: string, g: Map<string, Step[]>) {
  const dist = new Map<string, number>([[src, 0]]);
  const prev = new Map<string, { from: string; via: P }>();
  const done = new Set<string>();
  while (true) {
    let u: string | null = null, bd = Infinity;
    for (const [k, d] of dist) if (!done.has(k) && d < bd) { bd = d; u = k; }
    if (u === null) break;
    done.add(u);
    if (u === BOUNDARY) continue; // boundary is a sink
    for (const s of g.get(u) ?? []) {
      const nd = bd + s.cost;
      if (nd < (dist.get(s.to) ?? Infinity)) { dist.set(s.to, nd); prev.set(s.to, { from: u, via: s.via }); }
    }
  }
  const toP = (k: string): P => { const [r, c] = k.split(",").map(Number); return { r: r!, c: c! }; };
  const pathTo = (t: string): P[] => {
    const pts: P[] = [];
    let cur = t;
    while (cur !== src) {
      const p = prev.get(cur);
      if (!p) break;
      if (cur === BOUNDARY) {
        const v = p.via, m = toP(p.from);
        pts.unshift({ r: v.r + (v.r - m.r) * 0.6, c: v.c + (v.c - m.c) * 0.6 });
      } else pts.unshift(toP(cur));
      // route through the data qubit along grid lines (L-shape if diagonal neighbours)
      const m = toP(p.from), v = p.via;
      pts.unshift(v);
      if (m.r !== v.r && m.c !== v.c) pts.unshift({ r: m.r, c: v.c });
      cur = p.from;
    }
    pts.unshift(toP(src));
    return pts;
  };
  return { dist, pathTo };
}

function smartMatch(lit: P[], errors: Set<string>) {
  const g = buildGraph(errors);
  const ks = lit.map((p) => key(p.r, p.c));
  const runs = ks.map((k) => shortest(k, g));
  const n = lit.length;
  const pd = (i: number, j: number) => runs[i]!.dist.get(ks[j]!) ?? Infinity;
  const bd = (i: number) => runs[i]!.dist.get(BOUNDARY) ?? Infinity;
  // choice[i] = j (pair) or -1 (boundary)
  const choice = new Array<number>(n).fill(-1);
  if (n <= 18) {
    // exact minimum-weight perfect matching (with boundary) via bitmask DP
    const memo = new Map<number, number>();
    const pick = new Map<number, number>();
    const solve = (mask: number): number => {
      if (mask === (1 << n) - 1) return 0;
      const m = memo.get(mask); if (m !== undefined) return m;
      let i = 0; while (mask & (1 << i)) i++;
      let best = bd(i) + solve(mask | (1 << i)), bj = -1;
      for (let j = i + 1; j < n; j++) if (!(mask & (1 << j))) {
        const v = pd(i, j) + solve(mask | (1 << i) | (1 << j));
        if (v < best) { best = v; bj = j; }
      }
      memo.set(mask, best); pick.set(mask, bj);
      return best;
    };
    solve(0);
    let mask = 0;
    while (mask !== (1 << n) - 1) {
      let i = 0; while (mask & (1 << i)) i++;
      const j = pick.get(mask)!;
      choice[i] = j; if (j >= 0) choice[j] = i;
      mask |= (1 << i) | (j >= 0 ? 1 << j : 0);
    }
  } else {
    const edges: { a: number; b: number; d: number }[] = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) edges.push({ a: i, b: j, d: pd(i, j) });
    edges.sort((x, y) => x.d - y.d);
    const used = new Set<number>();
    for (const e of edges) {
      if (used.has(e.a) || used.has(e.b) || e.d > bd(e.a) + bd(e.b)) continue;
      used.add(e.a); used.add(e.b); choice[e.a] = e.b; choice[e.b] = e.a;
    }
  }
  const paths: P[][] = [], boundary: P[][] = [];
  for (let i = 0; i < n; i++) {
    const j = choice[i]!;
    if (j === -1) boundary.push(runs[i]!.pathTo(BOUNDARY));
    else if (j > i) paths.push(runs[i]!.pathTo(ks[j]!));
  }
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
  const smartResult = useMemo(() => smartMatch(lit, errors), [lit, errors]);

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
                {smart ? (
                  <>
                    {smartResult.paths.map((path, i) => (
                      <polyline key={`sp${i}`} points={path.map((p) => `${cx(p)},${cy(p)}`).join(" ")} fill="none"
                        className="stroke-green-400 drop-shadow-[0_0_6px_rgb(74_222_128)] animate-in fade-in duration-500"
                        strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />
                    ))}
                    {smartResult.boundary.map((path, i) => (
                      <polyline key={`sb${i}`} points={path.map((p) => `${cx(p)},${cy(p)}`).join(" ")} fill="none"
                        className="stroke-green-400 drop-shadow-[0_0_6px_rgb(74_222_128)] animate-in fade-in duration-500"
                        strokeWidth={5} strokeDasharray="8 6" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />
                    ))}
                  </>
                ) : (
                  <>
                    {pairs.map(([a, b], i) => (
                      <line key={`p${i}`} x1={cx(a)} y1={cy(a)} x2={cx(b)} y2={cy(b)}
                        className="stroke-match animate-in fade-in duration-500" strokeWidth={4} strokeLinecap="round" filter="url(#glow)" />
                    ))}
                    {boundary.map(([a, b], i) => (
                      <line key={`b${i}`} x1={cx(a)} y1={cy(a)} x2={cx(b)} y2={cy(b)}
                        className="stroke-match animate-in fade-in duration-500" strokeWidth={3} strokeDasharray="6 6" strokeLinecap="round" filter="url(#glow)" />
                    ))}
                  </>
                )}
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
          <label className={`flex items-center justify-between text-sm transition-opacity ${showCorrection ? "" : "opacity-40"}`}>
            Smart Matching (Weighted)
            <Switch checked={smart} disabled={!showCorrection} onCheckedChange={setSmart} />
          </label>
          <Button variant="outline" className="w-full" onClick={() => setErrors(new Set())}>Reset</Button>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-secondary p-3"><div className="text-muted-foreground">X-Errors</div><div className="text-xl text-x-error">{errors.size}</div></div>
            <div className="rounded-lg bg-secondary p-3"><div className="text-muted-foreground">Syndromes</div><div className="text-xl text-syndrome">{lit.length}</div></div>
          </div>

          <ul className="space-y-2 text-xs text-muted-foreground">
            <li className="flex items-center gap-2"><span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full bg-data-qubit" /> Data qubit</li>
            <li className="flex items-center gap-2"><span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full bg-x-error" /> X-error</li>
            <li className="flex items-center gap-2"><span className="inline-block h-3.5 w-3.5 shrink-0 rounded-[3px] bg-measure-qubit" /> Measure qubit</li>
            <li className="flex items-center gap-2"><span className="inline-block h-3.5 w-3.5 shrink-0 rounded-[3px] bg-syndrome" /> Odd parity syndrome</li>
            <li className="flex items-center gap-2"><span className="inline-block h-0.5 w-4 shrink-0 bg-match" /> Basic MWPM pair (dashed = boundary)</li>
            <li className="flex items-center gap-2"><span className="inline-block h-1 w-4 shrink-0 bg-green-400" /> Smart decoder error chain</li>
          </ul>
        </aside>
      </main>
    </div>
  );
}
