// Copied from congo-srr-requirements/src/model.js: keep the two in sync.
// The requirements graph, computed from a snapshot { reqs, links }.
// Mission objectives (type 'mo') are Level 0; every other requirement takes its level from its shortest path
// down from an MO. A requirement may have several parents (links), each with its own sort order.
// Shared by the local editor, the static site, and (later) the SRR page's Decomposition tab.

export const LEVEL_MAX = 4;
export const SEGMENTS = ['Space', 'Ground', 'Air', 'Launch', 'User equipment', 'Operations', 'System'];
export const STATUSES = ['draft', 'agreed', 'TBR', 'TBD'];
export const VERIFICATION = [
  { k: 'I', name: 'Inspection' }, { k: 'A', name: 'Analysis' }, { k: 'D', name: 'Demonstration' }, { k: 'T', name: 'Test' },
];
export const SOURCES = ['mission', 'RFP', 'derived', 'interface'];
export const FIELDS = ['name', 'statement', 'threshold', 'objective', 'rationale', 'source', 'verification', 'verNote', 'segment', 'owner', 'status', 'example'];

export function build(snapshot) {
  const reqs = snapshot.reqs.map(r => ({ ...r }));
  const byId = new Map(reqs.map(r => [r.id, r]));
  const links = snapshot.links.filter(l => byId.has(l.parent) && byId.has(l.child));
  const kids = new Map(reqs.map(r => [r.id, []])), ups = new Map(reqs.map(r => [r.id, []]));
  for (const l of [...links].sort((a, b) => a.ord - b.ord)) { kids.get(l.parent).push(l.child); ups.get(l.child).push(l.parent); }
  const mos = reqs.filter(r => r.type === 'mo').sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id));

  // Levels: breadth-first from the MOs (shortest path wins).
  const level = new Map(mos.map(m => [m.id, 0]));
  let frontier = mos.map(m => m.id);
  while (frontier.length) {
    const next = [];
    for (const id of frontier) for (const c of kids.get(id)) if (!level.has(c)) { level.set(c, level.get(id) + 1); next.push(c); }
    frontier = next;
  }

  // Outline numbers and display order: depth-first from the MOs; the first visit fixes a node's primary parent.
  const outline = new Map(), primary = new Map(), order = [];
  const visit = (id, num, parent) => {
    if (outline.has(id)) return;
    outline.set(id, num); primary.set(id, parent); order.push(id);
    kids.get(id).forEach((c, i) => visit(c, `${num}.${i + 1}`, id));
  };
  mos.forEach((m, i) => visit(m.id, `${i + 1}`, null));
  const orphans = reqs.filter(r => r.type !== 'mo' && !outline.has(r.id)).map(r => r.id);

  // Which MOs each requirement serves (for colouring threads).
  const lineage = new Map();
  const moOf = id => {
    if (lineage.has(id)) return lineage.get(id);
    lineage.set(id, new Set()); // guards against cycles in hand-edited data
    const s = byId.get(id).type === 'mo' ? new Set([id]) : new Set(ups.get(id).flatMap(p => [...moOf(p)]));
    lineage.set(id, s);
    return s;
  };
  for (const r of reqs) moOf(r.id);

  const walk = (start, next) => {
    const seen = new Set(), stack = [...next(start)];
    while (stack.length) { const id = stack.pop(); if (!seen.has(id)) { seen.add(id); stack.push(...next(id)); } }
    return seen;
  };
  const ancestors = id => walk(id, x => ups.get(x) || []);
  const descendants = id => walk(id, x => kids.get(x) || []);

  for (const r of reqs) {
    r.level = level.get(r.id) ?? null;
    r.outline = outline.get(r.id) ?? '';
    r.parents = ups.get(r.id);
    r.children = kids.get(r.id);
    r.mos = [...lineage.get(r.id)];
  }

  return {
    reqs, byId, links, mos, order, orphans, primary,
    get: id => byId.get(id),
    childrenOf: id => kids.get(id) || [],
    parentsOf: id => ups.get(id) || [],
    ancestors, descendants,
    // The whole thread through a requirement: everything above and below it.
    thread: id => new Set([id, ...ancestors(id), ...descendants(id)]),
    wouldCycle: (parent, child) => parent === child || descendants(child).has(parent),
    maxLevel: Math.max(0, ...reqs.map(r => r.level ?? 0)),
  };
}

// Problems worth fixing before a baseline. Each item: { id, kind, text, severity }.
export function checks(m) {
  const out = [];
  for (const id of m.orphans) out.push({ id, kind: 'orphan', severity: 'error', text: 'Not connected to any mission objective' });
  for (const r of m.reqs) {
    if (r.type === 'mo') { if (!r.children.length) out.push({ id: r.id, kind: 'empty', severity: 'warn', text: 'Mission objective has no Level 1 requirements' }); continue; }
    if (!r.statement?.trim()) out.push({ id: r.id, kind: 'statement', severity: 'error', text: 'No "shall" statement' });
    else if (!/\bshall\b/i.test(r.statement)) out.push({ id: r.id, kind: 'shall', severity: 'warn', text: 'Statement has no "shall"' });
    if (!r.verification) out.push({ id: r.id, kind: 'verification', severity: 'warn', text: 'No verification method' });
    if (r.level != null && r.level > LEVEL_MAX) out.push({ id: r.id, kind: 'deep', severity: 'warn', text: `Level ${r.level}: deeper than Level ${LEVEL_MAX}` });
    if (r.status === 'TBD' || r.status === 'TBR') out.push({ id: r.id, kind: 'open', severity: 'info', text: `Marked ${r.status}` });
    if (r.example) out.push({ id: r.id, kind: 'example', severity: 'info', text: 'Example requirement: edit or delete' });
  }
  return out;
}

// What changed between two snapshots (baseline diff).
export function diff(a, b) {
  const A = new Map(a.reqs.map(r => [r.id, r])), B = new Map(b.reqs.map(r => [r.id, r]));
  const parents = (s, id) => s.links.filter(l => l.child === id).map(l => l.parent).sort().join(', ');
  const added = [...B.keys()].filter(k => !A.has(k));
  const removed = [...A.keys()].filter(k => !B.has(k));
  const changed = [], moved = [];
  for (const [id, rb] of B) {
    const ra = A.get(id);
    if (!ra) continue;
    const fields = FIELDS.filter(f => String(ra[f] ?? '') !== String(rb[f] ?? ''));
    if (fields.length) changed.push({ id, fields, before: ra, after: rb });
    const pa = parents(a, id), pb = parents(b, id);
    if (pa !== pb) moved.push({ id, from: pa || '(none)', to: pb || '(none)' });
  }
  return { added, removed, changed, moved };
}

export const short = (s, n = 90) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');
