"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  matches: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/receive/shipment-po44891",
    label: "Cockpit",
    matches: (pathname: string) => pathname.startsWith("/receive"),
  },
  {
    href: "/operations",
    label: "Ops",
    matches: (pathname: string) =>
      pathname.startsWith("/operations") || pathname.startsWith("/incident"),
  },
  {
    href: "/technology",
    label: "Tech",
    matches: (pathname: string) => pathname.startsWith("/technology"),
  },
];

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex items-center space-x-1 sm:space-x-2 text-xs sm:text-sm font-semibold shrink-0"
      aria-label="Main Navigation"
    >
      {NAV_ITEMS.map((item) => {
        const isActive = item.matches(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg px-3 py-2 transition-colors ${
              isActive
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                : "text-slate-300 hover:bg-slate-800 hover:text-white border border-transparent"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
