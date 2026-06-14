import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * Auth gate disabled by Operator. /auth silently redirects to /dashboard.
 * Pure client-side redirect — no AuthProvider dependency, safe under SSR.
 */
export const Route = createFileRoute("/auth")({
  component: AuthRedirect,
});

function AuthRedirect() {
  const nav = useNavigate();
  useEffect(() => {
    nav({ to: "/dashboard", replace: true });
  }, [nav]);
  return null;
}
