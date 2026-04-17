import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Users, Clock, Calendar, Trash2 } from 'lucide-react';
import { meetingsApi } from '../../services/api';
import { Meeting } from '@syncup/shared';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isSameMonth, isToday } from 'date-fns';
import LoadingSpinner from '../Common/LoadingSpinner';
import clsx from 'clsx';

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  const handleCancel = async (meetingId: string) => {
    await meetingsApi.delete(meetingId);
    setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
    setSelectedMeeting(null);
  };

  useEffect(() => {
    meetingsApi
      .list()
      .then((res) => setMeetings(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const meetingsOnDay = (day: Date) =>
    meetings.filter((m) => isSameDay(new Date(m.startTime), day));

  const selectedDayMeetings = selectedDay ? meetingsOnDay(selectedDay) : [];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center gap-4">
          <h1 className="font-semibold text-slate-900 dark:text-white">Calendar</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1))}
              className="btn-ghost p-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 w-32 text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <button
              onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1))}
              className="btn-ghost p-1.5"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <button
          onClick={() => setCurrentMonth(new Date())}
          className="btn-secondary text-xs py-1.5 px-3"
        >
          Today
        </button>
      </header>

      <div className="flex-1 overflow-hidden flex">
        {/* Calendar grid */}
        <div className="flex-1 overflow-auto p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="text-xs font-medium text-slate-400 text-center py-2">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-700 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
            {days.map((day) => {
              const dayMeetings = meetingsOnDay(day);
              const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
              const inMonth = isSameMonth(day, currentMonth);

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => {
                    setSelectedDay(isSameDay(day, selectedDay ?? new Date(0)) ? null : day);
                    setSelectedMeeting(null);
                  }}
                  className={clsx(
                    'min-h-[88px] p-2 text-left transition-colors bg-white dark:bg-slate-800',
                    isSelected && 'ring-2 ring-inset ring-brand-500',
                    !inMonth && 'opacity-40',
                    'hover:bg-slate-50 dark:hover:bg-slate-750',
                  )}
                >
                  <span
                    className={clsx(
                      'inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-medium mb-1',
                      isToday(day)
                        ? 'bg-brand-600 text-white'
                        : 'text-slate-700 dark:text-slate-300',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  <div className="space-y-0.5">
                    {dayMeetings.slice(0, 3).map((m) => (
                      <div
                        key={m.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDay(day);
                          setSelectedMeeting(m);
                        }}
                        className="text-xs truncate px-1.5 py-0.5 rounded bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 hover:bg-brand-200 dark:hover:bg-brand-800/60 transition-colors"
                      >
                        {format(new Date(m.startTime), 'h:mm a')} {m.title}
                      </div>
                    ))}
                    {dayMeetings.length > 3 && (
                      <div className="text-xs text-slate-400 pl-1.5">
                        +{dayMeetings.length - 3} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Side panel — day meetings or meeting detail */}
        {selectedDay && (
          <div className="w-80 flex-shrink-0 border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-y-auto">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white text-sm">
                  {format(selectedDay, 'EEEE, MMMM d')}
                </p>
                <p className="text-xs text-slate-500">
                  {selectedDayMeetings.length} meeting{selectedDayMeetings.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={() => { setSelectedDay(null); setSelectedMeeting(null); }} className="btn-ghost p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedMeeting ? (
              <MeetingDetail meeting={selectedMeeting} onBack={() => setSelectedMeeting(null)} onCancel={handleCancel} />
            ) : (
              <div className="p-3 space-y-2">
                {selectedDayMeetings.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No meetings this day</p>
                ) : (
                  selectedDayMeetings.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedMeeting(m)}
                      className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
                    >
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{m.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {format(new Date(m.startTime), 'h:mm a')} – {format(new Date(m.endTime), 'h:mm a')}
                      </p>
                      {m.attendees.length > 0 && (
                        <p className="text-xs text-slate-400 mt-1 truncate">
                          {m.attendees.map((a) => a.contact.name).join(', ')}
                        </p>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MeetingDetail({ meeting, onBack, onCancel }: { meeting: Meeting; onBack: () => void; onCancel: (id: string) => Promise<void> }) {
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const durationMin = Math.round(
    (new Date(meeting.endTime).getTime() - new Date(meeting.startTime).getTime()) / 60000,
  );

  return (
    <div className="p-4 space-y-4">
      <button onClick={onBack} className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
        <ChevronLeft className="w-3 h-3" /> Back
      </button>

      <div>
        <h3 className="font-semibold text-slate-900 dark:text-white">{meeting.title}</h3>
        {meeting.description && (
          <p className="text-sm text-slate-500 mt-1">{meeting.description}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <Calendar className="w-4 h-4 flex-shrink-0" />
          {format(new Date(meeting.startTime), 'EEEE, MMMM d, yyyy')}
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <Clock className="w-4 h-4 flex-shrink-0" />
          {format(new Date(meeting.startTime), 'h:mm a')} – {format(new Date(meeting.endTime), 'h:mm a')}
          <span className="text-slate-400">·</span> {durationMin} min
        </div>
        {meeting.attendees.length > 0 && (
          <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
            <Users className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              {meeting.attendees.map((a) => (
                <div key={a.contactId}>
                  <span className="font-medium text-slate-700 dark:text-slate-300">{a.contact.name}</span>
                  <span className="text-slate-400 text-xs ml-1">{a.contact.email}</span>
                  {(a.contact as { company?: string | null }).company && (
                    <span className="ml-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded-full">
                      {(a.contact as { company?: string | null }).company}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="text-xs text-slate-400">
        via {meeting.source}
      </div>

      {/* Cancel meeting */}
      <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
        {!confirmCancel ? (
          <button
            onClick={() => setConfirmCancel(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Cancel meeting
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-600 dark:text-slate-400 text-center">
              Remove from SyncUp{meeting.source === 'google' ? ' and Google Calendar' : ''}?
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setCancelling(true);
                  await onCancel(meeting.id);
                  setCancelling(false);
                }}
                disabled={cancelling}
                className="flex-1 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
              >
                {cancelling ? 'Cancelling…' : 'Yes, cancel'}
              </button>
              <button
                onClick={() => setConfirmCancel(false)}
                className="flex-1 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Keep it
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
