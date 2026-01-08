'use client';

import React, { useState, useEffect } from 'react';
import Globe from '../src/components/Globe';

export default function AuthPage() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const toggle = () =>
    setMode((m) => (m === 'sign-in' ? 'sign-up' : 'sign-in'));

  // controlled inputs for nicer demo UX
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  // prefill demo values for visual parity with screenshots
  useEffect(() => {
    if (mode === 'sign-in') {
      setEmail('admin@cryptotrading.com');
      setPassword('');
    } else {
      setUsername('admin@cryptotrading.com');
      setEmail('');
      setPassword('');
      setConfirm('');
    }
  }, [mode]);

  const inputBase =
    'w-full rounded-md border border-gray-200 px-3 py-3 focus:outline-none transition-colors duration-200';

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 flex flex-col">
      <header className="w-full">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-2xl font-extrabold">TradeX</div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMode('sign-in')}
              className={`px-4 py-2 rounded-full text-sm border ${
                mode === 'sign-in' ? 'bg-white shadow' : 'bg-transparent'
              }`}
            >
              ↪ Login
            </button>
            <button
              onClick={() => setMode('sign-up')}
              className={`px-4 py-2 rounded-full text-sm text-white bg-black border border-black`}
            >
              ✨ Register
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center py-12 px-6">
        <div className="w-full max-w-5xl rounded-xl shadow-xl overflow-hidden flex flex-col md:flex-row card-hover">
          {/* Left: form */}
          <div className="md:w-1/2 bg-white p-12 fade-in-up flex items-center justify-center">
            <div className="w-full max-w-md auth-font">
              <h2 className="text-3xl font-bold mb-1">
                {mode === 'sign-in' ? 'Welcome Back' : 'Create Account'}
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                {mode === 'sign-in'
                  ? 'Sign in to your TradeX account'
                  : 'Join TradeX today'}
              </p>

              <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                {mode === 'sign-up' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Username
                    </label>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={`${inputBase} ${username ? 'input-filled' : 'bg-gray-50'} focus:ring-2 focus:ring-indigo-200`}
                      placeholder="Your username"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`${inputBase} ${email ? 'input-filled' : 'bg-gray-50'} focus:ring-2 focus:ring-indigo-200`}
                    placeholder={
                      mode === 'sign-in' ? 'Email address' : 'Enter your email'
                    }
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputBase} ${password ? 'input-filled' : 'bg-gray-50'} focus:ring-2 focus:ring-indigo-200`}
                    placeholder="Your password"
                  />
                </div>

                {mode === 'sign-up' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className={`${inputBase} ${confirm ? 'input-filled' : 'bg-gray-50'} focus:ring-2 focus:ring-indigo-200`}
                      placeholder="Confirm your password"
                    />
                  </div>
                )}

                <div>
                  <button className="w-full bg-[#0b1720] text-white py-3 rounded-md shadow-md hover:opacity-95 transition-transform active:scale-99">
                    {mode === 'sign-in' ? 'Sign In' : 'Create Account'}
                  </button>
                </div>
              </form>

              <div className="text-center text-sm text-gray-500 mt-6">
                {mode === 'sign-in' ? (
                  <>
                    Don&apos;t have an account?{' '}
                    <button
                      className="text-indigo-700 underline"
                      onClick={toggle}
                    >
                      Sign up here
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      className="text-indigo-700 underline"
                      onClick={toggle}
                    >
                      Sign in here
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right: dark panel */}
          <div className="md:w-1/2 bg-[#0b0f16] text-white p-10 flex flex-col items-center justify-center globe-glow fade-in-up">
            <div className="w-56 h-56 mb-6 relative">
              {/* WebGL globe (three.js) */}
              <div className="absolute inset-0 rounded-full overflow-hidden">
                <Globe />
              </div>
              <div className="globe-shine" aria-hidden="true" />
              <div className="globe-shadow" aria-hidden="true" />
            </div>

            <h3 className="text-xl font-bold mb-2">TradeX Platform</h3>
            <p className="text-sm text-gray-300 text-center max-w-xs">
              Real-time crypto trading, AI-powered backtesting, and global
              market analytics. Join thousands of traders worldwide. Fast,
              secure, and easy to use.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
