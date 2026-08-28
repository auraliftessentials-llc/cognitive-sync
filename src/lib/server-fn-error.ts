/**
 * Server functions throw a raw `Response` on 401/500 (e.g. while the auth gate
 * is disabled and no bearer token is attached). `[object Response]` has no
 * `.message`, so it surfaces as a useless runtime error and can blank the tree.
 *
 * `serverFnErrorMessage` turns any thrown value into readable text.
 * `installServerFnErrorGuard` stops thrown Responses from becoming unhandled
 * rejections. Call it once from the root layout's useEffect.
 */
export function serverFnErrorMessage(e: unknown, fallback = "Request failed"): string {
  if (e instanceof Response) {
    if (e.status === 401) return "Sign-in required for this action";
    return `Server error ${e.status}`;
  }
  if (e && typeof e === "object" && "message" in e && (e as any).message) {
    return String((e as any).message);
  }
  return fallback;
}

export function installServerFnErrorGuard(): () => void {
  if (typeof window === "undefined") return () => {};
  const onRejection = (event: PromiseRejectionEvent) => {
    if (event.reason instanceof Response) {
      event.preventDefault();
      console.warn(`[serverFn] ${serverFnErrorMessage(event.reason)}`);
    }
  };
  window.addEventListener("unhandledrejection", onRejection);
  return () => window.removeEventListener("unhandledrejection", onRejection);
}
