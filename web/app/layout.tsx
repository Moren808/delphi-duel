import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

// Public URL the production deploy lives at. Used as the metadataBase
// so relative og:image URLs resolve correctly when crawlers fetch them.
// Falls back to the Vercel preview URL when set, then a sensible local
// default for dev.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://delphi-duel.vercel.app");

const TITLE = "Delphi Duel";
const TAGLINE = "The second opinion engine for Delphi prediction markets";
const DESCRIPTION =
  "Two AI agents debate any Delphi prediction market peer-to-peer over the Gensyn AXL mesh, then a third AI judge issues a verdict. Read the full debate before you place a bet.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · Delphi Duel",
  },
  description: DESCRIPTION,
  applicationName: TITLE,
  keywords: [
    "Delphi",
    "prediction markets",
    "Gensyn",
    "AXL",
    "AI agents",
    "peer-to-peer",
    "agent debate",
  ],
  authors: [{ name: "Delphi Duel contributors" }],
  openGraph: {
    type: "website",
    siteName: TITLE,
    title: TITLE,
    description: TAGLINE,
    url: SITE_URL,
    locale: "en_US",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Delphi Duel — two AI agents debating a prediction market over Gensyn AXL",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: TAGLINE,
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/logo.jpg",
    apple: "/logo.jpg",
  },
};

// Synchronous head script: reads localStorage / prefers-color-scheme and
// sets the dark class on <html> before React hydrates, so the first paint
// matches the user's choice (no FOUC flash). Inlined here because string
// literals exported from "use client" modules become server-component
// references and don't serialise into the HTML.
const themeBootstrap = `
(function() {
  try {
    var s = localStorage.getItem('delphi-duel-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (s === 'dark' || (!s && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // suppressHydrationWarning is needed because the bootstrap script
  // mutates <html class> before React hydrates.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-screen bg-cream text-ink dark:bg-stone-950 dark:text-stone-100">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
