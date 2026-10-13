import type { Metadata } from "next";
import "./globals.css";
import "./marketing.css";
import "./auth.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://sort3d.space"),
  verification: { google: "MVjA13pzwEvV2RZ-NbyHdcQx6AR6g5oUhAtkm09zIUw" },
  title: { default: "Sorted — ASO & AEO for Apps and Games", template: "%s | Sorted" },
  description: "Google Play ASO and answer engine optimization (AEO) services for mobile app and game teams, with localization and promotional planning in one workspace.",
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
