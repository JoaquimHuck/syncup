/**
 * Global application state (Zustand)
 */
import { create } from 'zustand';
import { User, Contact, Meeting, ChatMessage, ChatMessageMetadata } from '@syncup/shared';

interface AppState {
  // Auth
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;

  // Theme
  darkMode: boolean;
  toggleDarkMode: () => void;

  // Contacts
  contacts: Contact[];
  setContacts: (contacts: Contact[]) => void;
  addContact: (contact: Contact) => void;
  updateContact: (contact: Contact) => void;
  removeContact: (id: string) => void;

  // Meetings
  meetings: Meeting[];
  setMeetings: (meetings: Meeting[]) => void;

  // Chat
  messages: ChatMessage[];
  isStreaming: boolean;
  addMessage: (message: ChatMessage) => void;
  appendToLastMessage: (text: string) => void;
  setLastMessageMetadata: (metadata: ChatMessageMetadata) => void;
  clearMessages: () => void;
  setStreaming: (streaming: boolean) => void;
}

// Persist dark mode preference
const savedDarkMode = localStorage.getItem('darkMode') === 'true';

export const useStore = create<AppState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),

  darkMode: savedDarkMode,
  toggleDarkMode: () =>
    set((state) => {
      const next = !state.darkMode;
      localStorage.setItem('darkMode', String(next));
      if (next) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return { darkMode: next };
    }),

  contacts: [],
  setContacts: (contacts) => set({ contacts }),
  addContact: (contact) => set((state) => ({ contacts: [...state.contacts, contact] })),
  updateContact: (updated) =>
    set((state) => ({
      contacts: state.contacts.map((c) => (c.id === updated.id ? updated : c)),
    })),
  removeContact: (id) =>
    set((state) => ({ contacts: state.contacts.filter((c) => c.id !== id) })),

  meetings: [],
  setMeetings: (meetings) => set({ meetings }),

  messages: [],
  isStreaming: false,
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  appendToLastMessage: (text) =>
    set((state) => {
      const messages = [...state.messages];
      if (messages.length === 0) return state;
      const last = { ...messages[messages.length - 1] };
      last.content += text;
      messages[messages.length - 1] = last;
      return { messages };
    }),
  setLastMessageMetadata: (metadata) =>
    set((state) => {
      const messages = [...state.messages];
      if (messages.length === 0) return state;
      // Find the last assistant message
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          messages[i] = { ...messages[i], metadata: { ...messages[i].metadata, ...metadata } };
          break;
        }
      }
      return { messages };
    }),
  clearMessages: () => set({ messages: [] }),
  setStreaming: (isStreaming) => set({ isStreaming }),
}));

// Apply dark mode on startup
if (savedDarkMode) {
  document.documentElement.classList.add('dark');
}
