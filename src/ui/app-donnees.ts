/**
 * §12 — les catalogues vérifiés et le sort de ce que l'utilisateur a saisi.
 *
 * Le catalogue n'est décodé qu'une fois les paquets vérifiés : un binaire corrompu ne doit
 * jamais alimenter un verdict (§12.2). L'export et l'import, eux, disent toujours ce qu'ils
 * ont fait — un rejet muet aurait l'air de ne rien faire (§12.3).
 */

import { useEffect, useRef, useState } from 'react'
import {
  chargeConstellations,
  chargeEtoiles,
  chargeObjetsCielProfond,
  construitIndexEtoiles,
  demarre,
  type EtatDemarrage,
} from '../data/bootstrap.ts'
import { PAQUET_VIDE, type PaquetConstellations } from '../data/constellations.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { Etoile } from '../data/catalog.ts'
import { INDEX_VIDE, type IndexCiel } from '../core/index-ciel.ts'
import {
  demandePersistance,
  enregistreProfilActif,
  enregistreSiteActif,
  exporteDonneesUtilisateur,
  importeFichierUtilisateur,
  litPointsMasqueActif,
  litProfilActif,
  litSiteActif,
  type ProfilAEnregistrer,
  type SiteAExporter,
} from '../data/persistence.ts'
import type { PointMasque } from '../core/site.ts'
import {
  CRITERES_SCORING,
  type DepartLieu,
  type DepartMateriel,
  type SaisiePoids,
} from './app-saisie.ts'
import { departLieu, departMateriel } from './saisie-persistee.ts'

export interface Catalogues {
  readonly etat: EtatDemarrage | null
  readonly objets: readonly ObjetCielProfond[]
  readonly etoiles: readonly Etoile[]
  /** §3.3 — l'index spatial des étoiles, construit hors du rendu (T-0296). */
  readonly index: IndexCiel
  readonly constellations: PaquetConstellations
}

/**
 * T-0296 — L'ORDRE DE CHARGEMENT EST CE QUE L'UTILISATEUR VOIT.
 *
 * Le ciel profond passait en premier : son arrivée déclenche le plan de la nuit, les notes et
 * les lignes de la liste, et cette tâche-là tenait le fil pendant que le ciel restait vide. Les
 * étoiles arrivaient après, six à neuf dixièmes de seconde plus tard.
 *
 * Les étoiles passent donc devant, index compris, puis les constellations qui complètent la
 * carte, et le catalogue d'objets en dernier — c'est lui qui alimente la liste, et la liste
 * peut attendre que le ciel soit peint. Rien n'est parallélisé : deux décodages tranchés
 * s'entrelaceraient sur le même fil, et la première image reculerait d'autant.
 */
export interface RecoitCatalogues {
  readonly etat: (etat: EtatDemarrage) => void
  readonly etoiles: (etoiles: readonly Etoile[]) => void
  readonly index: (index: IndexCiel) => void
  readonly constellations: (paquet: PaquetConstellations) => void
  readonly objets: (objets: readonly ObjetCielProfond[]) => void
}

/**
 * La séquence elle-même, hors de React : c'est l'ORDRE qui est le livrable de T-0296, et un
 * ordre ne se vérifie qu'en l'observant. Un test le joue avec des réceptions qui enregistrent.
 */
export async function chargeCatalogues(recoit: RecoitCatalogues): Promise<void> {
  recoit.etat(await demarre())
  const lues = await chargeEtoiles()
  recoit.etoiles(lues)
  recoit.index(await construitIndexEtoiles(lues))
  recoit.constellations(await chargeConstellations())
  recoit.objets(await chargeObjetsCielProfond())
}

export function useCatalogues(): Catalogues {
  const [etat, setEtat] = useState<EtatDemarrage | null>(null)
  const [objets, setObjets] = useState<readonly ObjetCielProfond[]>([])
  const [etoiles, setEtoiles] = useState<readonly Etoile[]>([])
  const [index, setIndex] = useState<IndexCiel>(INDEX_VIDE)
  const [constellations, setConstellations] = useState<PaquetConstellations>(PAQUET_VIDE)

  useEffect(() => {
    void chargeCatalogues({
      etat: setEtat,
      etoiles: setEtoiles,
      index: setIndex,
      constellations: setConstellations,
      objets: setObjets,
    })
  }, [])

  return { etat, objets, etoiles, index, constellations }
}

