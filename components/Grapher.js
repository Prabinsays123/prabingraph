'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { parse, same } from '../lib/parse';

const BG = '#0b0c10', TEXT = '#e8eaf0', MUTE = '#8b90a0';
const COLORS = ['#7c9cff', '#ff7ab8', '#5eead4', '#fbbf24', '#a78bfa', '#fb923c', '#86efac', '#f87171'];
const PRESETS = [['Parabola', 'y = x^2'], ['Square root', 'y = sqrt(x)'], ['Absolute value', 'y = |x|'], ['Sine wave', 'y = sin(x)'], ['Circle', 'x^2 + y^2 = 9'], ['Cubic', 'y = x^3 - 3x']];
const EXAMPLES = ['y = sin(x)/x', 'y = tan(x)', 'y = x*sin(x)', 'y = 1/x', 'x^2 + y^2 = 16', 'y = 3e^(-x^2)', 'y = log(x)', 'y = sin(x) + sin(3x)/3', 'y = 1 - 2sqrt(x + 3)', 'y = |x^2 - 4|', 'x^2/4 + y^2 = 1'];
const TARGETS = ['y = x^2 - 3', 'y = 2sqrt(x + 1)', 'y = |x| - 2', 'y = sin(x) + 1', 'y = 1 - 2sqrt(x + 3)', 'y = 0.5x^3'];
const HOME = { cx: 0, cy: 0, s: 70 };
const num = (v) => +v.toFixed(3);
const fmt = (v) => { v = +v.toPrecision(8); return Math.abs(v) >= 1e6 || (v && Math.abs(v) < 1e-4) ? v.toExponential() : String(v); };

