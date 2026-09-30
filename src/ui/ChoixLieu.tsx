/**
 * §4.1 — la carte où l'on pose le site d'un clic, en tête de la carte « Site » (T-0363).
 *
 * Elle écrit dans les mêmes champs que la saisie chiffrée : le relief, la nuit, l'altitude et le
 * ciel suivent la latitude et la longitude comme si on les avait tapées. Les champs restent la vérité — la carte n'a pas d'état du lieu à elle, seulement sa vue.
 *
 * Elle s'ouvre centrée sur le site saisi, et ne le suit pas ensuite : taper une coordonnée
 * pendant qu'on regarde ailleurs ne doit pas arracher la vue sous la souris.
 *
 * §12.5 — sous les tuiles OSM, le fond embarqué ; hors réseau, il reste seul, et le dit.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { abonneModeReseau, modeReseauCourant } from '../data/degradation.ts'
import { chargeFondCarte } from '../data/bootstrap.ts'
import { FOND_VIDE, type FondCarte } from '../data/fond-carte.ts'
import { TUILES_OSM } from '../data/tuiles-carte.ts'
import { nombreDeTexte } from '../registry/domains.ts'
import { C, CREDIT_CARTE } from '../registry/lieu-carte.ts'
import { ecritLieu, lieuSous, vueCentreeSur, type VueCarte } from './choix-lieu-calcul.ts'
import { useGestesCarteLieu, surToucheCarteLieu } from './choix-lieu-gestes.ts'
import { dessineCarteLieu } from './dessine-choix-lieu.ts'
import { Mention } from './Mention.tsx'
import type { Lieu } from '../core/mercator.ts'

export interface ChoixLieuProps {
  readonly latitude: string
  readonly longitude: string
  readonly surLieu: (latitude: string, longitude: string) => void
}

/** Le fond se décode une fois par session : replier et rouvrir la carte ne le relit pas. */
let fondEnCours: Promise<FondCarte> | null = null
function fondPartage(): Promise<FondCarte> {
  fondEnCours ??= chargeFondCarte().catch(() => FOND_VIDE)
  return fondEnCours
}

function lieuSaisi(latitude: string, longitude: string): Lieu | null {
  const lat = nombreDeTexte(latitude)
  const lon = nombreDeTexte(longitude)
  if (latitude.trim() === '' || longitude.trim() === '') return null
  return Number.isFinite(lat) && Number.isFinite(lon) ? { latitudeDeg: lat, longitudeDeg: lon } : null
}

interface Taille {
  readonly largeur: number
  readonly hauteur: number
}

export function ChoixLieu(props: ChoixLieuProps) {
  const toile = useRef<HTMLCanvasElement | null>(null)
  const site = lieuSaisi(props.latitude, props.longitude)
  const [vue, surVue] = useState<VueCarte>(() =>
    site === null
      ? vueCentreeSur(0, 0, C('ZOOM_CARTE_MIN'))
      : vueCentreeSur(site.latitudeDeg, site.longitudeDeg, C('ZOOM_CARTE_INITIAL')),
  )
  const [fond, surFond] = useState<FondCarte>(FOND_VIDE)
  const [taille, surTaille] = useState<Taille | null>(null)
  // Une tuile arrivée, ou le réseau revenu : de quoi redessiner sans rien changer d'autre.
  const [arrivees, surArrivees] = useState(0)
  const [enLigne, surEnLigne] = useState(() => modeReseauCourant() !== 'HORS_LIGNE')
  const [tuilesPeintes, surTuilesPeintes] = useState(0)

  useEffect(() => {
    let actif = true
    void fondPartage().then((f) => {
      if (actif) surFond(f)
    })
    return () => {
      actif = false
    }
  }, [])

  useEffect(
    () =>
      abonneModeReseau(() => {
        surEnLigne(modeReseauCourant() !== 'HORS_LIGNE')
        surArrivees((n) => n + 1)
      }),
    [],
  )

  useEffect(() => {
    const element = toile.current
    if (element === null || typeof ResizeObserver === 'undefined') return
    const observateur = new ResizeObserver(() => {
      const boite = element.getBoundingClientRect()
      surTaille({ largeur: boite.width, hauteur: boite.height })
    })
    observateur.observe(element)
    return () => observateur.disconnect()
  }, [])

  const latSite = site?.latitudeDeg
  const lonSite = site?.longitudeDeg
  useEffect(() => {
    const element = toile.current
    if (element === null || taille === null) return
    const ctx = element.getContext('2d')
    if (ctx === null) return
    const densite = window.devicePixelRatio || 1
    const largeur = Math.round(taille.largeur * densite)
    const hauteur = Math.round(taille.hauteur * densite)
    // Réaffecter la taille réalloue la toile : seulement quand elle change, pas à chaque tuile.
    if (element.width !== largeur) element.width = largeur
    if (element.height !== hauteur) element.height = hauteur
    ctx.setTransform(densite, 0, 0, densite, 0, 0)
    const peintes = dessineCarteLieu(ctx, {
      ...taille,
      vue,
      fond,
      tuile: (z, x, y) => TUILES_OSM.demande(z, x, y, () => surArrivees((n) => n + 1)),
      site:
        latSite === undefined || lonSite === undefined
          ? null
          : { latitudeDeg: latSite, longitudeDeg: lonSite },
      modeNuit: document.documentElement.dataset.modeNuit === 'true',
    })
    surTuilesPeintes(peintes)
  }, [vue, fond, taille, arrivees, latSite, lonSite])

  const majVue = useCallback((maj: (v: VueCarte) => VueCarte) => surVue(maj), [])
  const { surLieu } = props
  const vueCourante = useRef(vue)
  vueCourante.current = vue
  const pose = useCallback(
    (px: number, py: number) => {
      const element = toile.current
      if (element === null) return
      const { width, height } = element.getBoundingClientRect()
      const v = vueCourante.current
      const ecrit = ecritLieu(lieuSous(v, px, py, width, height), v.zoom)
      surLieu(ecrit.latitude, ecrit.longitude)
    },
    [surLieu],
  )
  useGestesCarteLieu(toile, majVue, pose)

  return (
    <div className="choix-lieu">
      <canvas
        ref={toile}
        className="choix-lieu-toile"
        tabIndex={0}
        role="application"
        aria-roledescription="carte"
        aria-label="Carte du site : glisser ou flèches pour se déplacer, molette ou plus et moins pour zoomer, clic ou Entrée pour poser le site"
        onKeyDown={(e) => surToucheCarteLieu(e, vue, majVue, pose)}
      />
      {tuilesPeintes > 0 && (
        <p className="choix-lieu-credit">
          <a href={CREDIT_CARTE.lien} target="_blank" rel="noreferrer">
            {CREDIT_CARTE.auteur}
          </a>
        </p>
      )}
      {!enLigne && (
        <Mention ton="etat">Hors réseau : la carte garde les côtes, frontières et villes embarquées.</Mention>
      )}
    </div>
  )
}
