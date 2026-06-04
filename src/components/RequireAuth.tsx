import { type ReactNode } from "react";

/**
 * AUTH GATE TEMPORARILY DISABLED BY OPERATOR.
 * Original gate preserved in git history; restore by reverting this file.
 * Every route renders for any visitor — one-click entry.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
