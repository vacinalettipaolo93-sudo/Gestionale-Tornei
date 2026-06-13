import React, { useEffect, useMemo, useState } from 'react';
import {
  type Match,
  type Player,
  type PlayoffBracket,
  type SummerAvailabilityDay,
  type SummerAvailabilityPeriod,
  type SummerPlayerAvailability,
  type SummerRankingData,
  type SummerRankingMasterMatch,
  type SummerRankingRulesConfig,
  type TimeSlot,
} from '../types';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from './Icons';
import {
  SUMMER_RANKING_NAME,
  calculateSummerRanking,
  createSummerRankingMasterBracket,
  generateRulesText,
  getSummerRankingAutoQualifiedPlayerIds,
  getEligibleOpponents,
  getHeadToHeadCount,
  getSummerRankingMasterQualifiedPlayerIds,
  getSummerRankingWinPoints,
  normalizeRulesConfig,
  recomputeSummerRankingMasterBracket,
  removePlayerFromSummerRankingMaster,
  syncSummerRankingMasterMatches,
} from '../utils/summerRanking';

type RankingTab = 'ranking' | 'matches' | 'master' | 'rules' | 'settings' | 'availability' | 'players';
type AvailabilityFormState = { status: SummerAvailabilityStatus | null; days: SummerAvailabilityDay[]; periods: SummerAvailabilityPeriod[] };
type MasterScoreFormState = { matchId: string | null; score1: string; score2: string };

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
  status: availability?.status ?? null,
  days: availability?.status === 'available' ? availability.days ?? [] : [],
  periods: availability?.status === 'available' ? availability.periods ?? [] : [],
});

const toggleArrayValue = <T,>(items: T[], value: T) =>
  items.includes(value) ? items.filter(item => item !== value) : [...items, value];

