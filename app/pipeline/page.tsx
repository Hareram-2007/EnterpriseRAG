"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, type Variants } from "framer-motion";
import { getUser, getToken, type UserInfo } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: (i: number) => ({
        opacity: 1, y: 0,
        transition: { delay: i * 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] },
    }),
};

// Pipeline node definitions for the visual diagram
const PIPELINE_NODES = [
    { id: "data_sources", label: "Data Sources", icon: "📁", col: 0, row: 0 },
    { id: "restructuring", label: "Restructuring", icon: "🔄", col: 1, row: 0 },
    { id: "chunking", label: "Chunking", icon: "✂️", col: 2, row: 0 },
    { id: "metadata", label: "Metadata", icon: "🏷️", col: 3, row: 0 },
    { id: "planner", label: "Planner", icon: "🧠", col: 0, row: 1 },
    { id: "tool_execution", label: "Tool Exec", icon: "⚡", col: 1, row: 1 },
    { id: "router", label: "Router", icon: "🔀", col: 2, row: 1 },
    { id: "multi_agent", label: "Multi-Agent", icon: "🤖", col: 3, row: 1 },
    { id: "agent_1", label: "Agent 1", icon: "🔍", col: 1, row: 2 },
    { id: "agent_2", label: "Agent 2", icon: "📊", col: 2, row: 2 },
    { id: "agent_3", label: "Agent 3", icon: "✍️", col: 3, row: 2 },
    { id: "human_validation", label: "Human QA", icon: "👤", col: 0, row: 3 },
    { id: "evaluation", label: "Evaluation", icon: "📈", col: 1, row: 3 },
    { id: "database", label: "Database", icon: "💾", col: 2, row: 3 },
];

interface NodeStatus {
    status: string;
    last_run_ms: number;
    last_run_at: string | null;
}

interface SystemHealth {
    status: string;
    database: string;
    ai_service: string;
    uptime: string;
    timestamp: string;
    vector_store_initialized: boolean;
    registered_users: number;
}

