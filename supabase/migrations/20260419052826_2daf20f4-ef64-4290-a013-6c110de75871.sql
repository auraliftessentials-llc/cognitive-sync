-- =========================================================
-- PHASE 1: Multi-tenant workspaces + scoped roles + invites
-- + audit log + feature flags + Zoho token vault scaffolding
-- =========================================================

-- 1) Enums
CREATE TYPE public.workspace_role AS ENUM ('owner', 'admin', 'manager', 'member');

-- 2) Workspaces
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- 3) Workspace members
CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_workspace_members_user ON public.workspace_members(user_id);
CREATE INDEX idx_workspace_members_ws ON public.workspace_members(workspace_id);

-- 4) Workspace invites
CREATE TABLE public.workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'member',
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by uuid NOT NULL,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_invites_email ON public.workspace_invites(lower(email));
CREATE INDEX idx_invites_token ON public.workspace_invites(token);

-- 5) Audit log
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_audit_ws_time ON public.audit_log(workspace_id, created_at DESC);
CREATE INDEX idx_audit_actor ON public.audit_log(actor_id, created_at DESC);

-- 6) Feature flags (global + per-user overrides)
CREATE TABLE public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_feature_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  key text NOT NULL,
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);
ALTER TABLE public.user_feature_overrides ENABLE ROW LEVEL SECURITY;

-- 7) Zoho OAuth tokens (per user)
CREATE TABLE public.zoho_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  api_domain text NOT NULL DEFAULT 'https://www.zohoapis.com',
  accounts_domain text NOT NULL DEFAULT 'https://accounts.zoho.com',
  scopes text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.zoho_connections ENABLE ROW LEVEL SECURITY;

-- 8) Add workspace_id to existing tables (nullable for backward compat, default to user's primary ws via trigger later)
ALTER TABLE public.projects ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.suggestions ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.conversations ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
CREATE INDEX idx_projects_ws ON public.projects(workspace_id);
CREATE INDEX idx_suggestions_ws ON public.suggestions(workspace_id);
CREATE INDEX idx_conversations_ws ON public.conversations(workspace_id);

-- =========================================================
-- HELPER FUNCTIONS (SECURITY DEFINER, no recursion)
-- =========================================================

-- Is the user a member of this workspace?
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
  );
$$;

-- Get user's role in a workspace (NULL if not a member)
CREATE OR REPLACE FUNCTION public.workspace_role_of(_workspace_id uuid, _user_id uuid)
RETURNS public.workspace_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.workspace_members
  WHERE workspace_id = _workspace_id AND user_id = _user_id
  LIMIT 1;
$$;

-- Does user have at least one of the given roles in this workspace?
CREATE OR REPLACE FUNCTION public.has_workspace_role(_workspace_id uuid, _user_id uuid, _roles public.workspace_role[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id
      AND user_id = _user_id
      AND role = ANY(_roles)
  );
$$;

-- Is the user a super_admin (cross-workspace god mode)?
-- Already exists via has_role(_user_id, 'super_admin')

-- =========================================================
-- RLS POLICIES
-- =========================================================

-- workspaces: super_admin sees all, members see their ws, owner can update
CREATE POLICY "super_admin all workspaces" ON public.workspaces
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "members view their workspaces" ON public.workspaces
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(id, auth.uid()));

CREATE POLICY "owners/admins update workspace" ON public.workspaces
  FOR UPDATE TO authenticated
  USING (public.has_workspace_role(id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));

CREATE POLICY "authenticated create workspace" ON public.workspaces
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

-- workspace_members
CREATE POLICY "super_admin all members" ON public.workspace_members
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "members view co-members" ON public.workspace_members
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "owners/admins manage members" ON public.workspace_members
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));

-- workspace_invites
CREATE POLICY "super_admin all invites" ON public.workspace_invites
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "owners/admins manage invites" ON public.workspace_invites
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));

-- audit_log: super_admin everything; ws admins see their ws; users see own actions
CREATE POLICY "super_admin all audit" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "ws admins view ws audit" ON public.audit_log
  FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));

CREATE POLICY "users view own audit" ON public.audit_log
  FOR SELECT TO authenticated
  USING (actor_id = auth.uid());

CREATE POLICY "system insert audit" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- feature_flags: everyone reads, only super_admin writes
CREATE POLICY "everyone reads flags" ON public.feature_flags
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "super_admin writes flags" ON public.feature_flags
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- user_feature_overrides
CREATE POLICY "users see own overrides" ON public.user_feature_overrides
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "super_admin manages overrides" ON public.user_feature_overrides
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- zoho_connections: only owner sees/manages; super_admin can see existence (not tokens — enforced in app layer)
CREATE POLICY "users manage own zoho" ON public.zoho_connections
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "super_admin reads zoho" ON public.zoho_connections
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- =========================================================
-- UPDATE EXISTING TABLE POLICIES TO BE WORKSPACE-AWARE
-- =========================================================

-- PROJECTS
DROP POLICY IF EXISTS "Admins view all projects" ON public.projects;
DROP POLICY IF EXISTS "Users view own projects" ON public.projects;
DROP POLICY IF EXISTS "Users insert own projects" ON public.projects;
DROP POLICY IF EXISTS "Users update own projects" ON public.projects;
DROP POLICY IF EXISTS "Users delete own projects" ON public.projects;

