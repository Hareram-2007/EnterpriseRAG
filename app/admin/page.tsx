"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, type Variants } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { getUser, type UserInfo } from "@/lib/auth";

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] },
    }),
};

interface UserObj {
    username: string;
    role: string;
    created_at: string;
}

export default function AdminPage() {
    const router = useRouter();
    const [user, setUser] = useState<UserInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [adminKey, setAdminKey] = useState("");
    const [gatePassed, setGatePassed] = useState(false);
    const [activeTab, setActiveTab] = useState("Roles");
    const TABS = ["Roles", "Review Queue", "Stress Test", "Reports", "Audit Logs"];

    const [users, setUsers] = useState<UserObj[]>([]);
    const [rolesAudit, setRolesAudit] = useState<any[]>([]);

    useEffect(() => {
        (async () => {
            try {
                const me = await getUser();
                if (me.role !== "admin") {
                    router.replace("/");
                    return;
                }
                setUser(me);

                // Fetch data independently — don't let one failure crash everything
                try {
                    const usersData = await apiFetch<{ users: UserObj[] }>("/api/v1/admin/users");
                    setUsers(usersData.users);
                } catch { /* users endpoint may fail silently */ }

                try {
                    const auditData = await apiFetch<{ audit_logs: any[] }>("/api/v1/admin/roles/audit");
                    setRolesAudit(auditData.audit_logs || []);
                } catch { /* audit endpoint may fail silently */ }
            } catch {
                router.replace("/");
            } finally {
                setLoading(false);
            }
        })();
    }, [router]);

    const changeRole = async (username: string, newRole: string) => {
        try {
            await apiFetch(`/api/v1/admin/users/${username}/role`, {
                method: "PUT",
                body: JSON.stringify({ new_role: newRole })
            });
            setUsers(prev => prev.map(u => u.username === username ? { ...u, role: newRole } : u));
        } catch (err) {
            console.error(err);
        }
    };

    const deleteUser = async (username: string) => {
        if (!confirm(`Are you sure you want to completely remove user ${username}? This cannot be undone.`)) return;
        try {
            await apiFetch(`/api/v1/admin/users/${username}`, { method: "DELETE" });
            setUsers(prev => prev.filter(u => u.username !== username));
        } catch (err) {
            console.error(err);
            alert("Failed to delete user.");
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                    className="w-10 h-10 border-2 border-pagani-gold/30 border-t-pagani-gold rounded-full"
                />
            </div>
        );
    }
    if (!user) return null;

    return (
        <div className="min-h-screen relative text-white bg-[#0A0A0A] overflow-hidden">
            {/* Background Effects */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[#D4AF37]/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#2A2A2A]/40 rounded-full blur-[100px]" />
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')] opacity-20 mix-blend-overlay" />
            </div>

            {/* Top Bar */}
            <header className="sticky top-0 z-50 backdrop-blur-2xl border-b border-white/10 bg-[#0A0A0A]/60">
                <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
                    <h1 className="text-sm font-bold tracking-tighter uppercase text-white font-[var(--font-orbitron)]">
                        Pagani <span className="text-pagani-gold">Admin</span>
                    </h1>
                    <div className="flex items-center gap-4">
                        <span className="text-xs">{user.username}</span>
                        <button onClick={() => router.replace("/dashboard/admin")} className="text-[10px] uppercase text-gray-500 hover:text-white">Dashboard</button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="relative z-10 max-w-7xl mx-auto px-4 py-8">
                {!gatePassed ? (
                    <div className="max-w-md mx-auto mt-20">
                        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0} className="bg-[#111] border border-white/10 rounded-xl p-8 shadow-2xl backdrop-blur-md text-center">
                            <div className="w-12 h-12 mx-auto mb-4 bg-pagani-gold/20 flex items-center justify-center rounded-full text-pagani-gold text-2xl">🔒</div>
                            <h2 className="text-xl font-bold font-[var(--font-orbitron)] text-white mb-2">Admin Terminal</h2>
                            <p className="text-xs text-gray-500 uppercase tracking-widest mb-6">Enter X-Admin-Key to proceed</p>
                            <form onSubmit={(e) => { e.preventDefault(); if (adminKey) setGatePassed(true); }} className="flex gap-2 justify-center">
                                <input type="password" value={adminKey} onChange={e => setAdminKey(e.target.value)} className="bg-black border border-white/20 rounded px-4 py-2 text-sm text-white outline-none focus:border-pagani-gold w-full" placeholder="Secure Key..." />
                                <button type="submit" className="bg-pagani-gold text-black uppercase tracking-widest text-[10px] font-bold px-4 rounded hover:bg-[#b0902c] transition-colors">Auth</button>
                            </form>
                        </motion.div>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {/* Tab Bar */}
                        <div className="flex gap-2 border-b border-white/10 mx-auto overflow-x-auto hidden-scrollbar">
                            {TABS.map(t => (
                                <button
                                    key={t}
                                    onClick={() => setActiveTab(t)}
                                    className={`px-4 py-3 text-xs uppercase tracking-widest font-bold whitespace-nowrap transition-colors border-b-2 ${activeTab === t ? "text-pagani-gold border-pagani-gold" : "text-gray-500 border-transparent hover:text-white"}`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>

                        {activeTab === "Roles" && (
                            <>
                                <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
                                    <h2 className="text-2xl font-bold font-[var(--font-orbitron)] text-pagani-gold">Role Management</h2>
                                    <p className="text-xs text-gray-500 mt-2 uppercase tracking-widest">Enterprise Access Control</p>
                                </motion.div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={1} className="bg-[#111] border border-white/10 rounded-xl p-6 shadow-2xl backdrop-blur-md">
                                        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Users ({users.length})</h3>
                                        <div className="space-y-3">
                                            {users.map((u) => (
                                                <div key={u.username} className="flex items-center justify-between bg-white/5 border border-white/10 p-3 rounded-lg hover:border-pagani-gold/50 transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-pagani-gold/20 flex items-center justify-center text-pagani-gold font-bold uppercase">{u.username[0]}</div>
                                                        <div>
                                                            <div className="text-xs font-bold text-white">{u.username}</div>
                                                            <div className="text-[10px] text-gray-500">Joined: {new Date(u.created_at).toLocaleDateString()}</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <select
                                                            value={u.role}
                                                            onChange={(e) => changeRole(u.username, e.target.value)}
                                                            disabled={user?.username === u.username}
                                                            className="bg-black border border-white/20 text-xs text-white rounded p-1 outline-none focus:border-pagani-gold disabled:opacity-50"
                                                        >
                                                            <option value="viewer">Viewer</option>
                                                            <option value="engineer">Engineer</option>
                                                            <option value="admin">Admin</option>
                                                        </select>
                                                        <button
                                                            onClick={() => deleteUser(u.username)}
                                                            disabled={user?.username === u.username}
                                                            className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors text-[10px] px-2 py-1 rounded border border-red-500/20 uppercase tracking-wider font-bold disabled:opacity-20 disabled:hover:bg-red-500/10 disabled:hover:text-red-500"
                                                            title="Remove User"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>

                                    <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={2} className="bg-[#111] border border-white/10 rounded-xl p-6 shadow-2xl backdrop-blur-md">
                                        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Role Audit Log</h3>
                                        <div className="space-y-3 max-h-[500px] overflow-y-auto hidden-scrollbar">
                                            {rolesAudit.map((log, i) => (
                                                <div key={i} className="bg-white/5 border border-white/10 p-3 rounded-lg">
                                                    <div className="flex items-center justify-between">
                                                        <div className="text-xs text-gray-400">Changed <span className="text-white font-bold">{log.target_user}</span></div>
                                                        <div className="text-[10px] text-gray-600">{new Date(log.timestamp).toLocaleString()}</div>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-2 text-[10px]">
                                                        <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded uppercase">{log.old_role}</span>
                                                        <span className="text-white">→</span>
                                                        <span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded uppercase">{log.new_role}</span>
                                                    </div>
                                                    <div className="text-[9px] text-gray-500 mt-2 uppercase">By Admin: {log.changed_by}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                </div>
                            </>
                        )}

                        {activeTab !== "Roles" && (
                            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="bg-[#111] border border-white/10 rounded-xl p-12 text-center">
                                <span className="text-4xl block mb-4">🚧</span>
                                <h3 className="text-lg font-bold font-[var(--font-orbitron)] text-pagani-gold mb-2 uppercase">{activeTab} Module </h3>
                                <p className="text-xs text-gray-500 uppercase tracking-widest max-w-sm mx-auto">This diagnostic and management module is currently under development.</p>
                            </motion.div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}