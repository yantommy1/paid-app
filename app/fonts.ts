import { DM_Mono, DM_Serif_Display, Inter } from "next/font/google";

/**
 * All next/font/google loaders must run at module scope (not inside components).
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/fonts
 */
export const fontInter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const fontDmSerifDisplay = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-dm-serif",
  display: "swap",
});

export const fontDmMono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-dm-mono",
  display: "swap",
});
