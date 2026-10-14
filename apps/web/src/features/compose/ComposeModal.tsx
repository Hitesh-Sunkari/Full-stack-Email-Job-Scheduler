import React, { useState, useRef, useEffect } from 'react';
import { SenderAccount, LeadParseResult } from '../../types/api';
import { parseLeadFile } from '../../lib/csv-parser';
import {
  ArrowLeft, Paperclip, Clock, Upload,
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, List, ListOrdered, Quote, Image as ImageIcon, Undo, Redo,
  ChevronDown, Calendar, AlertCircle, X, Check
} from 'lucide-react';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  senders: SenderAccount[];
  userEmail?: string;
  onCreateEtherealSender: () => Promise<void>;
  isCreatingSender: boolean;
  onSchedule: (payload: {
    subject: string;
    body: string;
    senderId: string;
    startTime: string;
    configuredDelayMs: number;
    hourlyLimit: number;
    recipients: string[];
  }) => Promise<void>;
  isScheduling: boolean;
}

const SEND_LATER_OPTIONS = [
  { label: 'Tomorrow', value: 'tomorrow_default' },
  { label: 'Tomorrow, 10:00 AM', value: 'tomorrow_10am' },
  { label: 'Tomorrow, 11:00 AM', value: 'tomorrow_11am' },
  { label: 'Tomorrow, 3:00 PM', value: 'tomorrow_3pm' },
];

function getOptionTime(val: string): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const iso = (h: number) => {
    tomorrow.setHours(h, 0, 0, 0);
    const offset = tomorrow.getTimezoneOffset() * 60000;
    return new Date(tomorrow.getTime() - offset).toISOString().slice(0, 16);
  };
  switch (val) {
    case 'tomorrow_default': return iso(9);
    case 'tomorrow_10am':    return iso(10);
    case 'tomorrow_11am':    return iso(11);
    case 'tomorrow_3pm':     return iso(15);
    default:                 return iso(9);
  }
}


