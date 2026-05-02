
-- Bridge devices: one row per paired Mac/Linux/Windows daemon
CREATE TABLE public.bridge_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  platform text NOT NULL DEFAULT 'macos',
  hostname text,
  api_key_hash text UNIQUE,                -- sha256(raw key); raw never stored
  api_key_prefix text,                     -- first 12 chars for display (mbk_xxxx)
  pairing_code text UNIQUE,                -- 8-char human code, null after pairing
  pairing_expires_at timestamptz,
  paired_at timestamptz,
  allowed_roots text[] NOT NULL DEFAULT ARRAY['~']::text[],
  capabilities text[] NOT NULL DEFAULT ARRAY['fs.read','fs.list']::text[],
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bridge_devices_user_idx ON public.bridge_devices(user_id);
CREATE INDEX bridge_devices_pairing_idx ON public.bridge_devices(pairing_code) WHERE pairing_code IS NOT NULL;

ALTER TABLE public.bridge_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own devices"
  ON public.bridge_devices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own devices"
  ON public.bridge_devices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own devices"
  ON public.bridge_devices FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own devices"
  ON public.bridge_devices FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER bridge_devices_updated_at
  BEFORE UPDATE ON public.bridge_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit log of every bridge operation
CREATE TABLE public.bridge_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid REFERENCES public.bridge_devices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,                    -- fs.list / fs.read / fs.write / shell.exec / status
  target text,                             -- path or command
  ok boolean NOT NULL DEFAULT true,
  error text,
  bytes integer,
  duration_ms integer,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bridge_audit_user_idx ON public.bridge_audit(user_id, created_at DESC);
CREATE INDEX bridge_audit_device_idx ON public.bridge_audit(device_id, created_at DESC);

ALTER TABLE public.bridge_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own bridge audit"
  ON public.bridge_audit FOR SELECT
  USING (auth.uid() = user_id);

-- Resolve a device by its raw-key hash. SECURITY DEFINER so the public bridge
-- endpoint can authenticate without an authenticated session.
CREATE OR REPLACE FUNCTION public.find_bridge_device(_hash text)
RETURNS TABLE(device_id uuid, user_id uuid, allowed_roots text[], capabilities text[])
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE rec record;
BEGIN
  SELECT d.id, d.user_id, d.allowed_roots, d.capabilities
    INTO rec
    FROM public.bridge_devices d
   WHERE d.api_key_hash = _hash
     AND d.revoked_at IS NULL
     AND d.paired_at IS NOT NULL
   LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.bridge_devices SET last_seen_at = now() WHERE id = rec.id;
  device_id := rec.id; user_id := rec.user_id;
  allowed_roots := rec.allowed_roots; capabilities := rec.capabilities;
  RETURN NEXT;
END $$;

-- Claim a pairing code: swap the human code for a real API key hash.
CREATE OR REPLACE FUNCTION public.claim_bridge_pairing(_code text, _hash text, _prefix text, _hostname text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE did uuid;
BEGIN
  UPDATE public.bridge_devices
     SET api_key_hash = _hash,
         api_key_prefix = _prefix,
         hostname = COALESCE(_hostname, hostname),
         pairing_code = NULL,
         pairing_expires_at = NULL,
         paired_at = now(),
         last_seen_at = now()
   WHERE pairing_code = _code
     AND pairing_expires_at > now()
     AND paired_at IS NULL
  RETURNING id INTO did;
  RETURN did;
END $$;
