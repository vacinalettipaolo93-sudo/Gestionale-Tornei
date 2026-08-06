/**
 * Shared avatar utility functions.
 * Centralises createInitialsAvatar so every component produces identical fallback avatars.
 */

const GRADIENT_PAIRS: [string, string][] = [
  ['#7c3aed', '#a78bfa'],
  ['#0891b2', '#22d3ee'],
  ['#d97706', '#fbbf24'],
  ['#059669', '#34d399'],
  ['#dc2626', '#f87171'],
  ['#2563eb', '#60a5fa'],
  ['#db2777', '#f472b6'],
  ['#ea580c', '#fb923c'],
];

export interface CharacterAvatarPreset {
  id: string;
  label: string;
  gender: 'male' | 'female';
  avatar: string;
}

/** Generates a visually-improved SVG avatar (gradient background + bold initials). */
export function createInitialsAvatar(name: string): string {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

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

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function createCharacterAvatarSvg({
  bg,
  skin,
  hair,
  shirt,
  accessory = '#ffffff',
}: {
  bg: string;
  skin: string;
  hair: string;
  shirt: string;
  accessory?: string;
}): string {
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

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

const CHARACTER_PRESET_CONFIG: Omit<CharacterAvatarPreset, 'avatar'>[] = [
  { id: 'male-1', label: 'Luca', gender: 'male' },
  { id: 'male-2', label: 'Marco', gender: 'male' },
  { id: 'male-3', label: 'Andrea', gender: 'male' },
  { id: 'female-1', label: 'Sara', gender: 'female' },
  { id: 'female-2', label: 'Giulia', gender: 'female' },
  { id: 'female-3', label: 'Elena', gender: 'female' },
];

const CHARACTER_PRESET_STYLES = [
  { bg: '#1e293b', skin: '#f1c27d', hair: '#1f2937', shirt: '#06b6d4', accessory: '#67e8f9' },
  { bg: '#312e81', skin: '#dba585', hair: '#334155', shirt: '#a855f7', accessory: '#ddd6fe' },
  { bg: '#365314', skin: '#8d5524', hair: '#111827', shirt: '#84cc16', accessory: '#bef264' },
  { bg: '#7c2d12', skin: '#ffdbac', hair: '#7f1d1d', shirt: '#f97316', accessory: '#fdba74' },
  { bg: '#4c1d95', skin: '#e0ac69', hair: '#6d28d9', shirt: '#ec4899', accessory: '#fbcfe8' },
  { bg: '#0f766e', skin: '#c68642', hair: '#155e75', shirt: '#14b8a6', accessory: '#99f6e4' },
] as const;

export function getCharacterAvatarPresets(): CharacterAvatarPreset[] {
  return CHARACTER_PRESET_CONFIG.map((preset, index) => ({
    ...preset,
    avatar: createCharacterAvatarSvg(CHARACTER_PRESET_STYLES[index]),
  }));
}

/** Accepted photo-upload MIME types and their common extensions. */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ACCEPTED_IMAGE_EXTENSIONS = '.jpg,.jpeg,.png,.webp';

/** Maximum raw file size for profile photo uploads (2 MB). */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const SAFE_AVATAR_SOURCE = /^(https?:\/\/|data:image\/|blob:)/i;

export function isSafeAvatarSource(source: string): boolean {
  return SAFE_AVATAR_SOURCE.test(source.trim());
}

/**
 * Validates an image file for upload.
 * Returns an error string or null when the file is acceptable.
 */
export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return 'Formato non supportato. Usa JPG, PNG o WebP.';
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `Il file è troppo grande (max 2 MB). Dimensione attuale: ${(file.size / 1024 / 1024).toFixed(1)} MB.`;
  }
  return null;
}

/**
 * Reads an image file and returns a compressed base64 data URL via the Canvas API.
 * The output is resized to a maximum of 256×256 px and encoded as JPEG at 85% quality,
 * keeping the result well under Firestore's 1 MB document limit.
 */
export function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossibile leggere il file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Impossibile caricare l\'immagine.'));
      img.onload = () => {
        const MAX_DIM = 256;
        const scale = Math.min(MAX_DIM / img.width, MAX_DIM / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas non disponibile.'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
