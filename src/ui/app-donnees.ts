/**
 * §12 — verified catalogues + fate of user input.
 * Catalogue decoded only after packages verified: a corrupt binary never feeds a verdict (§12.2).
 * Export/import always say what they did — mute rejection looks like doing nothing (§12.3).
 */

import { useEffect, useRef, useState } from 'react'
import {
  chargeConstellations,
  chargeEtoiles,
  chargeObjetsCielProfond,
  construitIndexEtoiles,
  demarre,
  demarrageEchoue,
  type EtatDemarrage,
} from '../data/bootstrap.ts'
import { PAQUET_VIDE, type PaquetConstellations } from '../data/constellations.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { Etoile } from '../data/catalog.ts'
import { INDEX_VIDE, type IndexCiel } from '../core/index-ciel.ts'
import {
  enregistrePoidsScoring,
  enregistreProfilActif,
  enregistreSiteActif,
  exporteDonneesUtilisateur,
  ExportInvalideError,
  importeFichierUtilisateur,
  litPoidsScoring,
  litProfilActif,
  litSiteActif,
  type ProfilAEnregistrer,
  type SiteAExporter,
} from '../data/persistence.ts'
import type { PoidsScoring } from '../core/session.ts'
import {
  CRITERES_SCORING,
  type DepartLieu,
  type DepartMateriel,
  type SaisiePoids,
} from './app-saisie.ts'
import { departLieu, departMateriel } from './saisie-persistee.ts'
import { ecritCiblesChoisies, litCiblesChoisies } from '../data/db.ts'
import { poseCiblesChoisies } from './cibles-choisies.ts'
import { appliqueLieuUrl, litPlanUrl } from './plan-url.ts'
import { appliqueMaterielUrl } from './plan-url-materiel.ts'
import { nuitDeLaScene } from './app-saisie.ts'
import { minuitDeLaNuit } from '../core/nuit-datee.ts'
import { vaA } from './scene-etat.ts'

export interface Catalogues {
  readonly etat: EtatDemarrage | null
  readonly objets: readonly ObjetCielProfond[]
  readonly etoiles: readonly Etoile[]
  /** §3.3 — stars' spatial index, built outside render (T-0296). */
  readonly index: IndexCiel
  readonly constellations: PaquetConstellations
  /**
   * T-0297 — true until the load sequence completes (or fails). Without it "0 objet" read while
   * catalogue was still en route.
   */
  readonly enCharge: boolean
}

/**
 * T-0296 — LOAD ORDER IS WHAT THE USER SEES. Deep-sky went first: its arrival triggered night
 * plan, notes, list rows (a task holding the thread, sky empty); stars came 0,6-0,9 s later. Now
 * stars first (index included), then constellations, object catalogue last (feeds the list, which
 * can wait). Nothing parallel: two sliced decodes interleave on one thread, delay first frame.
 */
export interface RecoitCatalogues {
  readonly etat: (etat: EtatDemarrage) => void
  readonly etoiles: (etoiles: readonly Etoile[]) => void
  readonly index: (index: IndexCiel) => void
  readonly constellations: (paquet: PaquetConstellations) => void
  readonly objets: (objets: readonly ObjetCielProfond[]) => void
}

/**
 * The sequence itself, outside React: ORDER is T-0296's deliverable, only checkable by observing
 * it. A test plays it with recording receivers.
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
  const [enCharge, setEnCharge] = useState(true)

  useEffect(() => {
    void chargeCatalogues({
      etat: setEtat,
      etoiles: setEtoiles,
      index: setIndex,
      constellations: setConstellations,
      objets: setObjets,
    })
      .catch(() => setEtat(demarrageEchoue()))
      .finally(() => setEnCharge(false))
  }, [])

  return { etat, objets, etoiles, index, constellations, enCharge }
}

/** What startup reread hands back to input. */
export interface SaisieRestauree {
  readonly lieu: DepartLieu | null
  readonly materiel: DepartMateriel | null
  readonly poids: PoidsScoring | null
  /** Set when reread failed: writes then stay suspended. */
  readonly erreur: string | null
  /** T-0431, T-0448 — input from the URL or onboarding: saved on open, without a gesture. */
  readonly ecritAuDepart: boolean
}

const RIEN_A_RESTAURER: SaisieRestauree = Object.freeze({
  lieu: null,
  materiel: null,
  poids: null,
  erreur: null,
  ecritAuDepart: false,
})

