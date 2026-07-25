export const AUTH_SESSION_STORAGE_KEY = 'tournament-manager-pro.auth-session';
export const AUTH_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const AUTH_SESSION_VERSION = 1;

const hasStorageApi = storage =>
  !!storage
  && typeof storage.getItem === 'function'
  && typeof storage.setItem === 'function'
  && typeof storage.removeItem === 'function';

const isNonEmptyString = value => typeof value === 'string' && value.trim().length > 0;

const isValidTimestamp = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

const normalizeUserId = user => {
  if (!user || typeof user.id !== 'string') return '';
  return user.id.trim();
};

const isValidPersistedAuthSession = session =>
  !!session
  && session.version === AUTH_SESSION_VERSION
  && isNonEmptyString(session.userId)
  && isValidTimestamp(session.issuedAt)
  && isValidTimestamp(session.expiresAt)
  && session.expiresAt > session.issuedAt;

export const getAuthSessionStorage = () => {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const clearPersistedAuthSession = storage => {
  if (!hasStorageApi(storage)) return;

  try {
    storage.removeItem(AUTH_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
};

export const createPersistedAuthSession = (
  user,
  {
    now = Date.now(),
    maxAgeMs = AUTH_SESSION_MAX_AGE_MS,
  } = {},
) => {
  const userId = normalizeUserId(user);
  if (!isNonEmptyString(userId) || !isValidTimestamp(now) || !isValidTimestamp(maxAgeMs)) {
    return null;
  }

  return {
    version: AUTH_SESSION_VERSION,
    userId,
    issuedAt: now,
    expiresAt: now + maxAgeMs,
  };
};

export const persistAuthSession = (storage, user, options) => {
  const session = createPersistedAuthSession(user, options);
  if (!session || !hasStorageApi(storage)) return null;

  try {
    storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
    return session;
  } catch {
    return null;
  }
};

export const readPersistedAuthSession = (storage, { now = Date.now() } = {}) => {
  if (!hasStorageApi(storage)) {
    return { status: 'missing', session: null };
  }

  let rawSession = null;
  try {
    rawSession = storage.getItem(AUTH_SESSION_STORAGE_KEY);
  } catch {
    return { status: 'missing', session: null };
  }

  if (!isNonEmptyString(rawSession)) {
    return { status: 'missing', session: null };
  }

  let parsedSession;
  try {
    parsedSession = JSON.parse(rawSession);
  } catch {
    clearPersistedAuthSession(storage);
    return { status: 'invalid', session: null };
  }

  if (!isValidPersistedAuthSession(parsedSession)) {
    clearPersistedAuthSession(storage);
    return { status: 'invalid', session: null };
  }

  if (parsedSession.expiresAt <= now) {
    clearPersistedAuthSession(storage);
    return { status: 'expired', session: null };
  }

  return { status: 'authenticated', session: parsedSession };
};

export const resolvePersistedAuthUser = ({ storage, users, now = Date.now() }) => {
  const { status, session } = readPersistedAuthSession(storage, { now });
  if (status !== 'authenticated' || !session) {
    return { status, user: null };
  }

  if (!Array.isArray(users)) {
    clearPersistedAuthSession(storage);
    return { status: 'invalid', user: null };
  }

  const user = users.find(candidate => candidate?.id === session.userId) ?? null;
  if (!user) {
    clearPersistedAuthSession(storage);
    return { status: 'invalid', user: null };
  }

  return { status: 'authenticated', user };
};
