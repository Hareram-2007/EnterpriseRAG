"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, type Variants } from "framer-motion";
import { getUser, getToken, type UserInfo } from "@/lib/auth";
import { getScoreColor } from "@/lib/constants";

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] },
    }),
};

function AnimatedCount({ value, suffix = "" }: { value: number; suffix?: string }) {
    const [count, setCount] = useState(0);
    useEffect(() => {
        let startTime: number;
        const duration = 1200; // ms
        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 4); // easeOutQuart
            setCount(value * easeProgress);
            if (progress < 1) requestAnimationFrame(animate);
            else setCount(value);
        };
        requestAnimationFrame(animate);
    }, [value]);

    const displayValue = value % 1 !== 0 || suffix === "%" ? count.toFixed(1) : Math.round(count).toString();
    return <>{displayValue}{suffix}</>;
}

interface EvalSummary {
    avg_faithfulness: number;
    avg_relevance: number;
    avg_completeness: number;
    avg_f1: number;
    avg_latency_ms: number;
    avg_cost_usd: number;
    total_queries: number;
    queries_by_day: { day: string; count: number }[];
}

interface EvalRecord {
    id: string;
    query_id: string;
    faithfulness: number;
    relevance: number;
    completeness: number;
    f1_score: number;
    confidence_score: number;
    latency_ms: number;
    estimated_cost_usd: number;
    created_at: string;
}

