import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import http from "http";

const supabaseUrl = "http://127.0.0.1:54321";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ("sb_secret_" + "N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz");

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Utility to calculate SHA-256 hash (same as pg/crypto)
function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// Utility to calculate HMAC-SHA256 (same as Edge Function dispatcher)
function calculateHmacSha256(secret, message) {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

async function run() {
  console.log("=== Nexis Stage 7 Public API & Webhooks Verification ===");

  const testUserId = "11111111-1111-1111-1111-111111111111";

  // 1. Ensure test user exists in auth.users
  console.log("Checking if test user exists...");
  const { data: userList, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error("Failed to list users:", listErr.message);
    process.exit(1);
  }

  let testUser = userList.users.find(u => u.id === testUserId);
  if (!testUser) {
    console.log("Creating test user in auth.users...");
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      id: testUserId,
      email: "integration-owner@nexis.local",
      password: "Password123!",
      email_confirm: true
    });
    if (createErr) {
      console.error("Failed to create test user:", createErr.message);
      process.exit(1);
    }
    testUser = newUser.user;
  }
  console.log(`Test user verified: ${testUser.email} (${testUser.id})`);

  // 2. Create a test company
  console.log("Creating test company...");
  const { data: company, error: compErr } = await supabase
    .from("companies")
    .insert({
      name: "Integration Test Corp",
      created_by: testUserId,
      timezone: "Asia/Jakarta",
      locale: "id-ID",
      plan: "free",
    })
    .select()
    .single();

  if (compErr) {
    console.error("Failed to create test company:", compErr.message);
    process.exit(1);
  }

  console.log(`Created test company: ${company.name} (${company.id})`);

  // Clean up any existing test webhook configurations or keys for this company
  await supabase.from("company_webhooks").delete().eq("company_id", company.id);
  await supabase.from("company_api_keys").delete().eq("company_id", company.id);

  // 3. Generate and store API key
  const rawKey = "nexis_live_testkey_1234567890abcdefghijklmnopqrstuvwxyz";
  const hashedKey = sha256(rawKey);

  console.log("Registering test API key in database...");
  const { error: keyErr } = await supabase
    .from("company_api_keys")
    .insert({
      company_id: company.id,
      name: "Integration Test Key",
      key_hash: hashedKey,
      scopes: ["employees:read", "employees:write", "attendance:read", "attendance:write", "payroll:read"],
      is_active: true,
    });

  if (keyErr) {
    console.error("Failed to register test API key:", keyErr.message);
    // Cleanup company
    await supabase.from("companies").delete().eq("id", company.id);
    process.exit(1);
  }

  // 4. Register Webhook Configuration
  const webhookSecret = "super_secret_webhook_signing_token_9988";
  console.log("Registering webhook configuration pointing to host.docker.internal:9999...");
  const { data: webhookConfig, error: webhookErr } = await supabase
    .from("company_webhooks")
    .insert({
      company_id: company.id,
      url: "http://host.docker.internal:9999/webhook",
      secret: webhookSecret,
      events: ["employee.created"],
      is_active: true,
    })
    .select()
    .single();

  if (webhookErr) {
    console.error("Failed to register webhook configuration:", webhookErr.message);
    // Cleanup
    await supabase.from("company_api_keys").delete().eq("company_id", company.id);
    await supabase.from("companies").delete().eq("id", company.id);
    process.exit(1);
  }

  console.log(`Webhook configured successfully (ID: ${webhookConfig.id})`);

  // 5. Start local HTTP server to catch the webhook callback
  let webhookReceivedPromiseResolve;
  let webhookReceivedPromiseReject;
  const webhookReceivedPromise = new Promise((resolve, reject) => {
    webhookReceivedPromiseResolve = resolve;
    webhookReceivedPromiseReject = reject;
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/webhook") {
      let body = "";
      req.on("data", chunk => {
        body += chunk.toString();
      });

      req.on("end", () => {
        try {
          console.log("\n[Webhook Server] Received callback request!");
          const signatureHeader = req.headers["x-nexis-signature"];
          const eventHeader = req.headers["x-nexis-event"];

          console.log(`[Webhook Server] Header X-Nexis-Signature: ${signatureHeader}`);
          console.log(`[Webhook Server] Header X-Nexis-Event: ${eventHeader}`);
          console.log(`[Webhook Server] Payload: ${body}`);

          const expectedSignature = calculateHmacSha256(webhookSecret, body);
          console.log(`[Webhook Server] Expected Signature: ${expectedSignature}`);

          if (signatureHeader === expectedSignature) {
            console.log("[Webhook Server] Signature verification SUCCESS!");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ received: true }));
            webhookReceivedPromiseResolve({
              event_type: eventHeader,
              body: JSON.parse(body)
            });
          } else {
            console.error("[Webhook Server] Signature verification FAILED!");
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end("Invalid signature");
            webhookReceivedPromiseReject(new Error("Invalid webhook signature"));
          }
        } catch (e) {
          console.error("[Webhook Server] Error processing request:", e);
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Internal Server Error");
          webhookReceivedPromiseReject(e);
        }
      });
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  });

  server.listen(9999, "0.0.0.0", () => {
    console.log("[Webhook Server] Listening on http://localhost:9999/webhook");
  });

  // Set timeout to prevent hanging forever if webhook is not received
  const timeoutId = setTimeout(() => {
    server.close();
    webhookReceivedPromiseReject(new Error("Timeout waiting for webhook callback (10 seconds)"));
  }, 10000);

  try {
    // 6. Test GET /v1/employees (Verify Bearer Key Authentication and Scope read)
    console.log("\nTesting public-api GET /v1/employees endpoint...");
    const getRes = await fetch(`${supabaseUrl}/functions/v1/public-api/v1/employees`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${rawKey}`,
      },
    });

    if (!getRes.ok) {
      const errText = await getRes.text();
      throw new Error(`GET /v1/employees failed with status ${getRes.status}: ${errText}`);
    }

    const getData = await getRes.json();
    console.log(`GET /v1/employees succeeded! Found ${getData.data ? getData.data.length : 0} employees.`);

    // 7. Test POST /v1/employees (Create employee, triggering webhook creation)
    console.log("\nTesting public-api POST /v1/employees endpoint (should trigger webhook)...");
    const testEmployeeName = `Test Employee ${Date.now()}`;
    const postRes = await fetch(`${supabaseUrl}/functions/v1/public-api/v1/employees`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        full_name: testEmployeeName,
        status: "active",
      }),
    });

    if (!postRes.ok) {
      const errText = await postRes.text();
      throw new Error(`POST /v1/employees failed with status ${postRes.status}: ${errText}`);
    }

    const postData = await postRes.json();
    console.log(`POST /v1/employees succeeded! Created: ${postData.data.full_name} (ID: ${postData.data.id})`);

    // 8. Wait for webhook receiver to capture payload
    console.log("\nWaiting for webhook callback...");
    const result = await webhookReceivedPromise;
    clearTimeout(timeoutId);

    console.log("\nVerifying webhook payload integrity...");
    if (result.event_type !== "employee.created") {
      throw new Error(`Expected event_type 'employee.created', got '${result.event_type}'`);
    }
    if (result.body.full_name !== testEmployeeName) {
      throw new Error(`Expected full_name '${testEmployeeName}', got '${result.body.full_name}'`);
    }
    console.log("Integrity check passed! Payload matches database trigger output.");

    // 9. Clean up
    console.log("\nCleaning up test configurations from database...");
    await supabase.from("company_webhooks").delete().eq("company_id", company.id);
    await supabase.from("company_api_keys").delete().eq("company_id", company.id);
    await supabase.from("employees").delete().eq("id", postData.data.id);
    await supabase.from("companies").delete().eq("id", company.id);

    console.log("\n=== Integration Verification Successful! ===");
    server.close();
    process.exit(0);

  } catch (error) {
    console.error("\nIntegration Verification FAILED:", error.message);
    clearTimeout(timeoutId);
    server.close();
    // Try to cleanup company
    await supabase.from("companies").delete().eq("id", company.id);
    process.exit(1);
  }
}

run();
