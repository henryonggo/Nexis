import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import PDFDocument from "pdfkit";
import { Writable } from "stream";
import XLSX from "xlsx";
import type { Database } from "@nexis/types";
import {
  buildPayrollConfig,
  buildAnnualTaxConfig,
  computeMonthlyPayroll,
  computeDecemberReconciliation,
  computeThr,
  ptkpCategory,
  type EmployeePayrollInput,
  type JkkRiskClass,
  type PtkpStatus,
  type TerCategory,
} from "@nexis/payroll";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../apps/web/.env.local") });
dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error("CRITICAL: SUPABASE_SERVICE_ROLE_KEY is missing in env.");
  process.exit(1);
}

// Service role client bypasses RLS to allow backend worker writes
const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/** Sum fixed allowances helper */
function sumFixedAllowances(value: unknown): number {
  if (typeof value === "number") return Math.round(value);
  if (Array.isArray(value)) {
    return value.reduce<number>((acc, item) => {
      const amount = typeof item === "number" ? item : Number((item as { amount?: unknown })?.amount ?? 0);
      return acc + (Number.isFinite(amount) ? Math.round(amount) : 0);
    }, 0);
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).reduce<number>((acc, v) => {
      const amount = Number(v);
      return acc + (Number.isFinite(amount) ? Math.round(amount) : 0);
    }, 0);
  }
  return 0;
}

/** Check if a date is a weekend day or public holiday */
function isRestDayOrHoliday(dateStr: string, holidayDates: Set<string>, workweekDays: number): boolean {
  const date = new Date(dateStr);
  const day = date.getUTCDay(); // UTC day to avoid timezone offset shifts on YYYY-MM-DD
  if (day === 0) return true; // Sunday is always a rest day
  if (day === 6 && workweekDays === 5) return true; // Saturday is rest day for 5-day workweeks
  return holidayDates.has(dateStr);
}

/** Compute months of tenure for THR proration */
function monthsOfService(joinDate: string | null, year: number, month: number): number {
  if (!joinDate) return 12; // default to full entitlement
  const join = new Date(joinDate);
  const periodEnd = new Date(Date.UTC(year, month, 0)); // last day of the month
  if (Number.isNaN(join.getTime())) return 12;
  const months =
    (periodEnd.getUTCFullYear() - join.getUTCFullYear()) * 12 +
    (periodEnd.getUTCMonth() - join.getUTCMonth()) +
    1;
  return Math.max(0, months);
}

/** Filter rows by effective date range */
function effectiveOn<T extends { effective_from: string; effective_to: string | null }>(
  rows: T[],
  date: string,
): T[] {
  return rows.filter(
    (r) => r.effective_from <= date && (r.effective_to == null || r.effective_to >= date),
  );
}

