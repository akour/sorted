import type { ComponentProps } from "react";

// Public content uses native navigation: crawlable, no router hydration required,
// and safe across the existing vinext client-navigation compatibility boundary.
export default function PublicLink(props: ComponentProps<"a"> & { href: string }) {
  return <a {...props} />;
}
