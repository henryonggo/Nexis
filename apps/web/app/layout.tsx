import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexis — HR & Payroll Indonesia",
  description: "HR & Payroll SaaS for Indonesia. Multi-company, compliant, free for your first 5 employees.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
