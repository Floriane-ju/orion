/**
 * §12.1, §12.2, §12.3 — Démarrage de l'application.
 *
 * Deux vérifications, dans cet ordre : intégrité des catalogues, état du stockage. Aucune ne
 * doit produire un écran blanc ni une erreur technique brute : chaque échec a une cause nommée
 * et une conduite à tenir — une mesure sans conduite à tenir n'est pas une vérification.
 */

import { ecritPaquet, litPaquet } from './db.ts'
import type { IntegritePaquet, ManifestePaquet } from './catalog.ts'
import { verifieIntegrite } from './catalog.ts'
import { decodeEtoilesPas, type Etoile } from './catalog.ts'
import { decodeObjetsPas, type ObjetCielProfond } from './deepsky.ts'
import {
  PAQUET_VIDE,
  decodeConstellations,
  type PaquetConstellations,
} from './constellations.ts'
import { modeReseauCourant, type ModeReseau } from './degradation.ts'
import { etatStockage, type EtatStockage } from './persistence.ts'
import { parTranches } from '../core/tranches.ts'
import { construitIndexPas, type IndexCiel } from '../core/index-ciel.ts'

export const CHEMIN_MANIFESTE = '/data/manifest.json'

export interface EtatPaquet {
  readonly manifeste: ManifestePaquet
  readonly integrite: IntegritePaquet
}

export interface EtatCatalogues {
  readonly paquets: readonly EtatPaquet[]
  readonly manifesteLu: boolean
  /** Conduite à tenir quand un paquet obligatoire manque ou est corrompu. */
  readonly cause?: string
}

async function chargeManifeste(): Promise<readonly ManifestePaquet[] | null> {
  try {
    const reponse = await fetch(CHEMIN_MANIFESTE)
    if (!reponse.ok) return null
    return (await reponse.json()) as ManifestePaquet[]
  } catch {
    return null
  }
}

/**
 * Récupère un paquet depuis IndexedDB ; à défaut le télécharge, vérifie sa somme de
 * contrôle et le range. Un paquet dont l'empreinte ne correspond pas n'est jamais servi.
 */
async function resoudPaquet(manifeste: ManifestePaquet): Promise<EtatPaquet> {
  const local = await litPaquet(manifeste.nom)
  const integriteLocale = await verifieIntegrite(local, manifeste)
  if (integriteLocale === 'OK') return { manifeste, integrite: 'OK' }

  if (modeReseauCourant() === 'HORS_LIGNE') {
    return { manifeste, integrite: integriteLocale }
  }

  try {
    const reponse = await fetch(`/data/${manifeste.nom}-${manifeste.version}.bin`)
    if (!reponse.ok) return { manifeste, integrite: integriteLocale }
    const donnees = await reponse.arrayBuffer()
    const integrite = await verifieIntegrite(donnees, manifeste)
    if (integrite !== 'OK') return { manifeste, integrite: 'CORROMPU' }
    await ecritPaquet({ nom: manifeste.nom, version: manifeste.version, donnees })
    return { manifeste, integrite: 'OK' }
  } catch {
    return { manifeste, integrite: integriteLocale }
  }
}

export async function verifieCatalogues(): Promise<EtatCatalogues> {
  const manifestes = await chargeManifeste()
  if (manifestes === null) {
    return {
      paquets: [],
      manifesteLu: false,
      cause:
        'Catalogues introuvables : rechargez la page une fois connecté ' +
        '(en développement : `pnpm data:build`).',
    }
  }

  const paquets = await Promise.all(manifestes.map(resoudPaquet))
  const manquants = paquets.filter(
    (p) => p.manifeste.obligatoire && p.integrite !== 'OK',
  )
  if (manquants.length === 0) return { paquets, manifesteLu: true }

  const noms = manquants.map((p) => p.manifeste.nom).join(', ')
  const horsLigne = modeReseauCourant() === 'HORS_LIGNE'
  return {
    paquets,
    manifesteLu: true,
    cause: horsLigne
      ? `Catalogues indisponibles hors connexion (${noms}) : ils se rechargeront au retour ` +
        'du réseau.'
      : `Catalogues indisponibles (${noms}) : rechargez la page ` +
        '(en développement : `pnpm data:build`).',
  }
}

export const PAQUET_OBJETS = 'openngc'
export const PAQUET_NOMS_OBJETS = 'openngc-noms'

