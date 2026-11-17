import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: "CREDVAIL — Blockchain-Verified, Privacy-Preserving Digital Credential Infrastructure",
  description:
    "Institutional SaaS platform for automated certificate issuance, W3C Verifiable Credentials 2.0, ECDSA-SD-2023 selective disclosure, and Ethereum Sepolia Merkle-root verification.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/brand/brand-symbol-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/brand-symbol-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "CREDVAIL — Blockchain-Verified Digital Credentials",
    description: "W3C VC 2.0 & Ethereum Sepolia Testnet Credential Infrastructure",
    images: [{ url: "/brand/logo-horizontal.png", width: 2104, height: 556, alt: "CREDVAIL" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground antialiased selection:bg-primary/20 selection:text-primary">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
