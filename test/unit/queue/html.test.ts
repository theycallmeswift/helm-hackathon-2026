import { expect, test } from 'vitest';
import type { Likelihood, PrKind } from '../../../src/pr/types.ts';
import type { BucketReasonKind } from '../../../src/queue/buckets.ts';
import { groupIntoSections, toEntry } from '../../../src/queue/build.ts';
import { escapeHtml, renderQueueHtml } from '../../../src/queue/html.ts';
import { QUEUE_AI_COLUMNS, QUEUE_COLUMNS, type QueueBadge } from '../../../src/queue/render.ts';
import { FACTORY_NOW, makePrSnapshot } from '../../support/pr-snapshot.ts';

const REPO = 'theycallmeswift/helm';
const HOSTILE = `<script>alert("x")</script> & 'quoted' <img src=x onerror=alert(1)>`;
const HOSTILE_ESCAPED =
  '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quoted&#39; &lt;img src=x onerror=alert(1)&gt;';

/** A queue of the given snapshots, bucketed as the queue command would. */
function sectionsOf(...snapshots: ReturnType<typeof makePrSnapshot>[]) {
  return groupIntoSections(snapshots.map((snapshot) => toEntry(snapshot, FACTORY_NOW)));
}

/** A one-PR queue whose entry carries AI flags with the given kind and verdicts. */
function sectionsWithAi(flags: { kind: PrKind; breaking: Likelihood; needsHip: Likelihood }) {
  const sections = sectionsOf(makePrSnapshot({ number: 1 }));
  const flag = { confidence: 'high' as const, reason: 'Because.', evidence: [] };
  for (const entry of sections.flatMap((section) => section.entries)) {
    entry.ai = {
      status: 'ok',
      model: 'test/model',
      flags: {
        kind: { ...flag, kind: flags.kind },
        breakingChange: { ...flag, verdict: flags.breaking },
        needsHip: { ...flag, verdict: flags.needsHip },
        summary: { summary: 'A change.', reviewFocus: 'main.go', evidence: [] },
      },
    };
  }

  return sections;
}

test.each([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
  ['plain text', 'plain text'],
  ['&amp;', '&amp;amp;'],
])('escapeHtml(%j) is %j', (input, expected) => {
  expect(escapeHtml(input)).toBe(expected);
});

test('the page lists every bucket with its count, empty buckets included', () => {
  const sections = sectionsOf(
    makePrSnapshot({ number: 1, isDraft: true }),
    makePrSnapshot({ number: 2 }),
    makePrSnapshot({ number: 3 }),
  );

  const page = renderQueueHtml(sections, { repo: REPO, now: FACTORY_NOW });

  expect(page).toMatch(/^<!doctype html>/);
  expect(page).toContain('<h2>Draft <span class="count">1</span></h2>');
  expect(page).toContain('<h2>Ready for review <span class="count">2</span></h2>');
  expect(page).toContain('<h2>Stale <span class="count">0</span></h2>');
  expect(page).toContain(
    '<a class="bucket-card bucket-stale bucket-empty" href="#stale"><span class="bucket-count">0</span><span class="bucket-title">Stale</span>',
  );
  expect(page.match(/<p class="empty">None\.<\/p>/g)).toHaveLength(4);
  expect(page).toContain(`<time datetime="${FACTORY_NOW.toISOString()}">`);
  expect(page).toContain('<th class="col-pr">PR</th><th class="col-title">Title</th>');
});

test('each PR number links to the PR, built from the repo and number', () => {
  const sections = sectionsOf(makePrSnapshot({ number: 42 }));

  const page = renderQueueHtml(sections, { repo: REPO, now: FACTORY_NOW });

  expect(page).toContain('<a href="https://github.com/theycallmeswift/helm/pull/42">#42</a>');
});

test('each cell carries its column class, so short columns can stay on one line', () => {
  const sections = sectionsOf(makePrSnapshot({ number: 1 }));

  const page = renderQueueHtml(sections, { repo: REPO, now: FACTORY_NOW });

  expect(page).toContain('<th class="col-waiting-since">Waiting since</th>');
  expect(page).toContain('<td class="col-title">');
  expect(page).toMatch(/\.col-pr, .*\.col-needs-hip \{ white-space: nowrap; \}/);
});

test('the AI columns appear when asked for, with notes under the tables', () => {
  const sections = sectionsOf(makePrSnapshot({ number: 1 }));

  const page = renderQueueHtml(sections, {
    repo: REPO,
    now: FACTORY_NOW,
    columns: [...QUEUE_COLUMNS, ...QUEUE_AI_COLUMNS],
    notes: ['1 pull request had no cached AI data'],
  });

  expect(page).toContain(
    '<th class="col-kind">Kind</th><th class="col-breaking">Breaking</th><th class="col-needs-hip">Needs HIP</th>',
  );
  expect(page).toContain('<p>1 pull request had no cached AI data</p>');
});

test('hostile titles, logins, AI text, and notes are escaped', () => {
  const sections = sectionsOf(
    makePrSnapshot({
      number: 7,
      title: HOSTILE,
      author: { login: HOSTILE, isBot: false, association: 'CONTRIBUTOR' },
    }),
  );
  const aiTextColumn = { header: 'AI summary', cell: () => HOSTILE };

  const page = renderQueueHtml(sections, {
    repo: REPO,
    now: FACTORY_NOW,
    columns: [...QUEUE_COLUMNS, aiTextColumn],
    notes: [HOSTILE],
  });

  expect(page).not.toContain('<script>');
  expect(page).not.toContain('<img');
  expect(page.split(HOSTILE_ESCAPED)).toHaveLength(5);
  expect(page).toContain('href="https://github.com/theycallmeswift/helm/pull/7"');
});

