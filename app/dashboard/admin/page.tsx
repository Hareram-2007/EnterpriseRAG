"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { getUser, logout, type UserInfo } from "@/lib/auth";

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

interface ChatResponse {
    answer: string;
    sources: string[];
    confidence: number;
    user_role: string;
}

/* ═══════════════════════════════════════════════════════════════
   MOCK DATA
   ═══════════════════════════════════════════════════════════════ */

const MOCK_USERS = [
    { username: "h.pagani", role: "admin", status: "active" },
    { username: "m.rossi", role: "engineer", status: "active" },
    { username: "l.marchetti", role: "engineer", status: "active" },
    { username: "g.bianchi", role: "viewer", status: "active" },
    { username: "a.ferrari", role: "viewer", status: "inactive" },
    { username: "r.colombo", role: "engineer", status: "active" },
];

const MOCK_AUDIT: { user: string; role: string; question: string; time: string }[] = [
    { user: "m.rossi", role: "engineer", question: "What is the torsional rigidity of the monocoque?", time: "14:32" },
    { user: "g.bianchi", role: "viewer", question: "Top speed of the Zonda R?", time: "14:18" },
    { user: "l.marchetti", role: "engineer", question: "Öhlins damper specifications?", time: "13:55" },
    { user: "h.pagani", role: "admin", question: "Current unit market valuation?", time: "13:41" },
    { user: "r.colombo", role: "engineer", question: "CFD iteration count for rear wing?", time: "12:09" },
];

const ASSEMBLY_TIMELINE = [
    { phase: "Design & Prototyping", months: "0–8", pct: 100 },
    { phase: "Carbon Layup", months: "8–14", pct: 100 },
    { phase: "Powertrain Integration", months: "14–18", pct: 100 },
    { phase: "Assembly & QC", months: "18–22", pct: 100 },
    { phase: "Delivery & Commissioning", months: "22–24", pct: 100 },
];

const REVENUE_DATA = [
    { year: "2007", value: 4.5 },
    { year: "2008", value: 7.5 },
    { year: "2009", value: 6.0 },
    { year: "2010", value: 4.5 },
];

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    admin: { bg: "rgba(212,175,55,0.12)", text: "#FFD700", border: "rgba(212,175,55,0.3)" },
    engineer: { bg: "rgba(59,130,246,0.12)", text: "#60A5FA", border: "rgba(59,130,246,0.3)" },
    viewer: { bg: "rgba(156,163,175,0.12)", text: "#9CA3AF", border: "rgba(156,163,175,0.3)" },
};

/* ═══════════════════════════════════════════════════════════════
   ANIMATION VARIANTS
   ═══════════════════════════════════════════════════════════════ */

const fadeUp: any = {
    hidden: { opacity: 0, y: 24 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] },
    }),
};

/* ═══════════════════════════════════════════════════════════════
   ANIMATED COUNTER
   ═══════════════════════════════════════════════════════════════ */

