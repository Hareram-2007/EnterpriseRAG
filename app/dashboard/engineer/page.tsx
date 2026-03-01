"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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

interface ConsoleEntry {
    id: number;
    type: "query" | "response" | "error";
    text: string;
    timestamp: string;
    confidence?: number;
    sources?: string[];
}

type SidebarSection =
    | "aerodynamics"
    | "chassis"
    | "powertrain"
    | "suspension"
    | "wind-tunnel";

/* ═══════════════════════════════════════════════════════════════
   ENGINEERING DATA
   ═══════════════════════════════════════════════════════════════ */

const SECTIONS: { key: SidebarSection; label: string; icon: string }[] = [
    { key: "aerodynamics", label: "Aerodynamics", icon: "◈" },
    { key: "chassis", label: "Chassis", icon: "◆" },
    { key: "powertrain", label: "Powertrain", icon: "⚙" },
    { key: "suspension", label: "Suspension", icon: "⟁" },
    { key: "wind-tunnel", label: "Wind Tunnel", icon: "◎" },
];

interface DataCard {
    title: string;
    value: string;
    unit?: string;
    detail?: string;
    accent?: boolean;
}

const ENGINEERING_DATA: Record<SidebarSection, { heading: string; cards: DataCard[] }> = {
    aerodynamics: {
        heading: "Aerodynamic Systems",
        cards: [
            {
                title: "Downforce @ 300 km/h",
                value: "1,500",
                unit: "kg",
                detail: "Ground-effect package with Venturi tunnels and active rear wing.",
            },
            {
                title: "Active Rear Wing Angle",
                value: "12° – 72°",
                detail: "Electronically adjustable, auto-DRS capable for low-drag straights.",
                accent: true,
            },
            {
                title: "Drag Coefficient",
                value: "0.34",
                unit: "Cd",
                detail: "Circuit-optimized — downforce prioritized over top speed.",
            },
            {
                title: "CFD Optimization",
                value: "4,200+",
                unit: "iterations",
                detail:
                    "Full-body CFD in collaboration with Dallara. 50% scale wind-tunnel correlation within ±2%.",
                accent: true,
            },
        ],
    },
    chassis: {
        heading: "Carbon-Titanium Monocoque",
        cards: [
            {
                title: "Monocoque Mass",
                value: "68",
                unit: "kg",
                detail: "Carbon-titanium composite — lightest in its class at production.",
            },
            {
                title: "Torsional Rigidity",
                value: "32,000",
                unit: "Nm/°",
                detail: "Exceeds contemporary LMP prototypes.",
                accent: true,
            },
            {
                title: "Weight Distribution",
                value: "44 / 56",
                unit: "F/R %",
                detail: "Mid-rear V12 layout ensures optimal traction.",
            },
            {
                title: "Dry Weight",
                value: "1,070",
                unit: "kg",
                detail: "Power-to-weight ratio: 701 hp/tonne.",
                accent: true,
            },
        ],
    },
    powertrain: {
        heading: "6.0 L AMG V12 Engine",
        cards: [
            {
                title: "Peak Power",
                value: "750",
                unit: "HP @ 7,500 rpm",
                detail: "Naturally aspirated Mercedes-AMG M120 V12.",
                accent: true,
            },
            {
                title: "Peak Torque",
                value: "710",
                unit: "Nm @ 5,700 rpm",
                detail: "Linear power curve with instantaneous throttle response.",
            },
            {
                title: "Transmission",
                value: "6-speed",
                unit: "sequential",
                detail: "Xtrac motorsport gearbox — paddle-shift, straight-cut gears.",
                accent: true,
            },
            {
                title: "Exhaust Material",
                value: "Inconel 625",
                detail: "Aerospace-grade superalloy, total system weight 5.8 kg. 120 dB signature.",
            },
        ],
    },
    suspension: {
        heading: "Competition Suspension",
        cards: [
            {
                title: "Configuration",
                value: "Double Wishbone",
                detail: "All four corners with pushrod-activated dampers.",
            },
            {
                title: "Dampers",
                value: "Öhlins TTX",
                unit: "4-way adj.",
                detail: "Compression / rebound adjustment for circuit tuning.",
                accent: true,
            },
            {
                title: "Anti-Roll Bars",
                value: "Adjustable",
                unit: "F & R",
                detail: "Blade-type with indexed stiffness settings.",
            },
            {
                title: "Geometry",
                value: "Fully Adjustable",
                detail: "Ride height, camber, toe — derived from motorsport program.",
                accent: true,
            },
        ],
    },
    "wind-tunnel": {
        heading: "Wind Tunnel Data",
        cards: [
            {
                title: "Facility",
                value: "Dallara",
                detail: "Varano de' Melegari, Italy — 50% scale model correlation.",
            },
            {
                title: "Front Downforce",
                value: "620",
                unit: "kg @ 300 km/h",
                detail: "Front splitter and underbody tunnels.",
                accent: true,
            },
            {
                title: "Rear Downforce",
                value: "880",
                unit: "kg @ 300 km/h",
                detail: "Rear wing + diffuser extraction.",
                accent: true,
            },
            {
                title: "L/D Ratio",
                value: "4.41",
                detail: "Lift-to-drag ratio optimized for high-speed circuits.",
            },
        ],
    },
};

