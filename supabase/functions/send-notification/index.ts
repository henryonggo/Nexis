import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(phone: string): string | null {
  const clean = phone.replace(/\D/g, "");
  if (clean.length < 8 || clean.length > 15) return null;
  if (clean.startsWith("0")) {
    return "+62" + clean.slice(1);
  }
  if (clean.startsWith("62")) {
    return "+" + clean;
  }
  if (clean.startsWith("8")) {
    return "+62" + clean;
  }
  return "+" + clean;
}

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

    const {
      userId,
      title,
      body,
      emailSubject,
      emailBody,
      emailTo,
      whatsappTemplate,
      whatsappComponents,
    } = await req.json();

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

    // 3. Send WhatsApp Notification via Meta Cloud API if opted in
    let whatsappResult = null;
    const { data: profile, error: profileErr } = await supabaseClient
      .from("profiles")
      .select("phone, whatsapp_opt_in")
      .eq("id", userId)
      .single();

    if (profileErr) {
      console.error("Error fetching user profile for WhatsApp check:", profileErr.message);
    }

    const whatsappToken = Deno.env.get("WHATSAPP_TOKEN");
    const whatsappPhoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

    if (!profileErr && profile && profile.whatsapp_opt_in && profile.phone) {
      const formattedPhone = normalizePhone(profile.phone);
      if (formattedPhone) {
        if (whatsappToken && whatsappPhoneId) {
          // Resolve template and components
          let templateName = whatsappTemplate;
          let components = whatsappComponents;

          if (!templateName) {
            // Infer template from title/body
            const titleLower = (title || "").toLowerCase();
            if (titleLower.includes("cuti") && titleLower.includes("setuju")) {
              templateName = "leave_approved";
              components = [{ type: "body", parameters: [{ type: "text", text: body || "" }] }];
            } else if (titleLower.includes("cuti") && titleLower.includes("tolak")) {
              templateName = "leave_rejected";
              components = [{ type: "body", parameters: [{ type: "text", text: body || "" }] }];
            } else if (titleLower.includes("klaim") && titleLower.includes("setuju")) {
              templateName = "claim_approved";
              components = [{ type: "body", parameters: [{ type: "text", text: body || "" }] }];
            } else if (titleLower.includes("klaim") && titleLower.includes("tolak")) {
              templateName = "claim_rejected";
              components = [{ type: "body", parameters: [{ type: "text", text: body || "" }] }];
            } else if (titleLower.includes("slip") || titleLower.includes("gaji") || titleLower.includes("payslip")) {
              templateName = "payslip_ready";
              components = [{ type: "body", parameters: [{ type: "text", text: body || "" }] }];
            } else {
              templateName = "generic_notification";
              components = [
                {
                  type: "body",
                  parameters: [
                    { type: "text", text: title || "Nexis" },
                    { type: "text", text: body || "" },
                  ],
                },
              ];
            }
          }

          console.log(`[Notification] Sending WhatsApp template ${templateName} to ${formattedPhone}...`);
          const whatsappResponse = await fetch(`https://graph.facebook.com/v19.0/${whatsappPhoneId}/messages`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${whatsappToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: formattedPhone,
              type: "template",
              template: {
                name: templateName,
                language: {
                  code: "id",
                },
                components: components || [],
              },
            }),
          });

          whatsappResult = await whatsappResponse.json();
          console.log("[Notification] WhatsApp response status:", whatsappResponse.status);
        } else {
          console.log("[Notification] WhatsApp skipped: missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID in env.");
          whatsappResult = { status: "skipped", reason: "missing_env" };
        }
      } else {
        console.warn(`[Notification] WhatsApp skipped: invalid phone number format: ${profile.phone}`);
        whatsappResult = { status: "skipped", reason: "invalid_phone_format" };
      }
    } else {
      console.log(`[Notification] WhatsApp skipped: user profile not found, phone missing, or not opted in.`);
      whatsappResult = { status: "skipped", reason: "not_opted_in_or_missing_phone" };
    }

    return new Response(JSON.stringify({ success: true, pushResult, emailResult, whatsappResult }), {
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
