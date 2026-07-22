import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Button, Spinner, TextField } from '../components/ui';
import { useStore } from '../store';

// Each label must fit one line at 375px. A chip that wraps inside its own
// pill reads as broken, and "Compare two projects" still routes to the
// compare branch, which answers by listing what is available to compare.
const SUGGESTIONS = [
  'Ready to move projects',
  'Compare two projects',
  'Which leads match Kokapet?',
];

export function ChatTab() {
  const chat = useStore((s) => s.chat);
  const chatPending = useStore((s) => s.chatPending);
  const loadChat = useStore((s) => s.loadChat);
  const askChat = useStore((s) => s.askChat);
  const clearChat = useStore((s) => s.clearChat);

  const projects = useStore((s) => s.projects);
  const leads = useStore((s) => s.leads);
  const loadProjects = useStore((s) => s.loadProjects);
  const loadLeads = useStore((s) => s.loadLeads);

  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadChat();
    // Context counts must be real, so the underlying stores get loaded here.
    void loadProjects();
    void loadLeads();
  }, [loadChat, loadProjects, loadLeads]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [chat.items.length, chatPending]);

  const send = (text: string) => {
    const question = text.trim();
    if (question === '' || chatPending) return;
    setDraft('');
    void askChat(question);
  };

  const empty = chat.items.length === 0;

  return (
    <div className="flex min-h-[calc(100dvh-190px)] flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted text-[13px]">
          Answering from {projects.items.length} projects and {leads.items.length} leads
        </p>
        {!empty ? (
          <Button size="sm" variant="ghost" onClick={() => void clearChat()}>
            Clear
          </Button>
        ) : null}
      </div>

      <div className="flex-1">
        {empty ? (
          <div className="bg-surface hairline rounded-[11px] px-4 py-8 text-center">
            <p className="text-[14px] font-medium">Ask about your inventory</p>
            <p className="text-muted mx-auto mt-1 max-w-[40ch] text-[13px]">
              Everything is answered from the projects and leads already on this device.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="bg-sunken hairline text-ink min-h-[36px] rounded-full px-3.5 text-[13px] font-medium"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="grid gap-2.5">
            {chat.items.map((message) => (
              <li
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`rise max-w-[85%] rounded-[12px] px-3.5 py-2.5 text-[14px] leading-[1.55] whitespace-pre-wrap ${
                    message.role === 'user'
                      ? 'bg-[var(--c-new-bg)] text-[var(--c-new-ink)]'
                      : 'bg-surface hairline'
                  }`}
                >
                  {message.text}
                </div>
              </li>
            ))}
            {chatPending ? (
              <li className="flex justify-start">
                <div className="bg-surface hairline text-muted flex items-center gap-2 rounded-[12px] px-3.5 py-2.5 text-[13px]">
                  <Spinner /> Thinking…
                </div>
              </li>
            ) : null}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      <div className="bg-bg hairline-t sticky bottom-0 -mx-4 flex gap-2 px-4 pt-3 pb-3">
        <TextField
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              send(draft);
            }
          }}
          placeholder="Ask about projects or leads"
          aria-label="Ask a question"
        />
        <Button
          variant="primary"
          onClick={() => send(draft)}
          disabled={draft.trim() === '' || chatPending}
          aria-label="Send"
        >
          <Icon name="send" />
        </Button>
      </div>
    </div>
  );
}
