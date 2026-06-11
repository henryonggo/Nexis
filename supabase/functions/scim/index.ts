import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hashToken(token: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // 1. Authenticate the SCIM client
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
          detail: "Unauthorized",
          status: "401",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawToken = authHeader.replace("Bearer ", "");
    if (!rawToken.startsWith("nexis_scim_")) {
      return new Response(
        JSON.stringify({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
          detail: "Invalid token format",
          status: "401",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenHash = await hashToken(rawToken);

    // Query token from database
    const { data: scimToken, error: tokenErr } = await supabaseClient
      .from("company_scim_tokens")
      .select("company_id")
      .eq("token_hash", tokenHash)
      .eq("is_active", true)
      .maybeSingle();

    if (tokenErr || !scimToken) {
      console.warn("[SCIM] Token validation failed:", tokenErr?.message);
      return new Response(
        JSON.stringify({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
          detail: "Unauthorized",
          status: "401",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const companyId = scimToken.company_id;

    // 2. Parse URL and route
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const scimIndex = pathParts.indexOf("v2");

    if (scimIndex === -1) {
      return new Response("Not Found", { status: 404 });
    }

    const resource = pathParts[scimIndex + 1]; // "Users" or "Groups"
    const resourceId = pathParts[scimIndex + 2]; // e.g. User UUID

    // Route: Groups (stub compliance)
    if (resource === "Groups") {
      return new Response(
        JSON.stringify({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
          totalResults: 0,
          startIndex: 1,
          itemsPerPage: 0,
          Resources: [],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Route: Users
    if (resource === "Users") {
      const method = req.method;

      if (method === "GET") {
        if (resourceId) {
          // GET /Users/{id}
          const { data: userRow, error: getErr } = await supabaseClient.rpc("get_scim_user_by_id", {
            p_company_id: companyId,
            p_user_id: resourceId,
          });

          if (getErr || !userRow || userRow.length === 0) {
            return new Response(
              JSON.stringify({
                schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
                detail: "User not found",
                status: "404",
              }),
              { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const u = userRow[0];
          return new Response(
            JSON.stringify({
              schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
              id: u.id,
              userName: u.email,
              name: {
                formatted: u.full_name,
              },
              emails: [{ value: u.email, primary: true }],
              active: u.deactivated_at === null,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          // GET /Users
          const filter = url.searchParams.get("filter");
          let emailFilter: string | null = null;
          if (filter) {
            const match = filter.match(/(?:userName|value)\s+eq\s+"([^"]+)"/i);
            if (match) {
              emailFilter = match[1];
            }
          }

          const { data: users, error: listErr } = await supabaseClient.rpc("get_scim_users", {
            p_company_id: companyId,
            p_email: emailFilter,
          });

          if (listErr) {
            throw listErr;
          }

          const resources = (users || []).map((u: any) => ({
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
            id: u.id,
            userName: u.email,
            name: {
              formatted: u.full_name,
            },
            emails: [{ value: u.email, primary: true }],
            active: u.deactivated_at === null,
          }));

          return new Response(
            JSON.stringify({
              schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
              totalResults: resources.length,
              startIndex: 1,
              itemsPerPage: resources.length,
              Resources: resources,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      if (method === "POST") {
        const payload = await req.json();
        const userName = payload.userName; // email
        const fullName = payload.name?.formatted || userName.split("@")[0];
        const active = payload.active !== false;

        if (!userName) {
          return new Response(
            JSON.stringify({
              schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
              detail: "Missing userName",
              status: "400",
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check if user is already a member of this company
        const { data: existingMembers } = await supabaseClient.rpc("get_scim_users", {
          p_company_id: companyId,
          p_email: userName,
        });

        if (existingMembers && existingMembers.length > 0) {
          return new Response(
            JSON.stringify({
              schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
              detail: "User is already a member of this company",
              status: "409",
            }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get default role for new SSO/SCIM members
        const { data: ssoConfig } = await supabaseClient
          .from("company_sso")
          .select("default_role")
          .eq("company_id", companyId)
          .eq("enabled", true)
          .maybeSingle();

        const defaultRole = ssoConfig?.default_role || "employee";

        // Check if user exists globally in auth.users
        const { data: globalUserId } = await supabaseClient.rpc("get_user_id_by_email", {
          p_email: userName,
        });

        let targetUserId = globalUserId;

        if (!targetUserId) {
          // Create new user in auth.users
          const { data: createdUser, error: createErr } = await supabaseClient.auth.admin.createUser({
            email: userName,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          });

          if (createErr || !createdUser?.user) {
            console.error("[SCIM] Error creating auth user:", createErr?.message);
            throw new Error(`Failed to create user in auth: ${createErr?.message}`);
          }

          targetUserId = createdUser.user.id;
          
          // Optionally trigger profile name update if not auto-updated
          await supabaseClient
            .from("profiles")
            .update({ full_name: fullName })
            .eq("id", targetUserId);
        }

        // Add to company members
        const { error: memberErr } = await supabaseClient
          .from("company_members")
          .insert({
            company_id: companyId,
            user_id: targetUserId,
            role: defaultRole,
          });

        if (memberErr) {
          console.error("[SCIM] Error inserting company member:", memberErr.message);
          throw memberErr;
        }

        // Configure activation status
        if (!active) {
          await supabaseClient.rpc("scim_set_user_active", {
            p_company_id: companyId,
            p_user_id: targetUserId,
            p_active: false,
          });
        }

        return new Response(
          JSON.stringify({
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
            id: targetUserId,
            userName: userName,
            name: {
              formatted: fullName,
            },
            emails: [{ value: userName, primary: true }],
            active: active,
          }),
          { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (method === "PUT") {
        if (!resourceId) {
          return new Response("Bad Request", { status: 400 });
        }

        const payload = await req.json();
        const fullName = payload.name?.formatted || payload.userName?.split("@")[0];

        // Update profile name
        const { error: updateErr } = await supabaseClient
          .from("profiles")
          .update({
            full_name: fullName,
            updated_at: new Date().toISOString(),
          })
          .eq("id", resourceId);

        if (updateErr) {
          throw updateErr;
        }

        return new Response(
          JSON.stringify({
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
            id: resourceId,
            userName: payload.userName,
            name: {
              formatted: fullName,
            },
            emails: [{ value: payload.userName, primary: true }],
            active: payload.active !== false,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (method === "PATCH") {
        if (!resourceId) {
          return new Response("Bad Request", { status: 400 });
        }

        const payload = await req.json();
        let active = true;

        for (const op of payload.Operations || []) {
          if (op.op?.toLowerCase() === "replace") {
            if (op.path === "active") {
              active = String(op.value) === "true";
            } else if (op.value && typeof op.value === "object" && "active" in op.value) {
              active = String(op.value.active) === "true";
            }
          }
        }

        // Apply active status via RPC
        const { error: activeErr } = await supabaseClient.rpc("scim_set_user_active", {
          p_company_id: companyId,
          p_user_id: resourceId,
          p_active: active,
        });

        if (activeErr) {
          console.error("[SCIM] Error setting user active:", activeErr.message);
          return new Response(
            JSON.stringify({
              schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
              detail: activeErr.message,
              status: "400",
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Fetch current user details to return
        const { data: userRow } = await supabaseClient.rpc("get_scim_user_by_id", {
          p_company_id: companyId,
          p_user_id: resourceId,
        });

        const u = userRow?.[0] || { email: "", full_name: "" };

        return new Response(
          JSON.stringify({
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
            id: resourceId,
            userName: u.email,
            name: {
              formatted: u.full_name,
            },
            emails: [{ value: u.email, primary: true }],
            active: active,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response("Not Found", { status: 404 });

  } catch (error: any) {
    console.error("[SCIM] Error:", error);
    return new Response(
      JSON.stringify({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: error.message,
        status: "500",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
