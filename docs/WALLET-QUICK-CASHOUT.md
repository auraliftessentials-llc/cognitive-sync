# Wallet Quick-Cashout — Hybrid A+B+C Guide

**Purpose:** Find the easiest wallet to access first, then run ONE small test cashout end-to-end to prove the pipe works. Once one works, the rest follow the same pattern.

**Hard rules (Sacred Code + Guardianship):**
- Never type a seed phrase into a website. Ever.
- Never share screen while a wallet is unlocked.
- Test with a small amount first ($20–$50). Never the full balance.
- Keep a paper notebook open. Write date, wallet, amount, txid, fee.

---

## Part 1 — Easiest-First Ranking (do these in order)

Rank = "fastest to log in + fastest to get fiat in your bank."

### Tier S — "Already linked to your bank, cashout in minutes"
1. **Cash App** — open app, Bitcoin tab, Sell → bank. Instant if you have Cash App Card.
2. **PayPal / Venmo crypto** — Crypto tab → Sell → goes to PayPal balance → transfer to bank (1–3 days, or instant for ~1.5% fee).
3. **Robinhood Crypto** — Sell → withdraw to linked bank (ACH 1–3 days).

### Tier A — "Custodial exchange, KYC already done years ago"
4. **Coinbase** — coinbase.com → log in → Portfolio → asset → Sell → cash out to bank/PayPal.
5. **Kraken** — kraken.com → Funding → Withdraw → fiat to bank (SWIFT/SEPA/ACH).
6. **Gemini** — similar flow, ACH usually free.
7. **Crypto.com** — app → Sell → fiat wallet → withdraw.
8. **Binance / Binance.US** — only if you can pass current 2FA. Often the slowest to recover.

### Tier B — "Self-custody software wallet → needs a bridge to fiat"
9. **MetaMask / Phantom / Coinbase Wallet** — these hold crypto but DON'T cash out directly. You either:
   - Send to a Tier S/A account above, then sell there, OR
   - Use the in-wallet "Sell" button (MoonPay/Ramp) — higher fees, faster.

### Tier C — "Hardware wallet, slowest but safest"
10. **Ledger / Trezor** — plug in, open Ledger Live / Trezor Suite, send to a Tier A exchange, sell there.

---

## Part 2 — The ONE Test Cashout (recommended path)

**Goal:** Move $20–$50 of crypto from wherever it sits → into your bank account. Prove the full pipe works once. Then scale.

**Recommended test wallet:** whichever Tier S or Tier A account you can log into RIGHT NOW with 2FA working. Coinbase is the most common "yes I can log in" answer.

### Step-by-step (Coinbase example, but the shape is identical everywhere)

**Step 1 — Confirm access (5 min)**
- Go to coinbase.com on a clean browser (not a sketchy link, not an email link — type it).
- Log in. Pass 2FA.
- Confirm the dashboard shows a balance > $0.
- Confirm a bank account is already linked under Settings → Payment Methods. If not, link one (ACH, takes a few minutes via Plaid).
- Write in notebook: `2026-05-12 — Coinbase login OK — bank linked: [last 4 of acct]`.

**Step 2 — Sell a small slice (3 min)**
- Pick the asset with the largest balance (lowest % impact for a $20 test).
- Click Sell.
- Enter $20 (or smallest the platform allows, often $1–$2).
- Sell to USD (cash balance). Confirm.
- Write: `Sold $20 of [BTC/ETH/etc] — fee: $X.XX — txid: [Coinbase order ID]`.

**Step 3 — Cash out to bank (2 min + waiting)**
- Cash balance → Cash Out → choose bank → $20 → confirm.
- Method: ACH (free, 1–3 business days) is fine for a test. Instant deposit costs ~1.5%.
- Write: `Withdraw $20 to bank — ETA: [date] — confirmation: [ID]`.

**Step 4 — Verify landing (1–3 days later)**
- Check bank app for the deposit. Match the date and amount.
- Write: `2026-05-15 — $20.00 received — pipe confirmed ✅`.

**You're done.** The pipe works. Every other wallet now follows the same shape: log in → sell to fiat → withdraw to bank.

---

## Part 3 — Test Cashout from a Self-Custody Wallet (when ready)

After the Tier A test works, repeat with a self-custody wallet (MetaMask example):

1. Open MetaMask. Confirm address. Note balance.
2. On Coinbase: Receive → pick the same chain (Ethereum / Base / Polygon — **must match**). Copy deposit address.
3. In MetaMask: Send → paste address → **send a $5–$10 test first**. Confirm gas fee. Send.
4. Wait for confirmations (Ethereum ~1 min, Bitcoin ~10 min). Verify it arrived in Coinbase.
5. Now sell on Coinbase → withdraw to bank (Part 2, Steps 2–4).

**Why send a test first:** if you typed the address wrong or picked the wrong chain, $5 lost beats $5,000 lost.

---

## Part 4 — The 3 Rules That Stop 90% of Disasters

1. **Chain must match.** Sending USDC on Ethereum to a Solana address = gone forever. Every exchange shows the chain next to the deposit address — read it twice.
2. **Address first 4 + last 4 characters.** Verify them out loud against the source before hitting send. Copy-paste malware swaps clipboard addresses.
3. **2FA on a separate device.** Phone authenticator app (Authy / Google Authenticator), not SMS. If you lose 2FA, recovery takes 1–4 weeks per exchange.

---

## Part 5 — When Something Goes Wrong

- **Can't log in:** Use the exchange's account recovery flow. Have ID ready. Allow 24–72 hours.
- **2FA lost:** Same flow, longer (3–14 days). Don't panic-create new accounts.
- **Withdrawal pending > 3 days:** Open a support ticket with the txid. ACH delays are normal around weekends/holidays.
- **You see an unexpected prompt to "verify wallet" via a link in email:** Close it. Go to the site directly. Phishing spikes whenever you start moving money.

---

## Suggested order for THIS week

1. **Today:** Pick the one Tier S/A account you're 100% sure you can log into. Run Part 2 with $20.
2. **Day 3:** Confirm the $20 landed in your bank.
3. **Day 4:** Repeat with the next account on your list.
4. **Once 2 custodial accounts are confirmed:** then attempt the first self-custody test (Part 3) with $5–$10.
5. **Only after self-custody works:** plan the hardware wallet pull (Tier C) — same shape, just slower.

---

**Remember:** This is a marathon, not a sprint. One confirmed $20 deposit today is worth more than ten "I think I have access to" guesses. Prove the pipe. Then scale.
