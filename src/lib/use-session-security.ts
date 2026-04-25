import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_LEAD_MS = 60 * 1000; // refresh 60s before expiry

/**
 * Session security: idle auto-logout, refresh-on-focus, expiry watchdog,
 * and reactive sign-out when the session is revoked elsewhere.
 */
export function useSessionSecurity() {
  const nav = useNavigate();
  const lastActive = useRef(Date.now());
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const bumpActivity = () => {
      lastActive.current = Date.now();
    };

    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, bumpActivity, { passive: true }));

    const checkIdle = async () => {
      if (Date.now() - lastActive.current > IDLE_TIMEOUT_MS) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          await supabase.auth.signOut();
          toast.warning("Signed out due to inactivity");
          nav({ to: "/auth" });
        }
      }
    };
    idleTimer.current = setInterval(checkIdle, 60_000);

    const onFocus = async () => {
      bumpActivity();
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const expiresAtMs = (data.session.expires_at ?? 0) * 1000;
      if (expiresAtMs - Date.now() < REFRESH_LEAD_MS) {
        await supabase.auth.refreshSession();
      }
    };
    window.addEventListener("focus", onFocus);

    const scheduleExpiryWatch = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.expires_at) return;
      const ms = data.session.expires_at * 1000 - Date.now() - REFRESH_LEAD_MS;
      if (expiryTimer.current) clearTimeout(expiryTimer.current);
      if (ms > 0) {
        expiryTimer.current = setTimeout(async () => {
          await supabase.auth.refreshSession();
          scheduleExpiryWatch();
        }, ms);
      }
    };
    scheduleExpiryWatch();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        nav({ to: "/auth" });
      }
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        scheduleExpiryWatch();
      }
      if (event === "USER_UPDATED" && !session) {
        toast.warning("Session ended");
        nav({ to: "/auth" });
      }
    });

    return () => {
      events.forEach((e) => window.removeEventListener(e, bumpActivity));
      window.removeEventListener("focus", onFocus);
      if (idleTimer.current) clearInterval(idleTimer.current);
      if (expiryTimer.current) clearTimeout(expiryTimer.current);
      sub.subscription.unsubscribe();
    };
  }, [nav]);
}
