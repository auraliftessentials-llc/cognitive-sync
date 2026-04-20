import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

function authHeaders() {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": RESEND_API_KEY,
    "Content-Type": "application/json",
  };
}

export type ResendStatus = {
  ok: boolean;
  configured: boolean;
  domains: Array<{ id: string; name: string; status: string; region?: string }>;
  message: string;
};

export const getResendStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<ResendStatus> => {
    if (!process.env.RESEND_API_KEY || !process.env.LOVABLE_API_KEY) {
      return { ok: false, configured: false, domains: [], message: "Resend connector is not linked." };
    }
    try {
      const res = await fetch(`${GATEWAY_URL}/domains`, { headers: authHeaders() });
      const text = await res.text();
      let body: any = {};
      try { body = JSON.parse(text); } catch { body = { raw: text }; }
      if (!res.ok) {
        return { ok: false, configured: true, domains: [], message: `Resend [${res.status}]: ${text.slice(0, 300)}` };
      }
      const domains = (body?.data ?? []).map((d: any) => ({
        id: d.id, name: d.name, status: d.status, region: d.region,
      }));
      return { ok: true, configured: true, domains, message: domains.length ? `${domains.length} domain(s) verified.` : "Connected. No verified domains yet — use onboarding@resend.dev for testing." };
    } catch (e: any) {
      return { ok: false, configured: true, domains: [], message: e?.message ?? "Unknown error" };
    }
  });

export const sendResendTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { to: string; from?: string }) => {
    if (!input?.to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.to)) {
      throw new Error("A valid recipient email is required.");
    }
    return { to: input.to.trim(), from: input.from?.trim() || "Lovable Test <onboarding@resend.dev>" };
  })
  .handler(async ({ data }) => {
    const res = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        from: data.from,
        to: [data.to],
        subject: "Resend test from your command center",
        html: `<p>Hello from <strong>Lovable Cloud</strong>.</p><p>If you're reading this, the Resend connector is wired up correctly.</p><p style="color:#888;font-size:12px">Sent at ${new Date().toISOString()}</p>`,
      }),
    });
    const text = await res.text();
    let body: any = {};
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    if (!res.ok) {
      throw new Error(`Resend [${res.status}]: ${text.slice(0, 400)}`);
    }
    return { ok: true, id: body?.id ?? null, message: `Sent to ${data.to}` };
  });
