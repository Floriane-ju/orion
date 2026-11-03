/**
 * §11.3 — view rail: what controls WHAT IS SEEN, laid over the scène itself.
 * T-0213 — was the "Vue" card, folded at start. Its nine controls are set WHILE looking at the
 * sky: unfold a card to switch a layer off, fold it to see the result = two gestures per
 * setting (gloved, in the dark). Rail = one click, hides nothing of the scène.
 * ALWAYS MOUNTED → never subscribed to everything. The card subscribed to the whole store
 * (`useScene`), harmless since it unmounted; here the instant republished 2×/s would render
 * the rail at that rate (T-0056). Three slices, three module-level selectors — the
 * `useTrancheScene` contract.
 * NOTES LIVE IN THE BUBBLES (follow the control they explain, hover + keyboard focus). Each
 * button keeps a short `aria-label`: bubble DESCRIBES, does not name — a 30-word accessible
 * name cannot be skimmed.
 */

import {
  RAPPEL_ASTERISME,
  RAPPEL_FIGURES,
  ecartFrontieresDeg,
} from '../core/constellations.ts'
import { bornesZoom, type ModeProjection } from '../core/projection.ts'
import type { MasqueHorizon } from '../core/site.ts'
import { BoutonGlyphe } from './BoutonGlyphe.tsx'
import { Bulle } from './Bulle.tsx'
import { Icone } from './Icone.tsx'
import type { ReactNode } from 'react'
import { Tiroir } from './Tiroir.tsx'
import type { CouchesActives } from './dessine-ciel.ts'
import { RACCOURCIS_CLAVIER } from './planetarium-gestes.ts'
import {
  majRendu,
  majVue,
  masqueParcours,
  useTrancheScene,
  type EtatScene,
  vueRealisteScene,
} from './scene-etat.ts'
import { modeSeance, useTrancheSeance } from './seance-etat.ts'

export interface RailVueProps {
  /** §5.1 — projection of the objectif declared in the matériel panel, not a render setting. */
  readonly modeObjectif: ModeProjection
  readonly gaiaCharge: boolean
  /** Epoch of the displayed instant: quantifies the B1875 boundaries' precession gap. */
  readonly epoqueAnnee: number
  /** §4.1 — site relief: Sol layer masks it, and says so when it is assumed. */
  readonly masque: MasqueHorizon
  /** Site, Boîtier and Optique cards, as buttons under the calques. */
  readonly reglages: ReactNode
}

/** Module-level selectors — `useTrancheScene` needs a stable identity. */
function modeScene(etat: EtatScene): ModeProjection {
  return etat.vue.mode
}
function couchesScene(etat: EtatScene): CouchesActives {
  return etat.rendu.couches
}
/** T-0324 — parcours target, `null` when none: the bubble names it. */
function cibleParcours(etat: EtatScene): string | null {
  return etat.rendu.parcours?.designation ?? null
}

/**
 * Layers that are decided, with glyph. Horizon excluded: the line heights and azimuth are read
 * against, reference for the rest — erasing it made the scène unreadable for no gain. Still a
 * render pass (`CouchesActives.horizon`), always on, isolated per layer by the tracé tests.
 * Grouped in the "Calques" drawer: six stacked glyphs on the scène flank read as an unnamed
 * list. Cadre matériel stays alone on the rail — not sky dressing but what is aimed at,
 * toggled while framing without opening a menu.
 * `filter_hdr`, not `terrain`, for the sol: `terrain` ligature absent from the shipped font,
 * and a missing ligature renders as plain text.
 */
type Couche = readonly [keyof CouchesActives, string, string]

const CALQUES: readonly Couche[] = [
  ['figures', 'polyline', 'Figures IAU'],
  ['frontieres', 'map', 'Frontières IAU'],
  ['asterismes', 'auto_awesome', 'Astérismes'],
  ['sol', 'filter_hdr', 'Sol'],
  ['voieLactee', 'blur_on', 'Voie lactée'],
]

const CADRE: Couche = ['cadre', 'crop', 'Cadre matériel']

