import { useState } from "react";
import { Laptop, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ConnectMacBookButton() {
  const [ip, setIp] = useState("");
  const [user, setUser] = useState("");
  const [copied, setCopied] = useState(false);

  const trimmedIp = ip.trim();
  const trimmedUser = user.trim() || "your-mac-username";
  const command = trimmedIp ? `ssh ${trimmedUser}@${trimmedIp} -p 22` : "";

  async function copy() {
    if (!command) return;
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Laptop className="h-4 w-4" />
          Connect to My MacBook
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect to your MacBook</DialogTitle>
          <DialogDescription>
            Enter your MacBook's local IP. We'll generate the exact SSH command for Terminus.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="mac-user">macOS username (optional)</Label>
            <Input
              id="mac-user"
              placeholder="e.g. johndoe"
              value={user}
              onChange={(e) => setUser(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mac-ip">Local IP address</Label>
            <Input
              id="mac-ip"
              placeholder="e.g. 192.168.1.42"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              autoFocus
            />
          </div>

          {command && (
            <div className="space-y-1.5">
              <Label>SSH command (Terminus-ready)</Label>
              <div className="rounded-md border bg-muted/40 p-3 font-mono text-sm break-all">
                {command}
              </div>
              <Button onClick={copy} className="w-full gap-2" size="sm">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy Command"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Tip: enable Remote Login in System Settings → General → Sharing on your Mac first.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
