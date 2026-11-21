#!/usr/bin/env node
// The static About footer must agree with SiteFooter and the locale dictionaries.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';

function constant(file, name) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const declaration = statement.declarationList.declarations.find(item => item.name.getText(source) === name);
    if (declaration) return declaration.initializer;
  }
  throw new Error(`${file}: missing ${name}`);
}

function dictionary(file) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const name = source.statements.find(ts.isExportAssignment).expression.text;
  const entries = constant(file, name).properties.map(property => [property.name.text, property.initializer.text]);
  assert.equal(new Set(entries.map(([key]) => key)).size, entries.length, `${file}: duplicate message key`);
  return Object.fromEntries(entries);
}

const en = dictionary('src/lib/messages/en.ts');
const columns = constant('src/components/marketing/SiteFooter.tsx', 'COLUMNS').elements.map(column => {
  const fields = Object.fromEntries(column.properties.map(property => [property.name.text, property.initializer]));
  return {
    title: en[fields.title.text],
    links: fields.links.elements.map(link => {
      const values = Object.fromEntries(link.properties.map(property => [property.name.text, property.initializer.text]));
      return [values.href, en[values.label]];
    }),
  };
});
const about = readFileSync('public/guides/about.html', 'utf8').match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)[1];
const text = html => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const actual = [...about.matchAll(/<nav\b[^>]*class="footer-col"[^>]*>([\s\S]*?)<\/nav>/g)].map(([, nav]) => ({
  title: text(nav.match(/<h2>(.*?)<\/h2>/)[1]),
  links: [...nav.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)].map(([, href, label]) => [href, text(label)]),
}));
assert.deepEqual(actual, columns, 'About and SiteFooter navigation differ');
assert.equal(text(about.match(/class="footer-blurb">(.*?)<\/p>/)[1]), en['home.subtitle'], 'Footer blurbs differ');
const promise = ['footer.noApp', 'footer.noAccount', 'footer.devices'].map(key => en[key]).join(' · ');
assert.ok(text(about).includes(`ShareTexts · ${promise}`), 'About footer promise differs');
const shared = readFileSync('src/components/marketing/SiteFooter.tsx', 'utf8');
assert.ok(shared.includes("t('footer.devices')"), 'SiteFooter must use the storage-neutral promise');
assert.ok(shared.includes('<LanguageMenu inline'), 'Footer language control must use the viewport-safe sheet');
assert.ok(text(about).includes(shared.match(/iPhone ·[^<\n]+/)[0].trim()), 'Supported-platform copy differs');

const locales = constant('src/lib/messages/registry.ts', 'LANGS').elements.map(locale => locale.properties.find(property => property.name.text === 'code').initializer.text);
for (const code of locales) {
  const file = `${code}.ts`;
  const locale = dictionary(`src/lib/messages/${file}`);
  for (const key of ['footer.devices', 'home.faq.a1', 'home.faq.a6', 'app.ended.sub', 'demo.s7']) {
    assert.ok(locale[key]?.trim(), `${file}: missing explicit audited copy for ${key}`);
  }
  assert.ok(!('footer.temporary' in locale), `${file}: obsolete storage promise`);
}
for (const file of readdirSync('public/guides').filter(file => file.endsWith('.html'))) {
  const html = readFileSync(`public/guides/${file}`, 'utf8');
  assert.ok(text(html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)[1]).includes(`ShareTexts · ${promise}`), `${file}: stale footer promise`);
}
console.log('[verify-footer] About/shared copy and links match; all locale and guide promises audited');
