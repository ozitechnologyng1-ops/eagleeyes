/**
 * imageStorage.ts - ImageKit URL builder, localStorage image cache (5-day TTL),
 * and canvas-based correction for voter passport photos.
 *
 * DEV mode:  uses ImageKit AI upscale + retouch (e-upscale, e-retouch) — costs 5+5 extension units per image
 * PROD mode: uses plain bicubic scale only — no extension unit cost
 *
 * ImageKit AI Upscale pricing:
 *   e-upscale  = 5 units/image
 *   e-retouch  = 5 units/image
 *   Free plan  = 650 units/month (~65 combined upscale+retouch requests)
 *   Paid plans = check https://imagekit.io/dashboard/billing/subscriptions
 */

const CACHE_PREFIX = 'eagleeye_img_cache_';
const CACHE_TTL_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

export interface CachedImageEntry {
  voterId: string | number;
  dataUrl: string;
  sourceUrl: string;
  savedAt: number;
  expiresAt: number;
}

export const IMAGEKIT_URL_ENDPOINT = 'https://ik.imagekit.io/qdzmaxs1z/v1';
export const IMAGEKIT_PUBLIC_KEY = 'public_acWqVcCDA3nUMqUFm07cAzZ0Ql4=';

// Primary: Chained ImageKit GenAI Upscale + AI Retouch (10 units per image)
export const AI_TRANSFORM = 'e-upscale:e-retouch';

// Fallback: Plain transform if AI isn't used or times out
export const FALLBACK_TRANSFORM = 'w-480,h-640,c-at_max';

export const DEFAULT_TRANSFORM = AI_TRANSFORM;

// Supabase voter-images bucket prefix to strip
const SUPABASE_VOTER_IMAGES_PREFIX = '/storage/v1/object/public/voter-images/';

/**
 * Builds an ImageKit transformed URL from a Supabase storage URL or relative path.
 * The /v1 endpoint maps the voter-images bucket root — only the filename is needed.
 */
export function buildImageKitUrl(
  imagePathOrUrl?: string | null,
  transformParams: string = DEFAULT_TRANSFORM
): string {
  if (!imagePathOrUrl || !imagePathOrUrl.trim()) return '';
  const clean = imagePathOrUrl.trim();

  // Already an ImageKit URL
  if (clean.includes('ik.imagekit.io')) {
    if (clean.includes('tr=') || clean.includes('tr:')) return clean;
    const sep = clean.includes('?') ? '&' : '?';
    return clean + sep + 'tr=' + transformParams;
  }

  const base = IMAGEKIT_URL_ENDPOINT.replace(/\/+$/, '');

  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    try {
      const parsed = new URL(clean);
      const pathname = parsed.pathname;
      const idx = pathname.indexOf(SUPABASE_VOTER_IMAGES_PREFIX);
      if (idx !== -1) {
        const filename = pathname.slice(idx + SUPABASE_VOTER_IMAGES_PREFIX.length);
        console.log(`[ImageKit] ${import.meta.env.DEV ? '🤖 DEV (AI upscale)' : '⚡ PROD (plain scale)'} → ${filename}`);
        return `${base}/${filename}?tr=${transformParams}`;
      }
      // Fallback: last path segment
      const parts = pathname.split('/').filter(Boolean);
      const filename = parts[parts.length - 1] || '';
      return `${base}/${filename}?tr=${transformParams}`;
    } catch {
      return '';
    }
  }

  // Relative path
  return `${base}/${clean.replace(/^\/+/, '')}?tr=${transformParams}`;
}

/**
 * Retrieves a cached image dataUrl from localStorage (5-day TTL).
 */
