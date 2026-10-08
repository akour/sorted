import type { Metadata } from "next";
import { SITE_URL } from "./marketing-content";

export function publicMetadata(title: string, description: string, path: string): Metadata {
  return {
    title, description, alternates: { canonical: `${SITE_URL}${path}` },
    openGraph: { title: `${title} | Sorted`, description, url: `${SITE_URL}${path}`, siteName: "Sorted", type: "website", locale: "en_US", images: [{ url: `${SITE_URL}/social-card.png`, width: 1200, height: 630, alt: "Sorted — Organic growth for apps and games" }] },
    twitter: { card: "summary_large_image", title: `${title} | Sorted`, description, images: [`${SITE_URL}/social-card.png`] },
  };
}

export const privateMetadata: Metadata = { robots: { index: false, follow: false } };

export function breadcrumbData(items: { name: string; path: string }[]) {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: `${SITE_URL}${item.path}` })) };
}
