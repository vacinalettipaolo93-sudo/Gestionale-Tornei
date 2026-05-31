import React, { useEffect, useMemo, useState } from 'react';
import {
  type Match,
  type Player,
  type SummerAvailabilityDay,
  type SummerAvailabilityPeriod,
  type SummerPlayerAvailability,
  type SummerRankingData,
  type TimeSlot,
} from '../types';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from './Icons';
import {
  DEFAULT_SUMMER_RANKING_RULES,
  SUMMER_RANKING_NAME,
  calculateSummerRanking,
  getEligibleOpponents,
  getHeadToHeadCount,
} from '../utils/summerRanking';

type RankingTab = 'ranking' | 'matches' | 'rules' | 'slots' | 'availability' | 'players';
type AvailabilityFormState = Omit<SummerPlayerAvailability, 'updatedAt'>;

const AVAILABILITY_DAYS: Array<{ value: SummerAvailabilityDay; label: string; shortLabel: string }> = [
  { value: 'monday', label: 'Lunedì', shortLabel: 'Lun' },
  { value: 'tuesday', label: 'Martedì', shortLabel: 'Mar' },
  { value: 'wednesday', label: 'Mercoledì', shortLabel: 'Mer' },
  { value: 'thursday', label: 'Giovedì', shortLabel: 'Gio' },
  { value: 'friday', label: 'Venerdì', shortLabel: 'Ven' },
  { value: 'saturday', label: 'Sabato', shortLabel: 'Sab' },
  { value: 'sunday', label: 'Domenica', shortLabel: 'Dom' },
];

const AVAILABILITY_PERIODS: Array<{ value: SummerAvailabilityPeriod; label: string }> = [
  { value: 'morning', label: 'Mattina' },
  { value: 'afternoon', label: 'Pomeriggio' },
  { value: 'evening', label: 'Sera' },
];

const normalizeAvailability = (availability?: SummerPlayerAvailability): AvailabilityFormState => ({
  status: availability?.status ?? 'unavailable',
  days: availability?.status === 'available' ? availability.days ?? [] : [],
  periods: availability?.status === 'available' ? availability.periods ?? [] : [],
});

const toggleArrayValue = <T,>(items: T[], value: T) =>
  items.includes(value) ? items.filter(item => item !== value) : [...items, value];

const getAvailabilitySummary = (availability?: SummerPlayerAvailability) => {
  if (!availability || availability.status !== 'available') {
    return {
      status: 'Non disponibile',
      details: null as string | null,
    };
  }

  const days = availability.days.length > 0
    ? availability.days
        .map(day => AVAILABILITY_DAYS.find(option => option.value === day)?.shortLabel ?? day)
        .join(', ')
    : 'Giorni da definire';
  const periods = availability.periods.length > 0
    ? availability.periods
        .map(period => AVAILABILITY_PERIODS.find(option => option.value === period)?.label ?? period)
        .join(', ')
    : 'Fasce da definire';

  return {
    status: 'Disponibile',
    details: `${days} • ${periods}`,
  };
};

interface SummerRankingViewProps {
  players: Player[];
  rankingData: SummerRankingData;
  isOrganizer: boolean;
  loggedInPlayerId?: string;
  onPlayerContact: (player: Player) => void;
  onSaveRankingData: (nextData: SummerRankingData) => Promise<void>;
  onUpdatePlayerStartPoints: (playerId: string, points: number) => Promise<void>;
  onOpenPlayersAdmin?: () => void;
}