/* ---------- canvas drawing ---------- */
function pathE(ctx, f, v) {
  const { w, h, cx, cy, s } = v, n = Math.ceil(w / 1.5);
  let pen = 0, py = 0, a = null;
  for (let i = 0; i <= n; i++) {
    const px = (i * w) / n, y = h / 2 - (f(cx + (px - w / 2) / s) - cy) * s;
    if (!isFinite(y) || Math.abs(y - h / 2) > h * 20) { pen = 0; continue; }
    if (pen && Math.abs(y - py) > h * 1.5) pen = 0; // asymptote / jump: lift the pen
    pen ? ctx.lineTo(px, y) : ctx.moveTo(px, y);
    pen = 1; py = y;
    if (!a && px > w * 0.55 && y > 30 && y < h - 20) a = [px, y];
  }
  return a;
}
function pathI(ctx, f, v) { // marching squares for implicit curves like x^2 + y^2 = 9
  const { w, h, cx, cy, s } = v, c = w * h > 4e5 ? 9 : 7, nx = Math.ceil(w / c), ny = Math.ceil(h / c), n1 = nx + 1;
  const val = new Float64Array(n1 * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) val[j * n1 + i] = f(cx + (i * c - w / 2) / s, cy - (j * c - h / 2) / s);
  const pt = (x1, y1, u, x2, y2, t) => ((u < 0) !== (t < 0) ? [x1 + ((x2 - x1) * u) / (u - t), y1 + ((y2 - y1) * u) / (u - t)] : null);
  let a = null;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const u = val[j * n1 + i], b = val[j * n1 + i + 1], d = val[(j + 1) * n1 + i], e = val[(j + 1) * n1 + i + 1];
    if (!isFinite(u + b + d + e)) continue;
    const x = i * c, y = j * c;
    const P = [pt(x, y, u, x + c, y, b), pt(x + c, y, b, x + c, y + c, e), pt(x, y + c, d, x + c, y + c, e), pt(x, y, u, x, y + c, d)].filter(Boolean);
    for (let k = 0; k + 1 < P.length; k += 2) { ctx.moveTo(P[k][0], P[k][1]); ctx.lineTo(P[k + 1][0], P[k + 1][1]); a = a || P[k]; }
  }
  return a;
}
function tag(ctx, txt, x, y, col, W) {
  const tw = ctx.measureText(txt).width + 18, bx = Math.max(6, Math.min(x, W - tw - 6));
  ctx.beginPath(); ctx.roundRect(bx, y, tw, 24, 12); ctx.fillStyle = 'rgba(11,12,16,.9)'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = col; ctx.stroke();
  ctx.fillStyle = TEXT; ctx.textAlign = 'left'; ctx.fillText(txt, bx + 9, y + 16);
}
function dot(ctx, x, y, col) {
  ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 7); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = BG; ctx.stroke();
}
function draw(c, v, r) {
  const { w, h, s, cx, cy } = v, dpr = window.devicePixelRatio || 1, ctx = c.getContext('2d');
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h);
  const X = (x) => w / 2 + (x - cx) * s, Y = (y) => h / 2 - (y - cy) * s;
  const raw = 90 / s, p10 = 10 ** Math.floor(Math.log10(raw)), m = raw / p10;
  const mant = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10, step = mant * p10, minor = step / (mant === 2 ? 4 : 5), k = Math.round(step / minor);
  const x0 = cx - w / 2 / s, x1 = cx + w / 2 / s, y0 = cy - h / 2 / s, y1 = cy + h / 2 / s;
  ctx.lineWidth = 1;
  for (const [lo, hi, vert] of [[x0, x1, 1], [y0, y1, 0]]) {
    for (let i = Math.ceil(lo / minor); i <= hi / minor; i++) {
      const p = Math.round(vert ? X(i * minor) : Y(i * minor)) + 0.5;
      ctx.strokeStyle = i % k ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.09)';
      ctx.beginPath(); vert ? (ctx.moveTo(p, 0), ctx.lineTo(p, h)) : (ctx.moveTo(0, p), ctx.lineTo(w, p)); ctx.stroke();
    }
  }
  const ax = X(0), ay = Y(0);
  ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.5; ctx.beginPath();
  if (ay > 0 && ay < h) { ctx.moveTo(0, ay); ctx.lineTo(w, ay); }
  if (ax > 0 && ax < w) { ctx.moveTo(ax, 0); ctx.lineTo(ax, h); }
  ctx.stroke();
  ctx.font = '11px ui-monospace,SFMono-Regular,monospace'; ctx.fillStyle = MUTE;
  const ly = Math.min(Math.max(ay + 16, 16), h - 6), lx = Math.min(Math.max(ax - 7, 36), w - 6);
  ctx.textAlign = 'center';
  for (let i = Math.ceil(x0 / step); i <= x1 / step; i++) if (i) ctx.fillText(fmt(i * step), X(i * step), ly);
  ctx.textAlign = 'right';
  for (let j = Math.ceil(y0 / step); j <= y1 / step; j++) if (j) ctx.fillText(fmt(j * step), lx, Y(j * step) + 4);

  let busy = false; const now = performance.now(), pills = [];
  if (r.target?.f) { // challenge target
    ctx.save(); ctx.beginPath(); ctx.setLineDash(r.solved ? [] : [7, 6]); ctx.lineWidth = 2.5;
    ctx.strokeStyle = r.solved ? '#5eead4' : 'rgba(232,234,240,.55)'; pathE(ctx, r.target.f, v); ctx.stroke(); ctx.restore();
  }
  r.eqs.forEach((q, i) => {
    const p = r.parsed[i]; if (!p.f) return;
    const t = Math.min(1, (now - q.born) / 700), e = 1 - (1 - t) ** 3; if (t < 1) busy = true;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w * e + 1, h); ctx.clip(); ctx.beginPath();
    ctx.strokeStyle = q.color; ctx.lineWidth = q.id === r.active ? 3 : 2.25; ctx.lineJoin = ctx.lineCap = 'round';
    const a = (p.kind === 'implicit' ? pathI : pathE)(ctx, p.f, v); ctx.stroke(); ctx.restore();
    if (a && t >= 1) pills.push([p.label, a, q.color]);
  });
  ctx.font = '12px ui-monospace,SFMono-Regular,monospace';
  pills.forEach(([txt, a, col]) => tag(ctx, txt, a[0] + 8, a[1] - 32, col, w));
  v.pins.forEach((p) => { dot(ctx, X(p.x), Y(p.y), p.c); tag(ctx, `(${num(p.x)}, ${num(p.y)})`, X(p.x) + 10, Y(p.y) - 32, p.c, w); });
  if (r.trace && v.mouse) { // trace: glide along the active curve
    const i = r.eqs.findIndex((q) => q.id === r.active), p = r.parsed[i];
    if (p?.kind === 'explicit') {
      const x = cx + (v.mouse.x - w / 2) / s, y = p.f(x);
      if (isFinite(y)) {
        const px = v.mouse.x, py = Y(y), col = r.eqs[i].color;
        ctx.save(); ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(px, py); ctx.lineTo(px, ay); ctx.moveTo(px, py); ctx.lineTo(ax, py); ctx.stroke(); ctx.restore();
        dot(ctx, px, py, col); tag(ctx, `x ${num(x)}   y ${num(y)}`, px + 12, py - 34, col, w);
      }
    }
  }
  return busy;
}
function zoomAt(v, f, mx = v.w / 2, my = v.h / 2) {
  const g = v.goal, ns = Math.min(1e5, Math.max(2, g.s * f));
  const wx = g.cx + (mx - v.w / 2) / g.s, wy = g.cy - (my - v.h / 2) / g.s;
  g.s = ns; g.cx = wx - (mx - v.w / 2) / ns; g.cy = wy + (my - v.h / 2) / ns; v.kick();
}

