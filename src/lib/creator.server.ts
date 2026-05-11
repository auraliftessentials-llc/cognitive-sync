/**
 * Server-side creator helpers — startup banner + integrity check.
 *
 * Imported by the public health route and (lazily) by merkabah-command
 * to stamp the doctrine fingerprint into command metadata.
 *
 * No autonomous action is taken here. If the fingerprint differs from a
 * previously-recorded value, we LOG and (optionally) email the Operator —
 * we never block startup or refuse to serve. The Sacred Code rule applies:
 * surface, don't act.
 */
import { CREATOR, getDoctrineFingerprint, getDoctrineShortFingerprint } from "@/lib/creator";

let _bannerLogged = false;

export async function logCreatorBanner(): Promise<void> {
  if (_bannerLogged) return;
  _bannerLogged = true;
  try {
    const fp = await getDoctrineFingerprint();
    // eslint-disable-next-line no-console
    console.log(
      `[MERKABAH OS] Created by ${CREATOR.name} (${CREATOR.email}) — entity: ${CREATOR.entity} — doctrine fingerprint: ${fp}`,
    );
  } catch {
    // Last-resort: short fp so we never silently skip the banner.
    // eslint-disable-next-line no-console
    console.log(
      `[MERKABAH OS] Created by ${CREATOR.name} — short fingerprint: ${getDoctrineShortFingerprint()}`,
    );
  }
}

/**
 * Returns the creator/integrity payload exposed via /api/public/health.
 * Safe to expose publicly — contains only authorship metadata, no secrets.
 */
export async function getPublicCreatorPayload() {
  const fingerprint = await getDoctrineFingerprint().catch(
    () => `nofips_${getDoctrineShortFingerprint()}`,
  );
  return {
    creator: CREATOR.name,
    handle: CREATOR.handle,
    entity: CREATOR.entity,
    project: CREATOR.project,
    url: CREATOR.url,
    copyright: `© ${CREATOR.copyright_year} ${CREATOR.name} / ${CREATOR.entity} — All Rights Reserved.`,
    trademarks: [...CREATOR.trademarks],
    doctrine_version: CREATOR.doctrine_version,
    doctrines: [...CREATOR.doctrines],
    doctrine_fingerprint: fingerprint,
    notice:
      "This creator block must be preserved in any redistribution, fork, or remix. See LICENSE and NOTICE.",
  };
}