/** PDF generator streaming to Buffer */
function generatePayslipPdfBuffer(data: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    const stream = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(chunk);
        callback();
      },
    });
    doc.pipe(stream);

    // Header
    doc.fontSize(20).text("SLIP GAJI (PAYSLIP)", { align: "center" });
    doc.fontSize(10).text("Nexis HR & Payroll System", { align: "center" });
    doc.moveDown(2);

    // Metadata Table Outline
    doc.fontSize(11).font("Helvetica-Bold").text(`Perusahaan: ${data.companyName}`);
    doc.font("Helvetica").fontSize(10).text(`Nama Karyawan: ${data.employeeName}`);
    doc.text(`Bulan / Tahun: ${data.period}`);
    doc.text(`Status PTKP: ${data.ptkpStatus}`);
    doc.text(`NPWP: ${data.hasNpwp ? data.npwp : "Tidak Ada"}`);
    doc.text(`Tipe Run: ${data.runType.toUpperCase()}`);
    doc.moveDown(1.5);

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);

    if (data.runType === "thr") {
      doc.fontSize(12).font("Helvetica-Bold").text("RINCIAN PEMBAYARAN", { underline: true });
      doc.font("Helvetica").fontSize(10);
      doc.text(`Masa Kerja: ${data.monthsWorked} bulan`);
      doc.text(`Tunjangan Hari Raya (THR): Rp ${data.grossPay.toLocaleString("id-ID")}`);
      doc.moveDown();
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown();
      doc.fontSize(14).font("Helvetica-Bold").text(`TAKE HOME PAY (NET): Rp ${data.netPay.toLocaleString("id-ID")}`);
      doc.font("Helvetica");
    } else {
      // Income Section
      doc.fontSize(12).font("Helvetica-Bold").text("PENGHASILAN (EARNINGS)", { underline: true });
      doc.font("Helvetica").fontSize(10);
      doc.text(`Gaji Pokok: Rp ${data.baseSalary.toLocaleString("id-ID")}`);
      doc.text(`Tunjangan Tetap: Rp ${data.allowances.toLocaleString("id-ID")}`);
      doc.text(`Lembur (Overtime): Rp ${data.overtimePay.toLocaleString("id-ID")}`);
      if (data.reimbursementTaxable && data.reimbursementTaxable > 0) {
        doc.text(`Reimbursement (Taxable): Rp ${data.reimbursementTaxable.toLocaleString("id-ID")}`);
      }
      doc.font("Helvetica-Bold").text(`Total Penghasilan Kotor (Gross): Rp ${data.grossPay.toLocaleString("id-ID")}`);
      doc.font("Helvetica").moveDown(1.5);

      // Deductions Section
      doc.fontSize(12).font("Helvetica-Bold").text("POTONGAN (DEDUCTIONS)", { underline: true });
      doc.font("Helvetica").fontSize(10);
      doc.text(`BPJS Kesehatan (Karyawan): Rp ${data.bpjsKesEmployee.toLocaleString("id-ID")}`);
      doc.text(`BPJS Ketenagakerjaan JHT (Karyawan): Rp ${data.jhtEmployee.toLocaleString("id-ID")}`);
      doc.text(`BPJS Ketenagakerjaan JP (Karyawan): Rp ${data.jpEmployee.toLocaleString("id-ID")}`);
      doc.text(`PPh 21 (Pajak): Rp ${data.pph21.toLocaleString("id-ID")}`);
      doc.font("Helvetica-Bold").text(`Total Potongan: Rp ${data.totalDeductions.toLocaleString("id-ID")}`);
      doc.font("Helvetica").moveDown(1.5);

      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(1);

      // Net Pay
      if (data.reimbursementNonTaxable && data.reimbursementNonTaxable > 0) {
        doc.text(`Reimbursement (Non-taxable): Rp ${data.reimbursementNonTaxable.toLocaleString("id-ID")}`);
      }
      doc.fontSize(14).font("Helvetica-Bold").text(`TAKE HOME PAY (NET): Rp ${data.netPay.toLocaleString("id-ID")}`);
      doc.font("Helvetica").moveDown(2);

      // Employer Contributions
      doc.fontSize(10).font("Helvetica-Bold").text("KONTRIBUSI PERUSAHAAN (INFORMASIONAL):", { underline: true });
      doc.font("Helvetica");
      doc.text(`BPJS Kesehatan (Perusahaan 4%): Rp ${data.bpjsKesEmployer.toLocaleString("id-ID")}`);
      doc.text(`BPJS JHT (Perusahaan 3.7%): Rp ${data.jhtEmployer.toLocaleString("id-ID")}`);
      doc.text(`BPJS JP (Perusahaan 2%): Rp ${data.jpEmployer.toLocaleString("id-ID")}`);
      doc.text(`BPJS JKK (Perusahaan): Rp ${data.jkkEmployer.toLocaleString("id-ID")}`);
      doc.text(`BPJS JKM (Perusahaan 0.30%): Rp ${data.jkmEmployer.toLocaleString("id-ID")}`);
    }

    doc.end();
    stream.on("finish", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err) => reject(err));
  });
}