export default function PipelinePage() {
    const router = useRouter();
    const [user, setUser] = useState<UserInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [health, setHealth] = useState<SystemHealth | null>(null);
    const [pipelineStatus, setPipelineStatus] = useState<Record<string, NodeStatus>>({});
    const [selectedNode, setSelectedNode] = useState<string | null>(null);
    const [logs, setLogs] = useState<any[]>([]);

    const fetchPipelineStatus = useCallback(async () => {
        try {
            const token = getToken();
            const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            const headers: Record<string, string> = {};
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const res = await fetch(`${apiBase}/api/v1/pipeline/status`, { headers });
            if (res.ok) setPipelineStatus(await res.json());
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const me = await getUser();
                setUser(me);

                // Try admin-level health endpoint first, fallback to public /api/health
                let healthData: SystemHealth | null = null;
                try {
                    healthData = await apiFetch<SystemHealth>("/api/v1/analytics/system-health");
                } catch {
                    try {
                        const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                        const res = await fetch(`${apiBase}/api/health`);
                        if (res.ok) healthData = await res.json();
                    } catch { /* silent */ }
                }
                if (healthData) setHealth(healthData);

                try {
                    const auditData = await apiFetch<{ logs: any[] }>("/api/v1/audit/logs?limit=10");
                    setLogs(auditData.logs || []);
                } catch { /* audit logs may be admin-only — no crash */ }

                await fetchPipelineStatus();
            } catch {
                import("@/lib/auth").then(m => m.logout()); // Clear invalid tokens so they don't get stuck in a loop
                router.replace("/login");
            } finally {
                setLoading(false);
            }
        })();
    }, [router, fetchPipelineStatus]);

    // Poll pipeline status every 5s
    useEffect(() => {
        const interval = setInterval(fetchPipelineStatus, 5000);
        return () => clearInterval(interval);
    }, [fetchPipelineStatus]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }} className="w-10 h-10 border-2 border-pagani-gold/30 border-t-pagani-gold rounded-full" />
            </div>
        );
    }
    if (!user) return null;

    const getNodeColor = (status: string) => {
        switch (status) {
            case "running": return "border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.4)]";
            case "done": return "border-green-500";
            case "error": return "border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]";
            default: return "border-white/20";
        }
    };

    const getNodeDotColor = (status: string) => {
        switch (status) {
            case "running": return "bg-blue-500 animate-pulse";
            case "done": return "bg-green-500";
            case "error": return "bg-red-500";
            default: return "bg-white/20";
        }
    };

    const selectedNodeData = selectedNode ? pipelineStatus[selectedNode] : null;
    const selectedNodeDef = selectedNode ? PIPELINE_NODES.find(n => n.id === selectedNode) : null;

    return (
        <div className="min-h-screen relative text-white bg-[#0A0A0A] overflow-hidden">
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes flow-h {
                    from { transform: translateX(0); }
                    to { transform: translateX(6px); }
                }
                @keyframes flow-v {
                    from { transform: translateY(0); }
                    to { transform: translateY(6px); }
                }
            `}} />
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[#D4AF37]/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#2A2A2A]/40 rounded-full blur-[100px]" />
            </div>

            <header className="sticky top-0 z-50 backdrop-blur-2xl border-b border-white/10 bg-[#0A0A0A]/60">
                <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
                    <h1 className="text-sm font-bold tracking-tighter uppercase text-white font-[var(--font-orbitron)]">
                        Pagani <span className="text-pagani-gold">Pipeline</span>
                    </h1>
                    <div className="flex items-center gap-4">
                        <span className="text-xs">{user.username}</span>
                        <button onClick={() => router.push("/")} className="text-[10px] uppercase text-gray-500 hover:text-white">Home</button>
                    </div>
                </div>
            </header>

            <main className="relative z-10 max-w-7xl mx-auto px-4 py-8 space-y-8">
                <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
                    <h2 className="text-2xl font-bold font-[var(--font-orbitron)] text-pagani-gold">System Pipeline</h2>
                    <p className="text-xs text-gray-500 mt-2 uppercase tracking-widest">Live Infrastructure · Node Status · Event Log</p>
                </motion.div>

                {/* Health Cards */}
                {health && (
                    <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={1} className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-[#111] border border-white/10 rounded-xl p-4 text-center">
                            <div className="text-[10px] uppercase text-gray-500 mb-1">Status</div>
                            <div className={`text-xl font-bold font-[var(--font-orbitron)] ${health.status === 'healthy' ? 'text-green-500' : 'text-red-500'}`}>{(health.status || 'UNKNOWN').toUpperCase()}</div>
                        </div>
                        <div className="bg-[#111] border border-white/10 rounded-xl p-4 text-center">
                            <div className="text-[10px] uppercase text-gray-500 mb-1">Database</div>
                            <div className={`text-xl font-bold font-[var(--font-orbitron)] ${health.database === 'connected' ? 'text-blue-400' : 'text-red-500'}`}>{(health.database || 'UNKNOWN').toUpperCase()}</div>
                        </div>
                        <div className="bg-[#111] border border-white/10 rounded-xl p-4 text-center">
                            <div className="text-[10px] uppercase text-gray-500 mb-1">Vector Store</div>
                            <div className={`text-xl font-bold font-[var(--font-orbitron)] ${health.vector_store_initialized ? 'text-pagani-gold' : 'text-red-500'}`}>{health.vector_store_initialized ? 'READY' : 'OFFLINE'}</div>
                        </div>
                        <div className="bg-[#111] border border-white/10 rounded-xl p-4 text-center">
                            <div className="text-[10px] uppercase text-gray-500 mb-1">Uptime</div>
                            <div className="text-xl font-bold text-white font-[var(--font-orbitron)]">{health.uptime}</div>
                        </div>
                    </motion.div>
                )}

                {/* Animated Node Diagram */}
                <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={2}
                    className="bg-[#111] border border-white/10 rounded-xl p-6 shadow-2xl backdrop-blur-md">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-6 border-b border-white/10 pb-2">
                        Pipeline Node Map
                        <span className="text-[9px] text-gray-500 ml-2 normal-case">(click node for details · polls every 5s)</span>
                    </h3>
                    <div className="grid grid-cols-4 gap-4">
                        {PIPELINE_NODES.map((node, i) => {
                            const ns = pipelineStatus[node.id];
                            const status = ns?.status || "idle";
                            return (
                                <div key={node.id} className="relative">
                                    <motion.button
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: i * 0.05 }}
                                        onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                                        className={`w-full relative bg-black/60 border-2 rounded-lg p-3 text-center transition-all hover:bg-white/5 cursor-pointer ${getNodeColor(status)} ${selectedNode === node.id ? "ring-2 ring-pagani-gold" : ""}`}
                                    >
                                        <div className="text-lg mb-1">{node.icon}</div>
                                        <div className="text-[9px] text-white/80 uppercase tracking-wider font-bold">{node.label}</div>
                                        <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                                            <div className={`w-2 h-2 rounded-full ${getNodeDotColor(status)}`} />
                                        </div>
                                        {ns?.last_run_ms ? (
                                            <div className="text-[8px] text-white/30 mt-1">{ns.last_run_ms}ms</div>
                                        ) : null}
                                    </motion.button>
                                    
                                    {/* Horizontal Flow Arrow */}
                                    {node.col < 3 && PIPELINE_NODES.some(n => n.row === node.row && n.col === node.col + 1) && (
                                        <div className="absolute top-1/2 -right-4 w-4 h-[2px] -translate-y-1/2 overflow-hidden z-10 pointer-events-none hidden sm:block">
                                            <div className={`w-[200%] h-full bg-[linear-gradient(90deg,transparent_50%,rgba(212,175,55,0.7)_50%)] bg-[length:6px_2px] ${status === 'running' ? 'opacity-100 animate-[flow-h_0.3s_linear_infinite]' : 'opacity-30'}`} />
                                        </div>
                                    )}
                                    
                                    {/* Vertical Flow Simulation (End of row) */}
                                    {node.col === 3 && PIPELINE_NODES.some(n => n.row === node.row + 1) && (
                                        <div className="absolute -bottom-4 left-1/2 w-[2px] h-4 -translate-x-1/2 overflow-hidden z-10 pointer-events-none hidden sm:block">
                                            <div className={`w-full h-[200%] bg-[linear-gradient(180deg,transparent_50%,rgba(212,175,55,0.7)_50%)] bg-[length:2px_6px] ${status === 'running' ? 'opacity-100 animate-[flow-v_0.3s_linear_infinite]' : 'opacity-30'}`} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Node Detail Sidebar */}
                    {selectedNode && selectedNodeDef && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-4 bg-black/60 border border-white/10 rounded-lg p-4"
                        >
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-2xl">{selectedNodeDef.icon}</span>
                                <div>
                                    <div className="text-sm font-bold text-white">{selectedNodeDef.label}</div>
                                    <div className="text-[10px] text-gray-500 uppercase">{selectedNode}</div>
                                </div>
                                <button onClick={() => setSelectedNode(null)} className="ml-auto text-gray-500 hover:text-white text-xs">✕</button>
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-center">
                                <div>
                                    <div className="text-[9px] text-gray-500 uppercase">Status</div>
                                    <div className={`text-sm font-bold ${selectedNodeData?.status === "running" ? "text-blue-400" : selectedNodeData?.status === "done" ? "text-green-500" : "text-gray-400"}`}>
                                        {selectedNodeData?.status || "idle"}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[9px] text-gray-500 uppercase">Last Run</div>
                                    <div className="text-sm font-bold text-white/60">{selectedNodeData?.last_run_ms || 0}ms</div>
                                </div>
                                <div>
                                    <div className="text-[9px] text-gray-500 uppercase">Last Active</div>
                                    <div className="text-[10px] text-white/40">
                                        {selectedNodeData?.last_run_at ? new Date(selectedNodeData.last_run_at).toLocaleTimeString() : "Never"}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </motion.div>

                {/* Audit Event Log */}
                <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={3} className="bg-[#111] border border-white/10 rounded-xl p-6 shadow-2xl backdrop-blur-md">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Pipeline Event Log (Latest)</h3>
                    <div className="space-y-2">
                        {logs.length === 0 && (
                            <div className="text-center text-gray-500 py-6 text-xs uppercase tracking-widest">No audit events recorded yet.</div>
                        )}
                        {logs.map((log, i) => (
                            <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white/5 border border-white/10 p-3 rounded-lg font-mono text-[10px]">
                                <div className="flex gap-4 items-center">
                                    <span className="text-pagani-gold">{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : "—"}</span>
                                    <span className="text-blue-400 uppercase w-28 truncate">{log.action}</span>
                                    <span className="text-gray-400 hidden sm:block max-w-[300px] truncate">{JSON.stringify(log.metadata)}</span>
                                </div>
                                <span className="text-gray-600 mt-2 sm:mt-0">User: {log.user_id || 'System'}</span>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </main>
        </div>
    );
}