import React from 'react';
import { SlackConnectionInfo } from '../../types/api';
import { Bell, CheckCircle2, AlertCircle, Unlink, Send, Loader2 } from 'lucide-react';

interface SlackBannerProps {
  status: (SlackConnectionInfo & { isConfigured: boolean }) | null;
  onDisconnect: () => void;
  isLoading: boolean;
  onSendTest?: () => void;
  isTesting?: boolean;
  testFeedback?: { type: 'success' | 'error'; message: string } | null;
}

export const SlackBanner: React.FC<SlackBannerProps> = ({
  status,
  onDisconnect,
  isLoading,
  onSendTest,
  isTesting = false,
  testFeedback = null,
}) => {
  if (!status) return null;

  if (status.isConnected) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-subtle mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-950 flex items-center gap-2">
              Slack Connected
              <span className="px-2 py-0.5 text-xs font-medium bg-emerald-200/60 text-emerald-900 rounded-full">
                {status.slackTeamName || 'Workspace'}
              </span>
              <span className="text-emerald-700 font-mono text-xs">
                ({status.channelName || '#email-alerts'})
              </span>
            </p>
            <p className="text-xs text-emerald-700 mt-0.5">
              Live notifications will be posted to this channel when any sender account hits hourly rate limits.
            </p>
            {testFeedback && (
              <p
                className={`text-xs mt-1.5 font-medium inline-flex items-center gap-1.5 px-2 py-0.5 rounded ${
                  testFeedback.type === 'success'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {testFeedback.type === 'success' ? '✓' : '⚠'} {testFeedback.message}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {onSendTest && (
            <button
              onClick={onSendTest}
              disabled={isTesting || isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors shadow-sm disabled:opacity-50"
              title="Dispatches a test rate limit notification to your connected Slack channel"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                  <span>Sending…</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Send Test Alert</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={onDisconnect}
            disabled={isLoading || isTesting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            <Unlink className="w-3.5 h-3.5" />
            <span>Disconnect</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-subtle mb-4">
      <div className="flex items-start sm:items-center gap-3.5">
        <div className="p-2.5 bg-white/10 rounded-lg text-indigo-300">
          <Bell className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
            Real-Time Slack Rate-Limit Alerts
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
              Instant Webhooks
            </span>
          </h4>
          <p className="text-xs text-slate-300 mt-0.5">
            Connect your Slack workspace to receive instant notifications when sender accounts hit hourly send quotas.
          </p>
          {testFeedback && (
            <p className="text-xs mt-1.5 font-medium text-amber-300">
              {testFeedback.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 w-full sm:w-auto">
        {status.isConfigured ? (
          <a
            href="http://localhost:4000/api/integrations/slack/connect"
            className="w-full sm:w-auto text-center inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
            </svg>
            <span>Connect Slack</span>
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 bg-white/5 rounded-lg border border-white/10">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>Slack OAuth unconfigured in .env</span>
          </span>
        )}
      </div>
    </div>
  );
};
