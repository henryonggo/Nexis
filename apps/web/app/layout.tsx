import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Nexis — HR & Payroll Indonesia",
  description: "HR & Payroll SaaS for Indonesia. Multi-company, compliant, free for your first 5 employees.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} className={inter.variable}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('nexis-theme') || 'soft-ui';
                if (theme === 'mono') {
                  document.documentElement.classList.add('theme-mono');
                }
                const density = localStorage.getItem('nexis-density') || 'standard';
                if (density === 'compact') {
                  document.documentElement.classList.add('density-compact');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <Toaster position="top-right" richColors />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
