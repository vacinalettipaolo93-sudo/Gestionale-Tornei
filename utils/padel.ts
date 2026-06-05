import { type Event, type Tournament, type Player, type PadelTeam } from '../types';

const DEFAULT_TEAM_AVATAR = 'https://ui-avatars.com/api/?name=Team&background=1f2937&color=ffffff';

export const isPadelEvent = (event?: Pick<Event, 'eventType'> | null): boolean =>
  event?.eventType === 'tournament_padel';

export const getTournamentPadelTeams = (tournament?: Tournament | null): PadelTeam[] =>
  Array.isArray(tournament?.padelTeams) ? tournament!.padelTeams! : [];

export const getTeamForPlayer = (teams: PadelTeam[], playerId?: string): PadelTeam | undefined =>
  teams.find(team => team.player1Id === playerId || team.player2Id === playerId);

export const buildTeamDisplayPlayer = (team: PadelTeam, players: Player[]): Player => {
  const player1 = players.find(player => player.id === team.player1Id);
  const player2 = players.find(player => player.id === team.player2Id);
  const player1Name = player1?.name ?? 'Giocatore 1';
  const player2Name = player2?.name ?? 'Giocatore 2';

  return {
    id: team.id,
    name: `${team.name} (${player1Name} / ${player2Name})`,
    phone: '',
    avatar: player1?.avatar || player2?.avatar || DEFAULT_TEAM_AVATAR,
    status: 'confirmed',
  };
};

export const getTournamentCompetitors = (event: Event, tournament: Tournament): Player[] => {
  if (!isPadelEvent(event)) return event.players;
  return getTournamentPadelTeams(tournament).map(team => buildTeamDisplayPlayer(team, event.players));
};

export const getCompetitorName = (event: Event, tournament: Tournament, competitorId?: string | null): string => {
  if (!competitorId) return 'N/A';
  const competitor = getTournamentCompetitors(event, tournament).find(player => player.id === competitorId);
  return competitor?.name ?? 'N/A';
};

