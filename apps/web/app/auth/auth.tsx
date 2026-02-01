'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Globe from '../../src/components/Globe';
import { authService } from '../../src/services/auth.service';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');

  // State quản lý dữ liệu và trạng thái
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const toggle = () => {
    setMode((m) => (m === 'sign-in' ? 'sign-up' : 'sign-in'));
    setError('');
  };

  // Prefill dữ liệu demo
  useEffect(() => {
    if (mode === 'sign-in') {
      setEmail('admin@tradex.com');
      setPassword('');
    } else {
      setUsername('');
      setEmail('');
      setPassword('');
      setConfirm('');
    }
  }, [mode]);

  // HÀM XỬ LÝ SUBMIT FORM
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'sign-in') {
        // --- Xử lý Đăng Nhập ---
        const loginResponse = await authService.login(email, password);
        
        // Lưu token (authService đã lưu accessToken, nhưng cũng lưu vào 'token' cho backward compatibility)
        if (loginResponse.accessToken) {
          localStorage.setItem('token', loginResponse.accessToken);
        }

        // Fetch user profile để lấy thông tin role
        const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
        if (token) {
          try {
            const profileResponse = await fetch(`${API_URL}/users/profile`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });
            
            if (profileResponse.ok) {
              const userData = await profileResponse.json();
              // Lưu user data vào localStorage
              localStorage.setItem('user', JSON.stringify(userData));
            }
          } catch (profileErr) {
            console.warn('Could not fetch user profile:', profileErr);
          }
        }

        // Redirect to dashboard
        router.push('/dashboard');
      } else {
        // --- Xử lý Đăng Ký ---
        if (password !== confirm) {
          setError('Passwords do not match!');
          setIsLoading(false);
          return;
        }
        await authService.register(email, password, username);
        alert('Registration Successful! Please login.');
        setMode('sign-in');
      }
    } catch (err: any) {
      // Hiển thị lỗi từ Backend trả về
      console.error('Auth error:', err);
      const errorMessage = err?.message || err?.error || 'Something went wrong. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

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
              <h2 className="text-3xl font-bold text-black mb-1">
                {mode === 'sign-in' ? 'Welcome Back' : 'Create Account'}
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                {mode === 'sign-in'
                  ? 'Sign in to your TradeX account'
                  : 'Join TradeX today'}
              </p>

              {/* Hiển thị lỗi nếu có */}
              {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-700 text-sm rounded-md border border-red-200">
                  ⚠️ {error}
                </div>
              )}

              <form className="space-y-4" onSubmit={handleSubmit}>
                {mode === 'sign-up' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Username
                    </label>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      className={`${inputBase} ${username ? 'input-filled' : 'bg-gray-50'} focus:ring-2 focus:ring-indigo-200`}
                      placeholder="Your username"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={`${inputBase} ${email ? 'input-filled' : 'bg-gray-50'} focus:ring-2 focus:ring-indigo-200`}
                    placeholder="you@example.com"
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
                    required
                    className={`${inputBase} ${password ? 'input-filled' : 'bg-gray-50'} focus:ring-2 focus:ring-indigo-200`}
                    placeholder="••••••••"
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
                      required
                      className={`${inputBase} ${confirm ? 'input-filled' : 'bg-gray-50'} focus:ring-2 focus:ring-indigo-200`}
                      placeholder="••••••••"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 mt-4 rounded-md text-sm font-semibold text-white bg-black hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      {mode === 'sign-in' ? 'Signing in...' : 'Creating account...'}
                    </>
                  ) : (
                    mode === 'sign-in' ? 'Sign In' : 'Create Account'
                  )}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-gray-500">
                {mode === 'sign-in' ? (
                  <>
                    Don't have an account?{' '}
                    <button onClick={toggle} className="text-black font-semibold hover:underline">
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button onClick={toggle} className="text-black font-semibold hover:underline">
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Right: Globe */}
          <div className="md:w-1/2 bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-8">
            <Globe />
          </div>
        </div>
      </main>
    </div>
  );
}
