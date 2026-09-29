export function addPlayerToEvent(eventPlayers, player) {
  const players = Array.isArray(eventPlayers) ? eventPlayers : [];
  if (players.some(existing => existing.id === player.id)) {
    return { players, added: false };
  }

  return { players: [...players, player], added: true };
}

export function removePlayerFromEvent(eventPlayers, playerId) {
  return (Array.isArray(eventPlayers) ? eventPlayers : []).filter(player => player.id !== playerId);
}

function matchHasPlayer(match, playerId) {
  const ids = [
    ...(Array.isArray(match?.team1PlayerIds) ? match.team1PlayerIds : [match?.player1Id]),
    ...(Array.isArray(match?.team2PlayerIds) ? match.team2PlayerIds : [match?.player2Id]),
  ];
  return ids.includes(playerId);
}

export function getEventPlayerRemovalBlockers(event, playerId) {
  const blockers = [];
  const matches = event?.rankingData?.matches;
  if (Array.isArray(matches) && matches.some(match => matchHasPlayer(match, playerId))) {
    blockers.push('matches');
  }
  const tournaments = Array.isArray(event?.tournaments) ? event.tournaments : [];
  const isInGroup = tournaments.some(tournament =>
    (Array.isArray(tournament?.groups) ? tournament.groups : []).some(group =>
      (Array.isArray(group?.playerIds) ? group.playerIds : []).includes(playerId),
    ),
  );
  if (isInGroup) blockers.push('groups');
  return blockers;
}

export function removePlayerFromRankingEvent(event, playerId) {
  const blockers = getEventPlayerRemovalBlockers(event, playerId);
  if (blockers.length > 0) {
    return { status: 'blocked', blockers };
  }

  const currentPlayers = Array.isArray(event?.players) ? event.players : [];
  const players = removePlayerFromEvent(currentPlayers, playerId);
  const rankingData = event?.rankingData;
  const currentParticipantIds = Array.isArray(rankingData?.participantIds) ? rankingData.participantIds : undefined;
  const participantIds = currentParticipantIds?.filter(id => id !== playerId);
  const currentAvailabilities = rankingData?.availabilities;
  const hadAvailability = Boolean(currentAvailabilities) && playerId in currentAvailabilities;
  const availabilities = currentAvailabilities ? { ...currentAvailabilities } : currentAvailabilities;
  if (hadAvailability) delete availabilities[playerId];

  const changed = players.length !== currentPlayers.length
    || (currentParticipantIds !== undefined && participantIds.length !== currentParticipantIds.length)
    || hadAvailability;

  if (!changed) {
    return { status: 'not-associated', blockers, players: currentPlayers, rankingData };
  }

  return {
    status: 'removed',
    blockers,
    players,
    rankingData: rankingData
      ? {
        ...rankingData,
        ...(currentParticipantIds !== undefined ? { participantIds } : {}),
        ...(currentAvailabilities ? { availabilities } : {}),
      }
      : rankingData,
  };
}
