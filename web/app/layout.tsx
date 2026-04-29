import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Delphi Duel",
  description: "The second opinion engine for Delphi prediction markets",
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