/** §6.1 — Sharpless et Barnard, ce qu'OpenNGC ne décrit pas du domaine grand champ. */
export const PAQUET_OBJETS_COMPLEMENT = 'deepsky'
export const PAQUET_NOMS_OBJETS_COMPLEMENT = 'deepsky-noms'

async function decodePaireDeObjets(
  nomEnregistrements: string,
  nomChaines: string,
): Promise<readonly ObjetCielProfond[]> {
  const [enregistrements, chaines] = await Promise.all([
    litPaquet(nomEnregistrements),
    litPaquet(nomChaines),
  ])
  if (enregistrements === null || chaines === null) return []
  return parTranches(decodeObjetsPas({ enregistrements, chaines }))
}

/**
 * Catalogue d'objets du ciel profond décodé depuis les paquets rangés par `demarre()`.
 * Retourne une liste vide quand les paquets manquent : la cause est déjà nommée par
 * `verifieCatalogues()`, et les moteurs §6 et §7 restent utilisables sur une cible saisie
 * à la main (§12.5).
 *
 * Deux paquets, un seul catalogue : OpenNGC porte le ciel profond classique, `deepsky`
 * les entrées Sharpless et Barnard qu'il ignore. La construction garantit qu'ils ne se
 * chevauchent pas — les doublons NGC/IC sont écartés à la source, pas ici (§6.1).
 */
export async function chargeObjetsCielProfond(): Promise<readonly ObjetCielProfond[]> {
  // T-0296 — les deux lectures partent ensemble, mais les deux décodages se suivent : tranchés,
  // ils s'entrelaceraient, et deux tranches concurrentes tiennent le fil deux fois plus long.
  const ngc = await decodePaireDeObjets(PAQUET_OBJETS, PAQUET_NOMS_OBJETS)
  const complement = await decodePaireDeObjets(
    PAQUET_OBJETS_COMPLEMENT,
    PAQUET_NOMS_OBJETS_COMPLEMENT,
  )
  return [...ngc, ...complement]
}

export const PAQUET_ETOILES = 'hyg'

/**
 * Catalogue d'étoiles décodé depuis le paquet HYG. Il sert au cheminement et à la carte de
 * pointage (§8.4) ; la liste est vide quand le paquet manque, et l'absence est déjà nommée
 * par `verifieCatalogues()`.
 */
export async function chargeEtoiles(): Promise<readonly Etoile[]> {
  const paquet = await litPaquet(PAQUET_ETOILES)
  return paquet === null ? [] : parTranches(decodeEtoilesPas(paquet))
}

export const PAQUET_CONSTELLATIONS = 'constellations'

/**
 * §3.4 — figures, astérismes et frontières. Un paquet absent laisse le planétarium
 * afficher les étoiles : les couches de repérage manquent, le ciel reste juste.
 */
export async function chargeConstellations(): Promise<PaquetConstellations> {
  const paquet = await litPaquet(PAQUET_CONSTELLATIONS)
  return paquet === null ? PAQUET_VIDE : decodeConstellations(paquet)
}

/**
 * T-0296 — l'index de §3.3, construit par tranches parce que c'est l'étage le plus cher du
 * démarrage. Il est assemblé ici, avec les catalogues, et non dans la chaîne de calcul : un
 * `useMemo` ne sait pas rendre la main, et l'index n'a aucune raison d'attendre un rendu.
 */
export async function construitIndexEtoiles(
  etoiles: readonly Etoile[],
): Promise<IndexCiel> {
  return parTranches(construitIndexPas(etoiles))
}

/** §3.3 — le paquet Gaia est différé : sa présence conditionne le plancher de zoom. */
export const PAQUET_GAIA = 'gaia'

export function gaiaCharge(catalogues: EtatCatalogues): boolean {
  return catalogues.paquets.some(
    (p) => p.manifeste.nom === PAQUET_GAIA && p.integrite === 'OK',
  )
}

export interface EtatDemarrage {
  readonly modeReseau: ModeReseau
  readonly catalogues: EtatCatalogues
  readonly stockage: EtatStockage
}

export async function demarre(): Promise<EtatDemarrage> {
  const [catalogues, stockage] = await Promise.all([verifieCatalogues(), etatStockage()])
  return {
    modeReseau: modeReseauCourant(),
    catalogues,
    stockage,
  }
}
