/**
 * PWAInstallPrompt — captures the deferred beforeinstallprompt event and
 * surfaces a single sovereign install button. Hides itself if the app is
 * already installed (display-mode: standalone) or after dismissal.
 */
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "merkabah:install-dismissed";

export function PWAInstallPrompt() {
  const [evt, setEvt] = useState<DeferredPrompt | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(display-mode: standalone)").matches) return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as DeferredPrompt);
      setShown(true);
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);
    return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
  }, []);

  if (!shown || !evt) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShown(false);
  };

  const install = async () => {
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      if (choice.outcome === "accepted") setShown(false);
      else dismiss();
    } catch {
      dismiss();
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[100] max-w-xs cathedral-card rounded-xl p-4 border border-brand-blue/40 shadow-2xl backdrop-blur animate-fade-in-up">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-brand-cyan to-brand-violet flex items-center justify-center shrink-0">
          <Download className="h-5 w-5 text-black" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.3em] text-brand-cyan font-display">
            INSTALL · OPERATOR
          </div>
          <div className="text-sm mt-1 font-medium">Make Merkabah OS your sovereign command layer.</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Adds to home screen with offline shell, push, and ⌘K everywhere.
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={install} className="bg-brand-blue hover:bg-brand-blue/90 text-white h-7 text-xs">
              Install
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss} className="h-7 text-xs">
              Later
            </Button>
          </div>
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
