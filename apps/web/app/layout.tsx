import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { cookies } from "next/headers";
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

async function getDarkModeClass() {
  const cookieStore = await cookies();
  const mode = cookieStore.get("nexis-mode")?.value || "system";

  if (mode === "dark") {
    return "dark";
  }
  if (mode === "light") {
    return "";
  }
  // For "system", we'll let the inline script handle it
  return "";
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const darkModeClass = await getDarkModeClass();

  return (
    <html lang={locale} className={`${inter.variable} ${darkModeClass}`.trim()}>
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
                const mode = document.cookie.split('; ').find(row => row.startsWith('nexis-mode='))?.split('=')[1] || 'system';
                if (mode === 'system') {
                  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    document.documentElement.classList.add('dark');
                  }
                } else if (mode === 'dark') {
                  document.documentElement.classList.add('dark');
                } else if (mode === 'light') {
                  document.documentElement.classList.remove('dark');
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
