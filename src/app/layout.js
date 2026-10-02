import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { App } from 'antd';
import TrustThemeProvider from "@/components/Base/TrustThemeProvider";
import { THEME_CSS_CACHE_KEY, THEME_STYLE_ID } from "@/utils/trust/theme";
import { AuthProvider } from "@/components/Base/AuthProvider";
import MainLayout from "@/components/Base/MainLayout";
import FcmTokenManagerClient from "@/components/Base/FcmTokenManagerClient";
import TrustLoader from "@/components/Base/TrustLoader";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Marriage Trust Admin Panel",
  description: "Admin panel for marriage trust NGO management",
};

// Runs before the first paint: re-applies the saved theme colours from this
// browser so the panel never flashes the default colours while loading.
// (TrustLoader keeps this cache up to date.)
const THEME_BOOT_SCRIPT = `(function(){try{var c=localStorage.getItem('${THEME_CSS_CACHE_KEY}');if(c){var s=document.createElement('style');s.id='${THEME_STYLE_ID}';s.textContent=c;document.head.appendChild(s);}}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
         <AuthProvider>
            <FcmTokenManagerClient />
            <TrustLoader />
         <TrustThemeProvider>
           <App>
            <MainLayout>
          {children}
            </MainLayout>
           </App>
        </TrustThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}