/**
 * Export a canvas to a PNG file download via `canvas.toBlob()` — fully
 * client-side, no server round-trip (a hard constraint for this project).
 *
 * TODO(milestone-2): add a resolution/scale parameter for HD export gated behind
 * the paid tier (compose the poster at a larger size before calling this).
 */
export function exportPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to export canvas to PNG'));
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke on the next tick so the download has a chance to start.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, 'image/png');
  });
}