/**
 * T-0171 — under the preview painted across the scène (§9.5), only sol, horizon, cadre matériel
 * and the galactic-plane line add on: those three layers do nothing in Panorama. Were greyed
 * with a note; now leave the rail (keeps only what controls the displayed image). State kept:
 * back in Ciel profond they return as left. T-0403 — Voie lactée stays: its toggle controls
 * the galactic-plane line (T-0173).
 */
const ABSENTES_EN_PANORAMA: readonly (keyof CouchesActives)[] = [
  'figures',
  'frontieres',
  'asterismes',
]

/**
 * T-0324 — under a pointage parcours the scène keeps only path, target and cadre matériel. NO
 * layer toggle changes anything — not even the cadre, forced on. All go off and say why.
 */
const NOTE_PARCOURS = 'masqué pendant le parcours de pointage'

/* T-0097 — toggle no longer only caps magnitude: it paints the site's fond de ciel, horizon
   halo and the Moon's. */
const AIDE_REALISTE = 'Simulation du ciel tel qu’on le voit depuis ce site'

/** One sentence per bubble: control label, then what to know before clicking. */
function aide(libelle: string, ...notes: readonly (string | undefined)[]): string {
  return [libelle, ...notes.filter((n) => n !== undefined && n !== '')].join(' — ')
}

interface BasculeProps {
  readonly nom: string
  /** Label written after the glyph — in the drawer, where room allows. */
  readonly texte?: string
  readonly variante?: 'flottant' | 'nu'
  /** Accessible button name: short, what a screen reader announces. */
  readonly libelle: string
  /** Bubble text on hover and focus. DESCRIBES the button, does not name it. */
  readonly aide: string
  readonly actif: boolean
  /** Control has no effect in the current mode: shows it instead of pretending. */
  readonly eteinte?: boolean
  readonly sur: () => void
}

function Bascule(props: BasculeProps) {
  return (
    // `aria-pressed`, not a checkbox: buttons unfold nothing, hold a two-position state — same
    // grammar as the top bar's mode toggle.
    <BoutonGlyphe
      icone={props.nom}
      aide={props.aide}
      libelle={props.libelle}
      place="droite"
      variante={props.variante ?? 'flottant'}
      {...(props.texte === undefined ? {} : { texte: props.texte })}
      presse={props.actif}
      eteinte={props.eteinte === true}
      onClick={props.sur}
    />
  )
}

