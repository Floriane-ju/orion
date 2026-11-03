/**
 * App root: lieu, matériel, intention, scène at centre. Draws/computes nothing: holds shared
 * stores, calls the compute chain (`app-calcul.ts`), dispatches outputs to 7 shell regions (top
 * bar, scène, time panel, matériel cards, cards stacked on them, side panel, bottom bar).
 * Every displayed number unfolds to its formula; every technical term carries its definition
 * (§1.5.2, §10.1) — contract, not layout.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { MS_PAR_JOUR, epoqueAnnee } from './core/horloges.ts'
import { abonneModeReseau, modeReseauCourant, type ModeReseau } from './data/degradation.ts'
import { gaiaCharge } from './data/bootstrap.ts'
import { Coque } from './ui/Coque.tsx'
import { Planetarium } from './ui/Planetarium.tsx'
import { PanneauMateriel } from './ui/PanneauMateriel.tsx'
import { useTrancheScene, type EtatScene } from './ui/scene-etat.ts'
import { cibleSeance, ouvreCible, relieCible, useTrancheSeance } from './ui/seance-etat.ts'
import { BarreHaut } from './ui/BarreHaut.tsx'
import { BoutonInfo, PageInfo } from './ui/PageInfo.tsx'
import { PanneauTemps } from './ui/PanneauTemps.tsx'
import { Visee } from './ui/Visee.tsx'
import { CartesSeance, LateralSeance, LectureSeance, NuitSeance } from './ui/RegionSeance.tsx'
import { useSaisieLieu, useSaisieMateriel, useSaisiePoids } from './ui/app-saisie.ts'
import { BoutonPartage } from './ui/BoutonPartage.tsx'
import {
  useCatalogues,
  usePersistance,
  useSaisieRestauree,
  type Catalogues,
  type SaisieRestauree,
} from './ui/app-donnees.ts'
import { profilAEnregistrer, siteAEnregistrer } from './ui/saisie-persistee.ts'
import { useChaineCalcul } from './ui/app-calcul.ts'
import { useCiblesEnAvant } from './ui/cibles-en-avant.ts'
import {
  appliqueModeNuit,
  BoutonModeNuit,
  cibleDeSaisie,
  toucheBasculeModeNuit,
} from './ui/ModeNuit.tsx'
import { litEtatPersiste, type EtatModeNuit } from './data/mode-nuit.ts'
import { JourClair } from './ui/jour-clair.ts'
import { installeEchap, installeFermetureDehors } from './ui/gere-echap.ts'
import { Mention } from './ui/Mention.tsx'


/**
 * T-0056 — store slice the app really depends on: precession epoch, rounded to the day. Loop
 * republishes displayed instant 2×/s; frontières offset (Explorer tab) moves 0,014°/yr →
 * per-day subscription stops full-tree renders at that rate.
 */
export function epoqueAffichee(etat: EtatScene): number {
  return epoqueAnnee(new Date(Math.floor(etat.msAffiche / MS_PAR_JOUR) * MS_PAR_JOUR))
}

/**
 * §11.1 — mode nuit persists across restarts. T-0140: no auto-switch at crépuscule (a red
 * switch mid matériel prep is unwanted).
 */
function useModeNuit(): [EtatModeNuit, (etat: EtatModeNuit) => void] {
  const [modeNuit, setModeNuit] = useState<EtatModeNuit>(litEtatPersiste)

  useEffect(() => appliqueModeNuit(modeNuit), [modeNuit])

  // T-0375 — key works everywhere, not only with scène focused: emergency gesture.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      const modificateur = e.ctrlKey || e.metaKey || e.altKey
      if (!toucheBasculeModeNuit(e.key, modificateur, cibleDeSaisie(e.target))) return
      setModeNuit((etat) => ({ ...etat, actif: !etat.actif }))
    }
    document.addEventListener('keydown', surTouche)
    return () => document.removeEventListener('keydown', surTouche)
  }, [])

  return [modeNuit, setModeNuit]
}

/**
 * §12.3 — saved input read back first. One lieu, one matériel: mounting on defaults then
 * replacing would compute, display, discard a night not the saved site's.
 */
export function App() {
  const restauree = useSaisieRestauree()
  // T-0296 — catalogues load HERE, above the wait: requests start with the saved-input read.
  // In `AppPrete` they started only after DB read + first frame.
  const catalogues = useCatalogues()
  if (restauree === null)
    return (
      <p className="etat" role="status" aria-live="polite">
        Lecture des données enregistrées…
      </p>
    )
  return <AppPrete restauree={restauree} catalogues={catalogues} />
}

