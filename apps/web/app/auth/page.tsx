'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Globe from '../../src/components/Globe';
import { authService } from '../../src/services/auth.service';
import { IconArrowRight, IconEye, IconEyeOff, IconLoader2, IconSparkles } from '@tabler/icons-react';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export default function AuthPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggle = () => {
    setMode((m) => (m === 'sign-in' ? 'sign-up' : 'sign-in'));
    setError('');
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'sign-in') {
        const loginResponse = await authService.login(email, password);
        if (loginResponse.accessToken) {
          sessionStorage.setItem('token', loginResponse.accessToken);
        }

        const token =
          sessionStorage.getItem('accessToken') ||
          sessionStorage.getItem('token');
        if (token) {
          try {
            const profileResponse = await fetch(`${API_URL}/users/profile`, {
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });

            if (profileResponse.ok) {
              const userData = await profileResponse.json();
              sessionStorage.setItem('user', JSON.stringify(userData));
            }
          } catch (profileErr) {
            console.warn('Could not fetch user profile:', profileErr);
          }
        }
        router.push('/dashboard');
      } else {
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
      console.error('Auth error:', err);
      const errorMessage =
        err?.message || err?.error || 'Something went wrong. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=Lexend:wght@300;400;500;600;700&display=swap');

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Manrope', sans-serif;
          overflow-x: hidden;
        }

        @keyframes float-in {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(60px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes glow-pulse {
          0%,
          100% {
            opacity: 0.3;
          }
          50% {
            opacity: 0.6;
          }
        }

        @keyframes rotate-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .page-container {
          min-height: 100vh;
          background: #ffffff;
          position: relative;
          overflow: hidden;
        }

        .bg-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          opacity: 0.15;
          animation: glow-pulse 4s ease-in-out infinite;
        }

        .orb-1 {
          width: 500px;
          height: 500px;
          background: #000000;
          top: -200px;
          right: -200px;
          animation-delay: 0s;
        }

        .orb-2 {
          width: 400px;
          height: 400px;
          background: #000000;
          bottom: -150px;
          left: -150px;
          animation-delay: 2s;
        }

        .orb-3 {
          width: 350px;
          height: 350px;
          background: #000000;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          animation-delay: 1s;
        }

        .content-wrapper {
          position: relative;
          z-index: 10;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
        }

        .auth-container {
          width: 100%;
          max-width: 1400px;
          height: 700px;
          display: grid;
          grid-template-columns: 1fr 1.2fr;
          gap: 0;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px);
          border-radius: 32px;
          overflow: hidden;
          border: 2px solid #000000;
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.15);
          animation: slide-up 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        @media (max-width: 968px) {
          .auth-container {
            grid-template-columns: 1fr;
            height: auto;
            min-height: 600px;
          }
          .globe-section {
            display: none;
          }
        }

        .form-section {
          background: #ffffff;
          position: relative;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .form-header {
          flex-shrink: 0;
          padding: 2rem 2rem 1rem 2rem;
          background: #ffffff;
          z-index: 10;
        }

        .form-body {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 0 2rem 2rem 2rem;
          display: flex;
          transition: all 0.3s ease;
        }

        .form-body.sign-up-mode {
          align-items: flex-start;
          padding-top: 0.5rem;
        }

        /* Custom scrollbar */
        .form-body::-webkit-scrollbar {
          width: 6px;
        }

        .form-body::-webkit-scrollbar-track {
          background: transparent;
        }

        .form-body::-webkit-scrollbar-thumb {
          background: #e0e0e0;
          border-radius: 3px;
        }

        .form-body::-webkit-scrollbar-thumb:hover {
          background: #cccccc;
        }

        .globe-section {
          position: relative;
          background: #000000;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .globe-bg-pattern {
          position: absolute;
          width: 600px;
          height: 600px;
          background: radial-gradient(
            circle,
            rgba(255, 255, 255, 0.05) 1px,
            transparent 1px
          );
          background-size: 30px 30px;
          animation: rotate-slow 60s linear infinite;
        }

        .brand-header {
          position: absolute;
          top: 2rem;
          left: 3rem;
          z-index: 100;
        }

        .brand-logo {
          font-family: 'Lexend', sans-serif;
          font-size: 2rem;
          font-weight: 700;
          color: #000000;
          letter-spacing: -0.03em;
        }

        .form-content {
          max-width: 460px;
          width: 100%;
          margin: 0 auto;
        }

        .feature-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: #f5f5f5;
          border: 1px solid #e0e0e0;
          border-radius: 24px;
          color: #000000;
          font-size: 0.75rem;
          font-weight: 600;
          margin-bottom: 1.25rem;
        }

        .badge-icon {
          width: 20px;
          height: 20px;
          background: #000000;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
        }

        .mode-switcher {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          background: #f5f5f5;
          padding: 0.5rem;
          border-radius: 16px;
          border: 1px solid #e0e0e0;
        }

        .mode-btn {
          flex: 1;
          padding: 0.75rem;
          border: none;
          background: transparent;
          color: #666666;
          font-family: 'Manrope', sans-serif;
          font-size: 0.9375rem;
          font-weight: 600;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .mode-btn.active {
          background: #000000;
          color: #ffffff;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
          transform: translateY(-2px);
        }

        .mode-btn:hover:not(.active) {
          background: #e8e8e8;
          color: #000000;
        }

        .form-title {
          font-family: 'Lexend', sans-serif;
          font-size: 2rem;
          font-weight: 700;
          color: #000000;
          margin-bottom: 0.375rem;
          letter-spacing: -0.03em;
          line-height: 1.2;
        }

        .form-subtitle {
          color: #666666;
          font-size: 0.9375rem;
          margin-bottom: 0;
          font-weight: 400;
        }

        .error-box {
          padding: 0.75rem 0.875rem;
          background: #fff5f5;
          border: 1px solid #000000;
          border-radius: 12px;
          color: #000000;
          font-size: 0.8125rem;
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          animation: float-in 0.3s ease-out;
        }

        .form-scrollable {
          padding-top: 1.5rem;
        }

        .sign-up-mode .form-scrollable {
          padding-top: 0rem;
        }

        .input-wrapper {
          margin-bottom: 1rem;
          position: relative;
        }

        .sign-up-mode .input-wrapper {
          margin-bottom: 0.75rem;
        }

        .input-label {
          display: block;
          color: #000000;
          font-size: 0.75rem;
          font-weight: 600;
          margin-bottom: 0.375rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .input-container {
          position: relative;
        }

        .input-field {
          width: 100%;
          padding: 0.75rem 1rem;
          background: #ffffff;
          border: 2px solid #e0e0e0;
          border-radius: 14px;
          color: #000000;
          font-family: 'Manrope', sans-serif;
          font-size: 0.9375rem;
          outline: none;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .input-field::placeholder {
          color: #999999;
        }

        .input-field:focus {
          background: #ffffff;
          border-color: #000000;
          box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.05);
          transform: translateY(-2px);
        }

        .input-field:not(:placeholder-shown) {
          border-color: #333333;
        }

        .password-toggle-btn {
          position: absolute;
          right: 1rem;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #666666;
          cursor: pointer;
          font-size: 1.25rem;
          padding: 0.25rem;
          transition: all 0.2s;
        }

        .password-toggle-btn:hover {
          color: #000000;
          transform: translateY(-50%) scale(1.1);
        }

        .submit-button {
          width: 100%;
          padding: 0.875rem;
          background: #000000;
          border: none;
          border-radius: 14px;
          color: #ffffff;
          font-family: 'Manrope', sans-serif;
          font-size: 0.9375rem;
          font-weight: 700;
          cursor: pointer;
          margin-top: 1.25rem;
          position: relative;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .sign-up-mode .submit-button {
          margin-top: 0.875rem;
        }

        .submit-button::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.2),
            transparent
          );
          transition: left 0.5s;
        }

        .submit-button:hover::before {
          left: 100%;
        }

        .submit-button:hover:not(:disabled) {
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
          transform: translateY(-3px);
        }

        .submit-button:active:not(:disabled) {
          transform: translateY(-1px);
        }

        .submit-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .loading-spinner {
          display: inline-block;
          width: 18px;
          height: 18px;
          border: 2.5px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
          margin-right: 0.5rem;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .footer-text {
          text-align: center;
          margin-top: 1.25rem;
          color: #666666;
          font-size: 0.875rem;
        }

        .sign-up-mode .footer-text {
          margin-top: 0.875rem;
        }

        .footer-link {
          color: #000000;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.2s;
          border-bottom: 2px solid transparent;
        }

        .footer-link:hover {
          border-bottom-color: #000000;
        }

        .globe-content {
          position: relative;
          z-index: 2;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
        }

        .globe-title {
          font-family: 'Lexend', sans-serif;
          font-size: 2.25rem;
          font-weight: 800;
          color: #ffffff;
          text-align: center;
          margin-bottom: 0.75rem;
          line-height: 1.2;
          letter-spacing: -0.02em;
        }

        .globe-subtitle {
          color: rgba(255, 255, 255, 0.8);
          font-size: 1rem;
          text-align: center;
          max-width: 400px;
          margin-bottom: 1.5rem;
          line-height: 1.6;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.25rem;
          margin-top: 1.5rem;
          width: 100%;
          max-width: 500px;
        }

        .stat-item {
          text-align: center;
        }

        .stat-value {
          font-family: 'Lexend', sans-serif;
          font-size: 1.5rem;
          font-weight: 700;
          color: #ffffff;
          display: block;
          margin-bottom: 0.25rem;
        }

        .stat-label {
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.75rem;
          font-weight: 500;
        }

        /* Smooth fade in animation */
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .input-wrapper {
          animation: fadeInUp 0.4s ease-out forwards;
        }

        .input-wrapper:nth-child(1) {
          animation-delay: 0.05s;
        }
        .input-wrapper:nth-child(2) {
          animation-delay: 0.1s;
        }
        .input-wrapper:nth-child(3) {
          animation-delay: 0.15s;
        }
        .input-wrapper:nth-child(4) {
          animation-delay: 0.2s;
        }
      `}</style>

      <div className="page-container">
        {/* Background Orbs */}
        <div className="bg-orb orb-1"></div>
        <div className="bg-orb orb-2"></div>
        <div className="bg-orb orb-3"></div>

        {/* Brand Header */}
        <div className="brand-header">
          <div className="brand-logo">USTrading</div>
        </div>

        <div className="content-wrapper">
          <div className="auth-container">
            {/* Form Section */}
            <div className="form-section">
              {/* Fixed Header */}
              <div className="form-header">
                <div className="form-content">
                  <div className="mode-switcher">
                    <button
                      onClick={() => setMode('sign-in')}
                      className={`mode-btn ${
                        mode === 'sign-in' ? 'active' : ''
                      }`}
                      suppressHydrationWarning
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => setMode('sign-up')}
                      className={`mode-btn ${
                        mode === 'sign-up' ? 'active' : ''
                      }`}
                      suppressHydrationWarning
                    >
                      Sign Up
                    </button>
                  </div>

                  <h1 className="form-title">
                    {mode === 'sign-in' ? 'Welcome Back' : 'Get Started'}
                  </h1>
                  <p className="form-subtitle">
                    {mode === 'sign-in'
                      ? 'Access your trading dashboard'
                      : 'Create your TradeX account today'}
                  </p>
                </div>
              </div>

              {/* Scrollable Body */}
              <div
                className={`form-body ${mode === 'sign-up' ? 'sign-up-mode' : ''}`}
              >
                <div className="form-content">
                  <div className="form-scrollable">
                    {error && (
                      <div className="error-box">
                        <span>⚠️</span>
                        <span>{error}</span>
                      </div>
                    )}

                    <form onSubmit={handleSubmit}>
                      {mode === 'sign-up' && (
                        <div className="input-wrapper">
                          <label className="input-label">Username</label>
                          <input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onFocus={() => setFocusedField('username')}
                            onBlur={() => setFocusedField(null)}
                            required
                            className="input-field"
                            placeholder="Choose a username"
                            autoComplete="off"
                            suppressHydrationWarning
                          />
                        </div>
                      )}

                      <div className="input-wrapper">
                        <label className="input-label">Email</label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          onFocus={() => setFocusedField('email')}
                          onBlur={() => setFocusedField(null)}
                          required
                          className="input-field"
                          placeholder="your@email.com"
                          autoComplete="email"
                          suppressHydrationWarning
                        />
                      </div>

                      <div className="input-wrapper">
                        <label className="input-label">Password</label>
                        <div className="input-container">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onFocus={() => setFocusedField('password')}
                            onBlur={() => setFocusedField(null)}
                            required
                            className="input-field"
                            placeholder="Enter your password"
                            autoComplete={
                              mode === 'sign-in'
                                ? 'current-password'
                                : 'new-password'
                            }
                            suppressHydrationWarning
                          />
                          <button
                            type="button"
                            className="password-toggle-btn"
                            onClick={() => setShowPassword(!showPassword)}
                            tabIndex={-1}
                          >
                            {showPassword ? (
                              <IconEye size={21} />
                            ) : (
                              <IconEyeOff size={21} />
                            )}
                          </button>
                        </div>
                      </div>

                      {mode === 'sign-up' && (
                        <div className="input-wrapper">
                          <label className="input-label">
                            Confirm Password
                          </label>
                          <div className="input-container">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              value={confirm}
                              onChange={(e) => setConfirm(e.target.value)}
                              onFocus={() => setFocusedField('confirm')}
                              onBlur={() => setFocusedField(null)}
                              required
                              className="input-field"
                              placeholder="Confirm your password"
                              autoComplete="new-password"
                              suppressHydrationWarning
                            />
                          </div>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="submit-button flex items-center justify-center"
                        suppressHydrationWarning
                      >
                        {isLoading ? (
    <span className="flex items-center gap-2">
      <IconLoader2 size={18} className="animate-spin" />
      {mode === 'sign-in' ? 'Signing in...' : 'Creating account...'}
    </span>
  ) : mode === 'sign-in' ? (
    <span className="flex items-center gap-2">
      <IconArrowRight size={18} />
      Sign In to Dashboard
    </span>
  ) : (
    <span className="flex items-center gap-2">
      <IconSparkles size={18} />
      Create My Account
    </span>
  )}
                      </button>
                    </form>

                    <p className="footer-text">
                      {mode === 'sign-in' ? (
                        <>
                          New to TradeX?{' '}
                          <span
                            onClick={toggle}
                            className="footer-link"
                            suppressHydrationWarning
                          >
                            Create an account
                          </span>
                        </>
                      ) : (
                        <>
                          Already have an account?{' '}
                          <span
                            onClick={toggle}
                            className="footer-link"
                            suppressHydrationWarning
                          >
                            Sign in here
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Globe Section */}
            <div className="globe-section">
              <div className="globe-bg-pattern"></div>
              <div className="globe-content">
                <h2 className="globe-title">
                  Trade Smarter,
                  <br />
                  Not Harder
                </h2>
                <p className="globe-subtitle">
                  Join thousands of traders making data-driven decisions with
                  TradeX
                </p>

                <div
                  style={{
                    position: 'relative',
                    width: '300px',
                    height: '300px',
                    marginBottom: '1rem',
                  }}
                >
                  <Globe />
                </div>

                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="stat-value">50K+</span>
                    <span className="stat-label">Active Traders</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">$2B+</span>
                    <span className="stat-label">Trading Volume</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">99.9%</span>
                    <span className="stat-label">Uptime</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
