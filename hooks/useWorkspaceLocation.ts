"use client";

import { useEffect, useRef, useState } from "react";

const sections: Record<string, string> = {
  "Product workspace": "overview", Optimize: "listing", Calendar: "calendar",
  Results: "results", Settings: "settings", Connections: "connection",
  Research: "brief", Create: "creative", Publish: "legacy-export",
  Overview: "portfolio", Products: "products", Reports: "reports",
};

// Keep existing /workspace links and OAuth callbacks working while giving each
// product section a bookmarkable location and normal browser Back/Forward.
export function useWorkspaceLocation<T extends { id: number }>(
  products: T[], loading: boolean, active: T | null, view: string,
  setActive: (product: T | null) => void, setView: (view: string) => void,
) {
  const [ready, setReady] = useState(false);
  const restoring = useRef<string | null>(null);
  const initialized = useRef(false);
  useEffect(() => {
    if (loading) return;
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const product = products.find((item) => item.id === Number(params.get("product"))) ?? null;
      const section = Object.entries(sections).find(([, slug]) => slug === params.get("section"))?.[0];
      if (params.has("googlePlay")) { setReady(true); return; }
      const next = section && (product ? !["Overview", "Products", "Reports"].includes(section) : ["Overview", "Products", "Reports", "Calendar"].includes(section)) ? section : product ? "Product workspace" : "Overview";
      restoring.current = `${product?.id ?? ""}:${next}`;
      setActive(product);
      setView(next);
      setReady(true);
    };
    if (!initialized.current) { initialized.current = true; restore(); }
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [loading, products, setActive, setView]);

  useEffect(() => {
    if (!ready || window.location.search.includes("googlePlay=")) return;
    const key = `${active?.id ?? ""}:${view}`;
    if (restoring.current) {
      if (restoring.current === key) restoring.current = null;
      return;
    }
    const url = new URL(window.location.href);
    if (active) url.searchParams.set("product", String(active.id));
    else url.searchParams.delete("product");
    url.searchParams.set("section", sections[view] ?? "portfolio");
    const next = url.pathname + url.search + url.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) window.history.pushState({}, "", next);
  }, [active, view, ready]);
}
