import { Outlet, createRootRoute, HeadContent, Scripts, Link } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center glow-border rounded-lg p-10">
        <h1 className="text-7xl font-display text-primary glow-text">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Signal lost</h2>
        <p className="mt-2 text-sm text-muted-foreground">This node doesn't exist in the network.</p>
        <Link
          to="/dashboard"
          className="inline-flex mt-6 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Return to pulse
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Neural Ops — Your project command center" },
      {
        name: "description",
        content:
          "A self-syncing cognitive layer for your entire project library. AI agents that know what you're working on and what to do next.",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthHeaderInjector() {
  // Inject auth token into all server-fn fetch requests
  useEffect(() => {
    const orig = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/_serverFn/")) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
          headers.set("Authorization", `Bearer ${session.access_token}`);
          return orig(input, { ...init, headers });
        }
      }
      return orig(input, init);
    };
    return () => { window.fetch = orig; };
  }, []);
  return null;
}

function RootComponent() {
  return (
    <AuthProvider>
      <AuthHeaderInjector />
      <Outlet />
      <Toaster richColors theme="dark" />
    </AuthProvider>
  );
}
