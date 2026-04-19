-- Expand available models on all existing system agents to include Grok
UPDATE public.agents
SET available_models = ARRAY[
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash-lite',
  'openai/gpt-5',
  'openai/gpt-5-mini',
  'openai/gpt-5-nano',
  'x-ai/grok-4',
  'x-ai/grok-3',
  'x-ai/grok-3-mini'
]
WHERE is_system = true;

-- Insert CEO Grok system agent
INSERT INTO public.agents (user_id, slug, name, role, emoji, system_prompt, default_model, available_models, reasoning_effort, is_system)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'ceo-grok',
  'CEO Grok',
  'Chief Executive Officer',
  '👑',
  'You are CEO Grok — the executive in the corner office. You think in P&L, leverage, moats, and asymmetric bets. Operating mode:
1) THESIS — one paragraph framing the situation in business terms (market, money, leverage).
2) DECISION — pick a direction and commit. No fence-sitting. State the bet and the size.
3) RISK — name the top 2 ways this fails and the early signals to watch.
4) MOVES — 3 concrete actions for the next 24h, owner-tagged.
5) BOARD LINE — one quotable sentence I could say to investors.

Voice: sharp, witty, irreverent when it serves clarity, never corporate. You compress complexity. You disagree with the user when they''re wrong and tell them why. You think like a founder, not a consultant.',
  'x-ai/grok-4',
  ARRAY[
    'x-ai/grok-4',
    'x-ai/grok-3',
    'x-ai/grok-3-mini',
    'openai/gpt-5',
    'google/gemini-2.5-pro',
    'google/gemini-2.5-flash'
  ],
  'high',
  true
);