/** Ce que la relecture du démarrage rend à la saisie. */
export interface SaisieRestauree {
  readonly lieu: DepartLieu | null
  readonly materiel: DepartMateriel | null
  /** Renseigné quand la relecture a échoué : les écritures restent alors suspendues. */
  readonly erreur: string | null
}

const RIEN_A_RESTAURER: SaisieRestauree = Object.freeze({
  lieu: null,
  materiel: null,
  erreur: null,
})

/**
 * §12.3 — la saisie enregistrée, relue avant le premier rendu.
 *
 * L'attente est volontaire : hydrater après coup ferait calculer la première image sur les
 * valeurs par défaut, donc afficher une nuit qui n'est pas celle du site enregistré, avant
 * de la remplacer. `null` tant que la relecture court.
 *
 * §12.5 — un navigateur sans IndexedDB n'a rien à restaurer, et l'application démarre
 * quand même : attendre n'a de sens que là où il y a quelque chose à attendre.
 */
export function useSaisieRestauree(): SaisieRestauree | null {
  const [restauree, setRestauree] = useState<SaisieRestauree | null>(() =>
    typeof indexedDB === 'undefined' ? RIEN_A_RESTAURER : null,
  )

  useEffect(() => {
    if (typeof indexedDB === 'undefined') return
    void (async () => {
      try {
        const [site, profil] = await Promise.all([litSiteActif(), litProfilActif()])
        setRestauree({ lieu: departLieu(site), materiel: departMateriel(profil), erreur: null })
      } catch (erreur) {
        // Ce qu'on n'a pas su lire ne doit surtout pas être écrasé : la saisie repart des
        // valeurs par défaut, mais plus rien ne s'enregistre tant que la cause est là.
        setRestauree({
          lieu: null,
          materiel: null,
          erreur:
            'Données enregistrées illisibles : valeurs par défaut, et plus rien ne s’enregistre. ' +
            'Exportez avant de continuer. ' +
            (erreur instanceof Error ? erreur.message : 'Cause inconnue.'),
        })
      }
    })()
  }, [])

  return restauree
}

export interface Persistance {
  readonly message: string | null
  /** Vrai quand le message rapporte un échec : le tiroir fermé doit alors se signaler. */
  readonly echec: boolean
  readonly surExport: () => void
  readonly surImport: (fichier: File) => void
}

/** Un message à l'écran, et s'il rapporte un échec ou un simple compte rendu. */
interface Avis {
  readonly texte: string
  readonly echec: boolean
}

export interface EntreePersistance {
  /** Le site tel qu'il s'enregistre ; `null` tant que la saisie n'est pas chiffrable. */
  readonly site: SiteAExporter | null
  readonly profil: ProfilAEnregistrer | null
  readonly surMasqueImporte: (points: readonly PointMasque[]) => void
  readonly poids: SaisiePoids
  /** L'échec de relecture du démarrage, qui suspend les écritures. */
  readonly erreurRestauration: string | null
}

/**
 * §12.3 — ce que l'utilisateur saisit s'enregistre au fil de la saisie, pas au moment de
 * l'export : entre deux exports, une éviction ou un simple rechargement détruisait tout ce
 * qui vivait en mémoire — le lieu, le matériel, le masque relevé à la main.
 */
