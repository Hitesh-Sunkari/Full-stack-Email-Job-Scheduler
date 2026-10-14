import React, { useState } from 'react';
import { format } from 'date-fns';
import {
  ArrowLeft, Star, Archive, Trash2, ExternalLink, AlertCircle, CheckCircle, Clock
} from 'lucide-react';

export interface EmailDetailData {
  id: string;
  senderName?: string;
  senderEmail?: string;
  recipient: string;
  recipientEmail?: string;
  subject: string;
  bodyPreview?: string;
  body?: string;
  scheduledAt: string;
  sentAt?: string | null;
  status: string;
  etherealPreviewUrl?: string | null;
  lastError?: string | null;
  isStarred?: boolean;
}

interface EmailDetailViewProps {
  email: EmailDetailData;
  onBack: () => void;
  onDelete?: (id: string) => void;
  onArchive?: () => void;
  onToggleStar?: (id: string) => void;
  userAvatar?: string;
}

function safeFormatDate(isoStr?: string | null, formatStr: string = 'PPpp'): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return format(d, formatStr);
  } catch {
    return isoStr;
  }
}

export const EmailDetailView: React.FC<EmailDetailViewProps> = ({
  email,
  onBack,
  onDelete,
  onArchive,
  onToggleStar,
  userAvatar = '/avatar.jpg',
}) => {
  const [isStarred, setIsStarred] = useState(email.isStarred || false);

  const handleStar = () => {
    setIsStarred((v) => !v);
    onToggleStar?.(email.id);
  };

  const senderName = email.senderName || email.senderEmail?.split('@')[0] || 'Sender';
  const senderEmail = email.senderEmail || 'outbox@reachinbox.test';
  const recipientDisplay = email.recipientEmail || email.recipient || 'recipient@example.com';
  const initial = (senderName.charAt(0) || 'S').toUpperCase();

  const formattedScheduled = safeFormatDate(email.scheduledAt, 'MMM d, yyyy h:mm a');
  const formattedSent = email.sentAt ? safeFormatDate(email.sentAt, 'MMM d, yyyy h:mm a') : null;

  return (
    <div className="ed-overlay">
      <div className="ed-container">

        {/* ════════════════════════════════════════════════════════
            HEADER: Back, Subject, Action Icons
           ════════════════════════════════════════════════════════ */}
        <header className="ed-header">
          <div className="ed-header-left">
            <button className="ed-back-btn" onClick={onBack} title="Back to inbox">
              <ArrowLeft size={18} strokeWidth={2} />
            </button>
            <h1 className="ed-title" title={email.subject}>
              {email.subject || '(No Subject)'}
            </h1>
          </div>

          <div className="ed-header-right">
            {/* Star Icon */}
            <button
              className={`ed-icon-btn ${isStarred ? 'ed-icon-btn--starred' : ''}`}
              onClick={handleStar}
              title={isStarred ? 'Starred' : 'Not starred'}
            >
              <Star
                size={17}
                strokeWidth={1.8}
                fill={isStarred ? '#EAB308' : 'none'}
                color={isStarred ? '#EAB308' : 'var(--c-text-muted)'}
              />
            </button>

            {/* Archive Icon */}
            <button
              className="ed-icon-btn"
              title="Archive"
              onClick={() => { onArchive ? onArchive() : onBack(); }}
            >
              <Archive size={17} strokeWidth={1.8} />
            </button>

            {/* Trash / Delete Icon */}
            <button
              className="ed-icon-btn ed-icon-btn--trash"
              title="Delete email"
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this email?')) {
                  onDelete?.(email.id);
                  onBack();
                }
              }}
            >
              <Trash2 size={17} strokeWidth={1.8} />
            </button>

            {/* User Avatar */}
            <div className="ed-user-avatar-wrap">
              <img
                src={userAvatar}
                alt="User profile"
                className="ed-user-avatar"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
          </div>
        </header>

        {/* ════════════════════════════════════════════════════════
            MAIN CARD: Real Email Metadata and Stored Content
           ════════════════════════════════════════════════════════ */}
        <main className="ed-main-content">
          <article className="ed-card">

            {/* Email Sender & Delivery Metadata Header */}
            <div className="ed-card-header">
              <div className="ed-sender-left">
                <div className="ed-avatar-circle">
                  <span>{initial}</span>
                </div>

                <div className="ed-sender-info">
                  <div className="ed-sender-name-row">
                    <span className="ed-sender-name">{senderName}</span>
                    <span className="ed-sender-email">&lt;{senderEmail}&gt;</span>
                  </div>
                  <div className="ed-to-row">
                    <span className="ed-to-label">to {recipientDisplay}</span>
                  </div>
                </div>
              </div>

              <div className="ed-sender-right">
                <div className="ed-meta-timestamps">
                  {formattedSent ? (
                    <>
                      <div className="ed-sent-time">
                        <CheckCircle size={13} className="ed-check-icon" />
                        <span>Sent: {formattedSent}</span>
                      </div>
                      <div className="ed-scheduled-time" title="Original configured schedule time">
                        <span>Configured: {formattedScheduled}</span>
                      </div>
                    </>
                  ) : (
                    <div className="ed-scheduled-time ed-scheduled-time--pending">
                      <Clock size={13} className="ed-clock-icon" />
                      <span>Scheduled for: {formattedScheduled}</span>
                    </div>
                  )}
                  <span className={`ed-status-tag ed-status-tag--${email.status.toLowerCase()}`}>
                    {email.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Ethereal Sandbox Notice & Preview URL */}
            {email.etherealPreviewUrl && (
              <div className="ed-ethereal-banner">
                <div className="ed-ethereal-icon">🧪</div>
                <div className="ed-ethereal-body">
                  <div className="ed-ethereal-heading">Ethereal SMTP Sandbox Delivery</div>
                  <p className="ed-ethereal-desc">
                    This message was accepted by the Ethereal test mail server. Note that Ethereal is a testing service designed for safe verification and does not deliver to real external mailboxes (such as Gmail or Outlook).
                  </p>
                </div>
                <a
                  href={email.etherealPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ed-ethereal-btn"
                >
                  <span>View in Ethereal Sandbox</span>
                  <ExternalLink size={14} />
                </a>
              </div>
            )}

            {/* Error Banner if Failed */}
            {email.status === 'FAILED' && email.lastError && (
              <div className="ed-failure-banner">
                <AlertCircle size={16} className="ed-failure-icon" />
                <div>
                  <div className="ed-failure-title">Delivery Failed</div>
                  <div className="ed-failure-msg">{email.lastError}</div>
                </div>
              </div>
            )}

            {/* Real Stored Email Message Body */}
            <div className="ed-body-content">
              {email.body && (email.body.includes('<') && email.body.includes('>')) ? (
                <div
                  className="ed-html-body"
                  dangerouslySetInnerHTML={{ __html: email.body }}
                />
              ) : (
                <div className="ed-text-body">
                  {(email.body || email.bodyPreview || 'No content provided.')
                    .split('\n')
                    .map((line, idx) => (
                      <p key={idx} className="ed-p">
                        {line || '\u00A0'}
                      </p>
                    ))}
                </div>
              )}
            </div>

          </article>
        </main>

      </div>
    </div>
  );
};
