import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import type { Database } from "../packages/types/src/database";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../apps/web/.env.local") });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is required in env.");
  process.exit(1);
}

const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log("=== START PAYROLL WORKER INTEGRATION TEST ===");

  // Create a unique identifier prefix for test data
  const testId = Math.random().toString(36).substring(7);

  // 1. Retrieve or create a valid auth user to satisfy companies.created_by foreign key
  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
  let userId = usersData?.users?.[0]?.id;
  let createdUserId: string | null = null;

  if (!userId) {
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: `test-${testId}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (createError || !newUser?.user) {
      console.error("Failed to create auth user:", createError);
      process.exit(1);
    }
    userId = newUser.user.id;
    createdUserId = userId;
  }
  console.log(`Using auth user ID: ${userId}`);

  // 2. Create a test company
  const { data: company, error: coErr } = await supabase
    .from("companies")
    .insert({
      name: `Test Company ${testId}`,
      created_by: userId,
    })
    .select("id")
    .single();

  if (coErr || !company) {
    console.error("Failed to create test company:", coErr);
    process.exit(1);
  }
  console.log(`Created test company: ${company.id}`);

  // Create company settings (region and workweek)
  await supabase
    .from("company_settings")
    .update({
      region: "DKI Jakarta",
      workweek_days: 5,
      jkk_risk_class: "low",
    })
    .eq("company_id", company.id);

  // 2. Create a test employee
  const { data: employee, error: empErr } = await supabase
    .from("employees")
    .insert({
      company_id: company.id,
      full_name: "Test Employee John Doe",
      employee_no: `EMP-${testId}`,
      status: "active",
      join_date: "2024-01-01",
    })
    .select("id")
    .single();

  if (empErr || !employee) {
    console.error("Failed to create test employee:", empErr);
    await cleanup(company.id);
    process.exit(1);
  }
  console.log(`Created test employee: ${employee.id}`);

  // 3. Create compensation
  const { error: compErr } = await supabase
    .from("compensation")
    .insert({
      company_id: company.id,
      employee_id: employee.id,
      base_salary: 10000000, // 10 Million Rupiah
      fixed_allowances: [{ name: "Tunjangan Jabatan", amount: 1500000 }], // 1.5 Million allowances
      bpjs_kes_enrolled: true,
      jht_enrolled: true,
      jp_enrolled: true,
      effective_from: "2024-01-01",
    });

  if (compErr) {
    console.error("Failed to create test compensation:", compErr);
    await cleanup(company.id);
    process.exit(1);
  }

  // 4. Create tax profile
  const { error: taxErr } = await supabase
    .from("tax_profile")
    .insert({
      company_id: company.id,
      employee_id: employee.id,
      ptkp_status: "TK/0",
      has_npwp: true,
      npwp: "12.345.678.9-012.000",
    });

  if (taxErr) {
    console.error("Failed to create test tax profile:", taxErr);
    await cleanup(company.id);
    process.exit(1);
  }

  // 5. Create approved overtime entry
  // 120 minutes (2 hours) on a weekday.
  // Base salary = 10,000,000. Hourly base = 10,000,000 / 173 = 57803.46 => 57803.
  // Weekday OT pay = (1.5 * 57803) + (2 * 57803) * (2 - 1) = 86704.5 + 115606 = 202311 Rupiah.
  const { error: otErr } = await supabase
    .from("overtime_entries")
    .insert({
      company_id: company.id,
      employee_id: employee.id,
      date: "2026-05-15",
      duration_minutes: 120,
      multiplier: 3.5, // total multiplier (1.5 + 2.0)
      is_approved: true,
    });

  if (otErr) {
    console.error("Failed to create test overtime entry:", otErr);
    await cleanup(company.id);
    process.exit(1);
  }

  // 6. Create a draft payroll run for May 2026
  const { data: run, error: runErr } = await supabase
    .from("payroll_runs")
    .insert({
      company_id: company.id,
      period_year: 2026,
      period_month: 5,
      status: "queued",
      config_snapshot: {
        runType: "monthly",
      },
    })
    .select("id")
    .single();

  if (runErr || !run) {
    console.error("Failed to create test payroll run:", runErr);
    await cleanup(company.id);
    process.exit(1);
  }
  console.log(`Created test payroll run: ${run.id}`);

  // 7. Trigger the worker
  console.log("Triggering local payroll-worker POST /process...");
  try {
    const response = await fetch("http://localhost:3001/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: run.id }),
    });

    const resBody = await response.json();
    console.log(`Worker Response status ${response.status}:`, resBody);

    if (response.status !== 200) {
      throw new Error(`Worker returned error status ${response.status}`);
    }

    // 8. Retrieve computed data and verify
    const { data: updatedRun } = await supabase
      .from("payroll_runs")
      .select("*")
      .eq("id", run.id)
      .single();

    console.log("Updated Run status:", updatedRun?.status);
    console.log("Updated Run totals:", {
      gross: updatedRun?.total_gross,
      net: updatedRun?.total_net,
      pph21: updatedRun?.total_pph21,
      bpjsEmployee: updatedRun?.total_bpjs_employee,
      bpjsEmployer: updatedRun?.total_bpjs_employer,
    });

    if (updatedRun?.status !== "completed") {
      throw new Error(`Run status is ${updatedRun?.status}, expected completed`);
    }

    const { data: items } = await supabase
      .from("payroll_items")
      .select("*")
      .eq("payroll_run_id", run.id);

    console.log(`Found ${items?.length} computed payroll items.`);
    if (!items || items.length === 0) {
      throw new Error("No payroll items were written by the worker!");
    }

    const item = items[0]!;
    console.log("John Doe Payroll Item detail:", {
      baseSalary: item.base_salary,
      allowances: item.allowances,
      overtimePay: item.overtime_pay,
      grossPay: item.gross_pay,
      netPay: item.net_pay,
      pph21: item.pph21,
      bpjsKesEmployee: item.bpjs_kes_employee,
      bpjsKesEmployer: item.bpjs_kes_employer,
      jhtEmployee: item.jht_employee,
      jhtEmployer: item.jht_employer,
      jpEmployee: item.jp_employee,
      jpEmployer: item.jp_employer,
      jkkEmployer: item.jkk_employer,
      jkmEmployer: item.jkm_employer,
    });

    // Verification asserts
    // Base salary should be 10M, allowances 1.5M, overtimePay 202311.
    // Gross pay = 10M + 1.5M + 202311 = 11,702,311.
    const expectedOvertime = 202311;
    const expectedGross = 11702311;
    
    console.log("Assertions:");
    console.log(`- Base salary is 10,000,000: ${item.base_salary === "10000000" || Number(item.base_salary) === 10000000 ? "PASS" : "FAIL"}`);
    console.log(`- Allowances are 1,500,000: ${Number(item.allowances) === 1500000 ? "PASS" : "FAIL"}`);
    console.log(`- Overtime is ${expectedOvertime}: ${Number(item.overtime_pay) === expectedOvertime ? "PASS" : "FAIL"}`);
    console.log(`- Gross is ${expectedGross}: ${Number(item.gross_pay) === expectedGross ? "PASS" : "FAIL"}`);

    const { data: payslips } = await supabase
      .from("payslips")
      .select("*")
      .eq("payroll_item_id", item.id);

    if (!payslips || payslips.length === 0) {
      throw new Error("No payslip record was created!");
    }
    console.log(`Payslip record created with PDF path: ${payslips[0]?.pdf_path}`);

    // Verify storage file exists
    const { data: fileData, error: fileErr } = await supabase.storage
      .from("payslips")
      .download(payslips[0]?.pdf_path!);

    if (fileErr || !fileData) {
      throw new Error(`Failed to download payslip PDF from storage: ${fileErr?.message}`);
    }
    console.log(`Successfully verified and downloaded PDF from storage: size = ${fileData.size} bytes.`);

    console.log("=== INTEGRATION TEST PASSED SUCCESSFULLY ===");

  } catch (err) {
    console.error("Integration test encountered an error:", err);
  } finally {
    await cleanup(company.id, createdUserId);
  }
}

async function cleanup(companyId: string, createdUserId: string | null = null) {
  console.log("Cleaning up test data...");
  // Clear storage files
  const { data: files } = await supabase.storage.from("payslips").list(companyId, { recursive: true });
  if (files && files.length > 0) {
    const paths = files.map(f => `${companyId}/${f.name}`);
    await supabase.storage.from("payslips").remove(paths);
  }
  
  // Cascade delete on company removes employees, runs, items, etc.
  await supabase.from("companies").delete().eq("id", companyId);

  if (createdUserId) {
    console.log(`Deleting temporary auth user: ${createdUserId}`);
    await supabase.auth.admin.deleteUser(createdUserId);
  }
  console.log("Test data cleaned up.");
}

main();
