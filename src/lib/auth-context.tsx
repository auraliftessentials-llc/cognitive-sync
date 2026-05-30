import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "super_admin" | "admin" | "user";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: Role[];
  isSuperAdmin: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);

  const loadRoles = async (uid: string | undefined) => {
    if (!uid) return setRoles([]);
    // Throne-aware: resolves linked operator emails to the primary super_admin.
    const { data, error } = await supabase.rpc("get_operator_roles" as any, {
      _user_id: uid,
    });
    if (error) {
      // Fallback to direct read of own roles.
      const { data: own } = await supabase
        .from("user_roles" as any)
        .select("role")
        .eq("user_id", uid);
      setRoles(((own as any[]) ?? []).map((r) => r.role as Role));
      return;
    }
    const rows = (data as any[]) ?? [];
    setRoles(rows.map((r) => (typeof r === "string" ? r : r.role) as Role));
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      // defer to avoid deadlock inside the auth callback
      setTimeout(() => loadRoles(s?.user?.id), 0);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      loadRoles(s?.user?.id).finally(() => setLoading(false));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn: AuthCtx["signIn"] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };
  const signUp: AuthCtx["signUp"] = async (email, password) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error: error?.message ?? null };
  };
  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value: AuthCtx = {
    user,
    session,
    loading,
    roles,
    isSuperAdmin: roles.includes("super_admin"),
    isAdmin: roles.includes("admin") || roles.includes("super_admin"),
    signIn,
    signUp,
    signOut,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
