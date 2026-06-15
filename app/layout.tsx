import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AssetGalleryFilterController from "./components/AssetGalleryFilterController";
import EnhanceBriefAssets from "./components/EnhanceBriefAssets";
import FeedbackWidget from "./components/FeedbackWidget";
import GeneratedAssetSaverWidget from "./components/GeneratedAssetSaverWidget";
import HideBriefLogoControls from "./components/HideBriefLogoControls";
import LogoOverlayEditorWidget from "./components/LogoOverlayEditorWidget";
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
  title: "BUST IT NOW",
  description:
    "Plataforma de BUST para crear contenido visual alineado a la identidad de cada marca.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <HideBriefLogoControls />
        <EnhanceBriefAssets />
        <AssetGalleryFilterController />
        <GeneratedAssetSaverWidget />
        <LogoOverlayEditorWidget />
        <FeedbackWidget />
      </body>
    </html>
  );
}
