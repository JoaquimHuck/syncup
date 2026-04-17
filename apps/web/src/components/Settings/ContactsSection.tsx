import { useState, FormEvent } from 'react';
import { Plus, Trash2, User, Mail, Calendar, MapPin, Building2 } from 'lucide-react';
import { useStore } from '../../store';
import { contactsApi } from '../../services/api';
import { Contact } from '@syncup/shared';
import LoadingSpinner from '../Common/LoadingSpinner';
import clsx from 'clsx';

const PROVIDERS = [
  { value: '', label: 'Unknown / Not connected' },
  { value: 'google', label: 'Google Calendar' },
  { value: 'microsoft', label: 'Outlook Calendar' },
  { value: 'apple', label: 'Apple Calendar' },
];

export default function ContactsSection() {
  const { contacts, addContact, removeContact } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [provider, setProvider] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const res = await contactsApi.create({
        name,
        email,
        city: city || undefined,
        calendarProvider: provider || undefined,
      });
      addContact(res.data);
      setName('');
      setEmail('');
      setCity('');
      setProvider('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add contact');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (contact: Contact) => {
    setDeletingId(contact.id);
    try {
      await contactsApi.delete(contact.id);
      removeContact(contact.id);
    } catch (err) {
      console.error('Delete failed', err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="card p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Cofounders & Contacts
        </h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs py-1.5 px-3">
          <Plus className="w-3.5 h-3.5" />
          Add contact
        </button>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
        Add your team. Company and internal/external status are auto-detected from their email domain.
      </p>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAdd} className="mb-6 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="contact-name">Name</label>
              <input
                id="contact-name"
                type="text"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Bruno"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label" htmlFor="contact-email">Email</label>
              <input
                id="contact-email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="bruno@company.com"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="contact-city">City (optional)</label>
              <input
                id="contact-city"
                type="text"
                className="input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="New York"
              />
            </div>
            <div>
              <label className="label" htmlFor="contact-provider">Calendar (optional)</label>
              <select
                id="contact-provider"
                className="input"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading && <LoadingSpinner size="sm" />}
              {isLoading ? 'Adding...' : 'Add contact'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Contact list */}
      {contacts.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-3">
            <User className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No contacts yet. Add your cofounders to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
            >
              {/* Avatar */}
              <div className="w-9 h-9 bg-brand-100 dark:bg-brand-900/40 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-brand-700 dark:text-brand-400">
                  {contact.name.charAt(0).toUpperCase()}
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {contact.name}
                  </p>
                  {contact.company && (
                    <span className="inline-flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full">
                      <Building2 className="w-2.5 h-2.5" />
                      {contact.company}
                    </span>
                  )}
                  <span
                    className={clsx(
                      'text-xs px-1.5 py-0.5 rounded-full font-medium',
                      contact.isInternal
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
                    )}
                  >
                    {contact.isInternal ? 'Internal' : 'External'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                    <Mail className="w-3 h-3 flex-shrink-0" />
                    {contact.email}
                  </span>
                  {contact.city && (
                    <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      {contact.city}
                    </span>
                  )}
                  {contact.calendarProvider && (
                    <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <Calendar className="w-3 h-3 flex-shrink-0" />
                      {contact.calendarProvider}
                    </span>
                  )}
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={() => handleDelete(contact)}
                disabled={deletingId === contact.id}
                className="btn-ghost p-1.5 text-slate-400 hover:text-red-500 dark:hover:text-red-400 flex-shrink-0"
                title="Remove contact"
              >
                {deletingId === contact.id ? <LoadingSpinner size="sm" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