/* ═══════════════════════════════════════════════════════════════
   ANIMATION VARIANTS
   ═══════════════════════════════════════════════════════════════ */

const fadeUp: any = {
    hidden: { opacity: 0, y: 24 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
    }),
};

const sidebarItem: any = {
    hidden: { opacity: 0, x: -16 },
    visible: (i: number) => ({
        opacity: 1,
        x: 0,
        transition: { delay: 0.3 + i * 0.06, duration: 0.4 },
    }),
};

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function EngineerDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<UserInfo | null>(null);
    const [authorized, setAuthorized] = useState(false);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState<SidebarSection>("aerodynamics");
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Console state
    const [query, setQuery] = useState("");
    const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
    const [querying, setQuerying] = useState(false);
    const consoleEndRef = useRef<HTMLDivElement>(null);
    const entryIdRef = useRef(0);

    /* ── Auth Verification ── */
    useEffect(() => {
        (async () => {
            try {
                const me = await getUser();
                if (me.role !== "engineer") {
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

    /* ── Auto-scroll console ── */
    useEffect(() => {
        consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [consoleEntries]);

    /* ── RAG Query ── */
    const handleQuery = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            const q = query.trim();
            if (!q || querying) return;

            const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
            setConsoleEntries((prev) => [
                ...prev,
                { id: ++entryIdRef.current, type: "query", text: q, timestamp: ts },
            ]);
            setQuery("");
            setQuerying(true);

            try {
                const data = await apiFetch<ChatResponse>("/api/chat", {
                    method: "POST",
                    body: JSON.stringify({ question: q }),
                });
                setConsoleEntries((prev) => [
                    ...prev,
                    {
                        id: ++entryIdRef.current,
                        type: "response",
                        text: data.answer,
                        timestamp: new Date().toLocaleTimeString("en-GB", { hour12: false }),
                        confidence: data.confidence,
                        sources: data.sources,
                    },
                ]);
            } catch (err: unknown) {
                setConsoleEntries((prev) => [
                    ...prev,
                    {
                        id: ++entryIdRef.current,
                        type: "error",
                        text: err instanceof Error ? err.message : "Query failed.",
                        timestamp: new Date().toLocaleTimeString("en-GB", { hour12: false }),
                    },
                ]);
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

    const sectionData = ENGINEERING_DATA[activeSection];

    return (
        <div className="min-h-screen bg-pagani-black text-white flex flex-col lg:flex-row">
            {/* ── Mobile Header ── */}
            <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-white/5 bg-carbon-gray/60 backdrop-blur-md sticky top-0 z-50">
                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="text-pagani-gold text-2xl"
                    aria-label="Toggle sidebar"
                >
                    ☰
                </button>
                <span
                    className="text-xs tracking-[0.2em] uppercase text-pagani-gold"
                    style={{ fontFamily: "var(--font-orbitron)" }}
                >
                    Engineer Console
                </span>
                <button onClick={handleLogout} className="text-xs text-gray-500 hover:text-red-400 transition-colors">
                    Logout
                </button>
            </div>

            {/* ── Sidebar ── */}
            <AnimatePresence>
                {(sidebarOpen || typeof window === "undefined" || true) && (
                    <motion.aside
                        initial={{ x: -280 }}
                        animate={{ x: 0 }}
                        exit={{ x: -280 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className={`
                            fixed inset-y-0 left-0 z-40 w-[260px] flex flex-col
                            border-r border-white/5
                            bg-carbon-gray/80 backdrop-blur-xl
                            lg:relative lg:translate-x-0 lg:flex
                            ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
                        `}
                    >
                        {/* Brand */}
                        <div className="px-6 pt-7 pb-5 border-b border-white/5">
                            <h1
                                className="text-[15px] font-bold tracking-tighter uppercase text-white leading-tight"
                                style={{ fontFamily: "var(--font-orbitron)" }}
                            >
                                Pagani <span className="text-pagani-gold">R&D</span>
                            </h1>
                            <p className="text-[10px] text-gray-500 tracking-[0.25em] uppercase mt-1">
                                Engineering Division
                            </p>
                        </div>

                        {/* User badge */}
                        <div className="px-6 py-4 border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-pagani-gold/10 border border-pagani-gold/30 flex items-center justify-center text-pagani-gold text-xs font-bold uppercase">
                                    {user?.username?.charAt(0) ?? "E"}
                                </div>
                                <div>
                                    <p className="text-xs text-white font-semibold">{user?.username}</p>
                                    <p className="text-[10px] text-pagani-gold/70 uppercase tracking-wider">
                                        Engineer
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Nav */}
                        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                            <p className="text-[9px] text-gray-600 uppercase tracking-[0.2em] px-3 mb-2">
                                Technical Systems
                            </p>
                            {SECTIONS.map((sec, i) => (
                                <motion.button
                                    key={sec.key}
                                    variants={sidebarItem}
                                    initial="hidden"
                                    animate="visible"
                                    custom={i}
                                    onClick={() => {
                                        setActiveSection(sec.key);
                                        setSidebarOpen(false);
                                    }}
                                    className={`
                                        w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left text-sm transition-all
                                        ${activeSection === sec.key
                                            ? "bg-pagani-gold/10 text-pagani-gold border border-pagani-gold/20"
                                            : "text-gray-400 hover:text-white hover:bg-white/[0.03] border border-transparent"
                                        }
                                    `}
                                >
                                    <span className="text-base">{sec.icon}</span>
                                    <span style={{ fontFamily: "var(--font-rajdhani)" }}>{sec.label}</span>
                                </motion.button>
                            ))}
                        </nav>

                        {/* Logout (desktop) */}
                        <div className="hidden lg:block px-6 py-4 border-t border-white/5">
                            <button
                                onClick={handleLogout}
                                className="w-full py-2 text-xs text-gray-500 hover:text-red-400 border border-white/5 rounded-lg transition-colors uppercase tracking-wider"
                            >
                                Sign Out
                            </button>
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>

            {/* Sidebar overlay (mobile) */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-30 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* ── Main Content ── */}
            <main className="flex-1 min-w-0 overflow-y-auto">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-8 lg:py-10 space-y-8">
                    {/* Section Header */}
                    <motion.div
                        key={activeSection}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                    >
                        <p className="text-[10px] text-pagani-gold/60 uppercase tracking-[0.3em] mb-1">
                            Technical Data Module
                        </p>
                        <h2
                            className="text-2xl sm:text-3xl font-bold tracking-tight text-white"
                            style={{ fontFamily: "var(--font-orbitron)" }}
                        >
                            {sectionData.heading}
                        </h2>
                        <div className="mt-3 h-px bg-gradient-to-r from-pagani-gold/40 via-pagani-gold/10 to-transparent" />
                    </motion.div>

                    {/* Data Cards Grid */}
                    <motion.div
                        key={`cards-${activeSection}`}
                        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                        initial="hidden"
                        animate="visible"
                    >
                        {sectionData.cards.map((card, i) => (
                            <motion.div
                                key={card.title}
                                variants={fadeUp}
                                custom={i}
                                className="group relative rounded-xl p-5 transition-all duration-300 hover:scale-[1.015]"
                                style={{
                                    background:
                                        "linear-gradient(145deg, rgba(42,42,42,0.5) 0%, rgba(26,26,26,0.8) 100%)",
                                    border: card.accent
                                        ? "1px solid rgba(212,175,55,0.2)"
                                        : "1px solid rgba(255,255,255,0.05)",
                                    boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
                                }}
                            >
                                {/* Hover glow */}
                                <div
                                    className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                                    style={{
                                        boxShadow: "inset 0 0 30px rgba(212,175,55,0.06), 0 0 20px rgba(212,175,55,0.04)",
                                    }}
                                />
                                <p className="text-[10px] text-gray-500 uppercase tracking-[0.15em] mb-2">
                                    {card.title}
                                </p>
                                <div className="flex items-baseline gap-2 mb-2">
                                    <span
                                        className={`text-3xl font-bold tracking-tight ${card.accent ? "text-pagani-gold" : "text-white"
                                            }`}
                                        style={{ fontFamily: "var(--font-orbitron)" }}
                                    >
                                        {card.value}
                                    </span>
                                    {card.unit && (
                                        <span className="text-xs text-gray-500 uppercase">{card.unit}</span>
                                    )}
                                </div>
                                {card.detail && (
                                    <p className="text-xs text-gray-400 leading-relaxed">{card.detail}</p>
                                )}
                            </motion.div>
                        ))}
                    </motion.div>

                    {/* ── Technical Query Console ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 0.5 }}
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <p
                                className="text-xs text-pagani-gold/80 uppercase tracking-[0.2em]"
                                style={{ fontFamily: "var(--font-orbitron)" }}
                            >
                                Technical Query Console
                            </p>
                        </div>

                        <div
                            className="rounded-xl overflow-hidden"
                            style={{
                                background:
                                    "linear-gradient(180deg, rgba(20,20,20,0.95) 0%, rgba(10,10,10,0.98) 100%)",
                                border: "1px solid rgba(212,175,55,0.12)",
                            }}
                        >
                            {/* Console output */}
                            <div className="h-[280px] overflow-y-auto p-4 space-y-3 font-mono text-xs">
                                {consoleEntries.length === 0 && (
                                    <p className="text-gray-600 italic">
                                        // Query the RAG knowledge base. Type a technical question below.
                                    </p>
                                )}
                                {consoleEntries.map((entry) => (
                                    <div key={entry.id}>
                                        {entry.type === "query" && (
                                            <div className="flex gap-2">
                                                <span className="text-pagani-gold shrink-0">▸</span>
                                                <span className="text-gray-300">{entry.text}</span>
                                                <span className="text-gray-600 ml-auto shrink-0 text-[10px]">
                                                    {entry.timestamp}
                                                </span>
                                            </div>
                                        )}
                                        {entry.type === "response" && (
                                            <div className="pl-4 border-l border-pagani-gold/20">
                                                <p className="text-green-400/90 whitespace-pre-wrap leading-relaxed">
                                                    {entry.text}
                                                </p>
                                                {entry.confidence !== undefined && (
                                                    <p className="text-gray-600 mt-1 text-[10px]">
                                                        Confidence: {(entry.confidence * 100).toFixed(0)}%
                                                        {entry.sources && entry.sources.length > 0
                                                            ? ` · Sources: ${entry.sources.join(", ")}`
                                                            : ""}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                        {entry.type === "error" && (
                                            <div className="pl-4 border-l border-red-500/30">
                                                <p className="text-red-400">⚠ {entry.text}</p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {querying && (
                                    <div className="flex items-center gap-2 text-gray-500">
                                        <motion.span
                                            animate={{ opacity: [0.3, 1, 0.3] }}
                                            transition={{ repeat: Infinity, duration: 1.4 }}
                                        >
                                            ●
                                        </motion.span>
                                        Processing query…
                                    </div>
                                )}
                                <div ref={consoleEndRef} />
                            </div>

                            {/* Input */}
                            <form onSubmit={handleQuery} className="border-t border-white/5 flex">
                                <span className="text-pagani-gold px-4 py-3 text-sm shrink-0 select-none">▸</span>
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Enter technical query…"
                                    disabled={querying}
                                    className="flex-1 bg-transparent text-sm text-white outline-none placeholder-gray-600 py-3 pr-4 disabled:opacity-40"
                                    style={{ fontFamily: "var(--font-rajdhani)" }}
                                />
                                <button
                                    type="submit"
                                    disabled={querying || !query.trim()}
                                    className="px-5 text-xs text-pagani-gold uppercase tracking-wider hover:bg-pagani-gold/10 transition-colors disabled:opacity-30"
                                    style={{ fontFamily: "var(--font-orbitron)" }}
                                >
                                    Run
                                </button>
                            </form>
                        </div>
                    </motion.div>
                </div>

                {/* Footer */}
                <div className="border-t border-white/5 px-6 py-4 text-center">
                    <p className="text-[10px] text-gray-700 tracking-wider uppercase">
                        © {new Date().getFullYear()} Pagani Automobili S.p.A. — Engineering Division
                    </p>
                </div>
            </main>
        </div>
    );
}
