import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Sidewalk AI — Agency operations",
  description: "Discover, build, sell and deliver local business websites.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
