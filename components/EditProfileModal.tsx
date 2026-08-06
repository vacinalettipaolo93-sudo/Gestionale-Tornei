import React, { useRef, useState } from 'react';
import { type User, type Event } from '../types';
import { FaceSmileIcon, LinkIcon, PhotoIcon, TrashIcon } from './Icons';
import { collection, query, where, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import {
  createInitialsAvatar,
  validateImageFile,
  compressImageToDataUrl,
  ACCEPTED_IMAGE_EXTENSIONS,
} from '../utils/avatar';

interface EditProfileModalProps {
  user: User;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  events: Event[];
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  onClose: () => void;
}

const EMOJIS = ['🏓', '🎾', '⚽', '🏆', '🥇', '😎', '💪', '🔥', '🚀', '🎯', '👑', '🤖'];

const EditProfileModal: React.FC<EditProfileModalProps> = ({ user, users, setUsers, events, setEvents, onClose }) => {
  const [activeTab, setActiveTab] = useState<'password' | 'avatar'>('password');

  // Password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // Avatar state
  const [imageUrl, setImageUrl] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [avatarSuccess, setAvatarSuccess] = useState('');
  const [avatarLoading, setAvatarLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persist password change to Firestore users collection (keeps existing local setUsers)
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    const currentUserState = users.find(u => u.id === user.id);
    if (!currentUserState || currentUserState.password !== oldPassword) {
      setPasswordError('La vecchia password non è corretta.');
      return;
    }
    if (newPassword.length < 4) {
      setPasswordError('La nuova password deve essere di almeno 4 caratteri.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Le nuove password non coincidono.');
      return;
    }

    try {
      setUsers(prevUsers =>
        prevUsers.map(u => (u.id === user.id ? { ...u, password: newPassword } : u))
      );

      try {
        localStorage.removeItem("password");
        localStorage.removeItem("app_password");
        sessionStorage.removeItem("password");
      } catch (err) {
        // ignore
      }

      const usersRef = collection(db, "users");
      const q = user.playerId
        ? query(usersRef, where("playerId", "==", user.playerId))
        : query(usersRef, where("username", "==", user.username));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await Promise.all(snap.docs.map(d => updateDoc(doc(db, "users", d.id), { password: newPassword })));
      } else {
        console.warn("[EditProfileModal] Nessun documento utente trovato in Firestore per aggiornare la password.");
      }

      setPasswordSuccess('Password modificata con successo!');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(''), 2000);
    } catch (err: any) {
      console.error("Errore aggiornamento password:", err);
      setPasswordError('Errore durante il salvataggio della nuova password.');
    }
  };

  /** Persists the new avatar both in local state and in Firestore. */
  const persistAvatar = async (newAvatar: string) => {
    if (!user.playerId) return;

    // 1. Update local events state immediately for responsive UI
    setEvents(prevEvents =>
      prevEvents.map(event => ({
        ...event,
        players: event.players.map(p =>
          p.id === user.playerId ? { ...p, avatar: newAvatar } : p
        ),
      }))
    );

    // 2. Persist to Firestore players collection
    try {
      const playersRef = collection(db, "players");
      const q = query(playersRef, where("__name__", "==", user.playerId));
      // Try by doc id first
      await updateDoc(doc(db, "players", user.playerId), { avatar: newAvatar });
    } catch {
      // Fallback: find by id field if document id differs
      try {
        const playersRef = collection(db, "players");
        const snap = await getDocs(query(playersRef, where("id", "==", user.playerId)));
        if (!snap.empty) {
          await Promise.all(snap.docs.map(d => updateDoc(d.ref, { avatar: newAvatar })));
        }
      } catch (err) {
        console.error("[EditProfileModal] Impossibile aggiornare avatar in players:", err);
      }
    }

    // 3. Persist to Firestore events (embedded players array)
    try {
      const affectedEvents = events.filter(ev => ev.players.some(p => p.id === user.playerId));
      await Promise.all(
        affectedEvents.map(ev => {
          const updatedPlayers = ev.players.map(p =>
            p.id === user.playerId ? { ...p, avatar: newAvatar } : p
          );
          return updateDoc(doc(db, "events", ev.id), { players: updatedPlayers });
        })
      );
    } catch (err) {
      console.error("[EditProfileModal] Impossibile aggiornare avatar negli eventi:", err);
    }
  };

  const showAvatarSuccess = (msg = 'Avatar aggiornato!') => {
    setAvatarSuccess(msg);
    setTimeout(() => setAvatarSuccess(''), 2000);
  };

  const handleEmojiSelect = async (emoji: string) => {
    setAvatarError('');
    const safe = String(emoji)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><text x="50" y="50" font-size="80" text-anchor="middle" dominant-baseline="central" dy=".1em">${safe}</text></svg>`;
    await persistAvatar(`data:image/svg+xml;base64,${btoa(svg)}`);
    showAvatarSuccess();
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAvatarError('');
    const trimmed = imageUrl.trim();
    if (!trimmed) return;
    await persistAvatar(trimmed);
    setImageUrl('');
    showAvatarSuccess();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarError('');
    const validationError = validateImageFile(file);
    if (validationError) {
      setAvatarError(validationError);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setAvatarLoading(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      await persistAvatar(dataUrl);
      showAvatarSuccess('Foto caricata con successo!');
    } catch (err: any) {
      console.error("[EditProfileModal] Errore compressione/upload immagine:", err);
      setAvatarError('Errore durante il caricamento dell\'immagine. Riprova.');
    } finally {
      setAvatarLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    setAvatarError('');
    const playerName = events
      .flatMap(ev => ev.players)
      .find(p => p.id === user.playerId)?.name ?? user.username;
    await persistAvatar(createInitialsAvatar(playerName));
    showAvatarSuccess('Foto rimossa.');
  };

  // Current avatar for preview
  const currentAvatar = user.playerId
    ? events.flatMap(ev => ev.players).find(p => p.id === user.playerId)?.avatar
    : undefined;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fadeIn">
      <div className="bg-secondary rounded-xl shadow-2xl w-full max-w-md border border-tertiary">
        <div className="flex border-b border-tertiary">
          <button
            onClick={() => setActiveTab('password')}
            className={`flex-1 p-3 font-semibold transition-colors ${activeTab === 'password' ? 'bg-tertiary/70 text-accent' : 'text-text-secondary hover:bg-tertiary/40'}`}
          >
            Cambia Password
          </button>
          <button
            onClick={() => setActiveTab('avatar')}
            className={`flex-1 p-3 font-semibold transition-colors ${activeTab === 'avatar' ? 'bg-tertiary/70 text-accent' : 'text-text-secondary hover:bg-tertiary/40'}`}
          >
            Modifica Avatar
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4 animate-fadeIn">
              <h4 className="text-lg font-bold mb-2">Profilo di {user.username}</h4>
              <div>
                <label className="block text-sm font-medium text-text-secondary">Vecchia Password</label>
                <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} className="mt-1 block w-full bg-primary border border-tertiary rounded-lg p-2 text-text-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary">Nuova Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="mt-1 block w-full bg-primary border border-tertiary rounded-lg p-2 text-text-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary">Conferma Nuova Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="mt-1 block w-full bg-primary border border-tertiary rounded-lg p-2 text-text-primary" />
              </div>
              {passwordError && <p className="text-sm text-red-400">{passwordError}</p>}
              {passwordSuccess && <p className="text-sm text-green-400">{passwordSuccess}</p>}
              <div className="flex justify-end gap-4 pt-2">
                <button type="button" onClick={onClose} className="bg-tertiary hover:bg-tertiary/80 text-text-primary font-bold py-2 px-4 rounded-lg transition-colors">Chiudi</button>
                <button type="submit" className="bg-highlight hover:bg-highlight/80 text-white font-bold py-2 px-4 rounded-lg transition-colors">Salva Modifiche</button>
              </div>
            </form>
          )}

          {activeTab === 'avatar' && (
            <>
              {user.role === 'participant' ? (
                <div className="space-y-5 animate-fadeIn">
                  <div className="flex items-center gap-4">
                    <h4 className="text-lg font-bold">Personalizza il tuo Avatar</h4>
                    {currentAvatar && (
                      <img src={currentAvatar} alt="Il tuo avatar" className="w-14 h-14 rounded-full object-cover border-2 border-accent shadow" />
                    )}
                  </div>

                  {/* Upload photo */}
                  <div>
                    <h5 className="flex items-center gap-2 text-sm font-semibold text-text-secondary mb-2">
                      <PhotoIcon className="w-5 h-5" /> Carica la tua foto
                    </h5>
                    <label
                      htmlFor="avatar-upload"
                      className={`w-full text-center flex items-center justify-center gap-2 bg-highlight hover:bg-highlight/80 text-white font-bold py-2 px-4 rounded-lg transition-colors cursor-pointer ${avatarLoading ? 'opacity-60 pointer-events-none' : ''}`}
                    >
                      {avatarLoading ? (
                        <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      ) : (
                        <PhotoIcon className="w-5 h-5" />
                      )}
                      {avatarLoading ? 'Caricamento…' : 'Scegli foto…'}
                    </label>
                    <input
                      id="avatar-upload"
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_IMAGE_EXTENSIONS}
                      onChange={handleFileChange}
                      className="hidden"
                      disabled={avatarLoading}
                    />
                    <p className="text-xs text-text-secondary mt-1">JPG, PNG, WebP · max 2 MB</p>
                  </div>

                  {/* Remove photo */}
                  {currentAvatar && (
                    <div>
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        disabled={avatarLoading}
                        className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 font-semibold transition-colors disabled:opacity-50"
                      >
                        <TrashIcon className="w-4 h-4" /> Rimuovi foto
                      </button>
                    </div>
                  )}

                  {/* Emoji picker */}
                  <div>
                    <h5 className="flex items-center gap-2 text-sm font-semibold text-text-secondary mb-2">
                      <FaceSmileIcon className="w-5 h-5" /> Scegli un Emoji
                    </h5>
                    <div className="grid grid-cols-6 gap-2 bg-primary/50 p-3 rounded-lg">
                      {EMOJIS.map(emoji => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleEmojiSelect(emoji)}
                          disabled={avatarLoading}
                          className="text-3xl rounded-lg hover:bg-tertiary transition-colors p-1 disabled:opacity-50"
                          aria-label={`Scegli avatar emoji ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* URL */}
                  <div>
                    <h5 className="flex items-center gap-2 text-sm font-semibold text-text-secondary mb-2">
                      <LinkIcon className="w-5 h-5" /> Incolla URL Immagine
                    </h5>
                    <form onSubmit={handleUrlSubmit} className="flex gap-2">
                      <input
                        type="url"
                        placeholder="https://..."
                        value={imageUrl}
                        onChange={e => setImageUrl(e.target.value)}
                        className="flex-grow bg-primary border border-tertiary rounded-lg p-2 text-text-primary"
                      />
                      <button type="submit" disabled={avatarLoading} className="bg-highlight hover:bg-highlight/80 text-white font-bold py-2 px-3 rounded-lg transition-colors disabled:opacity-50">
                        Imposta
                      </button>
                    </form>
                  </div>

                  {avatarError && <p className="text-sm text-red-400">{avatarError}</p>}
                  {avatarSuccess && <p className="text-sm text-green-400">{avatarSuccess}</p>}

                  <div className="flex justify-end pt-2">
                    <button type="button" onClick={onClose} className="bg-tertiary hover:bg-tertiary/80 text-text-primary font-bold py-2 px-4 rounded-lg transition-colors">Chiudi</button>
                  </div>
                </div>
              ) : (
                <div className="text-center p-8 animate-fadeIn">
                  <p className="text-text-secondary">La personalizzazione dell'avatar non è disponibile per l'organizzatore.</p>
                  <div className="flex justify-end pt-6">
                    <button type="button" onClick={onClose} className="bg-tertiary hover:bg-tertiary/80 text-text-primary font-bold py-2 px-4 rounded-lg transition-colors">Chiudi</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EditProfileModal;