function AppPrete({
  restauree,
  catalogues,
}: {
  readonly restauree: SaisieRestauree
  readonly catalogues: Catalogues
}) {
  const lieu = useSaisieLieu(restauree.lieu)
  const materiel = useSaisieMateriel(restauree.materiel)
  const poids = useSaisiePoids(restauree.poids)
  // §12.5 — displayed state follows toggles, not frozen at startup.
  const modeReseau = useSyncExternalStore<ModeReseau>(abonneModeReseau, modeReseauCourant, () => 'EN_LIGNE')

  // T-0189 — single app-wide Échap listener: bubbles open without JS can't carry their own
  // (§1.4.13, see `gere-echap.ts`).
  useEffect(() => installeEchap(document), [])
  useEffect(() => installeFermetureDehors(document), [])
  // T-0362 — a fiche left open reopens once the catalogue is there.
  useEffect(() => relieCible(catalogues.objets), [catalogues.objets])

  // Pointage, time, intention: the two stores shared by scène and panels.
  const anneeEpoque = useTrancheScene(epoqueAffichee)
  // T-0398 — cible only: Panorama pose max changes each visée move; subscribing to whole séance
  // re-rendered the app under the gesture.
  const cibleDuCiel = useTrancheSeance(cibleSeance)

  const chaine = useChaineCalcul({
    lieu,
    materiel,
    catalogue: catalogues.objets,
    index: catalogues.index,
    poids: poids.poids,
  })
  const { calcul, ciel } = chaine
  const [modeNuit, setModeNuit] = useModeNuit()

  // §6.4 — list filter filters the scène: excluded cibles fade, not left indistinct. `null` =
  // no filter.
  const enAvant = useCiblesEnAvant(catalogues.objets, chaine.etatsCibles)
  // On "Mon plan", scène keeps in full light only what the plan photographs.
  const ciblesPlan = chaine.plan?.etapes.map((e) => e.objet) ?? null

  // §12.3 — lieu and matériel saved as typed; export carries them as on screen.
  const persistance = usePersistance({
    site: siteAEnregistrer(lieu, chaine.masque),
    profil: profilAEnregistrer(materiel),
    poids,
    erreurRestauration: restauree.erreur,
    ecritAuDepart: restauree.planDeLUrl,
  })

  const gaia = catalogues.etat === null ? false : gaiaCharge(catalogues.etat.catalogues)

  const panneauMateriel = (
    <PanneauMateriel
      {...materiel}
      {...(calcul.ok
        ? {
            lectures: {
              suivi: calcul.suivi,
              zeroSysteme: calcul.zeroSysteme,
              iso: calcul.iso,
              ...(calcul.noteRecadrage === undefined
                ? {}
                : { noteRecadrage: calcul.noteRecadrage }),
            },
          }
        : { erreur: calcul.erreur })}
    />
  )

  /**
   * T-0149 — scène depends on CIEL only. Incomplete matériel drops cadre + filé preview
   * (`profilsCadre` empty, `materielFile` absent), not stars/sol/fond de ciel (lieu quantities).
   */
  const scene = ciel.ok ? (
    <Planetarium
      site={chaine.site}
      masque={chaine.masque}
      horizonEnAttente={chaine.horizonEnAttente}
      etoiles={catalogues.etoiles}
      index={catalogues.index}
      objets={catalogues.objets}
      enAvant={enAvant}
      ciblesPlan={ciblesPlan}
      constellations={catalogues.constellations}
      profils={chaine.profilsCadre}
      zoom={chaine.zoom}
      sbCiel={ciel.ciel.sbCiel.value}
      gaiaCharge={gaia}
      modeNuit={modeNuit.actif}
      etoilesEnCharge={catalogues.enCharge && catalogues.etoiles.length === 0}
      {...(chaine.materielFile === null ? {} : { file: chaine.materielFile })}
      surSelectionObjet={ouvreCible}
    />
  ) : (
    <Mention ton="erreur">{ciel.erreur}</Mention>
  )

  const regions = {
    chaine,
    lieu,
    materiel,
    catalogue: catalogues.objets,
    catalogueEnCharge: catalogues.enCharge,
    etoiles: catalogues.etoiles,
    constellations: catalogues.constellations,
    cibleDuCiel: cibleDuCiel ?? null,
    gaiaCharge: gaia,
    epoqueAnnee: anneeEpoque,
  }

  return (
    <>
      <JourClair site={chaine.site} />
      <Coque
        topbar={<BarreHaut />}
        temps={
          <PanneauTemps
            surNuitIso={lieu.surNuitIso}
            frise={
              <NuitSeance {...regions} />
            }
            lecture={<LectureSeance {...regions} />}
          />
        }
        scene={scene}
        cartes={
          <>
            <CartesSeance {...regions} cartesMateriel={panneauMateriel} />
            <div className="coque-nuit">
              <BoutonPartage plan={{ ...lieu, materiel, poids: poids.poids }} />
              <BoutonModeNuit etat={modeNuit} surChangement={setModeNuit} />
              <BoutonInfo persistance={persistance} />
            </div>
          </>
        }
        lateral={<LateralSeance {...regions} />}
        visee={<Visee site={chaine.site} gaiaCharge={gaia} />}
        page={
          <PageInfo
            etat={catalogues.etat}
            modeReseau={modeReseau}
            persistance={persistance}
            poids={poids}
            profondeurMag={chaine.index.profondeurMag}
            sbCiel={ciel.ok ? ciel.ciel.sbCiel.value : null}
            modeNuit={modeNuit.actif}
            {...(ciel.ok ? { seuils: ciel.seuils } : {})}
          />
        }
      />
    </>
  )
}
