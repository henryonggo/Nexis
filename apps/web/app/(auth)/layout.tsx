export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="text-3xl font-bold text-brand">Nexis</div>
        <p className="mt-1 text-sm text-muted">HR &amp; Payroll untuk Indonesia</p>
      </div>
      {children}
      <p className="mt-6 text-center text-xs text-muted">
        Gratis untuk 5 karyawan pertama · Tanpa NPWP perusahaan
      </p>
    </main>
  );
}
