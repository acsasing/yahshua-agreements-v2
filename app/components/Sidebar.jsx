"use client";

import { useRouter } from "next/navigation";
import { clearSession, getUser } from "@lib/session.js";
import { roleLabel } from "@lib/roles.js";

const NAV = [
  { label: "Dashboard", href: "/dashboard", icon: "▦" },
  { label: "Agreements", href: "/dashboard", icon: "🗎", permission: "agreement.create" },
  { label: "Back Office", href: "/dashboard", icon: "⚙", permission: "user.manage" },
  { label: "Reports", href: "/dashboard", icon: "📈", permission: "report.view" },
];

export default function Sidebar() {
  const router = useRouter();
  const user = getUser();

  function handleLogout() {
    clearSession();
    router.push("/login");
  }

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 flex flex-col border-r border-[var(--panel-border)] bg-[var(--panel)]">
      <div className="px-5 py-5 flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-ink-500 to-flame-500" />
        <span className="font-display font-bold tracking-tight">YAH</span>
      </div>

      <nav className="flex-1 px-3 space-y-0.5">
        {NAV.filter((item) => !item.permission || user?.permissions?.includes(item.permission)).map((item) => (
          <button
            key={item.label}
            onClick={() => router.push(item.href)}
            className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-soft)] hover:bg-ink-50 dark:hover:bg-ink-900/40 hover:text-[var(--text)] transition"
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="px-3 pb-5 pt-3 border-t border-[var(--panel-border)]">
        <div className="px-3 py-2 mb-1">
          <div className="text-sm font-semibold truncate">{user?.name}</div>
          <div className="text-xs text-[var(--text-soft)]">{roleLabel(user?.role)}</div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-left rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-soft)] hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 dark:hover:text-red-300 transition"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