/**
 * T-0431 — plan carried by the URL beats the base's: opening the link on another device resumes
 * night, lieu, matériel, weights, selection there, and saves them. Horizon mask stays the
 * device's.
 * `ouvreEcritures` false when base couldn't be reread: unread data must not be overwritten; URL
 * shows without saving.
 * Once saved, plan leaves the URL: bare outside sharing, reload rereads base (which follows later
 * gestures the URL would ignore). Unsaved, it stays: only copy surviving reload.
 */
export function avecPlanUrl(
  restauree: SaisieRestauree,
  choisies: readonly string[],
  ouvreEcritures: boolean,
): SaisieRestauree {
  const url = litPlanUrl(typeof location === 'undefined' ? '' : location.search)
  poseCiblesChoisies(url.cibles ?? choisies, ouvreEcritures)
  if (ouvreEcritures && url.cibles !== undefined) {
    void ecritCiblesChoisies([...url.cibles]).catch(() => undefined)
  }
  // A night ≠ scène's brings scène to it: else input, which dates the night from scène, loses it
  // on first time-bar gesture.
  if (url.nuitIso !== undefined && url.nuitIso !== nuitDeLaScene()) {
    vaA(minuitDeLaNuit(url.nuitIso).getTime())
  }
  const suivante = {
    ...restauree,
    lieu: appliqueLieuUrl(restauree.lieu, url),
    materiel: appliqueMaterielUrl(restauree.materiel, url, crypto.randomUUID()),
    poids: url.poids ?? restauree.poids,
  }
  const change =
    suivante.lieu !== restauree.lieu ||
    suivante.materiel !== restauree.materiel ||
    suivante.poids !== restauree.poids
  if (ouvreEcritures && typeof history !== 'undefined' && location.search !== '') {
    history.replaceState(history.state, '', `${location.pathname}${location.hash}`)
  }
  return { ...suivante, ecritAuDepart: ouvreEcritures && change }
}

/**
 * §12.3 — saved input, reread before first render. Wait deliberate: hydrating afterwards would
 * compute frame one on defaults, showing a night ≠ saved site's before replacing it. `null` while
 * reread runs. §12.5 — browser without IndexedDB: nothing to restore, app starts anyway (wait only
 * where there is something to wait for).
 */
export function useSaisieRestauree(): SaisieRestauree | null {
  const [restauree, setRestauree] = useState<SaisieRestauree | null>(() =>
    typeof indexedDB === 'undefined' ? avecPlanUrl(RIEN_A_RESTAURER, [], false) : null,
  )

  useEffect(() => {
    if (typeof indexedDB === 'undefined') return
    void (async () => {
      try {
        const [site, profil, choisies, poids] = await Promise.all([
          litSiteActif(),
          litProfilActif(),
          litCiblesChoisies(),
          litPoidsScoring(),
        ])
        // §8.3 — selection goes to the store, not input: ticked, not typed. Set BEFORE first render
        // like lieu, else frame one shows an empty plan before yesterday's.
        setRestauree(
          avecPlanUrl(
            {
              lieu: departLieu(site),
              materiel: departMateriel(profil),
              poids,
              erreur: null,
              ecritAuDepart: false,
            },
            choisies,
            true,
          ),
        )
      } catch (erreur) {
        // Unreadable base must NOT be overwritten: input restarts from defaults but nothing saves
        // while the cause persists — target selection included (store unhydrated, mute in base).
        console.error('Orion — relecture des données enregistrées', erreur)
        setRestauree(
          avecPlanUrl(
            {
              ...RIEN_A_RESTAURER,
              erreur:
                'Données enregistrées illisibles : valeurs par défaut, et plus rien ne s’enregistre. ' +
                `Exportez-les avant de continuer, bouton ${BOUTON_EXPORT} ci-dessus.`,
            },
            [],
            false,
          ),
        )
      }
    })()
  }, [])

  return restauree
}

/** Export button label; failure messages cite it to say where it is. */
export const LIBELLE_EXPORT = 'Exporter mes données (JSON)'
const BOUTON_EXPORT = `« ${LIBELLE_EXPORT} »`

export interface Persistance {
  readonly message: string | null
  /** True: message reports a failure; closed tiroir must signal itself. */
  readonly echec: boolean
  readonly surExport: () => void
  readonly surImport: (fichier: File) => void
}

