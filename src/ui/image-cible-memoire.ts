/**
 * §6.4 — session memory of target images, hook reading it, top-of-list prefetch.
 * Why: list renders up to 200 rows, refilters per keystroke; one IndexedDB read per row per
 * render would kill search. Image read once stays in memory → synchronous row render.
 * `blob:` URLs never revoked (instant return). Volume bounded by targets CONSULTED.
 *
 * PREFETCH LIVES IN THE MODULE, NOT THE PANEL
 *   Side panel unmounts on close; a component-held queue would lose downloads right after a
 *   search. Here the queue survives: bytes end in IndexedDB + memory.
 *   Throughput capped by registry, not list length: public service answers 429 on bursts.
 *
 * ponytail: unbounded memory. Add an LRU cap if sessions consult thousands of targets
 * (a session preparer opens a few dozen).
 */

import { useEffect, useState } from 'react'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { ImageStockee } from '../data/db.ts'
import { modeReseauCourant } from '../data/degradation.ts'
import { imageEnCache, resoudImage } from '../data/imagerie-cible.ts'
import { I } from '../registry/imagerie.ts'
import { creeAbonnes } from './abonnes.ts'

export interface ImageAffichable {
  readonly image: ImageStockee
  /** `blob:` URL — spares `img-src` from naming a third-party host. */
  readonly url: string
}

/** `CACHE` never touches network (list scroll requests nothing). `RESEAU`: fiche, target chosen. */
export type PorteeImage = 'CACHE' | 'RESEAU'

/** Images found. Positives only: absence has a different validity duration. */
const trouvees = new Map<string, ImageAffichable>()

/** Targets known not cached. Scope `CACHE` only. */
const absentesDuCache = new Set<string>()

/**
 * Mounted thumbnails, woken when prefetch delivers an image; else one that saw absence
 * (`absentesDuCache`) never asks again before remount. Same pattern as [[seance-etat]].
 */
const abonnes = creeAbonnes()

/** Store subscription: React render and DOM-less tests. */
export const abonneImages = abonnes.abonne

function retient(image: ImageStockee): ImageAffichable {
  const connue = trouvees.get(image.designation)
  if (connue !== undefined) return connue
  const affichable: ImageAffichable = { image, url: URL.createObjectURL(image.octets) }
  trouvees.set(image.designation, affichable)
  absentesDuCache.delete(image.designation)
  // After the write: a woken subscriber re-reads memory.
  abonnes.notifie()
  return affichable
}

/** What memory knows, no request. `undefined` = unknown yet. */
function dejaSu(designation: string, portee: PorteeImage): ImageAffichable | null | undefined {
  const trouvee = trouvees.get(designation)
  if (trouvee !== undefined) return trouvee
  if (portee === 'CACHE' && absentesDuCache.has(designation)) return null
  return undefined
}

/**
 * Target image, `null` until/unless there is one. No error state exposed: no image = complete
 * (§12.5); "not yet" vs "never" would make a missing nicety look like an outage.
 */
export function useImageCible(
  objet: ObjetCielProfond | null,
  portee: PorteeImage,
): ImageAffichable | null {
  const designation = objet?.designation ?? ''
  const [affichable, setAffichable] = useState<ImageAffichable | null>(
    () => dejaSu(designation, portee) ?? null,
  )

  useEffect(() => {
    if (objet === null) {
      setAffichable(null)
      return
    }

    const su = dejaSu(objet.designation, portee)
    if (su !== undefined) {
      setAffichable(su)
      return
    }

    let vivant = true
    setAffichable(null)
    const demande = portee === 'CACHE' ? imageEnCache(objet.designation) : resoudImage(objet)
    // Failed cache read = absent image: fiche stays readable.
    void demande.catch(() => null).then((image) => {
      if (image === null) {
        if (portee === 'CACHE') absentesDuCache.add(objet.designation)
        return
      }
      const retenue = retient(image)
      if (vivant) setAffichable(retenue)
    })
    return () => {
      vivant = false
    }
  }, [objet, designation, portee])

  // Prefetched image arriving after the row concluded absence: this subscription shows it.
  useEffect(() => {
    if (designation === '') return
    return abonneImages(() => {
      const su = dejaSu(designation, portee)
      if (su !== undefined && su !== null) setAffichable(su)
    })
  }, [designation, portee])

  return affichable
}

/** Still to download. Emptied, never recreated: consumers hold the reference. */
const enAttente: ObjetCielProfond[] = []
let consommateurs = 0
let dernierJeu: string | null = null

/**
 * Prefetch generation, one per consumer; `oublieImages` expires it so a consumer stuck on a
 * never-answered request stops counting. Without it the stuck slot is never freed, rate gate
 * never reopens, prefetch stops.
 */
let generation = 0

async function consomme(): Promise<void> {
  const mienne = generation
  try {
    for (;;) {
      const objet = enAttente.shift()
      if (objet === undefined) return
      // Failure not signalled: row stays complete without image (§12.5).
      const image = await resoudImage(objet).catch(() => null)
      // Image arriving after forget belongs to a memory that no longer exists.
      if (mienne !== generation) return
      if (image !== null) retient(image)
    }
  } finally {
    if (mienne === generation) consommateurs -= 1
  }
}

/**
 * §6.4 — request images of a result list's top, once.
 * Previous set ABANDONED, not finished (list changed); requests already sent still land.
 * Offline: nothing sent nor recorded → network return can re-ask the same set (§12.5).
 */
export function prechargeVignettes(objets: readonly ObjetCielProfond[]): void {
  const jeu = objets.map((o) => o.designation).join(' ')
  // List recomposes every displayed minute with same objects: guard stops a burst per 60 s.
  if (jeu === dernierJeu) return
  if (modeReseauCourant() === 'HORS_LIGNE') return
  dernierJeu = jeu

  enAttente.length = 0
  for (const objet of objets.slice(0, I('VIGNETTES_PRECHARGEES_MAX'))) {
    if (!trouvees.has(objet.designation)) enAttente.push(objet)
  }

  while (consommateurs < I('PRECHARGE_SIMULTANEE_MAX') && enAttente.length > consommateurs) {
    consommateurs += 1
    void consomme()
  }
}

/** Clears memory — tests only (module shared between assertions). */
export function oublieImages(): void {
  for (const { url } of trouvees.values()) URL.revokeObjectURL(url)
  trouvees.clear()
  absentesDuCache.clear()
  abonnes.vide()
  enAttente.length = 0
  dernierJeu = null
  generation += 1
  consommateurs = 0
}
