/**
 * Connector status — reports which connector credentials are present in the
 * server runtime and (for gateway-backed ones) whether they verify.
 * Returns only names + status; never any secret value.
 */
import { createServerFn } from "@tanstack/react-start";

export type ConnectorState = {
  id: string;
  label: string;
  envVar: string;
  gateway: boolean;
  configured: boolean;
  status: "ok" | "unverified" | "missing" | "failed";
  latency_ms?: number;
  message?: string;
};

const CONNECTORS: Array<{ id: string; label: string; envVar: string; gateway: boolean }> = [
  { id: "linear", label: "Linear", envVar: "LINEAR_API_KEY", gateway: true },
  { id: "resend", label: "Resend", envVar: "RESEND_API_KEY", gateway: true },
  { id: "google_mail", label: "Gmail", envVar: "GOOGLE_MAIL_API_KEY", gateway: true },
  { id: "google_drive", label: "Google Drive", envVar: "GOOGLE_DRIVE_API_KEY", gateway: true },
  { id: "google_sheets", label: "Google Sheets", envVar: "GOOGLE_SHEETS_API_KEY", gateway: true },
  { id: "notion", label: "Notion", envVar: "NOTION_API_KEY", gateway: true },
  { id: "firecrawl", label: "Firecrawl", envVar: "FIRECRAWL_API_KEY", gateway: false },
  { id: "perplexity", label: "Perplexity", envVar: "PERPLEXITY_API_KEY", gateway: false },
  { id: "elevenlabs", label: "ElevenLabs", envVar: "ELEVENLABS_API_KEY", gateway: false },
  { id: "xai", label: "xAI (Grok 4 master)", envVar: "XAI_API_KEY", gateway: false },
];

export const getConnectorStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ connectors: ConnectorState[]; generated_at: string }> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];

    const connectors = await Promise.all(
      CONNECTORS.map(async (c): Promise<ConnectorState> => {
        const key = process.env[c.envVar];
        if (!key) {
          return { ...c, configured: false, status: "missing", message: "Not linked to this project" };
        }
        if (!c.gateway || !lovableKey) {
          return { ...c, configured: true, status: "unverified", message: "Key present (direct API)" };
        }
        const t0 = Date.now();
        try {
          const r = await fetch("https://connector-gateway.lovable.dev/api/v1/verify_credentials", {
            method: "POST",
            headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": key },
          });
          const latency_ms = Date.now() - t0;
          const body: any = await r.json().catch(() => ({}));
          if (!r.ok) {
            return { ...c, configured: true, status: "failed", latency_ms, message: `Gateway ${r.status}` };
          }
          const outcome = body?.outcome as string | undefined;
          return {
            ...c,
            configured: true,
            latency_ms,
            status: outcome === "verified" ? "ok" : outcome === "failed" ? "failed" : "unverified",
            message: body?.error ?? outcome ?? "checked",
          };
        } catch (e: any) {
          return { ...c, configured: true, status: "failed", message: e?.message ?? "check failed" };
        }
      }),
    );

    return { connectors, generated_at: new Date().toISOString() };
  },
);
