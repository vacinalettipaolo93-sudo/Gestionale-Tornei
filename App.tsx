// App.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { type Event, type Tournament, type User, type Player, type SummerRankingData, type Match, type SummerRankingMasterMatch } from './types';
import EventView from './components/EventView';
import TournamentView from './components/TournamentView';
import Login from './components/Login';
import EditProfileModal from './components/EditProfileModal';
import ParticipantDashboard from './components/ParticipantDashboard';
import ContactModal from './components/ContactModal';
import SummerRankingView from './components/SummerRankingView';
import AdminPlayersView from './components/AdminPlayersView';
import { BackArrowIcon, NextTsBrandIcon, PencilIcon, PlusIcon, TrashIcon, UserCircleIcon, LogoutIcon } from './components/Icons';

import { db } from "./firebase";
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, getDoc } from "firebase/firestore";
import { DEFAULT_SUMMER_RANKING_RULES } from './utils/summerRanking';
import { calculateSummerRanking } from './utils/summerRanking';
import { isEventConcluded } from './utils/eventStatus';

type View = 'dashboard' | 'event' | 'tournament' | 'playersAdmin';
type EventType = NonNullable<Event['eventType']>;

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

const EMPTY_RANKING_DATA: SummerRankingData = {
  slots: [],
  matches: [],
  participantIds: [],
  rules: DEFAULT_SUMMER_RANKING_RULES,
  availabilities: {},
};

const getEventType = (event?: Partial<Event> | null): EventType =>
  event?.eventType === 'ranking_singolare'
    ? 'ranking_singolare'
    : event?.eventType === 'tournament_padel'
      ? 'tournament_padel'
      : 'tournament_singolare';

const normalizeRankingData = (data?: SummerRankingData | null): SummerRankingData => ({
  slots: Array.isArray(data?.slots) ? data.slots : [],
  matches: Array.isArray(data?.matches) ? data.matches : [],
  participantIds: Array.isArray(data?.participantIds) ? data.participantIds : [],
  rules: data?.rules ?? DEFAULT_SUMMER_RANKING_RULES,
  rulesConfig: data?.rulesConfig,
  availabilities: data?.availabilities ?? {},
  master: data?.master
    ? {
      manualQualifiedPlayerIds: Array.isArray(data.master.manualQualifiedPlayerIds) ? data.master.manualQualifiedPlayerIds : undefined,
      generatedQualifiedPlayerIds: Array.isArray(data.master.generatedQualifiedPlayerIds) ? data.master.generatedQualifiedPlayerIds : undefined,
      bracket: data.master.bracket ?? undefined,
      matches: Array.isArray(data.master.matches) ? data.master.matches : [],
      generatedAt: data.master.generatedAt,
    }
    : undefined,
});

// Strips undefined optional fields from a Match so Firebase SDK v12 does not reject them in updateDoc
const sanitizeMatch = (match: Match): Match => {
  const result: Match = {
    id: match.id,
    player1Id: match.player1Id,
    player2Id: match.player2Id,
    score1: match.score1,
    score2: match.score2,
    status: match.status,
  };
  if (match.scheduledTime !== undefined) result.scheduledTime = match.scheduledTime;
  if (match.location !== undefined) result.location = match.location;
  if (match.field !== undefined) result.field = match.field;
  if (match.slotId !== undefined) result.slotId = match.slotId;
  if (match.completedAt !== undefined) result.completedAt = match.completedAt;
  return result;
};

// Strips undefined optional fields from a SummerRankingMasterMatch
const sanitizeMasterMatch = (match: SummerRankingMasterMatch): SummerRankingMasterMatch => {
  const result: SummerRankingMasterMatch = {
    id: match.id,
    round: match.round,
    label: match.label,
    stage: match.stage,
    player1Id: match.player1Id,
    player2Id: match.player2Id,
    score1: match.score1,
    score2: match.score2,
    status: match.status,
  };
  if (match.scheduledTime !== undefined) result.scheduledTime = match.scheduledTime;
  if (match.location !== undefined) result.location = match.location;
  if (match.field !== undefined) result.field = match.field;
  if (match.slotId !== undefined) result.slotId = match.slotId;
  if (match.completedAt !== undefined) result.completedAt = match.completedAt;
  return result;
};

