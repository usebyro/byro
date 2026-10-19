import "./globals.css";
import { SITE_URL } from '@/lib/site';
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Providers } from "@/redux/Providers";
import AppToaster from '@/components/ui/AppToaster';
import { displayFont, bodyFont } from "@/components/brand/fonts";
import CookieBanner from "@/components/CookieBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Byro: Go out. Keep the memory.",
    template: "%s | Byro",
  },
  description:
    "Find events near you, get tickets in seconds and collect a stamp every time you show up. Organisers create events, sell tickets and check guests in for free.",
  keywords: [
    "community events",
    "discover events",
    "event communities",
    "event platform",
    "event stamps",
    "community platform",
  ],
  authors: [{ name: "Byro" }],
  creator: "Byro",
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: SITE_URL,
    siteName: "Byro",
    title: "Byro: Go out. Keep the memory.",
    description:
      "Find events near you, get tickets in seconds and collect a stamp every time you show up. Organisers create events, sell tickets and check guests in for free.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Byro: Go out. Keep the memory.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Byro: Go out. Keep the memory.",
    description:
      "Find events near you, get tickets in seconds and collect a stamp every time you show up. Organisers create events, sell tickets and check guests in for free.",
    images: ["/og-image.png"],
    creator: "@usebyro",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      {
        url: "/favicon_io/favicon.ico",
        sizes: "any",
      },
      {
        url: "/favicon_io/favicon-16x16.png",
        type: "image/png",
        sizes: "16x16",
      },
      {
        url: "/favicon_io/favicon-32x32.png",
        type: "image/png",
        sizes: "32x32",
      },
    ],
    apple: {
      url: "/favicon_io/apple-touch-icon.png",
      type: "image/png",
      sizes: "180x180",
    },
    other: [
      {
        rel: "android-chrome-192x192",
        url: "/favicon_io/android-chrome-192x192.png",
      },
      {
        rel: "android-chrome-512x512",
        url: "/favicon_io/android-chrome-512x512.png",
      },
    ],
  },
  manifest: "/favicon_io/site.webmanifest",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-PKLCDNL7QC"
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        // Consent Mode v2: nothing is stored until the visitor says yes (see components/CookieBanner).
        gtag('consent', 'default', {
          analytics_storage: 'denied', ad_storage: 'denied',
          ad_user_data: 'denied', ad_personalization: 'denied', wait_for_update: 500
        });
        try {
          var c = JSON.parse(localStorage.getItem('byro_cookie_consent') || 'null');
          if (c) {
            var ads = c.marketing ? 'granted' : 'denied';
            gtag('consent', 'update', {
              analytics_storage: c.analytics ? 'granted' : 'denied',
              ad_storage: ads, ad_user_data: ads, ad_personalization: ads
            });
          }
        } catch (e) {}
        gtag('js', new Date());
        gtag('config', 'G-PKLCDNL7QC');
      `}</Script>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${displayFont.variable} ${bodyFont.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                name: "Byro",
                url: SITE_URL,
                logo: `${SITE_URL}/favicon_io/android-chrome-512x512.png`,
                sameAs: ["https://twitter.com/byroafrica"],
              },
              {
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: "Byro",
                url: SITE_URL,
              },
            ]),
          }}
        />
        <AppToaster />

        <Providers>
          <div className="flex flex-col min-h-screen">
            <main className="flex-1">{children}</main>
          </div>
        </Providers>
        <Script id="tawk-to" strategy="afterInteractive">{`
          var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
          (function(){
            var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
            s1.async=true;
            s1.src='https://embed.tawk.to/6a36e24716fcef1d436fc177/1jrj67qeb';
            s1.charset='UTF-8';
            s1.setAttribute('crossorigin','*');
            s0.parentNode.insertBefore(s1,s0);
          })();
        `}</Script>
        <CookieBanner />
      </body>
    </html>
  );
}
