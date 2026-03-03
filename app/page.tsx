"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useScroll } from "framer-motion";
import ZondaScrollCanvas from "@/components/ZondaScrollCanvas";
import ZondaExperience from "@/components/ZondaExperience";
import Navbar from "@/components/Navbar";
import ChatAssistant from "@/components/ChatAssistant";
import IgnitionExperience from "@/components/IgnitionExperience";
import { getStoredUser, isAuthenticated } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [showIgnition, setShowIgnition] = useState(true);

  const [authState, setAuthState] = useState<{
    authenticated: boolean;
    role: string | null;
    isChecked: boolean;
  }>({ authenticated: false, role: null, isChecked: false });

  // Prevent background scrolling while ignition experience is active
  useEffect(() => {
    if (showIgnition) {
      document.body.style.overflow = "hidden";
      window.scrollTo(0, 0);
    } else {
      document.body.style.overflow = "";
    }
  }, [showIgnition]);

  useEffect(() => {
    const checkAuthStatus = () => {
      const authed = isAuthenticated();
      const user = getStoredUser();
      setAuthState({
        authenticated: authed,
        role: user?.role || null,
        isChecked: true,
      });
    };
    checkAuthStatus();
    window.addEventListener("storage", checkAuthStatus);
    return () => window.removeEventListener("storage", checkAuthStatus);
  }, []);

  // Handle authenticated routing after ignition
  useEffect(() => {
    // We only want to handle the auto-redirect if the ignition sequence is complete,
    // so that the cinematic video is not interrupted for any reason.
    if (!showIgnition && authState.isChecked) {
      if (authState.authenticated) {
        if (authState.role === "admin") {
          router.push("/dashboard/admin");
        } else if (authState.role === "engineer") {
          router.push("/dashboard/engineer");
        }
        // Viewers stay on this page to see the 3D scroll sequence
      }
    }
  }, [showIgnition, authState, router]);

  // Initial Check: If a user navigates directly to "/" and is already logged in, 
  // we still want to show them the ignition video first.
  // The ignition logic defaults to true, so they will see it.

  return (
    <main className="bg-pagani-black min-h-screen text-white selection:bg-pagani-gold selection:text-black">
      {showIgnition && <IgnitionExperience onComplete={() => setShowIgnition(false)} />}

      <div className={showIgnition ? "pointer-events-none opacity-0" : "transition-opacity duration-1000 opacity-100"}>
        <Navbar onInquireClick={() => setIsChatOpen(true)} />

        {/* MAIN CONTENT VIEW */}
        {!authState.isChecked ? (
          <div className="min-h-screen bg-pagani-black" />
        ) : !authState.authenticated ? (
          <section className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-pagani-black">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(212,175,55,0.05)_0%,_transparent_60%)]" />
            <h1 className="text-5xl md:text-7xl font-bold tracking-tighter uppercase text-white mb-6 z-10" style={{ fontFamily: "var(--font-orbitron)" }}>
              Pagani <span className="text-pagani-gold">Intelligence</span>
            </h1>
            <p className="text-sm text-gray-400 tracking-[0.3em] uppercase mb-12 z-10 text-center max-w-md">
              Enterprise Access Portal
            </p>
            <div className="flex gap-6 z-10">
              <a href="/register" className="px-8 py-3 bg-pagani-gold/10 border border-pagani-gold/40 text-pagani-gold font-bold tracking-[0.15em] uppercase hover:bg-pagani-gold hover:text-black transition-all" style={{ fontFamily: "var(--font-orbitron)" }}>Sign Up</a>
              <a href="/login" className="px-8 py-3 bg-white/5 border border-white/20 text-white font-bold tracking-[0.15em] uppercase hover:bg-white hover:text-black transition-all" style={{ fontFamily: "var(--font-orbitron)" }}>Login</a>
            </div>
          </section>
        ) : authState.role !== "viewer" ? (
          <div className="min-h-screen bg-pagani-black flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-pagani-gold/30 border-t-pagani-gold rounded-full animate-spin"></div>
          </div>
        ) : (
          <ViewerScrollSequence />
        )}

        {/* AI Assistant */}
        <ChatAssistant
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
        />

        {/* Floating AI Button */}
        {!isChatOpen && (
          <button
            onClick={() => setIsChatOpen(true)}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-110"
            style={{
              background:
                "linear-gradient(135deg, rgba(212,175,55,0.2) 0%, rgba(212,175,55,0.05) 100%)",
              border: "1px solid rgba(212,175,55,0.35)",
              boxShadow: "0 0 30px rgba(212,175,55,0.1)",
            }}
            aria-label="Open AI Assistant"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#D4AF37"
              strokeWidth="1.5"
            >
              <path d="M12 2a10 10 0 0110 10c0 5.523-4.477 10-10 10a10 10 0 01-8.94-5.526L2 22l2.526-5.06A10 10 0 0112 2z" />
              <path d="M8 10h8M8 14h5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </main>
  );
}

function ViewerScrollSequence() {
  const containerRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  return (
    <>
      {/* SCROLL SEQUENCE (Locked for 600vh) */}
      <section ref={containerRef} className="h-[600vh] relative">
        <div className="sticky top-0 h-screen w-full overflow-hidden">
          {/* Background Canvas */}
          <div className="absolute inset-0 z-0">
            <ZondaScrollCanvas scrollYProgress={scrollYProgress} />
          </div>

          {/* HUD Overlay */}
          <div className="absolute inset-0 z-10">
            <ZondaExperience scrollYProgress={scrollYProgress} />
          </div>
        </div>
      </section>

      {/* REST OF SITE */}
      <div className="relative z-20 bg-pagani-black border-t border-white/10">
        <SpecsGrid />
        <Features />
        <Footer />
      </div>
    </>
  );
}

// Placeholders / Sub-sections
function SpecsGrid() {
  return (
    <section className="py-24 px-8 md:px-20 border-b border-white/10 bg-pagani-black">
      <h3 className="text-4xl uppercase font-bold mb-12 text-white/90">Technical Specifications</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {[
          { label: "Engine", value: "Mercedes-Benz AMG V12" },
          { label: "Displacement", value: "5987 cc" },
          { label: "Power", value: "750 hp @ 7,500 rpm" },
          { label: "Torque", value: "710 Nm @ 5,700 rpm" },
          { label: "Weight", value: "1,070 kg" },
          { label: "0-100 km/h", value: "2.7 sec" },
          { label: "Max Speed", value: "> 350 km/h" },
          { label: "Production", value: "15 units" },
        ].map((item, i) => (
          <div key={i} className="border-t border-pagani-gold/30 pt-4 hover:border-pagani-gold transition-colors duration-300">
            <div className="text-pagani-gold text-sm uppercase tracking-wider mb-1">{item.label}</div>
            <div className="text-xl md:text-2xl font-light">{item.value}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Features() {
  return (
    <section className="min-h-screen flex items-center justify-center border-b border-white/10 bg-carbon-gray/10 relative overflow-hidden">
      {/* Abstract background element */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#1a1a1a_100%)] opacity-80" />

      <div className="max-w-5xl text-center relative z-10 px-6">
        <h3 className="text-5xl md:text-8xl font-bold uppercase mb-8 leading-none tracking-tighter">
          The Sound of <span className="text-pagani-gold block md:inline">Perfection</span>
        </h3>
        <p className="text-xl text-gray-400 font-light leading-relaxed max-w-2xl mx-auto">
          The Zonda R is the ultimate expression of the Zonda philosophy. A track-focused machine that knows no compromises, delivering an unfiltered driving experience.
        </p>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="py-12 px-8 md:px-20 text-center text-gray-600 text-xs uppercase tracking-widest bg-pagani-black">
      <p>&copy; {new Date().getFullYear()} Pagani Automobili. Tribute Project.</p>
    </footer>
  )
}
