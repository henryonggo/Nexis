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

    const { userId, title, body, emailSubject, emailBody, emailTo } = await req.json();

    if (!userId) {
      return new Response(JSON.stringify({ error: "userId parameter is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Notification] Triggering notification delivery for user: ${userId}`);

    // 1. Fetch Expo Push Tokens for this user
    const { data: tokens, error: tokensErr } = await supabaseClient
      .from("expo_push_tokens")
      .select("token")
      .eq("user_id", userId);

    if (tokensErr) {
      console.error("Error fetching push tokens:", tokensErr.message);
    }

    const pushTokens = tokens?.map((t: any) => t.token) || [];
    console.log(`[Notification] Found ${pushTokens.length} push tokens for user.`);

    let pushResult = null;
    if (pushTokens.length > 0) {
      // Send Expo Push Notification
      const messages = pushTokens.map((token) => ({
        to: token,
        sound: "default",
        title: title || "Nexis Notification",
        body: body || "",
        data: { userId },
      }));

      const pushResponse = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });
      pushResult = await pushResponse.json();
      console.log("[Notification] Expo push response status:", pushResponse.status);
    }

    // 2. Send transactional email via Resend API
    let emailResult = null;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const emailFrom = Deno.env.get("EMAIL_FROM") || "Nexis <onboarding@resend.dev>";
    
    // Resolve email address if not provided in request
    let targetEmail = emailTo;
    if (!targetEmail) {
      const { data: userData, error: userErr } = await supabaseClient.auth.admin.getUserById(userId);
      if (!userErr && userData?.user) {
        targetEmail = userData.user.email;
      }
    }

    if (resendApiKey && targetEmail && emailSubject && emailBody) {
      console.log(`[Notification] Sending email to ${targetEmail} via Resend...`);
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: emailFrom,
          to: targetEmail,
          subject: emailSubject,
          html: emailBody,
        }),
      });
      emailResult = await emailResponse.json();
      console.log("[Notification] Resend response status:", emailResponse.status);
    } else {
      console.log("[Notification] Email sending skipped (missing resend configuration or inputs).");
    }

    return new Response(JSON.stringify({ success: true, pushResult, emailResult }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[Notification] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