CREATE POLICY "super_admin all projects" ON public.projects
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "ws members view ws projects" ON public.projects
  FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "users view own projects" ON public.projects
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "users insert own projects" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id, auth.uid())));

CREATE POLICY "users update own projects" ON public.projects
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "ws admins update ws projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (workspace_id IS NOT NULL AND public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','manager']::public.workspace_role[]));

CREATE POLICY "users delete own projects" ON public.projects
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- SUGGESTIONS
DROP POLICY IF EXISTS "Admins view all suggestions" ON public.suggestions;
DROP POLICY IF EXISTS "Users view own suggestions" ON public.suggestions;
DROP POLICY IF EXISTS "Users insert own suggestions" ON public.suggestions;
DROP POLICY IF EXISTS "Users update own suggestions" ON public.suggestions;
DROP POLICY IF EXISTS "Users delete own suggestions" ON public.suggestions;

CREATE POLICY "super_admin all suggestions" ON public.suggestions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "ws members view ws suggestions" ON public.suggestions
  FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "users own suggestions select" ON public.suggestions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "users own suggestions insert" ON public.suggestions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "users own suggestions update" ON public.suggestions
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "users own suggestions delete" ON public.suggestions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- CONVERSATIONS
DROP POLICY IF EXISTS "Admins view all conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users view own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users insert own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users update own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users delete own conversations" ON public.conversations;

CREATE POLICY "super_admin all conversations" ON public.conversations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "ws admins view ws conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));
CREATE POLICY "users own conversations select" ON public.conversations
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "users own conversations insert" ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "users own conversations update" ON public.conversations
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "users own conversations delete" ON public.conversations
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- =========================================================
-- ATOMIC RPC: accept invite (creates membership)
-- =========================================================
CREATE OR REPLACE FUNCTION public.accept_workspace_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  inv public.workspace_invites%ROWTYPE;
  user_email text;
BEGIN
  SELECT * INTO inv FROM public.workspace_invites WHERE token = _token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite not found'; END IF;
  IF inv.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'Invite already used'; END IF;
  IF inv.expires_at < now() THEN RAISE EXCEPTION 'Invite expired'; END IF;

  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();
  IF lower(user_email) <> lower(inv.email) THEN
    RAISE EXCEPTION 'This invite is for a different email address';
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (inv.workspace_id, auth.uid(), inv.role)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.workspace_invites SET accepted_at = now() WHERE id = inv.id;

  INSERT INTO public.audit_log (workspace_id, actor_id, action, target_type, target_id, metadata)
  VALUES (inv.workspace_id, auth.uid(), 'invite.accepted', 'workspace_member', auth.uid()::text,
          jsonb_build_object('role', inv.role, 'email', user_email));

  RETURN inv.workspace_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invite(text) TO authenticated;

-- =========================================================
-- TRIGGER: auto-create personal workspace on signup
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user_workspace()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ws_id uuid;
  ws_slug text;
BEGIN
  ws_slug := lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9]+', '-', 'g')) || '-' || substr(NEW.id::text, 1, 6);
  INSERT INTO public.workspaces (name, slug, owner_id)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)) || '''s workspace', ws_slug, NEW.id)
  RETURNING id INTO ws_id;
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (ws_id, NEW.id, 'owner');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_workspace ON auth.users;
CREATE TRIGGER on_auth_user_workspace
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_workspace();

-- updated_at triggers
CREATE TRIGGER trg_workspaces_updated BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_zoho_updated BEFORE UPDATE ON public.zoho_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- BACKFILL: create personal workspace for existing users
-- =========================================================
DO $$
DECLARE u RECORD; ws_id uuid; ws_slug text;
BEGIN
  FOR u IN SELECT id, email, raw_user_meta_data FROM auth.users LOOP
    IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE owner_id = u.id) THEN
      ws_slug := lower(regexp_replace(split_part(u.email, '@', 1), '[^a-z0-9]+', '-', 'g')) || '-' || substr(u.id::text, 1, 6);
      INSERT INTO public.workspaces (name, slug, owner_id)
      VALUES (COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)) || '''s workspace', ws_slug, u.id)
      RETURNING id INTO ws_id;
      INSERT INTO public.workspace_members (workspace_id, user_id, role)
      VALUES (ws_id, u.id, 'owner') ON CONFLICT DO NOTHING;
      UPDATE public.projects SET workspace_id = ws_id WHERE user_id = u.id AND workspace_id IS NULL;
      UPDATE public.suggestions SET workspace_id = ws_id WHERE user_id = u.id AND workspace_id IS NULL;
      UPDATE public.conversations SET workspace_id = ws_id WHERE user_id = u.id AND workspace_id IS NULL;
    END IF;
  END LOOP;
END $$;

-- Seed default feature flags
INSERT INTO public.feature_flags (key, enabled, description) VALUES
  ('live_feed', true, 'Realtime activity stream in Command Bridge'),
  ('zoho_mail', false, 'Zoho Mail integration'),
  ('zoho_crm', false, 'Zoho CRM integration'),
  ('ai_auto_brief', true, 'Auto-generate fleet AI briefings'),
  ('audit_verbose', false, 'Log every user mutation, not just admin actions')
ON CONFLICT (key) DO NOTHING;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_members;
ALTER TABLE public.audit_log REPLICA IDENTITY FULL;
ALTER TABLE public.workspace_members REPLICA IDENTITY FULL;