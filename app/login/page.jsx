"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { api } from "@lib/apiClient.js";
import { saveSession } from "@lib/session.js";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await api.login(email, password);
      saveSession(token, user);
      router.push("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,480px)_1fr]">
      {/* Form panel */}
      <div className="flex items-center justify-center px-8 py-16 bg-[var(--panel)]">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-sm"
        >
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 mb-6">
              <span className="w-8 h-8 rounded-xl2 bg-gradient-to-br from-ink-500 to-flame-500 shadow-glow" />
              <span className="font-display font-bold text-lg tracking-tight text-ink-950 dark:text-white">YAH</span>
            </div>
            <h1 className="font-display font-bold text-3xl leading-tight text-balance">
              Welcome back.
            </h1>
            <p className="mt-2 text-sm text-[var(--text-soft)]">
              Sign in to keep the agreements, pricing, and partners moving.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-ink-200 dark:border-ink-800 bg-transparent px-4 py-2.5 text-sm outline-none transition focus:border-ink-500 focus:ring-2 focus:ring-ink-500/20"
                placeholder="you@yahshua.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-ink-200 dark:border-ink-800 bg-transparent px-4 py-2.5 text-sm outline-none transition focus:border-ink-500 focus:ring-2 focus:ring-ink-500/20"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm px-3 py-2"
              >
                {error}
              </motion.div>
            )}

            <motion.button
              type="submit"
              disabled={loading}
              whileTap={{ scale: 0.98 }}
              className="w-full rounded-xl bg-ink-500 hover:bg-ink-600 disabled:opacity-60 text-white font-semibold text-sm py-2.5 transition shadow-glow"
            >
              {loading ? "Signing in…" : "Sign in"}
            </motion.button>
          </form>
        </motion.div>
      </div>

      {/* Hero panel */}
      <div className="hidden lg:block relative overflow-hidden bg-ink-950">
        <MeshBackdrop />
        <div className="relative z-10 h-full flex flex-col justify-end p-14">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-display font-semibold text-2xl text-white max-w-md text-balance"
          >
            Every document. Every price. Nothing hardcoded.
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-3 text-ink-200 max-w-sm"
          >
            YAHSHUA Agreements V2 — built so a new partner, a new clause, or a new
            price is a Back Office change, never a code deploy.
          </motion.p>
        </div>
      </div>
    </div>
  );
}

function MeshBackdrop() {
  return (
    <div className="absolute inset-0">
      <motion.div
        className="absolute -top-24 -left-24 w-[520px] h-[520px] rounded-full bg-flame-500/30 blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, 20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/3 -right-32 w-[420px] h-[420px] rounded-full bg-ink-500/40 blur-3xl"
        animate={{ x: [0, -30, 0], y: [0, -30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-0 left-1/4 w-[380px] h-[380px] rounded-full bg-ink-300/20 blur-3xl"
        animate={{ x: [0, 20, 0], y: [0, -15, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
