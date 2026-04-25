import type { Metadata } from "next";
import { fontDmMono, fontInter, fontPlayfairDisplay } from "./fonts";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL;

export const metadata: Metadata = {
  metadataBase: appUrl ? new URL(appUrl) : undefined,
  title: "Paid — Get paid faster with AI invoice reminders",
  description:
    "Paid sends AI-drafted payment reminders from your real email address, automatically. Connect your accounting software and start collecting overdue invoices today.",
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
