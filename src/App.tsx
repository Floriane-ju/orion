/**
 * L'application : un lieu, un matériel, une intention, et la scène au centre.
 *
 * Ce fichier ne dessine plus rien et ne calcule plus rien. Il tient les magasins partagés,
 * appelle la chaîne de calcul (`app-calcul.ts`) et distribue ses sorties aux sept régions de
 * la coque : la barre haute, la scène, le panneau du temps, les cartes du matériel, les autres
 * cartes posées dessus, le panneau latéral et la barre basse.
 *
 * Chaque nombre affiché reste dépliable jusqu'à sa formule, et chaque terme technique porte
 * sa définition au contact (§1.5.2, §10.1) — c'est le contrat, pas la mise en page.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { MS_PAR_JOUR, epoqueAnnee } from './core/horloges.ts'
import { abonneModeReseau, modeReseauCourant, type ModeReseau } from './data/degradation.ts'
import { gaiaCharge } from './data/bootstrap.ts'
import { Coque } from './ui/Coque.tsx'
import { Planetarium } from './ui/Planetarium.tsx'
import { PanneauMateriel } from './ui/PanneauMateriel.tsx'
import { useTrancheScene, type EtatScene } from './ui/scene-etat.ts'
import { ouvreCible, planDeSeance, relieCible, useSeance } from './ui/seance-etat.ts'
import { BarreHaut } from './ui/BarreHaut.tsx'
import { BoutonInfo, PageInfo } from './ui/PageInfo.tsx'
import { PanneauTemps } from './ui/PanneauTemps.tsx'
import { CartesSeance, LateralSeance, NuitSeance } from './ui/RegionSeance.tsx'
import { useSaisieLieu, useSaisieMateriel, useSaisiePoids } from './ui/app-saisie.ts'
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
import { installeEchap, installeFermetureDehors } from './ui/gere-echap.ts'
import { Mention } from './ui/Mention.tsx'


/**
 * T-0056 — la tranche du magasin de scène dont l'application dépend vraiment : l'époque de
 * précession, arrondie au jour. La boucle republie l'instant affiché deux fois par seconde ;
 * l'écart de frontières qu'en tire l'onglet Explorer bouge de 0,014° par an. S'abonner à la
 * journée plutôt qu'à la milliseconde, c'est ne plus rendre l'arbre entier à cette cadence.
 */
export function epoqueAffichee(etat: EtatScene): number {
  return epoqueAnnee(new Date(Math.floor(etat.msAffiche / MS_PAR_JOUR) * MS_PAR_JOUR))
}

/**
 * §11.1 — le mode nuit reste actif au redémarrage.
 *
 * T-0140 — il ne s'allume plus seul au crépuscule : un basculement au rouge pendant la
 * préparation du matériel n'est pas demandé à l'instant où il survient.
 */
function useModeNuit(): [EtatModeNuit, (etat: EtatModeNuit) => void] {
  const [modeNuit, setModeNuit] = useState<EtatModeNuit>(litEtatPersiste)

  useEffect(() => appliqueModeNuit(modeNuit), [modeNuit])

  // T-0375 — la touche vaut partout, pas seulement scène focalisée : c'est un geste d'urgence.
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
 * §12.3 — la saisie enregistrée se relit avant tout le reste. L'application n'a qu'un lieu et
 * qu'un matériel : les monter sur les valeurs par défaut pour les remplacer ensuite ferait
 * calculer, afficher puis jeter une nuit qui n'est pas celle du site enregistré.
 */
export function App() {
  const restauree = useSaisieRestauree()
  // T-0296 — les catalogues se chargent ICI, au-dessus de l'attente : leurs requêtes partent
  // donc en même temps que la lecture de la saisie, pas après elle. Montés dans `AppPrete`,
  // ils ne démarraient qu'une fois la base relue et la première image calculée.
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
  // §12.5 — l'état affiché suit les bascules, il n'est pas figé au démarrage.
  const modeReseau = useSyncExternalStore<ModeReseau>(abonneModeReseau, modeReseauCourant, () => 'EN_LIGNE')

  // T-0189 — une seule écoute d'Échap pour toute l'application : les bulles s'ouvrent sans
  // JavaScript et ne peuvent pas porter la leur (§1.4.13, voir `gere-echap.ts`).
  useEffect(() => installeEchap(document), [])
  useEffect(() => installeFermetureDehors(document), [])
  // T-0362 — la fiche laissée ouverte se rouvre dès que le catalogue est là.
  useEffect(() => relieCible(catalogues.objets), [catalogues.objets])

  // Pointage, temps et intention : les deux magasins que la scène et les panneaux partagent.
  const anneeEpoque = useTrancheScene(epoqueAffichee)
  const seance = useSeance()
  const cibleDuCiel = seance.cible

  const chaine = useChaineCalcul({
    lieu,
    materiel,
    catalogue: catalogues.objets,
    index: catalogues.index,
    // §9.2 — la profondeur est celle d'UNE pose : la photo entière, ou une pose du filé.
    tPoseFileS: planDeSeance(seance).tPoseS.value,
    poids: poids.poids,
  })
  const { calcul, ciel } = chaine
  const [modeNuit, setModeNuit] = useModeNuit()

  // §6.4 — filtrer la liste filtre la scène : les cibles écartées s'y estompent au lieu d'y
  // rester indistinctes. `null` tant qu'aucun filtre n'est actif.
  const enAvant = useCiblesEnAvant(catalogues.objets, chaine.etatsCibles)

  // §12.3 — le lieu et le matériel s'enregistrent au fil de la saisie, et l'export les
  // emporte tels qu'ils sont à l'écran.
  const persistance = usePersistance({
    site: siteAEnregistrer(lieu, chaine.masque),
    profil: profilAEnregistrer(materiel),
    poids,
    erreurRestauration: restauree.erreur,
  })

  const gaia = catalogues.etat === null ? false : gaiaCharge(catalogues.etat.catalogues)

  const topbar = (
    <BarreHaut
      site={chaine.site}
      gaiaCharge={gaia}
    />
  )

  const panneauMateriel = (
    <PanneauMateriel
      {...materiel}
      {...(calcul.ok
        ? {
            lectures: {
              optique: calcul.optique,
              suivi: calcul.suivi,
              poseNpf: calcul.poseNpf,
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
   * T-0149 — la scène ne dépend que du CIEL. Un matériel incomplet lui retire son cadre et
   * son aperçu de filé — `profilsCadre` est alors vide, `materielFile` absent — mais
   * pas les étoiles, le sol ni le fond de ciel : ce sont des grandeurs du lieu.
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
      constellations={catalogues.constellations}
      profils={chaine.profilsCadre}
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
    <Coque
      topbar={topbar}
      scene={scene}
      temps={<PanneauTemps surNuitIso={lieu.surNuitIso} />}
      materiel={panneauMateriel}
      cartes={
        <>
          <CartesSeance {...regions} />
          <div className="coque-nuit">
            <BoutonModeNuit etat={modeNuit} surChangement={setModeNuit} />
            <BoutonInfo persistance={persistance} />
          </div>
        </>
      }
      lateral={<LateralSeance {...regions} />}
      nuit={<NuitSeance {...regions} />}
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
  )
}
