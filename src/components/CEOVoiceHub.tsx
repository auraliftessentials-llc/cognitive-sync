/**
 * CEO Voice Hub — single-button voice command center.
 *
 * Mic → Web Speech API (browser STT, free, instant) → consoleRun(ceo-grok)
 *     → ElevenLabs TTS playback (server-side speak()).
 *
 * Falls back gracefully when speech recognition isn't available
 * (Safari iOS / Firefox); user can still type and hear the reply.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader2, Volume2, VolumeX, Send, Sparkles, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { commandRoute } from "@/lib/command-router.functions";
import { speak, transcribe } from "@/lib/voice.functions";
import { Link } from "@tanstack/react-router";

type QAStep = { label: string; status: "pending" | "ok" | "fail"; detail?: string };

type Phase = "idle" | "listening" | "thinking" | "speaking" | "error";

// Web Speech API — typed loosely; not in lib.dom for non-Chromium.
function getRecognition(): any | null {
  if (typeof window === "undefined") return null;
  const C = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  return C ? new C() : null;
}

const MAGIC_COMMANDS = [
  { label: "Next", text: "Next", desc: "Top moves" },
  { label: "Do it", text: "Do it", desc: "Execute #1" },
  { label: "Status", text: "Status", desc: "Live sitrep" },
  { label: "Brain", text: "Brain", desc: "Autonomous mode" },
];

const QUICK_COMMANDS = [
  { label: "Daily brief", text: "Give me my daily brief: top 3 moves, 1 risk, 1 quick win." },
  { label: "Revenue", text: "Where's the fastest path to revenue this week across my portfolio?" },
];

export function CEOVoiceHub() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState<string>("");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentLabel, setAgentLabel] = useState<string>("CEO Grok");
  const [qaSteps, setQaSteps] = useState<QAStep[] | null>(null);
  const [qaRunning, setQaRunning] = useState(false);

  const recRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sttSupported = typeof window !== "undefined" && !!getRecognition();

  // Stop everything on unmount
  useEffect(() => {
    return () => {
      try { recRef.current?.stop?.(); } catch { /* noop */ }
      try { audioRef.current?.pause(); } catch { /* noop */ }
    };
  }, []);

  const playAudio = useCallback(async (b64: string) => {
    try {
      audioRef.current?.pause();
      const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
      audioRef.current = audio;
      audio.onended = () => setPhase("idle");
      audio.onerror = () => setPhase("idle");
      setPhase("speaking");
      await audio.play();
    } catch (e: any) {
      setPhase("idle");
      toast.error(e?.message ?? "Audio playback blocked — click the page first.");
    }
  }, []);

  const runCommand = useCallback(
    async (text: string) => {
      const prompt = text.trim();
      if (!prompt) return;
      setError(null);
      setReply("");
      setPhase("thinking");
      try {
        // Unified Command Router — classifies intent, picks best brain, falls
        // back across all your keys (xAI → OpenAI → Claude → Gemini → Lovable).
        const res = await commandRoute({ data: { prompt } });
        setAgentLabel(`MERKABAH · ${res.intent}`);
        const out = res.output ?? "";
        setReply(out);
        if (!res.ok) {
          setError(out);
          setPhase("error");
          return;
        }
        if (autoSpeak && out) {
          const spoken = out.length > 700 ? out.slice(0, 700) + "…" : out;
          const tts = await speak({ data: { text: spoken } });
          if (tts.ok && tts.audio_base64) {
            await playAudio(tts.audio_base64);
            return;
          }
          if (!tts.ok) toast.error(`Voice: ${tts.error}`);
        }
        setPhase("idle");
      } catch (e: any) {
        const msg = e?.message ?? "Command failed";
        setError(msg);
        setPhase("error");
        toast.error(msg);
      }
    },
    [autoSpeak, playAudio],
  );

  const startListening = useCallback(() => {
    setError(null);
    const rec = getRecognition();
    if (!rec) {
      toast.error("Voice recognition not supported in this browser. Use Chrome or Edge.");
      return;
    }
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";

    let finalText = "";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setTranscript(finalText + interim);
    };
    rec.onerror = (e: any) => {
      setPhase("idle");
      const m = e?.error === "not-allowed" ? "Microphone permission denied" : `Mic: ${e?.error ?? "error"}`;
      setError(m);
      toast.error(m);
    };
    rec.onend = () => {
      const captured = finalText.trim();
      if (captured) {
        setTranscript(captured);
        runCommand(captured);
      } else if (phase === "listening") {
        setPhase("idle");
      }
    };

    try {
      rec.start();
      recRef.current = rec;
      setPhase("listening");
      setTranscript("");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start mic");
    }
  }, [phase, runCommand]);

  const stopListening = useCallback(() => {
    try { recRef.current?.stop?.(); } catch { /* noop */ }
  }, []);

  const stopAudio = useCallback(() => {
    try { audioRef.current?.pause(); } catch { /* noop */ }
    setPhase("idle");
  }, []);

  const runVoiceQA = useCallback(async () => {
    if (qaRunning) return;
    setQaRunning(true);
    const steps: QAStep[] = [
      { label: "Microphone access", status: "pending" },
      { label: "Record 3s clip", status: "pending" },
      { label: "Transcribe (ElevenLabs Scribe)", status: "pending" },
      { label: "Brain reply (xAI → fallbacks)", status: "pending" },
      { label: "TTS playback (ElevenLabs)", status: "pending" },
    ];
    setQaSteps([...steps]);
    const update = (i: number, s: QAStep) => {
      steps[i] = s;
      setQaSteps([...steps]);
    };

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      update(0, { label: steps[0].label, status: "ok" });
    } catch (e: any) {
      update(0, { label: steps[0].label, status: "fail", detail: e?.message ?? "denied" });
      setQaRunning(false);
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
    let blob: Blob;
    try {
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const done = new Promise<Blob>((resolve) => {
        rec.onstop = () => resolve(new Blob(chunks, { type: mimeType || "audio/webm" }));
      });
      rec.start();
      await new Promise((r) => setTimeout(r, 3000));
      rec.stop();
      blob = await done;
      stream.getTracks().forEach((t) => t.stop());
      update(1, { label: steps[1].label, status: "ok", detail: `${(blob.size / 1024).toFixed(1)} KB` });
    } catch (e: any) {
      update(1, { label: steps[1].label, status: "fail", detail: e?.message });
      stream?.getTracks().forEach((t) => t.stop());
      setQaRunning(false);
      return;
    }

    let text = "";
    try {
      const buf = await blob.arrayBuffer();
      let bin = "";
      const u8 = new Uint8Array(buf);
      for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
      const b64 = btoa(bin);
      const tr = await transcribe({ data: { audio_base64: b64, mime_type: blob.type } });
      if (!tr.ok) throw new Error(tr.error || "transcription failed");
      text = tr.text || "(silence)";
      update(2, { label: steps[2].label, status: "ok", detail: `"${text.slice(0, 80)}"` });
    } catch (e: any) {
      update(2, { label: steps[2].label, status: "fail", detail: e?.message });
      setQaRunning(false);
      return;
    }

    let reply = "";
    try {
      const res = await commandRoute({ data: { prompt: text || "Say hello and confirm voice QA passed." } });
      if (!res.ok) throw new Error(res.output || "brain failed");
      reply = res.output || "OK";
      update(3, { label: steps[3].label, status: "ok", detail: `${res.intent} · ${reply.slice(0, 60)}…` });
    } catch (e: any) {
      update(3, { label: steps[3].label, status: "fail", detail: e?.message });
      setQaRunning(false);
      return;
    }

    try {
      const tts = await speak({ data: { text: reply.length > 400 ? reply.slice(0, 400) + "…" : reply } });
      if (!tts.ok || !tts.audio_base64) throw new Error(tts.error || "tts failed");
      await playAudio(tts.audio_base64);
      update(4, { label: steps[4].label, status: "ok", detail: `${tts.bytes ?? 0} bytes` });
      toast.success("Voice QA passed end-to-end ✓");
    } catch (e: any) {
      update(4, { label: steps[4].label, status: "fail", detail: e?.message });
    } finally {
      setQaRunning(false);
    }
  }, [qaRunning, playAudio]);


  const busy = phase === "thinking" || phase === "speaking";
  const phaseColor =
    phase === "listening" ? "text-brand-cyan" :
    phase === "thinking" ? "text-brand-violet" :
    phase === "speaking" ? "text-brand-green" :
    phase === "error" ? "text-destructive" : "text-muted-foreground";

  return (
    <section className="cathedral-card rounded-xl p-5 mt-6 relative overflow-hidden">
      {/* Ambient glow */}
      <div
        className={`absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl opacity-30 transition-colors ${
          phase === "listening" ? "bg-brand-cyan" :
          phase === "thinking" ? "bg-brand-violet" :
          phase === "speaking" ? "bg-brand-green" :
          "bg-brand-blue"
        }`}
      />

      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-brand-blue" />
            <h2 className="font-display text-lg tracking-wider">CEO VOICE HUB</h2>
            <span className={`text-[10px] uppercase tracking-[0.2em] ${phaseColor}`}>
              · {phase}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAutoSpeak((v) => !v)}
              className="h-7 text-[10px]"
              title="Toggle voice reply"
            >
              {autoSpeak ? <Volume2 className="h-3 w-3 mr-1" /> : <VolumeX className="h-3 w-3 mr-1" />}
              {autoSpeak ? "Voice on" : "Voice off"}
            </Button>
            <Link to="/console" search={{ agent: undefined, cmd: undefined }} className="text-[10px] text-brand-blue hover:underline">
              Full console →
            </Link>
          </div>
        </div>

        {/* Big push-to-talk */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={phase === "listening" ? stopListening : phase === "speaking" ? stopAudio : startListening}
            disabled={phase === "thinking"}
            aria-label={phase === "listening" ? "Stop listening" : "Start voice command"}
            className={`relative h-16 w-16 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
              phase === "listening"
                ? "border-brand-cyan bg-brand-cyan/20 animate-pulse"
                : phase === "thinking"
                  ? "border-brand-violet bg-brand-violet/20 cursor-wait"
                  : phase === "speaking"
                    ? "border-brand-green bg-brand-green/20"
                    : "border-brand-blue/60 bg-brand-blue/10 hover:bg-brand-blue/20 hover:scale-105"
            }`}
          >
            {phase === "thinking" ? (
              <Loader2 className="h-7 w-7 animate-spin text-brand-violet" />
            ) : phase === "speaking" ? (
              <VolumeX className="h-7 w-7 text-brand-green" />
            ) : phase === "listening" ? (
              <MicOff className="h-7 w-7 text-brand-cyan" />
            ) : (
              <Mic className="h-7 w-7 text-brand-blue" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground mb-1">
              {phase === "listening" && "Listening… speak your command."}
              {phase === "thinking" && `${agentLabel} is thinking…`}
              {phase === "speaking" && `${agentLabel} is speaking. Tap to stop.`}
              {phase === "idle" && (sttSupported ? "Tap mic, or type a command below." : "Voice STT unavailable in this browser — type below.")}
              {phase === "error" && (error ?? "Something went wrong.")}
            </div>
            <Textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  runCommand(transcript);
                }
              }}
              placeholder={'Try: "What is my next move?" or "Daily brief"  ·  \u2318\u21B5 to send'}
              rows={2}
              className="font-mono text-sm resize-none bg-background/40"
              disabled={busy}
            />
          </div>

          <Button
            onClick={() => runCommand(transcript)}
            disabled={busy || !transcript.trim()}
            className="bg-brand-blue text-white hover:bg-brand-blue/90 h-16 px-4"
            aria-label="Send command"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>

        {/* Magic commands — sovereign single-word shortcuts */}
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
            ✦ Magic commands
          </div>
          <div className="grid grid-cols-4 gap-2">
            {MAGIC_COMMANDS.map((q) => (
              <button
                key={q.label}
                disabled={busy}
                onClick={() => { setTranscript(q.text); runCommand(q.text); }}
                className="group flex flex-col items-center justify-center px-2 py-2 rounded-lg border border-brand-blue/40 bg-gradient-to-br from-brand-blue/10 to-brand-violet/10 hover:from-brand-blue/20 hover:to-brand-violet/20 hover:border-brand-cyan transition disabled:opacity-50"
                title={q.desc}
              >
                <span className="font-display text-sm tracking-wider text-brand-cyan group-hover:text-white transition">
                  {q.label.toUpperCase()}
                </span>
                <span className="text-[9px] text-muted-foreground mt-0.5">{q.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Quick commands */}
        <div className="flex flex-wrap gap-2 mb-4">
          {QUICK_COMMANDS.map((q) => (
            <button
              key={q.label}
              disabled={busy}
              onClick={() => { setTranscript(q.text); runCommand(q.text); }}
              className="text-[11px] px-2.5 py-1 rounded-full border border-border/60 bg-card/40 hover:border-brand-blue/50 hover:bg-brand-blue/10 transition disabled:opacity-50"
            >
              <Sparkles className="h-2.5 w-2.5 inline mr-1 text-brand-blue" />
              {q.label}
            </button>
          ))}
        </div>

        {/* Reply */}
        {reply && (
          <div className="rounded-lg border border-border/60 bg-card/40 p-3 max-h-64 overflow-auto animate-fade-in-up">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{agentLabel}</div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{reply}</div>
          </div>
        )}
      </div>
    </section>
  );
}