export default function EvaluationsPage() {
    const router = useRouter();
    const [user, setUser] = useState<UserInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState<EvalSummary | null>(null);
    const [recent, setRecent] = useState<EvalRecord[]>([]);
    const [limit, setLimit] = useState(50);

    useEffect(() => {
        (async () => {
            try {
                const me = await getUser();
                setUser(me);
                const token = getToken();
                const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                const headers: Record<string, string> = {};
                if (token) headers["Authorization"] = `Bearer ${token}`;

                // Fetch summary (public)
                const sumRes = await fetch(`${apiBase}/api/v1/evaluations/summary`);
                if (sumRes.ok) setSummary(await sumRes.json());

                // Fetch recent (JWT auth)
                const recRes = await fetch(`${apiBase}/api/v1/evaluations/recent?limit=${limit}`, { headers });
                if (recRes.ok) {
                    const data = await recRes.json();
                    setRecent(data.evaluations || []);
                }
            } catch (err) {
                console.error("Failed to load evaluations:", err);
                import("@/lib/auth").then(m => m.logout());
                router.replace("/login");
            } finally {
                setLoading(false);
            }
        })();
    }, [router, limit]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }} className="w-10 h-10 border-2 border-pagani-gold/30 border-t-pagani-gold rounded-full" />
            </div>
        );
    }
    if (!user) return null;

    const cards = summary
        ? [
            { label: "Faithfulness", value: summary.avg_faithfulness * 100, suffix: "%", color: getScoreColor(summary.avg_faithfulness) },
            { label: "Relevance", value: summary.avg_relevance * 100, suffix: "%", color: getScoreColor(summary.avg_relevance) },
            { label: "Completeness", value: summary.avg_completeness * 100, suffix: "%", color: getScoreColor(summary.avg_completeness) },
            { label: "Avg Latency", value: summary.avg_latency_ms, suffix: "ms", color: "text-white" },
            { label: "Total Queries", value: summary.total_queries, suffix: "", color: "text-pagani-gold" },
        ]
        : [];

    return (
        <div className="min-h-screen relative text-white bg-[#0A0A0A] overflow-hidden">
            {/* Background */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[#D4AF37]/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#2A2A2A]/40 rounded-full blur-[100px]" />
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')] opacity-20 mix-blend-overlay" />
            </div>

            <header className="sticky top-0 z-50 backdrop-blur-2xl border-b border-white/10 bg-[#0A0A0A]/60">
                <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
                    <h1 className="text-sm font-bold tracking-tighter uppercase text-white font-[var(--font-orbitron)]">
                        Pagani <span className="text-pagani-gold">Evaluations</span>
                    </h1>
                    <div className="flex items-center gap-4">
                        <span className="text-xs">{user.username}</span>
                        <button onClick={() => router.push("/")} className="text-[10px] uppercase text-gray-500 hover:text-white">Home</button>
                    </div>
                </div>
            </header>

            <main className="relative z-10 max-w-7xl mx-auto px-4 py-8 space-y-8">
                <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
                    <h2 className="text-2xl font-bold font-[var(--font-orbitron)] text-pagani-gold">Model Evaluations</h2>
                    <p className="text-xs text-gray-500 mt-2 uppercase tracking-widest">Faithfulness · Relevance · Completeness · Performance</p>
                </motion.div>

                {/* 5 Summary Cards */}
                {cards.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {cards.map((c, i) => (
                            <motion.div key={c.label} variants={fadeUp} initial="hidden" animate="visible" custom={i + 1}
                                className="bg-[#111] border border-white/10 rounded-xl p-5 shadow-2xl backdrop-blur-md flex flex-col items-center justify-center text-center">
                                <div className="text-[10px] uppercase text-gray-400 tracking-[0.2em] mb-3">{c.label}</div>
                                <div className={`text-3xl font-bold font-[var(--font-orbitron)] ${c.color}`}>
                                    <AnimatedCount value={c.value} suffix={c.suffix} />
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* Queries by Day */}
                {summary && summary.queries_by_day.length > 0 && (
                    <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={6}
                        className="bg-[#111] border border-white/10 rounded-xl p-6 shadow-2xl backdrop-blur-md">
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Queries (Last 7 Days)</h3>
                        <div className="flex items-end gap-2 h-32">
                            {summary.queries_by_day.map((d) => {
                                const max = Math.max(...summary.queries_by_day.map((x) => x.count), 1);
                                const pct = (d.count / max) * 100;
                                return (
                                    <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: `${pct}%` }}
                                            transition={{ duration: 0.6, ease: "easeOut" }}
                                            className="w-full bg-pagani-gold/40 rounded-t min-h-[4px]"
                                        />
                                        <span className="text-[8px] text-gray-500">{d.day.slice(5)}</span>
                                        <span className="text-[9px] text-white/60">{d.count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}

                {/* Recent Evaluations Table */}
                <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={7}
                    className="bg-[#111] border border-white/10 rounded-xl p-6 shadow-2xl backdrop-blur-md">
                    <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-2">
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Recent Evaluations</h3>
                        <select
                            value={limit}
                            onChange={(e) => setLimit(Number(e.target.value))}
                            className="bg-black border border-white/10 rounded text-xs text-white/60 px-2 py-1 outline-none"
                        >
                            {[20, 50, 100, 200].map((n) => (
                                <option key={n} value={n}>{n} rows</option>
                            ))}
                        </select>
                    </div>
                    {recent.length === 0 ? (
                        <div className="text-center text-gray-500 py-10 uppercase text-xs tracking-widest">
                            No evaluation records yet. They are generated during complex reasoning tasks.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[11px]">
                                <thead>
                                    <tr className="text-gray-500 uppercase tracking-wider border-b border-white/5">
                                        <th className="text-left py-2 px-2">Time</th>
                                        <th className="text-center py-2 px-2">Faith.</th>
                                        <th className="text-center py-2 px-2">Relev.</th>
                                        <th className="text-center py-2 px-2">Compl.</th>
                                        <th className="text-center py-2 px-2">F1</th>
                                        <th className="text-center py-2 px-2">Conf.</th>
                                        <th className="text-right py-2 px-2">Latency</th>
                                        <th className="text-right py-2 px-2">Cost</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recent.map((r) => (
                                        <tr key={r.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            <td className="py-2 px-2 text-white/40">{r.created_at ? new Date(r.created_at).toLocaleTimeString() : "—"}</td>
                                            <td className={`py-2 px-2 text-center ${getScoreColor(r.faithfulness)}`}>{(r.faithfulness * 100).toFixed(0)}%</td>
                                            <td className={`py-2 px-2 text-center ${getScoreColor(r.relevance)}`}>{(r.relevance * 100).toFixed(0)}%</td>
                                            <td className={`py-2 px-2 text-center ${getScoreColor(r.completeness)}`}>{(r.completeness * 100).toFixed(0)}%</td>
                                            <td className={`py-2 px-2 text-center ${getScoreColor(r.f1_score)}`}>{(r.f1_score * 100).toFixed(0)}%</td>
                                            <td className={`py-2 px-2 text-center ${getScoreColor(r.confidence_score)}`}>{(r.confidence_score * 100).toFixed(0)}%</td>
                                            <td className="py-2 px-2 text-right text-white/60">{r.latency_ms?.toFixed(0)}ms</td>
                                            <td className="py-2 px-2 text-right text-green-400">${r.estimated_cost_usd?.toFixed(5)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </motion.div>
            </main>
        </div>
    );
}