export interface Player {
  id: string;
  name: string;
  phone: string;
  avatar: string;
  status: 'pending' | 'confirmed';
  summerRankingStartPoints?: number;
  summerRankingJoinedAt?: string;
}

export interface Match {
  id: string;
  player1Id: string;
  player2Id: string;
  score1: number | null;
  score2: number | null;
  status: 'pending' | 'scheduled' | 'completed';
  scheduledTime?: string;
  location?: string;
  field?: string;
  slotId?: string;
  completedAt?: string;
}

export interface Group {
  id: string;
  name: string;
  playerIds: string[];
  matches: Match[];
  rules?: string; // <-- aggiunto campo regolamento
}

export interface PointRule {
  id: string;
  minDiff: number;
  maxDiff: number;
  winnerPoints: number;
  loserPoints: number;
}

export type TieBreaker = 'goalDifference' | 'goalsFor' | 'wins' | 'headToHead';

export interface PlayoffSetting {
  groupId: string;
  numQualifiers: number;
}

export interface ConsolationSetting {
  groupId: string;
  startRank: number;
  endRank: number;
}

export interface TournamentSettings {
    pointsPerDraw: number;
    pointRules: PointRule[];
    tieBreakers: TieBreaker[];
    playoffSettings: PlayoffSetting[];
    hasBronzeFinal: boolean;
    consolationSettings: ConsolationSetting[];
}

export interface TimeSlot {
    id: string;
    start: string;
    location: string;
    field: string;
}

export interface PlayoffMatch {
  id: string;
  round: number;
  matchIndex: number;
  player1Id: string | null;
  player2Id: string | null;
  score1: number | null;
  score2: number | null;
  winnerId: string | null;
  nextMatchId: string | null;
  isBronzeFinal?: boolean;
  loserGoesToBronzeFinal?: boolean;
}

export interface PlayoffBracket {
  matches: PlayoffMatch[];
  isGenerated: boolean;
  finalId: string | null;
  bronzeFinalId: string | null;
}

export interface Tournament {
  id: string;
  name: string;
  groups: Group[];
  settings: TournamentSettings;
  timeSlots: TimeSlot[];
  playoffs: PlayoffBracket | null;
  consolationBracket: PlayoffBracket | null;

  // NEW: partite “prenotabili” visibili nel tab Partite
  playoffMatches?: Match[];
  consolationMatches?: Match[];
}

export interface Event {
  id: string;
  name: string;
  tournaments: Tournament[];
  players: Player[];
  invitationCode: string;
  eventType?: 'ranking_singolare' | 'tournament_singolare';
  rankingData?: SummerRankingData;
  globalTimeSlots?: TimeSlot[];
  rules?: string;
}

export type SummerAvailabilityStatus = 'available' | 'unavailable';
export type SummerAvailabilityDay =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';
export type SummerAvailabilityPeriod = 'morning' | 'afternoon' | 'evening';

export interface SummerPlayerAvailability {
  status: SummerAvailabilityStatus;
  days: SummerAvailabilityDay[];
  periods: SummerAvailabilityPeriod[];
  updatedAt?: string;
}

export type SummerRankingMasterStage = 'quarterfinal' | 'semifinal' | 'final' | 'thirdPlace';

export interface SummerRankingMasterMatch {
  id: string;
  round: number;
  label: string;
  stage: SummerRankingMasterStage;
  player1Id: string | null;
  player2Id: string | null;
  score1: number | null;
  score2: number | null;
  status: 'pending' | 'scheduled' | 'completed';
  scheduledTime?: string;
  location?: string;
  field?: string;
  slotId?: string;
  completedAt?: string;
}

export interface SummerRankingMasterData {
  manualQualifiedPlayerIds?: string[];
  generatedQualifiedPlayerIds?: string[];
  bracket?: PlayoffBracket | null;
  matches?: SummerRankingMasterMatch[];
  generatedAt?: string;
}

export interface SummerRankingData {
  slots: TimeSlot[];
  matches: Match[];
  participantIds?: string[];
  rules?: string;
  availabilities?: Record<string, SummerPlayerAvailability>;
  master?: SummerRankingMasterData;
}

export interface StandingsEntry {
    playerId: string;
    played: number;
    wins: number;
    draws: number;
    losses: number;
    points: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
}

export interface User {
    id: string;
    username: string;
    password: string;
    role: 'organizer' | 'participant';
    playerId?: string;
}
