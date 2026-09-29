/**
 * §3.3, §3.7 (T-0352) — peindre une couche en marches, puis la lisser en l'agrandissant.
 *
 * La bande galactique et le halo d'horizon se peignent en marches de teinte unie : tranches de
 * latitude, paliers de hauteur. Tant que l'exposition gardait chaque marche sous un niveau
 * d'octet, elles ne se voyaient pas ; triplée (C-38), elles se lisent en stries. Plutôt que de
 * multiplier les marches, la couche se peint sur un canevas RÉDUIT, à un pixel par marche,
 * puis s'agrandit avec le lissage bilinéaire du navigateur : la teinte s'interpole alors
 * linéairement d'un centre de marche au suivant — le profil continu que le modèle décrit.
 *
 * Pas de `ctx.filter` : le lissage d'un `drawImage` agrandi est universel, Firefox compris, et
 * coûte moins de pixels à peindre, pas plus.
 */

/**
 * Un seul canevas réduit, réemployé d'une couche et d'une image à l'autre : chaque couche est
 * recopiée à l'écran avant que la suivante ne le reprenne, et l'allouer à chaque image
 * coûterait plus que la couche elle-même.
 */
let toile: OffscreenCanvasRenderingContext2D | null = null

/**
 * Peint `dessin` sur le canevas réduit, en coordonnées ÉCRAN — la réduction est portée par la
 * transformation du canevas —, puis le recopie agrandi sur `ctx` avec `composition`.
 *
 * `pasPx` est la hauteur écran d'une marche : c'est elle qui fixe la réduction. Une marche plus
 * fine qu'un pixel n'a rien à lisser, et la couche est alors peinte à pleine résolution.
 *
 * Renvoie `false` sans rien peindre hors navigateur, ou sans `OffscreenCanvas` : l'appelant
 * peint alors ses marches directement.
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
  // Un pixel de marge : l'arrondi de la réduction ne doit pas laisser de bord non peint.
  const largeur = Math.ceil(largeurPx * reduction) + 1
  const hauteur = Math.ceil(hauteurPx * reduction) + 1
  if (toile === null) toile = new OffscreenCanvas(largeur, hauteur).getContext('2d')
  if (toile === null) return false
  if (toile.canvas.width !== largeur || toile.canvas.height !== hauteur) {
    // Redimensionner remet tout l'état du contexte à zéro, pixels compris.
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
