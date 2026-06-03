import { type Match, type Player } from '../types';

export const SUMMER_RANKING_NAME = 'Summer Ranking Next';

export const DEFAULT_SUMMER_RANKING_RULES = [
  'Summer Ranking Next',
  '',
  '• Ranking globale unico con tutti i giocatori iscritti.',
  '• Il punteggio iniziale viene impostato manualmente dall’amministratore.',
  '• Fasce differenza punti: 0-100 bassa, 101-200 media, 201+ alta.',
  '• Se vince il favorito: +20/-20, +10/-30, +5/-40.',
  '• Se vince lo sfavorito: +20/-20, +30/-10, +40/-5.',
  '• Pareggio: ogni giocatore riceve il 50% dei punti che prenderebbe vincendo.',
  '• Bonus partecipazione: +5 a partita, oppure +10 a partita se il giocatore disputa almeno 2 match nella stessa settimana.',
  '• Bonus differenza game al vincitore: +1 con 2 game di scarto, +2 con 3, +3 con 4 o più.',
  '• Malus inattività: -5 punti ogni 10 giorni consecutivi senza partite.',
  '• Master finale: top 8 con almeno 5 partite giocate.',
  '• Limite massimo: 5 scontri contro lo stesso avversario.',
].join('\n');

type Trend = 'up' | 'down' | 'steady';

export interface SummerRankingEntry {
  player: Player;
  rank: number;
  points: number;
  startingPoints: number;
  wins: number;
  draws: number;
  losses: number;
  matchesPlayed: number;
  resultPoints: number;
  participationBonus: number;
  gameDiffBonus: number;
  inactivityMalus: number;
  recentForm: Array<'W' | 'D' | 'L'>;
  trend: Trend;
  qualifiedForMaster: boolean;
  lastMatchAt?: string;
  upcomingMatches: number;
}

const FAVORITE_WIN_RULES = {
  low: { winner: 20, loser: -20 },
  medium: { winner: 10, loser: -30 },
  high: { winner: 5, loser: -40 },
} as const;

const UNDERDOG_WIN_RULES = {
  low: { winner: 20, loser: -20 },
  medium: { winner: 30, loser: -10 },
  high: { winner: 40, loser: -5 },
} as const;

const getStartingPoints = (player: Player) => Number(player.summerRankingStartPoints ?? 0);

export const getSummerRankingDiffBand = (diff: number) => {
  if (diff <= 100) return 'low' as const;
  if (diff <= 200) return 'medium' as const;
  return 'high' as const;
};

export const getSummerRankingWinPoints = (winnerPoints: number, loserPoints: number) => {
  const diff = Math.abs(winnerPoints - loserPoints);
  const band = getSummerRankingDiffBand(diff);
  const winnerIsFavorite = winnerPoints >= loserPoints;
  return (winnerIsFavorite ? FAVORITE_WIN_RULES : UNDERDOG_WIN_RULES)[band].winner;
};

const toTimestamp = (value?: string) => {
  if (!value) return Number.NaN;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.NaN : time;
};

const getWeekKey = (date: Date) => {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
};

const getMatchPlayedAt = (match: Match) => match.completedAt ?? match.scheduledTime;

const getParticipationBonus = (playerId: string, matchDate: Date, weeklyMatchCounts: Map<string, number>) => {
  const key = `${playerId}:${getWeekKey(matchDate)}`;
  return (weeklyMatchCounts.get(key) ?? 0) >= 2 ? 10 : 5;
};

const getGameDiffBonus = (scoreDiff: number) => {
  if (scoreDiff >= 4) return 3;
  if (scoreDiff === 3) return 2;
  if (scoreDiff === 2) return 1;
  return 0;
};

const countEncounterMatches = (matches: Match[], player1Id: string, player2Id: string) =>
  matches.filter(match => {
    const pair = [match.player1Id, match.player2Id].sort().join(':');
    return pair === [player1Id, player2Id].sort().join(':');
  }).length;

export const getHeadToHeadCount = (matches: Match[], player1Id: string, player2Id: string) =>
  countEncounterMatches(matches, player1Id, player2Id);