test('the masthead shows the Helm logo inline and the total open pull requests', () => {
  const sections = sectionsOf(
    makePrSnapshot({ number: 1, isDraft: true }),
    makePrSnapshot({ number: 2 }),
  );

  const page = renderQueueHtml(sections, { repo: REPO, now: FACTORY_NOW });

  expect(page).toContain('<svg class="logo"');
  expect(page).toContain(
    '<a href="https://github.com/theycallmeswift/helm/pulls">Showing 2 open pull requests</a>',
  );
  expect(page).not.toMatch(/<script|<link|src=/);
});

test.each<[PrKind, Likelihood, Likelihood, string[]]>([
  ['bug', 'yes', 'no', ['badge badge-bug', 'badge badge-yes', 'badge badge-no']],
  ['feature', 'possible', 'possible', ['badge badge-feature', 'badge badge-possible']],
  ['docs', 'no', 'yes', ['badge badge-docs', 'badge badge-no', 'badge badge-yes']],
])(
  'AI flags %s, breaking %s, HIP %s draw as colored badges',
  (kind, breaking, needsHip, classes) => {
    const sections = sectionsWithAi({ kind, breaking, needsHip });

    const page = renderQueueHtml(sections, {
      repo: REPO,
      now: FACTORY_NOW,
      columns: [...QUEUE_COLUMNS, ...QUEUE_AI_COLUMNS],
    });

    for (const badgeClass of classes) {
      expect(page).toContain(`<span class="${badgeClass}">`);
    }
    expect(page).toContain(
      `<td class="col-kind"><span class="badge badge-${kind}">${kind} (high)</span></td>`,
    );
  },
);

test('AI columns without flags show the plain dash, not a badge', () => {
  const sections = sectionsOf(makePrSnapshot({ number: 1 }));

  const page = renderQueueHtml(sections, {
    repo: REPO,
    now: FACTORY_NOW,
    columns: [...QUEUE_COLUMNS, ...QUEUE_AI_COLUMNS],
  });

  expect(page).toContain('<td class="col-kind">-</td>');
  expect(page).not.toContain('<span class="badge');
});

test('a badge value outside the fixed table gets the plain badge, never its own class', () => {
  const sections = sectionsOf(makePrSnapshot({ number: 1 }));
  const unexpected = JSON.parse('"constructor\\" onmouseover=\\"x"') as QueueBadge;
  const oddColumn = { header: 'Odd', cell: () => 'odd', badge: () => unexpected };

  const page = renderQueueHtml(sections, {
    repo: REPO,
    now: FACTORY_NOW,
    columns: [...QUEUE_COLUMNS, oddColumn],
  });

  expect(page).toContain('<td class="col-odd"><span class="badge">odd</span></td>');
  expect(page).not.toContain('onmouseover');
});

test('the dashboard lists ready work first and drafts last, cards and sections alike', () => {
  const sections = sectionsOf(
    makePrSnapshot({ number: 1, isDraft: true }),
    makePrSnapshot({ number: 2 }),
  );

  const page = renderQueueHtml(sections, { repo: REPO, now: FACTORY_NOW });

  const sectionOrder = [...page.matchAll(/<section id="([a-z-]+)"/g)].map((match) => match[1]);
  const cardOrder = [...page.matchAll(/class="bucket-card bucket-([a-z-]+)[ "]/g)].map(
    (match) => match[1],
  );
  const expected = [
    'ready',
    'needs-second-approval',
    'needs-author',
    'stale',
    'duplicate',
    'draft',
  ];
  expect(sectionOrder).toEqual(expected);
  expect(cardOrder).toEqual(expected);
});

test('each reason is its own escaped pill, colored by its kind', () => {
  const sections = sectionsOf(makePrSnapshot({ number: 1 }));
  const entry = sections.flatMap((section) => section.entries)[0];
  if (entry === undefined) {
    throw new Error('expected one queue entry');
  }
  entry.reasons = [
    { kind: 'conflicts', text: 'merge conflicts' },
    { kind: 'ci', text: HOSTILE },
  ];

  const page = renderQueueHtml(sections, { repo: REPO, now: FACTORY_NOW });

  expect(page).toContain(
    `<td class="col-reason"><span class="pills"><span class="pill reason-conflicts">merge conflicts</span><span class="pill reason-ci">${HOSTILE_ESCAPED}</span></span></td>`,
  );
  expect(page).not.toContain('<script>');
});

test('a reason kind outside the fixed table gets the plain pill, never its own class', () => {
  const sections = sectionsOf(makePrSnapshot({ number: 1 }));
  const entry = sections.flatMap((section) => section.entries)[0];
  if (entry === undefined) {
    throw new Error('expected one queue entry');
  }
  const unexpected = JSON.parse('"x\\" onmouseover=\\"y"') as BucketReasonKind;
  entry.reasons = [{ kind: unexpected, text: 'odd' }];

  const page = renderQueueHtml(sections, { repo: REPO, now: FACTORY_NOW });

  expect(page).toContain('<span class="pill">odd</span>');
  expect(page).not.toContain('onmouseover');
});
