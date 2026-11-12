import { expect, test } from 'vitest';

import { groupIntoSections, toEntry } from '../../../src/queue/build.ts';
import { escapeHtml, renderQueueHtml } from '../../../src/queue/html.ts';
import { QUEUE_AI_COLUMNS, QUEUE_COLUMNS } from '../../../src/queue/render.ts';
import { FACTORY_NOW, makePrSnapshot } from '../../support/pr-snapshot.ts';

const REPO = 'theycallmeswift/helm';
const HOSTILE = `<script>alert("x")</script> & 'quoted' <img src=x onerror=alert(1)>`;
const HOSTILE_ESCAPED =
  '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quoted&#39; &lt;img src=x onerror=alert(1)&gt;';

/** A queue of the given snapshots, bucketed as the queue command would. */
function sectionsOf(...snapshots: ReturnType<typeof makePrSnapshot>[]) {
  return groupIntoSections(snapshots.map((snapshot) => toEntry(snapshot, FACTORY_NOW)));
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
  expect(page).toContain('<h2>Draft (1)</h2>');
  expect(page).toContain('<h2>Ready for review (2)</h2>');
  expect(page).toContain('<h2>Stale (0)</h2>');
  expect(page).toContain('<li><a href="#stale">Stale</a>: 0</li>');
  expect(page.match(/<p class="empty">None\.<\/p>/g)).toHaveLength(4);
  expect(page).toContain(`<time datetime="${FACTORY_NOW.toISOString()}">`);
  expect(page).toContain('<th>PR</th><th>Title</th><th>Author</th>');
});

test('each PR number links to the PR, built from the repo and number', () => {
  const sections = sectionsOf(makePrSnapshot({ number: 42 }));

  const page = renderQueueHtml(sections, { repo: REPO, now: FACTORY_NOW });

  expect(page).toContain('<a href="https://github.com/theycallmeswift/helm/pull/42">#42</a>');
});

test('the AI columns appear when asked for, with notes under the tables', () => {
  const sections = sectionsOf(makePrSnapshot({ number: 1 }));

  const page = renderQueueHtml(sections, {
    repo: REPO,
    now: FACTORY_NOW,
    columns: [...QUEUE_COLUMNS, ...QUEUE_AI_COLUMNS],
    notes: ['1 pull request had no cached AI data'],
  });

  expect(page).toContain('<th>Kind</th><th>Breaking</th><th>Needs HIP</th>');
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
