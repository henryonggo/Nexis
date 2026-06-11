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

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const bodyText = await req.text();
    let payload: any;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      throw new Error("Invalid JSON payload.");
    }

    console.log("[Billing Webhook] Received webhook payload:", JSON.stringify(payload));

    let companyId: string | null = null;
    let plan: string | null = null;
    let npwp: string | null = null;
    let bpjsKes: string | null = null;
    let bpjsTk: string | null = null;
    let billingEmail: string | null = null;
    let gatewaySubscriptionId: string | null = null;
    let gatewayCustomerId: string | null = null;
    let gatewayInvoiceId: string | null = null;
    let amount: number = 0;
    let isPaymentSuccess = false;

    // Detect format
    if (payload.type && payload.type.startsWith("checkout.session.")) {
      // 1. Stripe Checkout Session completed
      const session = payload.data?.object || {};
      const metadata = session.metadata || {};
      
      companyId = metadata.company_id || metadata.companyId;
      plan = metadata.plan;
      npwp = metadata.npwp;
      bpjsKes = metadata.bpjs_kes || metadata.bpjsKes;
      bpjsTk = metadata.bpjs_tk || metadata.bpjsTk;
      billingEmail = metadata.billing_email || metadata.billingEmail || session.customer_details?.email;
      
      gatewaySubscriptionId = session.subscription || null;
      gatewayCustomerId = session.customer || null;
      amount = session.amount_total ? Math.round(session.amount_total / 100) : 0; // Stripe cents to whole currency unit
      isPaymentSuccess = payload.type === "checkout.session.completed";

      console.log(`[Billing Webhook] Parsed Stripe event: success=${isPaymentSuccess}, companyId=${companyId}`);

    } else if (payload.transaction_status && payload.order_id) {
      // 2. Midtrans payment notification
      isPaymentSuccess = ["settlement", "capture", "accept"].includes(payload.transaction_status);
      amount = payload.gross_amount ? Math.round(parseFloat(payload.gross_amount)) : 0;
      gatewayInvoiceId = payload.order_id;
      
      // Parse custom fields if present
      if (payload.custom_field1) {
        try {
          const meta = JSON.parse(payload.custom_field1);
          companyId = meta.company_id || meta.companyId;
          plan = meta.plan;
          npwp = meta.npwp;
          bpjsKes = meta.bpjs_kes || meta.bpjsKes;
          bpjsTk = meta.bpjs_tk || meta.bpjsTk;
          billingEmail = meta.billing_email || meta.billingEmail;
        } catch {
          // Fallback if not JSON
          console.warn("[Billing Webhook] custom_field1 is not valid JSON:", payload.custom_field1);
        }
      }

      console.log(`[Billing Webhook] Parsed Midtrans notification: success=${isPaymentSuccess}, companyId=${companyId}`);

    } else {
      // 3. Direct Sandbox/Mock format for easy local verification
      companyId = payload.company_id || payload.companyId;
      plan = payload.plan;
      npwp = payload.npwp;
      bpjsKes = payload.bpjs_kes || payload.bpjsKes || payload.bpjs_kes_no;
      bpjsTk = payload.bpjs_tk || payload.bpjsTk || payload.bpjs_tk_no;
      billingEmail = payload.billing_email || payload.billingEmail;
      
      gatewaySubscriptionId = payload.subscription_id || `sub_${crypto.randomUUID().slice(0, 8)}`;
      gatewayInvoiceId = payload.invoice_id || `inv_${crypto.randomUUID().slice(0, 8)}`;
      amount = payload.amount || 0;
      isPaymentSuccess = payload.status !== "failed";

      console.log(`[Billing Webhook] Parsed Sandbox payload: success=${isPaymentSuccess}, companyId=${companyId}`);
    }

    if (!companyId || !plan) {
      return new Response(
        JSON.stringify({ error: "Missing required checkout parameters: company_id and plan" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isPaymentSuccess) {
      console.log(`[Billing Webhook] Payment failed or pending. No DB update triggered.`);
      return new Response(JSON.stringify({ success: true, message: "Payment status is not successful, skipped updates." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Begin updates using service-role client bypassing RLS
    console.log(`[Billing Webhook] Upgrading company ${companyId} to plan ${plan}...`);

    // 1. Create a subscription row
    const subscriptionData = {
      company_id: companyId,
      status: "active" as const,
      plan_id: plan,
      plan: plan,
      quantity: 1,
      gateway_subscription_id: gatewaySubscriptionId || `sub_${crypto.randomUUID().slice(0, 8)}`,
      gateway_customer_id: gatewayCustomerId || null,
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // +30 days
      updated_at: new Date().toISOString(),
    };

    const { data: sub, error: subErr } = await supabaseClient
      .from("subscriptions")
      .insert(subscriptionData)
      .select("id")
      .single();

    if (subErr) {
      console.error("[Billing Webhook] Error inserting subscription:", subErr.message);
      throw subErr;
    }

    // 2. Create an invoice row
    const invoiceData = {
      company_id: companyId,
      subscription_id: sub.id,
      amount: amount,
      status: "paid",
      gateway_invoice_id: gatewayInvoiceId || `inv_${crypto.randomUUID().slice(0, 8)}`,
      created_at: new Date().toISOString(),
    };

    const { error: invErr } = await supabaseClient
      .from("invoices")
      .insert(invoiceData);

    if (invErr) {
      console.error("[Billing Webhook] Error inserting invoice:", invErr.message);
      throw invErr;
    }

    // 3. Update company_billing with new plan, NPWP, BPJS, and reference to subscription
    const billingUpdate = {
      plan,
      subscription_id: sub.id,
      npwp: npwp || null,
      bpjs_kes_no: bpjsKes || null,
      bpjs_tk_no: bpjsTk || null,
      billing_email: billingEmail || null,
      updated_at: new Date().toISOString(),
    };

    const { error: billErr } = await supabaseClient
      .from("company_billing")
      .update(billingUpdate)
      .eq("company_id", companyId);

    if (billErr) {
      console.error("[Billing Webhook] Error updating company_billing:", billErr.message);
      throw billErr;
    }

    // 4. Denormalize plan status back to the main companies table
    const { error: compErr } = await supabaseClient
      .from("companies")
      .update({ plan })
      .eq("id", companyId);

    if (compErr) {
      console.error("[Billing Webhook] Error updating companies:", compErr.message);
      throw compErr;
    }

    console.log(`[Billing Webhook] Successfully finalized plan upgrade to '${plan}' for company ${companyId}`);

    return new Response(JSON.stringify({ success: true, message: "Subscription activated successfully." }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[Billing Webhook] Error processing webhook:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
