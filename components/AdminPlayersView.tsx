import React, { useMemo, useState } from 'react';
import { collection, addDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { type Event, type Player, type SummerRankingData } from '../types';
import { DEFAULT_SUMMER_RANKING_RULES } from '../utils/summerRanking';

interface AdminPlayersViewProps {
  players: Player[];
  events: Event[];
  rankingEvent: Event;
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>;
}

const createInitialsAvatar = (name: string): string => {
  const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const colors = ['#8b5cf6', '#22d3ee', '#f59e0b', '#10b981', '#ef4444', '#3b82f6'];
  const color = colors[initials.charCodeAt(0) % colors.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" fill="${color}"/><text x="50" y="50" font-family="sans-serif" font-size="48" fill="white" text-anchor="middle" alignment-baseline="central" dy=".3em">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

const AdminPlayersView: React.FC<AdminPlayersViewProps> = ({
  players,
  events,
  rankingEvent,
  setEvents,
}) => {
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerPhone, setNewPlayerPhone] = useState('');
  const [newPlayerStartPoints, setNewPlayerStartPoints] = useState('0');
  const [addNewPlayerToRanking, setAddNewPlayerToRanking] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [playerSearchInput, setPlayerSearchInput] = useState('');
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [editPlayerName, setEditPlayerName] = useState('');
  const [editPlayerPhone, setEditPlayerPhone] = useState('');
  const [editPlayerPoints, setEditPlayerPoints] = useState('0');
  const [editLoading, setEditLoading] = useState(false);

  const sortedPlayers = useMemo(
    () => players.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [players],
  );
  const filteredPlayers = useMemo(() => {
    const query = playerSearchQuery.trim().toLowerCase();
    if (!query) return sortedPlayers;
    return sortedPlayers.filter(player => player.name.toLowerCase().includes(query));
  }, [playerSearchQuery, sortedPlayers]);
  const rankingData = useMemo<SummerRankingData>(() => ({
    slots: Array.isArray(rankingEvent.rankingData?.slots) ? rankingEvent.rankingData.slots : [],
    matches: Array.isArray(rankingEvent.rankingData?.matches) ? rankingEvent.rankingData.matches : [],
    participantIds: Array.isArray(rankingEvent.rankingData?.participantIds) ? rankingEvent.rankingData.participantIds : [],
    rules: rankingEvent.rankingData?.rules ?? DEFAULT_SUMMER_RANKING_RULES,
    rulesConfig: rankingEvent.rankingData?.rulesConfig,
    availabilities: rankingEvent.rankingData?.availabilities ?? {},
    master: rankingEvent.rankingData?.master,
  }), [rankingEvent.rankingData]);
  const rankingParticipantIds = useMemo(
    () => Array.isArray(rankingData.participantIds) ? rankingData.participantIds : [],
    [rankingData.participantIds],
  );
  const participantIdSet = useMemo(
    () => new Set(rankingParticipantIds),
    [rankingParticipantIds],
  );
  const addPlayerToRankingEvent = async (player: Player, startPoints: number) => {
    const event = events.find(item => item.id === rankingEvent.id) ?? rankingEvent;
    const participantIds = Array.from(new Set([...(rankingData.participantIds ?? []), player.id]));
    const alreadyInEventPlayers = event.players.some(existing => existing.id === player.id);
    const eventPlayer: Player = {
      id: player.id,
      name: player.name,
      phone: player.phone ?? '',
      avatar: player.avatar,
      status: 'confirmed',
      summerRankingStartPoints: startPoints,
      summerRankingJoinedAt: player.summerRankingJoinedAt ?? new Date().toISOString(),
    };
    const nextPlayers = alreadyInEventPlayers ? event.players : [...event.players, eventPlayer];
    const nextRankingData: SummerRankingData = {
      ...rankingData,
      participantIds,
    };

    setEvents(prev =>
      prev.map(item => item.id === rankingEvent.id ? { ...item, players: nextPlayers, rankingData: nextRankingData } : item),
    );
    await updateDoc(doc(db, 'events', rankingEvent.id), {
      players: nextPlayers,
      rankingData: nextRankingData,
    });

    return {
      wasAlreadyParticipant: participantIdSet.has(player.id),
      wasAlreadyInEventPlayers: alreadyInEventPlayers,
    };
  };

  const addPlayerToRanking = async (player: Player, startPoints: number) => {
    const rankingEventPlayers = (events.find(item => item.id === rankingEvent.id) ?? rankingEvent).players;
    if (participantIdSet.has(player.id) && rankingEventPlayers.some(existing => existing.id === player.id)) {
      setFeedback({ type: 'success', message: `${player.name} è già nel ranking.` });
      return;
    }

    const result = await addPlayerToRankingEvent(player, startPoints);
    if (!result.wasAlreadyParticipant && !result.wasAlreadyInEventPlayers) {
      setFeedback({ type: 'success', message: `${player.name} aggiunto al ranking.` });
      return;
    }
    if (result.wasAlreadyParticipant && !result.wasAlreadyInEventPlayers) {
      setFeedback({ type: 'success', message: `${player.name} aggiunto ai giocatori dell'evento ranking.` });
      return;
    }
    setFeedback({ type: 'success', message: `${player.name} associato correttamente al ranking.` });
  };

  const addPlayerToEvent = async (eventId: string, player: Player, startPoints: number) => {
    if (!eventId) return;
    const event = events.find(item => item.id === eventId);
    if (!event || event.players.some(existing => existing.id === player.id)) return;

    if ((player.summerRankingStartPoints ?? 0) !== startPoints) {
      await updateDoc(doc(db, 'players', player.id), {
        summerRankingStartPoints: startPoints,
        summerRankingJoinedAt: player.summerRankingJoinedAt ?? new Date().toISOString(),
      });
    }

    const eventPlayer: Player = {
      id: player.id,
      name: player.name,
      phone: player.phone ?? '',
      avatar: player.avatar,
      status: 'confirmed',
      summerRankingStartPoints: startPoints,
      summerRankingJoinedAt: player.summerRankingJoinedAt ?? new Date().toISOString(),
    };
    const updatedPlayers = [...event.players, eventPlayer];
    setEvents(prev =>
      prev.map(item => item.id === event.id ? { ...item, players: updatedPlayers } : item),
    );
    await updateDoc(doc(db, 'events', event.id), { players: updatedPlayers });
  };

  const ensureUserForPlayer = async (playerId: string, username: string) => {
    const usersRef = collection(db, 'users');
    const userSnap = await getDocs(query(usersRef, where('username', '==', username)));
    if (!userSnap.empty) return;

    await addDoc(usersRef, {
      username,
      password: '1234',
      role: 'participant',
      playerId,
    });
  };

  const handleCreatePlayer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newPlayerName.trim()) return;
    setLoading(true);
    try {
      const trimmedName = newPlayerName.trim();
      const trimmedPhone = newPlayerPhone.trim();
      const startPoints = Number(newPlayerStartPoints || 0);
      const playersRef = collection(db, 'players');
      const existingSnap = await getDocs(query(playersRef, where('name', '==', trimmedName), where('phone', '==', trimmedPhone)));

      let playerId: string;
      if (!existingSnap.empty) {
        const existingDoc = existingSnap.docs[0];
        playerId = existingDoc.id;
      } else {
        const createdRef = await addDoc(playersRef, {
          name: trimmedName,
          phone: trimmedPhone,
          avatar: createInitialsAvatar(trimmedName),
          status: 'confirmed',
          summerRankingStartPoints: startPoints,
          summerRankingJoinedAt: new Date().toISOString(),
        });
        playerId = createdRef.id;
      }

      const createdPlayer: Player = {
        id: playerId,
        name: trimmedName,
        phone: trimmedPhone,
        avatar: createInitialsAvatar(trimmedName),
        status: 'confirmed',
        summerRankingStartPoints: startPoints,
      };

      await ensureUserForPlayer(playerId, trimmedName);
      const playerForActions = players.find(player => player.id === playerId) ?? createdPlayer;
      if (addNewPlayerToRanking) {
        await addPlayerToRanking(playerForActions, startPoints);
      }
      if (selectedEventId) {
        await addPlayerToEvent(selectedEventId, playerForActions, startPoints);
      }

      setNewPlayerName('');
      setNewPlayerPhone('');
      setNewPlayerStartPoints('0');
      setFeedback({ type: 'success', message: 'Giocatore creato correttamente.' });
    } catch (error) {
      console.error('Errore creazione giocatore', error);
      setFeedback({ type: 'error', message: 'Impossibile creare il giocatore. Riprova.' });
    } finally {
      setLoading(false);
    }
  };

  const openEditPlayer = (player: Player) => {
    setEditingPlayer(player);
    setEditPlayerName(player.name);
    setEditPlayerPhone(player.phone ?? '');
    setEditPlayerPoints(String(player.summerRankingStartPoints ?? 0));
  };

  const closeEditPlayer = () => {
    setEditingPlayer(null);
    setEditPlayerName('');
    setEditPlayerPhone('');
    setEditPlayerPoints('0');
  };

  const handleSaveEditedPlayer = async () => {
    if (!editingPlayer) return;
    const normalizedName = editPlayerName.trim();
    const normalizedPhone = editPlayerPhone.trim();
    const normalizedPoints = Number(editPlayerPoints);

    if (!normalizedName) {
      setFeedback({ type: 'error', message: 'Il nome giocatore è obbligatorio.' });
      return;
    }
    if (!Number.isFinite(normalizedPoints) || normalizedPoints < 0) {
      setFeedback({ type: 'error', message: 'Il valore del giocatore deve essere un numero valido maggiore o uguale a 0.' });
      return;
    }

    setEditLoading(true);
    try {
      const joinedAt = editingPlayer.summerRankingJoinedAt ?? new Date().toISOString();
      await updateDoc(doc(db, 'players', editingPlayer.id), {
        name: normalizedName,
        phone: normalizedPhone,
        summerRankingStartPoints: normalizedPoints,
        summerRankingJoinedAt: joinedAt,
      });

      const eventsToUpdate = events.filter(event => event.players.some(player => player.id === editingPlayer.id));
      if (eventsToUpdate.length > 0) {
        const updatedEvents = events.map(event => ({
          ...event,
          players: event.players.map(player =>
            player.id === editingPlayer.id
              ? {
                ...player,
                name: normalizedName,
                phone: normalizedPhone,
                summerRankingStartPoints: normalizedPoints,
                summerRankingJoinedAt: joinedAt,
              }
              : player,
          ),
        }));

        setEvents(updatedEvents);
        await Promise.all(
          updatedEvents
            .filter(event => event.players.some(player => player.id === editingPlayer.id))
            .map(event => updateDoc(doc(db, 'events', event.id), { players: event.players })),
        );
      }

      setFeedback({ type: 'success', message: 'Giocatore aggiornato correttamente.' });
      closeEditPlayer();
    } catch (error) {
      console.error('Errore aggiornamento giocatore', error);
      setFeedback({ type: 'error', message: 'Errore durante il salvataggio del giocatore.' });
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="bg-secondary rounded-xl shadow-lg p-6">
        <h2 className="text-3xl font-bold text-accent">Giocatori</h2>
        <p className="text-text-secondary mt-1">
          Archivio globale condiviso tra eventi. Gestione ranking per l&apos;evento: <strong>{rankingEvent.name}</strong>.
        </p>
      </div>

      <div className="bg-secondary rounded-xl shadow-lg p-6">
        <h3 className="text-xl font-semibold mb-4">Crea nuovo giocatore</h3>
        <form onSubmit={handleCreatePlayer} className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          <input
            type="text"
            value={newPlayerName}
            onChange={event => setNewPlayerName(event.target.value)}
            placeholder="Nome Cognome"
            className="bg-primary border border-tertiary rounded-lg p-2"
            required
          />
          <input
            type="tel"
            value={newPlayerPhone}
            onChange={event => setNewPlayerPhone(event.target.value)}
            placeholder="Telefono"
            className="bg-primary border border-tertiary rounded-lg p-2"
          />
          <input
            type="number"
            min="0"
            value={newPlayerStartPoints}
            onChange={event => setNewPlayerStartPoints(event.target.value)}
            placeholder="Punti ranking iniziali"
            className="bg-primary border border-tertiary rounded-lg p-2"
          />
          <select
            value={selectedEventId}
            onChange={event => setSelectedEventId(event.target.value)}
            className="bg-primary border border-tertiary rounded-lg p-2"
          >
            <option value="">Non aggiungere a evento</option>
            {events.slice().sort((a, b) => a.name.localeCompare(b.name)).map(event => (
              <option key={event.id} value={event.id}>{event.name}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading}
            className="bg-highlight hover:bg-highlight/90 text-white rounded-lg font-semibold p-2 disabled:opacity-60"
          >
            {loading ? 'Salvataggio...' : 'Crea giocatore'}
          </button>
        </form>
        <label className="mt-3 inline-flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={addNewPlayerToRanking}
            onChange={event => setAddNewPlayerToRanking(event.target.checked)}
          />
          Aggiungi subito il nuovo giocatore al ranking dell&apos;evento
        </label>
      </div>

      <div className="bg-secondary rounded-xl shadow-lg p-6 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-xl font-semibold">Giocatori globali ({sortedPlayers.length})</h3>
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={playerSearchInput}
              onChange={event => {
                setPlayerSearchInput(event.target.value);
                setPlayerSearchQuery(event.target.value);
              }}
              placeholder="Cerca giocatore per nome"
              className="bg-primary border border-tertiary rounded-lg p-2 text-sm min-w-[220px]"
            />
            <button
              type="button"
              onClick={() => setPlayerSearchQuery(playerSearchInput)}
              className="px-3 py-2 rounded bg-tertiary text-text-primary text-sm font-semibold"
            >
              Cerca
            </button>
          </div>
          <div className="text-sm text-text-secondary w-full md:w-auto md:text-right">
            Ordinati alfabeticamente • Nel ranking: {rankingParticipantIds.length} • Risultati: {filteredPlayers.length}
          </div>
        </div>
        {feedback && (
          <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${feedback.type === 'success' ? 'bg-green-600/20 text-green-200 border border-green-500/30' : 'bg-red-600/20 text-red-200 border border-red-500/30'}`}>
            {feedback.message}
          </div>
        )}
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left border-b border-tertiary text-text-secondary">
              <th className="py-3 pr-3">Giocatore</th>
              <th className="py-3 pr-3">Telefono</th>
              <th className="py-3 pr-3">Punti iniziali</th>
              <th className="py-3 pr-3">Ranking</th>
              <th className="py-3 pr-3">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {filteredPlayers.map(player => (
              <React.Fragment key={player.id}>
                <tr className="border-b border-tertiary/40">
                  <td className="py-3 pr-3 font-semibold">{player.name}</td>
                  <td className="py-3 pr-3 text-text-secondary">{player.phone || '—'}</td>
                  <td className="py-3 pr-3 text-text-secondary">{player.summerRankingStartPoints ?? 0}</td>
                  <td className="py-3 pr-3">
                    {participantIdSet.has(player.id) ? (
                      <span className="px-2 py-1 rounded bg-green-600 text-white text-xs font-semibold">Nel ranking</span>
                    ) : (
                      <button
                        onClick={async () => {
                          try {
                            const startPoints = Number(player.summerRankingStartPoints ?? 0);
                            if (!Number.isFinite(startPoints) || startPoints < 0) {
                              setFeedback({ type: 'error', message: `Valore non valido per ${player.name}.` });
                              return;
                            }
                            await addPlayerToRanking(player, startPoints);
                          } catch (error) {
                            console.error('Errore aggiunta giocatore ranking', error);
                            setFeedback({ type: 'error', message: `Errore durante l'aggiunta di ${player.name} al ranking.` });
                          }
                        }}
                        className="px-3 py-1 rounded bg-highlight text-white text-xs font-semibold"
                      >
                        Aggiungi al ranking
                      </button>
                    )}
                  </td>
                  <td className="py-3 pr-3">
                    <button
                      onClick={() => openEditPlayer(player)}
                      className="px-3 py-1 rounded bg-highlight text-white text-xs font-semibold"
                    >
                      Modifica
                    </button>
                  </td>
                </tr>
                {editingPlayer?.id === player.id && (
                  <tr className="border-b border-tertiary/40 last:border-b-0">
                    <td colSpan={5} className="pb-4 pt-1">
                      <div className="rounded-xl border border-highlight/30 bg-primary/60 p-4">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                          <div>
                            <label className="text-sm text-text-secondary block mb-1">Nome</label>
                            <input
                              value={editPlayerName}
                              onChange={event => setEditPlayerName(event.target.value)}
                              className="w-full bg-primary border border-tertiary rounded p-2"
                            />
                          </div>
                          <div>
                            <label className="text-sm text-text-secondary block mb-1">Telefono</label>
                            <input
                              value={editPlayerPhone}
                              onChange={event => setEditPlayerPhone(event.target.value)}
                              className="w-full bg-primary border border-tertiary rounded p-2"
                            />
                          </div>
                          <div>
                            <label className="text-sm text-text-secondary block mb-1">Valore iniziale</label>
                            <input
                              type="number"
                              min="0"
                              value={editPlayerPoints}
                              onChange={event => setEditPlayerPoints(event.target.value)}
                              className="w-full bg-primary border border-tertiary rounded p-2"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-4">
                          <button onClick={closeEditPlayer} className="px-4 py-2 rounded bg-tertiary text-text-primary font-semibold">Annulla</button>
                          <button onClick={handleSaveEditedPlayer} disabled={editLoading} className="px-4 py-2 rounded bg-highlight text-white font-semibold">
                            {editLoading ? 'Salvataggio...' : 'Salva'}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {filteredPlayers.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-text-secondary">
                  Nessun giocatore trovato.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminPlayersView;
