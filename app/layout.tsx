import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Archivo } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Price my Prang — Crash · Quote · Claim",
  description:
    "The fastest way to price a prang. Request repair quotes from nearby panel beaters in minutes.",
  icons: {
    icon: "/brand/svg/icon-fullcolour.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#00848D",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${spaceGrotesk.variable} ${archivo.variable} min-h-full antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
