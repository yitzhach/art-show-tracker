/* ==========================================================================
   Gathers the audit's per-page results into results/audit.json: one short
   file that says what is new, what is fixed and what is known, written for
   whoever reads it next (a person, or Claude in a later step). On GitHub
   Actions it also writes the job summary. Ignores runs with no audit tests.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import type { AuditResult } from './audit';
import { compare, describeNew, loadBaseline, updateBaseline, type NewFinding } from './baseline';
import { site } from './site';

const OUT = path.resolve(__dirname, '..', 'results', 'audit.json');
const plain = (s = '') => s.replace(/\u001b\[[0-9;]*m/g, '').split('\n').find(Boolean) ?? '';

export default class AuditReporter implements Reporter {
  // Retries report each attempt; the last one is the result.
  private last = new Map<string, { test: TestCase; result: TestResult }>();

  onTestEnd(test: TestCase, result: TestResult) {
    if (test.annotations.some(a => a.type === 'site-qa-page')) this.last.set(test.id, { test, result });
  }

  onEnd() {
    if (!this.last.size) return;
    const updating = !!process.env.SITE_QA_UPDATE_BASELINE;
    const baseline = loadBaseline();
    const audited: AuditResult[] = [];
    const fresh: (NewFinding & { page: string; project: string })[] = [];
    const fixed: { page: string; project: string; key: string; was: number; now: number }[] = [];
    const errors: { page: string; project: string; error: string }[] = [];
    const accepted: { page: string; project: string; key: string; why: string }[] = [];
    const knownByCheck: Record<string, number> = {};  // occurrences: elements, links…
    let knownIssues = 0;
    const unlisted = new Set<string>();
    const pages = [];

    for (const { test, result } of this.last.values()) {
      const project = test.parent.project()?.name ?? '';
      const page = test.annotations.find(a => a.type === 'site-qa-page')?.description ?? test.title;
      const body = result.attachments.find(a => a.name === 'site-qa-audit')?.body;
      if (!body) {
        errors.push({ page, project, error: plain(result.error?.message) || result.status });
        pages.push({ page, project, status: 'error' });
        continue;
      }
      const r: AuditResult = JSON.parse(body.toString());
      audited.push(r);
      r.unlisted.forEach(p => unlisted.add(p));
      r.accepted?.forEach(a => accepted.push({ page, project, key: a.key, why: a.why }));
      const c = compare(r, baseline);
      c.fresh.forEach(f => fresh.push({ page, project, ...f }));
      c.fixed.forEach(f => fixed.push({ page, project, ...f }));
      c.known.forEach(f => { knownByCheck[f.check] = (knownByCheck[f.check] ?? 0) + f.count; });
      knownIssues += c.known.length;
      pages.push({ page, project, status: c.fresh.length ? 'new issues' : 'pass',
                   new: c.fresh.length, known: c.known.length, metrics: r.metrics });
    }
    if (updating) updateBaseline(audited);

    const order = (a: { page: string; project: string }, z: typeof a) =>
      a.page.localeCompare(z.page) || a.project.localeCompare(z.project);
    pages.sort(order); fresh.sort(order); fixed.sort(order); errors.sort(order); accepted.sort(order);

    const occurrences = Object.values(knownByCheck).reduce((a, b) => a + b, 0);
    const summary = `${pages.length} page views audited: ` +
      (updating ? 'baseline rewritten' : `${fresh.length} new issues, ${errors.length} errors`) +
      `, ${knownIssues} known issues (${occurrences} occurrences), ${fixed.length} fixed`;
    const report = {
      ok: updating || (!fresh.length && !errors.length),
      summary,
      baseURL: site.baseURL,
      ranAt: new Date().toISOString(),
      new: fresh,
      errors,
      fixed,
      knownByCheck,
      accepted,
      unlistedPages: [...unlisted].sort(),
      pages,
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
    console.log(`\nsite-qa: ${summary} → ${path.relative(process.cwd(), OUT)}`);

    const gh = process.env.GITHUB_STEP_SUMMARY;
    if (gh) {
      const lines = [`### Site audit: ${summary}`, ''];
      if (fresh.length) {
        lines.push('**New issues** (these fail the run)', '');
        fresh.forEach(f => lines.push(`- \`${f.page}\` (${f.project}) ${describeNew(f)}`));
        lines.push('');
      }
      errors.forEach(e => lines.push(`- \`${e.page}\` (${e.project}) did not finish: ${e.error}`));
      if (fixed.length) lines.push('', `${fixed.length} known issues are fixed: run \`npm run audit:baseline\` in qa/ and commit.`);
      lines.push('', '| page | viewport | result | load ms | LCP ms | requests |', '|---|---|---|---|---|---|');
      for (const p of pages) {
        const m = 'metrics' in p ? p.metrics : null;
        lines.push(`| ${p.page} | ${p.project} | ${p.status} | ${m?.loadMs ?? '–'} | ${m?.lcpMs ?? '–'} | ${m?.requests ?? '–'} |`);
      }
      fs.appendFileSync(gh, lines.join('\n') + '\n');
    }
  }

  printsToStdio() { return false; }
}
