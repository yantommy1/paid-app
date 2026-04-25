import { DM_Mono, Inter, Playfair_Display } from "next/font/google";

export const fontInter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const fontPlayfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const fontDmMono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-dm-mono",
  display: "swap",
});
