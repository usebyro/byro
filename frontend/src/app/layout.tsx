import "./globals.css";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Providers } from "@/redux/Providers";
import Provider from "./web3auth/provider"
import { headers } from "next/headers";
import { cookieToWeb3AuthState } from "@web3auth/modal";
import { Toaster } from 'sonner';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Byro - Create and Host Unforgettable Events",
    template: "%s | Byro",
  },
  description:
    "Create your event page and host an unforgettable event today with Byro!",
  keywords: [
    "event management",
    "ticket sales",
    "event hosting",
    "event creation",
    "event platform",
    "event ticketing",
    "event experience",
  ],
  authors: [{ name: "Byro" }],
  creator: "Byro",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://usebyro.com",
    siteName: "Byro",
    title: "Byro - Create and Host Unforgettable Events",
    description:
      "Create your event page and host an unforgettable event today with Byro!",
    images: [
      {
        url: "/assets/waitlist.png",
        width: 1200,
        height: 630,
        alt: "Byro - Event Management Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Byro - Create and Host Unforgettable Events",
    description:
      "Create your event page and host an unforgettable event today with Byro!",
    images: ["/assets/waitlist.png"],
    creator: "@byroafrica",
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
  verification: {
    google: "your-google-site-verification",
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const web3authInitialState = cookieToWeb3AuthState(headersList.get('cookie'));
  return (
    <html lang="en">
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-PKLCDNL7QC"
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-PKLCDNL7QC');
      `}</Script>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Toaster
          position="top-right"
          richColors
          duration={3000}
         
        />

     <Provider web3authInitialState={web3authInitialState}>
          <Providers>
            <div className="flex flex-col min-h-screen">
              <main className="flex-1">{children}</main>
            </div>
          </Providers>
       </Provider>
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
      </body>
    </html>
  );
}
