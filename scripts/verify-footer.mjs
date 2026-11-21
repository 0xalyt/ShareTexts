#!/usr/bin/env node
// Canonical reading pages must render SiteFooter, not a parallel implementation.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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
const about = readFileSync('src/views/About.tsx', 'utf8');
assert.ok(about.includes('<SiteFooter />'), 'About must render the actual shared footer');
assert.ok(!about.includes('<footer'), 'About must not carry a parallel footer implementation');
assert.ok(!existsSync('public/guides/about.html'), 'A static About would bypass the shared app footer');
const rewrites = JSON.parse(readFileSync('vercel.json', 'utf8'));
assert.equal(rewrites.rewrites.find(rule => rule.source === '/about')?.destination, '/seo/about.html');
assert.equal(rewrites.redirects.find(rule => rule.source === '/guides/about.html')?.destination, '/about');
const text = html => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
assert.ok(columns.every(column => column.title && column.links.every(([, label]) => label)), 'Footer navigation keys must resolve');
const promise = ['footer.noApp', 'footer.noAccount', 'footer.devices'].map(key => en[key]).join(' · ');
const shared = readFileSync('src/components/marketing/SiteFooter.tsx', 'utf8');
assert.ok(shared.includes("t('footer.devices')"), 'SiteFooter must use the storage-neutral promise');
assert.ok(shared.includes('<LanguageMenu inline'), 'Footer language control must use the viewport-safe sheet');
const docs = readFileSync('src/views/Docs.tsx', 'utf8');
assert.ok(docs.includes('<ReadingLanguageNote />') && about.includes('<ReadingLanguageNote />'), 'English-only pages must disclose their reading language');
assert.ok(docs.includes('lang="en" dir="ltr" className="reading-layout docs-layout"'), 'The whole English guide, including its navigation, must be LTR');
assert.ok(about.includes('lang="en" dir="ltr"'), 'The English About body must be LTR');

const locales = constant('src/lib/messages/registry.ts', 'LANGS').elements.map(locale => locale.properties.find(property => property.name.text === 'code').initializer.text);
for (const code of locales) {
  const file = `${code}.ts`;
  const locale = dictionary(`src/lib/messages/${file}`);
  for (const key of ['reading.englishOnly', 'footer.devices', 'home.subtitle', 'home.faq.a1', 'home.faq.a6', 'app.ended.sub', 'demo.s7']) {
    assert.ok(locale[key]?.trim(), `${file}: missing explicit audited copy for ${key}`);
  }
  assert.ok(!('footer.temporary' in locale), `${file}: obsolete storage promise`);
  if (code === 'zh-Hant') {
    for (const key of ['nav.docs', 'nav.about', 'nav.privacy', 'nav.terms', 'nav.guides', 'footer.useIt', 'footer.read', 'footer.legal', 'footer.open', 'footer.withCode', 'footer.devs', 'footer.report', 'footer.noApp', 'footer.noAccount', 'footer.followAria', 'footer.language']) {
      assert.ok(locale[key], `zh-Hant: header/footer must not inherit Simplified copy for ${key}`);
    }
  }
}
for (const file of readdirSync('public/guides').filter(file => file.endsWith('.html'))) {
  const html = readFileSync(`public/guides/${file}`, 'utf8');
  assert.ok(text(html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)[1]).includes(`ShareTexts · ${promise}`), `${file}: stale footer promise`);
}
console.log('[verify-footer] About uses SiteFooter; English-only reading is explicit in every locale; guide promises audited');
