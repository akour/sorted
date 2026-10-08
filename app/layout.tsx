import type { Metadata } from "next";
import "./globals.css";
import "./marketing.css";
import "./auth.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://sort3d.space"),
  title: { default: "Sorted — ASO & Organic Growth for Apps and Games", template: "%s | Sorted" },
  description: "Google Play ASO, listing localization, and promotional content planning in one workspace for mobile app and game teams.",
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
