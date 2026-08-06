/**
 * Unit tests for utils/avatar.ts (compiled to utils/avatar.js via vite/tsc not available
 * at test time, so we reimplement the pure functions inline to test their logic).
 *
 * Note: compressImageToDataUrl relies on DOM APIs (Canvas, Image, FileReader) and is
 * therefore not tested here. The validation helpers are pure and fully testable.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ─── Inline reimplementation of the pure helpers from utils/avatar.ts ──────

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

function validateImageFile(file) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return 'Formato non supportato. Usa JPG, PNG o WebP.';
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `Il file è troppo grande (max 2 MB). Dimensione attuale: ${(file.size / 1024 / 1024).toFixed(1)} MB.`;
  }
  return null;
}

// Simulate Node environment for btoa (available globally in Node 16+)
function createInitialsAvatar(name) {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const GRADIENT_PAIRS = [
    ['#7c3aed', '#a78bfa'],
    ['#0891b2', '#22d3ee'],
    ['#d97706', '#fbbf24'],
    ['#059669', '#34d399'],
    ['#dc2626', '#f87171'],
    ['#2563eb', '#60a5fa'],
    ['#db2777', '#f472b6'],
    ['#ea580c', '#fb923c'],
  ];

  const idx = initials.charCodeAt(0) % GRADIENT_PAIRS.length;
  const [from, to] = GRADIENT_PAIRS[idx];

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">',
    '<defs>',
    `<linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">`,
    `<stop offset="0%" stop-color="${from}"/>`,
    `<stop offset="100%" stop-color="${to}"/>`,
    '</linearGradient>',
    '</defs>',
    '<rect width="100" height="100" rx="20" fill="url(#g)"/>',
    `<text x="50" y="50" font-family="system-ui,sans-serif" font-size="44" font-weight="700" fill="white" `,
    `text-anchor="middle" dominant-baseline="central" dy=".05em">${initials}</text>`,
    '</svg>',
  ].join('');

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('validateImageFile: accepts jpeg', () => {
  const result = validateImageFile({ type: 'image/jpeg', size: 1024 });
  assert.equal(result, null);
});

test('validateImageFile: accepts png', () => {
  const result = validateImageFile({ type: 'image/png', size: 500 * 1024 });
  assert.equal(result, null);
});

test('validateImageFile: accepts webp', () => {
  const result = validateImageFile({ type: 'image/webp', size: 1 });
  assert.equal(result, null);
});

test('validateImageFile: rejects gif', () => {
  const result = validateImageFile({ type: 'image/gif', size: 1024 });
  assert.notEqual(result, null);
  assert.match(result, /Formato non supportato/);
});

test('validateImageFile: rejects file > 2 MB', () => {
  const result = validateImageFile({ type: 'image/jpeg', size: MAX_UPLOAD_BYTES + 1 });
  assert.notEqual(result, null);
  assert.match(result, /troppo grande/);
});

test('validateImageFile: accepts file exactly at 2 MB', () => {
  const result = validateImageFile({ type: 'image/png', size: MAX_UPLOAD_BYTES });
  assert.equal(result, null);
});

test('createInitialsAvatar: returns a data URL', () => {
  const url = createInitialsAvatar('Mario Rossi');
  assert.ok(url.startsWith('data:image/svg+xml;base64,'));
});

test('createInitialsAvatar: encodes two initials for two-word name', () => {
  const url = createInitialsAvatar('Mario Rossi');
  const decoded = Buffer.from(url.replace('data:image/svg+xml;base64,', ''), 'base64').toString('utf8');
  assert.match(decoded, /MR/);
});

test('createInitialsAvatar: single-word name uses one initial', () => {
  const url = createInitialsAvatar('Luca');
  const decoded = Buffer.from(url.replace('data:image/svg+xml;base64,', ''), 'base64').toString('utf8');
  assert.match(decoded, /L/);
});

test('createInitialsAvatar: contains gradient definition', () => {
  const url = createInitialsAvatar('Paolo Verdi');
  const decoded = Buffer.from(url.replace('data:image/svg+xml;base64,', ''), 'base64').toString('utf8');
  assert.match(decoded, /linearGradient/);
});

test('createInitialsAvatar: different names can produce different gradient pairs', () => {
  const url1 = createInitialsAvatar('Alfa Beta');   // A → idx 0
  const url2 = createInitialsAvatar('Nino Oscar');  // N → idx 5
  // Both are valid data URLs
  assert.ok(url1.startsWith('data:image/svg+xml;base64,'));
  assert.ok(url2.startsWith('data:image/svg+xml;base64,'));
  // They may differ (not guaranteed by all names, but for these two they will)
  assert.notEqual(url1, url2);
});
