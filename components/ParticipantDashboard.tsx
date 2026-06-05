import React from 'react';
import { type Event } from '../types';
import { calculateStandings } from '../utils/standings';
import { calculateSummerRanking } from '../utils/summerRanking';

interface ParticipantDashboardProps {
  events: Event[];
  headerContent?: React.ReactNode;
  playerId: string;
  onSelectEvent: (event: Event) => void;
}

const ParticipantDashboard: React.FC<ParticipantDashboardProps> = ({ events, headerContent, playerId, onSelectEvent }) => {
  const myEvents = events.filter(event => 
    Array.isArray(event.players) && event.players.some(p => p.id === playerId && p.status === 'confirmed')
  );

  const getPlayerStats = (event: Event) => {
    let position = 'N/A';
    let played = 0;
    let toPlay = 0;
    let totalMatches = 0;
    let completionPercentage = 0;
    let tournamentName = '';

    if (event.eventType === 'ranking_singolare') {
      const rankingData = event.rankingData;
      const participantIds = Array.isArray(rankingData?.participantIds) ? rankingData.participantIds : [];
      const isInRanking = participantIds.includes(playerId);
      const confirmedPlayers = Array.isArray(event.players)
        ? event.players.filter(player => player.status === 'confirmed' && participantIds.includes(player.id))
        : [];
      const ranking = calculateSummerRanking(confirmedPlayers, Array.isArray(rankingData?.matches) ? rankingData.matches : []);
      const myRanking = ranking.find(entry => entry.player.id === playerId);
      position = isInRanking && myRanking ? `${myRanking.rank}°` : '—';
      const myMatches = (rankingData?.matches ?? []).filter(match => match.player1Id === playerId || match.player2Id === playerId);
      totalMatches = myMatches.length;
      played = myMatches.filter(match => match.status === 'completed').length;
      toPlay = totalMatches - played;
      completionPercentage = totalMatches > 0 ? Math.round((played / totalMatches) * 100) : 0;
      tournamentName = 'Ranking tennis singolare';
      return { position, played, toPlay, totalMatches, completionPercentage, tournamentName };
    }

    const tournament = Array.isArray(event.tournaments)
      ? event.tournaments.find(t => Array.isArray(t.groups) && t.groups.some(g => Array.isArray(g.playerIds) && g.playerIds.includes(playerId)))
      : undefined;

    if (tournament) {
      tournamentName = tournament.name;
      const group = Array.isArray(tournament.groups)
        ? tournament.groups.find(g => Array.isArray(g.playerIds) && g.playerIds.includes(playerId))
        : undefined;
      if (group) {
        const standings = calculateStandings(group, event.players, tournament.settings);
        const myStanding = standings.findIndex(s => s.playerId === playerId);
        if (myStanding !== -1) {
          position = `${myStanding + 1}°`;
        }

        const myMatches = Array.isArray(group.matches)
          ? group.matches.filter(m => m.player1Id === playerId || m.player2Id === playerId)
          : [];
        totalMatches = myMatches.length;
        played = myMatches.filter(m => m.status === 'completed').length;
        toPlay = totalMatches - played;
        completionPercentage = totalMatches > 0 ? Math.round((played / totalMatches) * 100) : 0;
      }
    }
    return { position, played, toPlay, totalMatches, completionPercentage, tournamentName };
  };

  return (
    <div className="space-y-6 animate-fadeIn">
        {headerContent}
        <h2 className="text-3xl font-bold">I Miei Eventi</h2>
        {myEvents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {myEvents.map(event => {
                    const stats = getPlayerStats(event);
                    return (
                        <div 
                            key={event.id}
                            onClick={() => onSelectEvent(event)} 
                            className="bg-secondary rounded-xl shadow-lg transition-all duration-300 group relative overflow-hidden flex flex-col cursor-pointer"
                        >
                             <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-accent/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                            <div className="p-6 flex-grow z-10">
                                <h3 className="text-xl font-bold text-accent truncate">{event.name}</h3>
                                <p className="text-text-secondary mt-1 text-sm">{stats.tournamentName}</p>
                                <div className="mt-4 pt-4 border-t border-tertiary/50 grid grid-cols-3 gap-4 text-center">
                                    <div>
                                        <div className="text-2xl font-bold">{stats.position}</div>
                                        <div className="text-xs text-text-secondary">Classifica</div>
                                    </div>
                                     <div>
                                        <div className="text-2xl font-bold">{stats.played}</div>
                                        <div className="text-xs text-text-secondary">Giocate</div>
                                    </div>
                                     <div>
                                        <div className="text-2xl font-bold">{stats.toPlay}</div>
                                        <div className="text-xs text-text-secondary">Da giocare</div>
                                    </div>
                                </div>
                                <div className="mt-2">
                                    <div className="w-full bg-tertiary/30 h-2 rounded-full">
                                        <div className="bg-accent h-2 rounded-full transition-all duration-300" style={{ width: `${stats.completionPercentage}%` }}></div>
                                    </div>
                                    <div className="text-xs text-text-secondary mt-1 text-right">{stats.completionPercentage}% Completato</div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        ) : (
            <p className="text-text-secondary text-center py-8">Nessun evento trovato.</p>
        )}
    </div>
  );
};

export default ParticipantDashboard;