const generateId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const formatDateTime = (value?: string) => {
  if (!value) return 'Data non disponibile';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const SummerRankingView: React.FC<SummerRankingViewProps> = ({
  players,
  rankingData,
  isOrganizer,
  loggedInPlayerId,
  onPlayerContact,
  onSaveRankingData,
  onUpdatePlayerStartPoints,
  onOpenPlayersAdmin,
}) => {
  const [activeTab, setActiveTab] = useState<RankingTab>('ranking');
  const [slotForm, setSlotForm] = useState({ start: '', location: '', field: '' });
  const [bookingForm, setBookingForm] = useState({ slotId: '', opponentId: '', player1Id: '', player2Id: '' });
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [scoreForm, setScoreForm] = useState({ score1: '', score2: '' });
  const [rulesDraft, setRulesDraft] = useState(rankingData.rules ?? DEFAULT_SUMMER_RANKING_RULES);
  const [isEditingRules, setIsEditingRules] = useState(false);
  const [startPointsDrafts, setStartPointsDrafts] = useState<Record<string, string>>({});
  const [busyPlayerId, setBusyPlayerId] = useState<string | null>(null);
  const [availabilityForm, setAvailabilityForm] = useState<AvailabilityFormState>(() =>
    normalizeAvailability(loggedInPlayerId ? rankingData.availabilities?.[loggedInPlayerId] : undefined)
  );

  useEffect(() => {
    setRulesDraft(rankingData.rules ?? DEFAULT_SUMMER_RANKING_RULES);
  }, [rankingData.rules]);

  const rankingParticipantIds = useMemo(
    () => (Array.isArray(rankingData.participantIds) ? rankingData.participantIds : []),
    [rankingData.participantIds],
  );
  const rankingParticipantIdSet = useMemo(
    () => new Set(rankingParticipantIds),
    [rankingParticipantIds],
  );
  const confirmedPlayers = useMemo(
    () =>
      players
        .filter(player => player.status === 'confirmed' && rankingParticipantIdSet.has(player.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [players, rankingParticipantIdSet],
  );
  useEffect(() => {
    setStartPointsDrafts(
      confirmedPlayers.reduce<Record<string, string>>((acc, player) => {
        acc[player.id] = String(player.summerRankingStartPoints ?? 0);
        return acc;
      }, {})
    );
  }, [confirmedPlayers]);
  const ranking = useMemo(
    () => calculateSummerRanking(confirmedPlayers, rankingData.matches),
    [confirmedPlayers, rankingData.matches],
  );
  const playerMap = useMemo(
    () => new Map(players.map(player => [player.id, player])),
    [players],
  );
  const bookedSlotIds = useMemo(
    () => new Set(
      rankingData.matches
        .filter(match => match.slotId && match.status !== 'pending')
        .map(match => String(match.slotId))
    ),
    [rankingData.matches],
  );
  const availableSlots = useMemo(
    () => rankingData.slots
      .filter(slot => !bookedSlotIds.has(slot.id))
      .slice()
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [rankingData.slots, bookedSlotIds],
  );
  const currentPlayer = confirmedPlayers.find(player => player.id === loggedInPlayerId);
  const currentPlayerAvailability = loggedInPlayerId ? rankingData.availabilities?.[loggedInPlayerId] : undefined;
  const eligibleOpponents = useMemo(
    () => currentPlayer ? getEligibleOpponents(confirmedPlayers, rankingData.matches, currentPlayer.id) : [],
    [confirmedPlayers, rankingData.matches, currentPlayer],
  );

  const canBookAsParticipant = !!currentPlayer;
  const addablePlayers = useMemo(
    () =>
      players
        .filter(player => player.status === 'confirmed' && !rankingParticipantIdSet.has(player.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [players, rankingParticipantIdSet],
  );

  useEffect(() => {
    setAvailabilityForm(normalizeAvailability(currentPlayerAvailability));
  }, [currentPlayerAvailability, loggedInPlayerId]);

  const handleAddSlot = async () => {
    if (!slotForm.start || !slotForm.location.trim()) return;
    const nextSlot: TimeSlot = {
      id: generateId('slot'),
      start: slotForm.start,
      location: slotForm.location.trim(),
      field: slotForm.field.trim(),
    };
    await onSaveRankingData({
      ...rankingData,
      slots: [...rankingData.slots, nextSlot],
    });
  };

  const handleDeleteSlot = async (slotId: string) => {
    await onSaveRankingData({
      ...rankingData,
      slots: rankingData.slots.filter(slot => slot.id !== slotId),
    });
  };

  const handleCreateBookedMatch = async () => {
    const slot = availableSlots.find(item => item.id === bookingForm.slotId);
    if (!slot) return;

    const participantIds = isOrganizer && !loggedInPlayerId
      ? [bookingForm.player1Id, bookingForm.player2Id]
      : [loggedInPlayerId ?? '', bookingForm.opponentId];

    if (!participantIds[0] || !participantIds[1] || participantIds[0] === participantIds[1]) return;
    if (getHeadToHeadCount(rankingData.matches, participantIds[0], participantIds[1]) >= 5) return;

    const nextMatch: Match = {
      id: generateId('srn-match'),
      player1Id: participantIds[0],
      player2Id: participantIds[1],
      score1: null,
      score2: null,
      status: 'scheduled',
      scheduledTime: slot.start,
      location: slot.location,
      field: slot.field,
      slotId: slot.id,
    };

    await onSaveRankingData({
      ...rankingData,
      matches: [...rankingData.matches, nextMatch],
    });
    setBookingForm({ slotId: '', opponentId: '', player1Id: '', player2Id: '' });
  };

  const openEditResult = (match: Match) => {
    setEditingMatchId(match.id);
    setScoreForm({
      score1: match.score1 !== null ? String(match.score1) : '',
      score2: match.score2 !== null ? String(match.score2) : '',
    });
  };

  const handleSaveResult = async (match: Match) => {
    const score1 = Number(scoreForm.score1);
    const score2 = Number(scoreForm.score2);
    if (Number.isNaN(score1) || Number.isNaN(score2) || score1 < 0 || score2 < 0) return;

    await onSaveRankingData({
      ...rankingData,
      matches: rankingData.matches.map(item =>
        item.id === match.id
          ? {
              ...item,
              score1,
              score2,
              status: 'completed',
              completedAt: item.completedAt ?? new Date().toISOString(),
            }
          : item
      ),
    });
    setEditingMatchId(null);
    setScoreForm({ score1: '', score2: '' });
  };

  const handleResetResult = async (match: Match) => {
    await onSaveRankingData({
      ...rankingData,
      matches: rankingData.matches.map(item =>
        item.id === match.id
          ? {
              ...item,
              score1: null,
              score2: null,
              status: item.slotId ? 'scheduled' : 'pending',
              completedAt: undefined,
            }
          : item
      ),
    });
  };

  const handleDeleteMatch = async (matchId: string) => {
    await onSaveRankingData({
      ...rankingData,
      matches: rankingData.matches.filter(match => match.id !== matchId),
    });
  };

  const handleSaveRules = async () => {
    await onSaveRankingData({
      ...rankingData,
      rules: rulesDraft.trim() || DEFAULT_SUMMER_RANKING_RULES,
    });
    setIsEditingRules(false);
  };

  const saveStartPoints = async (playerId: string) => {
    const nextPoints = Number(startPointsDrafts[playerId] ?? 0);
    if (Number.isNaN(nextPoints)) return;
    setBusyPlayerId(playerId);
    try {
      await onUpdatePlayerStartPoints(playerId, nextPoints);
    } finally {
      setBusyPlayerId(null);
    }
  };

  const canEditMatchResult = (match: Match) =>
    isOrganizer || loggedInPlayerId === match.player1Id || loggedInPlayerId === match.player2Id;

  const handleSaveAvailability = async () => {
    if (!currentPlayer) return;
    if (availabilityForm.status === 'available' && (availabilityForm.days.length === 0 || availabilityForm.periods.length === 0)) {
      return;
    }

    await onSaveRankingData({
      ...rankingData,
      availabilities: {
        ...(rankingData.availabilities ?? {}),
        [currentPlayer.id]: {
          status: availabilityForm.status,
          days: availabilityForm.status === 'available' ? availabilityForm.days : [],
          periods: availabilityForm.status === 'available' ? availabilityForm.periods : [],
          updatedAt: new Date().toISOString(),
        },
      },
    });
  };

  const handleAddParticipant = async (playerId: string) => {
    if (!isOrganizer || rankingParticipantIdSet.has(playerId)) return;
    await onSaveRankingData({
      ...rankingData,
      participantIds: [...rankingParticipantIds, playerId],
    });
  };

  const handleRemoveParticipant = async (playerId: string) => {
    if (!isOrganizer || !rankingParticipantIdSet.has(playerId)) return;
    const nextAvailabilities = { ...(rankingData.availabilities ?? {}) };
    delete nextAvailabilities[playerId];
    await onSaveRankingData({
      ...rankingData,
      participantIds: rankingParticipantIds.filter(id => id !== playerId),
      matches: rankingData.matches.filter(match => match.player1Id !== playerId && match.player2Id !== playerId),
      availabilities: nextAvailabilities,
    });
  };

  const topEightQualified = ranking.filter(entry => entry.qualifiedForMaster);

  return (
    <div className="space-y-6">
      <div className="bg-secondary rounded-xl shadow-lg p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-accent">{SUMMER_RANKING_NAME}</h2>
            <p className="text-text-secondary mt-1">
              Ranking globale unico con preview, partite, regolamento, disponibilità e slot prenotabili.
            </p>
          </div>
          <div className="text-sm text-text-secondary">
            {confirmedPlayers.length} giocatori nel ranking • {rankingData.matches.length} partite registrate
          </div>
        </div>

        <nav className="mt-6 bg-primary/60 rounded-lg p-3 flex flex-wrap gap-2" aria-label="Menu Summer Ranking Next">
          {([
            ['ranking', 'Ranking'],
            ['matches', 'Partite'],
            ['availability', 'Disponibilità'],
            ['rules', 'Regolamento'],
            ['slots', 'Slot / Prenotazioni'],
            ['players', 'Giocatori'],
          ] as Array<[RankingTab, string]>).map(([tab, label]) => (
            <button
              key={tab}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${activeTab === tab ? 'bg-accent text-white' : 'bg-tertiary hover:bg-tertiary/90 text-text-primary'}`}
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'ranking' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-secondary rounded-xl p-5 shadow-lg">
              <div className="text-sm text-text-secondary">Leader attuale</div>
              <div className="text-xl font-bold mt-2">{ranking[0]?.player.name ?? 'Nessuno'}</div>
              <div className="text-accent font-semibold mt-1">{ranking[0]?.points ?? 0} pt</div>
            </div>
            <div className="bg-secondary rounded-xl p-5 shadow-lg">
              <div className="text-sm text-text-secondary">Master finale</div>
              <div className="text-xl font-bold mt-2">{topEightQualified.length}/8 qualificati</div>
              <div className="text-text-secondary mt-1">Servono almeno 10 partite giocate.</div>
            </div>
            <div className="bg-secondary rounded-xl p-5 shadow-lg">
              <div className="text-sm text-text-secondary">Slot disponibili</div>
              <div className="text-xl font-bold mt-2">{availableSlots.length}</div>
              <div className="text-text-secondary mt-1">Prenotabili dal tab dedicato.</div>
            </div>
          </div>

          <div className="bg-secondary rounded-xl shadow-lg p-6 overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead>
                <tr className="text-left border-b border-tertiary text-text-secondary">
                  <th className="py-3 pr-3">Rank</th>
                  <th className="py-3 pr-3">Giocatore</th>
                  <th className="py-3 pr-3">Punti</th>
                  <th className="py-3 pr-3">Serie</th>
                  <th className="py-3 pr-3">Partite</th>
                  <th className="py-3 pr-3">Bonus/Malus</th>
                  <th className="py-3 pr-3">Slot</th>
                  <th className="py-3 pr-3">Disponibilità</th>
                  <th className="py-3 pr-3">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map(entry => {
                  const availabilitySummary = getAvailabilitySummary(rankingData.availabilities?.[entry.player.id]);

                  return (
                  <tr key={entry.player.id} className="border-b border-tertiary/40 last:border-b-0 align-top">
                    <td className="py-4 pr-3 font-bold text-accent">{entry.rank}</td>
                    <td className="py-4 pr-3">
                      <div className="font-semibold flex items-center gap-2">
                        {entry.player.name}
                        {entry.qualifiedForMaster && (
                          <span className="px-2 py-0.5 rounded bg-green-600 text-white text-xs font-semibold">
                            Master
                          </span>
                        )}

                      </div>
                      <div className="text-xs text-text-secondary mt-1">
                        Base {entry.startingPoints} pt
                        {isOrganizer && (
                          <span className="ml-2 inline-flex items-center gap-2">
                            <input
                              type="number"
                              value={startPointsDrafts[entry.player.id] ?? '0'}
                              onChange={event => setStartPointsDrafts(prev => ({ ...prev, [entry.player.id]: event.target.value }))}
                              className="w-20 bg-primary border border-tertiary rounded px-2 py-1 text-text-primary"
                            />
                            <button
                              onClick={() => saveStartPoints(entry.player.id)}
                              disabled={busyPlayerId === entry.player.id}
                              className="px-2 py-1 rounded bg-highlight text-white text-xs font-semibold"
                            >
                              {busyPlayerId === entry.player.id ? 'Salvo...' : 'Salva'}
                            </button>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 pr-3">
                      <div className="font-bold text-lg">{entry.points}</div>
                      <div className="flex items-center gap-1 text-xs mt-1">
                        {entry.trend === 'up' && <ArrowUpIcon className="w-4 h-4 text-green-400" />}
                        {entry.trend === 'down' && <ArrowDownIcon className="w-4 h-4 text-red-400" />}
                        {entry.trend === 'steady' && <span className="text-text-secondary">•</span>}
                        <span className="text-text-secondary">trend recente</span>
                      </div>
                    </td>
                    <td className="py-4 pr-3 font-mono text-xs tracking-wide">
                      {entry.recentForm.length > 0 ? entry.recentForm.join(' ') : '—'}
                    </td>
                    <td className="py-4 pr-3">
                      <div>{entry.matchesPlayed} giocate</div>
                      <div className="text-xs text-text-secondary mt-1">
                        {entry.wins}V • {entry.draws}N • {entry.losses}P
                      </div>
                    </td>
                    <td className="py-4 pr-3 text-xs text-text-secondary">
                      <div>Risultati: {entry.resultPoints}</div>
                      <div>Partecipazione: {entry.participationBonus}</div>
                      <div>Game diff: {entry.gameDiffBonus}</div>
                      <div>Inattività: -{entry.inactivityMalus}</div>
                    </td>
                    <td className="py-4 pr-3 text-xs text-text-secondary">
                      <div>{entry.upcomingMatches} prenotazioni attive</div>
                      <div className="mt-1">{entry.lastMatchAt ? `Ultima: ${formatDateTime(entry.lastMatchAt)}` : 'Nessuna partita'}</div>
                    </td>
                    <td className="py-4 pr-3 text-xs text-text-secondary">
                      <div className={`font-semibold ${availabilitySummary.status === 'Disponibile' ? 'text-green-400' : 'text-text-primary'}`}>
                        {availabilitySummary.status}
                      </div>
                      {availabilitySummary.details && (
                        <div className="mt-1 leading-relaxed">
                          {availabilitySummary.details}
                        </div>
                      )}
                    </td>
                    <td className="py-4 pr-3">
                      <button
                        onClick={() => onPlayerContact(entry.player)}
                        className="px-3 py-1 rounded bg-tertiary hover:bg-tertiary/90 text-text-primary text-xs font-semibold"
                      >
                        Contatta
                      </button>
                    </td>
                  </tr>
                  );
                })}
                {ranking.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-text-secondary">
                      Nessun giocatore confermato nel Summer Ranking Next.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'players' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-secondary rounded-xl shadow-lg p-6 overflow-x-auto">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-xl font-bold text-accent">Partecipanti ranking ({confirmedPlayers.length})</h3>
              {isOrganizer && onOpenPlayersAdmin && (
                <button
                  onClick={onOpenPlayersAdmin}
                  className="px-3 py-2 rounded bg-tertiary text-text-primary text-xs font-semibold"
                >
                  Apri gestione globale Giocatori
                </button>
              )}
            </div>
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left border-b border-tertiary text-text-secondary">
                  <th className="py-3 pr-3">Giocatore</th>
                  <th className="py-3 pr-3">Telefono</th>
                  <th className="py-3 pr-3">Punti iniziali</th>
                  {isOrganizer && <th className="py-3 pr-3">Azioni</th>}
                </tr>
              </thead>
              <tbody>
                {confirmedPlayers.map(player => (
                  <tr key={player.id} className="border-b border-tertiary/40 last:border-b-0">
                    <td className="py-3 pr-3 font-semibold">{player.name}</td>
                    <td className="py-3 pr-3 text-text-secondary">{player.phone || '—'}</td>
                    <td className="py-3 pr-3 text-text-secondary">{player.summerRankingStartPoints ?? 0}</td>
                    {isOrganizer && (
                      <td className="py-3 pr-3">
                        <button
                          onClick={() => handleRemoveParticipant(player.id)}
                          className="px-3 py-1 rounded bg-red-600 text-white text-xs font-semibold"
                        >
                          Rimuovi dal ranking
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {confirmedPlayers.length === 0 && (
                  <tr>
                    <td colSpan={isOrganizer ? 4 : 3} className="py-8 text-center text-text-secondary">
                      Nessun partecipante nel ranking.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {isOrganizer && (
            <div className="bg-secondary rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-accent">Aggiungi dal database giocatori</h3>
              <p className="text-text-secondary mt-1 text-sm">
                L&apos;archivio globale resta separato: qui gestisci solo l&apos;appartenenza a questo ranking.
              </p>
              <div className="mt-4 space-y-3 max-h-[460px] overflow-y-auto pr-1">
                {addablePlayers.map(player => (
                  <div key={player.id} className="flex items-center justify-between gap-3 bg-primary rounded-lg border border-tertiary p-3">
                    <div>
                      <div className="font-semibold">{player.name}</div>
                      <div className="text-xs text-text-secondary">{player.phone || 'Telefono non inserito'}</div>
                    </div>
                    <button
                      onClick={() => handleAddParticipant(player.id)}
                      className="px-3 py-1 rounded bg-highlight text-white text-xs font-semibold"
                    >
                      Aggiungi
                    </button>
                  </div>
                ))}
                {addablePlayers.length === 0 && (
                  <div className="text-sm text-text-secondary">
                    Tutti i giocatori confermati sono già presenti nel ranking.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'matches' && (
        <div className="bg-secondary rounded-xl shadow-lg p-6 overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="text-left border-b border-tertiary text-text-secondary">
                <th className="py-3 pr-3">Partita</th>
                <th className="py-3 pr-3">Stato</th>
                <th className="py-3 pr-3">Slot</th>
                <th className="py-3 pr-3">Risultato</th>
                <th className="py-3 pr-3">Limite scontri</th>
                <th className="py-3 pr-3">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {rankingData.matches
                .slice()
                .sort((a, b) => {
                  const aTime = new Date(a.completedAt ?? a.scheduledTime ?? 0).getTime();
                  const bTime = new Date(b.completedAt ?? b.scheduledTime ?? 0).getTime();
                  return bTime - aTime;
                })
                .map(match => {
                  const player1 = playerMap.get(match.player1Id);
                  const player2 = playerMap.get(match.player2Id);
                  const encounterCount = getHeadToHeadCount(rankingData.matches, match.player1Id, match.player2Id);

                  return (
                    <tr key={match.id} className="border-b border-tertiary/40 last:border-b-0 align-top">
                      <td className="py-4 pr-3">
                        <div className="font-semibold">{player1?.name ?? match.player1Id} vs {player2?.name ?? match.player2Id}</div>
                        <div className="text-xs text-text-secondary mt-1">
                          {match.completedAt ? `Conclusa il ${formatDateTime(match.completedAt)}` : 'In attesa di risultato'}
                        </div>
                      </td>
                      <td className="py-4 pr-3">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${match.status === 'completed' ? 'bg-green-600 text-white' : match.status === 'scheduled' ? 'bg-accent text-white' : 'bg-tertiary text-text-primary'}`}>
                          {match.status === 'completed' ? 'Completata' : match.status === 'scheduled' ? 'Prenotata' : 'Da programmare'}
                        </span>
                      </td>
                      <td className="py-4 pr-3 text-xs text-text-secondary">
                        {match.slotId ? (
                          <>
                            <div>{formatDateTime(match.scheduledTime)}</div>
                            <div>{match.location} {match.field ? `• ${match.field}` : ''}</div>
                          </>
                        ) : 'Nessuno slot'}
                      </td>
                      <td className="py-4 pr-3">
                        {editingMatchId === match.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              value={scoreForm.score1}
                              onChange={event => setScoreForm(prev => ({ ...prev, score1: event.target.value }))}
                              className="w-16 bg-primary border border-tertiary rounded px-2 py-1"
                            />
                            <span>-</span>
                            <input
                              type="number"
                              min="0"
                              value={scoreForm.score2}
                              onChange={event => setScoreForm(prev => ({ ...prev, score2: event.target.value }))}
                              className="w-16 bg-primary border border-tertiary rounded px-2 py-1"
                            />
                            <button
                              onClick={() => handleSaveResult(match)}
                              className="px-3 py-1 rounded bg-highlight text-white text-xs font-semibold"
                            >
                              Salva
                            </button>
                          </div>
                        ) : (
                          <span className="font-semibold">
                            {match.score1 !== null && match.score2 !== null ? `${match.score1} - ${match.score2}` : '—'}
                          </span>
                        )}
                      </td>
                      <td className="py-4 pr-3 text-xs text-text-secondary">
                        {encounterCount}/5
                      </td>
                      <td className="py-4 pr-3">
                        <div className="flex flex-wrap gap-2">
                          {canEditMatchResult(match) && editingMatchId !== match.id && (
                            <button
                              onClick={() => openEditResult(match)}
                              className="px-3 py-1 rounded bg-tertiary hover:bg-tertiary/90 text-text-primary text-xs font-semibold"
                            >
                              {match.status === 'completed' ? 'Modifica risultato' : 'Inserisci risultato'}
                            </button>
                          )}
                          {canEditMatchResult(match) && match.status === 'completed' && (
                            <button
                              onClick={() => handleResetResult(match)}
                              className="px-3 py-1 rounded bg-primary border border-tertiary text-xs font-semibold"
                            >
                              Ripristina
                            </button>
                          )}
                          {isOrganizer && (
                            <button
                              onClick={() => handleDeleteMatch(match.id)}
                              className="px-3 py-1 rounded bg-red-600 text-white text-xs font-semibold"
                            >
                              Elimina
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              {rankingData.matches.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-text-secondary">
                    Nessuna partita prenotata nel ranking.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'availability' && (
        <div className="space-y-6">
          <div className="bg-secondary rounded-xl shadow-lg p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-xl font-bold text-accent">Disponibilità utente</h3>
                <p className="text-text-secondary mt-1">
                  Imposta da qui la tua disponibilità settimanale senza modificare gli slot prenotabili.
                </p>
              </div>
              {currentPlayerAvailability?.updatedAt && (
                <div className="text-xs text-text-secondary">
                  Ultimo aggiornamento: {formatDateTime(currentPlayerAvailability.updatedAt)}
                </div>
              )}
            </div>

            {currentPlayer ? (
              <div className="mt-6 space-y-6">
                <div>
                  <div className="text-sm font-semibold mb-3">Stato disponibilità</div>
                  <div className="flex flex-wrap gap-3">
                    {[
                      ['available', 'Disponibile'],
                      ['unavailable', 'Non disponibile'],
                    ].map(([status, label]) => (
                      <button
                        key={status}
                        onClick={() => setAvailabilityForm(prev => ({
                          ...prev,
                          status: status as AvailabilityFormState['status'],
                          days: status === 'available' ? prev.days : [],
                          periods: status === 'available' ? prev.periods : [],
                        }))}
                        className={`px-4 py-2 rounded-lg border text-sm font-semibold ${
                          availabilityForm.status === status
                            ? 'bg-accent text-white border-accent'
                            : 'bg-primary border-tertiary text-text-primary'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {availabilityForm.status === 'available' && (
                  <>
                    <div>
                      <div className="text-sm font-semibold mb-3">Giorni disponibili</div>
                      <div className="flex flex-wrap gap-2">
                        {AVAILABILITY_DAYS.map(day => (
                          <button
                            key={day.value}
                            onClick={() => setAvailabilityForm(prev => ({
                              ...prev,
                              days: toggleArrayValue(prev.days, day.value),
                            }))}
                            className={`px-3 py-2 rounded-lg border text-sm ${
                              availabilityForm.days.includes(day.value)
                                ? 'bg-highlight text-white border-highlight'
                                : 'bg-primary border-tertiary text-text-primary'
                            }`}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-semibold mb-3">Fasce orarie</div>
                      <div className="flex flex-wrap gap-2">
                        {AVAILABILITY_PERIODS.map(period => (
                          <button
                            key={period.value}
                            onClick={() => setAvailabilityForm(prev => ({
                              ...prev,
                              periods: toggleArrayValue(prev.periods, period.value),
                            }))}
                            className={`px-3 py-2 rounded-lg border text-sm ${
                              availabilityForm.periods.includes(period.value)
                                ? 'bg-highlight text-white border-highlight'
                                : 'bg-primary border-tertiary text-text-primary'
                            }`}
                          >
                            {period.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="rounded-lg border border-tertiary bg-primary p-4 text-sm text-text-secondary">
                  {(() => {
                    const summary = getAvailabilitySummary({
                      status: availabilityForm.status,
                      days: availabilityForm.days,
                      periods: availabilityForm.periods,
                    });

                    return (
                      <>
                        <div className="font-semibold text-text-primary">Riepilogo tabella</div>
                        <div className="mt-1">{summary.status}</div>
                        {summary.details && <div className="mt-1">{summary.details}</div>}
                      </>
                    );
                  })()}
                </div>

                {availabilityForm.status === 'available' && (availabilityForm.days.length === 0 || availabilityForm.periods.length === 0) && (
                  <div className="text-sm text-yellow-300">
                    Se sei disponibile, seleziona almeno un giorno e una fascia oraria.
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleSaveAvailability}
                    disabled={availabilityForm.status === 'available' && (availabilityForm.days.length === 0 || availabilityForm.periods.length === 0)}
                    className="px-4 py-2 rounded bg-highlight text-white font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Salva disponibilità
                  </button>
                  <button
                    onClick={() => setAvailabilityForm(normalizeAvailability(currentPlayerAvailability))}
                    className="px-4 py-2 rounded bg-tertiary text-text-primary font-semibold"
                  >
                    Ripristina
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-lg border border-tertiary bg-primary p-4 text-text-secondary">
                Accedi con un profilo giocatore confermato per impostare la disponibilità.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="bg-secondary rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h3 className="text-xl font-bold text-accent">Regolamento ufficiale</h3>
            {isOrganizer && !isEditingRules && (
              <button
                onClick={() => setIsEditingRules(true)}
                className="px-4 py-2 rounded bg-highlight text-white font-semibold"
              >
                Modifica testo
              </button>
            )}
          </div>
          {isEditingRules ? (
            <div className="space-y-3">
              <textarea
                value={rulesDraft}
                onChange={event => setRulesDraft(event.target.value)}
                className="w-full min-h-[320px] bg-primary border border-tertiary rounded-lg p-3"
              />
              <div className="flex flex-wrap gap-3">
                <button onClick={handleSaveRules} className="px-4 py-2 rounded bg-highlight text-white font-semibold">
                  Salva regolamento
                </button>
                <button
                  onClick={() => {
                    setRulesDraft(rankingData.rules ?? DEFAULT_SUMMER_RANKING_RULES);
                    setIsEditingRules(false);
                  }}
                  className="px-4 py-2 rounded bg-tertiary text-text-primary font-semibold"
                >
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-primary rounded-lg p-4 whitespace-pre-line border border-tertiary">
              {rankingData.rules ?? DEFAULT_SUMMER_RANKING_RULES}
            </div>
          )}
        </div>
      )}

      {activeTab === 'slots' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="space-y-6">
            {isOrganizer && (
              <div className="bg-secondary rounded-xl shadow-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <PlusIcon className="w-5 h-5 text-accent" />
                  <h3 className="text-xl font-bold text-accent">Aggiungi slot</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    type="datetime-local"
                    value={slotForm.start}
                    onChange={event => setSlotForm(prev => ({ ...prev, start: event.target.value }))}
                    className="bg-primary border border-tertiary rounded-lg p-2"
                  />
                  <input
                    type="text"
                    value={slotForm.location}
                    onChange={event => setSlotForm(prev => ({ ...prev, location: event.target.value }))}
                    placeholder="Luogo"
                    className="bg-primary border border-tertiary rounded-lg p-2"
                  />
                  <input
                    type="text"
                    value={slotForm.field}
                    onChange={event => setSlotForm(prev => ({ ...prev, field: event.target.value }))}
                    placeholder="Campo"
                    className="bg-primary border border-tertiary rounded-lg p-2"
                  />
                </div>
                <button
                  onClick={handleAddSlot}
                  className="mt-4 px-4 py-2 rounded bg-highlight text-white font-semibold"
                >
                  Salva slot
                </button>
              </div>
            )}

            {(canBookAsParticipant || isOrganizer) && (
              <div className="bg-secondary rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-bold text-accent mb-4">Prenota una partita ranking</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <select
                    value={bookingForm.slotId}
                    onChange={event => setBookingForm(prev => ({ ...prev, slotId: event.target.value }))}
                    className="bg-primary border border-tertiary rounded-lg p-2"
                  >
                    <option value="">Seleziona slot</option>
                    {availableSlots.map(slot => (
                      <option key={slot.id} value={slot.id}>
                        {formatDateTime(slot.start)} • {slot.location} {slot.field ? `• ${slot.field}` : ''}
                      </option>
                    ))}
                  </select>

                  {isOrganizer && !loggedInPlayerId ? (
                    <>
                      <select
                        value={bookingForm.player1Id}
                        onChange={event => setBookingForm(prev => ({ ...prev, player1Id: event.target.value }))}
                        className="bg-primary border border-tertiary rounded-lg p-2"
                      >
                        <option value="">Giocatore 1</option>
                        {confirmedPlayers.map(player => (
                          <option key={player.id} value={player.id}>{player.name}</option>
                        ))}
                      </select>
                      <select
                        value={bookingForm.player2Id}
                        onChange={event => setBookingForm(prev => ({ ...prev, player2Id: event.target.value }))}
                        className="bg-primary border border-tertiary rounded-lg p-2"
                      >
                        <option value="">Giocatore 2</option>
                        {confirmedPlayers
                          .filter(player => player.id !== bookingForm.player1Id)
                          .map(player => (
                            <option key={player.id} value={player.id}>{player.name}</option>
                          ))}
                      </select>
                    </>
                  ) : (
                    <select
                      value={bookingForm.opponentId}
                      onChange={event => setBookingForm(prev => ({ ...prev, opponentId: event.target.value }))}
                      className="bg-primary border border-tertiary rounded-lg p-2"
                    >
                      <option value="">Seleziona avversario</option>
                      {eligibleOpponents.map(player => (
                        <option key={player.id} value={player.id}>
                          {player.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <p className="text-xs text-text-secondary mt-3">
                  Ogni coppia di giocatori può prenotare al massimo 5 incontri.
                </p>
                <button
                  onClick={handleCreateBookedMatch}
                  className="mt-4 px-4 py-2 rounded bg-highlight text-white font-semibold"
                >
                  Conferma prenotazione
                </button>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-secondary rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-accent mb-4">Slot disponibili</h3>
              <ul className="space-y-3">
                {availableSlots.map(slot => (
                  <li key={slot.id} className="flex items-center justify-between gap-4 bg-primary rounded-lg p-3 border border-tertiary">
                    <div>
                      <div className="font-semibold">{formatDateTime(slot.start)}</div>
                      <div className="text-xs text-text-secondary">{slot.location} {slot.field ? `• ${slot.field}` : ''}</div>
                    </div>
                    {isOrganizer && (
                      <button
                        onClick={() => handleDeleteSlot(slot.id)}
                        className="p-2 rounded bg-red-600 text-white"
                        aria-label="Elimina slot"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                ))}
                {availableSlots.length === 0 && (
                  <li className="text-text-secondary">Nessuno slot disponibile.</li>
                )}
              </ul>
            </div>

            <div className="bg-secondary rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-accent mb-4">Prenotazioni attive</h3>
              <ul className="space-y-3">
                {rankingData.matches
                  .filter(match => match.status === 'scheduled')
                  .slice()
                  .sort((a, b) => new Date(a.scheduledTime ?? 0).getTime() - new Date(b.scheduledTime ?? 0).getTime())
                  .map(match => (
                    <li key={match.id} className="bg-primary rounded-lg p-3 border border-tertiary">
                      <div className="font-semibold">
                        {playerMap.get(match.player1Id)?.name ?? match.player1Id} vs {playerMap.get(match.player2Id)?.name ?? match.player2Id}
                      </div>
                      <div className="text-xs text-text-secondary mt-1">
                        {formatDateTime(match.scheduledTime)} • {match.location} {match.field ? `• ${match.field}` : ''}
                      </div>
                    </li>
                  ))}
                {rankingData.matches.every(match => match.status !== 'scheduled') && (
                  <li className="text-text-secondary">Nessuna prenotazione attiva.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SummerRankingView;
