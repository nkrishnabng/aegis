"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, AuthError } from "../lib/api";
import { Sidebar } from "./Sidebar";

/** Gates every page except /login behind a session check, and renders the
 * persistent app shell (sidebar + content column) around everything else.
 * Renders nothing until the check resolves, to avoid a flash of protected
 * content. */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "authed" | "guest">("checking");

  useEffect(() => {
    if (pathname === "/login") {
      setStatus("authed");
      return;
    }
    let cancelled = false;
    api
      .me()
      .then(() => {
        if (!cancelled) setStatus("authed");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AuthError) {
          setStatus("guest");
          router.push("/login");
        } else {
          // Backend unreachable etc. -- still show the app rather than
          // trapping the user on a blank screen.
          setStatus("authed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (status === "checking" || status === "guest") {
    return <p className="muted">Loading...</p>;
  }
  if (pathname === "/login") {
    return <>{children}</>;
  }
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">{children}</main>
    </div>
  );
}
