import { Outlet, createRootRoute, HeadContent, Scripts, Link } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth-context";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { Toaster } from "@/components/ui/sonner";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
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
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0A0E1A" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Operator" },
      { name: "mobile-web-app-capable", content: "yes" },
      { title: "MERKABAH OS — The Operator's Command Layer" },
      {
        name: "description",
        content:
          "MERKABAH OS — sacred-geometry command center for founders. Brain-switching executive agents, live Zoho CRM intelligence, and a marketing-genius CEO Grok at your shoulder.",
      },
      { property: "og:title", content: "MERKABAH OS — The Operator's Command Layer" },
      { name: "twitter:title", content: "MERKABAH OS — The Operator's Command Layer" },
      { name: "description", content: "Cognitive Sync analyzes your digital library and cloud data to provide intelligent project management and workflow suggestions." },
      { property: "og:description", content: "Cognitive Sync analyzes your digital library and cloud data to provide intelligent project management and workflow suggestions." },
      { name: "twitter:description", content: "Cognitive Sync analyzes your digital library and cloud data to provide intelligent project management and workflow suggestions." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/27c9b844-6c41-4107-a72e-5eb771a31b26/id-preview-520a2bad--9bab356d-3978-4977-aaa2-4d0d6b21f319.lovable.app-1776749378502.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/27c9b844-6c41-4107-a72e-5eb771a31b26/id-preview-520a2bad--9bab356d-3978-4977-aaa2-4d0d6b21f319.lovable.app-1776749378502.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
    scripts: [{ src: "/pwa-register.js", defer: true }],
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
      <WorkspaceProvider>
        <Outlet />
        <PWAInstallPrompt />
        <Toaster richColors theme="dark" />
      </WorkspaceProvider>
    </AuthProvider>
  );
}