const getAvailabilitySummary = (availability?: SummerPlayerAvailability) => {
  if (!availability) {
    return {
      status: 'Non dichiarata',
      details: null as string | null,
    };
  }
  if (availability.status !== 'available') {
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
  title?: string;
  description?: string;
  playersAdminLabel?: string;
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

const getChallengeBadgeTone = (pointsToWin: number) => {
  if (pointsToWin >= 40) return 'bg-red-500/20 text-red-300 border-red-400/40';
  if (pointsToWin >= 30) return 'bg-orange-500/20 text-orange-300 border-orange-400/40';
  return 'bg-green-500/20 text-green-300 border-green-400/40';
};

const arraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((item, index) => item === right[index]);

const getMasterMatchStatusLabel = (match: SummerRankingMasterMatch) => {
  if (match.status === 'completed') return 'Completata';
  if (match.status === 'scheduled') return 'Prenotata';
  return match.player1Id && match.player2Id ? 'Da organizzare' : 'In attesa qualificati';
};

const getMasterMatchStatusTone = (match: SummerRankingMasterMatch) => {
  if (match.status === 'completed') return 'bg-green-600 text-white';
  if (match.status === 'scheduled') return 'bg-accent text-white';
  return match.player1Id && match.player2Id ? 'bg-yellow-500/20 text-yellow-200' : 'bg-tertiary text-text-primary';
};

const getOperationalMatchStatus = (match: SummerRankingMasterMatch, slot: TimeSlot) => ({
  ...match,
  status: 'scheduled' as const,
  scheduledTime: slot.start,
  location: slot.location,
  field: slot.field,
  slotId: slot.id,
});

const rebuildMasterState = (
  bracket: PlayoffBracket,
  previousMatches: SummerRankingMasterMatch[],
  generatedQualifiedPlayerIds: string[],
  manualQualifiedPlayerIds?: string[],
  generatedAt?: string,
) => {
  const nextBracket = recomputeSummerRankingMasterBracket(bracket);
  return {
    manualQualifiedPlayerIds,
    generatedQualifiedPlayerIds,
    bracket: nextBracket,
    matches: syncSummerRankingMasterMatches(nextBracket, previousMatches),
    generatedAt: generatedAt ?? new Date().toISOString(),
  };
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
  title,
  description,
  playersAdminLabel,
}) => {
  const [activeTab, setActiveTab] = useState<RankingTab>('ranking');
  const [slotForm, setSlotForm] = useState({ start: '', location: '', field: '' });
  const [bookingForm, setBookingForm] = useState({ slotId: '', opponentId: '', player1Id: '', player2Id: '' });
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [scoreForm, setScoreForm] = useState({ score1: '', score2: '' });
  const [rulesConfigForm, setRulesConfigForm] = useState<SummerRankingRulesConfig>(() => normalizeRulesConfig(rankingData.rulesConfig));
  const [rulesSettingsError, setRulesSettingsError] = useState<string | null>(null);
  const [rulesSettingsSuccess, setRulesSettingsSuccess] = useState<string | null>(null);
  const [isSavingRulesSettings, setIsSavingRulesSettings] = useState(false);
  const [startPointsDrafts, setStartPointsDrafts] = useState<Record<string, string>>({});
  const [busyPlayerId, setBusyPlayerId] = useState<string | null>(null);
  const [rankingSearchInput, setRankingSearchInput] = useState('');
  const [rankingSearch, setRankingSearch] = useState('');
  const [rankingRangeMin, setRankingRangeMin] = useState(0);
  const [rankingRangeMax, setRankingRangeMax] = useState<number | null>(null);
  const [filterAvailDays, setFilterAvailDays] = useState<SummerAvailabilityDay[]>([]);
  const [filterAvailPeriods, setFilterAvailPeriods] = useState<SummerAvailabilityPeriod[]>([]);
  const [availabilityForm, setAvailabilityForm] = useState<AvailabilityFormState>(() =>
    normalizeAvailability(loggedInPlayerId ? rankingData.availabilities?.[loggedInPlayerId] : undefined)
  );
  const [masterQualifiedDraft, setMasterQualifiedDraft] = useState<string[]>([]);
  const [masterBookingSlotIdByMatch, setMasterBookingSlotIdByMatch] = useState<Record<string, string>>({});
  const [editingMasterMatchId, setEditingMasterMatchId] = useState<string | null>(null);
  const [masterScoreForm, setMasterScoreForm] = useState<MasterScoreFormState>({ matchId: null, score1: '', score2: '' });

  useEffect(() => {
    setRulesConfigForm(normalizeRulesConfig(rankingData.rulesConfig));
  }, [rankingData.rulesConfig]);

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
  const effectiveConfig = useMemo(
    () => normalizeRulesConfig(rankingData.rulesConfig),
    [rankingData.rulesConfig],
  );
  const ranking = useMemo(
    () => calculateSummerRanking(confirmedPlayers, rankingData.matches, effectiveConfig),
    [confirmedPlayers, rankingData.matches, effectiveConfig],
  );
  const autoQualifiedPlayerIds = useMemo(
    () => getSummerRankingAutoQualifiedPlayerIds(ranking, effectiveConfig),
    [ranking, effectiveConfig],
  );
  const currentMasterQualifiedPlayerIds = useMemo(
    () => getSummerRankingMasterQualifiedPlayerIds(ranking, rankingData.master, effectiveConfig),
    [ranking, rankingData.master, effectiveConfig],
  );
  const playerMap = useMemo(
    () => new Map(players.map(player => [player.id, player])),
    [players],
  );
  const masterBracket = rankingData.master?.bracket;
  const masterMatches = useMemo(
    () => {
      if (Array.isArray(rankingData.master?.matches) && rankingData.master.matches.length > 0) {
        return rankingData.master.matches;
      }
      return masterBracket ? syncSummerRankingMasterMatches(masterBracket) : [];
    },
    [rankingData.master?.matches, masterBracket],
  );
  const bookedSlotIds = useMemo(
    () => new Set(
      [...rankingData.matches, ...masterMatches]
        .filter(match => match.slotId && match.status !== 'pending')
        .map(match => String(match.slotId))
    ),
    [rankingData.matches, masterMatches],
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
    () => currentPlayer ? getEligibleOpponents(confirmedPlayers, rankingData.matches, currentPlayer.id, effectiveConfig) : [],
    [confirmedPlayers, rankingData.matches, currentPlayer, effectiveConfig],
  );

  const canBookAsParticipant = !!currentPlayer;
  const rankingById = useMemo(
    () => new Map(ranking.map(entry => [entry.player.id, entry])),
    [ranking],
  );
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

  useEffect(() => {
    setMasterQualifiedDraft(currentMasterQualifiedPlayerIds);
  }, [currentMasterQualifiedPlayerIds]);

  useEffect(() => {
    setMasterBookingSlotIdByMatch(previous => {
      const validMatchIds = new Set(masterMatches.map(match => match.id));
      const nextState: Record<string, string> = {};
      for (const matchId of Object.keys(previous)) {
        if (validMatchIds.has(matchId)) {
          nextState[matchId] = previous[matchId];
        }
      }
      return nextState;
    });
  }, [masterMatches]);

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
    if (getHeadToHeadCount(rankingData.matches, participantIds[0], participantIds[1]) >= effectiveConfig.headToHeadLimit) return;

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

  const persistMasterQualifiedPlayers = async (qualifiedPlayerIds: string[]) => {
    const normalizedQualifiedPlayerIds = qualifiedPlayerIds.filter(Boolean);
    if (normalizedQualifiedPlayerIds.length !== effectiveConfig.masterSize) return;

    const manualQualifiedPlayerIds = arraysEqual(normalizedQualifiedPlayerIds, autoQualifiedPlayerIds)
      ? undefined
      : normalizedQualifiedPlayerIds;

    await onSaveRankingData({
      ...rankingData,
      master: {
        ...rankingData.master,
        manualQualifiedPlayerIds,
      },
    });
  };

  const handleGenerateMaster = async () => {
    if (!isOrganizer || masterQualifiedDraft.length !== effectiveConfig.masterSize) return;

    const manualQualifiedPlayerIds = arraysEqual(masterQualifiedDraft, autoQualifiedPlayerIds)
      ? undefined
      : masterQualifiedDraft;
    const nextBracket = createSummerRankingMasterBracket(masterQualifiedDraft);

    await onSaveRankingData({
      ...rankingData,
      master: {
        manualQualifiedPlayerIds,
        generatedQualifiedPlayerIds: masterQualifiedDraft,
        bracket: nextBracket,
        matches: syncSummerRankingMasterMatches(nextBracket, rankingData.master?.matches ?? []),
        generatedAt: new Date().toISOString(),
      },
    });
  };

  const canManageMasterMatch = (match: SummerRankingMasterMatch) =>
    isOrganizer || loggedInPlayerId === match.player1Id || loggedInPlayerId === match.player2Id;

  const handleScheduleMasterMatch = async (match: SummerRankingMasterMatch) => {
    const slotId = masterBookingSlotIdByMatch[match.id];
    const slot = availableSlots.find(item => item.id === slotId);
    if (!slot || !canManageMasterMatch(match) || !rankingData.master?.matches) return;

    await onSaveRankingData({
      ...rankingData,
      master: {
        ...rankingData.master,
        matches: rankingData.master.matches.map(item =>
          item.id === match.id ? getOperationalMatchStatus(item, slot) : item
        ),
      },
    });

    setMasterBookingSlotIdByMatch(previous => ({ ...previous, [match.id]: '' }));
  };

  const openEditMasterResult = (match: SummerRankingMasterMatch) => {
    setEditingMasterMatchId(match.id);
    setMasterScoreForm({
      matchId: match.id,
      score1: match.score1 !== null ? String(match.score1) : '',
      score2: match.score2 !== null ? String(match.score2) : '',
    });
  };

  const handleSaveMasterResult = async (match: SummerRankingMasterMatch) => {
    if (!rankingData.master?.bracket || !rankingData.master.matches || !canManageMasterMatch(match)) return;

    const score1 = Number(masterScoreForm.score1);
    const score2 = Number(masterScoreForm.score2);
    if (
      Number.isNaN(score1) ||
      Number.isNaN(score2) ||
      score1 < 0 ||
      score2 < 0 ||
      score1 === score2
    ) {
      return;
    }

    const nextBracket: PlayoffBracket = JSON.parse(JSON.stringify(rankingData.master.bracket));
    const bracketMatch = nextBracket.matches.find(item => item.id === match.id);
    if (!bracketMatch) return;

    bracketMatch.score1 = score1;
    bracketMatch.score2 = score2;

    const nextMaster = rebuildMasterState(
      nextBracket,
      rankingData.master.matches.map(item =>
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
      rankingData.master.generatedQualifiedPlayerIds ?? [],
      rankingData.master.manualQualifiedPlayerIds,
      rankingData.master.generatedAt,
    );

    await onSaveRankingData({
      ...rankingData,
      master: nextMaster,
    });

    setEditingMasterMatchId(null);
    setMasterScoreForm({ matchId: null, score1: '', score2: '' });
  };

  const handleResetMasterResult = async (match: SummerRankingMasterMatch) => {
    if (!rankingData.master?.bracket || !rankingData.master.matches || !canManageMasterMatch(match)) return;

    const nextBracket: PlayoffBracket = JSON.parse(JSON.stringify(rankingData.master.bracket));
    const bracketMatch = nextBracket.matches.find(item => item.id === match.id);
    if (!bracketMatch) return;

    bracketMatch.score1 = null;
    bracketMatch.score2 = null;
    bracketMatch.winnerId = null;

    const nextMaster = rebuildMasterState(
      nextBracket,
      rankingData.master.matches.map(item =>
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
      rankingData.master.generatedQualifiedPlayerIds ?? [],
      rankingData.master.manualQualifiedPlayerIds,
      rankingData.master.generatedAt,
    );

    await onSaveRankingData({
      ...rankingData,
      master: nextMaster,
    });

    if (editingMasterMatchId === match.id) {
      setEditingMasterMatchId(null);
      setMasterScoreForm({ matchId: null, score1: '', score2: '' });
    }
  };

  const hasRulesSettingsChanges = useMemo(
    () => JSON.stringify(rulesConfigForm) !== JSON.stringify(effectiveConfig),
    [rulesConfigForm, effectiveConfig],
  );

  const updateRulesConfig = (key: keyof SummerRankingRulesConfig, rawValue: string) => {
    const parsed = Number(rawValue);
    if (!Number.isNaN(parsed)) {
      setRulesConfigForm(prev => ({ ...prev, [key]: parsed }));
    }
    setRulesSettingsError(null);
    setRulesSettingsSuccess(null);
  };

  const resetRulesSettings = () => {
    setRulesConfigForm(normalizeRulesConfig(rankingData.rulesConfig));
    setRulesSettingsError(null);
    setRulesSettingsSuccess(null);
  };

  const handleSaveRulesSettings = async () => {
    setIsSavingRulesSettings(true);
    setRulesSettingsError(null);
    setRulesSettingsSuccess(null);
    try {
      await onSaveRankingData({
        ...rankingData,
        rulesConfig: rulesConfigForm,
        rules: generateRulesText(rulesConfigForm),
      });
      setRulesSettingsSuccess('Impostazioni salvate con successo. La classifica e il regolamento sono stati aggiornati.');
    } catch (error) {
      console.error('Errore salvataggio impostazioni', error);
      setRulesSettingsError('Salvataggio non riuscito. Riprova.');
    } finally {
      setIsSavingRulesSettings(false);
    }
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
    if (availabilityForm.status === null) return;
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
      master: removePlayerFromSummerRankingMaster(rankingData.master, playerId),
    });
  };

  const masterQualifiedIdSet = useMemo(
    () => new Set(currentMasterQualifiedPlayerIds),
    [currentMasterQualifiedPlayerIds],
  );
  const topEightQualified = ranking.filter(entry => masterQualifiedIdSet.has(entry.player.id));
  const maxPossiblePoints = useMemo(
    () => (ranking.length > 0 ? Math.max(...ranking.map(entry => entry.points)) : 0),
    [ranking],
  );
  const effectiveRangeMax = rankingRangeMax ?? maxPossiblePoints;
  const normalizedRankingSearch = rankingSearch.trim().toLowerCase();
  const hasActivePointsFilter = rankingRangeMin > 0 || effectiveRangeMax < maxPossiblePoints;
  const hasActiveAvailFilter = filterAvailDays.length > 0 || filterAvailPeriods.length > 0;
  const hasActiveRankingFilters = normalizedRankingSearch.length > 0 || hasActivePointsFilter || hasActiveAvailFilter;
  const filteredRanking = useMemo(
    () =>
      ranking.filter(entry => {
        if (
          normalizedRankingSearch.length > 0 &&
          !entry.player.name.toLowerCase().includes(normalizedRankingSearch) &&
          !entry.player.id.toLowerCase().includes(normalizedRankingSearch)
        ) return false;
        if (entry.points < rankingRangeMin || entry.points > effectiveRangeMax) return false;
        if (filterAvailDays.length > 0 || filterAvailPeriods.length > 0) {
          const avail = rankingData.availabilities?.[entry.player.id];
          if (!avail || avail.status !== 'available') return false;
          if (filterAvailDays.length > 0 && !filterAvailDays.some(day => avail.days.includes(day))) return false;
          if (filterAvailPeriods.length > 0 && !filterAvailPeriods.some(period => avail.periods.includes(period))) return false;
        }
        return true;
      }),
    [ranking, normalizedRankingSearch, rankingRangeMin, effectiveRangeMax, filterAvailDays, filterAvailPeriods, rankingData.availabilities],
  );
  const currentPlayerRankingEntry = useMemo(
    () => loggedInPlayerId ? ranking.find(entry => entry.player.id === loggedInPlayerId) : undefined,
    [ranking, loggedInPlayerId],
  );
  const showChallengePointsColumn = !!currentPlayerRankingEntry;
  const currentPlayerVisibleInFilteredRanking = useMemo(
    () => !!(loggedInPlayerId && filteredRanking.some(entry => entry.player.id === loggedInPlayerId)),
    [filteredRanking, loggedInPlayerId],
  );
  const masterCandidatePlayers = useMemo(
    () => ranking.map(entry => entry.player),
    [ranking],
  );
  const normalizedMasterQualifiedDraft = useMemo(
    () => masterQualifiedDraft.filter(Boolean),
    [masterQualifiedDraft],
  );
  const hasValidMasterDraft = useMemo(
    () =>
      normalizedMasterQualifiedDraft.length === effectiveConfig.masterSize &&
      new Set(normalizedMasterQualifiedDraft).size === effectiveConfig.masterSize,
    [normalizedMasterQualifiedDraft, effectiveConfig.masterSize],
  );
  const generatedMasterQualifiedPlayerIds = rankingData.master?.generatedQualifiedPlayerIds ?? [];
  const masterNeedsRegeneration = !!masterBracket?.isGenerated && !arraysEqual(currentMasterQualifiedPlayerIds, generatedMasterQualifiedPlayerIds);
  const visibleMasterMatches = useMemo(
    () =>
      masterMatches
        .slice()
        .sort((a, b) => a.round - b.round || a.label.localeCompare(b.label)),
    [masterMatches],
  );
  const currentPlayerMasterMatches = useMemo(
    () =>
      masterMatches.filter(match => loggedInPlayerId === match.player1Id || loggedInPlayerId === match.player2Id),
    [masterMatches, loggedInPlayerId],
  );

  const resetRankingFilters = () => {
    setRankingSearchInput('');
    setRankingSearch('');
    setRankingRangeMin(0);
    setRankingRangeMax(null);
    setFilterAvailDays([]);
    setFilterAvailPeriods([]);
  };

  return (
    <div className="space-y-6">
      <div className="bg-secondary rounded-xl shadow-lg p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-accent">{title ?? SUMMER_RANKING_NAME}</h2>
            <p className="text-text-secondary mt-1">
              {description ?? 'Classifica, partite, regolamento e disponibilità per questo evento.'}
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
            ['master', 'Master finale'],
            ['availability', 'Disponibilità'],
            ['rules', 'Regolamento'],
            ...(isOrganizer ? [['settings', 'Impostazioni'] as [RankingTab, string]] : []),
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
              <div className="text-xl font-bold mt-2">{topEightQualified.length}/{effectiveConfig.masterSize} qualificati</div>
              <div className="text-text-secondary mt-1">Servono almeno {effectiveConfig.masterMinMatches} partite giocate.</div>
            </div>
            <div className="bg-secondary rounded-xl p-5 shadow-lg">
              <div className="text-sm text-text-secondary">Partite in programma</div>
              <div className="text-xl font-bold mt-2">{rankingData.matches.filter(match => match.status === 'scheduled').length}</div>
              <div className="text-text-secondary mt-1">Prenotazioni attive nel calendario ranking.</div>
            </div>
          </div>

          <div className="bg-secondary rounded-xl shadow-lg p-5 space-y-4">
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-bold text-accent">Ricerca e filtri ranking</h3>
              <p className="text-sm text-text-secondary">
                Cerca giocatori per nome, filtra per punti e disponibilità.
              </p>
            </div>

            {/* Row 1: Name search with OK button */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label htmlFor="ranking-search" className="block text-xs font-semibold text-text-secondary mb-1">
                  Cerca giocatore
                </label>
                <input
                  id="ranking-search"
                  type="search"
                  value={rankingSearchInput}
                  onChange={event => setRankingSearchInput(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') setRankingSearch(rankingSearchInput); }}
                  placeholder="Nome o ID giocatore"
                  className="w-full bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary"
                />
              </div>
              <button
                onClick={() => setRankingSearch(rankingSearchInput)}
                className="px-4 py-2 rounded-lg bg-accent text-primary font-semibold text-sm whitespace-nowrap"
              >
                OK
              </button>
            </div>

            {/* Row 2: Points dual range slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-text-secondary">Punti classifica</label>
                <span className="text-xs font-semibold text-accent">
                  {rankingRangeMin} – {effectiveRangeMax}
                  {maxPossiblePoints > 0 && (
                    <span className="text-text-secondary font-normal ml-1">/ {maxPossiblePoints}</span>
                  )}
                </span>
              </div>
              <div className="relative h-8 flex items-center px-1">
                {/* Base track */}
                <div className="absolute left-1 right-1 h-1 bg-tertiary rounded" />
                {/* Active range highlight */}
                <div
                  className="absolute h-1 bg-accent rounded"
                  style={{
                    left: `calc(${maxPossiblePoints > 0 ? (rankingRangeMin / maxPossiblePoints) * 100 : 0}% + 4px)`,
                    right: `calc(${maxPossiblePoints > 0 ? ((maxPossiblePoints - effectiveRangeMax) / maxPossiblePoints) * 100 : 0}% + 4px)`,
                  }}
                />
                {/* Min thumb */}
                <input
                  type="range"
                  className="dual-range"
                  min={0}
                  max={maxPossiblePoints}
                  value={rankingRangeMin}
                  onChange={event => setRankingRangeMin(Math.min(Number(event.target.value), effectiveRangeMax))}
                />
                {/* Max thumb */}
                <input
                  type="range"
                  className="dual-range"
                  min={0}
                  max={maxPossiblePoints}
                  value={effectiveRangeMax}
                  onChange={event => setRankingRangeMax(Math.max(Number(event.target.value), rankingRangeMin))}
                />
              </div>
            </div>

            {/* Row 3: Day filter */}
            <div>
              <div className="text-xs font-semibold text-text-secondary mb-2">Giorni disponibili</div>
              <div className="flex flex-wrap gap-2">
                {AVAILABILITY_DAYS.map(day => (
                  <button
                    key={day.value}
                    onClick={() => setFilterAvailDays(prev => toggleArrayValue(prev, day.value))}
                    className={`px-3 py-1 rounded-lg border text-xs font-semibold ${
                      filterAvailDays.includes(day.value)
                        ? 'bg-highlight text-white border-highlight'
                        : 'bg-primary border-tertiary text-text-primary'
                    }`}
                  >
                    {day.shortLabel}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 4: Period filter */}
            <div>
              <div className="text-xs font-semibold text-text-secondary mb-2">Fasce orarie</div>
              <div className="flex flex-wrap gap-2">
                {AVAILABILITY_PERIODS.map(period => (
                  <button
                    key={period.value}
                    onClick={() => setFilterAvailPeriods(prev => toggleArrayValue(prev, period.value))}
                    className={`px-3 py-1 rounded-lg border text-xs font-semibold ${
                      filterAvailPeriods.includes(period.value)
                        ? 'bg-highlight text-white border-highlight'
                        : 'bg-primary border-tertiary text-text-primary'
                    }`}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-text-secondary">
                {filteredRanking.length} risultati su {ranking.length}
              </div>
              <button
                onClick={resetRankingFilters}
                disabled={!hasActiveRankingFilters}
                className="px-3 py-2 rounded bg-tertiary hover:bg-tertiary/90 disabled:opacity-50 disabled:cursor-not-allowed text-text-primary text-xs font-semibold"
              >
                Reset filtri
              </button>
            </div>
          </div>

          {currentPlayerRankingEntry && !currentPlayerVisibleInFilteredRanking && (
            <div className="bg-accent/15 border border-accent/50 rounded-xl p-4">
              <div className="text-xs font-semibold text-accent uppercase tracking-wide">La tua posizione reale</div>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                <span className="font-bold text-lg text-accent">#{currentPlayerRankingEntry.rank}</span>
                <span className="font-semibold">{currentPlayerRankingEntry.player.name}</span>
                <span className="text-text-secondary">{currentPlayerRankingEntry.points} pt</span>
              </div>
              <p className="text-xs text-text-secondary mt-1">
                Non è visibile con i filtri attivi, ma questa è la tua posizione in classifica completa.
              </p>
            </div>
          )}

          <div className="bg-secondary rounded-xl shadow-lg p-6 overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead>
                <tr className="text-left border-b border-tertiary text-text-secondary">
                  <th className="py-3 pr-3">Rank</th>
                  <th className="py-3 pr-3">Giocatore</th>
                  <th className="py-3 pr-3">Punti</th>
                  {showChallengePointsColumn && <th className="py-3 pr-3">Punti sfida</th>}
                  <th className="py-3 pr-3">Serie</th>
                  <th className="py-3 pr-3">Partite</th>
                  <th className="py-3 pr-3">Bonus/Malus</th>
                  <th className="py-3 pr-3">Slot</th>
                  <th className="py-3 pr-3">Disponibilità</th>
                  <th className="py-3 pr-3">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {filteredRanking.map(entry => {
                  const availabilitySummary = getAvailabilitySummary(rankingData.availabilities?.[entry.player.id]);
                  const isCurrentPlayerRow = entry.player.id === loggedInPlayerId;
                  const pointsToWin = currentPlayerRankingEntry
                    ? getSummerRankingWinPoints(currentPlayerRankingEntry.points, entry.points, effectiveConfig)
                    : 0;

                  return (
                  <tr key={entry.player.id} className={`border-b border-tertiary/40 last:border-b-0 align-top ${isCurrentPlayerRow ? 'bg-accent/10 ring-1 ring-inset ring-accent/60' : ''}`}>
                    <td className="py-4 pr-3 font-bold text-accent">{entry.rank}</td>
                    <td className="py-4 pr-3">
                      <div className="font-semibold flex items-center gap-2">
                        {entry.player.name}
                        {isCurrentPlayerRow && (
                          <span className="px-2 py-0.5 rounded bg-accent text-white text-xs font-semibold">
                            Tu
                          </span>
                        )}
                        {masterQualifiedIdSet.has(entry.player.id) && (
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
                    {showChallengePointsColumn && (
                      <td className="py-4 pr-3">
                        {isCurrentPlayerRow ? (
                          <span className="inline-flex items-center rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">
                            Tu
                          </span>
                        ) : (
                          <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-bold ${getChallengeBadgeTone(pointsToWin)}`}>
                            +{pointsToWin} pt
                          </span>
                        )}
                      </td>
                    )}
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
                      <div className={`font-semibold ${
                        availabilitySummary.status === 'Disponibile' ? 'text-green-400' :
                        availabilitySummary.status === 'Non disponibile' ? 'text-red-400' :
                        'text-text-secondary'
                      }`}>
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
                {filteredRanking.length === 0 && (
                  <tr>
                    <td colSpan={showChallengePointsColumn ? 10 : 9} className="py-8 text-center text-text-secondary">
                      {hasActiveRankingFilters
                        ? 'Nessun giocatore corrisponde ai filtri selezionati.'
                        : 'Nessun giocatore confermato nel Summer Ranking Next.'}
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
                  {playersAdminLabel ?? 'Apri gestione giocatori evento'}
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

      {activeTab === 'master' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-secondary rounded-xl p-5 shadow-lg">
              <div className="text-sm text-text-secondary">Qualificati automatici</div>
              <div className="text-xl font-bold mt-2">{autoQualifiedPlayerIds.length}/{effectiveConfig.masterSize}</div>
              <div className="text-text-secondary mt-1">Top {effectiveConfig.masterSize} con almeno {effectiveConfig.masterMinMatches} partite.</div>
            </div>
            <div className="bg-secondary rounded-xl p-5 shadow-lg">
              <div className="text-sm text-text-secondary">Selezione attuale</div>
              <div className="text-xl font-bold mt-2">{currentMasterQualifiedPlayerIds.length}/{effectiveConfig.masterSize}</div>
              <div className="text-text-secondary mt-1">
                {rankingData.master?.manualQualifiedPlayerIds?.length === effectiveConfig.masterSize
                  ? 'Override manuale salvato.'
                  : 'Basata sui qualificati automatici.'}
              </div>
            </div>
            <div className="bg-secondary rounded-xl p-5 shadow-lg">
              <div className="text-sm text-text-secondary">Le tue partite Master</div>
              <div className="text-xl font-bold mt-2">{currentPlayerMasterMatches.length}</div>
              <div className="text-text-secondary mt-1">
                {currentPlayer ? 'Puoi prenotare e pubblicare risultati solo delle tue partite.' : 'Accedi come giocatore per gestire le tue partite.'}
              </div>
            </div>
          </div>

          {isOrganizer && (
            <div className="bg-secondary rounded-xl shadow-lg p-6 space-y-5">
              <div>
                <h3 className="text-xl font-bold text-accent">Configurazione Master finale</h3>
                <p className="text-sm text-text-secondary mt-1">
                  I primi {effectiveConfig.masterSize} vengono proposti automaticamente, ma puoi sostituirli manualmente in caso di assenza o infortunio.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: effectiveConfig.masterSize }).map((_, index) => {
                  const selectedId = masterQualifiedDraft[index] ?? '';
                  return (
                    <div key={index} className="bg-primary rounded-lg border border-tertiary p-4">
                      <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Testa di serie {index + 1}</div>
                      <select
                        value={selectedId}
                        onChange={event => {
                          const nextPlayerId = event.target.value;
                          setMasterQualifiedDraft(previous => {
                            const nextDraft = [...previous];
                            const duplicateIndex = nextDraft.findIndex((playerId, playerIndex) => playerId === nextPlayerId && playerIndex !== index);
                            if (duplicateIndex !== -1) {
                              nextDraft[duplicateIndex] = '';
                            }
                            nextDraft[index] = nextPlayerId;
                            return nextDraft;
                          });
                        }}
                        className="mt-2 w-full bg-secondary border border-tertiary rounded-lg p-2"
                      >
                        <option value="">Seleziona giocatore</option>
                        {masterCandidatePlayers.map(player => {
                          const entry = rankingById.get(player.id);
                          return (
                            <option key={player.id} value={player.id}>
                              #{entry?.rank ?? '-'} • {player.name} {entry ? `• ${entry.points} pt` : ''}
                            </option>
                          );
                        })}
                      </select>
                      <div className="text-xs text-text-secondary mt-2">
                        Automatico: {playerMap.get(autoQualifiedPlayerIds[index] ?? '')?.name ?? '—'}
                      </div>
                    </div>
                  );
                })}
              </div>

              {!hasValidMasterDraft && (
                <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-200">
                  Per salvare o generare il Master servono {effectiveConfig.masterSize} giocatori univoci.
                </div>
              )}

              {masterNeedsRegeneration && (
                <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 p-4 text-sm text-orange-200">
                  I qualificati salvati non coincidono più con il tabellone generato: rigenera il Master per evitare dati incoerenti.
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => persistMasterQualifiedPlayers(masterQualifiedDraft)}
                  disabled={!hasValidMasterDraft}
                  className="px-4 py-2 rounded bg-highlight text-white font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Salva qualificati
                </button>
                <button
                  onClick={() => setMasterQualifiedDraft(autoQualifiedPlayerIds)}
                  className="px-4 py-2 rounded bg-tertiary text-text-primary font-semibold"
                >
                  Ripristina top {effectiveConfig.masterSize}
                </button>
                <button
                  onClick={handleGenerateMaster}
                  disabled={!hasValidMasterDraft}
                  className="px-4 py-2 rounded bg-accent text-white font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {masterBracket?.isGenerated ? 'Rigenera Master' : 'Genera Master'}
                </button>
              </div>
            </div>
          )}

          {!masterBracket?.isGenerated && (
            <div className="bg-secondary rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-accent">Master non ancora generato</h3>
              <p className="text-text-secondary mt-2">
                Una volta confermati i qualificati, genera il tabellone per ottenere quarti, semifinali, finale e finale 3°/4° posto.
              </p>
            </div>
          )}

          {masterBracket?.isGenerated && (
            <>
              <div className="bg-secondary rounded-xl shadow-lg p-6">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-accent">Tabellone Master finale</h3>
                    <p className="text-sm text-text-secondary mt-1">
                      Accoppiamenti iniziali 1vs8, 2vs7, 3vs6, 4vs5 con avanzamento automatico del vincitore e finalina 3°/4° posto.
                    </p>
                  </div>
                  {rankingData.master?.generatedAt && (
                    <div className="text-xs text-text-secondary">
                      Generato il {formatDateTime(rankingData.master.generatedAt)}
                    </div>
                  )}
                </div>

                <div className="mt-6 grid grid-cols-1 xl:grid-cols-4 gap-4">
                  {[
                    ['quarterfinal', 'Quarti di finale'],
                    ['semifinal', 'Semifinali'],
                    ['final', 'Finale'],
                    ['thirdPlace', 'Finale 3°/4°'],
                  ].map(([stage, label]) => (
                    <div key={stage} className="bg-primary rounded-xl border border-tertiary p-4 space-y-3">
                      <h4 className="font-bold text-accent">{label}</h4>
                      {visibleMasterMatches
                        .filter(match => match.stage === stage)
                        .map(match => (
                          <div key={match.id} className="rounded-lg border border-tertiary bg-secondary/60 p-3">
                            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{match.label}</div>
                            <div className="mt-2 space-y-2 text-sm">
                              <div className="flex items-center justify-between gap-3">
                                <span>{playerMap.get(match.player1Id ?? '')?.name ?? 'Da definire'}</span>
                                <span className="font-bold">{match.score1 ?? '—'}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span>{playerMap.get(match.player2Id ?? '')?.name ?? 'Da definire'}</span>
                                <span className="font-bold">{match.score2 ?? '—'}</span>
                              </div>
                            </div>
                            <div className="mt-3">
                              <span className={`inline-flex rounded px-2 py-1 text-[11px] font-semibold ${getMasterMatchStatusTone(match)}`}>
                                {getMasterMatchStatusLabel(match)}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-secondary rounded-xl shadow-lg p-6 overflow-x-auto">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-accent">Partite del Master</h3>
                    <p className="text-sm text-text-secondary mt-1">
                      L&apos;organizzatore può sempre intervenire; i giocatori possono prenotare e pubblicare risultati solo nelle partite in cui sono coinvolti.
                    </p>
                  </div>
                  <div className="text-xs text-text-secondary">
                    Slot condivisi con il ranking principale
                  </div>
                </div>

                <table className="w-full min-w-[1180px] text-sm">
                  <thead>
                    <tr className="text-left border-b border-tertiary text-text-secondary">
                      <th className="py-3 pr-3">Match</th>
                      <th className="py-3 pr-3">Stato</th>
                      <th className="py-3 pr-3">Slot / Campo</th>
                      <th className="py-3 pr-3">Prenotazione</th>
                      <th className="py-3 pr-3">Risultato</th>
                      <th className="py-3 pr-3">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMasterMatches.map(match => {
                      const player1 = playerMap.get(match.player1Id ?? '');
                      const player2 = playerMap.get(match.player2Id ?? '');
                      const canManage = canManageMasterMatch(match);
                      const opponent = loggedInPlayerId === match.player1Id ? player2 : loggedInPlayerId === match.player2Id ? player1 : null;

                      return (
                        <tr key={match.id} className="border-b border-tertiary/40 last:border-b-0 align-top">
                          <td className="py-4 pr-3">
                            <div className="font-semibold">{match.label}</div>
                            <div className="text-xs text-text-secondary mt-1">
                              {player1?.name ?? 'Da definire'} vs {player2?.name ?? 'Da definire'}
                            </div>
                          </td>
                          <td className="py-4 pr-3">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${getMasterMatchStatusTone(match)}`}>
                              {getMasterMatchStatusLabel(match)}
                            </span>
                          </td>
                          <td className="py-4 pr-3 text-xs text-text-secondary">
                            {match.slotId ? (
                              <>
                                <div>{formatDateTime(match.scheduledTime)}</div>
                                <div>{match.location} {match.field ? `• ${match.field}` : ''}</div>
                              </>
                            ) : (
                              'Nessuno slot assegnato'
                            )}
                          </td>
                          <td className="py-4 pr-3">
                            {canManage && match.player1Id && match.player2Id && match.status !== 'completed' ? (
                              <div className="flex items-center gap-2">
                                <select
                                  value={masterBookingSlotIdByMatch[match.id] ?? ''}
                                  onChange={event => setMasterBookingSlotIdByMatch(previous => ({ ...previous, [match.id]: event.target.value }))}
                                  className="min-w-[280px] bg-primary border border-tertiary rounded-lg p-2"
                                >
                                  <option value="">Seleziona slot</option>
                                  {availableSlots.map(slot => (
                                    <option key={slot.id} value={slot.id}>
                                      {formatDateTime(slot.start)} • {slot.location} {slot.field ? `• ${slot.field}` : ''}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => handleScheduleMasterMatch(match)}
                                  disabled={!masterBookingSlotIdByMatch[match.id]}
                                  className="px-3 py-2 rounded bg-highlight text-white text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  {match.slotId ? 'Aggiorna' : 'Prenota'}
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-text-secondary">
                                {match.player1Id && match.player2Id ? 'Disponibile solo ai giocatori coinvolti o all’organizzatore.' : 'Attendi il completamento del turno precedente.'}
                              </span>
                            )}
                          </td>
                          <td className="py-4 pr-3">
                            {editingMasterMatchId === match.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  value={masterScoreForm.score1}
                                  onChange={event => setMasterScoreForm(previous => ({ ...previous, score1: event.target.value }))}
                                  className="w-16 bg-primary border border-tertiary rounded px-2 py-1"
                                />
                                <span>-</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={masterScoreForm.score2}
                                  onChange={event => setMasterScoreForm(previous => ({ ...previous, score2: event.target.value }))}
                                  className="w-16 bg-primary border border-tertiary rounded px-2 py-1"
                                />
                                <button
                                  onClick={() => handleSaveMasterResult(match)}
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
                          <td className="py-4 pr-3">
                            <div className="flex flex-wrap gap-2">
                              {canManage && match.player1Id && match.player2Id && editingMasterMatchId !== match.id && (
                                <button
                                  onClick={() => openEditMasterResult(match)}
                                  className="px-3 py-1 rounded bg-tertiary hover:bg-tertiary/90 text-text-primary text-xs font-semibold"
                                >
                                  {match.status === 'completed' ? 'Modifica risultato' : 'Pubblica risultato'}
                                </button>
                              )}
                              {canManage && match.status === 'completed' && (
                                <button
                                  onClick={() => handleResetMasterResult(match)}
                                  className="px-3 py-1 rounded bg-primary border border-tertiary text-xs font-semibold"
                                >
                                  Ripristina
                                </button>
                              )}
                              {opponent && (
                                <button
                                  onClick={() => onPlayerContact(opponent)}
                                  className="px-3 py-1 rounded bg-primary border border-tertiary text-xs font-semibold"
                                >
                                  Contatta avversario
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
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
              {availabilityForm.status === null && (
                <p className="text-xs text-text-secondary mb-2">Nessuna disponibilità dichiarata. Scegli un'opzione per procedere.</p>
              )}
              <div className="flex flex-wrap gap-3">
                {([['available', 'Disponibile'], ['unavailable', 'Non disponibile']] as const).map(([status, label]) => (
                      <button
                        key={status}
                        onClick={() => setAvailabilityForm(prev => ({
                          ...prev,
                      status,
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
                  <div className="font-semibold text-text-primary">Riepilogo tabella</div>
                  {availabilityForm.status === null ? (
                    <div className="mt-1 text-text-secondary">Non dichiarata</div>
                  ) : (() => {
                    const summary = getAvailabilitySummary({
                      status: availabilityForm.status,
                      days: availabilityForm.days,
                      periods: availabilityForm.periods,
                    });
                    return (
                      <>
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
                    disabled={
                      availabilityForm.status === null ||
                      (availabilityForm.status === 'available' && (availabilityForm.days.length === 0 || availabilityForm.periods.length === 0))
                    }
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
          </div>
          <div className="bg-primary rounded-lg p-4 whitespace-pre-line border border-tertiary">
            {generateRulesText(effectiveConfig)}
          </div>
        </div>
      )}

      {activeTab === 'settings' && isOrganizer && (
        <div className="bg-secondary rounded-xl shadow-lg p-6 space-y-6">
          <div>
            <h3 className="text-xl font-bold text-accent">Impostazioni ranking</h3>
            <p className="text-sm text-text-secondary mt-1">
              Modifica i valori numerici delle regole. Premendo Salva la classifica si ricalcola e il Regolamento si aggiorna automaticamente.
            </p>
          </div>

          {/* Fasce differenza punti */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-accent uppercase tracking-wide">Fasce differenza punti</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Max punti fascia bassa (0 – N)</span>
                <input type="number" value={rulesConfigForm.diffBandLowMax} onChange={e => updateRulesConfig('diffBandLowMax', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Max punti fascia media (N+1 – M)</span>
                <input type="number" value={rulesConfigForm.diffBandMediumMax} onChange={e => updateRulesConfig('diffBandMediumMax', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
            </div>
            <p className="text-xs text-text-secondary">La fascia alta inizia da (fascia media + 1) in su.</p>
          </div>

          {/* Vittoria favorito */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-accent uppercase tracking-wide">Se vince il favorito</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Vincitore – fascia bassa</span>
                <input type="number" value={rulesConfigForm.favoriteWinLow} onChange={e => updateRulesConfig('favoriteWinLow', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Perdente – fascia bassa</span>
                <input type="number" value={rulesConfigForm.favoriteLossLow} onChange={e => updateRulesConfig('favoriteLossLow', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Vincitore – fascia media</span>
                <input type="number" value={rulesConfigForm.favoriteWinMedium} onChange={e => updateRulesConfig('favoriteWinMedium', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Perdente – fascia media</span>
                <input type="number" value={rulesConfigForm.favoriteLossMedium} onChange={e => updateRulesConfig('favoriteLossMedium', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Vincitore – fascia alta</span>
                <input type="number" value={rulesConfigForm.favoriteWinHigh} onChange={e => updateRulesConfig('favoriteWinHigh', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Perdente – fascia alta</span>
                <input type="number" value={rulesConfigForm.favoriteLossHigh} onChange={e => updateRulesConfig('favoriteLossHigh', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
            </div>
          </div>

          {/* Vittoria sfavorito */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-accent uppercase tracking-wide">Se vince lo sfavorito</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Vincitore – fascia bassa</span>
                <input type="number" value={rulesConfigForm.underdogWinLow} onChange={e => updateRulesConfig('underdogWinLow', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Perdente – fascia bassa</span>
                <input type="number" value={rulesConfigForm.underdogLossLow} onChange={e => updateRulesConfig('underdogLossLow', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Vincitore – fascia media</span>
                <input type="number" value={rulesConfigForm.underdogWinMedium} onChange={e => updateRulesConfig('underdogWinMedium', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Perdente – fascia media</span>
                <input type="number" value={rulesConfigForm.underdogLossMedium} onChange={e => updateRulesConfig('underdogLossMedium', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Vincitore – fascia alta</span>
                <input type="number" value={rulesConfigForm.underdogWinHigh} onChange={e => updateRulesConfig('underdogWinHigh', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Perdente – fascia alta</span>
                <input type="number" value={rulesConfigForm.underdogLossHigh} onChange={e => updateRulesConfig('underdogLossHigh', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
            </div>
          </div>

          {/* Bonus partecipazione */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-accent uppercase tracking-wide">Bonus partecipazione</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Bonus base per partita (+)</span>
                <input type="number" value={rulesConfigForm.participationBase} onChange={e => updateRulesConfig('participationBase', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Bonus settimanale per partita (+)</span>
                <input type="number" value={rulesConfigForm.participationWeeklyBonus} onChange={e => updateRulesConfig('participationWeeklyBonus', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Min. partite/settimana per bonus</span>
                <input type="number" min="1" value={rulesConfigForm.participationWeeklyMinMatches} onChange={e => updateRulesConfig('participationWeeklyMinMatches', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
            </div>
          </div>

          {/* Bonus differenza game */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-accent uppercase tracking-wide">Bonus differenza game (vincitore)</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Scarto 2 game (+)</span>
                <input type="number" min="0" value={rulesConfigForm.gameDiffBonus2} onChange={e => updateRulesConfig('gameDiffBonus2', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Scarto 3 game (+)</span>
                <input type="number" min="0" value={rulesConfigForm.gameDiffBonus3} onChange={e => updateRulesConfig('gameDiffBonus3', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Scarto 4+ game (+)</span>
                <input type="number" min="0" value={rulesConfigForm.gameDiffBonus4plus} onChange={e => updateRulesConfig('gameDiffBonus4plus', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
            </div>
          </div>

          {/* Malus inattività */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-accent uppercase tracking-wide">Malus inattività</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Punti malus per periodo (-)</span>
                <input type="number" min="0" value={rulesConfigForm.inactivityMalusPoints} onChange={e => updateRulesConfig('inactivityMalusPoints', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Giorni senza partite per periodo</span>
                <input type="number" min="1" value={rulesConfigForm.inactivityMalusDays} onChange={e => updateRulesConfig('inactivityMalusDays', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
            </div>
          </div>

          {/* Master finale */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-accent uppercase tracking-wide">Master finale</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Top N qualificati</span>
                <input type="number" min="2" value={rulesConfigForm.masterSize} onChange={e => updateRulesConfig('masterSize', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Min. partite giocate per qualificarsi</span>
                <input type="number" min="1" value={rulesConfigForm.masterMinMatches} onChange={e => updateRulesConfig('masterMinMatches', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
            </div>
          </div>

          {/* Limite scontri */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-accent uppercase tracking-wide">Limite scontri diretti</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Max incontri vs stesso avversario</span>
                <input type="number" min="1" value={rulesConfigForm.headToHeadLimit} onChange={e => updateRulesConfig('headToHeadLimit', e.target.value)} className="bg-primary border border-tertiary rounded-lg px-3 py-2 text-text-primary" />
              </label>
            </div>
          </div>

          {rulesSettingsError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {rulesSettingsError}
            </div>
          )}
          {rulesSettingsSuccess && (
            <div className="rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-200">
              {rulesSettingsSuccess}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSaveRulesSettings}
              disabled={isSavingRulesSettings || !hasRulesSettingsChanges}
              className="px-4 py-2 rounded bg-highlight text-white font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSavingRulesSettings ? 'Salvataggio...' : 'Salva'}
            </button>
            <button
              onClick={resetRulesSettings}
              disabled={isSavingRulesSettings || !hasRulesSettingsChanges}
              className="px-4 py-2 rounded bg-tertiary text-text-primary font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Ripristina
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default SummerRankingView;
