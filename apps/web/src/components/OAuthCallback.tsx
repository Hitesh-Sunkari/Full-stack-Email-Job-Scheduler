import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Handles the redirect from Google OAuth (/auth/google/callback).
 * The backend sets a session cookie and then redirects here,
 * so we just forward to the dashboard.
 */
export const OAuthCallback: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error) {
      navigate(`/?error=${error}`, { replace: true });
    } else {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-300 text-sm">Completing sign-in…</p>
      </div>
    </div>
  );
};
