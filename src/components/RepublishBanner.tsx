import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

const STORAGE_KEY = "republish-banner-dismissed-v1";

export function RepublishBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 text-amber-100 px-4 py-2.5 flex items-center gap-3 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
      <div className="flex-1 min-w-0">
        <span className="font-medium">Re-publish required:</span>{" "}
        <span className="text-amber-100/80">
          Backend API keys were rotated. Click <strong>Publish → Update</strong> in the top-right of the Lovable editor so the live site picks up the new keys.
        </span>{" "}
        <a
          href="https://docs.lovable.dev/features/deploy"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-amber-50"
        >
          How to publish →
        </a>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="p-1 rounded hover:bg-amber-500/20 transition shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
