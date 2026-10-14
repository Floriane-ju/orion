/**
 * T-0409 — de jour, l'interface passe en clair ; le mode nuit l'emporte toujours (§11.1).
 *
 * L'instant est celui de la SCÈNE, pas de l'horloge : l'interface se lit comme le ciel
 * qu'elle commande, et une nuit affichée à 21 h sous un panneau blanc se contredisait. Scène
 * réglée sur maintenant, c'est l'heure réelle — et la scène avance d'elle-même au fil du temps.
 * Le lieu est celui saisi.
 *
 * La palette claire ne fait que poser un attribut : la feuille l'écarte d'elle-même quand le
 * mode nuit est actif, si bien qu'aucun ordre d'application ne peut faire fuir du clair
 * dans le rouge. Le canevas ne lit pas la feuille et garde son rendu.
 */

import { useEffect, useMemo } from 'react'
import { dansLeDomaineDesSeries, type Site } from '../core/ephem.ts'
import { soleilLeve } from '../core/nuit.ts'
import { MS_PAR_MINUTE } from '../core/unites.ts'
import { siteChiffrable } from './app-calcul.ts'
import { useTrancheScene, type EtatScene } from './scene-etat.ts'

export function appliqueJourClair(clair: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.jourClair = String(clair)
}

/**
 * Le Soleil du lieu est-il levé à cet instant — `null` quand rien ne se tranche (lieu
 * illisible, date hors des séries). Mémorisé à la minute : la boucle publie l'instant à
 * chaque image, et deux recherches de lever par image coûteraient pour rien.
 */
export function lecteurJourClair(lieu: Site): (ms: number) => boolean | null {
  let minute: number | null = null
  let clair: boolean | null = null
  return (ms) => {
    const courante = Math.floor(ms / MS_PAR_MINUTE)
    if (courante === minute) return clair
    minute = courante
    const date = new Date(courante * MS_PAR_MINUTE)
    clair = siteChiffrable(lieu) && dansLeDomaineDesSeries(date) ? soleilLeve(lieu, date) : null
    return clair
  }
}

export function useJourClair(site: Site): void {
  const { latitudeDeg, longitudeDeg, altitudeM } = site
  const selecteur = useMemo(() => {
    const lit = lecteurJourClair({ latitudeDeg, longitudeDeg, altitudeM })
    return (etat: EtatScene) => lit(etat.msAffiche)
  }, [latitudeDeg, longitudeDeg, altitudeM])
  // Un booléen : l'application ne se re-rend qu'au lever et au coucher, pas à chaque minute.
  const clair = useTrancheScene(selecteur)
  useEffect(() => {
    if (clair !== null) appliqueJourClair(clair)
  }, [clair])
}
