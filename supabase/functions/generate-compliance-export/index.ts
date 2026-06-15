import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeCSV(val: any): string {
  const str = val === null || val === undefined ? "" : String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error("Missing Supabase configuration in environment.");
    }

    // Initialize clients
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get user details
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid user session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request
    const { runId, kind } = await req.json();
    if (!runId || !kind || (kind !== "ebupot" && kind !== "sipp")) {
      return new Response(JSON.stringify({ error: "Invalid parameters: runId and kind (ebupot|sipp) are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Export] Generating ${kind} export for run ${runId} by user ${user.id}`);

    // Load payroll run
    const { data: run, error: runErr } = await serviceClient
      .from("payroll_runs")
      .select("id, company_id, period_year, period_month, status")
      .eq("id", runId)
      .single();

    if (runErr || !run) {
      return new Response(JSON.stringify({ error: "Payroll run not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify company access and role
    const { data: member, error: memberErr } = await serviceClient
      .from("company_members")
      .select("role")
      .eq("company_id", run.company_id)
      .eq("user_id", user.id)
      .single();

    if (memberErr || !member || !["owner", "admin", "accountant"].includes(member.role)) {
      return new Response(JSON.stringify({ error: "Unauthorized access to this company's payroll" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify payroll run status
    if (run.status !== "completed" && run.status !== "paid") {
      return new Response(
        JSON.stringify({
          error: "RUN_NOT_FINALIZED",
          message: "Run payroll belum selesai diproses. Ekspor kepatuhan hanya tersedia untuk run yang selesai.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Load company billing & plan details
    const { data: billing, error: billingErr } = await serviceClient
      .from("company_billing")
      .select("plan, npwp, bpjs_kes_no, bpjs_tk_no")
      .eq("company_id", run.company_id)
      .single();

    if (billingErr || !billing) {
      return new Response(JSON.stringify({ error: "Company billing information not found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enforce Plan & Legal ID gates
    if (billing.plan === "free") {
      return new Response(
        JSON.stringify({
          error: "PLAN_GATE_FREE",
          message: "Ekspor kepatuhan resmi e-Bupot dan SIPP memerlukan paket berbayar.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (kind === "ebupot" && (!billing.npwp || billing.npwp.trim() === "")) {
      return new Response(
        JSON.stringify({
          error: "NPWP_REQUIRED",
          message: "NPWP perusahaan harus diisi di pengaturan billing sebelum mengunduh e-Bupot.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (kind === "sipp" && (!billing.bpjs_kes_no || billing.bpjs_kes_no.trim() === "" || !billing.bpjs_tk_no || billing.bpjs_tk_no.trim() === "")) {
      return new Response(
        JSON.stringify({
          error: "BPJS_NOS_REQUIRED",
          message: "Nomor BPJS Kesehatan dan BPJS Ketenagakerjaan perusahaan harus diisi sebelum mengunduh SIPP.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch payroll items with nested employee profiles and tax profiles
    const { data: items, error: itemsErr } = await serviceClient
      .from("payroll_items")
      .select(`
        id,
        base_salary,
        gross_pay,
        pph21,
        employee_id,
        employees (
          id,
          full_name,
          employee_no,
          tax_profile (
            npwp,
            ptkp_status
          )
        )
      `)
      .eq("payroll_run_id", run.id);

    if (itemsErr || !items) {
      return new Response(JSON.stringify({ error: `Failed to fetch payroll items: ${itemsErr?.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let csvContent = "";

    if (kind === "ebupot") {
      const headersList = ["Masa Pajak", "Tahun Pajak", "Pembetulan", "NPWP/NIK", "Nama", "Kode Objek Pajak", "Penghasilan Bruto", "PPh 21 Dipotong"];
      csvContent += headersList.map(escapeCSV).join(",") + "\n";

      for (const item of items) {
        const emp = (item.employees as any) || {};
        const tax = (emp.tax_profile as any) || {};
        const idNumber = tax.npwp || emp.employee_no || "";
        const gross = Math.round(Number(item.gross_pay));
        const pph21 = Math.round(Number(item.pph21));

        const row = [
          String(run.period_month).padStart(2, "0"),
          run.period_year,
          0,
          idNumber,
          emp.full_name || "",
          "21-100-01", // Default to Pegawai Tetap
          gross,
          pph21,
        ];
        csvContent += row.map(escapeCSV).join(",") + "\n";
      }
    } else if (kind === "sipp") {
      const headersList = ["NIK", "KPJ", "Nama Karyawan", "Upah"];
      csvContent += headersList.map(escapeCSV).join(",") + "\n";

      for (const item of items) {
        const emp = (item.employees as any) || {};
        const tax = (emp.tax_profile as any) || {};
        const NIK = tax.npwp || ""; // Fallback or mock NIK using NPWP
        const KPJ = ""; // Not explicitly stored in employee record
        const wage = Math.round(Number(item.base_salary));

        const row = [
          NIK,
          KPJ,
          emp.full_name || "",
          wage,
        ];
        csvContent += row.map(escapeCSV).join(",") + "\n";
      }
    }

    // Convert CSV content to ArrayBuffer/Uint8Array
    const encoder = new TextEncoder();
    const csvBuffer = encoder.encode(csvContent);

    // Upload path
    const outputPath = `${run.company_id}/exports/${run.id}_${kind}.csv`;

    // Upload to reports bucket via service client
    const { error: uploadError } = await serviceClient.storage
      .from("reports")
      .upload(outputPath, csvBuffer, {
        contentType: "text/csv",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload compliance export to storage: ${uploadError.message}`);
    }

    // Create signed URL for downloading (valid for 60 seconds)
    const { data: signed, error: signedErr } = await serviceClient.storage
      .from("reports")
      .createSignedUrl(outputPath, 60);

    if (signedErr || !signed?.signedUrl) {
      throw new Error(`Failed to generate signed download URL: ${signedErr?.message}`);
    }

    // Insert audit log
    await serviceClient.from("audit_logs").insert({
      company_id: run.company_id,
      actor_id: user.id,
      action: "generate_compliance_export",
      entity: "payroll_runs",
      entity_id: run.id,
      metadata: { kind },
    });

    console.log(`[Export] Successfully generated compliance export downloadUrl for ${kind}`);

    return new Response(
      JSON.stringify({
        success: true,
        downloadUrl: signed.signedUrl,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: any) {
    console.error("[Export] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
