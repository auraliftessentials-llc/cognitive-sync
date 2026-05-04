/**
 * /settings/cloudflare — Sovereign infra cockpit.
 * Lists zones, manages DNS, purges cache, lists Workers.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Trash2, RefreshCw, Plus, Zap, ShieldCheck, Globe2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  cfVerify, cfListZones, cfListDns, cfUpsertDns, cfDeleteDns, cfPurgeCache, cfListWorkers,
} from "@/lib/cloudflare.functions";
import { RequireAuth } from "@/components/RequireAuth";

export const Route = createFileRoute("/settings/cloudflare")({
  component: () => (
    <RequireAuth>
      <CloudflareSettings />
    </RequireAuth>
  ),
});

type Zone = { id: string; name: string; status: string };
type DnsRecord = { id: string; type: string; name: string; content: string; proxied: boolean };
type Worker = { id: string; created_on: string; modified_on: string };

function CloudflareSettings() {
  const verifyFn = useServerFn(cfVerify);
  const zonesFn = useServerFn(cfListZones);
  const dnsFn = useServerFn(cfListDns);
  const upsertFn = useServerFn(cfUpsertDns);
  const deleteFn = useServerFn(cfDeleteDns);
  const purgeFn = useServerFn(cfPurgeCache);
  const workersFn = useServerFn(cfListWorkers);

  const [tokenOk, setTokenOk] = useState<boolean | null>(null);
  const [tokenMsg, setTokenMsg] = useState<string>("");
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneId, setZoneId] = useState<string>("");
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // New record form
  const [newType, setNewType] = useState("A");
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newProxied, setNewProxied] = useState(true);

  const activeZone = useMemo(() => zones.find((z) => z.id === zoneId), [zones, zoneId]);

  useEffect(() => {
    (async () => {
      try {
        const v = await verifyFn();
        setTokenOk(v.ok);
        setTokenMsg(v.ok ? `Token verified · ${(v.result as any)?.id ?? ""}` : v.error ?? "Token invalid");
      } catch (e: any) {
        setTokenOk(false);
        setTokenMsg(e?.message ?? "Cloudflare unreachable");
      }
    })();
  }, [verifyFn]);

  const loadZones = async () => {
    setLoading(true);
    try {
      const [z, w] = await Promise.all([zonesFn(), workersFn().catch(() => ({ workers: [] }))]);
      setZones(z.zones);
      setWorkers((w as any).workers ?? []);
      if (z.zones.length && !zoneId) setZoneId(z.zones[0].id);
    } catch (e: any) {
      toast.error(`Cloudflare: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tokenOk) void loadZones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenOk]);

  const loadDns = async (id: string) => {
    setLoading(true);
    try {
      const r = await dnsFn({ data: { zoneId: id } });
      setRecords(r.records);
    } catch (e: any) {
      toast.error(`DNS: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (zoneId) void loadDns(zoneId); /* eslint-disable-next-line */ }, [zoneId]);

  const handleCreate = async () => {
    if (!zoneId || !newName || !newContent) return;
    setBusy(true);
    try {
      await upsertFn({ data: { zoneId, type: newType, name: newName, content: newContent, proxied: newProxied } });
      toast.success(`Created ${newType} ${newName}`);
      setNewName(""); setNewContent("");
      await loadDns(zoneId);
    } catch (e: any) {
      toast.error(e?.message ?? "Create failed");
    } finally { setBusy(false); }
  };

  const handleDelete = async (recordId: string) => {
    if (!zoneId) return;
    if (!confirm("Delete this DNS record?")) return;
    setBusy(true);
    try {
      await deleteFn({ data: { zoneId, recordId } });
      toast.success("Record deleted");
      await loadDns(zoneId);
    } catch (e: any) { toast.error(e?.message ?? "Delete failed"); }
    finally { setBusy(false); }
  };

  const handlePurge = async (everything: boolean) => {
    if (!zoneId) return;
    if (everything && !confirm(`Purge ENTIRE cache for ${activeZone?.name}?`)) return;
    setBusy(true);
    try {
      await purgeFn({ data: { zoneId } });
      toast.success("Cache purged");
    } catch (e: any) { toast.error(e?.message ?? "Purge failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-10 space-y-6">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-wide uppercase flex items-center gap-3">
              <Globe2 className="h-7 w-7 text-primary" />
              Cloudflare Cockpit
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Direct control over zones, DNS, cache, and Workers via your <code>CLOUDFLARE_API_TOKEN</code>.
            </p>
          </div>
          <Badge variant={tokenOk ? "default" : "destructive"} className="gap-1">
            <ShieldCheck className="h-3 w-3" />
            {tokenOk == null ? "Checking…" : tokenOk ? "Token OK" : "Token Bad"}
          </Badge>
        </header>

        {tokenMsg && (
          <Card className="border-muted">
            <CardContent className="py-3 text-xs text-muted-foreground font-mono">{tokenMsg}</CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-lg">Zones ({zones.length})</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={zoneId} onValueChange={setZoneId}>
                <SelectTrigger className="w-[260px]"><SelectValue placeholder="Pick a zone" /></SelectTrigger>
                <SelectContent>
                  {zones.map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.name} <span className="text-muted-foreground ml-2">· {z.status}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={loadZones} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
        </Card>

        {zoneId && (
          <>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-lg">DNS Records · {activeZone?.name}</CardTitle>
                <Button variant="destructive" size="sm" onClick={() => handlePurge(true)} disabled={busy}>
                  <Zap className="h-4 w-4 mr-1" /> Purge entire cache
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end p-3 rounded-md border bg-muted/30">
                  <div>
                    <Label className="text-xs">Type</Label>
                    <Select value={newType} onValueChange={setNewType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["A","AAAA","CNAME","TXT","MX","NS","SRV","CAA"].map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Name</Label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="sub.example.com or @" />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Content</Label>
                    <Input value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="1.2.3.4 / target.example.com" />
                  </div>
                  <div className="flex items-center gap-2 pb-2">
                    <Switch checked={newProxied} onCheckedChange={setNewProxied} id="proxied" />
                    <Label htmlFor="proxied" className="text-xs">Proxied</Label>
                  </div>
                  <div className="md:col-span-6 flex justify-end">
                    <Button onClick={handleCreate} disabled={busy || !newName || !newContent} size="sm">
                      <Plus className="h-4 w-4 mr-1" /> Create record
                    </Button>
                  </div>
                </div>

                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Content</TableHead>
                        <TableHead>Proxied</TableHead>
                        <TableHead className="w-[60px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell><Badge variant="outline">{r.type}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{r.name}</TableCell>
                          <TableCell className="font-mono text-xs truncate max-w-[300px]">{r.content}</TableCell>
                          <TableCell>{r.proxied ? "✓" : "—"}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)} disabled={busy}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!records.length && (
                        <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No records.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">Workers ({workers.length})</CardTitle></CardHeader>
              <CardContent>
                {workers.length ? (
                  <ul className="space-y-1 text-sm font-mono">
                    {workers.map((w) => (
                      <li key={w.id} className="flex justify-between border-b py-1">
                        <span>{w.id}</span>
                        <span className="text-xs text-muted-foreground">modified {new Date(w.modified_on).toLocaleDateString()}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No Workers deployed on this account.</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
