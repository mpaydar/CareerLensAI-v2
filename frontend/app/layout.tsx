import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ResumeSnap Live View",
  description: "Capture job highlights and upload your resume.",
};

const siteOrigin =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-resumesnap-app="1"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="resumesnap-app" content="1" />
        {siteOrigin ? (
          <meta name="resumesnap-api-origin" content={siteOrigin} />
        ) : null}
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
