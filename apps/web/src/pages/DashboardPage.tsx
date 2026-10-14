import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { ComposeModal } from '../features/compose/ComposeModal';
import { EmailDetailView } from '../features/email-detail/EmailDetailView';
import { SlackBanner } from '../features/slack/SlackBanner';
import { format } from 'date-fns';
import {
  Search, Clock, Star, Send, RefreshCw,
  Filter, ChevronDown, LogOut, X
} from 'lucide-react';

type TabType = 'scheduled' | 'sent';

interface DisplayEmail {
  id: string;
  recipient: string;
  recipientEmail: string;
  senderEmail: string;
  subject: string;
  body: string;
  bodyPreview: string;
  scheduledAt: string;
  sentAt: string | null;
  status: string;
  etherealPreviewUrl?: string | null;
  lastError?: string | null;
}


function formatScheduleTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return format(d, 'EEE h:mm:ss a');
  } catch {
    return isoStr;
  }
}

export const DashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('scheduled');
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<DisplayEmail | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'starred'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [slackFeedback, setSlackFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Handle Slack OAuth return redirect query parameters (?slack=connected or ?slack_error=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slackParam = params.get('slack');
    const slackError = params.get('slack_error');
    if (slackParam === 'connected') {
      queryClient.invalidateQueries({ queryKey: ['slack-status'] });
      setSlackFeedback({ type: 'success', message: 'Slack connected successfully! Live alerts are now active.' });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (slackError) {
      setSlackFeedback({ type: 'error', message: `Slack connection error: ${decodeURIComponent(slackError)}` });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [queryClient]);

  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.auth.me(),
    retry: false,
  });

  const { data: stats } = useQuery({
    queryKey: ['email-stats'],
    queryFn: () => api.emails.getStats(),
    refetchInterval: 8000,
  });

  const { data: scheduledEmails = [], isLoading: scheduledLoading } = useQuery({
    queryKey: ['scheduled-emails'],
    queryFn: () => api.emails.getScheduled(1, 100),
    refetchInterval: 6000,
    enabled: activeTab === 'scheduled',
  });

  const { data: sentEmails = [], isLoading: sentLoading } = useQuery({
    queryKey: ['sent-emails'],
    queryFn: () => api.emails.getSent(1, 100),
    refetchInterval: 6000,
    enabled: activeTab === 'sent',
  });

  const { data: senders = [] } = useQuery({
    queryKey: ['senders'],
    queryFn: () => api.senders.list(),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.emails.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-emails'] });
      queryClient.invalidateQueries({ queryKey: ['email-stats'] });
    },
  });

  const createEtherealMutation = useMutation({
    mutationFn: () => api.senders.createEthereal(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['senders'] }),
  });

  const scheduleMutation = useMutation({
    mutationFn: (payload: Parameters<typeof api.emails.schedule>[0]) =>
      api.emails.schedule(payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-emails'] });
      queryClient.invalidateQueries({ queryKey: ['sent-emails'] });
      queryClient.invalidateQueries({ queryKey: ['email-stats'] });
      setIsComposeOpen(false);

      // If this was an immediate send (within 15 seconds of now), switch to Sent tab
      const isImmediate = Math.abs(new Date(variables.startTime).getTime() - Date.now()) < 15000;
      if (isImmediate) {
        setActiveTab('sent');
        // Ethereal SMTP delivery finishes within 800-1500ms; refetch so it lands in Sent
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['scheduled-emails'] });
          queryClient.invalidateQueries({ queryKey: ['sent-emails'] });
          queryClient.invalidateQueries({ queryKey: ['email-stats'] });
        }, 1200);
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['scheduled-emails'] });
          queryClient.invalidateQueries({ queryKey: ['sent-emails'] });
          queryClient.invalidateQueries({ queryKey: ['email-stats'] });
        }, 3000);
      } else {
        setActiveTab('scheduled');
      }
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => {
      window.location.href = '/';
    },
  });

  const { data: slackStatus = null, isLoading: slackLoading } = useQuery({
    queryKey: ['slack-status'],
    queryFn: () => api.slack.getStatus(),
    refetchInterval: 12000,
  });

  const disconnectSlackMutation = useMutation({
    mutationFn: () => api.slack.disconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slack-status'] });
      setSlackFeedback({ type: 'success', message: 'Slack disconnected successfully' });
      setTimeout(() => setSlackFeedback(null), 4000);
    },
    onError: (err: any) => {
      setSlackFeedback({
        type: 'error',
        message: err?.response?.data?.error?.message || err?.message || 'Failed to disconnect Slack',
      });
    },
  });

  const sendSlackTestMutation = useMutation({
    mutationFn: () => api.slack.sendTest(),
    onSuccess: (res) => {
      setSlackFeedback({ type: 'success', message: res?.message || 'Live test alert sent to your Slack channel!' });
      setTimeout(() => setSlackFeedback(null), 6000);
    },
    onError: (err: any) => {
      setSlackFeedback({
        type: 'error',
        message: err?.response?.data?.error?.message || err?.message || 'Failed to send test alert',
      });
    },
  });

  // Map real emails to DisplayEmail format
  const rawList = activeTab === 'scheduled' ? scheduledEmails : sentEmails;
  const dbMapped: DisplayEmail[] = rawList.map((e) => {
    const rawRecipient = e.recipient || '';
    const namePart = rawRecipient.includes('@')
      ? rawRecipient.split('@')[0].replace(/[._]/g, ' ')
      : rawRecipient;
    const displayName = namePart
      ? namePart.charAt(0).toUpperCase() + namePart.slice(1)
      : 'Recipient';

    // Strip HTML tags and template vars for clean preview
    const cleanBody = (e.body || '')
      .replace(/<[^>]*>/g, '')           // strip HTML tags
      .replace(/\{\{[^}]*\}\}/g, '')     // remove {{name}} etc.
      .replace(/\s{2,}/g, ' ')           // collapse multiple spaces
      .replace(/(Hi|Hello|Dear|Hey)\s+,/gi, '$1,') // fix "Hi ," → "Hi,"
      .replace(/\s,/g, ',')              // fix any orphaned " ," patterns
      .trim();

    return {
      id: e.id,
      recipient: displayName,
      recipientEmail: rawRecipient,
      senderEmail: e.senderEmail || userEmail,
      subject: e.subject,
      body: e.body || '',
      bodyPreview: cleanBody || 'No preview available',
      scheduledAt: e.scheduledAt,
      sentAt: e.sentAt,
      status: e.status,
      etherealPreviewUrl: e.etherealPreviewUrl,
      lastError: e.lastError,
    };
  });

  // Use real emails only — show empty state if none
  const emailList: DisplayEmail[] = dbMapped;

  // Apply search + filter
  const activeEmails = emailList.filter((e) => {
    const matchesSearch =
      !searchQuery ||
      e.recipient.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.bodyPreview.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      activeFilter === 'all' || (activeFilter === 'starred' && starredIds.has(e.id));
    return matchesSearch && matchesFilter;
  });

  const isLoading = activeTab === 'scheduled' ? scheduledLoading : sentLoading;
  const userName = user?.name || 'Oliver Brown';
  const userEmail = user?.email || 'oliver.brown@domain.io';
  const userAvatar = user?.avatarUrl || '/avatar.jpg';

  const scheduledCount = stats?.totalPending ?? scheduledEmails.length;
  const sentCount = stats?.totalSent ?? sentEmails.length;

  const toggleStar = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="ri-layout">
      {/* ════════════════════════════════════════════════════════
          SIDEBAR (260px Fixed x 900 Fill)
         ════════════════════════════════════════════════════════ */}
      <aside className="ri-sidebar">
        {/* ONB Brand Logo */}
        <div className="ri-logo">
          <span className="ri-logo-text">ONB</span>
        </div>

        {/* User Profile Card */}
        <div className="ri-profile-card" title={userEmail}>
          <img
            src={userAvatar}
            alt={userName}
            className="ri-avatar-img"
            onError={(e) => {
              // fallback if image fails
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div className="ri-profile-info">
            <span className="ri-profile-name">{userName}</span>
            <span className="ri-profile-email">{userEmail}</span>
          </div>
          <ChevronDown size={14} className="ri-profile-chevron" />
        </div>

        {/* Compose Button (Green Pill Outline) */}
        <button
          id="compose-btn"
          className="ri-compose-btn"
          onClick={() => setIsComposeOpen(true)}
        >
          Compose
        </button>

        {/* Navigation Section */}
        <nav className="ri-nav">
          <div className="ri-nav-label">CORE</div>
          <div className="ri-nav-list">
            <button
              id="tab-scheduled"
              className={`ri-nav-item ${activeTab === 'scheduled' ? 'ri-nav-item--active' : ''}`}
              onClick={() => setActiveTab('scheduled')}
            >
              <Clock size={16} strokeWidth={2} />
              <span>Scheduled</span>
              <span className="ri-nav-badge">{scheduledCount}</span>
            </button>

            <button
              id="tab-sent"
              className={`ri-nav-item ${activeTab === 'sent' ? 'ri-nav-item--active' : ''}`}
              onClick={() => setActiveTab('sent')}
            >
              <Send size={15} strokeWidth={1.8} />
              <span>Sent</span>
              <span className="ri-nav-badge">{sentCount}</span>
            </button>
          </div>
        </nav>

        {/* Logout at bottom */}
        <div className="ri-sidebar-footer">
          <button
            className="ri-logout-btn"
            onClick={() => logoutMutation.mutate()}
            title="Sign out of ReachInbox"
          >
            <LogOut size={14} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ════════════════════════════════════════════════════════
          MAIN CONTENT PANEL (1180px Fill x 900 Fill)
         ════════════════════════════════════════════════════════ */}
      <main className="ri-main">
        {/* Top Toolbar / Search */}
        <header className="ri-toolbar">
          <div className="ri-search-wrap">
            <Search size={14} className="ri-search-icon" />
            <input
              id="search-input"
              type="text"
              className="ri-search-input"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
            />
            {searchQuery && (
              <button
                className="ri-search-clear"
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="ri-toolbar-actions">
            {/* Filter dropdown */}
            <div className="ri-filter-wrap" ref={filterRef}>
              <button
                className={`ri-icon-btn ${activeFilter !== 'all' ? 'ri-icon-btn--active' : ''}`}
                title="Filter emails"
                onClick={() => setFilterOpen((v) => !v)}
              >
                <Filter size={15} />
                {activeFilter !== 'all' && <span className="ri-filter-dot" />}
              </button>
              {filterOpen && (
                <div className="ri-filter-menu">
                  <div className="ri-filter-title">Filter by</div>
                  {(['all', 'starred'] as const).map((f) => (
                    <button
                      key={f}
                      className={`ri-filter-item ${activeFilter === f ? 'ri-filter-item--active' : ''}`}
                      onClick={() => { setActiveFilter(f); setFilterOpen(false); }}
                    >
                      {f === 'all' ? 'All emails' : '⭐ Starred'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Refresh */}
            <button
              id="refresh-btn"
              className={`ri-icon-btn ${isRefreshing ? 'ri-icon-btn--spinning' : ''}`}
              title="Refresh inbox"
              onClick={() => {
                setIsRefreshing(true);
                queryClient.invalidateQueries({ queryKey: ['scheduled-emails'] });
                queryClient.invalidateQueries({ queryKey: ['sent-emails'] });
                queryClient.invalidateQueries({ queryKey: ['email-stats'] });
                setTimeout(() => setIsRefreshing(false), 800);
              }}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </header>

        {/* Slack Live Rate-Limit Alerts Banner */}
        <div className="px-6 pt-2 pb-1">
          <SlackBanner
            status={slackStatus}
            onDisconnect={() => disconnectSlackMutation.mutate()}
            isLoading={disconnectSlackMutation.isPending || slackLoading}
            onSendTest={() => sendSlackTestMutation.mutate()}
            isTesting={sendSlackTestMutation.isPending}
            testFeedback={slackFeedback}
          />
        </div>

        {/* Email Rows List */}
        <div className="ri-email-list">
          {isLoading && dbMapped.length === 0 ? (
            <div className="ri-empty-state">
              <div className="ri-spinner" />
              <p className="ri-empty-title">Loading emails…</p>
            </div>
          ) : activeEmails.length === 0 ? (
            <div className="ri-empty-state">
              <Clock size={32} className="ri-empty-icon" />
              <p className="ri-empty-title">
                {activeTab === 'scheduled' ? 'No scheduled emails' : 'No sent emails yet'}
              </p>
              <p className="ri-empty-sub">
                {activeTab === 'scheduled'
                  ? 'Click Compose to schedule your outreach campaign.'
                  : 'Your sent emails will appear here.'}
              </p>
            </div>
          ) : (
            activeEmails.map((email) => {
              const isStarred = starredIds.has(email.id);
              const isPending = email.status !== 'SENT';
              const timeFormatted = formatScheduleTime(email.scheduledAt);

              return (
                <div
                  key={email.id}
                  className="ri-email-row"
                  onClick={() => setSelectedEmail(email)}
                >
                  {/* Recipient */}
                  <div className="ri-email-to">
                    <span className="ri-email-to-label">To:</span>
                    <span className="ri-email-to-name">{email.recipient}</span>
                  </div>

                  {/* Badge: Scheduled Time Pill or Sent Pill */}
                  {activeTab === 'scheduled' ? (
                    <div className="ri-time-badge" title={`Scheduled for: ${timeFormatted}`}>
                      <Clock size={11} strokeWidth={2.2} />
                      <span>{timeFormatted}</span>
                    </div>
                  ) : email.status === 'FAILED' ? (
                    <div className="ri-failed-badge" title={email.lastError || 'Delivery Failed'}>
                      <span>Failed</span>
                    </div>
                  ) : (
                    <div
                      className="ri-sent-badge"
                      title={`Sent: ${email.sentAt ? formatScheduleTime(email.sentAt) : 'Delivered'} | Configured: ${timeFormatted}`}
                    >
                      <span>{email.sentAt ? formatScheduleTime(email.sentAt) : 'Sent'}</span>
                    </div>
                  )}

                  {/* Subject + Body Preview */}
                  <div className="ri-email-content">
                    <span className="ri-email-subject">{email.subject}</span>
                    <span className="ri-email-dash">-</span>
                    <span className="ri-email-preview">{email.bodyPreview}</span>
                  </div>

                  {/* Actions: Cancel + Star */}
                  <div className="ri-email-actions">
                    {activeTab === 'scheduled' && !email.id.startsWith('mock') && (
                      <button
                        className="ri-cancel-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          cancelMutation.mutate(email.id);
                        }}
                        disabled={cancelMutation.isPending}
                        title="Cancel scheduled send"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      className={`ri-star-btn ${isStarred ? 'ri-star-btn--active' : ''}`}
                      onClick={(e) => toggleStar(email.id, e)}
                      title={isStarred ? 'Unstar email' : 'Star email'}
                    >
                      <Star
                        size={15}
                        strokeWidth={1.5}
                        fill={isStarred ? '#EAB308' : 'none'}
                        color={isStarred ? '#EAB308' : 'var(--c-star)'}
                      />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* ════════════════════════════════════════════════════════
          COMPOSE MODAL
         ════════════════════════════════════════════════════════ */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        senders={senders ?? []}
        userEmail={userEmail}
        onCreateEtherealSender={async () => {
          await createEtherealMutation.mutateAsync();
        }}
        isCreatingSender={createEtherealMutation.isPending}
        onSchedule={async (payload) => {
          await scheduleMutation.mutateAsync(payload);
        }}
        isScheduling={scheduleMutation.isPending}
      />

      {/* ════════════════════════════════════════════════════════
          EMAIL DETAIL VIEW (When an email is selected)
         ════════════════════════════════════════════════════════ */}
      {selectedEmail && (
        <EmailDetailView
          email={{
            id: selectedEmail.id,
            senderName: selectedEmail.senderEmail?.split('@')[0] || 'Sender',
            senderEmail: selectedEmail.senderEmail,
            recipient: selectedEmail.recipient,
            recipientEmail: selectedEmail.recipientEmail,
            subject: selectedEmail.subject,
            body: selectedEmail.body,
            bodyPreview: selectedEmail.bodyPreview,
            scheduledAt: selectedEmail.scheduledAt,
            sentAt: selectedEmail.sentAt,
            status: selectedEmail.status,
            etherealPreviewUrl: selectedEmail.etherealPreviewUrl,
            lastError: selectedEmail.lastError,
            isStarred: starredIds.has(selectedEmail.id),
          }}
          onBack={() => setSelectedEmail(null)}
          onDelete={(id) => {
            if (!id.startsWith('mock')) {
              cancelMutation.mutate(id);
            }
            setSelectedEmail(null);
          }}
          onArchive={() => {
            setSelectedEmail(null);
          }}
          onToggleStar={(id) => {
            toggleStar(id);
          }}
          userAvatar={userAvatar}
        />
      )}
    </div>
  );
};
