-- Executive Agents: brain-switching AI agents with run history
CREATE TABLE public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  emoji text NOT NULL DEFAULT '🧠',
  system_prompt text NOT NULL,
  default_model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  available_models text[] NOT NULL DEFAULT ARRAY[
    'google/gemini-2.5-flash',
    'google/gemini-2.5-pro',
    'google/gemini-2.5-flash-lite',
    'openai/gpt-5',
    'openai/gpt-5-mini',
    'openai/gpt-5-nano'
  ],
  reasoning_effort text NOT NULL DEFAULT 'medium',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  model text NOT NULL,
  prompt text NOT NULL,
  output text,
  status text NOT NULL DEFAULT 'pending',
  tokens_in int,
  tokens_out int,
  duration_ms int,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_agents_workspace ON public.agents(workspace_id);
CREATE INDEX idx_agent_runs_agent ON public.agent_runs(agent_id, created_at DESC);
CREATE INDEX idx_agent_runs_workspace ON public.agent_runs(workspace_id, created_at DESC);

-- Agents RLS: workspace members read, owners/admins/managers write, system agents readable by all authenticated
CREATE POLICY "ws members read agents" ON public.agents FOR SELECT TO authenticated
  USING (is_system = true OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid())) OR user_id = auth.uid());

CREATE POLICY "ws managers write agents" ON public.agents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (workspace_id IS NULL OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','manager']::workspace_role[])));

CREATE POLICY "ws managers update agents" ON public.agents FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (workspace_id IS NOT NULL AND public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','manager']::workspace_role[])));

CREATE POLICY "ws managers delete agents" ON public.agents FOR DELETE TO authenticated
  USING (is_system = false AND (user_id = auth.uid() OR (workspace_id IS NOT NULL AND public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]))));

CREATE POLICY "super_admin all agents" ON public.agents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Agent runs RLS
CREATE POLICY "users view own runs" ON public.agent_runs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "ws members view ws runs" ON public.agent_runs FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "users insert own runs" ON public.agent_runs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users update own runs" ON public.agent_runs FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "super_admin all runs" ON public.agent_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_agents_updated BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER TABLE public.agent_runs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_runs;

-- Seed 4 system agents (visible to all)
INSERT INTO public.agents (user_id, slug, name, role, emoji, system_prompt, default_model, is_system) VALUES
  ('00000000-0000-0000-0000-000000000000', 'strategist', 'Atlas', 'Chief Strategist',  '🧭',
    'You are Atlas, an executive-level chief strategist. Think in 3-horizon frameworks (now / next / future). Always: 1) restate the goal, 2) surface 2-3 strategic options with explicit tradeoffs, 3) recommend ONE path with conviction and reasoning, 4) list the first 3 concrete actions for the next 24h. Be direct, terse, and decisive. No fluff.',
    'openai/gpt-5', true),
  ('00000000-0000-0000-0000-000000000000', 'analyst',    'Cipher', 'Lead Analyst',     '📊',
    'You are Cipher, a quant-grade analyst. For every input: extract the data, identify the metric that matters, compute or estimate it, then deliver: TL;DR (one sentence), Key Findings (bullets with numbers), Confidence (low/med/high + why), Recommended Action. Show your math. Flag assumptions explicitly.',
    'google/gemini-2.5-pro', true),
  ('00000000-0000-0000-0000-000000000000', 'operator',   'Forge',  'Operations Lead',  '⚙️',
    'You are Forge, an operations executor. Convert any vague request into a runnable plan: numbered steps, owner, time estimate, dependencies, definition-of-done. If something is blocked, name the blocker. End with a single "Next physical action" the user can do in <5 min.',
    'google/gemini-2.5-flash', true),
  ('00000000-0000-0000-0000-000000000000', 'communicator', 'Echo', 'Communications Director', '✉️',
    'You are Echo, an executive communications director. Match tone to audience (board / customer / team / public). Default structure: Subject/Hook, Context (1 line), Core message (3 bullets max), Ask/CTA. Punchy. Zero corporate filler. Offer 2 alternative tones when useful.',
    'openai/gpt-5-mini', true);