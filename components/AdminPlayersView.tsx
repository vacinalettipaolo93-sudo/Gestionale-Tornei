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

  const sortedPlayers = useMemo(
    () => players.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [players],
  );
  const rankingData = useMemo<SummerRankingData>(() => ({
    slots: Array.isArray(rankingEvent.rankingData?.slots) ? rankingEvent.rankingData.slots : [],
    matches: Array.isArray(rankingEvent.rankingData?.matches) ? rankingEvent.rankingData.matches : [],
    participantIds: Array.isArray(rankingEvent.rankingData?.participantIds) ? rankingEvent.rankingData.participantIds : [],
    rules: rankingEvent.rankingData?.rules ?? DEFAULT_SUMMER_RANKING_RULES,
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

  const saveRankingData = async (nextData: SummerRankingData) => {
    setEvents(prev =>
      prev.map(item => item.id === rankingEvent.id ? { ...item, rankingData: nextData } : item),
    );
    await updateDoc(doc(db, 'events', rankingEvent.id), { rankingData: nextData });
  };

  const addPlayerToRanking = async (playerId: string) => {
    if (participantIdSet.has(playerId)) return;
    await saveRankingData({
      ...rankingData,
      participantIds: [...rankingParticipantIds, playerId],
    });
  };

  const addPlayerToEvent = async (eventId: string, player: Player) => {
    if (!eventId) return;
    const event = events.find(item => item.id === eventId);
    if (!event || event.players.some(existing => existing.id === player.id)) return;

    const eventPlayer: Player = {
      id: player.id,
      name: player.name,
      phone: player.phone ?? '',
      avatar: player.avatar,
      status: 'confirmed',
      summerRankingStartPoints: player.summerRankingStartPoints,
      summerRankingJoinedAt: player.summerRankingJoinedAt,
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
      if (addNewPlayerToRanking) {
        await addPlayerToRanking(playerId);
      }
      if (selectedEventId) {
        await addPlayerToEvent(selectedEventId, createdPlayer);
      }

      setNewPlayerName('');
      setNewPlayerPhone('');
      setNewPlayerStartPoints('0');
    } finally {
      setLoading(false);
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
          <div className="text-sm text-text-secondary">
            Ordinati alfabeticamente • Nel ranking: {rankingParticipantIds.length}
          </div>
        </div>
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="text-left border-b border-tertiary text-text-secondary">
              <th className="py-3 pr-3">Giocatore</th>
              <th className="py-3 pr-3">Telefono</th>
              <th className="py-3 pr-3">Punti iniziali</th>
              <th className="py-3 pr-3">Ranking</th>
              <th className="py-3 pr-3">Evento</th>
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map(player => (
              <tr key={player.id} className="border-b border-tertiary/40 last:border-b-0">
                <td className="py-3 pr-3 font-semibold">{player.name}</td>
                <td className="py-3 pr-3 text-text-secondary">{player.phone || '—'}</td>
                <td className="py-3 pr-3 text-text-secondary">{player.summerRankingStartPoints ?? 0}</td>
                <td className="py-3 pr-3">
                  {participantIdSet.has(player.id) ? (
                    <span className="px-2 py-1 rounded bg-green-600 text-white text-xs font-semibold">Nel ranking</span>
                  ) : (
                    <button
                      onClick={() => addPlayerToRanking(player.id)}
                      className="px-3 py-1 rounded bg-highlight text-white text-xs font-semibold"
                    >
                      Aggiungi al ranking
                    </button>
                  )}
                </td>
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => addPlayerToEvent(selectedEventId, player)}
                      disabled={!selectedEventId}
                      className="px-3 py-1 rounded bg-tertiary text-text-primary text-xs font-semibold disabled:opacity-40"
                    >
                      Aggiungi all&apos;evento
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sortedPlayers.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-text-secondary">
                  Nessun giocatore presente nell&apos;archivio globale.
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
