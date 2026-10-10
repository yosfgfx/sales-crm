import type { Metadata } from "next";
import localFont from "next/font/local";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, pageMetadata } from "@/lib/seo";
import ScrollToTop from "@/components/_common/scroll-to-top";
import { SIDEBAR_WIDTH_SCRIPT } from "@/lib/sidebar";
import "./globals.css";

const thmanyahSans = localFont({
  src: [
    {
      path: "../public/fonts/thmanyah/thmanyah-sans-light.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../public/fonts/thmanyah/thmanyah-sans-regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/thmanyah/thmanyah-sans-medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/thmanyah/thmanyah-sans-bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../public/fonts/thmanyah/thmanyah-sans-black.woff2",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-thmanyah-sans",
  display: "swap",
});

const thmanyahDisplay = localFont({
  src: [
    {
      path: "../public/fonts/thmanyah/thmanyah-display-light.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../public/fonts/thmanyah/thmanyah-display-regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/thmanyah/thmanyah-display-medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/thmanyah/thmanyah-display-bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../public/fonts/thmanyah/thmanyah-display-black.woff2",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-thmanyah-display",
  display: "swap",
});

const thmanyahSerif = localFont({
  src: [
    {
      path: "../public/fonts/thmanyah/thmanyah-serif-text-light.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../public/fonts/thmanyah/thmanyah-serif-text-regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/thmanyah/thmanyah-serif-text-medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/thmanyah/thmanyah-serif-text-bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../public/fonts/thmanyah/thmanyah-serif-text-black.woff2",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-thmanyah-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  ...pageMetadata({
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    path: "/",
  }),
};

const LOCALE_SCRIPT = `document.documentElement.lang="ar";document.documentElement.dir="rtl";`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      data-scroll-behavior="smooth"
      className={`${thmanyahSans.variable} ${thmanyahDisplay.variable} ${thmanyahSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `history.scrollRestoration="manual";${LOCALE_SCRIPT}${SIDEBAR_WIDTH_SCRIPT}`,
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        className="relative z-0 font-sans antialiased"
      >
        <ScrollToTop />
        {children}
      </body>
    </html>
  );
}
