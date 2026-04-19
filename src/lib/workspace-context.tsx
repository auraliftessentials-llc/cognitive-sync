import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { listMyWorkspaces } from "@/lib/workspace.functions";
import { useAuth } from "./auth-context";

type Workspace = { id: string; name: string; slug: string; owner_id: string; role: string; created_at: string };

type Ctx = {
  workspaces: Workspace[];
  active: Workspace | null;
  setActive: (w: Workspace) => void;
  reload: () => Promise<void>;
  loading: boolean;
};

const C = createContext<Ctx | null>(null);
const STORAGE_KEY = "neuralops:active_workspace";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [active, setActiveState] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!user) {
      setWorkspaces([]);
      setActiveState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await listMyWorkspaces();
      const ws = res.workspaces as Workspace[];
      setWorkspaces(ws);
      const stored = localStorage.getItem(STORAGE_KEY);
      const found = ws.find((w) => w.id === stored) ?? ws[0] ?? null;
      setActiveState(found);
    } catch {
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const setActive = (w: Workspace) => {
    setActiveState(w);
    localStorage.setItem(STORAGE_KEY, w.id);
  };

  return (
    <C.Provider value={{ workspaces, active, setActive, reload, loading }}>{children}</C.Provider>
  );
}

export function useWorkspace() {
  const v = useContext(C);
  if (!v) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return v;
}
