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
