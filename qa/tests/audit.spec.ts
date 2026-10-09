/* The audit, one test per page per viewport (see lib/audit.ts for the
   checks). A test fails only on issues audit-baseline.json does not know. */
import { test, expect } from '../lib/test';
import { site } from '../lib/site';
import { auditPage } from '../lib/audit';
import { compare, describeNew, loadBaseline, setAside } from '../lib/baseline';

const baseline = loadBaseline();
const updating = !!process.env.SITE_QA_UPDATE_BASELINE;

for (const pagePath of site.pages) {
  test(`audit ${pagePath}`, { annotation: { type: 'site-qa-page', description: pagePath } },
    async ({ page, isMobile }, testInfo) => {
      const result = setAside(await auditPage(page, {
        pagePath, project: testInfo.project.name, isMobile,
        checkLinks: testInfo.project.name === testInfo.config.projects[0].name,
        baseURL: site.baseURL, listed: site.listedPages,
      }), site.accept);
      await testInfo.attach('site-qa-audit', { body: JSON.stringify(result), contentType: 'application/json' });
      if (updating) return;
      const { fresh } = compare(result, baseline);
      expect(fresh.map(describeNew),
        `new issues on ${pagePath} (${testInfo.project.name}): fix them, or accept one on purpose ` +
        'with `npm run audit:baseline` and say why').toEqual([]);
    });
}
