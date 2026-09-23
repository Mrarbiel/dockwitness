"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function ProgressBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const activeUrlRef = useRef<string>("");

  // When pathname or searchParams change, mark transition complete
  useEffect(() => {
    const currentUrl = `${pathname}?${searchParams.toString()}`;
    if (activeUrlRef.current && activeUrlRef.current !== currentUrl) {
      // Route change completed
      setProgress(100);
      const hideTimer = setTimeout(() => {
        setVisible(false);
        setLoading(false);
        setProgress(0);
      }, 300);
      return () => clearTimeout(hideTimer);
    }
    activeUrlRef.current = currentUrl;
  }, [pathname, searchParams]);

  // Handle progressive bar simulation when loading
  useEffect(() => {
    if (!loading) return;

    setVisible(true);
    setProgress(20);

    const step1 = setTimeout(() => setProgress(45), 100);
    const step2 = setTimeout(() => setProgress(70), 300);
    const step3 = setTimeout(() => setProgress(88), 700);

    return () => {
      clearTimeout(step1);
      clearTimeout(step2);
      clearTimeout(step3);
    };
  }, [loading]);

  // Intercept internal link clicks to trigger immediate pending state feedback
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      // Only handle standard primary left clicks without modifier keys
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      const targetAttr = anchor.getAttribute("target");

      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        targetAttr === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }

      // Check if internal navigation
      try {
        const nextUrl = new URL(href, window.location.href);
        const currentUrl = new URL(window.location.href);

        if (nextUrl.origin === currentUrl.origin) {
          // If it is the same exact page + hash, don't trigger loading
          if (nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search) {
            return;
          }

          // Trigger immediate pending state animation
          if (timerRef.current) clearTimeout(timerRef.current);
          setLoading(true);

          // Safety timeout in case navigation is cancelled or stalled
          timerRef.current = setTimeout(() => {
            setLoading(false);
            setProgress(100);
            setTimeout(() => {
              setVisible(false);
              setProgress(0);
            }, 300);
          }, 8000);
        }
      } catch {
        // Ignore invalid URLs
      }
    };

    document.addEventListener("click", handleDocumentClick, { capture: true });
    return () => {
      document.removeEventListener("click", handleDocumentClick, { capture: true });
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="progressbar"
      aria-label="Route Transition Progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      className="fixed top-0 left-0 right-0 z-50 pointer-events-none"
    >
      <div
        className="bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 h-0.5 shadow-sm shadow-amber-500/50 transition-all duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

export function TopProgressBar() {
  return (
    <Suspense fallback={null}>
      <ProgressBarInner />
    </Suspense>
  );
}
