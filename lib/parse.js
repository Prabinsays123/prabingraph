import { compile } from 'mathjs';

// Real-valued overrides so sqrt(-1) etc. are "undefined" (NaN) instead of complex numbers.
const FN = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, ln: Math.log,
  log: (a, b) => (b === undefined ? Math.log10(a) : Math.log(a) / Math.log(b)),
};
const clean = (s) =>
  s.replace(/√/g, 'sqrt').replace(/π/g, 'pi').replace(/²/g, '^2').replace(/³/g, '^3')
    .replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/\|([^|]+)\|/g, 'abs($1)').replace(/\s+/g, ' ').trim();

const cache = new Map();
export function parse(text) {
  if (cache.has(text)) return cache.get(text);
  let out;
  try { out = build(text); } catch (e) {
    const m = /Undefined symbol (\w+)/.exec(e.message || '');
    out = { error: m ? `I don't know “${m[1]}” yet` : e.friendly || "That doesn't look right — check brackets and operators" };
  }
  if (cache.size > 300) cache.clear();
  cache.set(text, out);
  return out;
}

function build(text) {
  const s = clean(text);
  if (!s) return { empty: true };
  const parts = s.split('=');
  const bad = (m) => Object.assign(new Error(m), { friendly: m });
  if (parts.length > 2) throw bad('Use just one “=” sign');
  const hasY = (e) => /\by\b/.test(e);
  let kind = 'explicit', src = s;
  if (parts.length === 2) {
    const [l, r] = parts.map((p) => p.trim());
    if (/^(y|f\(x\))$/i.test(l) && !hasY(r)) src = r;
    else { kind = 'implicit'; src = `(${l})-(${r})`; }
  } else if (hasY(s)) throw bad('Add an “=” — for example  y = 2x + 1');
  const code = compile(src);
  const scope = { ...FN, x: 0.5, y: 0.5 };
  const v = code.evaluate(scope);
  if (typeof v === 'function') throw bad('That’s a function name — try something like sin(x)');
  const f = (x, y = 0) => {
    scope.x = x; scope.y = y;
    try { const r = code.evaluate(scope); return typeof r === 'number' ? r : NaN; } catch { return NaN; }
  };
  return { f, kind, label: parts.length === 2 ? s : `y = ${s}` };
}

// Do two functions agree at every sample (treating "undefined" as equal)?
export function same(f, g) {
  for (let x = -8; x <= 8; x += 0.37) {
    const a = f(x), b = g(x);
    if (Number.isNaN(a) && Number.isNaN(b)) continue;
    if (!(Math.abs(a - b) <= 1e-3 * (1 + Math.abs(b)))) return false;
  }
  return true;
}
