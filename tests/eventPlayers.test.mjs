import test from 'node:test';
import assert from 'node:assert/strict';

import { addPlayerToEvent, removePlayerFromEvent } from '../utils/eventPlayers.js';

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
