/**
 * T-0310 — §12.5: a throw inside a rAF callback escapes every React error boundary; the loop
 * re-armed before painting replayed it at the frame rate, sky frozen, nothing said.
 * Pure wrapper so the policy (retry, then stop once) is testable without a canvas.
 */

/** Wraps one frame: retries `reprisesMax` consecutive throws, then calls `arrete` ONCE. */
export function gardeImage(
  peins: (ts: number) => void,
  reprisesMax: number,
  arrete: (erreur: unknown) => void,
): (ts: number) => void {
  let echecs = 0
  let arretee = false
  return (ts) => {
    if (arretee) return
    try {
      peins(ts)
      echecs = 0
    } catch (erreur: unknown) {
      echecs += 1
      // Debug data, not a sentence for the screen (§12.4: nothing sent).
      console.error('Orion — image du ciel interrompue', erreur)
      if (echecs > reprisesMax) {
        arretee = true
        arrete(erreur)
      }
    }
  }
}
