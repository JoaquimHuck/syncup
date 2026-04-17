import { useEffect, useRef, useState } from 'react';
import { Send, Trash2, Zap } from 'lucide-react';
import { useStore } from '../../store';
import { sendChatMessage, chatApi } from '../../services/api';
import { ChatMessage } from '@syncup/shared';
import ChatBubble from './ChatBubble';
import TypingIndicator from './TypingIndicator';
import CalendarBanner from './CalendarBanner';
import clsx from 'clsx';
import { v4 as uuidv4 } from 'uuid';

const SUGGESTIONS = [
  'Find me a 30-min slot with all contacts this week',
  'Schedule a strategy sync for next Tuesday',
  'What times is everyone free tomorrow afternoon?',
  'Book a 1-hour team meeting this Friday',
];

// Detect when Claude is asking for yes/no confirmation
const CONFIRM_PATTERNS = [
  /shall i (book|create|schedule)/i,
  /should i (book|create|schedule)/i,
  /would you like me to (book|create|schedule)/i,
  /want me to (book|create|go ahead)/i,
  /shall i go ahead/i,
  /confirm.*meeting/i,
  /go ahead and (create|book|schedule)/i,
  /create this meeting/i,
];

function isAwaitingConfirmation(text: string): boolean {
  return CONFIRM_PATTERNS.some((p) => p.test(text));
}

export default function ChatPage() {
  const { messages, isStreaming, addMessage, appendToLastMessage, setLastMessageMetadata, clearMessages, setStreaming } =
    useStore();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const handleSend = async (text?: string) => {
    const messageText = (text ?? input).trim();
    if (!messageText || isStreaming) return;

    setInput('');

    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString(),
    };
    addMessage(userMsg);

    const assistantMsg: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };
    addMessage(assistantMsg);
    setStreaming(true);

    await sendChatMessage(messageText, {
      onText: (t) => appendToLastMessage(t),
      onToolCall: (name) => {
        const label =
          name === 'find_slots'
            ? '\n\n_Checking calendars..._\n\n'
            : name === 'create_meeting'
              ? '\n\n_Creating calendar event..._\n\n'
              : `\n\n_Using ${name}..._\n\n`;
        appendToLastMessage(label);
      },
      onSlots: (slots) => {
        setLastMessageMetadata({ suggestedSlots: slots, actionType: 'slots_presented' });
      },
      onDone: () => setStreaming(false),
      onError: (error) => {
        appendToLastMessage(`\n\n_Error: ${error}_`);
        setStreaming(false);
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = async () => {
    await chatApi.clearHistory();
    clearMessages();
  };

  // Determine quick-reply chips to show above the input
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const showConfirmChips =
    !isStreaming &&
    lastAssistant &&
    isAwaitingConfirmation(lastAssistant.content) &&
    !lastAssistant.metadata?.suggestedSlots?.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex-shrink-0 h-16 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-slate-900 dark:text-white text-sm">SyncUp Assistant</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isStreaming ? 'Thinking...' : 'Ready to schedule'}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="btn-ghost text-xs gap-1.5 text-slate-500"
            title="Clear conversation"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        )}
      </header>

      <CalendarBanner />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                Hi, I'm SyncUp
              </h2>
              <p className="text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                I can help you schedule meetings by checking everyone's calendar and finding the
                best times. Just tell me what you need.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="text-left p-4 card hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-md transition-all cursor-pointer group"
                >
                  <p className="text-sm text-slate-700 dark:text-slate-300 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors">
                    "{s}"
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg, idx) => (
              <ChatBubble
                key={msg.id}
                message={msg}
                isLastAssistant={msg.role === 'assistant' && idx === messages.length - 1 && isStreaming}
                onSend={handleSend}
              />
            ))}
            {isStreaming && messages[messages.length - 1]?.content === '' && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <div className="max-w-3xl mx-auto space-y-3">
          {/* Quick-reply confirm chips */}
          {showConfirmChips && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleSend('Yes, go ahead and create the meeting')}
                className="px-4 py-2 rounded-full text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 transition-colors shadow-sm"
              >
                ✓ Yes, book it
              </button>
              <button
                onClick={() => handleSend('No, cancel that')}
                className="px-4 py-2 rounded-full text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                ✕ No, cancel
              </button>
              <button
                onClick={() => handleSend('Show me different time options')}
                className="px-4 py-2 rounded-full text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                ↺ Show other times
              </button>
            </div>
          )}

          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me to schedule a meeting..."
                className="input resize-none min-h-[44px] max-h-32 py-3 pr-12"
                rows={1}
                disabled={isStreaming}
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = 'auto';
                  t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
                }}
              />
            </div>
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isStreaming}
              className={clsx(
                'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-all',
                input.trim() && !isStreaming
                  ? 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed',
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
