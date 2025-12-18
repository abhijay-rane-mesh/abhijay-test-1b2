"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { name: "Accounts", href: "/", icon: "👤" },
  { name: "Portfolio", href: "/portfolio", icon: "📊" },
  { name: "Transfer", href: "/transfer", icon: "🔄" },
  { name: "History", href: "/history", icon: "🕐" },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <div className="flex gap-2">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isActive
                ? "bg-emerald-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {tab.name}
          </Link>
        );
      })}
    </div>
  );
}

