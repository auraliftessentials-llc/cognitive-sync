import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAuthedUser } from "@/integrations/supabase/auth-middleware";
import { getServerSupabase } from "@/integrations/supabase/client.server";

export type NoticeState = {
  noticeKey: string;
  dismissedAt: string | null;
  acknowledgedAt: string | null;
};

export type RepublishStatus = {
  needsRepublish: boolean;
  latest: {
    id: string;
    provider: string;
    rotatedAt: string;
    notes: string | null;
  } | null;
  notice: NoticeState | null;
  staleProviders: string[];
};

const NOTICE_KEY = "republish-after-rotation";

export const getRepublishStatus = createServerFn({ method: "GET" }).handler(async (): Promise<RepublishStatus> => {
  const user = await getAuthedUser().catch(() => null);
  if (!user) return { needsRepublish: false, latest: null, notice: null, staleProviders: [] };

  const sb = getServerSupabase();
  const [{ data: rotations }, { data: notice }] = await Promise.all([
    sb
      .from("key_rotations")
      .select("id, provider, rotated_at, notes, requires_republish")
      .eq("requires_republish", true)
      .order("rotated_at", { ascending: false })
      .limit(10),
    sb
      .from("user_notices")
      .select("notice_key, dismissed_at, acknowledged_at")
      .eq("user_id", user.id)
      .eq("notice_key", NOTICE_KEY)
      .maybeSingle(),
  ]);

  const latest = rotations?.[0] ?? null;
  const noticeState: NoticeState | null = notice
    ? {
        noticeKey: notice.notice_key,
        dismissedAt: notice.dismissed_at,
        acknowledgedAt: notice.acknowledged_at,
      }
    : null;

  // Republish is needed if the most recent rotation happened after the user's last acknowledgment.
  const ackAt = noticeState?.acknowledgedAt ? new Date(noticeState.acknowledgedAt).getTime() : 0;
  const needsRepublish = !!latest && new Date(latest.rotated_at).getTime() > ackAt;

  const staleProviders = Array.from(
    new Set(
      (rotations ?? [])
        .filter((r) => new Date(r.rotated_at).getTime() > ackAt)
        .map((r) => r.provider),
    ),
  );

  return {
    needsRepublish,
    latest: latest
      ? { id: latest.id, provider: latest.provider, rotatedAt: latest.rotated_at, notes: latest.notes }
      : null,
    notice: noticeState,
    staleProviders,
  };
});

const dismissSchema = z.object({ acknowledge: z.boolean().optional() });

export const setRepublishNotice = createServerFn({ method: "POST" })
  .inputValidator((data) => dismissSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await getAuthedUser();
    const sb = getServerSupabase();
    const now = new Date().toISOString();

    const payload: Record<string, unknown> = {
      user_id: user.id,
      notice_key: NOTICE_KEY,
      dismissed_at: now,
      updated_at: now,
    };
    if (data.acknowledge) payload.acknowledged_at = now;

    const { error } = await sb
      .from("user_notices")
      .upsert(payload, { onConflict: "user_id,notice_key" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
