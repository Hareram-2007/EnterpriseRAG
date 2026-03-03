"use client";

import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { useState, useEffect } from "react";
import { isAuthenticated, getStoredUser, logout } from "@/lib/auth";
import { useRouter } from "next/navigation";

interface NavbarProps {
    onInquireClick?: () => void;
}

export default function Navbar({ onInquireClick }: NavbarProps) {
    const { scrollY } = useScroll();
    const [hidden, setHidden] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [authState, setAuthState] = useState<{
        authenticated: boolean;
        username: string | null;
        role: string | null;
    }>({ authenticated: false, username: null, role: null });
    const router = useRouter();

    // Check auth state on mount and periodically
    useEffect(() => {
        const checkAuth = () => {
            const authed = isAuthenticated();
            const user = getStoredUser();
            setAuthState({
                authenticated: authed,
                username: user?.username || null,
                role: user?.role || null,
            });
        };

        checkAuth();
        // Listen for storage changes (login/logout in other tabs)
        window.addEventListener("storage", checkAuth);
        // Poll in case of same-tab changes
        const interval = setInterval(checkAuth, 2000);

        return () => {
            window.removeEventListener("storage", checkAuth);
            clearInterval(interval);
        };
    }, []);

    useMotionValueEvent(scrollY, "change", (latest) => {
        const previous = scrollY.getPrevious() ?? 0;
        if (latest > previous && latest > 150) {
            setHidden(true);
        } else {
            setHidden(false);
        }
        setScrolled(latest > 50);
    });

    const handleLogout = () => {
        logout();
        setAuthState({ authenticated: false, username: null, role: null });
        router.refresh();
    };

    return (
        <motion.nav
            variants={{
                visible: { y: 0 },
                hidden: { y: "-100%" },
            }}
            animate={hidden ? "hidden" : "visible"}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5 transition-colors duration-500 ${scrolled
                ? "bg-pagani-black/80 backdrop-blur-md border-b border-white/10"
                : "bg-transparent"
                }`}
        >
            {/* Logo */}
            <a href="/" className="text-2xl font-bold tracking-tighter uppercase text-white">
                Pagani <span className="text-pagani-gold">Zonda R</span>
            </a>

            {/* Right Actions */}
            <div className="flex items-center gap-4">
                {/* User Info */}
                {authState.authenticated && authState.username && (
                    <div className="hidden md:flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                            {authState.role}
                        </span>
                        <span className="text-xs text-white/70">
                            {authState.username}
                        </span>
                    </div>
                )}

                {/* INQUIRE Button */}
                <button
                    onClick={onInquireClick}
                    className="text-xs font-bold tracking-[0.2em] uppercase text-pagani-gold border border-pagani-gold/30 px-6 py-2 hover:bg-pagani-gold hover:text-black transition-all"
                    style={{ fontFamily: "var(--font-orbitron)" }}
                >
                    Inquire
                </button>

                {/* Auth Button */}
                {authState.authenticated ? (
                    <button
                        onClick={handleLogout}
                        className="hidden md:block text-xs font-bold tracking-[0.15em] uppercase text-gray-400 border border-white/10 px-5 py-2 hover:bg-white/10 hover:text-white transition-all"
                    >
                        Logout
                    </button>
                ) : (
                    <a
                        href="/register"
                        className="hidden md:block text-xs font-bold tracking-[0.15em] uppercase text-white border border-white/20 px-5 py-2 hover:bg-white hover:text-black transition-all"
                    >
                        Sign Up
                    </a>
                )}
            </div>
        </motion.nav>
    );
}
