
The user has a Resend API key and wants to wire it up. Resend is available as a Lovable connector that uses the connector gateway — this is the cleanest path (no manual secret entry, automatic auth handling, no domain verification headaches with their own API key).

Plan:

## Connect Resend via Lovable Connector

1. **Link Resend connection** — use the standard connector flow so the user picks/creates their Resend connection in the workspace. This makes `RESEND_API_KEY` and `LOVABLE_API_KEY` available as env vars in the server runtime automatically. No manual secret pasting.

2. **Add a tiny health-check server function** at `src/lib/resend.functions.ts`:
   - `getResendStatus` — calls `GET https://connector-gateway.lovable.dev/resend/domains` through the gateway to confirm the key works and returns the list of verified sending domains (or empty if none).
   - Returns `{ ok, domains, message }` so the UI can show green/red.

3. **Add a "Resend" card to the dashboard** (`src/routes/dashboard.tsx`) showing:
   - Connection status (connected / not connected)
   - List of verified domains pulled from Resend
   - A "Send test email" button that POSTs to a second server function `sendResendTest({ to, from })` hitting `POST /resend/emails` via the gateway with a hardcoded subject/body.

4. **Guardrails** — both server functions use `requireSupabaseAuth` middleware so only signed-in super-admin (you) can call them. Errors from the gateway are surfaced verbatim so we can see exactly what Resend says.

No new tables, no migrations, no edge functions. Pure server functions + connector gateway.

If you'd rather skip the connector and just paste the raw key as a backend secret instead, say so and I'll swap step 1 for an `add_secret` call.
