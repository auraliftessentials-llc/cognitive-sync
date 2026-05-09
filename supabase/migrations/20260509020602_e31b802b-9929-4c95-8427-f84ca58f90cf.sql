
-- Usage / billing analytics
CREATE INDEX IF NOT EXISTS idx_usage_events_user_created ON public.usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_provider_model ON public.usage_events(provider, model, created_at DESC);

-- Agent runs / tool calls (history views)
CREATE INDEX IF NOT EXISTS idx_agent_runs_user_created ON public.agent_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_created ON public.agent_runs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_run ON public.agent_tool_calls(run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_user ON public.agent_tool_calls(user_id, created_at DESC);

-- Chat
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON public.conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON public.messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_user_created ON public.messages(user_id, created_at DESC);

-- Audit (super_admin & workspace dashboards)
CREATE INDEX IF NOT EXISTS idx_audit_log_workspace_created ON public.audit_log(workspace_id, created_at DESC) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_created ON public.audit_log(actor_id, created_at DESC) WHERE actor_id IS NOT NULL;

-- Webhook deliveries (settings/integrations panel)
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_created ON public.command_webhook_deliveries(webhook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_user_created ON public.command_webhook_deliveries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_command ON public.command_webhook_deliveries(command_id) WHERE command_id IS NOT NULL;

-- Bridge audit (Mac bridge dashboard)
CREATE INDEX IF NOT EXISTS idx_bridge_audit_device_created ON public.bridge_audit(device_id, created_at DESC) WHERE device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bridge_audit_user_created ON public.bridge_audit(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bridge_devices_user_paired ON public.bridge_devices(user_id) WHERE paired_at IS NOT NULL AND revoked_at IS NULL;

-- CLI schedules / runs
CREATE INDEX IF NOT EXISTS idx_cli_schedule_runs_schedule_started ON public.cli_schedule_runs(schedule_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cli_schedule_runs_user_started ON public.cli_schedule_runs(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cli_schedules_enabled ON public.cli_schedules(enabled, lock_until) WHERE enabled = true;

-- Frontier intel feed (recency-ordered)
CREATE INDEX IF NOT EXISTS idx_frontier_intel_discovered ON public.frontier_intel(discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_frontier_intel_category_discovered ON public.frontier_intel(category, discovered_at DESC);

-- Workspace membership (RLS hot path: is_workspace_member)
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_user ON public.workspace_members(workspace_id, user_id);

-- Suggestions & projects (dashboard widgets)
CREATE INDEX IF NOT EXISTS idx_suggestions_user_dismissed ON public.suggestions(user_id, dismissed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_user_status_priority ON public.projects(user_id, status, priority);

-- Refresh stats so the planner uses the new indexes immediately
ANALYZE public.usage_events, public.agent_runs, public.agent_tool_calls,
        public.conversations, public.messages, public.audit_log,
        public.command_webhook_deliveries, public.bridge_audit,
        public.bridge_devices, public.cli_schedule_runs, public.cli_schedules,
        public.frontier_intel, public.workspace_members,
        public.suggestions, public.projects, public.merkabah_commands,
        public.identity_links, public.user_roles;