export const ComposeModal: React.FC<ComposeModalProps> = ({
  isOpen,
  onClose,
  senders,
  userEmail,
  onCreateEtherealSender,
  isCreatingSender,
  onSchedule,
  isScheduling,
}) => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [senderId, setSenderId] = useState(senders[0]?.id || '');
  const [startTime, setStartTime] = useState('');
  const [delayVal, setDelayVal] = useState('00');
  const [hourlyVal, setHourlyVal] = useState('00');

  const [recipientInput, setRecipientInput] = useState('');
  const [recipientTags, setRecipientTags] = useState<string[]>([]);
  const [parseResult, setParseResult] = useState<LeadParseResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Scheduling states: null selectedOption means nothing picked yet
  const [isScheduled, setIsScheduled] = useState(false);
  const [showSendLater, setShowSendLater] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [pickCustom, setPickCustom] = useState(false);
  // Temp state while popover is open — only committed on Done
  const [tempOption, setTempOption] = useState<string | null>(null);
  const [tempCustomTime, setTempCustomTime] = useState('');
  const [tempPickCustom, setTempPickCustom] = useState(false);
  const sendLaterRef = useRef<HTMLDivElement>(null);

  // File attachments (like Gmail: 25MB per file)
  const MAX_ATTACH_BYTES = 25 * 1024 * 1024; // 25 MB
  const [attachments, setAttachments] = useState<Array<{ name: string; size: number; dataUrl: string }>>([]);
  const [uploadListMsg, setUploadListMsg] = useState('');
  const attachInputRef = useRef<HTMLInputElement>(null); // header paperclip
  const listInputRef = useRef<HTMLInputElement>(null);   // Upload List CSV
  const imgInputRef = useRef<HTMLInputElement>(null);    // insert image in body
  const editorRef = useRef<HTMLDivElement>(null);

  // Toolbar active-state tracking
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [showFontMenu, setShowFontMenu] = useState(false);
  const [showAlignMenu, setShowAlignMenu] = useState(false);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const alignMenuRef = useRef<HTMLDivElement>(null);

  const FONT_SIZES = ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '32px'];
  const ALIGN_OPTIONS = [
    { cmd: 'justifyLeft',   label: 'Left',    icon: '⬛︎' },
    { cmd: 'justifyCenter', label: 'Center',  icon: '▣' },
    { cmd: 'justifyRight',  label: 'Right',   icon: '▪' },
    { cmd: 'justifyFull',  label: 'Justify', icon: '▤' },
  ];

  useEffect(() => {
    if (!senderId && senders.length > 0) setSenderId(senders[0].id);
  }, [senders, senderId]);

  useEffect(() => {
    if (isOpen) {
      setIsScheduled(false);
      setShowSendLater(false);
      setSelectedOption(null);
      setPickCustom(false);
      setTempOption(null);
      setTempCustomTime('');
      setTempPickCustom(false);
      setStartTime('');
      // Reset compose form
      setSubject('');
      setRecipientTags([]);
      setRecipientInput('');
      setParseResult(null);
      setErrorMsg('');
      setAttachments([]);
      setUploadListMsg('');
      if (editorRef.current) editorRef.current.innerHTML = '';
    }
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sendLaterRef.current && !sendLaterRef.current.contains(e.target as Node)) {
        setShowSendLater(false);
      }
      if (fontMenuRef.current && !fontMenuRef.current.contains(e.target as Node)) setShowFontMenu(false);
      if (alignMenuRef.current && !alignMenuRef.current.contains(e.target as Node)) setShowAlignMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!isOpen) return null;

  const addTag = (email: string) => {
    const t = email.trim().toLowerCase();
    if (!t || recipientTags.includes(t)) return;
    const next = [...recipientTags, t];
    setRecipientTags(next);
    setParseResult(parseLeadFile(next.join('\n')));
    setRecipientInput('');
  };

  const removeTag = (email: string) => {
    const next = recipientTags.filter((t) => t !== email);
    setRecipientTags(next);
    setParseResult(next.length > 0 ? parseLeadFile(next.join('\n')) : null);
  };

  const handleRecipientKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      addTag(recipientInput);
    } else if (e.key === 'Backspace' && !recipientInput && recipientTags.length > 0) {
      removeTag(recipientTags[recipientTags.length - 1]);
    }
  };

  // Upload List (CSV/TXT) — parse emails and add to recipients
  const handleListUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadListMsg('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = parseLeadFile(text);
      if (result.validEmails.length === 0) {
        setUploadListMsg('No valid emails found in file.');
      } else {
        const merged = Array.from(new Set([...recipientTags, ...result.validEmails]));
        setRecipientTags(merged);
        setParseResult(parseLeadFile(merged.join('\n')));
        setUploadListMsg(`Added ${result.validEmails.length} email${result.validEmails.length > 1 ? 's' : ''} from file.`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Header paperclip — attach any file (≤ 25 MB)
  const handleAttachFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const errors: string[] = [];
    const valid: typeof attachments = [];
    files.forEach((file) => {
      if (file.size > MAX_ATTACH_BYTES) {
        errors.push(`"${file.name}" exceeds 25 MB limit.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        valid.push({ name: file.name, size: file.size, dataUrl: ev.target?.result as string });
        setAttachments((prev) => [...prev, { name: file.name, size: file.size, dataUrl: ev.target?.result as string }]);
      };
      reader.readAsDataURL(file);
    });
    if (errors.length) setErrorMsg(errors.join(' '));
    e.target.value = '';
  };

  const removeAttachment = (name: string) => {
    setAttachments((prev) => prev.filter((a) => a.name !== name));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      insertImage(src);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };


  const updateActiveFormats = () => {
    const cmds = ['bold', 'italic', 'underline', 'strikeThrough'];
    const active = new Set<string>();
    cmds.forEach((cmd) => {
      try { if (document.queryCommandState(cmd)) active.add(cmd); } catch {}
    });
    setActiveFormats(active);
  };

  const execCmd = (cmd: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    updateActiveFormats();
  };

  const insertFontSize = (size: string) => {
    editorRef.current?.focus();
    // Use fontSize execCommand with a mapped size index
    const sizeMap: Record<string, string> = {
      '10px': '1', '12px': '2', '14px': '3', '16px': '4',
      '18px': '5', '20px': '6', '24px': '7', '32px': '7',
    };
    document.execCommand('fontSize', false, sizeMap[size] || '3');
    setShowFontMenu(false);
  };

  const insertImage = (src: string) => {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, `<img src="${src}" style="max-width:100%;border-radius:4px;margin:4px 0" />`);
  };

  // Open the Send Later popover — seed temp state from current committed state
  const openSendLater = () => {
    setTempOption(selectedOption);
    setTempPickCustom(pickCustom);
    setTempCustomTime(startTime);
    setShowSendLater(true);
  };

  // Cancel — close popover, discard temp changes
  const handleCancel = () => {
    setShowSendLater(false);
    // Restore temp state to last committed (nothing changes)
  };

  // Done — commit temp selection if something was picked; revert to Send if nothing selected
  const handleSendLaterDone = () => {
    if (tempPickCustom && tempCustomTime) {
      setStartTime(tempCustomTime);
      setPickCustom(true);
      setSelectedOption(null);
      setIsScheduled(true);
    } else if (tempOption) {
      setStartTime(getOptionTime(tempOption));
      setPickCustom(false);
      setSelectedOption(tempOption);
      setIsScheduled(true);
    } else {
      // Nothing selected — revert to Send mode
      setIsScheduled(false);
      setPickCustom(false);
      setSelectedOption(null);
      setStartTime('');
    }
    setShowSendLater(false);
  };

  const handleSubmit = async (scheduleMode: boolean) => {
    setErrorMsg('');
    const targetSubject = subject.trim() || 'Project Update';
    const editorBody = editorRef.current?.innerHTML?.trim() || body.trim() || 'Hi, just following up on our meeting...';

    let activeSenderId = senderId;
    if (!activeSenderId) {
      if (senders.length > 0) {
        activeSenderId = senders[0].id;
      } else {
        try {
          await onCreateEtherealSender();
          return;
        } catch {
          setErrorMsg('Please select or create an email sender.');
          return;
        }
      }
    }

    const recipients = parseResult?.validEmails || recipientTags;
    if (recipients.length === 0) {
      setErrorMsg('Please provide at least one valid recipient.');
      return;
    }

    try {
      // If scheduleMode is true (user picked a scheduled time via Send Later): use picked startTime.
      // If scheduleMode is false (user clicked "Send" directly without scheduling): send immediately NOW (new Date().toISOString()) with zero delay.
      const scheduledIso = scheduleMode && startTime
        ? new Date(startTime).toISOString()
        : new Date().toISOString();

      const delayNum = parseInt(delayVal, 10) || 0;
      const hourlyNum = parseInt(hourlyVal, 10) || 0;

      await onSchedule({
        subject: targetSubject,
        body: editorBody,
        senderId: activeSenderId,
        startTime: scheduledIso,
        configuredDelayMs: delayNum > 0 ? delayNum * 60000 : 500,
        hourlyLimit: hourlyNum || 200,
        recipients,
      });
      onClose();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const selectedSender = senders.find((s) => s.id === senderId);
  const senderDisplay = selectedSender?.senderEmail || userEmail || 'sender@example.com';
  const MAX_TAGS = 3;
  const visibleTags = recipientTags.slice(0, MAX_TAGS);
  const extraCount = recipientTags.length - MAX_TAGS;

  return (
    <div className="cm-overlay" onClick={onClose}>
      <div className="cm-container" onClick={(e) => e.stopPropagation()}>

        {/* ════════════════════════════════════════════════════════
            HEADER: 1440 Fill x 54 Hug
           ════════════════════════════════════════════════════════ */}
        <header className="cm-header">
          <div className="cm-header-left">
            <button className="cm-back-btn" onClick={onClose} title="Back to Inbox">
              <ArrowLeft size={18} strokeWidth={2} />
            </button>
            <h1 className="cm-title">Compose New Email</h1>
          </div>

          <div className="cm-header-right">
            {/* Paperclip — attach any file (≤ 25 MB) */}
            <button
              className="cm-hdr-icon-btn"
              title="Attach File (max 25 MB)"
              onClick={() => attachInputRef.current?.click()}
            >
              <Paperclip size={18} strokeWidth={1.8} />
              {attachments.length > 0 && (
                <span className="cm-badge">{attachments.length}</span>
              )}
            </button>
            <input
              ref={attachInputRef}
              type="file"
              multiple
              onChange={handleAttachFile}
              style={{ display: 'none' }}
            />

            {/* Clock icon toggles Send Later popover */}
            <button
              className={`cm-hdr-icon-btn ${isScheduled ? 'cm-hdr-icon-btn--scheduled' : ''}`}
              title={isScheduled && startTime ? `Scheduled: ${new Date(startTime).toLocaleString()}` : 'Schedule / Send Later'}
              onClick={openSendLater}
            >
              <Clock size={18} strokeWidth={1.8} />
            </button>

            {/* Header Action Button:
                - Default: "Send"
                - Once scheduled: "Send Later" */}
            <button
              className="cm-send-later-btn"
              onClick={() => handleSubmit(isScheduled)}
              type="button"
              disabled={isScheduling}
            >
              {isScheduling ? 'Sending…' : isScheduled ? 'Send Later' : 'Send'}
            </button>
          </div>
        </header>

        {/* Error notification bar if validation fails */}
        {errorMsg && (
          <div className="cm-error-bar">
            <AlertCircle size={14} />
            <span>{errorMsg}</span>
            <button type="button" className="cm-error-x" onClick={() => setErrorMsg('')}>
              <X size={13} />
            </button>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            MAIN CONTENT AREA (1040px Centered)
           ════════════════════════════════════════════════════════ */}
        <main className="cm-main-content">

          {/* Send Later Popover */}
          {showSendLater && (
            <div className="cm-sl-dropdown" ref={sendLaterRef}>
              <div className="cm-sl-header">Send Later</div>

              <div className="cm-sl-input-card">
                <span className="cm-sl-input-label">Pick date &amp; time</span>
                <label className="cm-sl-cal-icon">
                  <Calendar size={16} strokeWidth={1.8} />
                  <input
                    type="datetime-local"
                    className="cm-sl-native-dt"
                    value={tempCustomTime}
                    onChange={(e) => {
                      setTempCustomTime(e.target.value);
                      setTempPickCustom(true);
                      setTempOption(null);
                    }}
                  />
                </label>
              </div>

              <div className="cm-sl-options">
                {SEND_LATER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`cm-sl-option ${
                      !tempPickCustom && tempOption === opt.value ? 'cm-sl-option--active' : ''
                    }`}
                    onClick={() => {
                      if (!tempPickCustom && tempOption === opt.value) {
                        // Deselect if already selected
                        setTempOption(null);
                      } else {
                        setTempOption(opt.value);
                        setTempPickCustom(false);
                        setTempCustomTime(getOptionTime(opt.value));
                      }
                    }}
                  >
                    <span>{opt.label}</span>
                    {!tempPickCustom && tempOption === opt.value && (
                      <Check size={14} className="cm-sl-opt-check" />
                    )}
                  </button>
                ))}
              </div>

              <div className="cm-sl-footer">
                <button
                  type="button"
                  className="cm-sl-cancel"
                  onClick={handleCancel}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="cm-sl-done"
                  onClick={handleSendLaterDone}
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* 1. Form Fields (1040 Fill) */}
          <section className="cm-fields-box">
            
            {/* Row 1: From (1040 Fill x 39 Hug) — shows the logged-in user's email */}
            <div className="cm-field-row">
              <span className="cm-field-label">From</span>
              <div className="cm-from-wrap">
                <span className="cm-from-display">
                  {userEmail || 'sender@example.com'}
                </span>
              </div>
              {senders.length === 0 && (
                <button
                  type="button"
                  className="cm-sender-btn"
                  onClick={onCreateEtherealSender}
                  disabled={isCreatingSender}
                >
                  {isCreatingSender ? 'Creating…' : '+ Sender'}
                </button>
              )}
            </div>

            {/* Row 2: To (1040 Fill x 39 Hug) */}
            <div className="cm-field-row cm-field-row--to">
              <span className="cm-field-label">To</span>
              <div className="cm-tags-container">
                {visibleTags.map((tag) => (
                  <span key={tag} className="cm-pill-tag">
                    {tag}
                    <button
                      type="button"
                      className="cm-pill-remove"
                      onClick={() => removeTag(tag)}
                      title="Remove"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
                {extraCount > 0 && (
                  <span className="cm-pill-tag cm-pill-tag--extra">
                    +{extraCount}
                  </span>
                )}
                <input
                  type="search"
                  className="cm-tag-input"
                  placeholder={recipientTags.length === 0 ? 'recipient@example.com' : ''}
                  value={recipientInput}
                  onChange={(e) => setRecipientInput(e.target.value)}
                  onKeyDown={handleRecipientKey}
                  onBlur={() => {
                    if (recipientInput) addTag(recipientInput);
                  }}
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  name="compose-recipients-nofill"
                />
              </div>

              {/* Upload List Button */}
              <button
                type="button"
                className="cm-upload-btn"
                onClick={() => listInputRef.current?.click()}
              >
                <Upload size={14} strokeWidth={2} />
                <span>Upload List</span>
              </button>
              <input
                ref={listInputRef}
                type="file"
                accept=".csv,.txt,text/plain,text/csv"
                onChange={handleListUpload}
                style={{ display: 'none' }}
              />
            </div>
            {uploadListMsg && (
              <div className="cm-upload-msg">{uploadListMsg}</div>
            )}

            {/* Row 3: Subject (1040 Fill x 44 Hug) */}
            <div className="cm-field-row">
              <span className="cm-field-label">Subject</span>
              <input
                className="cm-subject-input"
                type="text"
                placeholder="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            {/* Row 4: Delay between 2 emails & Hourly Limit (1040 Fill x 39 Hug) */}
            <div className="cm-field-row cm-field-row--rates">
              <div className="cm-rate-group">
                <span className="cm-rate-label">Delay between 2 emails</span>
                <input
                  type="text"
                  className="cm-rate-input"
                  maxLength={4}
                  value={delayVal}
                  onChange={(e) => setDelayVal(e.target.value)}
                />
              </div>

              <div className="cm-rate-group">
                <span className="cm-rate-label">Hourly Limit</span>
                <input
                  type="text"
                  className="cm-rate-input"
                  maxLength={4}
                  value={hourlyVal}
                  onChange={(e) => setHourlyVal(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* 2. Email Body Container: 1040 Fill x 475, Radius 10px, Neutral/50 */}
          <section className="cm-body-box">
            {/* Top Prompt / Placeholder: 127 Hug x 19 Hug */}
            <div className="cm-editor-prompt">Type Your Reply...</div>

            {/* Floating Pill Toolbar */}
            <div className="cm-toolbar">

              {/* Undo */}
              <button type="button" className="cm-tb" title="Undo"
                onMouseDown={(e) => { e.preventDefault(); execCmd('undo'); }}>
                <Undo size={14} />
              </button>

              {/* Redo */}
              <button type="button" className="cm-tb" title="Redo"
                onMouseDown={(e) => { e.preventDefault(); execCmd('redo'); }}>
                <Redo size={14} />
              </button>

              {/* Font Size Dropdown */}
              <div className="cm-tb-dropdown" ref={fontMenuRef}>
                <button type="button" className="cm-tb cm-tb--text" title="Font Size"
                  onMouseDown={(e) => { e.preventDefault(); setShowFontMenu((v) => !v); setShowAlignMenu(false); }}>
                  Tt <ChevronDown size={10} />
                </button>
                {showFontMenu && (
                  <div className="cm-tb-menu">
                    {FONT_SIZES.map((sz) => (
                      <button key={sz} type="button" className="cm-tb-menu-item"
                        onMouseDown={(e) => { e.preventDefault(); insertFontSize(sz); }}>
                        <span style={{ fontSize: sz }}>{sz}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <span className="cm-tb-divider" />

              {/* Bold */}
              <button type="button"
                className={`cm-tb ${activeFormats.has('bold') ? 'cm-tb--active' : ''}`}
                title="Bold"
                onMouseDown={(e) => { e.preventDefault(); execCmd('bold'); }}>
                <Bold size={14} strokeWidth={2.4} />
              </button>

              {/* Italic */}
              <button type="button"
                className={`cm-tb ${activeFormats.has('italic') ? 'cm-tb--active' : ''}`}
                title="Italic"
                onMouseDown={(e) => { e.preventDefault(); execCmd('italic'); }}>
                <Italic size={14} />
              </button>

              {/* Underline */}
              <button type="button"
                className={`cm-tb ${activeFormats.has('underline') ? 'cm-tb--active' : ''}`}
                title="Underline"
                onMouseDown={(e) => { e.preventDefault(); execCmd('underline'); }}>
                <Underline size={14} />
              </button>

              <span className="cm-tb-divider" />

              {/* Align Dropdown */}
              <div className="cm-tb-dropdown" ref={alignMenuRef}>
                <button type="button" className="cm-tb" title="Alignment"
                  onMouseDown={(e) => { e.preventDefault(); setShowAlignMenu((v) => !v); setShowFontMenu(false); }}>
                  <AlignLeft size={14} /> <ChevronDown size={10} />
                </button>
                {showAlignMenu && (
                  <div className="cm-tb-menu">
                    {ALIGN_OPTIONS.map((opt) => (
                      <button key={opt.cmd} type="button" className="cm-tb-menu-item"
                        onMouseDown={(e) => { e.preventDefault(); execCmd(opt.cmd); setShowAlignMenu(false); }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <span className="cm-tb-divider" />

              {/* Numbered List */}
              <button type="button" className="cm-tb" title="Numbered List"
                onMouseDown={(e) => { e.preventDefault(); execCmd('insertOrderedList'); }}>
                <ListOrdered size={14} />
              </button>

              {/* Bullet List */}
              <button type="button" className="cm-tb" title="Bullet List"
                onMouseDown={(e) => { e.preventDefault(); execCmd('insertUnorderedList'); }}>
                <List size={14} />
              </button>

              {/* Outdent */}
              <button type="button" className="cm-tb" title="Outdent"
                onMouseDown={(e) => { e.preventDefault(); execCmd('outdent'); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="12" x2="9" y2="12"/><line x1="21" y1="18" x2="3" y2="18"/><polyline points="3 10 7 12 3 14"/></svg>
              </button>

              {/* Indent */}
              <button type="button" className="cm-tb" title="Indent"
                onMouseDown={(e) => { e.preventDefault(); execCmd('indent'); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/><polyline points="17 8 21 12 17 16"/></svg>
              </button>

              {/* Blockquote */}
              <button type="button" className="cm-tb" title="Blockquote"
                onMouseDown={(e) => { e.preventDefault(); execCmd('formatBlock', 'blockquote'); }}>
                <Quote size={14} />
              </button>

              {/* Insert Image into body */}
              <button type="button" className="cm-tb" title="Insert Image"
                onMouseDown={(e) => { e.preventDefault(); imgInputRef.current?.click(); }}>
                <ImageIcon size={14} />
              </button>
              <input
                ref={imgInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: 'none' }}
              />

              {/* Strikethrough */}
              <button type="button"
                className={`cm-tb ${activeFormats.has('strikeThrough') ? 'cm-tb--active' : ''}`}
                title="Strikethrough"
                onMouseDown={(e) => { e.preventDefault(); execCmd('strikeThrough'); }}>
                <Strikethrough size={14} />
              </button>

            </div>

            {/* Editable Email Body */}
            <div
              ref={editorRef}
              className="cm-editor-area"
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => setBody((e.target as HTMLDivElement).innerHTML)}
              onKeyUp={updateActiveFormats}
              onMouseUp={updateActiveFormats}
              onSelect={updateActiveFormats}
            />
          </section>

          {/* File Attachments */}
          {attachments.length > 0 && (
            <div className="cm-attachments-list">
              {attachments.map((a) => (
                <div key={a.name} className="cm-attach-item">
                  <Paperclip size={13} className="cm-attach-icon" />
                  <span className="cm-attach-name">{a.name}</span>
                  <span className="cm-attach-sz">
                    {a.size > 1048576
                      ? `${(a.size / 1048576).toFixed(1)} MB`
                      : `${Math.round(a.size / 1024)} KB`}
                  </span>
                  <button
                    type="button"
                    className="cm-attach-del"
                    onClick={() => removeAttachment(a.name)}
                    title="Remove"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

        </main>
      </div>
    </div>
  );
};
