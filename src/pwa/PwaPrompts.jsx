// The two small app prompts, shown at the bottom of the screen:
//   - "Update available - refresh" once a new service worker is waiting.
//   - "Install the Almanac" where the browser offers it (beforeinstallprompt),
//     or on iPhone/iPad the one-line "Share, then Add to Home Screen" hint.
//     Dismissible; the dismissal is remembered on this device.
//
// Everything browser-specific runs in effects, so the SSG prerender renders
// nothing here. The service worker registration module is imported
// dynamically for the same reason.
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

const DISMISS_KEY = "hva:install-dismissed:v1";

function readDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Blocked or full storage: the prompt just comes back next visit.
  }
}

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIos() {
  const ua = window.navigator.userAgent || "";
  // iPadOS reports itself as a Mac with touch.
  return /iPhone|iPad|iPod/i.test(ua) || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

export default function PwaPrompts() {
  const { pathname } = useLocation();
  const [needRefresh, setNeedRefresh] = useState(false);
  const [install, setInstall] = useState(null); // null | "prompt" | "ios"
  const deferred = useRef(null);
  const updateSW = useRef(null);

  // Service worker: register on load; offer a refresh when an update waits.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    import("virtual:pwa-register")
      .then(({ registerSW }) => {
        if (cancelled) return;
        updateSW.current = registerSW({
          immediate: true,
          onNeedRefresh: () => setNeedRefresh(true),
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Install: only where the browser supports it, unless dismissed or installed.
  useEffect(() => {
    if (isStandalone() || readDismissed()) return;
    if (isIos()) {
      setInstall("ios");
      return;
    }
    const onPrompt = (e) => {
      e.preventDefault();
      deferred.current = e;
      setInstall("prompt");
    };
    const onInstalled = () => {
      deferred.current = null;
      setInstall(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function runInstall() {
    const e = deferred.current;
    if (!e) return;
    deferred.current = null;
    setInstall(null);
    try {
      await e.prompt();
      const choice = await e.userChoice;
      if (choice?.outcome === "dismissed") rememberDismissed();
    } catch {
      // The browser withdrew the prompt; nothing to do.
    }
  }

  function dismissInstall() {
    rememberDismissed();
    setInstall(null);
  }

  if (!needRefresh && !install) return null;
  return (
    <div className={"pwa-prompts" + (pathname === "/map" || pathname === "/map/" ? " pwa-prompts-map" : "")}>
      {needRefresh && (
        <div className="pwa-toast" role="status">
          <span>Update available</span>
          <button type="button" className="pwa-toast-btn" onClick={() => updateSW.current?.(true)}>Refresh</button>
          <button type="button" className="pwa-toast-close" aria-label="Not now" onClick={() => setNeedRefresh(false)}>✕</button>
        </div>
      )}
      {install === "prompt" && (
        <div className="pwa-toast">
          <button type="button" className="pwa-toast-btn" onClick={runInstall}>Install the Almanac</button>
          <button type="button" className="pwa-toast-close" aria-label="Dismiss install prompt" onClick={dismissInstall}>✕</button>
        </div>
      )}
      {install === "ios" && (
        <div className="pwa-toast">
          <span>Install the Almanac: tap Share, then Add to Home Screen.</span>
          <button type="button" className="pwa-toast-close" aria-label="Dismiss install hint" onClick={dismissInstall}>✕</button>
        </div>
      )}
    </div>
  );
}
