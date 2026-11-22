import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const legal = read('src/views/Legal.tsx');
const seo = read('scripts/seo-routes.mjs');
const docs = read('src/views/Docs.tsx');
const faq = JSON.parse(read('src/views/docs-faq.json'));
const built = process.argv.includes('--built');

for (const page of ['privacy', 'terms']) {
  const path = `src/views/${page}-content.html`;
  const content = read(path);
  assert(legal.includes(`'./${page}-content.html?raw'`), `${page}: React uses the shared policy`);
  assert(seo.includes(`readFileSync('${path}', 'utf8')`), `${page}: no-JS uses the shared policy`);
  const ids = [...content.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${page}: unique anchor IDs`);
  const headings = [...content.matchAll(/<h2 id="([^"]+)">([^<]+)<\/h2>/g)];
  assert.equal(headings.length, 6, `${page}: every indexed section has a heading`);
  for (const [, id, title] of headings) {
    assert(legal.includes(`'${title}'`), `${page}: heading matches the index`);
    assert(ids.includes(id.replace(/-title$/, '')), `${page}: index target exists`);
  }
  if (built) assert(read(`dist/seo/${page}.html`).includes(content), `${page}: deployed HTML contains the exact policy`);
}

assert(legal.includes('lang="en" dir="ltr"'), 'Legal has English reading semantics');
assert(legal.includes('<ReadingLanguageNote />'), 'Legal discloses untranslated copy');
assert(docs.includes('lang="en" dir="ltr"'), 'Docs has English reading semantics');
assert(docs.includes('<ReadingLanguageNote />'), 'Docs discloses untranslated copy');
assert(docs.includes("import docsFaq from './docs-faq.json'"), 'React reads the canonical FAQ');
assert(seo.includes("readFileSync('src/views/docs-faq.json', 'utf8')"), 'FAQ structured data reads the same source');
assert(new Set(faq.map(item => item.question)).size === faq.length, 'FAQ questions are unique');
for (const { question, answer } of faq) {
  assert(question && answer, 'FAQ has a question and answer');
  if (built) {
    const html = read('dist/seo/docs.html');
    assert(html.includes(`<h3>${question}</h3>`), 'FAQ is visible without JavaScript');
    assert(html.includes(`<p>${answer}</p>`), 'Visible FAQ answer matches structured data');
  }
}
for (const id of ['spaces', 'hop']) {
  assert(docs.includes(`id: '${id}'`) && docs.includes(`case '${id}':`), `${id}: reachable Docs chapter`);
}

const guides = ['index', 'how-it-works', 'privacy', 'security', 'supported-devices', 'temporary-spaces', 'troubleshooting',
  'how-to-transfer-files-between-devices', 'how-to-transfer-files-from-phone-to-computer', 'how-to-transfer-files-from-computer-to-phone'];
for (const name of guides) {
  const html = read(`public/guides/${name}.html`);
  assert.equal([...html.matchAll(/<h1[ >]/g)].length, 1, `${name}: one page title`);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert(blocks.length, `${name}: crawlable structured data`);
  for (const [, json] of blocks) JSON.parse(json);
  for (const [, id] of html.matchAll(/href="\/docs#([^"]+)"/g)) {
    assert(docs.includes(`id: '${id}'`), `${name}: Docs link resolves to a chapter`);
  }
}
console.log(`[verify-reading-content] legal sources, anchor targets, language, FAQ parity, and ${guides.length} guide contracts passed${built ? ' (including built HTML)' : ''}`);
