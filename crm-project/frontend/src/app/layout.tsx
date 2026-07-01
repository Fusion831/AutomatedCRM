import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MemoryCRM | AI Relationship Operating System",
  description: "MemoryCRM is an AI-powered relationship operating system designed for founders to manage attention, context, and follow-ups without manual overhead.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#FAF9F6] text-[#1C1B19] font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
