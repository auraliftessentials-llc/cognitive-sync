import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/zoho/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const accountsServer = url.searchParams.get("accounts-server") || "https://accounts.zoho.com";

        if (!code || !state) return new Response("Missing code/state", { status: 400 });

        let uid: string;
        try {
          const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
          uid = decoded.uid;
          if (!uid) throw new Error();
          if (Date.now() - decoded.t > 600_000) throw new Error("state expired");
        } catch {
          return new Response("Invalid state", { status: 400 });
        }

        const clientId = process.env.ZOHO_CLIENT_ID;
        const clientSecret = process.env.ZOHO_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return new Response("Zoho not configured. Set ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET.", { status: 500 });
        }

        const origin = process.env.SITE_URL || `${url.protocol}//${url.host}`;
        const redirectUri = `${origin}/api/zoho/callback`;

        const tokRes = await fetch(`${accountsServer}/oauth/v2/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            code,
          }),
        });

        if (!tokRes.ok) {
          const t = await tokRes.text();
          return new Response(`Zoho token exchange failed: ${t}`, { status: 502 });
        }
        const tok = await tokRes.json();
        if (!tok.refresh_token) {
          return new Response("Zoho did not return a refresh_token. Re-auth with prompt=consent.", { status: 502 });
        }

        // Fetch primary email
        let email = "unknown@zoho";
        try {
          const eRes = await fetch(`https://mail.zoho.com/api/accounts`, {
            headers: { Authorization: `Zoho-oauthtoken ${tok.access_token}` },
          });
          if (eRes.ok) {
            const e = await eRes.json();
            email = e.data?.[0]?.primaryEmailAddress ?? email;
          }
        } catch {
          /* ignore */
        }

        const expiresAt = new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString();

        await supabaseAdmin.from("zoho_connections").upsert(
          {
            user_id: uid,
            email,
            access_token: tok.access_token,
            refresh_token: tok.refresh_token,
            api_domain: tok.api_domain ?? "https://www.zohoapis.com",
            accounts_domain: accountsServer,
            scopes: (tok.scope ?? "").split(" ").filter(Boolean),
            expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );

        await supabaseAdmin.from("audit_log").insert({
          actor_id: uid,
          actor_email: email,
          action: "zoho.connected",
          target_type: "zoho_connection",
          metadata: { email },
        });

        throw redirect({ to: "/admin", search: { tab: "zoho", connected: "1" } as any });
      },
    },
  },
});
