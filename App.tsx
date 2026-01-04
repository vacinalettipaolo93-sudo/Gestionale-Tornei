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
import { collection, onSnapshot, addDoc, deleteDoc, doc } from "firebase/firestore";

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
  | 'availability'; // <-- aggiunto

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
    const unsubEvents = onSnapshot(collection(db, "events"), snapshot => {
      setEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Event)));
    });
    const unsubUsers = onSnapshot(collection(db, "users"), snapshot => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
    });
    return () => {
      unsubEvents();
      unsubUsers();
    };
  }, []);

  const handleSelectEvent = (event: Event) => {
    // clear any tournament initial params when navigating between events
    setTournamentInitialTab(undefined);
    setTournamentInitialGroupId(undefined);
    setSelectedEvent(event);
    setCurrentView('event');
  };

  // Now accepts optional tab and groupId so we can open TournamentView directly on a tab
  const handleSelectTournament = (tournament: Tournament, initialTab?: TournamentTab, initialGroupId?: string) => {
    setSelectedTournament(tournament);
    setTournamentInitialTab(initialTab);
    setTournamentInitialGroupId(initialGroupId);
    setCurrentView('tournament');
  };

  const navigateBack = () => {
    if (currentView === 'tournament') {
      setCurrentView('event');
      setSelectedTournament(null);
      setTournamentInitialTab(undefined);
      setTournamentInitialGroupId(undefined);
    } else if (currentView === 'event') {
      setCurrentView('dashboard');
      setSelectedEvent(null);
    }
  };

  // CREA EVENTO: NIENTE ID MANUALE!
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventName.trim()) return;
    const newEvent = {
      name: newEventName.trim(),
      invitationCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
      players: [],
      tournaments: [],
    };
    await addDoc(collection(db, "events"), newEvent);
    setNewEventName('');
    setIsCreateModalOpen(false);
  };

  const handleDeleteEvent = async () => {
    if (!eventToDelete) return;
    await deleteDoc(doc(db, "events", eventToDelete.id));
    setEventToDelete(null);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('dashboard');
    setSelectedEvent(null);
    setSelectedTournament(null);
    setTournamentInitialTab(undefined);
    setTournamentInitialGroupId(undefined);
  };

  const currentEventState = useMemo(() => events.find(e => e.id === selectedEvent?.id), [events, selectedEvent]);
  const currentTournamentState = useMemo(() => currentEventState?.tournaments.find(t => t.id === selectedTournament?.id), [currentEventState, selectedTournament]);

  const filteredEventsForOrganizer = useMemo(() => {
    if (isOrganizer) return events;
    return [];
  }, [events, isOrganizer]);

  if (!currentUser) {
    return <Login users={users} onLoginSuccess={setCurrentUser} />;
  }

  const renderContent = () => {
    if (currentView === 'dashboard') {
      if (!isOrganizer && loggedInPlayerId) {
        return (
          <ParticipantDashboard
            events={events}
            playerId={loggedInPlayerId}
            onSelectEvent={handleSelectEvent}
          />
        );
      }
      return (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex justify-between items-center">
            <h2 className="text-3xl font-bold">I Miei Eventi</h2>
            {isOrganizer && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 bg-highlight/80 hover:bg-highlight text-white font-bold py-2 px-4 rounded-lg transition-all shadow-lg"
              >
                <PlusIcon className="w-5 h-5" />
                Crea Evento
              </button>
            )}
          </div>

          {filteredEventsForOrganizer.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEventsForOrganizer.map(event => {
                const { totalMatches, completedMatches, completionPercentage } = (() => {
                  let totalMatches = 0;
                  let completedMatches = 0;
                  event.tournaments.forEach(tournament => {
                    tournament.groups.forEach(group => {
                      totalMatches += group.matches.length;
                      completedMatches += group.matches.filter(m => m.status === 'completed').length;
                    });
                  });
                  const completionPercentage = totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0;
                  return { totalMatches, completedMatches, completionPercentage };
                })();

                return (
                  <div key={event.id} className="bg-secondary rounded-xl shadow-lg transition-all duration-300 group relative overflow-hidden flex flex-col">
                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-accent/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <div onClick={() => handleSelectEvent(event)} className="p-6 cursor-pointer flex-grow z-10">
                      <h3 className="text-xl font-bold text-accent truncate">{event.name}</h3>
                      <p className="text-text-secondary mt-2 text-sm">{event.tournaments.length} tornei • {event.players.length} giocatori</p>
                      <div className="mt-4 pt-4 border-t border-tertiary/50">
                        <div className="flex justify-between items-center text-sm mb-1">
                          <span className="text-text-secondary">Progresso</span>
                          <span className="font-semibold text-text-primary">{completedMatches} / {totalMatches} partite</span>
                        </div>
                        <div className="w-full bg-tertiary/50 rounded-full h-2.5">
                          <div
                            className="bg-gradient-to-r from-accent to-highlight h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${completionPercentage}%` }}
                          />
                        </div>
                        <div className="text-right text-xs text-text-secondary mt-1">{completionPercentage}% Completato</div>
                      </div>
                    </div>

                    {isOrganizer && (
                      <div className="p-2 flex justify-end z-10">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEventToDelete(event); }}
                          className="text-text-secondary/50 hover:text-red-500 transition-colors"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-text-secondary text-center py-8">Nessun evento creato.</p>
          )}
        </div>
      );
    }

    if (currentView === 'event' && currentEventState) {
      return (
        <div className="animate-fadeIn">
          <EventView
            event={currentEventState}
            onSelectTournament={handleSelectTournament}
            setEvents={setEvents}
            isOrganizer={isOrganizer}
            loggedInPlayerId={loggedInPlayerId}
          />
        </div>
      );
    }

    if (currentView === 'tournament' && currentEventState && currentTournamentState) {
      return (
        <div className="animate-fadeIn">
          <TournamentView
            event={currentEventState}
            tournament={currentTournamentState}
            setEvents={setEvents}
            isOrganizer={isOrganizer}
            loggedInPlayerId={loggedInPlayerId}
            initialActiveTab={tournamentInitialTab}
            initialSelectedGroupId={tournamentInitialGroupId}
            onPlayerContact={setContactPlayer}
          />
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-primary text-text-primary p-4 sm:p-6 lg:p-8">
      <header className="mb-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <TrophyIcon className="w-8 h-8 text-accent" />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Tournament Manager Pro</h1>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-text-secondary hidden sm:block">
              Accesso come: <strong className="text-text-primary">{currentUser.username}</strong>
            </span>

            <button onClick={() => setIsProfileModalOpen(true)} className="text-text-secondary hover:text-text-primary transition-colors">
              <UserCircleIcon className="w-7 h-7" />
            </button>

            <button onClick={handleLogout} className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors">
              <LogoutIcon className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        {currentView !== 'dashboard' && (
          <button onClick={navigateBack} className="flex items-center gap-2 text-accent-hover hover:text-accent font-semibold mb-6 transition-colors">
            <BackArrowIcon className="w-5 h-5" />
            <span>Indietro</span>
          </button>
        )}

        {renderContent()}
      </main>

      {contactPlayer && (
        <ContactModal player={contactPlayer} onClose={() => setContactPlayer(null)} />
      )}

      {isProfileModalOpen && (
        <EditProfileModal
          user={currentUser}
          users={users}
          setUsers={setUsers}
          events={events}
          setEvents={setEvents}
          onClose={() => setIsProfileModalOpen(false)}
        />
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-secondary rounded-xl shadow-2xl p-6 w-full max-w-sm border border-tertiary">
            <h4 className="text-lg font-bold mb-4">Crea Nuovo Evento</h4>
            <form onSubmit={handleCreateEvent}>
              <input
                type="text"
                placeholder="Nome dell'evento"
                value={newEventName}
                onChange={e => setNewEventName(e.target.value)}
                className="w-full bg-primary border border-tertiary rounded-lg p-2 text-text-primary focus:ring-2 focus:ring-accent focus:border-accent"
                autoFocus
              />
              <div className="flex justify-end gap-4 mt-6">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="bg-tertiary hover:bg-tertiary/80 text-text-primary font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  Annulla
                </button>
                <button type="submit" className="bg-highlight hover:bg-highlight/80 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                  Crea Evento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {eventToDelete && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-secondary rounded-xl shadow-2xl p-6 w-full max-w-md border border-tertiary">
            <h4 className="text-lg font-bold mb-4">Conferma Eliminazione</h4>
            <p className="text-text-secondary">
              Sei sicuro di voler eliminare l'evento "{eventToDelete.name}"? Tutti i tornei, gironi e risultati associati verranno persi definitivamente.
            </p>
            <div className="flex justify-end gap-4 mt-6">
              <button onClick={() => setEventToDelete(null)} className="bg-tertiary hover:bg-tertiary/80 text-text-primary font-bold py-2 px-4 rounded-lg transition-colors">
                Annulla
              </button>
              <button onClick={handleDeleteEvent} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                Elimina Evento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