// Removes undefined values that Firebase SDK v12 rejects in updateDoc
const sanitizeRankingDataForFirestore = (data: SummerRankingData): SummerRankingData => {
  const payload: SummerRankingData = {
    slots: Array.isArray(data.slots) ? data.slots : [],
    matches: Array.isArray(data.matches) ? data.matches.map(sanitizeMatch) : [],
    participantIds: Array.isArray(data.participantIds) ? Array.from(new Set(data.participantIds)) : [],
    rules: data.rules ?? DEFAULT_SUMMER_RANKING_RULES,
    availabilities: data.availabilities ?? {},
  };
  if (data.rulesConfig) payload.rulesConfig = data.rulesConfig;
  if (data.master) {
    const nextMaster: NonNullable<SummerRankingData['master']> = {};
    if (Array.isArray(data.master.manualQualifiedPlayerIds)) nextMaster.manualQualifiedPlayerIds = data.master.manualQualifiedPlayerIds;
    if (Array.isArray(data.master.generatedQualifiedPlayerIds)) nextMaster.generatedQualifiedPlayerIds = data.master.generatedQualifiedPlayerIds;
    if (data.master.bracket !== undefined) nextMaster.bracket = data.master.bracket;
    if (Array.isArray(data.master.matches)) nextMaster.matches = data.master.matches.map(sanitizeMasterMatch);
    if (data.master.generatedAt !== undefined) nextMaster.generatedAt = data.master.generatedAt;
    payload.master = nextMaster;
  }
  return payload;
};

