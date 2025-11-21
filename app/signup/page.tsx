"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import AuthCarousel from "@/components/AuthCarousel";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const translateError = (errorMessage: string): string => {
    if (errorMessage.includes("User already registered")) {
      return "อีเมลนี้ถูกใช้งานแล้ว";
    }
    if (errorMessage.includes("Password should be at least")) {
      return "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";
    }
    if (errorMessage.includes("Invalid email")) {
      return "รูปแบบอีเมลไม่ถูกต้อง";
    }
    return errorMessage || "เกิดข้อผิดพลาดในการสมัครสมาชิก";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Validation
    if (password.length < 6) {
      setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }

    if (password !== confirmPassword) {
      setError("รหัสผ่านไม่ตรงกัน");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setError(translateError(error.message));
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err) {
      setError("เกิดข้อผิดพลาดในการสมัครสมาชิก");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left Side - Hero/Branding */}
      <AuthCarousel 
        slides={[
          {
            image: "https://images.unsplash.com/photo-1635776062127-d379bfcba9f8?q=80&w=2532&auto=format&fit=crop",
            title: "Join our community today.",
            description: "Create an account to access exclusive features and start building your next big idea. It's free and takes less than a minute."
          },
          {
            image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=2670&auto=format&fit=crop",
            title: "Built for creators.",
            description: "Designed with creators in mind. Get access to powerful tools that help bring your ideas to life faster than ever before."
          },
          {
            image: "https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=2574&auto=format&fit=crop",
            title: "Join thousands of users.",
            description: "Be part of a growing community of innovators and creators. Start your journey today and unlock your full potential."
          }
        ]} 
      />

      {/* Right Side - Signup Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 lg:p-24">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Create an account
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Enter your details to get started.
            </p>
          </div>

          {success ? (
            <div className="rounded-lg bg-green-50 p-4 border border-green-100 animate-fade-in">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">Registration successful!</h3>
                  <div className="mt-2 text-sm text-green-700">
                    <p>Redirecting to login page...</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
              <div className="space-y-5">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Email
                  </label>
                  <div className="mt-1">
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="block w-full px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:border-fuchsia-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 transition-all duration-200"
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Password
                  </label>
                  <div className="mt-1">
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="block w-full px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:border-fuchsia-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 transition-all duration-200"
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Confirm Password
                  </label>
                  <div className="mt-1">
                    <input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat your password"
                      className="block w-full px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:border-fuchsia-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 transition-all duration-200"
                      required
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 p-4 border border-red-100">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">Registration failed</h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-fuchsia-600 hover:bg-fuchsia-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:-translate-y-0.5"
              >
                {loading ? (
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : null}
                {loading ? "Creating account..." : "Create account"}
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">
                    Already have an account?
                  </span>
                </div>
              </div>

              <div className="mt-6 text-center">
                <Link
                  href="/login"
                  className="font-medium text-fuchsia-600 hover:text-fuchsia-500 transition-colors"
                >
                  Sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

