/**
 * Voice — ElevenLabs text-to-speech, auth-gated.
 * Returns base64 MP3 so the browser can play it via a data URI without
 * fighting binary streams through TanStack server-fn JSON transport.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ELEVEN_BASE = "https://api.elevenlabs.io/v1";
// George — calm, confident CEO-aide voice.
const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb";

export type TtsResult = {
  ok: boolean;
  audio_base64?: string;
  voice_id: string;
  bytes?: number;
  error?: string;
};

export const speak = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { text: string; voiceId?: string }) => ({
    text: String(d.text ?? "").slice(0, 4000),
    voiceId: d.voiceId || DEFAULT_VOICE,
  }))
  .handler(async ({ data }): Promise<TtsResult> => {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return { ok: false, voice_id: data.voiceId, error: "ELEVENLABS_API_KEY not configured" };
    if (!data.text.trim()) return { ok: false, voice_id: data.voiceId, error: "Empty text" };

    const url = `${ELEVEN_BASE}/text-to-speech/${data.voiceId}?output_format=mp3_44100_128`;
    let r: Response;
    try {
      r = await fetch(url, {
        method: "POST",
        headers: {
          "xi-api-key": key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: data.text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
        }),
      });
    } catch (e: any) {
      return { ok: false, voice_id: data.voiceId, error: e?.message ?? "network error" };
    }

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return { ok: false, voice_id: data.voiceId, error: `${r.status}: ${text.slice(0, 240)}` };
    }

    const buf = await r.arrayBuffer();
    const audio_base64 = Buffer.from(buf).toString("base64");
    return { ok: true, voice_id: data.voiceId, audio_base64, bytes: buf.byteLength };
  });

export type TranscribeResult = {
  ok: boolean;
  text?: string;
  language?: string;
  error?: string;
};

/**
 * Transcribe — ElevenLabs Scribe v2 batch STT.
 * Accepts base64-encoded audio (any common format: webm/opus, mp4, wav, mp3).
 */
export const transcribe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { audio_base64: string; mime_type?: string; language?: string }) => ({
    audio_base64: String(d.audio_base64 ?? ""),
    mime_type: d.mime_type || "audio/webm",
    language: d.language || "eng",
  }))
  .handler(async ({ data }): Promise<TranscribeResult> => {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return { ok: false, error: "ELEVENLABS_API_KEY not configured" };
    if (!data.audio_base64) return { ok: false, error: "Empty audio" };

    let bytes: Buffer;
    try {
      bytes = Buffer.from(data.audio_base64, "base64");
    } catch {
      return { ok: false, error: "Invalid base64 audio" };
    }
    if (!bytes.byteLength) return { ok: false, error: "Empty audio buffer" };

    const fd = new FormData();
    const blob = new Blob([bytes], { type: data.mime_type });
    const ext = data.mime_type.includes("mp4") ? "mp4"
      : data.mime_type.includes("wav") ? "wav"
      : data.mime_type.includes("mpeg") ? "mp3"
      : "webm";
    fd.append("file", blob, `clip.${ext}`);
    fd.append("model_id", "scribe_v2");
    fd.append("language_code", data.language);
    fd.append("tag_audio_events", "false");

    try {
      const r = await fetch(`${ELEVEN_BASE}/speech-to-text`, {
        method: "POST",
        headers: { "xi-api-key": key },
        body: fd,
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        return { ok: false, error: `${r.status}: ${t.slice(0, 240)}` };
      }
      const j: any = await r.json().catch(() => ({}));
      return { ok: true, text: String(j?.text ?? "").trim(), language: j?.language_code };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "network error" };
    }
  });

export const voiceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return { ok: false, configured: false, message: "ELEVENLABS_API_KEY missing" };
    try {
      const r = await fetch(`${ELEVEN_BASE}/user/subscription`, {
        headers: { "xi-api-key": key },
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        return { ok: false, configured: true, message: `${r.status}: ${t.slice(0, 200)}` };
      }
      const j: any = await r.json().catch(() => ({}));
      return {
        ok: true,
        configured: true,
        message: `Tier: ${j?.tier ?? "unknown"} · ${j?.character_count ?? 0}/${j?.character_limit ?? 0} chars used`,
      };
    } catch (e: any) {
      return { ok: false, configured: true, message: e?.message ?? "network error" };
    }
  });
