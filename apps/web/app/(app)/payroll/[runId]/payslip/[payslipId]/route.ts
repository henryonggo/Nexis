import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/company";

/**
 * Redirects to a short-lived signed URL for a payslip PDF in private storage.
 * Admins/managers download from the web run page; employees use the mobile app.
 * RLS on `payslips` + the company scope here keep one tenant out of another's PDFs.
 */
export async function GET(
  _req: Request,
  { params }: { params: { runId: string; payslipId: string } },
) {
  const active = await getActiveCompany();
  if (!active) return NextResponse.json({ error: "No active company" }, { status: 403 });
  if (active.role === "employee") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createClient();
  const { data: payslip } = await supabase
    .from("payslips")
    .select("pdf_path, payroll_items!inner(payroll_run_id)")
    .eq("id", params.payslipId)
    .eq("company_id", active.id)
    .maybeSingle();

  const item = payslip
    ? (Array.isArray(payslip.payroll_items) ? payslip.payroll_items[0] : payslip.payroll_items)
    : null;
  if (!payslip?.pdf_path || item?.payroll_run_id !== params.runId) {
    return NextResponse.json({ error: "Payslip not found" }, { status: 404 });
  }

  const { data: signed } = await supabase.storage
    .from("payslips")
    .createSignedUrl(payslip.pdf_path, 60);
  if (!signed?.signedUrl) {
    return NextResponse.json({ error: "Could not create download link" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