function AnimatedCounter({ target, prefix = "", suffix = "", duration = 1.8 }: {
    target: number;
    prefix?: string;
    suffix?: string;
    duration?: number;
}) {
    const [current, setCurrent] = useState(0);
    const ref = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        let frame: number;
        const start = performance.now();
        const tick = (now: number) => {
            const elapsed = Math.min((now - start) / (duration * 1000), 1);
            const eased = 1 - Math.pow(1 - elapsed, 3); // easeOutCubic
            setCurrent(Math.round(target * eased));
            if (elapsed < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [target, duration]);

    return (
        <span ref={ref}>
            {prefix}{current.toLocaleString()}{suffix}
        </span>
    );
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function AdminDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<UserInfo | null>(null);
    const [authorized, setAuthorized] = useState(false);
    const [loading, setLoading] = useState(true);

    // Console state
    const [query, setQuery] = useState("");
    const [response, setResponse] = useState<ChatResponse | null>(null);
    const [queryError, setQueryError] = useState("");
    const [querying, setQuerying] = useState(false);

    /* ── Auth Verification ── */
    useEffect(() => {
        (async () => {
            try {
                const me = await getUser();
                if (me.role !== "admin") {
                    router.replace("/");
                    return;
                }
                setUser(me);
                setAuthorized(true);
            } catch {
                router.replace("/");
            } finally {
                setLoading(false);
            }
        })();
    }, [router]);

    /* ── RAG Query ── */
    const handleQuery = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            const q = query.trim();
            if (!q || querying) return;

            setQuerying(true);
            setQueryError("");
            setResponse(null);

            try {
                const data = await apiFetch<ChatResponse>("/api/chat", {
                    method: "POST",
                    body: JSON.stringify({ question: q }),
                });
                setResponse(data);
            } catch (err: unknown) {
                setQueryError(err instanceof Error ? err.message : "Query failed.");
            } finally {
                setQuerying(false);
            }
        },
        [query, querying]
    );

    const handleLogout = () => {
        logout();
        router.push("/");
    };

    const maxRevenue = Math.max(...REVENUE_DATA.map((d) => d.value));

    /* ── Loading / Auth gate ── */
    if (loading) {
        return (
            <div className="min-h-screen bg-pagani-black flex items-center justify-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                    className="w-10 h-10 border-2 border-pagani-gold/30 border-t-pagani-gold rounded-full"
                />
            </div>
        );
    }
    if (!authorized) return null;

    /* ═══════════════════════════════════════════════════════════════
       RENDER
       ═══════════════════════════════════════════════════════════════ */

    return (
        <div className="min-h-screen bg-pagani-black text-white">
            {/* ── Top Bar ── */}
            <header
                className="sticky top-0 z-50 backdrop-blur-xl border-b border-white/5"
                style={{ background: "rgba(26,26,26,0.85)" }}
            >
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 flex items-center justify-between h-14">
                    <div className="flex items-center gap-4">
                        <h1
                            className="text-sm font-bold tracking-tighter uppercase text-white"
                            style={{ fontFamily: "var(--font-orbitron)" }}
                        >
                            Pagani <span className="text-bright-gold">Command</span>
                        </h1>
                        <span className="hidden sm:inline text-[10px] text-gray-600 tracking-[0.25em] uppercase">
                            Executive Dashboard
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-bright-gold/10 border border-bright-gold/30 flex items-center justify-center text-bright-gold text-[10px] font-bold uppercase">
                                {user?.username?.charAt(0) ?? "A"}
                            </div>
                            <div className="hidden sm:block">
                                <p className="text-xs text-white font-medium">{user?.username}</p>
                                <p className="text-[9px] text-bright-gold/60 uppercase tracking-wider">
                                    Administrator
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="text-[10px] text-gray-500 hover:text-red-400 border border-white/5 px-3 py-1.5 rounded-lg transition-colors uppercase tracking-wider"
                        >
                            Sign Out
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Main Content ── */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8 lg:py-10 space-y-8">
                {/* ── Hero Stats ── */}
                <motion.div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
                    initial="hidden"
                    animate="visible"
                >
                    {[
                        {
                            label: "Total Units Produced",
                            value: 15,
                            suffix: "",
                            accent: true,
                            sub: "All allocated pre-announcement",
                        },
                        {
                            label: "Remaining Inventory",
                            value: 0,
                            suffix: " units",
                            accent: false,
                            sub: "Production line closed",
                        },
                        {
                            label: "Unit Price (MSRP)",
                            value: 1500000,
                            prefix: "€",
                            suffix: "",
                            accent: true,
                            sub: "Excl. local taxes & duties",
                        },
                        {
                            label: "Revenue Projection",
                            value: 22500000,
                            prefix: "€",
                            suffix: "",
                            accent: false,
                            sub: "15 units × €1.5M base",
                        },
                    ].map((stat, i) => (
                        <motion.div
                            key={stat.label}
                            variants={fadeUp}
                            custom={i}
                            className="group relative rounded-xl p-5 transition-all duration-300 hover:-translate-y-0.5"
                            style={{
                                background:
                                    "linear-gradient(145deg, rgba(42,42,42,0.5) 0%, rgba(26,26,26,0.8) 100%)",
                                border: stat.accent
                                    ? "1px solid rgba(255,215,0,0.2)"
                                    : "1px solid rgba(255,255,255,0.05)",
                                boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
                            }}
                        >
                            <div
                                className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                                style={{
                                    boxShadow:
                                        "inset 0 0 30px rgba(255,215,0,0.04), 0 0 15px rgba(255,215,0,0.03)",
                                }}
                            />
                            <p className="text-[10px] text-gray-500 uppercase tracking-[0.15em] mb-2">
                                {stat.label}
                            </p>
                            <p
                                className={`text-2xl sm:text-3xl font-bold tracking-tight ${stat.accent ? "text-bright-gold" : "text-white"
                                    }`}
                                style={{ fontFamily: "var(--font-orbitron)" }}
                            >
                                <AnimatedCounter
                                    target={stat.value}
                                    prefix={stat.prefix ?? ""}
                                    suffix={stat.suffix ?? ""}
                                />
                            </p>
                            <p className="text-[11px] text-gray-500 mt-1">{stat.sub}</p>
                        </motion.div>
                    ))}
                </motion.div>

                {/* ── Row: Assembly Timeline + Revenue Chart ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Assembly Timeline */}
                    <motion.div
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                        custom={4}
                        className="rounded-xl p-6"
                        style={{
                            background:
                                "linear-gradient(145deg, rgba(42,42,42,0.45) 0%, rgba(26,26,26,0.8) 100%)",
                            border: "1px solid rgba(255,255,255,0.05)",
                            boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
                        }}
                    >
                        <h3
                            className="text-xs font-bold text-bright-gold uppercase tracking-[0.15em] mb-5"
                            style={{ fontFamily: "var(--font-orbitron)" }}
                        >
                            Assembly Timeline
                        </h3>
                        <div className="space-y-3">
                            {ASSEMBLY_TIMELINE.map((step, i) => (
                                <motion.div
                                    key={step.phase}
                                    initial={{ opacity: 0, x: -12 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.6 + i * 0.1, duration: 0.4 }}
                                >
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs text-gray-300">{step.phase}</span>
                                        <span className="text-[10px] text-gray-500">
                                            {step.months} mo
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <motion.div
                                            className="h-full rounded-full"
                                            style={{
                                                background:
                                                    "linear-gradient(90deg, #D4AF37, #FFD700)",
                                            }}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${step.pct}%` }}
                                            transition={{
                                                delay: 0.8 + i * 0.15,
                                                duration: 0.8,
                                                ease: "easeOut",
                                            }}
                                        />
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                        <p className="text-[10px] text-gray-600 mt-4 italic">
                            All 15 units completed. Production closed 2010.
                        </p>
                    </motion.div>

                    {/* Revenue Bar Chart */}
                    <motion.div
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                        custom={5}
                        className="rounded-xl p-6"
                        style={{
                            background:
                                "linear-gradient(145deg, rgba(42,42,42,0.45) 0%, rgba(26,26,26,0.8) 100%)",
                            border: "1px solid rgba(255,255,255,0.05)",
                            boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
                        }}
                    >
                        <h3
                            className="text-xs font-bold text-bright-gold uppercase tracking-[0.15em] mb-5"
                            style={{ fontFamily: "var(--font-orbitron)" }}
                        >
                            Revenue by Year (€M)
                        </h3>
                        <div className="flex items-end gap-3 h-[180px]">
                            {REVENUE_DATA.map((d, i) => (
                                <div key={d.year} className="flex-1 flex flex-col items-center gap-2">
                                    <span className="text-[10px] text-gray-400">
                                        €{d.value}M
                                    </span>
                                    <div className="w-full bg-white/5 rounded-t-md overflow-hidden relative" style={{ height: "140px" }}>
                                        <motion.div
                                            className="absolute bottom-0 left-0 right-0 rounded-t-md"
                                            style={{
                                                background:
                                                    "linear-gradient(180deg, #FFD700 0%, #D4AF37 100%)",
                                            }}
                                            initial={{ height: 0 }}
                                            animate={{
                                                height: `${(d.value / maxRevenue) * 100}%`,
                                            }}
                                            transition={{
                                                delay: 0.8 + i * 0.15,
                                                duration: 0.7,
                                                ease: "easeOut",
                                            }}
                                        />
                                    </div>
                                    <span className="text-[10px] text-gray-500">{d.year}</span>
                                </div>
                            ))}
                        </div>
                        <p className="text-[10px] text-gray-600 mt-4 italic">
                            Total lifetime revenue: €22.5M (15 × €1.5M MSRP)
                        </p>
                    </motion.div>
                </div>

                {/* ── Row: User Management + RAG Audit ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* User Management */}
                    <motion.div
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                        custom={6}
                        className="rounded-xl p-6"
                        style={{
                            background:
                                "linear-gradient(145deg, rgba(42,42,42,0.45) 0%, rgba(26,26,26,0.8) 100%)",
                            border: "1px solid rgba(255,255,255,0.05)",
                            boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
                        }}
                    >
                        <div className="flex items-center justify-between mb-5">
                            <h3
                                className="text-xs font-bold text-bright-gold uppercase tracking-[0.15em]"
                                style={{ fontFamily: "var(--font-orbitron)" }}
                            >
                                User Management
                            </h3>
                            <span className="text-[10px] text-gray-500">
                                {MOCK_USERS.length} registered
                            </span>
                        </div>
                        <div className="space-y-2">
                            {MOCK_USERS.map((u, i) => {
                                const rc = ROLE_COLORS[u.role] ?? ROLE_COLORS.viewer;
                                return (
                                    <motion.div
                                        key={u.username}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.7 + i * 0.06, duration: 0.35 }}
                                        className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-white/[0.02] transition-colors"
                                        style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold uppercase"
                                                style={{
                                                    background: rc.bg,
                                                    color: rc.text,
                                                    border: `1px solid ${rc.border}`,
                                                }}
                                            >
                                                {u.username.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-xs text-white font-medium">
                                                    {u.username}
                                                </p>
                                                <p className="text-[10px] text-gray-600">
                                                    {u.status === "active" ? "● Active" : "○ Inactive"}
                                                </p>
                                            </div>
                                        </div>
                                        <span
                                            className="text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider font-semibold"
                                            style={{
                                                background: rc.bg,
                                                color: rc.text,
                                                border: `1px solid ${rc.border}`,
                                            }}
                                        >
                                            {u.role}
                                        </span>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </motion.div>

                    {/* RAG Query Audit */}
                    <motion.div
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                        custom={7}
                        className="rounded-xl p-6"
                        style={{
                            background:
                                "linear-gradient(145deg, rgba(42,42,42,0.45) 0%, rgba(26,26,26,0.8) 100%)",
                            border: "1px solid rgba(255,255,255,0.05)",
                            boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
                        }}
                    >
                        <div className="flex items-center justify-between mb-5">
                            <h3
                                className="text-xs font-bold text-bright-gold uppercase tracking-[0.15em]"
                                style={{ fontFamily: "var(--font-orbitron)" }}
                            >
                                RAG Query Audit
                            </h3>
                            <span className="text-[10px] text-gray-500">Last 5 queries</span>
                        </div>
                        <div className="space-y-2">
                            {MOCK_AUDIT.map((entry, i) => {
                                const rc = ROLE_COLORS[entry.role] ?? ROLE_COLORS.viewer;
                                return (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.7 + i * 0.06, duration: 0.35 }}
                                        className="py-2.5 px-3 rounded-lg hover:bg-white/[0.02] transition-colors"
                                        style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-white font-medium">
                                                    {entry.user}
                                                </span>
                                                <span
                                                    className="text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider"
                                                    style={{
                                                        background: rc.bg,
                                                        color: rc.text,
                                                        border: `1px solid ${rc.border}`,
                                                    }}
                                                >
                                                    {entry.role}
                                                </span>
                                            </div>
                                            <span className="text-[10px] text-gray-600">
                                                {entry.time}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-gray-400 truncate">
                                            &quot;{entry.question}&quot;
                                        </p>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </motion.div>
                </div>

                {/* ── Executive Intelligence Console ── */}
                <motion.div
                    variants={fadeUp}
                    initial="hidden"
                    animate="visible"
                    custom={8}
                >
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-bright-gold animate-pulse" />
                        <p
                            className="text-xs text-bright-gold/80 uppercase tracking-[0.2em]"
                            style={{ fontFamily: "var(--font-orbitron)" }}
                        >
                            Executive Intelligence Console
                        </p>
                    </div>

                    <div
                        className="rounded-xl overflow-hidden"
                        style={{
                            background:
                                "linear-gradient(145deg, rgba(42,42,42,0.5) 0%, rgba(26,26,26,0.85) 100%)",
                            border: "1px solid rgba(255,215,0,0.12)",
                            boxShadow: "0 4px 30px rgba(0,0,0,0.3)",
                        }}
                    >
                        {/* Input */}
                        <form onSubmit={handleQuery} className="flex border-b border-white/5">
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Ask an executive-level question…"
                                disabled={querying}
                                className="flex-1 bg-transparent text-sm text-white outline-none placeholder-gray-600 px-5 py-4 disabled:opacity-40"
                                style={{ fontFamily: "var(--font-rajdhani)" }}
                            />
                            <button
                                type="submit"
                                disabled={querying || !query.trim()}
                                className="px-6 text-xs text-bright-gold uppercase tracking-wider hover:bg-bright-gold/10 transition-colors disabled:opacity-30 border-l border-white/5"
                                style={{ fontFamily: "var(--font-orbitron)" }}
                            >
                                {querying ? (
                                    <motion.span
                                        animate={{ opacity: [0.4, 1, 0.4] }}
                                        transition={{ repeat: Infinity, duration: 1.2 }}
                                    >
                                        Analyzing…
                                    </motion.span>
                                ) : (
                                    "Query"
                                )}
                            </button>
                        </form>

                        {/* Response Panel */}
                        <div className="min-h-[120px] p-5">
                            {!response && !queryError && !querying && (
                                <p className="text-gray-600 text-xs italic">
                                    Intelligence responses will appear here. Query the Pagani enterprise knowledge base above.
                                </p>
                            )}

                            {querying && (
                                <div className="flex items-center gap-3 text-gray-500 text-xs">
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                        className="w-4 h-4 border border-bright-gold/30 border-t-bright-gold rounded-full"
                                    />
                                    Processing executive intelligence query…
                                </div>
                            )}

                            {queryError && (
                                <div className="p-3 rounded-lg bg-red-500/8 border border-red-500/15">
                                    <p className="text-red-400 text-xs">⚠ {queryError}</p>
                                </div>
                            )}

                            {response && (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.4 }}
                                    className="space-y-3"
                                >
                                    <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                                        {response.answer}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/5">
                                        <span
                                            className="text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider"
                                            style={{
                                                background:
                                                    response.confidence >= 0.7
                                                        ? "rgba(34,197,94,0.1)"
                                                        : "rgba(234,179,8,0.1)",
                                                color:
                                                    response.confidence >= 0.7 ? "#4ade80" : "#facc15",
                                                border:
                                                    response.confidence >= 0.7
                                                        ? "1px solid rgba(34,197,94,0.2)"
                                                        : "1px solid rgba(234,179,8,0.2)",
                                            }}
                                        >
                                            Confidence: {(response.confidence * 100).toFixed(0)}%
                                        </span>
                                        {response.sources.map((src) => (
                                            <span
                                                key={src}
                                                className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded"
                                            >
                                                {src}
                                            </span>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </main>

            {/* ── Footer ── */}
            <footer className="border-t border-white/5 px-6 py-4 text-center">
                <p className="text-[10px] text-gray-700 tracking-wider uppercase">
                    © {new Date().getFullYear()} Pagani Automobili S.p.A. — Executive Command
                </p>
            </footer>
        </div>
    );
}
