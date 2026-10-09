/* ==========================================================================
   Known issues: what the audit reports but does not fail on, so a site with
   history can adopt the audit today and still fail on anything NEW.

   audit-baseline.json holds one entry per page and viewport,
     "desktop browse.html": { "a11y:label": 2, … }
   A count above its entry is new and fails. A count below it is reported as
   fixed; `npm run audit:baseline` rewrites the file from a run, and the
   smaller file is what locks an improvement in.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import type { AuditResult, Finding } from './audit';
import type { SiteConfig } from './site';

export const BASELINE_FILE = path.resolve(__dirname, '..', 'audit-baseline.json');

const ABOUT = 'Known issues the audit reports without failing. Only new ones fail. ' +
  'Rewrite from a run with `npm run audit:baseline` and review the diff: it should only shrink, ' +
  'unless an issue is being accepted on purpose.';

type Baseline = Record<string, Record<string, number>>;

export const pageKey = (r: { project: string; page: string }) => `${r.project} ${r.page}`;
export const findingKey = (f: Finding) => `${f.check}:${f.id}`;

export function loadBaseline(): Baseline {
  let raw: string;
  try {
    raw = fs.readFileSync(BASELINE_FILE, 'utf8');
  } catch {
    return {};  // no file yet: every finding is new
  }
  const { _about, ...entries } = JSON.parse(raw);  // a broken file throws: never read it as empty
  return entries;
}

/** Move the findings site.config.ts accepts out of the way, keeping why. */
export function setAside(r: AuditResult, accept: SiteConfig['accept'] = []): AuditResult {
  const rule = (f: Finding) => accept.find(a => a.page === r.page && a.finding === findingKey(f));
  return {
    ...r,
    findings: r.findings.filter(f => !rule(f)),
    accepted: r.findings.filter(rule).map(f => ({ key: findingKey(f), count: f.count, why: rule(f)!.why })),
  };
}

export type NewFinding = Finding & { was: number };

export function compare(r: AuditResult, baseline: Baseline) {
  const known = baseline[pageKey(r)] ?? {};
  const now = new Map(r.findings.map(f => [findingKey(f), f]));
  const fresh: NewFinding[] = [];
  const kept: Finding[] = [];
  for (const f of r.findings) {
    const was = known[findingKey(f)] ?? 0;
    if (f.count > was) fresh.push({ ...f, was });
    else kept.push(f);
  }
  const fixed = Object.entries(known)
    .filter(([key, was]) => (now.get(key)?.count ?? 0) < was)
    .map(([key, was]) => ({ key, was, now: now.get(key)?.count ?? 0 }));
  return { fresh, known: kept, fixed };
}

/** One line per new finding: what a failing test prints. */
export function describeNew(f: NewFinding) {
  const n = f.was ? `${f.count}, was ${f.was}` : String(f.count);
  const where = f.targets?.length ? ` — ${f.targets.join(', ')}` : '';
  return `${f.check}:${f.id} (${n})${f.impact ? ` [${f.impact}]` : ''} ${f.message}${where}`;
}

/** Replace the entries for the pages in `results`; leave the rest alone. */
export function updateBaseline(results: AuditResult[]) {
  const b = loadBaseline();
  for (const r of results) {
    const entry = Object.fromEntries(
      r.findings.map(f => [findingKey(f), f.count] as const).sort(([a], [z]) => a.localeCompare(z)));
    if (Object.keys(entry).length) b[pageKey(r)] = entry;
    else delete b[pageKey(r)];
  }
  const sorted = Object.fromEntries(Object.entries(b).sort(([a], [z]) => a.localeCompare(z)));
  fs.writeFileSync(BASELINE_FILE, JSON.stringify({ _about: ABOUT, ...sorted }, null, 2) + '\n');
}
