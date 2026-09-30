/**
 * §6.4 — la mémoire de session des images de cibles, le crochet qui la lit, et le
 * préchargement du haut de liste.
 *
 * Elle existe pour une raison de coût, pas de confort. La liste du catalogue rend jusqu'à
 * deux cents lignes et se refiltre à chaque frappe : une lecture d'IndexedDB par ligne et par
 * rendu rendrait la recherche inutilisable. Une image lue une fois reste donc adressable en
 * mémoire pour la durée de la session, et le rendu d'une ligne redevient synchrone.
 *
 * Les adresses `blob:` ne sont pas révoquées : elles vivent aussi longtemps que la session, et
 * c'est ce qui rend instantané le retour sur une cible déjà vue. Le volume est borné par le
 * nombre de cibles CONSULTÉES, pas par la taille du catalogue.
 *
 * LE PRÉCHARGEMENT VIT DANS LE MODULE, PAS DANS LE PANNEAU
 *   Le panneau latéral démonte son contenu quand il se ferme. Une file portée par un composant
 *   perdrait donc ses téléchargements au moment où l'utilisateur range le panneau — exactement
 *   le geste qui suit une recherche. Ici, la file survit au démontage : les octets finissent en
 *   IndexedDB et en mémoire, et la réouverture ne demande plus rien.
 *
 *   Le débit est plafonné par le registre, pas par la longueur de la liste : le motif du
 *   plafond est le 429 d'un service public, et une salve par caractère frappé le déclencherait.
 *
 * ponytail: mémoire non bornée, à la vue près. Un plafond LRU s'imposerait le jour où une
 * session consulterait des milliers de cibles — ce n'est pas le geste d'un préparateur de
 * séance, qui en ouvre quelques dizaines.
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
  /** Adresse `blob:` — c'est elle qui dispense `img-src` de nommer un hôte tiers. */
  readonly url: string
}

/**
 * `CACHE` ne touche jamais au réseau : c'est la portée de la liste, où le défilement ne doit
 * rien demander. `RESEAU` est celle de la fiche, où la cible a été choisie.
 */
export type PorteeImage = 'CACHE' | 'RESEAU'

/** Les images trouvées. Positives seulement : une absence n'a pas la même durée de validité. */
const trouvees = new Map<string, ImageAffichable>()

/** Les cibles dont on sait qu'elles ne sont pas en cache. Ne concerne que la portée `CACHE`. */
const absentesDuCache = new Set<string>()

/**
 * Les vignettes montées, à réveiller quand une image arrive par le préchargement.
 *
 * Sans cela le préchargement n'aurait aucun effet visible avant un remontage : une vignette qui
 * a constaté l'absence s'est inscrite dans `absentesDuCache` et ne redemande plus jamais.
 * Même patron que [[seance-etat]] — un magasin de module, lisible sans DOM.
 */
const abonnes = creeAbonnes()

/** L'abonnement du magasin : le rendu React l'emploie, les tests aussi — sans DOM. */
export const abonneImages = abonnes.abonne

function retient(image: ImageStockee): ImageAffichable {
  const connue = trouvees.get(image.designation)
  if (connue !== undefined) return connue
  const affichable: ImageAffichable = { image, url: URL.createObjectURL(image.octets) }
  trouvees.set(image.designation, affichable)
  absentesDuCache.delete(image.designation)
  // Après l'écriture, jamais avant : un abonné réveillé relit la mémoire.
  abonnes.notifie()
  return affichable
}

/** Ce que la mémoire sait déjà, sans rien demander. `undefined` : elle ne sait pas encore. */
function dejaSu(designation: string, portee: PorteeImage): ImageAffichable | null | undefined {
  const trouvee = trouvees.get(designation)
  if (trouvee !== undefined) return trouvee
  if (portee === 'CACHE' && absentesDuCache.has(designation)) return null
  return undefined
}

/**
 * L'image d'une cible, ou `null` tant qu'il n'y en a pas — et il se peut qu'il n'y en ait
 * jamais. Aucun état d'erreur n'est exposé : une cible sans image est une cible complète
 * (§12.5), et distinguer « pas encore » de « jamais » à l'écran ferait passer un agrément
 * visuel manquant pour une panne.
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
    // Une lecture de cache qui échoue vaut une image absente : la fiche reste lisible sans elle.
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

  // Une image préchargée arrive après que la ligne a conclu à l'absence : c'est cet abonnement
  // qui la fait paraître, sans que la ligne redemande quoi que ce soit.
  useEffect(() => {
    if (designation === '') return
    return abonneImages(() => {
      const su = dejaSu(designation, portee)
      if (su !== undefined && su !== null) setAffichable(su)
    })
  }, [designation, portee])

  return affichable
}

/** Ce qui reste à télécharger. Vidé, jamais recréé : les consommateurs tiennent la référence. */
const enAttente: ObjetCielProfond[] = []
let consommateurs = 0
let dernierJeu: string | null = null

/**
 * La génération du préchargement. Un consommateur porte la sienne : `oublieImages` la périme,
 * et celui qui est resté suspendu sur une requête sans réponse cesse d'appartenir au compte.
 *
 * Sans ce jeton, un consommateur bloqué garde sa place jusqu'à la fin du processus, et le
 * portillon de débit ne rouvre plus jamais — plus rien ne se précharge ensuite.
 */
let generation = 0

async function consomme(): Promise<void> {
  const mienne = generation
  try {
    for (;;) {
      const objet = enAttente.shift()
      if (objet === undefined) return
      // Un échec ne se signale pas : la ligne reste complète sans son image (§12.5).
      const image = await resoudImage(objet).catch(() => null)
      // Une image arrivée après l'oubli appartient à une mémoire qui n'existe plus.
      if (mienne !== generation) return
      if (image !== null) retient(image)
    }
  } finally {
    if (mienne === generation) consommateurs -= 1
  }
}

/**
 * §6.4 — demande les images du haut d'une liste de résultats, une fois.
 *
 * Le jeu précédent est ABANDONNÉ, pas achevé : la liste a changé, ses images ne sont plus
 * celles qu'on regarde. Les requêtes déjà parties, elles, servent quand même — leur résultat
 * est rangé.
 *
 * Hors ligne, rien ne part et rien n'est retenu comme fait : le retour du réseau doit pouvoir
 * redemander le même jeu (§12.5).
 */
export function prechargeVignettes(objets: readonly ObjetCielProfond[]): void {
  const jeu = objets.map((o) => o.designation).join(' ')
  // La liste se recompose à chaque minute affichée sans changer d'objets : sans cette garde,
  // une salve partirait toutes les soixante secondes pour la même liste.
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

/** Vide la mémoire — réservé aux tests, qui partagent le module d'une assertion à l'autre. */
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
