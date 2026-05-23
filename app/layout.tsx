import type { Metadata } from "next";
import { fontDmMono, fontInter, fontPlayfairDisplay } from "./fonts";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL;

export const metadata: Metadata = {
  metadataBase: appUrl ? new URL(appUrl) : undefined,
  title: "Paid — Get paid faster with AI invoice reminders",
  description:
    "Paid sends AI-drafted payment reminders from your real email address, automatically. Connect your accounting software and start collecting overdue invoices today.",
  openGraph: {
    title: "Paid — Get paid faster, without nagging.",
    description: "AI invoice reminders for boutique A/E firms.",
    url: appUrl,
    siteName: "Paid",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Paid — AI invoice reminders",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Paid — Get paid faster, without nagging.",
    description: "AI invoice reminders for boutique A/E firms.",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${fontInter.variable} ${fontPlayfairDisplay.variable} ${fontDmMono.variable} min-h-screen font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
