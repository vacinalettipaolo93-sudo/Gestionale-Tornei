import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { type User } from '../types';

interface AdminUsersModalProps {
  users: User[];
  onClose: () => void;
}

interface ResetState {
  userId: string;
  newPassword: string;
  confirmPassword: string;
  error: string | null;
  saving: boolean;
  success: boolean;
  confirming: boolean;
}

const initialReset = (userId: string): ResetState => ({
  userId,
  newPassword: '',
  confirmPassword: '',
  error: null,
  saving: false,
  success: false,
  confirming: false,
});

const AdminUsersModal: React.FC<AdminUsersModalProps> = ({ users, onClose }) => {
  const [resetState, setResetState] = useState<ResetState | null>(null);

  const sortedUsers = [...users].sort((a, b) =>
    a.username.localeCompare(b.username, 'it', { sensitivity: 'base' })
  );

  const openReset = (userId: string) => {
    setResetState(initialReset(userId));
  };

  const closeReset = () => {
    setResetState(null);
  };

  const handleResetChange = (field: 'newPassword' | 'confirmPassword', value: string) => {
    setResetState(prev => prev ? { ...prev, [field]: value, error: null, success: false } : prev);
  };

  const handleResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetState) return;

    const { newPassword, confirmPassword } = resetState;

    if (!newPassword) {
      setResetState(prev => prev ? { ...prev, error: 'La nuova password è obbligatoria.' } : prev);
      return;
    }
    if (newPassword.length < 4) {
      setResetState(prev => prev ? { ...prev, error: 'La password deve essere di almeno 4 caratteri.' } : prev);
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetState(prev => prev ? { ...prev, error: 'Le password non coincidono.' } : prev);
      return;
    }

    // Show confirmation step
    setResetState(prev => prev ? { ...prev, confirming: true, error: null } : prev);
  };

  const handleConfirmReset = async () => {
    if (!resetState) return;

    setResetState(prev => prev ? { ...prev, saving: true, error: null } : prev);

    try {
      await updateDoc(doc(db, 'users', resetState.userId), {
        password: resetState.newPassword,
      });
      setResetState(prev => prev ? { ...prev, saving: false, success: true, confirming: false } : prev);
    } catch (err: any) {
      setResetState(prev =>
        prev ? { ...prev, saving: false, confirming: false, error: err?.message ?? 'Errore durante il salvataggio.' } : prev
      );
    }
  };

  const handleCancelConfirm = () => {
    setResetState(prev => prev ? { ...prev, confirming: false } : prev);
  };

  const activeUser = resetState ? users.find(u => u.id === resetState.userId) : null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fadeIn">
      <div className="bg-secondary rounded-xl shadow-2xl p-6 w-full max-w-lg border border-tertiary max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-bold">Controllo Utenti</h4>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors text-2xl leading-none"
            aria-label="Chiudi"
          >
            &times;
          </button>
        </div>

        <p className="text-sm text-text-secondary mb-4">
          Elenco utenti in ordine alfabetico. Le password non vengono mostrate.
          Puoi reimpostare la password di qualsiasi utente.
        </p>

        <div className="overflow-y-auto flex-1 space-y-2">
          {sortedUsers.map(user => (
            <div
              key={user.id}
              className="flex items-center justify-between bg-primary rounded-lg px-4 py-3 border border-tertiary/50"
            >
              <div>
                <span className="font-semibold text-text-primary">{user.username}</span>
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                  user.role === 'organizer'
                    ? 'bg-highlight/20 text-highlight'
                    : 'bg-tertiary text-text-secondary'
                }`}>
                  {user.role === 'organizer' ? 'Organizzatore' : 'Partecipante'}
                </span>
              </div>
              <button
                onClick={() => openReset(user.id)}
                className="text-sm bg-accent/80 hover:bg-accent text-white font-semibold py-1.5 px-3 rounded-lg transition-colors"
              >
                Reimposta password
              </button>
            </div>
          ))}

          {sortedUsers.length === 0 && (
            <p className="text-text-secondary text-center py-6">Nessun utente trovato.</p>
          )}
        </div>
      </div>

      {/* Reset password modal */}
      {resetState && activeUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-60 animate-fadeIn">
          <div className="bg-secondary rounded-xl shadow-2xl p-6 w-full max-w-sm border border-tertiary">
            {resetState.confirming ? (
              <>
                <h5 className="text-base font-bold mb-3">Conferma modifica password</h5>
                <p className="text-sm text-text-secondary mb-4">
                  Stai per reimpostare la password di{' '}
                  <strong className="text-text-primary">{activeUser.username}</strong>.
                  Questa operazione è irreversibile. Procedere?
                </p>
                {resetState.error && (
                  <p className="text-sm text-red-400 mb-3">{resetState.error}</p>
                )}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={handleCancelConfirm}
                    disabled={resetState.saving}
                    className="bg-tertiary hover:bg-tertiary/80 text-text-primary font-bold py-2 px-4 rounded-lg transition-colors"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={handleConfirmReset}
                    disabled={resetState.saving}
                    className="bg-highlight hover:bg-highlight/80 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors"
                  >
                    {resetState.saving ? 'Salvataggio...' : 'Conferma'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h5 className="text-base font-bold mb-3">
                  Reimposta password — <span className="text-accent">{activeUser.username}</span>
                </h5>
                {resetState.success ? (
                  <div className="text-sm text-green-400 mb-4">
                    Password aggiornata con successo!
                  </div>
                ) : null}
                <form onSubmit={handleResetSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm text-text-secondary mb-1">Nuova password</label>
                    <input
                      type="password"
                      value={resetState.newPassword}
                      onChange={e => handleResetChange('newPassword', e.target.value)}
                      className="w-full bg-primary border border-tertiary rounded-lg p-2 text-text-primary focus:ring-2 focus:ring-accent focus:border-accent"
                      autoFocus
                      disabled={resetState.saving}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-text-secondary mb-1">Conferma nuova password</label>
                    <input
                      type="password"
                      value={resetState.confirmPassword}
                      onChange={e => handleResetChange('confirmPassword', e.target.value)}
                      className="w-full bg-primary border border-tertiary rounded-lg p-2 text-text-primary focus:ring-2 focus:ring-accent focus:border-accent"
                      disabled={resetState.saving}
                    />
                  </div>
                  {resetState.error && (
                    <p className="text-sm text-red-400">{resetState.error}</p>
                  )}
                  <div className="flex justify-end gap-3 mt-2">
                    <button
                      type="button"
                      onClick={closeReset}
                      disabled={resetState.saving}
                      className="bg-tertiary hover:bg-tertiary/80 text-text-primary font-bold py-2 px-4 rounded-lg transition-colors"
                    >
                      Annulla
                    </button>
                    <button
                      type="submit"
                      disabled={resetState.saving}
                      className="bg-highlight hover:bg-highlight/80 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors"
                    >
                      {resetState.saving ? 'Salvataggio...' : 'Salva'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsersModal;
