# Public discovery and marketing site

## Positioning

Sorted (also known as Sort3d, at sort3d.space) is an organic growth workspace for mobile app and game teams. Public pages explain Google Play ASO, listing localization, promotional planning, and the actual integration boundaries. Do not imply that Sorted itself has an Android store listing, guarantee rankings, invent customer outcomes, or advertise direct promotional-event submission.

## Public information architecture

- Homepage: product positioning, illustrative interactive preview, workflow, feature links, FAQs.
- Three feature pages: Google Play ASO, app localization, promotional content.
- Google Play integration page: supported actions, permissions, and limitations.
- Guides hub and three original guides, each with official references and related product links.
- Free Google Play listing checker: browser-only 30/80/4,000 length validation, editable preview, copy action. No AI requests or draft storage. UTF-16 counting matches the existing publishing validator, and the UI explains the limitation.
- About, contact, and early-access information. No invented prices or social proof.

The sample Daylight workspace is illustrative, not a screenshot of a customer account. Public content must stay consistent with implemented product behavior.

## Technical foundations

- Server-rendered descriptive content; one H1 and a unique title, description, and canonical URL per public page.
- Organization, WebSite, SoftwareApplication, Article, and breadcrumb structured data where appropriate. No fabricated ratings or offers.
- Open Graph and Twitter previews with a local 1,200 × 630 image.
- `/sitemap.xml` includes only the 13 public content pages. Update the content date when the content changes materially, not on every request.
- `/robots.txt` allows public crawling and excludes APIs. Account and admin pages use `noindex`; authentication remains the security boundary. Crawling a login page is permitted so its noindex directive can be read.
- `/llms.txt` is a supplementary factual map, not a ranking requirement or a guarantee of AI citations.
- Native anchors are intentional on public pages: they avoid the deployed vinext client-router compatibility issue and work without JavaScript.
- Public styling is scoped under `.m-*`; existing workspace and admin behavior stays intact.

## Verification

Use the supported Node version from `package.json`.

```sh
npm run build
node --experimental-strip-types --test tests/listing-checker.test.ts
node scripts/check-public-site.mjs http://127.0.0.1:4173
node scripts/check-public-site.mjs https://sort3d.space
node scripts/render-social-card.mjs
```

The smoke check verifies public HTTP responses, unique titles, descriptions, H1s, canonicals, share images, JSON-LD parsing, private-page noindex, real 404 responses, and public assets. Browser testing also covers mobile navigation, preview tabs, example loading, invalid field length, clearing fields, and clipboard feedback.

Publish through GitHub `akour/sorted` main → the existing Cloudflare `sorted` Worker. Do not change domains, bindings, secrets, or unrelated infrastructure for a content release.

## Next growth work

1. Verify the domain in Google Search Console if it is not already verified. Submit `https://sort3d.space/sitemap.xml` and inspect the homepage and core feature pages. DNS verification changes require checking the existing domain records first.
2. Establish a baseline for indexed pages, search queries, impressions, clicks, and sign-up conversion. Choose analytics with an explicit privacy review; this release does not add third-party tracking.
3. Replace illustrative examples with permissioned, reproducible product walkthroughs and original findings. Publish useful updates based on real app workflows, not large volumes of generic keyword pages.
4. Review source freshness, internal links, mobile experience, and performance after changes. Confirm every claim against the product.
5. Earn relevant mentions and links through useful resources and genuine product usage. Search rankings and AI inclusion are outcomes to measure, not promises to make.

Official guidance: https://developers.google.com/search/docs/appearance/ai-features and https://developers.google.com/search/docs/fundamentals/seo-starter-guide . Google says its usual SEO foundations apply to AI features; there is no special AI markup required.