export function usePersistance(entree: EntreePersistance): Persistance {
  const { site, profil, poids, surMasqueImporte } = entree
  const [avis, setAvis] = useState<Avis | null>(() =>
    entree.erreurRestauration === null
      ? null
      : { texte: entree.erreurRestauration, echec: true },
  )
  const persistanceDemandee = useRef(false)
  /**
   * Un import remplace en base le lieu et le matériel, mais l'écran, lui, tient encore la
   * saisie précédente : continuer à l'enregistrer réécrirait par-dessus ce qui vient d'être
   * importé. Les écritures s'arrêtent donc jusqu'au rechargement, qui relit la base.
   */
  const [suspendues, setSuspendues] = useState(false)

  /**
   * §12.3 — la demande de mode persistant, une seule fois, après une première action utile :
   * une demande non motivée au chargement est refusée par réflexe. Le résultat s'affiche,
   * comme le critère d'acceptation l'exige.
   */
  async function demandeLaPersistanceUneFois(): Promise<void> {
    if (persistanceDemandee.current) return
    persistanceDemandee.current = true
    const accorde = await demandePersistance()
    setAvis({
      texte: accorde
        ? 'Vos données sont conservées durablement.'
        : 'Le navigateur peut effacer vos données : installez l’application ou gardez un export.',
      echec: false,
    })
  }

  /**
   * La valeur des enregistrements sert de clé d'effet : ils sont reconstruits à chaque rendu,
   * et seul leur contenu doit déclencher une écriture.
   *
   * ponytail: une comparaison par sérialisation, dont le masque d'horizon fait 360 nombres.
   * C'est négligeable devant la chaîne de calcul que le même rendu vient de traverser ; le
   * jour où ça compte, c'est une signature du masque qu'il faut, pas un débounce — écrire
   * moins souvent, c'est perdre les dernières frappes.
   */
  const aEcrire =
    entree.erreurRestauration === null && !suspendues ? JSON.stringify({ site, profil }) : null

  /**
   * L'état du démarrage : il sort de la base, ou n'a pas encore été saisi. Tant que rien ne
   * s'en écarte, il n'y a rien à écrire — et surtout rien qui justifie de demander le mode
   * persistant, qu'une demande au chargement fait refuser par réflexe (§12.3).
   */
  const auDepart = useRef(aEcrire)

  useEffect(() => {
    if (aEcrire === null || aEcrire === auDepart.current) return
    if (site === null && profil === null) return
    void (async () => {
      try {
        if (site !== null) await enregistreSiteActif(site)
        if (profil !== null) await enregistreProfilActif(profil)
        // La saisie enregistrée EST la première action utile : c'est elle qu'une éviction
        // détruirait, pas l'export qui viendra peut-être.
        await demandeLaPersistanceUneFois()
      } catch (erreur) {
        setAvis({
          texte:
            'Enregistrement impossible : exportez pour ne rien perdre au rechargement. ' +
            (erreur instanceof Error ? erreur.message : 'Cause inconnue.'),
          echec: true,
        })
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aEcrire])

  async function exporte(): Promise<void> {
    // Même raison qu'au fil de la saisie : après un import, l'écran n'est plus la référence.
    if (!suspendues) {
      if (site !== null) await enregistreSiteActif(site)
      if (profil !== null) await enregistreProfilActif(profil)
    }
    const donnees = await exporteDonneesUtilisateur(poids.poids)
    const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' })
    const lien = document.createElement('a')
    lien.href = URL.createObjectURL(blob)
    lien.download = `orion-${donnees.exporteLe.slice(0, 10)}.json`
    lien.click()
    URL.revokeObjectURL(lien.href)
    setAvis({ texte: `Export écrit dans ${lien.download}.`, echec: false })
    await demandeLaPersistanceUneFois()
  }

  async function importe(fichier: File): Promise<void> {
    // Un fichier retouché ou illisible doit dire pourquoi il est refusé, pas disparaître
    // en rejet non géré : sans message, l'import a l'air de ne rien faire (§12.3).
    try {
      const poidsImportes = await importeFichierUtilisateur(await fichier.text())
      // Le masque restauré doit revenir à l'écran : il commande les créneaux (§8.1).
      surMasqueImporte(await litPointsMasqueActif())
      // Les poids ne vivent pas en base : sans cette remise, un plan réimporté serait
      // réordonné par les valeurs C-15 plutôt que par celles du fichier (§8.3).
      if (poidsImportes !== null) {
        for (const critere of CRITERES_SCORING) poids.surPoids(critere, poidsImportes[critere])
      }
      setSuspendues(true)
      setAvis({
        texte:
          'Import terminé. Rechargez la page pour l’utiliser.',
        echec: false,
      })
    } catch (erreur) {
      setAvis({
        texte:
          erreur instanceof Error
            ? `Import abandonné, rien n’a été modifié. ${erreur.message}`
            : 'Import abandonné, rien n’a été modifié : cause inconnue.',
        echec: true,
      })
    }
  }

  return {
    message: avis?.texte ?? null,
    echec: avis?.echec ?? false,
    surExport: () => void exporte(),
    surImport: (fichier) => void importe(fichier),
  }
}
