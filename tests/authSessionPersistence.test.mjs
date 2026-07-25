import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTH_SESSION_STORAGE_KEY,
  clearPersistedAuthSession,
  persistAuthSession,
  readPersistedAuthSession,
  resolvePersistedAuthUser,
} from '../utils/authSession.js';

const createStorage = (initialEntries = {}) => {
  const store = new Map(Object.entries(initialEntries));

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
};

const participantUser = {
  id: 'user-1',
  username: 'mario.rossi',
  password: 'super-secret',
  role: 'participant',
  playerId: 'player-1',
};

test('login persistence restores the authenticated user after a refresh without storing the password', () => {
  const storage = createStorage();

  const persistedSession = persistAuthSession(storage, participantUser, {
    now: 1_000,
    maxAgeMs: 10_000,
  });

  assert.ok(persistedSession);
  assert.equal(persistedSession.userId, participantUser.id);

  const savedPayload = JSON.parse(storage.getItem(AUTH_SESSION_STORAGE_KEY));
  assert.deepEqual(
    Object.keys(savedPayload).sort(),
    ['expiresAt', 'issuedAt', 'userId', 'version'],
  );
  assert.equal('password' in savedPayload, false);
  assert.equal('username' in savedPayload, false);

  const restoredSession = resolvePersistedAuthUser({
    storage,
    users: [participantUser],
    now: 5_000,
  });

  assert.equal(restoredSession.status, 'authenticated');
  assert.equal(restoredSession.user, participantUser);
});

test('logout removes the persisted session so the user becomes unauthenticated', () => {
  const storage = createStorage();

  persistAuthSession(storage, participantUser, {
    now: 1_000,
    maxAgeMs: 10_000,
  });
  clearPersistedAuthSession(storage);

  assert.equal(storage.getItem(AUTH_SESSION_STORAGE_KEY), null);
  assert.deepEqual(readPersistedAuthSession(storage, { now: 2_000 }), {
    status: 'missing',
    session: null,
  });
});

test('expired sessions are cleared and require a new login', () => {
  const storage = createStorage();

  persistAuthSession(storage, participantUser, {
    now: 1_000,
    maxAgeMs: 500,
  });

  assert.deepEqual(readPersistedAuthSession(storage, { now: 2_000 }), {
    status: 'expired',
    session: null,
  });
  assert.equal(storage.getItem(AUTH_SESSION_STORAGE_KEY), null);
});

test('invalid or unknown persisted sessions are removed and anonymous users stay unauthenticated', () => {
  const invalidStorage = createStorage({
    [AUTH_SESSION_STORAGE_KEY]: '{"version":1,"userId":"ghost-user","issuedAt":1000,"expiresAt":5000}',
  });

  assert.deepEqual(
    resolvePersistedAuthUser({
      storage: invalidStorage,
      users: [participantUser],
      now: 2_000,
    }),
    { status: 'invalid', user: null },
  );
  assert.equal(invalidStorage.getItem(AUTH_SESSION_STORAGE_KEY), null);

  const anonymousStorage = createStorage();
  assert.deepEqual(
    resolvePersistedAuthUser({
      storage: anonymousStorage,
      users: [participantUser],
      now: 2_000,
    }),
    { status: 'missing', user: null },
  );
});
