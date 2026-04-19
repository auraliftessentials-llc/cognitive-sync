import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { acceptInvite } from "@/lib/workspace.functions";
import { Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  component: InviteAccept,
});

function InviteAccept() {
  const { token } = Route.useParams();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      sessionStorage.setItem("pendingInvite", token);
      nav({ to: "/auth" });
    }
  }, [loading, user, token, nav]);

  const accept = async () => {
    setWorking(true);
    try {
      await acceptInvite({ data: { token } });
      sessionStorage.removeItem("pendingInvite");
      toast.success("Welcome to the workspace!");
      nav({ to: "/dashboard" });
    } catch (e: any) {
      toast.error(e.message ?? "Could not accept invite");
    } finally {
      setWorking(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Brain className="h-10 w-10 text-primary animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="p-8 max-w-md w-full text-center space-y-4">
        <Brain className="h-10 w-10 text-primary mx-auto" />
        <h1 className="font-display text-2xl">You've been invited</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-mono">{user.email}</span>. Click below to join the workspace.
        </p>
        <Button onClick={accept} disabled={working} className="w-full">
          {working ? "Joining…" : "Accept invite"}
        </Button>
      </Card>
    </div>
  );
}
