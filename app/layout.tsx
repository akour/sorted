import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sorted — Organic marketing workspace",
  description: "One workspace for every product, channel, and organic growth decision.",
  other: {
    "codex-preview": "development",
  },
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
