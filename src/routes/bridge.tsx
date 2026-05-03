import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Copy, Download, RefreshCw, Trash2, Plus, Wifi, WifiOff, Apple, Terminal as TerminalIcon } from "lucide-react";
import {
  listBridgeDevices,
  startBridgePairing,
  revokeBridgeDevice,
  listBridgeAudit,
} from "@/lib/bridge.functions";

export const Route = createFileRoute("/bridge")({
  component: BridgePage,
});

function BridgePage() {
  return (
    <RequireAuth>
      <AppShell>
        <BridgeConsole />
      </AppShell>
    </RequireAuth>
  );
}

type Device = {
  id: string;
  name: string;
  platform: string;
  hostname: string | null;
  api_key_prefix: string | null;
  pairing_code: string | null;
  pairing_expires_at: string | null;
  paired_at: string | null;
  allowed_roots: string[];
  capabilities: string[];
  last_seen_at: string | null;
  revoked_at: string | null;
};

function BridgeConsole() {
  const list = useServerFn(listBridgeDevices);
  const start = useServerFn(startBridgePairing);
  const revoke = useServerFn(revokeBridgeDevice);
  const audit = useServerFn(listBridgeAudit);

  const [devices, setDevices] = useState<Device[]>([]);
  const [audits, setAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pairing, setPairing] = useState<{ code: string; expires_at: string } | null>(null);
  const [name, setName] = useState("MacBook");
  const [host, setHost] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") setHost(window.location.origin);
  }, []);

  const refresh = async () => {
    try {
      const [d, a] = await Promise.all([list(), audit({ data: { limit: 30 } })]);
      setDevices((d as any).devices);
      setAudits((a as any).audit);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load devices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, []);

  const handlePair = async () => {
    try {
      const res: any = await start({ data: { name } });
      setPairing({ code: res.pairing_code, expires_at: res.device.pairing_expires_at });
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to start pairing");
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this device? It will no longer be able to connect.")) return;
    try {
      await revoke({ data: { id } });
      toast.success("Device revoked");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const copy = (text: string, label = "Copied") => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  const daemonUrl = `${host}/api/public/bridge-daemon`;
  const oneLineInstall = pairing
    ? `curl -sSL "${host}/api/public/bridge-install?code=${pairing.code}" | bash`
    : `curl -sSL "${host}/api/public/bridge-install" | bash`;
  const installCmd = `curl -sSL ${daemonUrl} -o merkabah-bridge.mjs`;
  const pairCmd = pairing ? `node merkabah-bridge.mjs pair ${pairing.code}` : "";
  const qrPayload = pairing ? JSON.stringify({ host, code: pairing.code }) : "";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Sovereign Bridge</div>
          <h1 className="font-display text-3xl tracking-wide merkabah-text mt-1">DEVICE BRIDGE</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Pair your MacBook (or any Node-capable device) to give Merkabah OS sandboxed filesystem and shell access.
            Each device gets its own key; sandboxing is enforced by the local daemon.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </header>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* PAIRING PANEL */}
        <Card className="glow-border">
          <CardHeader className="pb-3">
            <CardTitle className="font-display tracking-wide text-base flex items-center gap-2">
              <Apple className="h-4 w-4 text-primary" /> Pair a New Device
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!pairing ? (
              <>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">Device name</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="MacBook Pro" />
                </div>
                <Button onClick={handlePair} className="w-full">
                  <Plus className="h-4 w-4 mr-2" /> Generate Pairing Code
                </Button>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside pt-2 border-t border-border/50">
                  <li>Click <em>Generate</em> — you'll get an 8-char code (10-min TTL).</li>
                  <li>On your Mac, run the install command shown.</li>
                  <li>Run <code className="text-primary">node merkabah-bridge.mjs pair &lt;CODE&gt;</code>.</li>
                  <li>Then <code className="text-primary">node merkabah-bridge.mjs serve</code>.</li>
                </ol>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col items-center bg-background rounded-lg p-4 border border-primary/30">
                  <div className="bg-white p-3 rounded">
                    <QRCodeSVG value={qrPayload} size={160} />
                  </div>
                  <div className="font-mono text-3xl tracking-[0.4em] mt-4 text-primary glow-text">{pairing.code}</div>
                  <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">
                    Expires {new Date(pairing.expires_at).toLocaleTimeString()}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    One-paste install (pair + auto-launch on login)
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-muted/40 rounded px-2 py-1.5 font-mono truncate" title={oneLineInstall}>
                      {oneLineInstall}
                    </code>
                    <Button size="icon" variant="outline" onClick={() => copy(oneLineInstall, "Install command copied")}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Paste in Terminal. Installs the daemon, pairs this device, and registers a LaunchAgent
                    (macOS) or systemd unit (Linux) so it auto-starts at login and self-restarts on crash.
                    Requires Node 18+.
                  </p>
                </div>

                <details className="text-xs border-t border-border/40 pt-3">
                  <summary className="cursor-pointer text-muted-foreground hover:text-primary uppercase tracking-wider text-[10px]">
                    Manual install (advanced)
                  </summary>
                  <div className="space-y-2 mt-3">
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-muted/40 rounded px-2 py-1.5 font-mono truncate">{installCmd}</code>
                      <Button size="icon" variant="outline" onClick={() => copy(installCmd)}><Copy className="h-3.5 w-3.5" /></Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-muted/40 rounded px-2 py-1.5 font-mono truncate">{pairCmd}</code>
                      <Button size="icon" variant="outline" onClick={() => copy(pairCmd)}><Copy className="h-3.5 w-3.5" /></Button>
                    </div>
                    <code className="block bg-muted/40 rounded px-2 py-1.5 font-mono">node merkabah-bridge.mjs serve</code>
                  </div>
                </details>

                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setPairing(null)} className="flex-1">
                    Done
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => window.open(daemonUrl, "_blank")}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Direct download
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* DEVICES PANEL */}
        <Card className="glow-border">
          <CardHeader className="pb-3">
            <CardTitle className="font-display tracking-wide text-base flex items-center gap-2">
              <TerminalIcon className="h-4 w-4 text-primary" /> Paired Devices ({devices.filter((d) => d.paired_at && !d.revoked_at).length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : devices.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No devices yet. Pair one above.</div>
            ) : (
              devices.map((d) => {
                const online = d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < 60_000;
                const status = d.revoked_at
                  ? "revoked"
                  : !d.paired_at
                  ? "pending"
                  : online
                  ? "online"
                  : "offline";
                return (
                  <div key={d.id} className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/10 px-3 py-2">
                    {status === "online" ? (
                      <Wifi className="h-4 w-4 text-primary" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{d.name}</span>
                        <Badge variant={status === "online" ? "default" : status === "revoked" ? "destructive" : "outline"} className="text-[9px] uppercase">
                          {status}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {d.hostname ?? "—"} · {d.api_key_prefix ?? "unpaired"}
                        {d.last_seen_at && ` · seen ${timeAgo(d.last_seen_at)}`}
                      </div>
                    </div>
                    {!d.revoked_at && (
                      <Button size="icon" variant="ghost" onClick={() => handleRevoke(d.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* AUDIT */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display tracking-wide text-base">Live Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {audits.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">No bridge activity yet.</div>
          ) : (
            <div className="space-y-1 max-h-[300px] overflow-auto">
              {audits.map((a) => (
                <div key={a.id} className="flex items-center gap-3 text-xs font-mono py-1 border-b border-border/30 last:border-0">
                  <span className="text-muted-foreground w-20 shrink-0">{new Date(a.created_at).toLocaleTimeString()}</span>
                  <span className={`w-2 h-2 rounded-full ${a.ok ? "bg-primary" : "bg-destructive"}`} />
                  <span className="text-primary w-24 shrink-0">{a.action}</span>
                  <span className="truncate flex-1">{a.target ?? "—"}</span>
                  {a.bytes != null && <span className="text-muted-foreground">{formatBytes(a.bytes)}</span>}
                  {a.duration_ms != null && <span className="text-muted-foreground">{a.duration_ms}ms</span>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-center text-[10px] text-muted-foreground tracking-wider uppercase pt-4">
        <Link to="/dashboard" className="hover:text-primary">← Back to Pulse</Link>
      </div>
    </div>
  );
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}
function formatBytes(n: number) {
  if (n < 1024) return n + "B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + "KB";
  return (n / 1024 / 1024).toFixed(1) + "MB";
}
