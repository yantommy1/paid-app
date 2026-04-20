import type { Metadata } from "next";
import {
  fontDmMono,
  fontDmSerifDisplay,
  fontInter,
} from "./fonts";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL;

export const metadata: Metadata = {
  metadataBase: appUrl ? new URL(appUrl) : undefined,
  title: "Paid — AI invoice follow-ups",
  description:
    "Automatically follow up on overdue invoices with AI-drafted reminders from your Gmail.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${fontInter.variable} ${fontDmSerifDisplay.variable} ${fontDmMono.variable} min-h-screen font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
