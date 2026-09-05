"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { getToken, getUser } from "@lib/session.js";
import { roleLabel } from "@lib/roles.js";
import Sidebar from "../components/Sidebar.jsx";

const STAT_CARDS = [
  { label: "Draft agreements", value: "—", note: "Phase 2/3 wire this up" },
  { label: "Finalized this month", value: "—", note: "Once the Pricing Engine lands" },
  { label: "Active partners", value: "—", note: "Once Partner management ships" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setUser(getUser());
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 px-10 py-10 max-w-5xl">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <p className="text-sm text-[var(--text-soft)]">{roleLabel(user?.role)}</p>
          <h1 className="font-display font-bold text-3xl mt-1 text-balance">
            Good to see you, {user?.name?.split(" ")[0]}.
          </h1>
          <p className="mt-2 text-[var(--text-soft)] max-w-lg">
            This is Phase 1 of the V2 rebuild — the foundation (auth, roles, the
            permission matrix) is live. Agreements, pricing, and documents land
            in the phases after this one.
          </p>
        </motion.div>

        <div className="mt-10 grid sm:grid-cols-3 gap-4">
          {STAT_CARDS.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.08 * i }}
              className="rounded-xl2 border border-[var(--panel-border)] bg-[var(--panel)] p-5"
            >
              <div className="text-sm text-[var(--text-soft)]">{card.label}</div>
              <div className="font-display font-bold text-3xl mt-1">{card.value}</div>
              <div className="text-xs text-[var(--text-soft)] mt-1">{card.note}</div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-8 rounded-xl2 border border-[var(--panel-border)] bg-[var(--panel)] p-6"
        >
          <h2 className="font-display font-semibold text-lg">Your permissions</h2>
          <p className="text-sm text-[var(--text-soft)] mt-1">
            Granted to the {roleLabel(user?.role)} role — editable from Back
            Office once the Roles &amp; Permissions screen ships, no deploy
            required.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(user?.permissions || []).map((p) => (
              <span
                key={p}
                className="text-xs font-mono rounded-full px-3 py-1 bg-ink-50 dark:bg-ink-900/40 text-ink-700 dark:text-ink-200 border border-ink-200/60 dark:border-ink-800"
              >
                {p}
              </span>
            ))}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