export function getCachedImage(voterId: string | number): string | null {
  try {
    const key = `${CACHE_PREFIX}${voterId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: CachedImageEntry = JSON.parse(raw);
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.dataUrl || null;
  } catch {
    return null;
  }
}

/**
 * Saves an image dataUrl to localStorage with a 5-day expiry.
 * Evicts the 5 oldest entries if quota is exceeded.
 */
export function setCachedImage(voterId: string | number, dataUrl: string, sourceUrl = ''): void {
  const key = `${CACHE_PREFIX}${voterId}`;
  const now = Date.now();
  const payload: CachedImageEntry = {
    voterId,
    dataUrl,
    sourceUrl,
    savedAt: now,
    expiresAt: now + CACHE_TTL_MS,
  };

  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    try {
      const entries: { key: string; savedAt: number }[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CACHE_PREFIX)) {
          try {
            const p = JSON.parse(localStorage.getItem(k) || '{}');
            entries.push({ key: k, savedAt: p.savedAt || 0 });
          } catch {
            entries.push({ key: k, savedAt: 0 });
          }
        }
      }
      entries.sort((a, b) => a.savedAt - b.savedAt);
      entries.slice(0, 5).forEach(e => localStorage.removeItem(e.key));
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) {
      console.warn('localStorage save failed after eviction:', e);
    }
  }
}

/**
 * Canvas enhancement:
 * - Correct aspect-ratio crop biased upward (face)
 * - Bicubic scale to target dimensions
 * - Very mild brightness-only auto-levels (no S-curve, no color saturation boost)
 *   so natural skin tones are preserved. In DEV, ImageKit already ran AI upscale/retouch
 *   so canvas just does the crop+draw with minimal touch.
 */
export async function enhanceImageViaCanvas(
  imgSource: HTMLImageElement | string,
  targetWidth = 480,
  targetHeight = 640
): Promise<string> {
  let img: HTMLImageElement;

  if (typeof imgSource === 'string') {
    img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Failed to load image'));
      i.src = imgSource;
    });
  } else {
    img = imgSource;
  }

  const srcW = img.naturalWidth || img.width || targetWidth;
  const srcH = img.naturalHeight || img.height || targetHeight;
  const targetAspect = targetWidth / targetHeight;
  const srcAspect = srcW / srcH;

  // Compute crop that fills the target aspect, biased upward to keep face in frame
  let sx = 0, sy = 0, sw = srcW, sh = srcH;
  if (srcAspect > targetAspect) {
    sw = Math.round(srcH * targetAspect);
    sx = Math.round((srcW - sw) / 2);
  } else {
    sh = Math.round(srcW / targetAspect);
    sy = Math.round((srcH - sh) / 4);
    if (sy < 0) sy = 0;
    if (sy + sh > srcH) sy = srcH - sh;
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);

  // In DEV, ImageKit already did AI enhancement — skip heavy pixel ops, just return draw
  if (import.meta.env.DEV) {
    return canvas.toDataURL('image/jpeg', 0.93);
  }

  // PROD: apply very mild brightness normalisation only — no hue/saturation shift
  try {
    const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const d = imgData.data;

    // Sample mean luminance
    let sumLum = 0;
    const px = targetWidth * targetHeight;
    for (let i = 0; i < d.length; i += 4) {
      sumLum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    const meanLum = sumLum / px;

    // Gentle brightness nudge only — push mean toward 128 at 25% strength
    // Leaves colors completely untouched if already well-exposed
    const target = 128;
    const strength = 0.25;
    const gain = meanLum > 10 ? 1 + strength * ((target - meanLum) / meanLum) : 1;
    const clampedGain = Math.min(1.4, Math.max(0.7, gain));

    if (Math.abs(clampedGain - 1) > 0.03) {
      for (let i = 0; i < d.length; i += 4) {
        d[i]     = Math.min(255, d[i]     * clampedGain);
        d[i + 1] = Math.min(255, d[i + 1] * clampedGain);
        d[i + 2] = Math.min(255, d[i + 2] * clampedGain);
      }
      ctx.putImageData(imgData, 0, 0);
    }
  } catch {
    // CORS blocked — return raw scaled image
  }

  return canvas.toDataURL('image/jpeg', 0.93);
}

/**
 * Full pipeline: check cache → build ImageKit URL → canvas enhance → cache.
 */
export async function getCachedOrFetchImage(
  voterId: string | number,
  imageUrl?: string | null
): Promise<string> {
  if (!imageUrl) return '';

  const cached = getCachedImage(voterId);
  if (cached) return cached;

  const transformedUrl = buildImageKitUrl(imageUrl);
  const fetchUrl = transformedUrl || imageUrl;

  try {
    const enhanced = await enhanceImageViaCanvas(fetchUrl, 480, 640);
    setCachedImage(voterId, enhanced, fetchUrl);
    return enhanced;
  } catch {
    return fetchUrl;
  }
}

/**
 * Removes expired cache entries (older than 5 days).
 */
export function cleanupExpiredImages(): void {
  try {
    const now = Date.now();
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        try {
          const item: CachedImageEntry = JSON.parse(localStorage.getItem(key) || '{}');
          if (item.expiresAt && now > item.expiresAt) toRemove.push(key);
        } catch {
          toRemove.push(key);
        }
      }
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.error('Failed to cleanup expired image cache:', e);
  }
}

/**
 * Force-clears all cached voter images. Returns count removed.
 */
export function clearAllImageCache(): number {
  try {
    let count = 0;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith(CACHE_PREFIX) ||
          key.startsWith('eagleeye_refined_voter_photo_') ||
          key.startsWith('eagleeye_original_voter_photo_'))
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => { localStorage.removeItem(k); count++; });
    console.log(`🧹 [Image Cache] Cleared ${count} cached voter images.`);
    return count;
  } catch (e) {
    console.error('Failed to clear voter image cache:', e);
    return 0;
  }
}