const App: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [legacySummerRanking, setLegacySummerRanking] = useState<SummerRankingData | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);

  const [tournamentInitialTab, setTournamentInitialTab] = useState<TournamentTab | undefined>(undefined);
  const [tournamentInitialGroupId, setTournamentInitialGroupId] = useState<string | undefined>(undefined);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventType, setNewEventType] = useState<EventType>('tournament_singolare');
  const [createEventError, setCreateEventError] = useState<string | null>(null);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [eventToRename, setEventToRename] = useState<Event | null>(null);
  const [renameEventName, setRenameEventName] = useState('');
  const [renameEventError, setRenameEventError] = useState<string | null>(null);
  const [isRenamingEvent, setIsRenamingEvent] = useState(false);
  const [contactPlayer, setContactPlayer] = useState<Player | null>(null);

  const isOrganizer = currentUser?.role === 'organizer';
  const loggedInPlayerId = currentUser?.playerId;

  const getEventRankingData = (event?: Event | null) => {
    const eventType = getEventType(event);
    if (eventType !== 'ranking_singolare') return EMPTY_RANKING_DATA;
    if (event?.rankingData) return normalizeRankingData(event.rankingData);
    return normalizeRankingData(legacySummerRanking);
  };

  useEffect(() => {
    const unsubEvents = onSnapshot(collection(db, "events"), snapshot => {
      const nextEvents = snapshot.docs.map(snapshotDoc => {
        const raw = snapshotDoc.data() as Partial<Event>;
        const eventType = getEventType(raw);
        return {
          id: snapshotDoc.id,
          name: raw.name ?? '',
          invitationCode: raw.invitationCode ?? '',
          players: Array.isArray(raw.players) ? raw.players : [],
          tournaments: Array.isArray(raw.tournaments) ? raw.tournaments : [],
          globalTimeSlots: Array.isArray(raw.globalTimeSlots) ? raw.globalTimeSlots : [],
          rules: raw.rules,
          eventType,
          rankingData: eventType === 'ranking_singolare' ? normalizeRankingData(raw.rankingData) : undefined,
        } as Event;
      });
      setEvents(nextEvents);
    });
    const unsubPlayers = onSnapshot(collection(db, "players"), snapshot => {
      setPlayers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player)));
    });
    const unsubUsers = onSnapshot(collection(db, "users"), snapshot => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
    });

    void getDoc(doc(db, "summerRankingNext", "main"))
      .then(snapshot => {
        if (!snapshot.exists()) return;
        const data = snapshot.data() as SummerRankingData | undefined;
        setLegacySummerRanking(normalizeRankingData(data));
      })
      .catch(error => {
        console.error('Errore lettura fallback Summer Ranking Next', error);
      });

    return () => {
      unsubEvents();
      unsubPlayers();
      unsubUsers();
    };
  }, []);

  const handleSelectEvent = (event: Event) => {
    setTournamentInitialTab(undefined);
    setTournamentInitialGroupId(undefined);
    setSelectedTournament(null);
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
      setCurrentView('event');
      setSelectedTournament(null);
      setTournamentInitialTab(undefined);
      setTournamentInitialGroupId(undefined);
    } else if (currentView === 'playersAdmin') {
      setCurrentView(selectedEvent ? 'event' : 'dashboard');
    } else if (currentView === 'event') {
      setCurrentView('dashboard');
      setSelectedEvent(null);
    }
  };

  const saveEventRankingData = async (eventId: string, nextData: SummerRankingData) => {
    const normalized = normalizeRankingData(nextData);
    setEvents(prevEvents => prevEvents.map(event =>
      event.id === eventId
        ? { ...event, eventType: 'ranking_singolare', rankingData: normalized }
        : event
    ));
    if (selectedEvent?.id === eventId) {
      setSelectedEvent(prev => prev ? { ...prev, eventType: 'ranking_singolare', rankingData: normalized } : prev);
    }
    const sanitized = sanitizeRankingDataForFirestore(normalized);
    await updateDoc(doc(db, "events", eventId), {
      eventType: 'ranking_singolare',
      rankingData: sanitized,
    });
  };

  const updatePlayerSummerRankingStartPoints = async (playerId: string, points: number) => {
    const currentPlayer = players.find(player => player.id === playerId);
    const payload: Partial<Player> = {
      summerRankingStartPoints: points,
      summerRankingJoinedAt: currentPlayer?.summerRankingJoinedAt ?? new Date().toISOString(),
    };

    setPlayers(prevPlayers => prevPlayers.map(player =>
      player.id === playerId ? { ...player, ...payload } : player
    ));
    await updateDoc(doc(db, "players", playerId), payload);
  };

  const resetCreateEventForm = () => {
    setNewEventName('');
    setNewEventType('tournament_singolare');
    setCreateEventError(null);
    setIsCreatingEvent(false);
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    resetCreateEventForm();
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEventName = newEventName.trim();
    setCreateEventError(null);

    if (!trimmedEventName) {
      setCreateEventError("Inserisci il nome dell'evento.");
      return;
    }

    if (
      newEventType !== 'ranking_singolare'
      && newEventType !== 'tournament_singolare'
      && newEventType !== 'tournament_padel'
    ) {
      setCreateEventError('Seleziona una tipologia valida.');
      return;
    }

    setIsCreatingEvent(true);

    const baseEvent: Omit<Event, 'id'> = {
      name: trimmedEventName,
      invitationCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
      players: [],
      tournaments: [],
      eventType: newEventType,
    };

    try {
      await addDoc(collection(db, "events"), newEventType === 'ranking_singolare'
        ? {
          ...baseEvent,
          rankingData: { ...EMPTY_RANKING_DATA },
        }
        : baseEvent);
      closeCreateModal();
    } catch (error) {
      console.error('Errore creazione evento', error);
      setCreateEventError('Impossibile creare l’evento. Riprova.');
    } finally {
      setIsCreatingEvent(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!eventToDelete) return;
    await deleteDoc(doc(db, "events", eventToDelete.id));
    if (selectedEvent?.id === eventToDelete.id) {
      setSelectedEvent(null);
      setCurrentView('dashboard');
    }
    setEventToDelete(null);
  };

  const openRenameModal = (event: Event) => {
    setEventToRename(event);
    setRenameEventName(event.name);
    setRenameEventError(null);
  };

  const closeRenameModal = () => {
    setEventToRename(null);
    setRenameEventName('');
    setRenameEventError(null);
    setIsRenamingEvent(false);
  };

  const handleRenameEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventToRename) return;
    const trimmedName = renameEventName.trim();
    if (!trimmedName) {
      setRenameEventError("Il nome dell'evento non può essere vuoto.");
      return;
    }
    setRenameEventError(null);
    setIsRenamingEvent(true);
    try {
      await updateDoc(doc(db, "events", eventToRename.id), { name: trimmedName });
      if (selectedEvent?.id === eventToRename.id) {
        setSelectedEvent(prev => prev ? { ...prev, name: trimmedName } : prev);
      }
      closeRenameModal();
    } catch (error) {
      console.error('Errore rinomina evento', error);
      setRenameEventError('Impossibile salvare il nome. Riprova.');
    } finally {
      setIsRenamingEvent(false);
    }
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

  const ongoingEvents = useMemo(() => filteredEventsForOrganizer.filter(e => !isEventConcluded(e)), [filteredEventsForOrganizer]);
  const concludedEvents = useMemo(() => filteredEventsForOrganizer.filter(e => isEventConcluded(e)), [filteredEventsForOrganizer]);

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
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    resetCreateEventForm();
                    setIsCreateModalOpen(true);
                  }}
                  className="flex items-center gap-2 bg-highlight/80 hover:bg-highlight text-white font-bold py-2 px-4 rounded-lg transition-all shadow-lg"
                >
                  <PlusIcon className="w-5 h-5" />
                  Crea Evento
                </button>
              </div>
            )}
          </div>

          {filteredEventsForOrganizer.length === 0 && (
            <p className="text-text-secondary text-center py-8">Nessun evento creato.</p>
          )}

          {/* Sezione: In corso */}
          {(ongoingEvents.length > 0 || concludedEvents.length > 0) && (
            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-semibold text-text-secondary mb-4 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-400"></span>
                  In corso
                </h3>
                {ongoingEvents.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {ongoingEvents.map(event => {
                      const eventType = getEventType(event);
                      const rankingData = getEventRankingData(event);
                      const rankingTop8 = eventType === 'ranking_singolare'
                        ? calculateSummerRanking(
                          (event.players ?? []).filter(
                            player => player.status === 'confirmed' && (rankingData.participantIds ?? []).includes(player.id),
                          ),
                          rankingData.matches ?? [],
                        ).slice(0, 8)
                        : [];
                      const { totalMatches, completedMatches, completionPercentage } = (() => {
                        if (eventType === 'ranking_singolare') {
                          const total = rankingData.matches.length;
                          const completed = rankingData.matches.filter(match => match.status === 'completed').length;
                          return {
                            totalMatches: total,
                            completedMatches: completed,
                            completionPercentage: total > 0 ? Math.round((completed / total) * 100) : 0,
                          };
                        }
                        let total = 0;
                        let completed = 0;
                        event.tournaments.forEach(tournament => {
                          tournament.groups.forEach(group => {
                            total += group.matches.length;
                            completed += group.matches.filter(m => m.status === 'completed').length;
                          });
                        });
                        return {
                          totalMatches: total,
                          completedMatches: completed,
                          completionPercentage: total > 0 ? Math.round((completed / total) * 100) : 0,
                        };
                      })();

                      return (
                        <div key={event.id} className="bg-secondary rounded-xl shadow-lg transition-all duration-300 group relative overflow-hidden flex flex-col">
                          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-accent/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                          <div onClick={() => handleSelectEvent(event)} className="p-6 cursor-pointer flex-grow z-10">
                            <h3 className="text-xl font-bold text-accent truncate">{event.name}</h3>
                            <p className="text-text-secondary mt-2 text-sm">
                              {eventType === 'ranking_singolare'
                                ? `Ranking tennis singolare • ${(rankingData.participantIds ?? []).length} partecipanti`
                                : eventType === 'tournament_padel'
                                  ? `${event.tournaments.length} tornei • ${event.tournaments.reduce((total, tournament) => total + (tournament.padelTeams?.length ?? 0), 0)} squadre`
                                  : `${event.tournaments.length} tornei • ${event.players.length} giocatori`}
                            </p>
                            {eventType === 'ranking_singolare' ? (
                              <div className="mt-4 pt-4 border-t border-tertiary/50">
                                <div className="flex justify-between items-center text-sm mb-2">
                                  <span className="text-text-secondary">Top 8 classifica</span>
                                  <span className="font-semibold text-text-primary">{rankingTop8.length} / 8</span>
                                </div>
                                {rankingTop8.length > 0 ? (
                                  <div className="space-y-1.5">
                                    {rankingTop8.map(entry => (
                                      <div key={entry.player.id} className="text-sm flex items-center gap-2">
                                        <span className="text-text-secondary w-6">{entry.rank}.</span>
                                        <span className="text-text-primary flex-1 truncate">{entry.player.name}</span>
                                        <span className="text-text-primary font-semibold">{entry.points} pt</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-text-secondary">Classifica non ancora disponibile.</p>
                                )}
                              </div>
                            ) : (
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
                            )}
                          </div>
                          {isOrganizer && (
                            <div className="p-2 flex justify-end gap-1 z-10">
                              <button
                                onClick={(e) => { e.stopPropagation(); openRenameModal(event); }}
                                className="text-text-secondary/50 hover:text-accent transition-colors"
                                title="Modifica nome evento"
                              >
                                <PencilIcon className="w-5 h-5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEventToDelete(event); }}
                                className="text-text-secondary/50 hover:text-red-500 transition-colors"
                                title="Elimina evento"
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
                  <p className="text-text-secondary text-sm py-4">Nessun evento in corso.</p>
                )}
              </div>

              {/* Sezione: Conclusi */}
              <div>
                <h3 className="text-lg font-semibold text-text-secondary mb-4 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-tertiary"></span>
                  Conclusi
                </h3>
                {concludedEvents.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {concludedEvents.map(event => {
                      const eventType = getEventType(event);
                      const rankingData = getEventRankingData(event);
                      const rankingTop8 = eventType === 'ranking_singolare'
                        ? calculateSummerRanking(
                          (event.players ?? []).filter(
                            player => player.status === 'confirmed' && (rankingData.participantIds ?? []).includes(player.id),
                          ),
                          rankingData.matches ?? [],
                        ).slice(0, 8)
                        : [];
                      const { totalMatches, completedMatches } = (() => {
                        if (eventType === 'ranking_singolare') {
                          const total = rankingData.matches.length;
                          const completed = rankingData.matches.filter(match => match.status === 'completed').length;
                          return { totalMatches: total, completedMatches: completed };
                        }
                        let total = 0;
                        let completed = 0;
                        event.tournaments.forEach(tournament => {
                          tournament.groups.forEach(group => {
                            total += group.matches.length;
                            completed += group.matches.filter(m => m.status === 'completed').length;
                          });
                        });
                        return { totalMatches: total, completedMatches: completed };
                      })();

                      return (
                        <div key={event.id} className="bg-secondary/60 rounded-xl shadow transition-all duration-300 group relative overflow-hidden flex flex-col opacity-80">
                          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-tertiary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                          <div onClick={() => handleSelectEvent(event)} className="p-6 cursor-pointer flex-grow z-10">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h3 className="text-xl font-bold text-text-primary truncate">{event.name}</h3>
                              <span className="flex-shrink-0 text-xs font-semibold bg-tertiary/60 text-text-secondary px-2 py-0.5 rounded-full">
                                Terminato
                              </span>
                            </div>
                            <p className="text-text-secondary mt-1 text-sm">
                              {eventType === 'ranking_singolare'
                                ? `Ranking tennis singolare • ${(rankingData.participantIds ?? []).length} partecipanti`
                                : eventType === 'tournament_padel'
                                  ? `${event.tournaments.length} tornei • ${event.tournaments.reduce((total, tournament) => total + (tournament.padelTeams?.length ?? 0), 0)} squadre`
                                  : `${event.tournaments.length} tornei • ${event.players.length} giocatori`}
                            </p>
                            {eventType === 'ranking_singolare' ? (
                              <div className="mt-4 pt-4 border-t border-tertiary/50">
                                <div className="flex justify-between items-center text-sm mb-2">
                                  <span className="text-text-secondary">Top 8 classifica</span>
                                  <span className="font-semibold text-text-primary">{rankingTop8.length} / 8</span>
                                </div>
                                {rankingTop8.length > 0 ? (
                                  <div className="space-y-1.5">
                                    {rankingTop8.map(entry => (
                                      <div key={entry.player.id} className="text-sm flex items-center gap-2">
                                        <span className="text-text-secondary w-6">{entry.rank}.</span>
                                        <span className="text-text-primary flex-1 truncate">{entry.player.name}</span>
                                        <span className="text-text-primary font-semibold">{entry.points} pt</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-text-secondary">Classifica non ancora disponibile.</p>
                                )}
                              </div>
                            ) : (
                              <div className="mt-4 pt-4 border-t border-tertiary/50">
                                <p className="text-sm text-text-secondary">
                                  {completedMatches} / {totalMatches} partite giocate
                                </p>
                              </div>
                            )}
                          </div>
                          {isOrganizer && (
                            <div className="p-2 flex justify-end gap-1 z-10">
                              <button
                                onClick={(e) => { e.stopPropagation(); openRenameModal(event); }}
                                className="text-text-secondary/50 hover:text-accent transition-colors"
                                title="Modifica nome evento"
                              >
                                <PencilIcon className="w-5 h-5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEventToDelete(event); }}
                                className="text-text-secondary/50 hover:text-red-500 transition-colors"
                                title="Elimina evento"
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
                  <p className="text-text-secondary text-sm py-4">Nessun evento concluso.</p>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }


    if (currentView === 'event' && currentEventState) {
      if (getEventType(currentEventState) === 'ranking_singolare') {
        const rankingData = getEventRankingData(currentEventState);
        return (
          <div className="animate-fadeIn">
            <SummerRankingView
              players={currentEventState.players ?? []}
              rankingData={rankingData}
              isOrganizer={isOrganizer}
              loggedInPlayerId={loggedInPlayerId}
              onPlayerContact={setContactPlayer}
              onSaveRankingData={(nextData) => saveEventRankingData(currentEventState.id, nextData)}
              onUpdatePlayerStartPoints={updatePlayerSummerRankingStartPoints}
              onOpenPlayersAdmin={isOrganizer ? () => setCurrentView('playersAdmin') : undefined}
              title={`${currentEventState.name} • Ranking tennis singolare`}
              description="Classifica, partite, master finale, disponibilità e regolamento di questo evento."
              playersAdminLabel="Apri gestione giocatori evento"
            />
          </div>
        );
      }

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

    if (
      currentView === 'playersAdmin'
      && isOrganizer
      && currentEventState
      && getEventType(currentEventState) === 'ranking_singolare'
    ) {
      return (
        <AdminPlayersView
          players={players}
          events={events}
          rankingEvent={currentEventState}
          setEvents={setEvents}
        />
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-primary text-text-primary p-4 sm:p-6 lg:p-8">
      <header className="mb-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <NextTsBrandIcon className="w-28 sm:w-36 lg:w-44 h-auto flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate">Tournament Manager Pro</h1>
            </div>
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
            <form onSubmit={handleCreateEvent} className="space-y-4">
              <input
                type="text"
                placeholder="Nome dell'evento"
                value={newEventName}
                onChange={e => setNewEventName(e.target.value)}
                className="w-full bg-primary border border-tertiary rounded-lg p-2 text-text-primary focus:ring-2 focus:ring-accent focus:border-accent"
                autoFocus
              />
              <div>
                <label htmlFor="event-type" className="block text-sm text-text-secondary mb-1">Tipo evento</label>
                <select
                  id="event-type"
                  value={newEventType}
                  onChange={event => setNewEventType(event.target.value as EventType)}
                  className="w-full bg-primary border border-tertiary rounded-lg p-2 text-text-primary focus:ring-2 focus:ring-accent focus:border-accent"
                >
                  <option value="ranking_singolare">Ranking tennis singolare</option>
                  <option value="tournament_singolare">Torneo tennis singolare</option>
                  <option value="tournament_padel">Torneo di padel</option>
                </select>
              </div>
              {createEventError && (
                <p className="text-sm text-red-400" role="alert">
                  {createEventError}
                </p>
              )}
              <div className="flex justify-end gap-4 mt-6">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={isCreatingEvent}
                  className="bg-tertiary hover:bg-tertiary/80 text-text-primary font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={isCreatingEvent}
                  className="bg-highlight hover:bg-highlight/80 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  {isCreatingEvent ? 'Creazione...' : 'Crea Evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {eventToRename && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-secondary rounded-xl shadow-2xl p-6 w-full max-w-md border border-tertiary">
            <h4 className="text-lg font-bold mb-4">Modifica Nome Evento</h4>
            <form onSubmit={handleRenameEvent}>
              <label htmlFor="rename-event-input" className="block text-sm text-text-secondary mb-1">
                Nuovo nome
              </label>
              <input
                id="rename-event-input"
                type="text"
                value={renameEventName}
                onChange={e => { setRenameEventName(e.target.value); setRenameEventError(null); }}
                className="w-full bg-primary border border-tertiary rounded-lg p-2 text-text-primary focus:ring-2 focus:ring-accent focus:border-accent"
                autoFocus
                disabled={isRenamingEvent}
              />
              {renameEventError && (
                <p className="text-sm text-red-400 mt-2" role="alert">{renameEventError}</p>
              )}
              <div className="flex justify-end gap-4 mt-6">
                <button
                  type="button"
                  onClick={closeRenameModal}
                  disabled={isRenamingEvent}
                  className="bg-tertiary hover:bg-tertiary/80 text-text-primary font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={isRenamingEvent}
                  className="bg-highlight hover:bg-highlight/80 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  {isRenamingEvent ? 'Salvataggio...' : 'Salva'}
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
