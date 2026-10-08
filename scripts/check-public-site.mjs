import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://127.0.0.1:4173';
const origin = 'https://sort3d.space';
const xml = await (await fetch(`${base}/sitemap.xml`)).text();
const paths = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => new URL(m[1]).pathname);
assert.equal(paths.length, 13, 'Expected complete public sitemap');
const titles = new Set();
for (const path of paths) {
  const res = await fetch(`${base}${path}`);
  assert.equal(res.status, 200, path);
  const html = await res.text();
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `${path}: one H1`);
  const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
  assert.equal(new URL(canonical).href, new URL(path, origin).href, `${path}: canonical`);
  const title = html.match(/<title>(.*?)<\/title>/)?.[1];
  assert.ok(title && !titles.has(title), `${path}: unique title`);
  titles.add(title);
  assert.match(html, /<meta name="description" content="[^"]{30,}"/, `${path}: description`);
  assert.match(html, /property="og:image" content="https:\/\/sort3d.space\/social-card.png"/, `${path}: share image`);
  assert.doesNotMatch(html, /name="robots" content="[^"]*noindex/, `${path}: indexable`);
  for (const match of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)) JSON.parse(match[1]);
  console.log(`PASS ${path}`);
}
for (const path of ['/sign-in', '/sign-up', '/forgot-password', '/reset-password']) {
  const html = await (await fetch(`${base}${path}`)).text();
  assert.match(html, /name="robots" content="[^"]*noindex/, `${path}: noindex`);
  assert.doesNotMatch(html, /name="googlebot" content="index,/, `${path}: no conflicting Googlebot directive`);
  console.log(`PASS private ${path}`);
}
for (const path of ['/features/does-not-exist', '/guides/does-not-exist', '/does-not-exist']) {
  assert.equal((await fetch(`${base}${path}`)).status, 404, `${path}: real 404`);
}
for (const path of ['/robots.txt', '/llms.txt', '/social-card.png', '/favicon.svg']) {
  assert.equal((await fetch(`${base}${path}`)).status, 200, `${path}: asset`);
}
console.log('Public routes, metadata, private noindex, structured data, assets, and 404 checks passed.');
