/**
 * §3.3, §3.7 (T-0352) — paint a layer in steps, smooth it by upscaling.
 * Galactic band and horizon halo = flat-tint steps (latitude slices, height bands). Invisible
 * while exposure kept each step under one byte level; tripled (C-38) → banding. Instead of
 * more steps: paint on a REDUCED canvas, 1 px/step, upscale with browser bilinear smoothing →
 * tint interpolates linearly between step centres (the model's continuous profile).
 * No `ctx.filter`: upscaled `drawImage` smoothing is universal (Firefox too), fewer pixels.
 */

/**
 * Single reduced canvas reused across layers and frames: each layer is copied to screen before
 * the next takes it; allocating per frame costs more than the layer.
 */
let toile: OffscreenCanvasRenderingContext2D | null = null

/**
 * Paints `dessin` on the reduced canvas in SCREEN coordinates (reduction in the canvas
 * transform), then copies it upscaled onto `ctx` with `composition`.
 * `pasPx` = screen height of one step, sets the reduction; step < 1 px has nothing to smooth
 * → full resolution.
 * Returns `false`, nothing painted, outside a browser or without `OffscreenCanvas`: caller
 * paints its steps directly.
 */
export function peintLisse(
  ctx: CanvasRenderingContext2D,
  largeurPx: number,
  hauteurPx: number,
  pasPx: number,
  composition: GlobalCompositeOperation,
  dessin: (reduite: OffscreenCanvasRenderingContext2D) => void,
): boolean {
  if (typeof OffscreenCanvas === 'undefined') return false
  const reduction = Math.min(1, 1 / pasPx)
  // 1 px margin: reduction rounding must leave no unpainted edge.
  const largeur = Math.ceil(largeurPx * reduction) + 1
  const hauteur = Math.ceil(hauteurPx * reduction) + 1
  if (toile === null) toile = new OffscreenCanvas(largeur, hauteur).getContext('2d')
  if (toile === null) return false
  if (toile.canvas.width !== largeur || toile.canvas.height !== hauteur) {
    // Resizing resets all context state, pixels included.
    toile.canvas.width = largeur
    toile.canvas.height = hauteur
  } else {
    toile.setTransform(1, 0, 0, 1, 0, 0)
    toile.clearRect(0, 0, largeur, hauteur)
  }
  toile.globalAlpha = 1
  toile.setTransform(reduction, 0, 0, reduction, 0, 0)
  dessin(toile)

  const compositionInitiale = ctx.globalCompositeOperation
  const lissageInitial = ctx.imageSmoothingEnabled
  ctx.globalCompositeOperation = composition
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(toile.canvas, 0, 0, largeur / reduction, hauteur / reduction)
  ctx.globalCompositeOperation = compositionInitiale
  ctx.imageSmoothingEnabled = lissageInitial
  return true
}
