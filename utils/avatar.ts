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

/** Accepted photo-upload MIME types and their common extensions. */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ACCEPTED_IMAGE_EXTENSIONS = '.jpg,.jpeg,.png,.webp';

/** Maximum raw file size for profile photo uploads (2 MB). */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

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
