"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";

type IgnitionState = "idle" | "igniting" | "video" | "transitioning" | "hero" | "complete";

export default function IgnitionExperience({ onComplete }: { onComplete: () => void }) {
    const [state, setState] = useState<IgnitionState>("idle");
    const videoRef = useRef<HTMLVideoElement>(null);

    const handleIgnite = () => {
        setState("igniting");
        setTimeout(() => {
            setState("video");
            if (videoRef.current) {
                videoRef.current.play().catch(e => console.error("Video play failed:", e));
            }
        }, 400); // Wait for the click compression and burst animation
    };

    const handleVideoEnded = () => {
        setState("transitioning");
        setTimeout(() => {
            setState("hero");
        }, 500); // Crossfade duration
    };

    const handleEnterExperience = () => {
        setState("complete");
        setTimeout(() => {
            onComplete();
        }, 1000); // Fade out duration
    };

    return (
        <motion.div
            className="fixed inset-0 z-[100] bg-black overflow-hidden select-none"
            initial={{ opacity: 1 }}
            animate={{ opacity: state === "complete" ? 0 : 1 }}
            transition={{ duration: 1, ease: "easeInOut" }}
        >
            {/* State 1: Ignition Button */}
            <AnimatePresence>
                {(state === "idle" || state === "igniting") && (
                    <motion.div
                        className="absolute inset-0 flex items-center justify-center bg-black"
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        {/* Subtle carbon fiber texture background */}
                        <div
                            className="absolute inset-0 opacity-[0.05] pointer-events-none mix-blend-overlay"
                            style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 20h20v20H20V20zm-20 0h20v20H0V20zm20-20h20v20H20V0zM0 0h20v20H0V0z' fill='%23ffffff' fill-opacity='1' fill-rule='evenodd'/%3E%3C/svg%3E")`,
                                backgroundSize: '4px 4px'
                            }}
                        />

                        {/* Soft radial light halo behind button */}
                        <motion.div
                            className="absolute w-[300px] h-[300px] rounded-full bg-[#D4AF37]/10 blur-[80px]"
                            animate={{
                                scale: [1, 1.2, 1],
                                opacity: [0.3, 0.6, 0.3]
                            }}
                            transition={{
                                duration: 3,
                                repeat: Infinity,
                                ease: "easeInOut"
                            }}
                        />

                        {/* Click Burst Effect */}
                        {state === "igniting" && (
                            <>
                                <motion.div
                                    className="absolute w-full h-[2px] bg-red-600/80 shadow-[0_0_20px_rgb(220,38,38)]"
                                    initial={{ scaleX: 0, opacity: 1 }}
                                    animate={{ scaleX: 2, opacity: 0 }}
                                    transition={{ duration: 0.6, ease: "easeOut" }}
                                />
                                <motion.div
                                    className="absolute w-[100px] h-[100px] rounded-full bg-[#D4AF37]/80 blur-[20px]"
                                    initial={{ scale: 1, opacity: 1 }}
                                    animate={{ scale: 8, opacity: 0 }}
                                    transition={{ duration: 0.5, ease: "easeOut" }}
                                />
                            </>
                        )}

                        <motion.button
                            onClick={handleIgnite}
                            disabled={state === "igniting"}
                            className={`relative flex items-center justify-center w-[160px] h-[160px] rounded-full bg-[#111] border-[1px] border-[#D4AF37]/40 shadow-[0_0_30px_rgba(212,175,55,0.1),inset_0_0_20px_rgba(0,0,0,0.8)] group transition-all duration-300 ${state === "igniting" ? "pointer-events-none" : ""}`}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            animate={state === "igniting" ? { scale: 0.95 } : {}}
                        >
                            {/* Gold glow leaking from behind */}
                            <div className="absolute inset-[-1px] rounded-full border border-[#D4AF37]/0 group-hover:border-[#D4AF37]/80 group-hover:shadow-[0_0_40px_rgba(212,175,55,0.5)] transition-all duration-300" />

                            <span
                                className="font-bold text-2xl tracking-[0.3em] ml-[0.3em] uppercase bg-gradient-to-b from-[#FFF2B2] via-[#D4AF37] to-[#997A15] text-transparent bg-clip-text drop-shadow-[0_0_10px_rgba(212,175,55,0.5)] group-hover:brightness-125 transition-all duration-300"
                                style={{ fontFamily: "var(--font-orbitron)" }}
                            >
                                Ignite
                            </span>

                            {/* Sparks inside button area on hover */}
                            <div className="absolute inset-0 rounded-full overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-100">
                                <div className="w-[2px] h-[2px] bg-white absolute top-4 left-10 rounded-full shadow-[0_0_5px_white] animate-[spark_0.3s_infinite]" />
                                <div className="w-[3px] h-[2px] bg-[#D4AF37] absolute bottom-6 right-8 rounded-full shadow-[0_0_6px_#D4AF37] animate-[spark_0.4s_infinite_0.1s]" />
                                <div className="w-[2px] h-[3px] bg-white absolute top-20 left-4 rounded-full shadow-[0_0_6px_white] animate-[spark_0.2s_infinite_0.2s]" />
                                <div className="w-[2px] h-[2px] bg-[#D4AF37] absolute bottom-8 left-20 rounded-full shadow-[0_0_5px_#D4AF37] animate-[spark_0.5s_infinite_0.05s]" />
                            </div>
                        </motion.button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* State 2 & 3: Video Playing and Transition */}
            <div
                className={`absolute inset-0 flex items-center justify-center bg-black transition-opacity duration-500 ${(state === "video" || state === "transitioning") ? "opacity-100 z-10" : "opacity-0 pointer-events-none"}`}
            >
                <video
                    ref={videoRef}
                    src="/ignition-video.mp4"
                    className="w-full h-full object-cover"
                    onEnded={handleVideoEnded}
                    playsInline
                />
            </div>

            {/* State 4: Post-Ignition Hero */}
            <AnimatePresence>
                {state === "hero" && (
                    <motion.div
                        className="absolute inset-0 bg-black z-20"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                    >
                        {/* Hero Image */}
                        <Image
                            src="/hero-image.png"
                            alt="Pagani Zonda R"
                            fill
                            className="object-cover object-center opacity-90"
                            priority
                        />

                        {/* Gradient Overlay for Text Readability */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/80 pointer-events-none" />
                        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-black/80 pointer-events-none" />

                        {/* Top Right Navigation */}
                        <motion.div
                            className="absolute top-8 right-12 z-30 flex space-x-12 text-sm uppercase tracking-[0.2em] font-light"
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 1, duration: 0.8 }}
                        >
                            <Link href="/register" className="group relative text-white/80 hover:text-white transition-colors">
                                Sign Up
                                <span className="absolute -bottom-2 left-0 w-0 h-[1px] bg-[#D4AF37] group-hover:w-full transition-all duration-300" />
                            </Link>
                            <Link href="/login" className="group relative text-white/80 hover:text-white transition-colors">
                                Login
                                <span className="absolute -bottom-2 left-0 w-0 h-[1px] bg-[#D4AF37] group-hover:w-full transition-all duration-300" />
                            </Link>
                        </motion.div>

                        {/* Center Text */}
                        <motion.div
                            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-30"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.5, duration: 1.2, ease: "easeOut" }}
                        >
                            <h1
                                className="font-bold text-6xl md:text-8xl lg:text-9xl tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 drop-shadow-2xl translate-x-[0.1em]"
                                style={{ fontFamily: "var(--font-orbitron)" }}
                            >
                                PAGANI
                            </h1>
                            <h2
                                className="font-semibold text-3xl md:text-5xl lg:text-6xl tracking-[0.3em] text-[#D4AF37] mt-4 drop-shadow-[0_0_20px_rgba(212,175,55,0.4)] translate-x-[0.15em]"
                                style={{ fontFamily: "var(--font-orbitron)" }}
                            >
                                ZONDA R
                            </h2>
                            <div className="mt-12 flex flex-col items-center space-y-4">
                                <p
                                    className="text-lg md:text-xl text-gray-300 tracking-[0.3em] uppercase font-light"
                                    style={{ fontFamily: "var(--font-rajdhani)" }}
                                >
                                    Track-Focused Hypercar
                                </p>
                                <div className="w-16 h-[1px] bg-[#D4AF37]/50" />
                                <p
                                    className="text-sm md:text-base text-gray-400 tracking-[0.2em] uppercase"
                                    style={{ fontFamily: "var(--font-rajdhani)" }}
                                >
                                    Limited to 15 Units
                                </p>
                            </div>
                        </motion.div>

                        {/* Right side floating specs panel */}
                        <motion.div
                            className="absolute top-1/2 -translate-y-1/2 right-8 md:right-16 w-64 bg-black/30 backdrop-blur-md border border-[#D4AF37]/20 p-8 rounded-sm shadow-[0_0_40px_rgba(0,0,0,0.8)] z-30"
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 1.2, duration: 0.8, ease: "easeOut" }}
                        >
                            <div
                                className="flex flex-col space-y-8 uppercase tracking-[0.15em]"
                                style={{ fontFamily: "var(--font-rajdhani)" }}
                            >
                                <div>
                                    <div className="text-gray-500 text-[10px] tracking-[0.2em] mb-1">Engine</div>
                                    <div className="text-[#D4AF37] text-xl font-medium">6.0L AMG V12</div>
                                </div>
                                <div className="w-8 h-[1px] bg-white/10" />
                                <div>
                                    <div className="text-gray-500 text-[10px] tracking-[0.2em] mb-1">Power</div>
                                    <div className="text-white text-2xl font-light">750 HP</div>
                                </div>
                                <div className="w-8 h-[1px] bg-white/10" />
                                <div>
                                    <div className="text-gray-500 text-[10px] tracking-[0.2em] mb-1">Torque</div>
                                    <div className="text-white text-2xl font-light">710 Nm</div>
                                </div>
                            </div>
                        </motion.div>

                        {/* Left side button */}
                        <motion.div
                            className="absolute top-1/2 -translate-y-1/2 left-8 md:left-16 z-30"
                            initial={{ opacity: 0, x: -50 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 1.2, duration: 0.8, ease: "easeOut" }}
                        >
                            <button
                                onClick={handleEnterExperience}
                                className="group flex flex-col items-start space-y-2 cursor-pointer"
                            >
                                <div className="relative w-16 h-[1px] bg-[#D4AF37]/50 group-hover:w-full group-hover:bg-[#D4AF37] transition-all duration-500" />
                                <span
                                    className="uppercase tracking-[0.2em] text-white/80 group-hover:text-white transition-colors duration-500 text-sm"
                                    style={{ fontFamily: "var(--font-rajdhani)" }}
                                >
                                    Enter Experience
                                </span>
                                <div className="relative w-full h-[1px] bg-transparent group-hover:bg-[#D4AF37]/50 transition-all duration-500 delay-100" />
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style>{`
        @keyframes spark {
          0%, 100% { opacity: 0; transform: scale(0.5); box-shadow: 0 0 2px white; }
          50% { opacity: 1; transform: scale(1.5); box-shadow: 0 0 8px white; }
        }
      `}</style>
        </motion.div>
    );
}
