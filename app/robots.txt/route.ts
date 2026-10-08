import { SITE_URL } from "@/lib/marketing-content";
export function GET() {
  // Private pages remain crawlable so search engines can see their noindex tags.
  return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
