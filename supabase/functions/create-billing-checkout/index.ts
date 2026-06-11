import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing database connection parameters in environment.");
    }

    // 1. Get user authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Create Supabase Client using the caller's JWT to verify access
    const userClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const {
      companyId,
      plan,
      billingEmail,
      npwp,
      bpjsKes,
      bpjsTk,
      returnUrl,
    } = await req.json();

    if (!companyId || !plan || !billingEmail || !npwp || !bpjsKes || !bpjsTk) {
      return new Response(JSON.stringify({ error: "Missing required checkout parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Verify caller is owner of the company
    const { data: membership, error: membershipErr } = await userClient
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .single();

    if (membershipErr || !membership || membership.role !== "owner") {
      console.warn(`[Billing Checkout] Unauthorized attempt by user ${user.id} on company ${companyId}`);
      return new Response(JSON.stringify({ error: "Only the company owner can initiate checkouts." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Billing Checkout] Owner authorized. Persisting legal details for company ${companyId}...`);

    // 3. Create service role client for secure updates
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Update company_billing table with legal info immediately (plan stays unchanged, pending_plan is updated)
    const { error: billingUpdateErr } = await serviceClient
      .from("company_billing")
      .update({
        npwp,
        bpjs_kes_no: bpjsKes,
        bpjs_tk_no: bpjsTk,
        billing_email: billingEmail,
        pending_plan: plan,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId);

    if (billingUpdateErr) {
      console.error("[Billing Checkout] Error updating company_billing:", billingUpdateErr.message);
      throw new Error(`Failed to update billing details: ${billingUpdateErr.message}`);
    }

    // 4. Create Gateway checkout session (mocked for development)
    const sessionId = `checkout_sess_${crypto.randomUUID().slice(0, 12)}`;
    // In production, you would call Xendit/Midtrans API here. We provide a mock checkout redirect URL.
    const checkoutUrl = `https://checkout.xendit.co/v2/mock-session-${sessionId}?return=${encodeURIComponent(returnUrl || "")}`;

    console.log(`[Billing Checkout] Session created. Redirecting to ${checkoutUrl}`);

    return new Response(JSON.stringify({ checkoutUrl, sessionId, status: "pending" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[Billing Checkout] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
