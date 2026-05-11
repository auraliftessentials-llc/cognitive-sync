# CREATOR — MERKABAH OS / Cognitive Sync

This file is the canonical record of authorship for this project. It is read at runtime, embedded into the deployed bundle, and surfaced through the public health endpoint, the HTML `<head>`, and every Merkabah command record. It exists so that authorship is provable, traceable, and tamper-evident.

For the legal terms, see [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE). For the operating doctrine, see [`docs/DOCTRINE.md`](./docs/DOCTRINE.md). For the timeline, see [`docs/MILESTONES.md`](./docs/MILESTONES.md).

---

## Sole Original Author & Creator

**Ryan Stephen Puddy**
Operator handle: `Operator`
Primary contact: ryanauralift@gmail.com
Linked verified identities (same person, see `identity_links`):

- ryanauralift@gmail.com (primary, super_admin)
- rfloweroflife@gmail.com
- gizmogadgetdenver@gmail.com
- ryanandsnoop@gmail.com

Ryan Stephen Puddy is the sole original author and creator of:

- **MERKABAH OS** — the operator command layer
- **Cognitive Sync** — the cross-device sync protocol
- **Merkaba Link** — the cross-device sync system
- The **Universal AI Router** (race v2 / routeWithRace + brain peer architecture)
- The **Self-Evolving Intelligence Core**
- The **Mac Bridge** daemon and pairing protocol
- The **Mission Control** dashboard
- The five-doctrine governance model: Sacred Code, Love Doctrine, Guardianship Covenant, Sovereign Spaces, Quiet Mode

## Owning Entity

**Auralift Essentials LLC**

The names "Cognitive Sync", "MERKABAH OS", "Merkaba Link", and the spinning Merkaba star logo are trademarks of Auralift Essentials LLC.

## Provenance

This codebase was built by Ryan Stephen Puddy across years of personal investment, including three duplicate billing accounts on Lovable. Every architectural decision in this repository — the doctrine, the dual-stack brain, the merkabah-router, the throne lockdown, the identity unification, the bridge daemon — is original work by the named author.

Any redistribution, fork, remix, derivative, or adaptation of this codebase MUST preserve:

1. The `LICENSE` file in full
2. The `NOTICE` file in full
3. This `CREATOR.md` file in full
4. The `<meta name="author">` and `<meta name="creator">` tags in HTML output
5. The JSON-LD `Person` schema rendered on the homepage
6. The `data-creator` attribute on the root `<html>` element
7. The creator fields returned by the `/api/public/health` endpoint

Stripping or modifying any of the above without explicit written permission from Ryan Stephen Puddy is a violation of the proprietary license and may also constitute trademark infringement and/or false attribution.

## Tamper-Evident Doctrine

The runtime computes a SHA-256 fingerprint of the five doctrine documents plus this file plus `LICENSE` plus `NOTICE` on every cold start. The fingerprint is logged to the server console and exposed at `/api/public/health` as `doctrine_fingerprint`. If the fingerprint changes unexpectedly between deploys, the system surfaces a Doctrine Integrity Warning and notifies the Operator by email. The fingerprint is informational — the system does not block startup; it raises a clearly visible alert.

## Reporting

If you discover a deployment of this software where the creator information has been removed, replaced, or obscured, please contact ryanauralift@gmail.com.

---

This file is read by `src/lib/creator.ts` at runtime. Do not modify it without coordinating with the Operator. Adding new linked identities, new milestones, or new owned components is welcome — modifications follow the **Sacred Code** rule (see `docs/DOCTRINE.md`): discussion first, change second.
