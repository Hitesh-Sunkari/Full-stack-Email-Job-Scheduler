import React from 'react';
import { ScheduledEmailItem } from '../../types/api';
import { StatusBadge } from '../../components/StatusBadge';
import { format } from 'date-fns';
import { Calendar, X, Clock, Mail } from 'lucide-react';

interface ScheduledEmailsTableProps {
  emails: ScheduledEmailItem[];
  isLoading: boolean;
  onCancel: (id: string) => void;
  isCancelling: boolean;
}

export const ScheduledEmailsTable: React.FC<ScheduledEmailsTableProps> = ({
  emails,
  isLoading,
  onCancel,
  isCancelling,
}) => {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-card">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 mb-3 animate-spin">
          <Clock className="w-5 h-5" />
        </div>
        <p className="text-sm font-medium text-slate-600">Loading scheduled emails...</p>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-16 text-center shadow-card">
        <div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
          <Calendar className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">No scheduled emails in queue</h3>
        <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
          Compose a new campaign or upload a CSV lead list to schedule your first batch of outbound emails.
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
              <th className="py-3.5 px-6">Scheduled Time</th>
              <th className="py-3.5 px-6">Status</th>
              <th className="py-3.5 px-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-700">
            {emails.map((email) => {
              const scheduledDate = new Date(email.scheduledAt);
              const formattedTime = !isNaN(scheduledDate.getTime())
                ? format(scheduledDate, 'MMM dd, yyyy · hh:mm:ss a')
                : email.scheduledAt;

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
                  </td>
                  <td className="py-4 px-6 text-xs text-slate-600">
                    <span className="font-mono bg-slate-100 px-2 py-1 rounded border border-slate-200">
                      {email.senderEmail || 'Default'}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formattedTime}</span>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <StatusBadge status={email.status} />
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button
                      onClick={() => onCancel(email.id)}
                      disabled={isCancelling}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors disabled:opacity-50"
                      title="Cancel this scheduled send"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </button>
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
