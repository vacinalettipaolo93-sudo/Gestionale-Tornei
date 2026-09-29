import type { Event } from '../types';
import { isEventConcluded } from './eventStatus';

export type EventSport = 'tennis' | 'padel';
export type EventCategory = 'all' | 'ranking' | 'tournament';
export type EventPhase = 'ongoing' | 'concluded';

export const EVENT_SPORTS: { value: EventSport; label: string }[] = [
  { value: 'tennis', label: 'Tennis' },
  { value: 'padel', label: 'Padel' },
];

export const getEventSport = (event: Event): EventSport =>
  event.eventType === 'tournament_padel' || event.eventType === 'ranking_padel_individuale'
    ? 'padel'
    : 'tennis';

export const getEventCategory = (event: Event): Exclude<EventCategory, 'all'> =>
  event.eventType === 'ranking_singolare' || event.eventType === 'ranking_padel_individuale'
    ? 'ranking'
    : 'tournament';

export const getEventYear = (event: Event): number | null => {
  const completedAt = (event.eventType === 'ranking_singolare' || event.eventType === 'ranking_padel_individuale')
    ? [
        ...(event.rankingData?.master?.matches ?? []),
        ...(event.rankingData?.padelIndividualMaster?.matches ?? []),
        ...(event.rankingData?.matches ?? []),
      ]
    : (Array.isArray(event.tournaments) ? event.tournaments : []).flatMap(tournament => [
        ...(Array.isArray(tournament.groups) ? tournament.groups : []).flatMap(group =>
          Array.isArray(group.matches) ? group.matches : []),
        ...(Array.isArray(tournament.playoffMatches) ? tournament.playoffMatches : []),
        ...(Array.isArray(tournament.consolationMatches) ? tournament.consolationMatches : []),
      ]);

  const years = completedAt
    .filter(match => match?.status === 'completed' && typeof match.completedAt === 'string')
    .map(match => Date.parse(match.completedAt!))
    .filter(timestamp => Number.isFinite(timestamp));
  return years.length ? new Date(Math.max(...years)).getFullYear() : null;
};

export const filterAdminEvents = (
  events: Event[],
  sport: EventSport,
  category: EventCategory,
  phase: EventPhase,
  year: number | null = null,
): Event[] => events.filter(event =>
  getEventSport(event) === sport
  && (category === 'all' || getEventCategory(event) === category)
  && isEventConcluded(event) === (phase === 'concluded')
  && (phase !== 'concluded' || year === null || getEventYear(event) === year)
);

export const getConcludedYears = (events: Event[]): number[] =>
  [...new Set(events.map(getEventYear).filter((year): year is number => year !== null))]
    .sort((a, b) => b - a);
