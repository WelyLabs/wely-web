import { Injectable } from '@angular/core';

/** The longest side wely-chat keeps: sending more only costs the upload. */
export const PHOTO_MAX_SIDE = 1600;
const PHOTO_QUALITY = 0.85;

/** A photo's size once scaled down to fit `maxSide`, never up, proportions kept. */
export function fittedSize(width: number, height: number, maxSide = PHOTO_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Draws the photo on a canvas and re-encodes it as JPEG: a phone's 6 MB picture leaves at a few
 * hundred kilobytes, and the EXIF orientation is applied here, since the server's decoder ignores
 * it. Rejects for a format the browser cannot decode (HEIC outside Safari, for one).
 */
export async function downscalePhoto(file: Blob, maxSide = PHOTO_MAX_SIDE): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const { width, height } = fittedSize(bitmap.width, bitmap.height, maxSide);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('No 2D canvas');
    }
    // JPEG has no transparency: a transparent PNG gets a white ground, as on the server.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode the photo')), 'image/jpeg', PHOTO_QUALITY));
  } finally {
    bitmap.close();
  }
}

/** The same, as a service: a page injects it, and a test replaces the canvas work. */
@Injectable({ providedIn: 'root' })
export class PhotoResizer {
  downscale(file: Blob, maxSide = PHOTO_MAX_SIDE): Promise<Blob> {
    return downscalePhoto(file, maxSide);
  }
}