export function RailVue(props: RailVueProps) {
  const mode = useTrancheScene(modeScene)
  const couches = useTrancheScene(couchesScene)
  const vueRealiste = useTrancheScene(vueRealisteScene)
  const cibleDuParcours = useTrancheScene(cibleParcours)
  const parcours = cibleDuParcours !== null
  const modeInterface = useTrancheSeance(modeSeance)

  /* Field bounds are a property of the PROJECTION (`fovMaxSelonMode`), their floor of the
     loaded pack: cause reads on the two projection-choosing buttons. §3.3 — a no-op gesture
     must name what stops it. */
  const bornes = bornesZoom(props.gaiaCharge, mode)
  const vueAppareil = mode !== 'MODE_PLANETARIUM'
  const aideProjection = vueAppareil
    ? `Vue comme l’appareil — ${props.modeObjectif === 'MODE_FISHEYE' ? 'équidistante' : 'gnomonique'}`
    : 'Vue planétarium — stéréographique'

  /* §4.1 — sol masks, so must say what it rests on. Flat-horizon hypothesis invites editing a
     survey the UI no longer offers: not shown. */
  const noteSol =
    !props.masque.estHypothese && props.masque.note !== undefined ? props.masque.note : undefined

  /* §10.2 — every displayed number unfolds to its formula. A bubble unfolds nothing: the
     precession gap there = a number taken on faith. It carries the sentence the trace
     addresses to the user; the number stays in the aim counter and traced values (unfoldable). */
  const noteFrontieres = ecartFrontieresDeg(props.epoqueAnnee).note

  const notes: Partial<Record<keyof CouchesActives, string | undefined>> = {
    figures: RAPPEL_FIGURES,
    frontieres: noteFrontieres,
    asterismes: RAPPEL_ASTERISME,
    sol: noteSol,
  }

  return (
    <>
      <div className="coque-rail" role="group" aria-label="Vue de la scène">
        {/* Toggle, not two choices: off = planétarium view, on = declared objectif's. Offering
            gnomonique AND équidistante here would let choose a projection the matériel does not
            produce — §5.1 makes it an objectif property. Name fixed, `aria-pressed` carries
            state; bubble says the displayed view. */}
        <div className="rail-groupe" role="group" aria-label="Projection">
          <Bascule
            nom="camera"
            libelle="Vue comme l’appareil"
            aide={aide(aideProjection, bornes.cause)}
            actif={vueAppareil}
            sur={() => majVue({ mode: vueAppareil ? 'MODE_PLANETARIUM' : props.modeObjectif })}
          />
        </div>

        <div className="rail-groupe" role="group" aria-label="Fond de ciel">
          <Bascule
            nom="tonality"
            libelle="Vue réaliste"
            aide={aide('Vue réaliste', AIDE_REALISTE)}
            actif={vueRealiste}
            sur={() => majRendu({ vueRealiste: !vueRealiste })}
          />
        </div>

        {/* T-0324 — parcours starts from the night plan, a folding panel. Without this exit near
            the scène one faces a stripped sky not knowing why. No toggle: nothing to relight,
            only to leave. */}
        {parcours && (
          <div className="rail-groupe" role="group" aria-label="Parcours de pointage">
            {/* T-0324 — bubble NAMES the target: two plan étapes may have their pointage aid
                open at once, a generic label leaves unclear which path the scène shows. */}
            <BoutonGlyphe
              icone="route"
              aide={`Masquer le parcours vers ${cibleDuParcours}`}
              place="droite"
              variante="flottant"
              onClick={masqueParcours}
            />
          </div>
        )}

        <div className="rail-groupe" role="group" aria-label="Couches">
          <Bascule
            nom={CADRE[1]}
            libelle={CADRE[2]}
            aide={aide(CADRE[2], parcours ? NOTE_PARCOURS : undefined)}
            actif={couches.cadre}
            eteinte={parcours}
            sur={() => majRendu((r) => ({ couches: { ...r.couches, cadre: !r.couches.cadre } }))}
          />
          <Bulle texte="Calques" place="droite">
            <Tiroir modificateur="calques" resume={<Icone nom="layers" libelle="Calques" />}>
              <div className="calques" role="group" aria-label="Calques">
                {CALQUES.map(([cle, glyphe, libelle]) => {
                  // Layer without effect in Panorama stays mounted, inert + hidden: state kept
                  // for return to Ciel profond.
                  const absente =
                    modeInterface === 'PANORAMA' && ABSENTES_EN_PANORAMA.includes(cle)
                  return (
                    <div key={cle} className="calque" data-absente={absente} inert={absente}>
                      <Bascule
                        nom={glyphe}
                        libelle={libelle}
                        texte={libelle}
                        variante="nu"
                        aide={aide(libelle, notes[cle], parcours ? NOTE_PARCOURS : undefined)}
                        actif={couches[cle]}
                        eteinte={parcours}
                        sur={() =>
                          majRendu((r) => ({ couches: { ...r.couches, [cle]: !r.couches[cle] } }))
                        }
                      />
                    </div>
                  )
                })}
              </div>
            </Tiroir>
          </Bulle>
        </div>

        {/* Lieu and matériel are set once per séance: three cards over the sky covered it
            permanently for rarely re-read input. Each = a rail button under the calques,
            opening its window on the right. */}
        <div className="rail-groupe" role="group" aria-label="Site et matériel">
          {props.reglages}
        </div>

        {/* T-0069 — "a shortcut written only in code does not exist". Vue card showed them; rail
            has no room for a paragraph but has for a button. Not a toggle: controls nothing, it
            ANNOUNCES — hence no `aria-pressed`. Bubble opens on focus as on hover: exactly the
            audience, keyboard drivers of the scène reach it by keyboard. */}
        <div className="rail-groupe">
          <BoutonGlyphe
            icone="keyboard"
            aide={RACCOURCIS_CLAVIER}
            libelle="Raccourcis clavier de la scène"
            place="droite"
            variante="flottant"
          />
        </div>
      </div>

    </>
  )
}
