import React from 'react';
import { ScheduledEmailItem } from '../../types/api';
import { StatusBadge } from '../../components/StatusBadge';
import { format } from 'date-fns';
import { Mail, CheckCircle2, ExternalLink, AlertCircle } from 'lucide-react';

interface SentEmailsTableProps {
  emails: ScheduledEmailItem[];
  isLoading: boolean;
}

export const SentEmailsTable: React.FC<SentEmailsTableProps> = ({ emails, isLoading }) => {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-card">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 mb-3 animate-spin">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <p className="text-sm font-medium text-slate-600">Loading dispatched emails...</p>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-16 text-center shadow-card">
        <div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
          <Mail className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">No dispatched emails yet</h3>
        <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
          Once your scheduled emails are picked up and delivered by the BullMQ worker, they will appear here with live SMTP message receipts.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="py-3.5 px-6">Recipient</th>
              <th className="py-3.5 px-6">Subject</th>
              <th className="py-3.5 px-6">Sender</th>
              <th className="py-3.5 px-6">Delivered At</th>
              <th className="py-3.5 px-6">Status</th>
              <th className="py-3.5 px-6 text-right">Ethereal Preview</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-700">
            {emails.map((email) => {
              const dateVal = email.sentAt ? new Date(email.sentAt) : new Date(email.updatedAt);
              const formattedTime = !isNaN(dateVal.getTime())
                ? format(dateVal, 'MMM dd, yyyy · hh:mm:ss a')
                : '—';

              return (
                <tr key={email.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-4 px-6 font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="truncate max-w-[200px]" title={email.recipient}>
                        {email.recipient}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-slate-800">
                    <span className="truncate block max-w-[280px]" title={email.subject}>
                      {email.subject}
                    </span>
                    {email.lastError && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 mt-0.5">
                        <AlertCircle className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate max-w-[260px]" title={email.lastError}>
                          {email.lastError}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-xs text-slate-600">
                    <span className="font-mono bg-slate-100 px-2 py-1 rounded border border-slate-200">
                      {email.senderEmail || 'Default'}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5 font-medium">
                      <span>{formattedTime}</span>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <StatusBadge status={email.status} />
                  </td>
                  <td className="py-4 px-6 text-right">
                    {email.etherealPreviewUrl ? (
                      <a
                        href={email.etherealPreviewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors shadow-sm"
                        title="Open interactive Ethereal email viewer"
                      >
                        <span>View Preview</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">
                        {email.status === 'FAILED' ? 'N/A' : 'Direct SMTP'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