/** Run Processing Endpoint */
app.post("/process", async (req, res) => {
  const { runId } = req.body;
  if (!runId || typeof runId !== "string") {
    return res.status(400).json({ error: "runId parameter is required." });
  }

  console.log(`[Worker] Received process request for run: ${runId}`);

  try {
    // 1. Atomically transition run from queued/draft to processing
    const { data: run, error: runError } = await supabase
      .from("payroll_runs")
      .update({ status: "processing" })
      .eq("id", runId)
      .in("status", ["queued", "draft"])
      .select("*, companies(name)")
      .single();

    if (runError || !run) {
      console.error(`[Worker] Failed to transition run ${runId}:`, runError?.message);
      return res.status(409).json({
        error: "Run not found or not in queued/draft state. Possible concurrent run processing.",
      });
    }

    const companyName = (run.companies as any)?.name || "Nexis Tenant";
    const year = run.period_year;
    const month = run.period_month;
    const runType = run.status === "draft" ? "monthly" : "monthly"; // default, check if we want THR later
    // Actually the payroll_runs might not store runType directly in columns. Let's infer runType:
    // If the snapshot has runType or we can check the config_snapshot
    const configSnapshot = run.config_snapshot as any;
    const isThr = configSnapshot?.runType === "thr" || run.total_bpjs_employee === 0 && run.total_pph21 === 0 && run.total_gross > 0; // fallback check
    const inferredRunType = isThr ? "thr" : "monthly";

    console.log(`[Worker] Processing ${inferredRunType} payroll run for ${companyName} (${month}/${year})`);

    const startDateStr = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const endDateStr = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    // 2. Fetch all dependent database tables
    const [
      { data: settings },
      { data: employees },
      { data: comps },
      { data: taxes },
      { data: overtimeEntries },
      { data: holidays },
      { data: bpjsRows },
      { data: terRows },
      { data: ptkpRows },
      { data: bracketRows },
      { data: approvedClaims },
    ] = await Promise.all([
      supabase.from("company_settings").select("*").eq("company_id", run.company_id).maybeSingle(),
      supabase.from("employees").select("*").eq("company_id", run.company_id).eq("status", "active"),
      supabase.from("compensation").select("*").eq("company_id", run.company_id),
      supabase.from("tax_profile").select("*").eq("company_id", run.company_id),
      supabase.from("overtime_entries").select("*").eq("company_id", run.company_id).eq("is_approved", true).gte("date", startDateStr).lte("date", endDateStr),
      supabase.from("holidays").select("date").gte("date", startDateStr).lte("date", endDateStr),
      supabase.from("bpjs_config").select("*"),
      supabase.from("ter_rates").select("*"),
      supabase.from("ptkp_rates").select("*"),
      supabase.from("tax_brackets").select("*"),
      supabase.from("reimbursement_claims").select("*, claim_types(taxable)").eq("company_id", run.company_id).eq("status", "approved").is("payroll_run_id", null),
    ]);

    // Map claims by employee
    const claimsByEmployee = new Map<string, { taxableAmount: number; nonTaxableAmount: number; claimIds: string[] }>();
    for (const claim of approvedClaims || []) {
      const empId = claim.employee_id;
      const current = claimsByEmployee.get(empId) || { taxableAmount: 0, nonTaxableAmount: 0, claimIds: [] };
      
      const isTaxable = (claim.claim_types as any)?.taxable ?? false;
      const amount = Number(claim.amount);
      
      if (isTaxable) {
        current.taxableAmount += amount;
      } else {
        current.nonTaxableAmount += amount;
      }
      current.claimIds.push(claim.id);
      claimsByEmployee.set(empId, current);
    }

    if (!employees || employees.length === 0) {
      console.warn(`[Worker] No active employees found for company ${run.company_id}. Completing run with 0 items.`);
      await supabase
        .from("payroll_runs")
        .update({
          status: "completed",
          total_gross: 0,
          total_net: 0,
          total_pph21: 0,
          total_bpjs_employee: 0,
          total_bpjs_employer: 0,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return res.status(200).json({ success: true, message: "Run completed with 0 employees." });
    }

    // Map helpers
    const activeBpjs = effectiveOn(bpjsRows || [], startDateStr);
    const activeTer = effectiveOn(terRows || [], startDateStr);
    const activePtkp = effectiveOn(ptkpRows || [], startDateStr);
    const activeBrackets = effectiveOn(bracketRows || [], startDateStr);

    const config = buildPayrollConfig(activeBpjs, activeTer);
    const annualConfig = buildAnnualTaxConfig(activePtkp, activeBrackets);
    const holidayDates = new Set(holidays?.map((h) => h.date) || []);

    const compByEmployee = new Map<string, any>();
    for (const comp of comps || []) {
      if (comp.effective_from > startDateStr) continue;
      const existing = compByEmployee.get(comp.employee_id);
      if (!existing || comp.effective_from > existing.effective_from) {
        compByEmployee.set(comp.employee_id, comp);
      }
    }

    const taxByEmployee = new Map<string, any>();
    for (const tax of taxes || []) {
      taxByEmployee.set(tax.employee_id, tax);
    }

    const workweekDays = settings?.workweek_days ?? 5;
    const rawRisk = settings?.jkk_risk_class ?? "low";
    const jkkRiskClass: JkkRiskClass = ["very_low", "low", "medium", "high", "very_high"].includes(rawRisk)
      ? (rawRisk as JkkRiskClass)
      : "low";

    // December reconciliation YTD loading
    const ytdMap = new Map<string, { annualGross: number; annualPensionJht: number; ytdPph21Withheld: number }>();
    if (month === 12 && inferredRunType !== "thr") {
      const { data: ytdItems } = await supabase
        .from("payroll_items")
        .select(`
          employee_id,
          gross_pay,
          jht_employee,
          jp_employee,
          pph21,
          payroll_runs!inner (
            period_year,
            period_month,
            status
          )
        `)
        .eq("company_id", run.company_id)
        .eq("payroll_runs.period_year", year)
        .lte("payroll_runs.period_month", 11)
        .in("payroll_runs.status", ["completed", "paid"]);

      for (const item of ytdItems || []) {
        const empId = item.employee_id;
        const current = ytdMap.get(empId) || { annualGross: 0, annualPensionJht: 0, ytdPph21Withheld: 0 };
        ytdMap.set(empId, {
          annualGross: current.annualGross + Number(item.gross_pay),
          annualPensionJht: current.annualPensionJht + Number(item.jht_employee) + Number(item.jp_employee),
          ytdPph21Withheld: current.ytdPph21Withheld + Number(item.pph21),
        });
      }
    }

    // 3. Clear existing payroll items / payslips for this run (safety override)
    await supabase.from("payroll_items").delete().eq("payroll_run_id", runId);

    const processedResults = [];
    
    // 4. Iterate and compute each employee
    for (const emp of employees) {
      const comp = compByEmployee.get(emp.id);
      const tax = taxByEmployee.get(emp.id);

      if (!comp) {
        console.warn(`[Worker] Employee ${emp.full_name} lacks compensation. Skipping.`);
        continue;
      }

      const baseSalary = Number(comp.base_salary);
      const allowances = sumFixedAllowances(comp.fixed_allowances);
      const ptkpStatus: PtkpStatus = (tax?.ptkp_status as PtkpStatus) || "TK/0";
      const hasNpwp = tax?.has_npwp ?? false;

      let itemResult: any;

      const empClaims = claimsByEmployee.get(emp.id) || { taxableAmount: 0, nonTaxableAmount: 0, claimIds: [] };

      if (inferredRunType === "thr") {
        const months = monthsOfService(emp.join_date, year, month);
        const thrAmount = Number(computeThr(baseSalary, months));

        itemResult = {
          gross: thrAmount,
          bpjsKesEmployee: 0,
          bpjsKesEmployer: 0,
          jhtEmployee: 0,
          jhtEmployer: 0,
          jpEmployee: 0,
          jpEmployer: 0,
          jkkEmployer: 0,
          jkmEmployer: 0,
          pph21: 0,
          terRateBps: 0,
          netPay: thrAmount,
          baseSalary,
          allowances: 0,
          overtimePay: 0,
          variableEarnings: 0,
          reimbursementNonTaxable: 0,
          terCategory: null,
          monthsWorked: months,
        };
      } else {
        // Compute Overtime hours
        let weekdayHours = 0;
        let restDayHours = 0;
        const empOt = (overtimeEntries || []).filter((o) => o.employee_id === emp.id);
        for (const ot of empOt) {
          const hours = ot.duration_minutes / 60;
          if (isRestDayOrHoliday(ot.date, holidayDates, workweekDays)) {
            restDayHours += hours;
          } else {
            weekdayHours += hours;
          }
        }

        // Calculate lembur rupiah
        const hourlyBase = Math.round(baseSalary / 173);
        
        // Calculate weekday OT
        let weekdayOtPay = 0;
        if (weekdayHours > 0) {
          const ceilHours = Math.ceil(weekdayHours);
          const firstHour = Math.round(hourlyBase * 1.5);
          const restHours = Math.round(hourlyBase * 2.0) * (ceilHours - 1);
          weekdayOtPay = firstHour + restHours;
        }

        // Calculate restday OT
        let restDayOtPay = 0;
        if (restDayHours > 0) {
          const ceilHours = Math.ceil(restDayHours);
          const band1 = Math.min(ceilHours, 8);
          const band2 = Math.min(Math.max(ceilHours - 8, 0), 1);
          const band3 = Math.min(Math.max(ceilHours - 9, 0), 2);
          restDayOtPay = 
            Math.round(hourlyBase * 2.0) * band1 +
            Math.round(hourlyBase * 3.0) * band2 +
            Math.round(hourlyBase * 4.0) * band3;
        }
        
        const overtimePay = weekdayOtPay + restDayOtPay;

        const input: EmployeePayrollInput = {
          baseSalary,
          fixedAllowances: allowances,
          overtimePay,
          variableEarnings: empClaims.taxableAmount,
          ptkpStatus,
          hasNpwp,
          jkkRiskClass,
          bpjsKesEnrolled: comp.bpjs_kes_enrolled,
          jhtEnrolled: comp.jht_enrolled,
          jpEnrolled: comp.jp_enrolled,
        };

        const result = computeMonthlyPayroll(input, config);

        // Add non-taxable claims directly to net pay
        result.netPay += empClaims.nonTaxableAmount;

        // December progressive reconciliation override
        if (month === 12) {
          const ytd = ytdMap.get(emp.id) || { annualGross: 0, annualPensionJht: 0, ytdPph21Withheld: 0 };
          const annualGross = ytd.annualGross + result.gross;
          const annualPensionJht = ytd.annualPensionJht + result.jhtEmployee + result.jpEmployee;

          const decRecon = computeDecemberReconciliation(
            {
              annualGross,
              ptkpStatus,
              hasNpwp,
              annualPensionJhtEmployee: annualPensionJht,
              ytdPph21Withheld: ytd.ytdPph21Withheld,
            },
            annualConfig
          );

          result.pph21 = Math.max(0, decRecon.decemberWithholding);
          const deductions = result.bpjsKesEmployee + result.jhtEmployee + result.jpEmployee + result.pph21;
          result.netPay = Math.max(0, result.gross - deductions) + empClaims.nonTaxableAmount;
        }

        itemResult = {
          ...result,
          baseSalary,
          allowances,
          overtimePay,
          variableEarnings: empClaims.taxableAmount,
          reimbursementNonTaxable: empClaims.nonTaxableAmount,
          terCategory: ptkpCategory(ptkpStatus),
        };
      }

      // 5. Insert payroll item row
      const { data: item, error: itemErr } = await supabase
        .from("payroll_items")
        .insert({
          company_id: run.company_id,
          payroll_run_id: runId,
          employee_id: emp.id,
          gross_pay: itemResult.gross,
          base_salary: itemResult.baseSalary,
          allowances: itemResult.allowances,
          overtime_pay: itemResult.overtimePay,
          bpjs_kes_employee: itemResult.bpjsKesEmployee,
          bpjs_kes_employer: itemResult.bpjsKesEmployer,
          jht_employee: itemResult.jhtEmployee,
          jht_employer: itemResult.jhtEmployer,
          jp_employee: itemResult.jpEmployee,
          jp_employer: itemResult.jpEmployer,
          jkk_employer: itemResult.jkkEmployer,
          jkm_employer: itemResult.jkmEmployer,
          pph21: itemResult.pph21,
          ter_category: itemResult.terCategory,
          ter_rate_bps: itemResult.terRateBps,
          net_pay: itemResult.netPay,
          breakdown: itemResult,
        })
        .select("id")
        .single();

      if (itemErr || !item) {
        throw new Error(`Failed to write payroll_item for ${emp.full_name}: ${itemErr?.message}`);
      }

      // 6. Generate Payslip PDF
      const pdfData = {
        companyName,
        employeeName: emp.full_name,
        period: `${month}/${year}`,
        ptkpStatus,
        hasNpwp,
        npwp: tax?.npwp || "",
        runType: inferredRunType,
        monthsWorked: itemResult.monthsWorked || 0,
        baseSalary: itemResult.baseSalary,
        allowances: itemResult.allowances,
        overtimePay: itemResult.overtimePay,
        reimbursementTaxable: itemResult.variableEarnings || 0,
        reimbursementNonTaxable: itemResult.reimbursementNonTaxable || 0,
        grossPay: itemResult.gross,
        bpjsKesEmployee: itemResult.bpjsKesEmployee,
        jhtEmployee: itemResult.jhtEmployee,
        jpEmployee: itemResult.jpEmployee,
        pph21: itemResult.pph21,
        totalDeductions: itemResult.bpjsKesEmployee + itemResult.jhtEmployee + itemResult.jpEmployee + itemResult.pph21,
        netPay: itemResult.netPay,
        bpjsKesEmployer: itemResult.bpjsKesEmployer,
        jhtEmployer: itemResult.jhtEmployer,
        jpEmployer: itemResult.jpEmployer,
        jkkEmployer: itemResult.jkkEmployer,
        jkmEmployer: itemResult.jkmEmployer,
      };

      const pdfBuffer = await generatePayslipPdfBuffer(pdfData);

      // Upload PDF to Supabase Storage
      const pdfPath = `${run.company_id}/${emp.id}/${runId}_${item.id}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("payslips")
        .upload(pdfPath, pdfBuffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Failed to upload payslip PDF to storage for ${emp.full_name}: ${uploadError.message}`);
      }

      // 7. Insert payslip row
      const { error: slipErr } = await supabase
        .from("payslips")
        .insert({
          company_id: run.company_id,
          payroll_item_id: item.id,
          employee_id: emp.id,
          pdf_path: pdfPath,
        });

      if (slipErr) {
        throw new Error(`Failed to create payslip record for ${emp.full_name}: ${slipErr.message}`);
      }

      processedResults.push({
        gross: itemResult.gross,
        netPay: itemResult.netPay,
        pph21: itemResult.pph21,
        bpjsEmployee: itemResult.bpjsKesEmployee + itemResult.jhtEmployee + itemResult.jpEmployee,
        bpjsEmployer: itemResult.bpjsKesEmployer + itemResult.jhtEmployer + itemResult.jpEmployer + itemResult.jkkEmployer + itemResult.jkmEmployer,
      });
    }

    // 8. Update run status and sum authoritatively
    const totalGross = processedResults.reduce((sum, r) => sum + r.gross, 0);
    const totalNet = processedResults.reduce((sum, r) => sum + r.netPay, 0);
    const totalPph21 = processedResults.reduce((sum, r) => sum + r.pph21, 0);
    const totalBpjsEmployee = processedResults.reduce((sum, r) => sum + r.bpjsEmployee, 0);
    const totalBpjsEmployer = processedResults.reduce((sum, r) => sum + r.bpjsEmployer, 0);

    const { error: runUpdateError } = await supabase
      .from("payroll_runs")
      .update({
        status: "completed",
        total_gross: totalGross,
        total_net: totalNet,
        total_pph21: totalPph21,
        total_bpjs_employee: totalBpjsEmployee,
        total_bpjs_employer: totalBpjsEmployer,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    if (runUpdateError) {
      throw new Error(`Failed to finalize payroll run totals: ${runUpdateError.message}`);
    }

    // 9. Update claims processed in this run to status='paid' and set payroll_run_id
    const allProcessedClaimIds: string[] = [];
    for (const emp of employees) {
      const empClaims = claimsByEmployee.get(emp.id);
      if (empClaims && empClaims.claimIds.length > 0) {
        allProcessedClaimIds.push(...empClaims.claimIds);
      }
    }

    if (allProcessedClaimIds.length > 0) {
      const { error: claimsUpdateError } = await supabase
        .from("reimbursement_claims")
        .update({ status: "paid", payroll_run_id: runId })
        .in("id", allProcessedClaimIds);

      if (claimsUpdateError) {
        throw new Error(`Failed to update processed reimbursement claims to paid: ${claimsUpdateError.message}`);
      }
      console.log(`[Worker] Marked ${allProcessedClaimIds.length} reimbursement claims as paid for run ${runId}`);
    }

    console.log(`[Worker] Successfully completed run: ${runId}`);
    return res.status(200).json({ success: true, message: "Payroll processed successfully." });

  } catch (error: any) {
    console.error(`[Worker] Error processing run ${runId}:`, error);

    // Rollback run status to failed on uncaught errors
    await supabase
      .from("payroll_runs")
      .update({ status: "failed" })
      .eq("id", runId);

    return res.status(500).json({ error: error.message || "Unknown error occurred during processing." });
  }
});

/** Process Report Job Endpoint */
app.post("/process-report", async (req, res) => {
  const { jobId } = req.body;
  if (!jobId || typeof jobId !== "string") {
    return res.status(400).json({ error: "jobId parameter is required." });
  }

  console.log(`[Worker] Received report process request for job: ${jobId}`);

  try {
    // 1. Transition job to processing
    const { data: job, error: jobError } = await supabase
      .from("report_jobs")
      .update({ status: "processing" })
      .eq("id", jobId)
      .in("status", ["pending", "processing"])
      .select("*")
      .single();

    if (jobError || !job) {
      console.error(`[Worker] Failed to transition job ${jobId}:`, jobError?.message);
      return res.status(409).json({
        error: "Job not found or not in pending/processing state.",
      });
    }

    const { company_id: companyId, report_type: reportType, parameters } = job;
    const params = (parameters || {}) as Record<string, any>;
    const payrollRunId = params.payrollRunId || params.payroll_run_id;

    if (!payrollRunId) {
      throw new Error("Missing required parameter: payrollRunId");
    }

    // 2. Fetch company and run details
    const [
      { data: company, error: companyErr },
      { data: run, error: runErr },
      { data: items, error: itemsErr },
    ] = await Promise.all([
      supabase.from("companies").select("name").eq("id", companyId).single(),
      supabase.from("payroll_runs").select("*").eq("id", payrollRunId).single(),
      supabase.from("payroll_items").select("*, employees(*, tax_profile(*))").eq("payroll_run_id", payrollRunId),
    ]);

    if (companyErr) throw companyErr;
    if (runErr) throw runErr;
    if (itemsErr) throw itemsErr;

    if (!run) {
      throw new Error(`Payroll run ${payrollRunId} not found.`);
    }
    if (!items || items.length === 0) {
      throw new Error(`No payroll items found for run ${payrollRunId}.`);
    }

    const companyName = company?.name || "Nexis Tenant";
    const runPeriod = `${run.period_month}/${run.period_year}`;
    
    // Create new workbook
    const wb = XLSX.utils.book_new();
    let sheetName = "Report";
    let wsData: any[][] = [];

    if (reportType === "payroll_summary") {
      sheetName = "Payroll Summary";
      // Header Info
      wsData = [
        ["PAYROLL SUMMARY REPORT"],
        [`Company: ${companyName}`],
        [`Period: ${runPeriod}`],
        [],
        [
          "No",
          "Employee No",
          "Employee Name",
          "Department",
          "Position",
          "Base Salary",
          "Allowances",
          "Overtime Pay",
          "Taxable Reimbursement",
          "Non-Taxable Reimbursement",
          "Gross Pay",
          "BPJS Kes Employee",
          "BPJS JHT Employee",
          "BPJS JP Employee",
          "PPh 21",
          "Total Deductions",
          "Net Pay"
        ]
      ];

      let idx = 1;
      let totalBase = 0, totalAllow = 0, totalOt = 0, totalTaxReim = 0, totalNonTaxReim = 0;
      let totalGross = 0, totalBpjsKes = 0, totalJht = 0, totalJp = 0, totalPph = 0, totalDeduct = 0, totalNet = 0;

      for (const item of items) {
        const emp = (item.employees as any) || {};
        const breakdown = (item.breakdown as any) || {};
        const base = Number(item.base_salary);
        const allow = Number(item.allowances);
        const ot = Number(item.overtime_pay);
        const taxReim = Number(breakdown.variableEarnings || 0);
        const nonTaxReim = Number(breakdown.reimbursementNonTaxable || 0);
        const gross = Number(item.gross_pay);
        const bpjsKes = Number(item.bpjs_kes_employee);
        const jht = Number(item.jht_employee);
        const jp = Number(item.jp_employee);
        const pph = Number(item.pph21);
        const deduct = bpjsKes + jht + jp + pph;
        const net = Number(item.net_pay);

        totalBase += base;
        totalAllow += allow;
        totalOt += ot;
        totalTaxReim += taxReim;
        totalNonTaxReim += nonTaxReim;
        totalGross += gross;
        totalBpjsKes += bpjsKes;
        totalJht += jht;
        totalJp += jp;
        totalPph += pph;
        totalDeduct += deduct;
        totalNet += net;

        wsData.push([
          idx++,
          emp.employee_no || "",
          emp.full_name || "",
          emp.department || "",
          emp.position || "",
          base,
          allow,
          ot,
          taxReim,
          nonTaxReim,
          gross,
          bpjsKes,
          jht,
          jp,
          pph,
          deduct,
          net
        ]);
      }

      // Add Totals row
      wsData.push([
        "TOTAL",
        "",
        "",
        "",
        "",
        totalBase,
        totalAllow,
        totalOt,
        totalTaxReim,
        totalNonTaxReim,
        totalGross,
        totalBpjsKes,
        totalJht,
        totalJp,
        totalPph,
        totalDeduct,
        totalNet
      ]);

    } else if (reportType === "bpjs_contribution") {
      sheetName = "BPJS Contributions";
      wsData = [
        ["BPJS CONTRIBUTION REPORT"],
        [`Company: ${companyName}`],
        [`Period: ${runPeriod}`],
        [],
        [
          "No",
          "Employee Name",
          "Wage (Upah)",
          "BPJS Kes Employee (1%)",
          "BPJS Kes Employer (4%)",
          "BPJS JHT Employee (2%)",
          "BPJS JHT Employer (3.7%)",
          "BPJS JP Employee (1%)",
          "BPJS JP Employer (2%)",
          "BPJS JKK Employer",
          "BPJS JKM Employer (0.3%)",
          "Total Employee Cost",
          "Total Employer Cost",
          "Total Contribution"
        ]
      ];

      let idx = 1;
      let totalWage = 0;
      let totalKesEe = 0, totalKesEr = 0;
      let totalJhtEe = 0, totalJhtEr = 0;
      let totalJpEe = 0, totalJpEr = 0;
      let totalJkkEr = 0, totalJkmEr = 0;
      let totalCostEe = 0, totalCostEr = 0, totalAll = 0;

      for (const item of items) {
        const emp = (item.employees as any) || {};
        const wage = Number(item.base_salary) + Number(item.allowances);
        const kesEe = Number(item.bpjs_kes_employee);
        const kesEr = Number(item.bpjs_kes_employer);
        const jhtEe = Number(item.jht_employee);
        const jhtEr = Number(item.jht_employer);
        const jpEe = Number(item.jp_employee);
        const jpEr = Number(item.jp_employer);
        const jkkEr = Number(item.jkk_employer);
        const jkmEr = Number(item.jkm_employer);

        const costEe = kesEe + jhtEe + jpEe;
        const costEr = kesEr + jhtEr + jpEr + jkkEr + jkmEr;
        const total = costEe + costEr;

        totalWage += wage;
        totalKesEe += kesEe;
        totalKesEr += kesEr;
        totalJhtEe += jhtEe;
        totalJhtEr += jhtEr;
        totalJpEe += jpEe;
        totalJpEr += jpEr;
        totalJkkEr += jkkEr;
        totalJkmEr += jkmEr;
        totalCostEe += costEe;
        totalCostEr += costEr;
        totalAll += total;

        wsData.push([
          idx++,
          emp.full_name || "",
          wage,
          kesEe,
          kesEr,
          jhtEe,
          jhtEr,
          jpEe,
          jpEr,
          jkkEr,
          jkmEr,
          costEe,
          costEr,
          total
        ]);
      }

      wsData.push([
        "TOTAL",
        "",
        totalWage,
        totalKesEe,
        totalKesEr,
        totalJhtEe,
        totalJhtEr,
        totalJpEe,
        totalJpEr,
        totalJkkEr,
        totalJkmEr,
        totalCostEe,
        totalCostEr,
        totalAll
      ]);

    } else if (reportType === "pph21_ebupot") {
      sheetName = "e-Bupot PPh 21";
      // This template aligns with DJP e-Bupot 21/26 skema impor
      wsData = [
        ["Masa Pajak", "Tahun Pajak", "Pembetulan", "NPWP/NIK", "Nama", "Kode Objek Pajak", "Penghasilan Bruto", "PPh 21 Dipotong"],
      ];

      for (const item of items) {
        const emp = (item.employees as any) || {};
        const tax = (emp.tax_profile as any) || {};
        const idNumber = tax.npwp || emp.employee_no || ""; // Fallback to employee no if no NPWP/NIK is stored
        const gross = Number(item.gross_pay);
        const pph21 = Number(item.pph21);

        wsData.push([
          String(run.period_month).padStart(2, "0"),
          run.period_year,
          0,
          idNumber,
          emp.full_name || "",
          "21-100-01", // Pegawai Tetap
          gross,
          pph21
        ]);
      }

    } else if (reportType === "bpjs_sipp") {
      sheetName = "SIPP Upload Upah";
      // Official SIPP wage upload column template
      wsData = [
        ["NIK", "KPJ", "Nama Karyawan", "Upah"],
      ];

      for (const item of items) {
        const emp = (item.employees as any) || {};
        const wage = Number(item.base_salary) + Number(item.allowances);
        
        wsData.push([
          "", // NIK is not explicitly stored or can use a mock
          "", // KPJ is not explicitly stored
          emp.full_name || "",
          wage
        ]);
      }
    } else {
      throw new Error(`Unsupported report type: ${reportType}`);
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // Write to Excel buffer
    const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // Upload path
    const outputPath = `${companyId}/reports/${jobId}_${reportType}.xlsx`;

    // 3. Upload to reports private storage bucket
    const { error: uploadError } = await supabase.storage
      .from("reports")
      .upload(outputPath, excelBuffer, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // 4. Update job to completed
    const { error: updateError } = await supabase
      .from("report_jobs")
      .update({
        status: "completed",
        output_path: outputPath,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (updateError) {
      throw new Error(`Failed to finalize report job status: ${updateError.message}`);
    }

    console.log(`[Worker] Successfully completed report job: ${jobId}`);
    return res.status(200).json({ success: true, message: "Report processed successfully." });

  } catch (error: any) {
    console.error(`[Worker] Error processing report job ${jobId}:`, error);

    // Set job status to failed
    await supabase
      .from("report_jobs")
      .update({
        status: "failed",
        error_message: error.message || "Unknown error occurred.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return res.status(500).json({ error: error.message || "Unknown error occurred during report processing." });
  }
});

app.listen(PORT, () => {
  console.log(`[Worker] Payroll worker server listening on port ${PORT}`);
});