/** A screen message, and whether it reports a failure or a plain account. */
interface Avis {
  readonly texte: string
  readonly echec: boolean
}

export interface EntreePersistance {
  /** Site as saved; `null` while input isn't chiffrable. */
  readonly site: SiteAExporter | null
  readonly profil: ProfilAEnregistrer | null
  readonly poids: SaisiePoids
  /** Startup reread failure, which suspends writes. */
  readonly erreurRestauration: string | null
  /** T-0431 — lieu opened from URL not yet in base: written at once. */
  readonly ecritAuDepart: boolean
}

/**
 * §12.3 — user input saves as typed, not at export: between exports an eviction or reload
 * destroyed everything in memory (lieu, matériel).
 */
export function usePersistance(entree: EntreePersistance): Persistance {
  const { site, profil, poids } = entree
  const [avis, setAvis] = useState<Avis | null>(() =>
    entree.erreurRestauration === null
      ? null
      : { texte: entree.erreurRestauration, echec: true },
  )
  /**
   * An import replaces lieu and matériel in base but screen holds previous input: saving it would
   * overwrite the import. Writes stop until reload rereads base.
   */
  const [suspendues, setSuspendues] = useState(false)

  /**
   * Records' value is the effect key: rebuilt each render, only content must trigger a write.
   * ponytail: compare by serialisation (horizon mask = 360 numbers, negligible vs the calcul chain
   * this render ran). Upgrade when it matters: mask signature, not debounce (fewer writes lose the
   * last keystrokes).
   */
  const aEcrire =
    entree.erreurRestauration === null && !suspendues
      ? JSON.stringify({ site, profil, poids: poids.poids })
      : null

  /** Startup state (from base, or not yet typed): while input matches it, nothing to write. */
  const auDepart = useRef(entree.ecritAuDepart ? null : aEcrire)

  useEffect(() => {
    if (aEcrire === null || aEcrire === auDepart.current) return
    if (site === null && profil === null) return
    void (async () => {
      try {
        if (site !== null) await enregistreSiteActif(site)
        if (profil !== null) await enregistreProfilActif(profil)
        await enregistrePoidsScoring(poids.poids)
      } catch (erreur) {
        console.error('Orion — enregistrement de la saisie', erreur)
        setAvis({
          texte:
            'Enregistrement impossible : exportez vos données pour ne rien perdre au ' +
            `rechargement, bouton ${BOUTON_EXPORT} ci-dessus.`,
          echec: true,
        })
      }
    })()
  }, [aEcrire])

  async function exporte(): Promise<void> {
    // §12.3 — failing export must say so: silent, data would seem safe.
    try {
      // Same reason as during input: after an import, screen isn't the reference.
      if (!suspendues) {
        if (site !== null) await enregistreSiteActif(site)
        if (profil !== null) await enregistreProfilActif(profil)
      }
      const donnees = await exporteDonneesUtilisateur(poids.poids)
      const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' })
      const lien = document.createElement('a')
      const url = URL.createObjectURL(blob)
      lien.href = url
      lien.download = `orion-${donnees.exporteLe.slice(0, 10)}.json`
      lien.click()
      // Revoked on next task: in Firefox, revoking right after `click()` cancels the requested
      // download.
      setTimeout(() => URL.revokeObjectURL(url))
      setAvis({ texte: `Export écrit dans ${lien.download}.`, echec: false })
    } catch {
      setAvis({
        texte: 'Export impossible : le stockage local n’a pas pu être relu.',
        echec: true,
      })
    }
  }

  async function importe(fichier: File): Promise<void> {
    // Tampered/unreadable file must say why it's refused, not vanish as an unhandled rejection:
    // silent, import looks like doing nothing (§12.3).
    try {
      const poidsImportes = await importeFichierUtilisateur(await fichier.text())
      // Weights aren't in base: without this reset a reimported plan would be reordered by C-15
      // values, not the file's (§8.3).
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
      // Only `importeFichierUtilisateur`'s refusal is written for screen; any other throw is the
      // browser's, in English: goes to console.
      if (!(erreur instanceof ExportInvalideError)) console.error('Orion — import', erreur)
      setAvis({
        texte:
          erreur instanceof ExportInvalideError
            ? `Import abandonné, rien n’a été modifié. ${erreur.message}`
            : 'Import abandonné, rien n’a été modifié : le fichier n’a pas pu être lu.',
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
