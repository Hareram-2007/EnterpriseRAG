"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { login } from "@/lib/auth";

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            const data = await login(username, password);
            // Role-based redirect
            if (data.role === "admin") {
                router.push("/dashboard/admin");
            } else if (data.role === "engineer") {
                router.push("/dashboard/engineer");
            } else {
                router.push("/");
            }
        } catch (err: unknown) {
            setError(
                err instanceof Error ? err.message : "Login failed. Please try again."
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-pagani-black flex items-center justify-center px-4">
            {/* Background accent */}
            <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(212,175,55,0.05)_0%,_transparent_60%)]" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="relative z-10 w-full max-w-md"
            >
                {/* Logo */}
                <div className="text-center mb-10">
                    <h1
                        className="text-3xl font-bold tracking-tighter uppercase text-white"
                        style={{ fontFamily: "var(--font-orbitron)" }}
                    >
                        Pagani <span className="text-pagani-gold">Intelligence</span>
                    </h1>
                    <p className="text-xs text-gray-500 tracking-[0.3em] uppercase mt-2">
                        Enterprise Access Portal
                    </p>
                </div>

                {/* Form Card */}
                <div
                    className="p-8 rounded-2xl"
                    style={{
                        background:
                            "linear-gradient(145deg, rgba(42,42,42,0.6) 0%, rgba(26,26,26,0.9) 100%)",
                        border: "1px solid rgba(212,175,55,0.15)",
                        boxShadow: "0 0 40px rgba(0,0,0,0.4)",
                    }}
                >
                    <h2
                        className="text-lg font-bold text-white tracking-[0.1em] uppercase mb-6"
                        style={{ fontFamily: "var(--font-orbitron)" }}
                    >
                        Sign In
                    </h2>

                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
                        >
                            {error}
                        </motion.div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                                Username
                            </label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                minLength={3}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-pagani-gold/40 transition-colors placeholder-gray-600"
                                placeholder="Enter your username"
                                style={{ fontFamily: "var(--font-rajdhani)" }}
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-pagani-gold/40 transition-colors placeholder-gray-600"
                                placeholder="Enter your password"
                                style={{ fontFamily: "var(--font-rajdhani)" }}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 bg-pagani-gold/15 border border-pagani-gold/40 text-pagani-gold text-sm font-bold tracking-[0.15em] uppercase rounded-lg hover:bg-pagani-gold hover:text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ fontFamily: "var(--font-orbitron)" }}
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg
                                        className="animate-spin h-4 w-4"
                                        viewBox="0 0 24 24"
                                    >
                                        <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                            fill="none"
                                        />
                                        <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                        />
                                    </svg>
                                    Authenticating...
                                </span>
                            ) : (
                                "Sign In"
                            )}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-gray-500 text-sm">
                            No account?{" "}
                            <a
                                href="/register"
                                className="text-pagani-gold hover:text-bright-gold transition-colors"
                            >
                                Register
                            </a>
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-gray-700 text-[10px] mt-8 tracking-wider uppercase">
                    © {new Date().getFullYear()} Pagani Automobili. Enterprise System.
                </p>
            </motion.div>
        </main>
    );
}
