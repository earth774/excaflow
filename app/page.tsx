"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";

import { supabase } from "@/lib/supabaseClient";
import { STRIPE_PRICE_ID } from "@/lib/stripeConfig";
import type { User } from "@supabase/supabase-js";

export default function LandingPage() {
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleCheckout = async (priceId: string) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        alert("Please sign in to upgrade.");
        window.location.href = "/login";
        return;
      }

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ priceId }),
      });

      const { url, error } = await response.json();

      if (error) {
        console.error("Error:", error);
        alert("Checkout failed: " + error);
        setLoading(false);
        return;
      }

      if (url) {
        window.location.href = url;
      } else {
        setLoading(false);
        alert("Failed to start checkout.");
      }
    } catch (err) {
      console.error("Checkout error:", err);
      alert("An unexpected error occurred.");
    } finally {
      // setLoading(false); // Don't reset loading if redirecting
    }
  };

  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#18181b] font-sans selection:bg-stone-200">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#faf9f6]/80 backdrop-blur-md border-b border-stone-100">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-stone-900 rounded-lg flex items-center justify-center text-white group-hover:bg-stone-800 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-lg font-medium tracking-tight text-stone-900">
              Excaflow
            </span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="#features" className="text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors hidden sm:block">
              Features
            </Link>
            <Link href="#pricing" className="text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors hidden sm:block">
              Pricing
            </Link>
            {user ? (
              <Link
                href="/dashboard"
                className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium rounded-full transition-all"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/login"
                className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium rounded-full transition-all"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-50 rounded-full mb-8 border border-yellow-100">
                <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                <span className="text-yellow-700 text-xs font-bold tracking-wide uppercase">The Missing Link in AI Development</span>
              </div>
              
              <h1 className="text-5xl sm:text-6xl font-bold leading-[1.1] mb-8 text-stone-900 tracking-tight">
                Visual-First <br />
                <span className="text-yellow-500">Specification Platform</span> <br />
                for the AI Era
              </h1>
              
              <p className="text-lg text-stone-600 mb-10 leading-relaxed max-w-md font-medium">
                Stop struggling with text prompts. Clarify your architecture visually, generate precise context, and let AI build exactly what you mean.
              </p>
              
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/signup"
                  className="px-8 py-4 bg-yellow-400 hover:bg-yellow-500 text-stone-900 font-bold rounded-full transition-all flex items-center gap-2 shadow-lg shadow-yellow-400/20 transform hover:-translate-y-1"
                >
                  Start Specifying
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </Link>
                <Link
                  href="#features"
                  className="px-8 py-4 bg-white border-2 border-stone-100 hover:border-yellow-400 text-stone-900 font-bold rounded-full transition-all"
                >
                  See How It Works
                </Link>
              </div>
            </div>
            
            <div className="relative">
              <div className="relative rounded-2xl overflow-hidden shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] border border-stone-100 bg-white">
                <div className="aspect-[4/3] relative">
                  <Image
                    src="/images/hero-preview-yellow.png"
                    alt="Excaflow Interface"
                    fill
                    className="object-cover"
                    priority
                  />
                </div>
              </div>
              {/* Decorative elements */}
              <div className="absolute -z-10 top-10 -right-10 w-full h-full bg-yellow-100 rounded-3xl"></div>
              <div className="absolute -z-20 -bottom-10 -left-10 w-64 h-64 bg-yellow-50 rounded-full blur-3xl"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6 bg-white relative overflow-hidden">
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-20 max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold mb-4 text-stone-900">
              From Mental Model to AI Execution
            </h2>
            <p className="text-stone-500 text-lg font-medium">
              Bridge the gap between your idea and the code AI writes.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "Clarify Complex Logic",
                desc: "Draw your system architecture, data flows, and UI layouts. Clear your mind before writing a single line of code.",
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                )
              },
              {
                title: "Generate AI Prompts",
                desc: "Export your diagrams as structured context. Give LLMs the visual understanding they lack to generate accurate code.",
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                  </svg>
                )
              },
              {
                title: "Bridge the Gap",
                desc: "Iterate on your specs visually. Ensure your AI assistant understands the big picture, not just the syntax.",
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
                  </svg>
                )
              }
            ].map((feature, i) => (
              <div key={i} className="group p-8 rounded-3xl bg-stone-50 border border-transparent hover:border-yellow-400 hover:bg-white hover:shadow-xl hover:shadow-yellow-400/10 transition-all duration-300">
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-yellow-500 mb-6 shadow-sm group-hover:scale-110 group-hover:bg-yellow-400 group-hover:text-stone-900 transition-all duration-300">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-stone-900 mb-3">{feature.title}</h3>
                <p className="text-stone-500 leading-relaxed font-medium">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-6 bg-stone-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-3xl font-bold mb-4 text-stone-900">
              Simple, Transparent Pricing
            </h2>
            <p className="text-stone-500 text-lg font-medium">
              Start for free, upgrade when you need more power.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Plan */}
            <div className="bg-white p-10 rounded-3xl border border-stone-200 shadow-sm flex flex-col hover:border-yellow-400 transition-colors duration-300">
              <div className="mb-8">
                <h3 className="text-xl font-bold text-stone-900 mb-2">Free</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-stone-900">$0</span>
                  <span className="text-stone-500 font-medium">/month</span>
                </div>
                <p className="text-stone-500 mt-4 font-medium">Essential tools for casual creators.</p>
              </div>
              
              <ul className="space-y-4 mb-10 flex-1">
                {[
                  "Up to 5 boards",
                  "Basic AI generation",
                  "Cloud sync",
                  "2 devices"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-stone-600 font-medium">
                    <div className="w-5 h-5 rounded-full bg-stone-100 flex items-center justify-center">
                      <svg className="w-3 h-3 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    {item}
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                className="block w-full py-4 px-6 text-center bg-stone-100 hover:bg-stone-200 text-stone-900 font-bold rounded-2xl transition-colors"
              >
                Get Started
              </Link>
            </div>

            {/* Pro Plan */}
            <div className="bg-stone-900 p-10 rounded-3xl text-white shadow-2xl shadow-stone-900/20 flex flex-col relative overflow-hidden transform md:-translate-y-4">
              <div className="absolute top-0 right-0 bg-yellow-400 px-4 py-1 rounded-bl-2xl text-xs font-bold tracking-wide uppercase text-stone-900">
                Popular
              </div>
              
              <div className="mb-8">
                <h3 className="text-xl font-bold text-white mb-2">Pro</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-yellow-400">$5</span>
                  <span className="text-stone-400 font-medium">/month</span>
                </div>
                <p className="text-stone-400 mt-4 font-medium">Unlimited power for professionals.</p>
              </div>
              
              <ul className="space-y-4 mb-10 flex-1">
                {[
                  "Unlimited boards",
                  "Advanced AI features",
                  "Priority cloud sync",
                  "Unlimited devices",
                  "High-res exports",
                  "Priority support"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-stone-300 font-medium">
                    <div className="w-5 h-5 rounded-full bg-yellow-400/20 flex items-center justify-center">
                      <svg className="w-3 h-3 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    {item}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleCheckout(STRIPE_PRICE_ID)}
                disabled={loading}
                className="block w-full py-4 px-6 text-center bg-yellow-400 hover:bg-yellow-500 text-stone-900 font-bold rounded-2xl transition-all transform hover:-translate-y-0.5 disabled:opacity-70"
              >
                {loading ? "Processing..." : "Upgrade to Pro"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-stone-900 mb-6">
            Ready to code at the speed of thought?
          </h2>
          <p className="text-xl text-stone-500 mb-10 max-w-xl mx-auto font-medium">
            Join developers who use Visual Specs to master AI coding.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="px-10 py-4 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-full transition-all shadow-xl shadow-stone-900/20 transform hover:-translate-y-1"
            >
              Start for Free
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-stone-900 rounded flex items-center justify-center text-white">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="font-medium text-stone-900">Excaflow</span>
          </div>
          
          <div className="flex gap-8 text-sm text-stone-500">
            <Link href="#" className="hover:text-stone-900 transition-colors">Privacy</Link>
            <Link href="#" className="hover:text-stone-900 transition-colors">Terms</Link>
            <Link href="#" className="hover:text-stone-900 transition-colors">Contact</Link>
          </div>
          
          <div className="text-sm text-stone-400">
            &copy; 2025 Excaflow. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
