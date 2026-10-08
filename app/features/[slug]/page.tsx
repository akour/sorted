import Link from "@/components/marketing/public-link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { SiteShell, Breadcrumbs, CTA, FAQ, SectionLabel, JsonLd } from "@/components/marketing/site-shell";
import { ProductDemo } from "@/components/marketing/product-demo";
import { features, guides } from "@/lib/marketing-content";
import { publicMetadata, breadcrumbData } from "@/lib/marketing-seo";

export function generateStaticParams() { return features.map(f => ({ slug: f.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const f = features.find(f => f.slug === slug);
  if (!f) notFound();
  return publicMetadata(f.seoTitle, f.description, `/features/${f.slug}`);
}
export default async function FeaturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const f = features.find(f => f.slug === slug);
  if (!f) notFound();
  const guide = guides.find(g => g.slug === f.guide)!;
  return <SiteShell><JsonLd data={breadcrumbData([{ name: "Home", path: "/" }, { name: f.seoTitle, path: `/features/${f.slug}` }])} />
    <div className="m-container m-feature-detail"><Breadcrumbs items={[{ name: f.seoTitle }]} /><section className="m-page-hero"><SectionLabel>{f.eyebrow}</SectionLabel><h1>{f.title}</h1><p>{f.intro}</p><div className="m-actions"><a className="m-button" href="/sign-up">Start with your product <ArrowUpRight size={18} /></a><Link className="m-text-link" href="/integrations/google-play">Explore the connection <ArrowUpRight size={16} /></Link></div></section><ProductDemo initialTab={f.preview} />
    <section className="m-section"><SectionLabel>HOW IT WORKS</SectionLabel><div className="m-detail-steps">{f.steps.map(([title, text], i) => <article key={title}><span className="m-step-number">0{i + 1}</span><h2 style={{ fontSize: 25, margin: "20px 0 16px" }}>{title}</h2><p>{text}</p></article>)}</div><p className="m-pullquote">{f.takeaway}</p><Link className="m-related-guide" href={`/guides/${guide.slug}`}><div><SectionLabel>PUT IT INTO PRACTICE</SectionLabel><h3>{guide.title}</h3></div><ArrowUpRight size={24} /></Link></section></div><FAQ items={f.faqs} /><CTA /></SiteShell>;
}