/* ---------- component ---------- */
export default function Grapher() {
  const cv = useRef(null), box = useRef(null), hud = useRef(null), ids = useRef(1), ex = useRef(0), exId = useRef(0), pts = useRef(new Map()), drag = useRef({ moved: 0 });
  const V = useRef({ ...HOME, w: 800, h: 600, goal: { ...HOME }, mouse: null, pins: [], raf: 0, kick() {} });
  const R = useRef({}), H = useRef({});
  const [eqs, setEqs] = useState(() => [{ id: 1, text: 'y = sin(x)', color: COLORS[0], born: 0 }]);
  const [active, setActive] = useState(1);
  const [trace, setTrace] = useState(false);
  const [ch, setCh] = useState({ on: false, i: 0, solved: false, reveal: false });
  const parsed = useMemo(() => eqs.map((q) => parse(q.text)), [eqs]);
  const tp = useMemo(() => parse(TARGETS[ch.i % TARGETS.length]), [ch.i]);
  R.current = { eqs, parsed, active, trace, target: ch.on ? tp : null, solved: ch.solved };

  const mk = (text) => { const id = ++ids.current; return { id, text, color: COLORS.find((c) => !eqs.some((q) => q.color === c)) || COLORS[id % COLORS.length], born: performance.now() }; };
  const focusLast = () => setTimeout(() => document.querySelector('.eq:last-of-type input')?.focus(), 40);
  const add = (text = '') => {
    if (eqs.length >= 8) return;
    const last = eqs[eqs.length - 1];
    if (text && last && !last.text.trim()) { setEqs(eqs.map((q, i) => (i === eqs.length - 1 ? { ...q, text, born: performance.now() } : q))); setActive(last.id); return; }
    const q = mk(text); setEqs([...eqs, q]); setActive(q.id); if (!text) focusLast();
  };
  const example = () => {
    const t = EXAMPLES[ex.current++ % EXAMPLES.length], j = eqs.findIndex((q) => q.id === exId.current);
    if (j >= 0) { setEqs(eqs.map((q, i) => (i === j ? { ...q, text: t, born: performance.now() } : q))); setActive(exId.current); }
    else { const q = mk(t); exId.current = q.id; setEqs([...eqs.slice(0, 7), q]); setActive(q.id); }
  };
  const zoom = (f) => zoomAt(V.current, f);
  const reset = () => { Object.assign(V.current.goal, HOME); V.current.kick(); };
  const toggleCh = () => setCh((c) => ({ on: !c.on, i: c.i, solved: false, reveal: false }));
  const nextCh = () => setCh((c) => ({ on: true, i: c.i + 1, solved: false, reveal: false }));
  H.current = { add, example, zoom, reset, toggleCh, setTrace, clearPins: () => { V.current.pins = []; V.current.kick(); } };

  useEffect(() => { // render loop, resize, wheel, shortcuts
    const v = V.current;
    const frame = () => {
      v.raf = 0; const g = v.goal; let moving = false;
      if (Math.abs(Math.log(g.s / v.s)) > 1e-3 || Math.abs(g.cx - v.cx) * v.s > 0.2 || Math.abs(g.cy - v.cy) * v.s > 0.2) {
        v.s *= (g.s / v.s) ** 0.25; v.cx += (g.cx - v.cx) * 0.25; v.cy += (g.cy - v.cy) * 0.25; moving = true;
      } else { v.s = g.s; v.cx = g.cx; v.cy = g.cy; }
      const busy = draw(cv.current, v, R.current);
      if (moving || busy) v.kick();
    };
    v.kick = () => { if (!v.raf) v.raf = requestAnimationFrame(frame); };
    const ro = new ResizeObserver(([e]) => { v.w = e.contentRect.width; v.h = e.contentRect.height; v.kick(); });
    ro.observe(box.current);
    const c = cv.current;
    const wheel = (e) => { e.preventDefault(); const b = c.getBoundingClientRect(); zoomAt(v, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - b.left, e.clientY - b.top); };
    c.addEventListener('wheel', wheel, { passive: false });
    const key = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/INPUT|TEXTAREA/.test(e.target.tagName)) { if (e.key === 'Escape') e.target.blur(); return; }
      const k = e.key.toLowerCase(), h = H.current;
      if (k === '+' || k === '=') h.zoom(1.5); else if (k === '-') h.zoom(1 / 1.5); else if (k === '0') h.reset();
      else if (k === 't') h.setTrace((t) => !t); else if (k === 'n') { e.preventDefault(); h.add(); }
      else if (k === 'e') h.example(); else if (k === 'c') h.toggleCh(); else if (k === 'escape') h.clearPins();
    };
    window.addEventListener('keydown', key);
    v.kick();
    return () => { cancelAnimationFrame(v.raf); ro.disconnect(); c.removeEventListener('wheel', wheel); window.removeEventListener('keydown', key); };
  }, []);
  useEffect(() => { V.current.kick(); });
  useEffect(() => { // challenge check
    if (ch.on && !ch.solved && tp.f && parsed.some((p) => p.kind === 'explicit' && same(p.f, tp.f))) setCh((c) => ({ ...c, solved: true }));
  }, [parsed, ch.on, ch.solved, tp]);

  /* pointer: pan, pinch, click-to-pin */
  const down = (e) => { cv.current.setPointerCapture(e.pointerId); pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag.current = { moved: 0 }; };
  const move = (e) => {
    const v = V.current, b = cv.current.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top, m = pts.current, old = m.get(e.pointerId);
    v.mouse = { x: mx, y: my };
    const d = Math.max(0, Math.ceil(Math.log10(v.s)) + 1);
    hud.current.textContent = `x ${(v.cx + (mx - v.w / 2) / v.s).toFixed(d)}    y ${(v.cy - (my - v.h / 2) / v.s).toFixed(d)}`;
    if (old) {
      const nw = { x: e.clientX, y: e.clientY };
      if (m.size === 2) {
        const o = [...m.values()], d0 = Math.hypot(o[0].x - o[1].x, o[0].y - o[1].y); m.set(e.pointerId, nw);
        const q = [...m.values()], d1 = Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y);
        if (d0 > 0) zoomAt(v, d1 / d0, (q[0].x + q[1].x) / 2 - b.left, (q[0].y + q[1].y) / 2 - b.top);
        v.s = v.goal.s; v.cx = v.goal.cx; v.cy = v.goal.cy; drag.current.moved = 99;
      } else {
        const dx = nw.x - old.x, dy = nw.y - old.y; v.cx -= dx / v.s; v.cy += dy / v.s;
        Object.assign(v.goal, { cx: v.cx, cy: v.cy, s: v.s }); drag.current.moved += Math.abs(dx) + Math.abs(dy); m.set(e.pointerId, nw);
      }
    }
    v.kick();
  };
  const up = (e) => {
    const v = V.current, r = R.current, b = cv.current.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top;
    if (drag.current.moved < 5 && pts.current.size === 1) {
      const x = v.cx + (mx - v.w / 2) / v.s; let best = null;
      r.parsed.forEach((p, i) => {
        if (p.kind !== 'explicit') return;
        const y = p.f(x), dd = Math.abs(v.h / 2 - (y - v.cy) * v.s - my);
        if (dd < 16 && (!best || dd < best.dd)) best = { dd, x, y, c: r.eqs[i].color };
      });
      if (best) v.pins = [...v.pins, best].slice(-10);
    }
    pts.current.delete(e.pointerId); v.kick();
  };
  const leave = () => { V.current.mouse = null; hud.current.textContent = ''; V.current.kick(); };
  const setText = (id, text) => setEqs((es) => es.map((q) => (q.id === id ? { ...q, text } : q)));

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">plot<i>line</i></div>
        <div className="list">
          {eqs.map((q, i) => (
            <div key={q.id} className={'eq' + (q.id === active ? ' on' : '')} style={{ '--c': q.color }}>
              <span className="dot" />
              <input value={q.text} placeholder="Type an equation…" spellCheck={false} autoComplete="off" autoCapitalize="off"
                onFocus={() => setActive(q.id)} onChange={(e) => setText(q.id, e.target.value)} />
              <button className="x" aria-label="Remove equation" onClick={() => setEqs(eqs.filter((z) => z.id !== q.id))}>×</button>
              {parsed[i].error && <div className="err">{parsed[i].error}</div>}
            </div>
          ))}
        </div>
        <button className="ghost" onClick={() => add()}>+ Add equation <kbd>N</kbd></button>
        <div className="chips">{PRESETS.map(([n, t]) => <button key={n} onClick={() => add(t)}>{n}</button>)}</div>
        <div className="row">
          <button onClick={example}>✨ Try an example</button>
          <button className={ch.on ? 'sel' : ''} onClick={toggleCh}>🎯 Challenge</button>
        </div>
        {ch.on && (
          <div className={'card' + (ch.solved ? ' win' : '')} key={ch.i + '' + ch.solved}>
            {ch.solved ? (<>
              <b>✓ Nailed it!</b><small>Your curve covers the target: <code>{TARGETS[ch.i % TARGETS.length]}</code></small>
              <div className="r"><button className="sel" onClick={nextCh}>Next challenge →</button></div>
            </>) : (<>
              <b>Match the dashed curve <small>#{(ch.i % TARGETS.length) + 1}/{TARGETS.length}</small></b>
              <small>Enter an equation in y = … form. It turns solid when you get it.</small>
              {ch.reveal && <code>{TARGETS[ch.i % TARGETS.length]}</code>}
              <div className="r"><button onClick={() => setCh({ ...ch, reveal: true })}>Reveal</button><button onClick={nextCh}>Skip</button></div>
            </>)}
          </div>
        )}
        <p className="hint">Scroll to zoom · drag to pan · click a curve to pin a point · <kbd>T</kbd> trace · <kbd>E</kbd> example · <kbd>C</kbd> challenge · <kbd>0</kbd> reset · <kbd>Esc</kbd> clear pins</p>
      </aside>
      <main className="stage" ref={box}>
        <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={leave} />
        <div className="tools">
          <button title="Zoom in (+)" onClick={() => zoom(1.5)}>+</button>
          <button title="Zoom out (−)" onClick={() => zoom(1 / 1.5)}>−</button>
          <button title="Reset view (0)" onClick={reset}>⌂</button>
          <button className={trace ? 'sel' : ''} title="Trace (T)" onClick={() => setTrace(!trace)}>◎</button>
        </div>
        <div className="hud" ref={hud} />
      </main>
    </div>
  );
}
