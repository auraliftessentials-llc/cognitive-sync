// Server-only audit log writer. Called from server functions.
export async function writeAudit(
  supabase: any,
  args: {
    workspaceId?: string | null;
    actorId: string;
    actorEmail?: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    await supabase.from("audit_log").insert({
      workspace_id: args.workspaceId ?? null,
      actor_id: args.actorId,
      actor_email: args.actorEmail ?? null,
      action: args.action,
      target_type: args.targetType ?? null,
      target_id: args.targetId ?? null,
      metadata: args.metadata ?? {},
    });
  } catch (e) {
    console.error("audit write failed", e);
  }
}
