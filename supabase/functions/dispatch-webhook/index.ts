import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper to calculate HMAC-SHA256 signature
async function calculateHmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  return signatureArray.map(b => b.toString(16).padStart(2, "0")).join("");
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

    const body = await req.json();
    const queueId = body.queue_id;

    if (!queueId) {
      return new Response(JSON.stringify({ error: "Missing required parameter: queue_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`[Webhook Dispatcher] Loading queue row: ${queueId}`);

    // 1. Fetch from queue
    const { data: queueRow, error: queueErr } = await supabase
      .from("webhook_queue")
      .select("company_id, webhook_id, event_type, payload, status, retry_count")
      .eq("id", queueId)
      .maybeSingle();

    if (queueErr || !queueRow) {
      return new Response(JSON.stringify({ error: "Webhook queue item not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (queueRow.status !== "pending") {
      return new Response(JSON.stringify({ message: `Webhook already processed. Status: ${queueRow.status}` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Fetch webhook configuration
    const { data: webhook, error: hookErr } = await supabase
      .from("company_webhooks")
      .select("url, secret, is_active")
      .eq("id", queueRow.webhook_id)
      .maybeSingle();

    if (hookErr || !webhook || !webhook.is_active) {
      // Mark as failed since config is missing/inactive
      await supabase
        .from("webhook_queue")
        .update({ status: "failed" })
        .eq("id", queueId);

      return new Response(JSON.stringify({ error: "Webhook configuration missing or inactive" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 3. Dispatch Payload
    const stringifiedPayload = JSON.stringify(queueRow.payload);
    const signature = await calculateHmacSha256(webhook.secret, stringifiedPayload);

    console.log(`[Webhook Dispatcher] Posting event ${queueRow.event_type} to ${webhook.url}`);

    let responseStatus = 0;
    let responseText = "";
    let status: "success" | "failed" = "failed";

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Nexis-Signature": signature,
          "X-Nexis-Event": queueRow.event_type,
        },
        body: stringifiedPayload,
        signal: controller.signal
      });

      clearTimeout(id);
      responseStatus = res.status;
      responseText = await res.text();

      if (res.ok) {
        status = "success";
      }
    } catch (err: any) {
      responseStatus = 500;
      responseText = `Request failed: ${err.message || err}`;
    }

    console.log(`[Webhook Dispatcher] Result: status=${status}, responseStatus=${responseStatus}`);

    // 4. Log Attempt
    await supabase
      .from("webhook_logs")
      .insert({
        company_id: queueRow.company_id,
        webhook_id: queueRow.webhook_id,
        event_type: queueRow.event_type,
        response_status: responseStatus,
        response_body: responseText.slice(0, 1000), // Trim long responses
        attempt_number: queueRow.retry_count + 1,
        status: status
      });

    // 5. Update Queue Row
    await supabase
      .from("webhook_queue")
      .update({
        status: status === "success" ? "delivered" : "failed",
        retry_count: queueRow.retry_count + 1
      })
      .eq("id", queueId);

    return new Response(JSON.stringify({ success: status === "success", responseStatus }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("[Webhook Dispatcher] Error processing dispatch:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
