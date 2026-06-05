import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper to calculate SHA-256 hash
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Authenticate Request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const rawKey = authHeader.substring(7).trim();
    if (!rawKey.startsWith("nexis_live_")) {
      return new Response(JSON.stringify({ error: "Invalid API key format" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const hashedKey = await sha256(rawKey);

    // Query API Key
    const { data: keyRow, error: keyErr } = await supabase
      .from("company_api_keys")
      .select("company_id, scopes")
      .eq("key_hash", hashedKey)
      .eq("is_active", true)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .maybeSingle();

    if (keyErr || !keyRow) {
      return new Response(JSON.stringify({ error: "Invalid or expired API key" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const companyId = keyRow.company_id;
    const scopes = keyRow.scopes || [];

    // 2. Enforce Rate Limit (Max 60 requests per minute)
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { count, error: countErr } = await supabase
      .from("api_request_logs")
      .select("id", { count: "exact", head: true })
      .eq("key_hash", hashedKey)
      .gt("created_at", oneMinuteAgo);

    if (countErr) {
      throw new Error("Failed to verify rate limits.");
    }

    if (count && count >= 60) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded (Max 60 requests per minute)" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" }
      });
    }

    // Log request and clean up old logs asynchronously
    await supabase.from("api_request_logs").insert({ key_hash: hashedKey });
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabase.from("api_request_logs").delete().lt("created_at", fiveMinutesAgo);

    // 3. Routing & Scope Enforcements
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, ""); // Trim trailing slash
    const method = req.method;

    console.log(`[API Gateway] Scoped request: companyId=${companyId}, path=${path}, method=${method}`);

    // --- Endpoints ---

    // A. Employees: GET /employees (employees:read), POST /employees (employees:write)
    if (path === "/public-api/v1/employees" || path === "/v1/employees") {
      if (method === "GET") {
        if (!scopes.includes("employees:read")) {
          return new Response(JSON.stringify({ error: "Insufficient scope (requires employees:read)" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const { data, error } = await supabase
          .from("employees")
          .select("id, company_id, full_name, status, created_at")
          .eq("company_id", companyId);

        if (error) throw error;

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

      } else if (method === "POST") {
        if (!scopes.includes("employees:write")) {
          return new Response(JSON.stringify({ error: "Insufficient scope (requires employees:write)" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const body = await req.json();
        if (!body.full_name) {
          return new Response(JSON.stringify({ error: "Missing required field: full_name" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const { data, error } = await supabase
          .from("employees")
          .insert({
            company_id: companyId,
            full_name: body.full_name,
            status: body.status || "active",
          })
          .select("id, company_id, full_name, status, created_at")
          .single();

        if (error) throw error;

        return new Response(JSON.stringify({ data }), {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // B. Attendance: GET /attendance (attendance:read), POST /attendance/clock-in or clock-out (attendance:write)
    if (path === "/public-api/v1/attendance" || path === "/v1/attendance") {
      if (method === "GET") {
        if (!scopes.includes("attendance:read")) {
          return new Response(JSON.stringify({ error: "Insufficient scope (requires attendance:read)" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const { data, error } = await supabase
          .from("attendance_records")
          .select("id, company_id, employee_id, kind, created_at")
          .eq("company_id", companyId);

        if (error) throw error;

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    if (path === "/public-api/v1/attendance/clock-in" || path === "/v1/attendance/clock-in") {
      if (method === "POST") {
        if (!scopes.includes("attendance:write")) {
          return new Response(JSON.stringify({ error: "Insufficient scope (requires attendance:write)" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const body = await req.json();
        if (!body.employee_id) {
          return new Response(JSON.stringify({ error: "Missing required field: employee_id" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Verify employee belongs to this company
        const { data: emp, error: empErr } = await supabase
          .from("employees")
          .select("id")
          .eq("id", body.employee_id)
          .eq("company_id", companyId)
          .maybeSingle();

        if (empErr || !emp) {
          return new Response(JSON.stringify({ error: "Employee not found in this company" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const { data, error } = await supabase
          .from("attendance_records")
          .insert({
            company_id: companyId,
            employee_id: body.employee_id,
            kind: "clock_in",
          })
          .select("id, company_id, employee_id, kind, created_at")
          .single();

        if (error) throw error;

        return new Response(JSON.stringify({ data }), {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    if (path === "/public-api/v1/attendance/clock-out" || path === "/v1/attendance/clock-out") {
      if (method === "POST") {
        if (!scopes.includes("attendance:write")) {
          return new Response(JSON.stringify({ error: "Insufficient scope (requires attendance:write)" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const body = await req.json();
        if (!body.employee_id) {
          return new Response(JSON.stringify({ error: "Missing required field: employee_id" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Verify employee belongs to this company
        const { data: emp, error: empErr } = await supabase
          .from("employees")
          .select("id")
          .eq("id", body.employee_id)
          .eq("company_id", companyId)
          .maybeSingle();

        if (empErr || !emp) {
          return new Response(JSON.stringify({ error: "Employee not found in this company" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const { data, error } = await supabase
          .from("attendance_records")
          .insert({
            company_id: companyId,
            employee_id: body.employee_id,
            kind: "clock_out",
          })
          .select("id, company_id, employee_id, kind, created_at")
          .single();

        if (error) throw error;

        return new Response(JSON.stringify({ data }), {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // C. Payroll: GET /payroll (payroll:read)
    if (path === "/public-api/v1/payroll" || path === "/v1/payroll") {
      if (method === "GET") {
        if (!scopes.includes("payroll:read")) {
          return new Response(JSON.stringify({ error: "Insufficient scope (requires payroll:read)" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const { data, error } = await supabase
          .from("payroll_runs")
          .select("id, company_id, period_start, period_end, status, created_at")
          .eq("company_id", companyId);

        if (error) throw error;

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // Default 404
    return new Response(JSON.stringify({ error: "Endpoint not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("[API Gateway] Error processing request:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
