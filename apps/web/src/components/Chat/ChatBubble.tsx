import { ChatMessage, SuggestedSlot } from '@syncup/shared';
import { useStore } from '../../store';
import { format } from 'date-fns';
import { Calendar, Clock, ArrowRight } from 'lucide-react';
import clsx from 'clsx';

interface ChatBubbleProps {
  message: ChatMessage;
  isLastAssistant?: boolean;
  onSend: (text: string) => void;
}

export default function ChatBubble({ message, isLastAssistant, onSend }: ChatBubbleProps) {
  const user = useStore((s) => s.user);
  const isUser = message.role === 'user';
  const slots = message.metadata?.suggestedSlots ?? [];

  return (
    <div className={clsx('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {/* AI avatar */}
      {!isUser && (
        <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-700 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
          <span className="text-xs font-bold text-white">S</span>
        </div>
      )}

      <div className={clsx('flex flex-col gap-2', isUser ? 'items-end max-w-[80%]' : 'items-start w-full max-w-[85%]')}>
        {/* Text bubble */}
        {(message.content || isLastAssistant) && (
          <div className={isUser ? 'chat-bubble-user' : 'chat-bubble-assistant'}>
            {isUser ? (
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            ) : (
              <div
                className="text-sm ai-content"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
              />
            )}
            {isLastAssistant && message.content && (
              <span className="inline-block w-0.5 h-4 bg-slate-400 dark:bg-slate-500 ml-0.5 animate-pulse align-middle" />
            )}
          </div>
        )}

        {/* Slot cards */}
        {!isUser && slots.length > 0 && (
          <div className="w-full space-y-2 mt-1">
            {slots.map((slot, idx) => (
              <SlotCard
                key={idx}
                slot={slot}
                index={idx + 1}
                onSelect={() => {
                  const start = new Date(slot.start);
                  const label = format(start, "EEEE, MMMM d 'at' h:mm a");
                  onSend(`Book option ${idx + 1}: ${label}`);
                }}
              />
            ))}
          </div>
        )}

        <span className="text-xs text-slate-400 dark:text-slate-500 px-1">
          {format(new Date(message.timestamp), 'h:mm a')}
        </span>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="w-8 h-8 bg-brand-100 dark:bg-brand-900 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
          <span className="text-xs font-semibold text-brand-700 dark:text-brand-300">
            {user?.name?.charAt(0).toUpperCase() ?? 'U'}
          </span>
        </div>
      )}
    </div>
  );
}

// ---- Slot card component ----

function SlotCard({
  slot,
  index,
  onSelect,
}: {
  slot: SuggestedSlot;
  index: number;
  onSelect: () => void;
}) {
  const start = new Date(slot.start);
  const end = new Date(slot.end);
  const score = slot.score ?? 0;

  const scoreColor =
    score >= 80
      ? 'bg-green-500'
      : score >= 60
        ? 'bg-yellow-500'
        : 'bg-slate-400';

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-brand-300 dark:hover:border-brand-600 hover:shadow-md transition-all group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Option label + score */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 uppercase tracking-wide">
              Option {index}
            </span>
            <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', scoreColor)} title={`Score: ${score}`} />
            <span className="text-xs text-slate-400">{score}/100</span>
          </div>

          {/* Date */}
          <div className="flex items-center gap-1.5 text-slate-900 dark:text-white font-semibold text-sm mb-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            {format(start, 'EEEE, MMMM d')}
          </div>

          {/* Time + duration */}
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 text-sm mb-2">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
            <span className="text-slate-400">·</span>
            <span>{slot.durationMinutes} min</span>
          </div>

          {/* Reasons */}
          {slot.reasons?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {slot.reasons.slice(0, 3).map((r, i) => (
                <span
                  key={i}
                  className="inline-block text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full"
                >
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Pick button */}
        <button
          onClick={onSelect}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm group-hover:shadow-md"
        >
          Pick
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ---- Lightweight markdown renderer ----

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^[\s]*[-*•]\s(.+)/gm, '<li>$1</li>')
    .replace(/^[\s]*\d+\.\s(.+)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br />')
    .replace(/^(?!<ul>|<p>)(.+)/s, '<p>$1</p>');
}
