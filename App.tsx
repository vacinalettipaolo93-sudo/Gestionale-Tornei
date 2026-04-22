// App.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { type Event, type Tournament, type User, type Player } from './types';
import EventView from './components/EventView';
import TournamentView from './components/TournamentView';
import Login from './components/Login';
import EditProfileModal from './components/EditProfileModal';
import ParticipantDashboard from './components/ParticipantDashboard';
import ContactModal from './components/ContactModal';
import { BackArrowIcon, TrophyIcon, PlusIcon, TrashIcon, UserCircleIcon, LogoutIcon } from './components/Icons';

import { db } from "./firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  getDocs,
} from "firebase/firestore";

type View = 'dashboard' | 'event' | 'tournament';

type TournamentTab =
  | 'standings'
  | 'matches'
  | 'participants'
  | 'playoffs'
  | 'consolation'
  | 'groups'
  | 'settings'
  | 'rules'
  | 'players'
  | 'availability';

const App: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);

  // NEW: states to carry initial tab and group when opening a tournament
  const [tournamentInitialTab, setTournamentInitialTab] = useState<TournamentTab | undefined>(undefined);
  const [tournamentInitialGroupId, setTournamentInitialGroupId] = useState<string | undefined>(undefined);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [contactPlayer, setContactPlayer] = useState<Player | null>(null);

  const isOrganizer = currentUser?.role === 'organizer';
  const loggedInPlayerId = currentUser?.playerId;

  useEffect(() => {
    const unsubEvents = onSnapshot(
      collection(db, "events"),
      snapshot => {
        setEvents(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Event)));
      },
      (err) => {
        console.error("[Firestore] Errore listener events:", err);
      }
    );

    const unsubUsers = onSnapshot(
      collection(db, "users"),
      snapshot => {
        setUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as User)));
      },
      (err) => {
        console.error("[Firestore] Errore listener users:", err);
      }
    );

    return () => {
      unsubEvents();
      unsubUsers();
    };
  }, []);

  const handleSelectEvent = (event: Event) => {
    setTournamentInitialTab(undefined);
    setTournamentInitialGroupId(undefined);
    setSelectedEvent(event);
    setCurrentView('event');
  };

  const handleSelectTournament = (tournament: Tournament, initialTab?: TournamentTab, initialGroupId?: string) => {
    setSelectedTournament(tournament);
    setTournamentInitialTab(initialTab);
    setTournamentInitialGroupId(initialGroupId);
    setCurrentView('tournament');
  };

  const navigateBack = () => {
    if (currentView === 'tournament') {
      setSelectedTournament(null);
      setCurrentView('event');
      return;
    }
    if (currentView === 'event') {
      setSelectedEvent(null);
      setCurrentView('dashboard');
      return;
    }
  };

  // ---------------------------
  // NEW: Import automatico di TUTTI i player globali dentro l'evento appena creato
  // ---------------------------
  const importAllGlobalPlayersIntoEvent = async (eventId: string) => {
    // 1) Leggi tutti i player globali
    const snap = await getDocs(collection(db, "players"));
    const globalPlayers: Player[] = snap.docs.map(d => {
      const data = d.data() as any;
      return {
        id: d.id,
        name: data.name ?? "",
        phone: data.phone ?? "",
        avatar: data.avatar ?? "",
        status: data.status ?? "confirmed",
        // mantengo eventuali campi extra se ci sono
        ...data,
      } as Player;
    });

    // 2) Salva nell'evento (event.players)
    await updateDoc(doc(db, "events", eventId), {
      players: globalPlayers
    });
  };

  // ---------------------------
  // CREATE EVENT (con import automatico player globali)
  // ---------------------------
  const handleCreateEvent = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newEventName.trim()) return;

    try {
      // Crea evento base
      const eventPayload: Omit<Event, "id"> = {
        name: newEventName.trim(),
        tournaments: [],
        players: [],
        invitationCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
      };

      // 1) addDoc -> ottieni ID reale Firestore
      const ref = await addDoc(collection(db, "events"), eventPayload);

      // 2) Import automatico di tutti i players globali
      await importAllGlobalPlayersIntoEvent(ref.id);

      // 3) UI cleanup
      setIsCreateModalOpen(false);
      setNewEventName("");
    } catch (err: any) {
      console.error("Errore creazione evento / import players", err);
      alert(err?.message || "Errore durante la creazione dell'evento");
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setSelectedEvent(null);
    setSelectedTournament(null);
    setCurrentView('dashboard');
  };

  const handleDeleteEvent = async () => {
    if (!eventToDelete) return;
    try {
      await deleteDoc(doc(db, "events", eventToDelete.id));
      setEventToDelete(null);
    } catch (err) {
      console.error("Errore eliminazione evento", err);
      alert("Errore durante l'eliminazione dell'evento");
    }
  };

  const currentEvent = useMemo(() => {
    if (!selectedEvent) return null;
    return events.find(e => e.id === selectedEvent.id) ?? selectedEvent;
  }, [events, selectedEvent]);

  // ---------------------------
  // RENDER
  // ---------------------------
  if (!currentUser) {
    return <Login users={users} onLoginSuccess={setCurrentUser} />;
  }

  return (
    <div className="min-h-screen bg-primary text-text-primary">
      {/* HEADER */}
      <header className="flex items-center justify-between p-4 border-b border-tertiary/50 bg-secondary">
        <div className="flex items-center gap-3">
          <TrophyIcon className="w-7 h-7 text-accent" />
          <h1 className="text-lg font-bold tracking-tight">Tournament Manager Pro</h1>
        </div>

        <div className="flex items-center gap-3 text-sm text-text-secondary">
          <span>Accesso come: <strong className="text-text-primary">{currentUser.username}</strong></span>
          <button
            className="p-2 rounded-lg hover:bg-tertiary/40 transition-colors"
            title="Profilo"
            onClick={() => setIsProfileModalOpen(true)}
          >
            <UserCircleIcon className="w-6 h-6" />
          </button>
          <button
            className="p-2 rounded-lg hover:bg-tertiary/40 transition-colors"
            title="Logout"
            onClick={handleLogout}
          >
            <LogoutIcon className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* BACK NAV */}
      {currentView !== 'dashboard' && (
        <div className="p-4">
          <button
            onClick={navigateBack}
            className="text-accent hover:underline flex items-center gap-2"
          >
            <BackArrowIcon className="w-4 h-4" />
            Indietro
          </button>
        </div>
      )}

      {/* DASHBOARD */}
      {currentView === 'dashboard' && (
        <main className="p-4 max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white">Eventi</h2>

            {isOrganizer && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-highlight text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2"
              >
                <PlusIcon className="w-5 h-5" /> Nuovo evento
              </button>
            )}
          </div>

          {/* LISTA EVENTI */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map(ev => (
              <div
                key={ev.id}
                className="bg-secondary border border-tertiary/50 rounded-xl p-4 shadow-lg"
              >
                <h3 className="text-lg font-bold text-white">{ev.name}</h3>
                <p className="text-xs text-text-secondary mt-1">Invito: <strong>{ev.invitationCode}</strong></p>

                <div className="flex gap-2 mt-4">
                  <button
                    className="flex-1 bg-accent text-white px-3 py-2 rounded-lg font-bold"
                    onClick={() => handleSelectEvent(ev)}
                  >
                    Apri
                  </button>

                  {isOrganizer && (
                    <button
                      className="bg-red-600/80 hover:bg-red-600 text-white px-3 py-2 rounded-lg"
                      onClick={() => setEventToDelete(ev)}
                      title="Elimina"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </main>
      )}

      {/* EVENT VIEW */}
      {currentView === 'event' && currentEvent && (
        <EventView
          event={currentEvent}
          events={events}
          setEvents={setEvents}
          onSelectTournament={handleSelectTournament}
          isOrganizer={isOrganizer}
          onContactPlayer={setContactPlayer}
        />
      )}

      {/* TOURNAMENT VIEW */}
      {currentView === 'tournament' && currentEvent && selectedTournament && (
        <TournamentView
          event={currentEvent}
          tournament={selectedTournament}
          events={events}
          setEvents={setEvents}
          onBack={() => navigateBack()}
          isOrganizer={isOrganizer}
          loggedInPlayerId={loggedInPlayerId}
          initialTab={tournamentInitialTab}
          initialGroupId={tournamentInitialGroupId}
          onContactPlayer={setContactPlayer}
        />
      )}

      {/* MODAL: CREA EVENTO */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-secondary border border-tertiary/50 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-3">Crea nuovo evento</h3>
            <form onSubmit={handleCreateEvent} className="space-y-3">
              <input
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                className="w-full bg-primary border border-tertiary rounded-lg p-3"
                placeholder="Nome evento"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-tertiary text-white"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-highlight text-white font-bold"
                >
                  Crea
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ELIMINA EVENTO */}
      {eventToDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-secondary border border-tertiary/50 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-3">Elimina evento</h3>
            <p className="text-text-secondary mb-4">
              Sei sicuro di voler eliminare <strong className="text-white">{eventToDelete.name}</strong>?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEventToDelete(null)}
                className="px-4 py-2 rounded-lg bg-tertiary text-white"
              >
                Annulla
              </button>
              <button
                onClick={handleDeleteEvent}
                className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold"
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PROFILO */}
      {isProfileModalOpen && currentUser && (
        <EditProfileModal
          user={currentUser}
          users={users}
          setUsers={setUsers}
          events={events}
          setEvents={setEvents}
          onClose={() => setIsProfileModalOpen(false)}
        />
      )}

      {/* MODAL CONTATTO */}
      {contactPlayer && (
        <ContactModal
          player={contactPlayer}
          onClose={() => setContactPlayer(null)}
        />
      )}
    </div>
  );
};

export default App;
