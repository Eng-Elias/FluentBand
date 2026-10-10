"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Clicking the nav link for the page you're already on is a router no-op —
 * dispatch an event so practice pages can reset to their list/idle view.
 */
export function NavLinks({ items }: { items: readonly (readonly [string, string])[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {items.map(([label, href]) => (
        <Link
          key={href}
          href={href}
          onClick={() => {
            if (href === pathname) {
              window.dispatchEvent(new CustomEvent("fluentband:reset-page"));
            }
          }}
          className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