export const getEligibleOpponents = (players: Player[], matches: Match[], playerId: string) =>
  players.filter(player =>
    player.id !== playerId &&
    player.status === 'confirmed' &&
    countEncounterMatches(matches, playerId, player.id) < 5
  );

export const calculateSummerRanking = (
  players: Player[],
  matches: Match[],
  now: Date = new Date(),
): SummerRankingEntry[] => {
  const confirmedPlayers = players.filter(player => player.status === 'confirmed');
  const completedMatches = matches
    .filter(match => match.status === 'completed' && match.score1 !== null && match.score2 !== null)
    .slice()
    .sort((a, b) => {
      const aTime = toTimestamp(getMatchPlayedAt(a));
      const bTime = toTimestamp(getMatchPlayedAt(b));
      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return a.id.localeCompare(b.id);
      if (Number.isNaN(aTime)) return 1;
      if (Number.isNaN(bTime)) return -1;
      return aTime - bTime;
    });

  const weeklyMatchCounts = new Map<string, number>();
  completedMatches.forEach(match => {
    const playedAt = toTimestamp(getMatchPlayedAt(match));
    if (Number.isNaN(playedAt)) return;
    const date = new Date(playedAt);
    [match.player1Id, match.player2Id].forEach(playerId => {
      const key = `${playerId}:${getWeekKey(date)}`;
      weeklyMatchCounts.set(key, (weeklyMatchCounts.get(key) ?? 0) + 1);
    });
  });

  const stats = new Map<string, Omit<SummerRankingEntry, 'player' | 'rank' | 'qualifiedForMaster'>>();
  const playedDatesByPlayer = new Map<string, number[]>();
  confirmedPlayers.forEach(player => {
    stats.set(player.id, {
      points: getStartingPoints(player),
      startingPoints: getStartingPoints(player),
      wins: 0,
      draws: 0,
      losses: 0,
      matchesPlayed: 0,
      resultPoints: 0,
      participationBonus: 0,
      gameDiffBonus: 0,
      inactivityMalus: 0,
      recentForm: [],
      trend: 'steady',
      lastMatchAt: undefined,
      upcomingMatches: matches.filter(match =>
        match.status === 'scheduled' && (match.player1Id === player.id || match.player2Id === player.id)
      ).length,
    });
    playedDatesByPlayer.set(player.id, []);
  });

  completedMatches.forEach(match => {
    const player1Stats = stats.get(match.player1Id);
    const player2Stats = stats.get(match.player2Id);
    if (!player1Stats || !player2Stats) return;

    const player1PointsBefore = player1Stats.points;
    const player2PointsBefore = player2Stats.points;
    const diff = Math.abs(player1PointsBefore - player2PointsBefore);
    const band = getSummerRankingDiffBand(diff);
    const isPlayer1Favorite = player1PointsBefore >= player2PointsBefore;
    const playedAt = getMatchPlayedAt(match);
    const playedDate = toTimestamp(playedAt);
    if (!Number.isNaN(playedDate)) {
      playedDatesByPlayer.get(match.player1Id)?.push(playedDate);
      playedDatesByPlayer.get(match.player2Id)?.push(playedDate);
    }
    const participation1 = Number.isNaN(playedDate) ? 5 : getParticipationBonus(match.player1Id, new Date(playedDate), weeklyMatchCounts);
    const participation2 = Number.isNaN(playedDate) ? 5 : getParticipationBonus(match.player2Id, new Date(playedDate), weeklyMatchCounts);
    const scoreDiff = Math.abs((match.score1 ?? 0) - (match.score2 ?? 0));

    player1Stats.matchesPlayed += 1;
    player2Stats.matchesPlayed += 1;
    player1Stats.participationBonus += participation1;
    player2Stats.participationBonus += participation2;
    player1Stats.points += participation1;
    player2Stats.points += participation2;
    player1Stats.lastMatchAt = playedAt;
    player2Stats.lastMatchAt = playedAt;

    if (match.score1 === match.score2) {
      const favoriteWinRule = FAVORITE_WIN_RULES[band];
      const underdogWinRule = UNDERDOG_WIN_RULES[band];
      const player1DrawPoints = (isPlayer1Favorite ? favoriteWinRule.winner : underdogWinRule.winner) / 2;
      const player2DrawPoints = (!isPlayer1Favorite ? favoriteWinRule.winner : underdogWinRule.winner) / 2;

      player1Stats.points += player1DrawPoints;
      player2Stats.points += player2DrawPoints;
      player1Stats.resultPoints += player1DrawPoints;
      player2Stats.resultPoints += player2DrawPoints;
      player1Stats.draws += 1;
      player2Stats.draws += 1;
      player1Stats.recentForm.push('D');
      player2Stats.recentForm.push('D');
      return;
    }

    const player1Won = (match.score1 ?? 0) > (match.score2 ?? 0);
    const winnerStats = player1Won ? player1Stats : player2Stats;
    const loserStats = player1Won ? player2Stats : player1Stats;
    const winnerWasFavorite = player1Won ? isPlayer1Favorite : !isPlayer1Favorite;
    const rule = winnerWasFavorite ? FAVORITE_WIN_RULES[band] : UNDERDOG_WIN_RULES[band];
    const gameDiffBonus = getGameDiffBonus(scoreDiff);

    winnerStats.points += rule.winner + gameDiffBonus;
    loserStats.points += rule.loser;
    winnerStats.resultPoints += rule.winner;
    loserStats.resultPoints += rule.loser;
    winnerStats.gameDiffBonus += gameDiffBonus;
    winnerStats.wins += 1;
    loserStats.losses += 1;
    winnerStats.recentForm.push('W');
    loserStats.recentForm.push('L');
  });

  confirmedPlayers.forEach(player => {
    const playerStats = stats.get(player.id);
    if (!playerStats) return;
    const playedDates = (playedDatesByPlayer.get(player.id) ?? []).slice().sort((a, b) => a - b);
    const referenceDates: number[] = [];
    const joinedAt = toTimestamp(player.summerRankingJoinedAt);
    if (!Number.isNaN(joinedAt)) referenceDates.push(joinedAt);
    referenceDates.push(...playedDates);
    if (referenceDates.length > 0) {
      let inactivityPenalty = 0;
      for (let index = 1; index < referenceDates.length; index += 1) {
        const gap = Math.floor((referenceDates[index] - referenceDates[index - 1]) / 86400000);
        inactivityPenalty += Math.floor(gap / 10) * 5;
      }
      const lastReference = referenceDates[referenceDates.length - 1];
      const currentGap = Math.floor((now.getTime() - lastReference) / 86400000);
      inactivityPenalty += Math.floor(currentGap / 10) * 5;
      playerStats.inactivityMalus = inactivityPenalty;
      playerStats.points -= inactivityPenalty;
    }

    const recent = playerStats.recentForm.slice(-3);
    if (recent.length === 0) {
      playerStats.trend = 'steady';
    } else {
      const score = recent.reduce((total, item) => total + (item === 'W' ? 1 : item === 'L' ? -1 : 0), 0);
      playerStats.trend = score > 0 ? 'up' : score < 0 ? 'down' : 'steady';
    }
    playerStats.recentForm = playerStats.recentForm.slice(-5);
    playerStats.points = Math.round(playerStats.points * 10) / 10;
  });

  const ranking = confirmedPlayers
    .map(player => ({
      player,
      rank: 0,
      qualifiedForMaster: false,
      ...(stats.get(player.id) ?? {
        points: getStartingPoints(player),
        startingPoints: getStartingPoints(player),
        wins: 0,
        draws: 0,
        losses: 0,
        matchesPlayed: 0,
        resultPoints: 0,
        participationBonus: 0,
        gameDiffBonus: 0,
        inactivityMalus: 0,
        recentForm: [],
        trend: 'steady' as Trend,
        lastMatchAt: undefined,
        upcomingMatches: 0,
      }),
    }))
    .sort((a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      b.matchesPlayed - a.matchesPlayed ||
      a.player.name.localeCompare(b.player.name)
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  ranking
    .filter(entry => entry.matchesPlayed >= 5)
    .slice(0, 8)
    .forEach(entry => {
      entry.qualifiedForMaster = true;
    });

  return ranking;
};
