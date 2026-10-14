import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [loginError, setLoginError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: authStatus } = useQuery({
    queryKey: ['auth-status'],
    queryFn: () => api.auth.status(),
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    // Check for error params in URL
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error) {
      const msgs: Record<string, string> = {
        missing_code: 'Google OAuth did not return an authorization code.',
        invalid_state: 'OAuth state validation failed. Please try again.',
        access_denied: 'You denied access to your Google account.',
      };
      setLoginError(msgs[error] || `Authentication error: ${error}`);
    }
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (authStatus?.isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [authStatus, navigate]);

  const handleGoogleLogin = () => {
    if (!authStatus?.isGoogleConfigured) {
      setLoginError(
        'Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env'
      );
      return;
    }
    window.location.href = 'http://localhost:4000/api/auth/google';
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setLoginError('');
      await api.auth.devLogin();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setLoginError((err as Error).message || 'Failed to log in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4 antialiased">
      {/* Outer bounding box matching Figma (496 x 494) */}
      <div className="w-full max-w-[496px] min-h-[494px] flex items-center justify-center p-6 border border-[#E5E7EB] rounded-2xl shadow-subtle bg-white">
        {/* Inner login form container (380 x 389) */}
        <div className="w-full max-w-[380px]">
          {/* Title */}
          <h1 className="text-[28px] font-bold text-[#1C1C1C] text-center mb-6 tracking-tight">
            Login
          </h1>

          {loginError && (
            <div className="mb-4 p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-xs text-center">
              {loginError}
            </div>
          )}

          {/* Google Login Button */}
          <button
            id="google-login-btn"
            type="button"
            onClick={handleGoogleLogin}
            className="w-full h-11 flex items-center justify-center gap-2.5 px-4 rounded-lg bg-[#E5F6EC] hover:bg-[#d8f2e2] active:bg-[#cbf0d8] border border-[#BDE8CC] text-[#1C1C1C] text-sm font-medium transition-all shadow-sm"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Login with Google</span>
          </button>

          {/* Divider */}
          <div className="relative my-6 flex items-center justify-center">
            <div className="border-t border-[#E5E7EB] w-full" />
            <span className="bg-white px-3 text-xs text-[#636970] absolute font-normal select-none">
              or sign up through email
            </span>
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleEmailLogin} className="space-y-3.5">
            <div>
              <input
                id="email-input"
                type="email"
                placeholder="Email ID"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 bg-[#F4F7F5] border border-transparent focus:border-[#00A63E] focus:bg-white rounded-lg px-4 text-sm text-[#1C1C1C] placeholder-[#9CA3AF] transition-all outline-none"
              />
            </div>

            <div>
              <input
                id="password-input"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 bg-[#F4F7F5] border border-transparent focus:border-[#00A63E] focus:bg-white rounded-lg px-4 text-sm text-[#1C1C1C] placeholder-[#9CA3AF] transition-all outline-none"
              />
            </div>

            <div className="pt-2">
              <button
                id="login-btn"
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 flex items-center justify-center px-4 bg-[#00A63E] hover:bg-[#009236] active:bg-[#007D2E] text-white text-sm font-semibold rounded-lg shadow-sm transition-all active:scale-[0.99] disabled:opacity-60"
              >
                <span>{isSubmitting ? 'Logging in...' : 'Login'}</span>
              </button>
            </div>
          </form>

          {/* Footer note */}
          <p className="mt-6 text-center text-[11px] text-[#9CA3AF]">
            ReachInbox Outbox Assignment · Enterprise Distributed Scheduler
          </p>
        </div>
      </div>
    </div>
  );
};
