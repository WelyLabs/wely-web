import { describe, it, expect, vi, afterEach } from 'vitest';
import { downscalePhoto, fittedSize, PHOTO_MAX_SIDE, PhotoResizer } from './photo-resize';

describe('fittedSize', () => {
  it('fittedSize_shouldBringTheLongestSideDown_keepingProportions', () => {
    expect(fittedSize(4032, 3024)).toEqual({ width: PHOTO_MAX_SIDE, height: 1200 });
    expect(fittedSize(3024, 4032)).toEqual({ width: 1200, height: PHOTO_MAX_SIDE });
  });

  it('fittedSize_shouldNeverEnlarge', () => {
    expect(fittedSize(320, 240)).toEqual({ width: 320, height: 240 });
  });
});

describe('downscalePhoto', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('downscalePhoto_shouldReadTheOrientation_andEncodeAJpegAtTheFittedSize', async () => {
    const close = vi.fn();
    const createImageBitmap = vi.fn().mockResolvedValue({ width: 4000, height: 3000, close });
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const drawImage = vi.fn();
    const canvas = {
      width: 0, height: 0,
      getContext: () => ({ fillStyle: '', fillRect: vi.fn(), drawImage }),
      toBlob: (done: (blob: Blob) => void, type: string) => done(new Blob(['x'], { type }))
    };
    vi.spyOn(document, 'createElement').mockReturnValueOnce(canvas as unknown as HTMLCanvasElement);

    const blob = await downscalePhoto(new Blob(['photo']));

    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), { imageOrientation: 'from-image' });
    expect([canvas.width, canvas.height]).toEqual([1600, 1200]);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
    expect(blob.type).toBe('image/jpeg');
    expect(close).toHaveBeenCalled();
  });

  it('downscalePhoto_shouldReject_whenTheBrowserCannotReadTheFile', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('HEIC')));

    await expect(downscalePhoto(new Blob(['heic']))).rejects.toThrow('HEIC');
  });
});

describe('PhotoResizer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('downscale_shouldDelegateToDownscalePhoto', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('unreadable')));

    await expect(new PhotoResizer().downscale(new Blob(['x']))).rejects.toThrow('unreadable');
  });

  it('downscale_shouldPassTheLongestSideOn', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4000, height: 3000, close: vi.fn() }));
    const canvas = {
      width: 0, height: 0,
      getContext: () => ({ fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }),
      toBlob: (done: (blob: Blob) => void, type: string) => done(new Blob(['x'], { type }))
    };
    vi.spyOn(document, 'createElement').mockReturnValueOnce(canvas as unknown as HTMLCanvasElement);

    await new PhotoResizer().downscale(new Blob(['photo']), 2000);

    expect([canvas.width, canvas.height]).toEqual([2000, 1500]);
  });
});
