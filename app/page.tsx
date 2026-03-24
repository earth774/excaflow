"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";

import { supabase } from "@/lib/supabaseClient";
import { STRIPE_PRICE_ID } from "@/lib/stripeConfig";
import {
  FREE_TIER_MAX_PAGES_PER_PROJECT,
  FREE_TIER_MAX_PROJECTS,
} from "@/lib/planTier";
import type { User } from "@supabase/supabase-js";

export default function LandingPage() {
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

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
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        alert("Please sign in to upgrade.");
        window.location.href = "/login";
        return;
      }

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
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
    }
  };

  return (
    <div className="min-h-screen bg-[#faf9f6] text-stone-900 font-sans selection:bg-yellow-200">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-stone-100 bg-[#faf9f6]/85 backdrop-blur-md">
        <div className="mx-auto flex h-[4.25rem] max-w-6xl items-center justify-between px-5 sm:px-6">
          <Link
            href="/"
            className="group flex items-center gap-3 focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400/60"
          >
            <Image
              src="/logo.svg"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 object-contain"
            />
            <span className="text-[1.125rem] font-semibold tracking-tight text-stone-900 transition group-hover:text-yellow-700">
              Excaflow
            </span>
          </Link>
          <div className="flex items-center gap-5 sm:gap-7">
            <Link
              href="#features"
              className="hidden text-[0.95rem] text-stone-500 transition hover:text-stone-900 sm:block"
            >
              Features
            </Link>
            <Link
              href="#pricing"
              className="hidden text-[0.95rem] text-stone-500 transition hover:text-stone-900 sm:block"
            >
              Pricing
            </Link>
            {user ? (
              <Link
                href="/dashboard"
                className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/login"
                className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </nav>

      <section className="px-5 pb-20 pt-[7.5rem] sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
            <div className="max-w-xl">
              <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-yellow-100 bg-yellow-50/90 px-3.5 py-1.5 text-[0.8125rem] text-yellow-900/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <span className="h-2 w-2 rounded-full bg-yellow-500" aria-hidden />
                Whiteboard for specs &amp; diagrams
              </p>

              <h1 className="mb-6 text-[2.35rem] font-semibold leading-[1.15] tracking-tight text-stone-900 sm:text-5xl sm:leading-[1.12]">
                Draw what you mean.
                <span className="mt-1 block text-yellow-500">
                  Build what you drew.
                </span>
              </h1>

              <p className="mb-9 max-w-md text-[1.05rem] leading-relaxed text-stone-600">
                Skip the wall of text. Sketch flows, map ideas, and share a
                picture everyone can agree on—no design degree required.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-2xl bg-yellow-400 px-7 py-3.5 text-[0.95rem] font-semibold text-stone-900 shadow-[0_4px_14px_rgba(234,179,8,0.35)] transition hover:bg-yellow-500 hover:shadow-[0_6px_20px_rgba(234,179,8,0.4)]"
                >
                  Start free
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    aria-hidden
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </Link>
                <Link
                  href="#features"
                  className="inline-flex items-center rounded-2xl border-2 border-stone-100 bg-white px-7 py-3.5 text-[0.95rem] font-semibold text-stone-900 transition hover:border-yellow-400 hover:bg-white"
                >
                  See what you can do
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="relative overflow-hidden rounded-[1.35rem] border border-stone-100 bg-white shadow-[0_24px_48px_-20px_rgba(0,0,0,0.12)]">
                <div className="relative aspect-[4/3]">
                  <Image
                    src="/images/hero-preview-yellow.png"
                    alt="Excaflow canvas preview"
                    fill
                    className="object-cover"
                    priority
                  />
                </div>
              </div>
              <div
                className="absolute -right-6 -z-10 top-8 h-[calc(100%-2rem)] w-[calc(100%+0.5rem)] rounded-[1.5rem] bg-yellow-100/80"
                aria-hidden
              />
              <div
                className="absolute -bottom-8 -left-8 -z-20 h-48 w-48 rounded-full bg-yellow-50 blur-3xl"
                aria-hidden
              />
            </div>
          </div>
        </div>
      </section>

      <section
        id="features"
        className="relative overflow-hidden bg-white px-5 py-20 sm:px-6"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(254,240,138,0.35),transparent)]" />
        <div className="relative z-10 mx-auto max-w-6xl">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="mb-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
              A little structure, a lot less confusion
            </h2>
            <p className="text-[1.05rem] text-stone-500">
              When words run out, a canvas usually helps.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3 md:gap-7">
            {[
              {
                title: "Clarify the messy bits",
                desc: "Map architecture, flows, or UI in minutes. Get the idea out of your head before you argue about it in chat.",
                icon: (
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                ),
              },
              {
                title: "Hand context to your tools",
                desc: "Turn sketches into a shared reference—so assistants and teammates aren’t guessing from half a prompt.",
                icon: (
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                ),
              },
              {
                title: "Iterate without shame",
                desc: "Redraw, duplicate, tweak. Versioning is a feature, not a failure—your spec can grow with the project.",
                icon: (
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                ),
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="group rounded-[1.35rem] border border-transparent bg-stone-50 p-7 transition hover:border-yellow-400 hover:bg-white hover:shadow-xl hover:shadow-yellow-400/10"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-yellow-500 shadow-sm ring-1 ring-stone-100 transition group-hover:scale-110 group-hover:bg-yellow-400 group-hover:text-stone-900">
                  {feature.icon}
                </div>
                <h3 className="mb-2 text-lg font-semibold text-stone-900">
                  {feature.title}
                </h3>
                <p className="leading-relaxed text-stone-500">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-stone-50 px-5 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-14 text-center">
            <h2 className="mb-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
              Pricing that stays out of your way
            </h2>
            <p className="text-[1.05rem] text-stone-500">
              Try free, upgrade when you’re in it every day.
            </p>
          </div>

          <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2 md:gap-8">
            <div className="flex flex-col rounded-[1.35rem] border border-stone-200 bg-white p-9 shadow-sm transition-colors hover:border-yellow-400">
              <div className="mb-8">
                <h3 className="mb-2 text-lg font-semibold text-stone-900">
                  Free
                </h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-semibold text-stone-900">
                    $0
                  </span>
                  <span className="text-stone-500">/month</span>
                </div>
                <p className="mt-3 text-stone-500">
                  Organize a few projects and rooms—upgrade when you need more.
                </p>
              </div>

              <ul className="mb-10 flex-1 space-y-3.5">
                {[
                  `Up to ${FREE_TIER_MAX_PROJECTS} projects`,
                  `Up to ${FREE_TIER_MAX_PAGES_PER_PROJECT} rooms per project`,
                  "Basic AI generation",
                  "Cloud sync",
                ].map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 text-stone-600"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500">
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.5"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                className="block w-full rounded-2xl bg-stone-100 py-3.5 text-center text-[0.95rem] font-semibold text-stone-900 transition hover:bg-stone-200"
              >
                Get started
              </Link>
            </div>

            <div className="relative flex flex-col overflow-hidden rounded-[1.35rem] border border-stone-900 bg-stone-900 p-9 text-white shadow-2xl shadow-stone-900/20 md:-translate-y-1">
              <div className="absolute right-0 top-0 rounded-bl-2xl bg-yellow-400 px-3.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-stone-900">
                Popular
              </div>

              <div className="mb-8">
                <h3 className="mb-2 text-lg font-semibold">Pro</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-semibold text-yellow-400">
                    $5
                  </span>
                  <span className="text-stone-400">/month</span>
                </div>
                <p className="mt-3 text-stone-400">
                  No project or room caps—built for daily, team-heavy use.
                </p>
              </div>

              <ul className="mb-10 flex-1 space-y-3.5">
                {[
                  "Unlimited projects",
                  "Unlimited rooms per project",
                  "Advanced AI features",
                  "Priority cloud sync",
                  "Unlimited devices",
                  "High-res exports",
                  "Priority support",
                ].map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 text-stone-300"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-400/20 text-yellow-400">
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.5"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => handleCheckout(STRIPE_PRICE_ID)}
                disabled={loading}
                className="block w-full rounded-2xl bg-yellow-400 py-3.5 text-center text-[0.95rem] font-semibold text-stone-900 transition hover:bg-yellow-500 disabled:opacity-70"
              >
                {loading ? "Processing…" : "Upgrade to Pro"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-20 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-2xl font-semibold text-stone-900 sm:text-3xl">
            Want to try it with a real idea?
          </h2>
          <p className="mb-9 text-[1.05rem] leading-relaxed text-stone-500">
            Open a board, doodle once, and see if it feels lighter than
            another long message thread.
          </p>
          <Link
            href="/signup"
            className="inline-flex rounded-2xl bg-stone-900 px-9 py-3.5 text-[0.95rem] font-semibold text-white shadow-xl shadow-stone-900/20 transition hover:bg-stone-800"
          >
            Start for free
          </Link>
        </div>
      </section>

      <footer className="border-t border-stone-200 bg-white px-5 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-8 md:flex-row">
          <div className="flex items-center gap-2.5">
            <Image
              src="/logo.svg"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 object-contain"
            />
            <span className="text-base font-semibold text-stone-900">
              Excaflow
            </span>
          </div>

          <div className="flex gap-8 text-sm text-stone-500">
            <Link href="#" className="transition hover:text-stone-900">
              Privacy
            </Link>
            <Link href="#" className="transition hover:text-stone-900">
              Terms
            </Link>
            <Link href="#" className="transition hover:text-stone-900">
              Contact
            </Link>
          </div>

          <div className="text-sm text-stone-400">
            &copy; 2025 Excaflow. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
