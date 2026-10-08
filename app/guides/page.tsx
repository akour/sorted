import Link from "@/components/marketing/public-link";
import { ArrowUpRight } from "lucide-react";
import { SiteShell, Breadcrumbs, SectionLabel, CTA } from "@/components/marketing/site-shell";
import { guides } from "@/lib/marketing-content";
import { publicMetadata } from "@/lib/marketing-seo";
export const metadata = publicMetadata("Google Play ASO, Localization & Growth Guides", "Practical guides for Google Play app store optimization, listing localization, and promotional content planning from Sorted.", "/guides");
export default function GuidesPage() {
  return <SiteShell><div className="m-container"><Breadcrumbs items={[{ name: "Guides" }]} /><section className="m-page-hero"><SectionLabel>THE SORTED FIELD NOTES</SectionLabel><h1>A clearer way<br />to grow.</h1><p>Practical guidance for the decisions behind your next listing update, new locale, or product moment.</p></section><div className="m-guide-grid" style={{ paddingBottom: 85 }}>{guides.map((g, i) => <Link className="m-guide-card" key={g.slug} href={`/guides/${g.slug}`}><div className={`m-guide-visual m-tone-${i}`} aria-hidden="true"><span>0{i + 1}</span><ArrowUpRight size={40} strokeWidth={1} /></div><SectionLabel>{g.category} · {g.minutes}</SectionLabel><h2 style={{ fontSize: 27, margin: "15px 0" }}>{g.title}</h2><p>{g.description}</p></Link>)}</div></div><CTA /></SiteShell>;
}
