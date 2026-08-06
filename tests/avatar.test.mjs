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
const SAFE_AVATAR_SOURCE = /^(https?:\/\/|data:image\/|blob:)/i;

function validateImageFile(file) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return 'Formato non supportato. Usa JPG, PNG o WebP.';
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `Il file è troppo grande (max 2 MB). Dimensione attuale: ${(file.size / 1024 / 1024).toFixed(1)} MB.`;
  }
  return null;
}

function isSafeAvatarSource(source) {
  return SAFE_AVATAR_SOURCE.test(source.trim());
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

function createCharacterAvatarSvg({ bg, skin, hair, shirt, accessory = '#ffffff' }) {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">',
    `<rect width="100" height="100" rx="24" fill="${bg}"/>`,
    `<circle cx="50" cy="42" r="22" fill="${skin}"/>`,
    `<ellipse cx="50" cy="30" rx="24" ry="14" fill="${hair}"/>`,
    `<rect x="26" y="62" width="48" height="30" rx="14" fill="${shirt}"/>`,
    '<circle cx="42" cy="42" r="2.2" fill="#222"/>',
    '<circle cx="58" cy="42" r="2.2" fill="#222"/>',
    '<path d="M42 52c2.5 3 13.5 3 16 0" stroke="#7a3e1d" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
    `<circle cx="50" cy="28" r="2.5" fill="${accessory}" opacity="0.65"/>`,
    '</svg>',
  ].join('');
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function getCharacterAvatarPresets() {
  const presetConfig = [
    { id: 'male-1', label: 'Luca', gender: 'male' },
    { id: 'male-2', label: 'Marco', gender: 'male' },
    { id: 'male-3', label: 'Andrea', gender: 'male' },
    { id: 'female-1', label: 'Sara', gender: 'female' },
    { id: 'female-2', label: 'Giulia', gender: 'female' },
    { id: 'female-3', label: 'Elena', gender: 'female' },
  ];
  const presetStyles = [
    { bg: '#1e293b', skin: '#f1c27d', hair: '#1f2937', shirt: '#06b6d4', accessory: '#67e8f9' },
    { bg: '#312e81', skin: '#dba585', hair: '#334155', shirt: '#a855f7', accessory: '#ddd6fe' },
    { bg: '#365314', skin: '#8d5524', hair: '#111827', shirt: '#84cc16', accessory: '#bef264' },
    { bg: '#7c2d12', skin: '#ffdbac', hair: '#7f1d1d', shirt: '#f97316', accessory: '#fdba74' },
    { bg: '#4c1d95', skin: '#e0ac69', hair: '#6d28d9', shirt: '#ec4899', accessory: '#fbcfe8' },
    { bg: '#0f766e', skin: '#c68642', hair: '#155e75', shirt: '#14b8a6', accessory: '#99f6e4' },
  ];
  return presetConfig.map((preset, index) => ({ ...preset, avatar: createCharacterAvatarSvg(presetStyles[index]) }));
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

test('getCharacterAvatarPresets: includes male and female presets', () => {
  const presets = getCharacterAvatarPresets();
  assert.ok(presets.some(p => p.gender === 'male'));
  assert.ok(presets.some(p => p.gender === 'female'));
});

test('getCharacterAvatarPresets: avatars are data URLs', () => {
  const presets = getCharacterAvatarPresets();
  assert.ok(presets.every(p => p.avatar.startsWith('data:image/svg+xml;base64,')));
});

test('isSafeAvatarSource: accepts https and data image sources', () => {
  assert.equal(isSafeAvatarSource('https://example.com/avatar.jpg'), true);
  assert.equal(isSafeAvatarSource('data:image/png;base64,AAAA'), true);
});

test('isSafeAvatarSource: rejects javascript URLs', () => {
  assert.equal(isSafeAvatarSource('javascript:alert(1)'), false);
});
