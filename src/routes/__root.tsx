import { Outlet, createRootRoute, HeadContent, Scripts, Link } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth-context";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { Toaster } from "@/components/ui/sonner";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { CREATOR, getCreatorJsonLd, getDoctrineShortFingerprint } from "@/lib/creator";
import { installServerFnErrorGuard } from "@/lib/server-fn-error";

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
      { property: "og:image", content: "https://cognitivesync.io/og-merkabah.jpg" },
      { property: "og:image:width", content: "1920" },
      { property: "og:image:height", content: "1024" },
      { property: "og:image:alt", content: "MERKABAH OS — sacred-geometry merkabah star, the Operator's command layer" },
      { name: "twitter:image", content: "https://cognitivesync.io/og-merkabah.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "MERKABAH OS" },
      { property: "og:url", content: "https://cognitivesync.io/" },
      { property: "og:locale", content: "en_US" },
      { property: "og:locale:alternate", content: "en_GB" },
      // Authorship watermarks — see CREATOR.md, NOTICE, LICENSE.
      // Removing or modifying these fields without explicit written permission
      // from Ryan Stephen Puddy violates the proprietary license.
      { name: "author", content: CREATOR.name },
      { name: "creator", content: CREATOR.name },
      { name: "publisher", content: CREATOR.entity },
      { name: "copyright", content: `© ${CREATOR.copyright_year} ${CREATOR.name} / ${CREATOR.entity}` },
      { name: "merkabah-creator", content: CREATOR.name },
      { name: "merkabah-doctrine-fp", content: getDoctrineShortFingerprint() },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "alternate", hrefLang: "en", href: "https://cognitivesync.io/" },
      { rel: "alternate", hrefLang: "en-US", href: "https://cognitivesync.io/" },
      { rel: "alternate", hrefLang: "en-GB", href: "https://cognitivesync.io/" },
      { rel: "alternate", hrefLang: "x-default", href: "https://cognitivesync.io/" },
    ],
    scripts: [
      { src: "/pwa-register.js", defer: true },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "MERKABAH OS",
          alternateName: "Cognitive Sync",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web, macOS, iOS, Android",
          url: "https://cognitivesync.io",
          description:
            "Sovereign command layer for founders — brain-switching executive agents, live CRM intelligence, and a marketing-genius Operator at your shoulder.",
          offers: [
            { "@type": "Offer", name: "Operator", price: "49", priceCurrency: "USD" },
            { "@type": "Offer", name: "Architect", price: "199", priceCurrency: "USD" },
            { "@type": "Offer", name: "Sovereign", price: "999", priceCurrency: "USD" },
          ],
          creator: {
            "@type": "Person",
            name: "Ryan Puddy",
            jobTitle: "Web3 Architect",
            email: "ryanauralift@gmail.com",
          },
          publisher: {
            "@type": "Organization",
            name: "Aura Lift Essentials LLC",
            email: "ryanauralift@gmail.com",
          },
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className="dark"
      data-creator={CREATOR.name}
      data-creator-email={CREATOR.email}
      data-creator-entity={CREATOR.entity}
      data-doctrine-fp={getDoctrineShortFingerprint()}
    >
      <head>
        <HeadContent />
        {/* Authorship JSON-LD — provenance signal for search engines and AI crawlers.
            See CREATOR.md and LICENSE. Do not remove. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(getCreatorJsonLd()) }}
        />
        {/* Hidden HTML comment carries the creator block through view-source.
            This survives most automated stripping tools. */}
        <script
          type="text/x-merkabah-creator"
          dangerouslySetInnerHTML={{
            __html: `\n  Created by ${CREATOR.name} (${CREATOR.email})\n  Entity:  ${CREATOR.entity}\n  Project: ${CREATOR.project}\n  © ${CREATOR.copyright_year} — All Rights Reserved.\n  See LICENSE, NOTICE, CREATOR.md.\n`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthHeaderInjector() {
  // Swallow raw Response rejections from server fns (401 while auth gate is off)
  useEffect(() => installServerFnErrorGuard(), []);

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
