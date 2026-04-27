import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Delphi Duel",
  description: "The second opinion engine for Delphi prediction markets",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
