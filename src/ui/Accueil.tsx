/**
 * §1.5.1, §12.3, T-0448 — onboarding: lieu and matériel asked before the first calcul.
 * Mounted above `AppPrete`: no Planétarium, no `usePersistance`, so defaults are never written
 * behind the user's back.
 * Real input hooks, not a parallel form: what is typed here is what `AppPrete` starts from.
 * `ChampsSite` not reused: needs `masque` + `cielRefus`, shows an altitude not yet read on relief.
 * Monture stays « Pas de suivi » until chosen: inventing a mount falsifies every pose (T-0280).
 */

import { useEffect, useId, useRef, useState } from 'react'
import { DOMAINES } from '../registry/domains.ts'
import { nombreLibre } from '../registry/ecriture.ts'
import {
  ETAPES,
  etapeValide,
  saisieDePassage,
  type EtapeAccueil,
  type SaisieAccueil,
} from './accueil-calcul.ts'
import {
  useSaisieLieu,
  useSaisieMateriel,
  type SaisieLieu,
  type SaisieMateriel,
} from './app-saisie.ts'
import { ChampDomaine } from './ChampDomaine.tsx'
import { ChoixLieu } from './ChoixLieu.tsx'
import { Mention } from './Mention.tsx'
import { PanneauBoitier } from './PanneauBoitier.tsx'
import { ChampsSuivi } from './PanneauMateriel.tsx'
import { PanneauParc } from './PanneauParc.tsx'

const TITRE: Readonly<Record<EtapeAccueil, string>> = Object.freeze({
  bienvenue: 'Bienvenue sur Orion',
  lieu: 'Lieu d’observation',
  materiel: 'Ton matériel',
})

/** Empty required field shows no refusal (`ChampDomaine`): the disabled button must say why. */
const MANQUE: Readonly<Record<EtapeAccueil, string>> = Object.freeze({
  bienvenue: '',
  lieu: 'Indique la latitude, la longitude et le Bortle pour continuer.',
  materiel: 'Indique la résolution de ton boîtier pour continuer.',
})

function EtapeLieu({ lieu }: { readonly lieu: SaisieLieu }) {
  return (
    <>
      <ChoixLieu
        latitude={lieu.latitude}
        longitude={lieu.longitude}
        surLieu={(latitude, longitude) => {
          lieu.surLatitude(latitude)
          lieu.surLongitude(longitude)
        }}
      />
      <div className="champs paire">
        <ChampDomaine
          domaine="latitude_deg"
          glisse
          cle="latitude"
          valeur={lieu.latitude}
          surValeur={lieu.surLatitude}
          requis
        />
        <ChampDomaine
          domaine="longitude_deg"
          glisse
          cle="longitude"
          valeur={lieu.longitude}
          surValeur={lieu.surLongitude}
          requis
        />
      </div>
      <div className="champs">
        <ChampDomaine
          domaine="bortle_declare"
          glisse
          cle="bortle"
          valeur={lieu.bortle}
          surValeur={lieu.surBortle}
          inputMode="numeric"
          requis
        />
      </div>
      <Mention ton="etat">
        Le Bortle décrit la pollution lumineuse de ton ciel, de{' '}
        {nombreLibre(DOMAINES.bortle_declare.min)} (ciel noir) à{' '}
        {nombreLibre(DOMAINES.bortle_declare.max)} (centre-ville).
      </Mention>
    </>
  )
}

function EtapeMateriel({ materiel }: { readonly materiel: SaisieMateriel }) {
  return (
    <>
      <PanneauBoitier
        essentiel
        boitierId={materiel.boitierId}
        surBoitierId={materiel.surBoitierId}
        boitier={materiel.boitier}
        surBoitier={materiel.surBoitier}
        iso={materiel.iso}
        surIso={materiel.surIso}
        capteurMode={materiel.capteurMode}
        surCapteurMode={materiel.surCapteurMode}
        suivi={<ChampsSuivi {...materiel} />}
      />
      <PanneauParc
        objectifs={materiel.objectifs}
        surObjectifs={materiel.surObjectifs}
        objectifId={materiel.objectifId}
        surObjectifId={materiel.surObjectifId}
      />
    </>
  )
}

export function CorpsEtape({
  etape,
  lieu,
  materiel,
}: {
  readonly etape: EtapeAccueil
  readonly lieu: SaisieLieu
  readonly materiel: SaisieMateriel
}) {
  if (etape === 'lieu') return <EtapeLieu lieu={lieu} />
  if (etape === 'materiel') return <EtapeMateriel materiel={materiel} />
  return (
    <>
      <p>
        Orion prépare ta séance d’observation : quelles cibles, à quelle heure, avec quelle pose,
        combien d’images, et comment les trouver.
      </p>
      <p>Dis-nous d’où tu observes et avec quel matériel : tout le reste se calcule à partir de là.</p>
    </>
  )
}

export function Accueil({ surFin }: { readonly surFin: (saisie: SaisieAccueil) => void }) {
  const lieu = useSaisieLieu(null)
  const materiel = useSaisieMateriel(null)
  const [rang, setRang] = useState(0)
  const titre = useRef<HTMLHeadingElement>(null)
  const idTitre = useId()
  const idRang = useId()
  const etape = ETAPES[rang] ?? 'bienvenue'
  const derniere = rang === ETAPES.length - 1
  const valide = etapeValide(etape, lieu, materiel)

  // Step change replaces the content: focus and screen reader must follow it.
  useEffect(() => titre.current?.focus(), [rang])

  return (
    <main className="accueil">
      <h1>Orion</h1>
      <section aria-labelledby={idTitre}>
        <h2 ref={titre} id={idTitre} tabIndex={-1} aria-describedby={idRang}>
          {TITRE[etape]}
        </h2>
        <p className="etat" id={idRang}>
          Étape {rang + 1} sur {ETAPES.length}
        </p>
        <CorpsEtape etape={etape} lieu={lieu} materiel={materiel} />
        {!valide && (
          <Mention ton="etat" role="status">
            {MANQUE[etape]}
          </Mention>
        )}
        <div className="accueil-actions">
          {rang > 0 && (
            <button type="button" className="accueil-retour" onClick={() => setRang(rang - 1)}>
              Retour
            </button>
          )}
          <button type="button" onClick={() => surFin(saisieDePassage(etape, lieu))}>
            Passer
          </button>
          <button
            type="button"
            disabled={!valide}
            onClick={() => (derniere ? surFin({ lieu, materiel }) : setRang(rang + 1))}
          >
            {derniere ? 'Commencer' : 'Suivant'}
          </button>
        </div>
      </section>
    </main>
  )
}
