import test from 'node:test';
import assert from 'node:assert/strict';

import { addPlayerToEvent, removePlayerFromEvent, removePlayerFromRankingEvent } from '../utils/eventPlayers.js';

const firstPlayer = { id: 'player-1', name: 'Mario Rossi' };
const secondPlayer = { id: 'player-2', name: 'Luca Bianchi' };

test('an event player can be added once and duplicate associations are ignored', () => {
  const firstAddition = addPlayerToEvent([], firstPlayer);
  const duplicateAddition = addPlayerToEvent(firstAddition.players, firstPlayer);

  assert.deepEqual(firstAddition, { players: [firstPlayer], added: true });
  assert.deepEqual(duplicateAddition, { players: [firstPlayer], added: false });
});

test('removing an event player preserves the other event players', () => {
  assert.deepEqual(
    removePlayerFromEvent([firstPlayer, secondPlayer], firstPlayer.id),
    [secondPlayer],
  );
});

const buildRankingEvent = (overrides = {}) => ({
  id: 'event-1',
  players: [firstPlayer, secondPlayer],
  tournaments: [],
  rankingData: {
    matches: [],
    participantIds: [firstPlayer.id, secondPlayer.id],
    availabilities: { [firstPlayer.id]: { slots: [] } },
  },
  ...overrides,
});

test('removing a player from a ranking event only drops the event association', () => {
  const result = removePlayerFromRankingEvent(buildRankingEvent(), firstPlayer.id);

  assert.equal(result.status, 'removed');
  assert.deepEqual(result.players, [secondPlayer]);
  assert.deepEqual(result.rankingData.participantIds, [secondPlayer.id]);
  assert.equal(firstPlayer.id in result.rankingData.availabilities, false);
  assert.deepEqual(result.rankingData.matches, []);
});

test('removing a player is blocked when matches already exist', () => {
  const event = buildRankingEvent({
    rankingData: {
      matches: [{ id: 'match-1', player1Id: firstPlayer.id, player2Id: secondPlayer.id }],
      participantIds: [firstPlayer.id, secondPlayer.id],
    },
  });

  const result = removePlayerFromRankingEvent(event, firstPlayer.id);

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.blockers, ['matches']);
});

test('removing a player is blocked when the player already belongs to a group', () => {
  const event = buildRankingEvent({
    tournaments: [{ id: 'tournament-1', groups: [{ id: 'group-1', playerIds: [firstPlayer.id] }] }],
  });

  const result = removePlayerFromRankingEvent(event, firstPlayer.id);

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.blockers, ['groups']);
});

test('repeating the removal of a player reports that the association no longer exists', () => {
  const event = buildRankingEvent({
    players: [secondPlayer],
    rankingData: { matches: [], participantIds: [secondPlayer.id], availabilities: {} },
  });

  const result = removePlayerFromRankingEvent(event, firstPlayer.id);

  assert.equal(result.status, 'not-associated');
  assert.deepEqual(result.players, [secondPlayer]);
});
