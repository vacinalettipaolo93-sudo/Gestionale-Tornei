import React from "react";
import { type Event, type Tournament } from "../types";
import { getTournamentPadelTeams, getTeamForPlayer, isPadelEvent } from "../utils/padel";

interface ParticipantsTabProps {
  event: Event;
  tournament: Tournament;
  loggedInPlayerId?: string;
}

const ParticipantsTab: React.FC<ParticipantsTabProps> = ({ event, tournament, loggedInPlayerId }) => {
  const isPadel = isPadelEvent(event);
  const padelTeams = getTournamentPadelTeams(tournament);
  const loggedTeam = isPadel ? getTeamForPlayer(padelTeams, loggedInPlayerId) : undefined;
  const competitorId = isPadel ? loggedTeam?.id : loggedInPlayerId;

  // Trova il girone dell'utente
  const userGroup = tournament.groups.find(group =>
    group.playerIds.includes(competitorId || "")
  );

  if (!userGroup) {
    return (
      <div className="bg-secondary p-6 rounded-xl shadow-lg max-w-2xl mx-auto text-center text-text-secondary">
        Non sei assegnato a nessun girone.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-secondary rounded-xl shadow space-y-6">
      <h2 className="text-2xl font-bold mb-4 text-accent">
        {isPadel ? 'Squadre del Girone' : 'Partecipanti del Girone'} <span className="text-white">{userGroup.name}</span>
      </h2>
      <ul className="flex flex-col gap-3">
        {isPadel ? userGroup.playerIds.map(teamId => {
          const team = padelTeams.find(currentTeam => currentTeam.id === teamId);
          if (!team) return null;
          const player1 = event.players.find(player => player.id === team.player1Id);
          const player2 = event.players.find(player => player.id === team.player2Id);
          return (
            <li key={teamId} className="bg-primary rounded-lg p-3 hover:bg-primary/80 transition">
              <div className="font-medium text-white">{team.name}</div>
              <div className="text-sm text-text-secondary mt-1">
                {player1?.name ?? 'Giocatore 1'} / {player2?.name ?? 'Giocatore 2'}
              </div>
            </li>
          );
        }) : userGroup.playerIds.map(pid => {
          const player = event.players.find(p => p.id === pid);
          if (!player) return null;
          const phone = player.phone?.replace(/[^0-9]/g, "");
          const whatsappLink = phone ? `https://wa.me/${phone}` : undefined;
          return (
            <li key={pid} className="bg-primary rounded-lg p-3 flex items-center justify-between hover:bg-primary/80 transition">
              <span className="font-medium text-white">{player.name}</span>
              {whatsappLink && (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-bold transition"
                  title={`Contatta ${player.name} su WhatsApp`}
                >
                  WhatsApp
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ParticipantsTab;