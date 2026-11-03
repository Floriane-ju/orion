/**
 * Cible fiche: §6.2 cadrage, §6.3 détectabilité, §7 pose and integration.
 * App's whole value is this screen, delivered before planétarium. Verifiable here: complete chain,
 * lieu and matériel → « pose 13 s, 252 images, 8,3 Go », each number expandable to formula and
 * source constant.
 * Assembles regions only. Calc in `fiche-cible-calcul.ts`, cible description in `ChampsCible.tsx`.
 * T-0156 — cible always from catalogue: no designated object, no fiche; card says so.
 */

import { useMemo, type ReactNode } from 'react'
import { SaisieRefuseeError } from '../registry/domains.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { Site } from '../core/ephem.ts'
import type { CibleEcartee, ContexteSession, EtapePlan } from '../core/session-types.ts'
import { ChampsCible, Lecture } from './ChampsCible.tsx'
import { syntheseFiche, type SyntheseFiche } from './fiche-synthese.ts'
import { heure } from './horaire.ts'
import type { EtatCible } from '../core/cibles-liste.ts'
import { ImageCible } from './ImageCible.tsx'
import { Photographie } from './FichePhotographie.tsx'
import { TracedValue } from './TracedValue.tsx'
import { nuitFiche } from './fiche-cible-creneau.ts'
import { evalue, type ContexteFiche, type Resultat } from './fiche-cible-calcul.ts'
import { Mention } from './Mention.tsx'
import { Etiquette } from './Terme.tsx'
import { ficheSeance, majFiche, useTrancheSeance } from './seance-etat.ts'

import { LIBELLE_TYPE_OBJET, nomCommun } from './libelles-objet.ts'

export { LIBELLE_TYPE_OBJET, libelleObjet } from './libelles-objet.ts'

export interface FicheCibleProps extends ContexteFiche {
  /**
   * §3.4 — cible opened from planétarium. Click on deep-sky object loads here its cadrage,
   * détectabilité verdict and capture plan: planétarium = entry point to engines.
   */
  readonly objet: ObjetCielProfond
  /** T-0045 — lieu, without which « above horizon » means nothing. */
  readonly site: Site
  /** T-0222 — plan de séance night, `null` until priceable. */
  readonly contexteSession: ContexteSession | null
  /**
   * §8.3 — this cible in `plan.ciblesEcartees`, code `CONFLIT_CRENEAU` or `BUDGET`.
   * Other écart causes (cadrage, hauteur, relief, fenêtre, hors de portée, donnée manquante) are
   * recomputed below, plan-independent. These two differ: `evalueCandidate` doesn't produce them,
   * they arise only at night allocation (`session.ts`) when an otherwise viable cible loses its
   * place to a better-rated one or to budget. Without this prop nothing in fiche says an
   * evaluable cible isn't in tonight's plan.
   */
  readonly ecarteePlan?: CibleEcartee | null
  /** T-0282 — this cible's plan étape: fiche head takes its values. */
  readonly etapePlan?: EtapePlan | null
  /** T-0381 — list note for this cible, read from the same map, never recomputed. */
  readonly facilite?: EtatCible | null
  /**
   * T-0408 — under a zoom, fiche ring, under the image it reframes. Receives the fill fiche just
   * computed (what « Taille dans le cadre » shows, orientation incl.), not a second calc that
   * could diverge.
   */
  readonly reglageZoom?: (remplissage: number | null) => ReactNode
  /**
   * T-0284 — jump the scène to an instant, cible centred and followed. Absent: créneau and
   * culmination stay plain readings (no matériel cadre to aim with).
   */
  readonly vaAInstant?: (instant: Date) => void
}

/** T-0284 — a time of the fiche that leads to its instant: reading kept, gesture added. */
function LectureSaut(props: {
  readonly libelle: ReactNode
  readonly valeur: string
  readonly instant: Date
  readonly aide: string
  readonly vaAInstant: ((instant: Date) => void) | undefined
}) {
  const { vaAInstant, instant } = props
  if (vaAInstant === undefined) return <Lecture libelle={props.libelle} valeur={props.valeur} />
  return (
    <p className="tracee tracee-vide">
      <span>{props.libelle}</span>
      <button
        type="button"
        className="tracee-valeur tracee-saut"
        aria-label={`${props.aide}, ${heure(instant)}`}
        onClick={() => vaAInstant(instant)}
      >
        {props.valeur}
      </button>
    </p>
  )
}

const NON_CHIFFRE = '—'

/**
 * T-0381 — first card says WHAT and WHEN, like the list card we came from: désignation and usage
 * name, type, then créneau and culmination. No section title (names, doesn't sort). Type said once
 * here; next card doesn't repeat.
 */
function Resume({
  objet,
  s,
  culmination,
  extinction,
  vaAInstant,
}: {
  readonly vaAInstant: ((instant: Date) => void) | undefined
  readonly objet: ObjetCielProfond
  readonly s: SyntheseFiche | null
  /** Time of night's highest point, `null` without priced night: line doesn't pad. */
  readonly culmination: Date | null
  /** §7.6 — night attenuation, `null` without priceable créneau. */
  readonly extinction: Resultat['extinction']
}) {
  const nom = nomCommun(objet)
  const creneau = s?.creneau ?? null
  return (
    <section>
      <div className="fiche-tete">
        <p className="fiche-resume-nom">
          <span className="cible-designation">{objet.designation}</span>
          {nom !== '' && <span>{nom}</span>}
        </p>
        <p className="fiche-resume-type">{LIBELLE_TYPE_OBJET[objet.type]}</p>
      </div>
      {creneau === null ? (
        <Lecture libelle="Créneau d’observation" valeur={NON_CHIFFRE} />
      ) : (
        <LectureSaut
          libelle="Créneau d’observation"
          valeur={`${heure(creneau.debut)} → ${heure(creneau.fin)}`}
          instant={creneau.debut}
          aide={`Aller au début du créneau de ${objet.designation}`}
          vaAInstant={vaAInstant}
        />
      )}
      {culmination !== null && (
        <LectureSaut
          libelle={<Etiquette cle="culmination" />}
          valeur={heure(culmination)}
          instant={culmination}
          aide={`Aller à la culmination de ${objet.designation}`}
          vaAInstant={vaAInstant}
        />
      )}
      {/* T-0385 — air loss is a property of the night, like créneau. */}
      {extinction !== null && extinction.attenuation.value !== null && (
        <TracedValue terme="extinction_atmospherique" trace={extinction.attenuation} decimales={3} />
      )}
    </section>
  )
}

export function FicheCible(props: FicheCibleProps) {
  // T-0362 — fiche settings live in séance: survive reload.
  const { snrCible, permissif } = useTrancheSeance(ficheSeance)

  const objet = props.objet
  const iso = props.iso
  /**
   * T-0268 — plan de séance night: créneau, Lune at créneau middle, mean masse d'air. Memoized on
   * NIGHT and cible only, not scène clock: fiche can't announce a pose varying with consultation
   * time, nor anything different from list and plan.
   */
  const nuit = useMemo(
    () => nuitFiche(props.contexteSession, objet),
    [props.contexteSession, objet],
  )

  const calcul = useMemo<{ ok: true; r: Resultat } | { ok: false; erreur: string }>(() => {
    try {
      return { ok: true, r: evalue(props, objet, snrCible, iso, nuit.lune, nuit.capture, permissif) }
    } catch (erreur) {
      if (erreur instanceof SaisieRefuseeError) return { ok: false, erreur: erreur.message }
      throw erreur
    }
  }, [props, objet, snrCible, iso.iso, nuit, permissif])

  const cadre =
    calcul.ok && calcul.r.cadrage !== null
      ? {
          fovLDeg: props.optique.fovLDeg.value,
          fovHDeg: props.optique.fovHDeg.value,
          angleBoitierDeg: calcul.r.cadrage.angleBoitierDeg,
        }
      : null

  const synthese = calcul.ok
    ? syntheseFiche(calcul.r, nuit.creneau, props.etapePlan ?? null)
    : null

  return (
    <div className="fiche">
      {/* §6.4, §6.2 — object before its numbers, sensor cadre laid on it. No image: renders nothing
          (imageless cible stays complete). No cadrage (no catalogue dimensions): bare image — a
          rectangle on fallback field would lie on scale. */}
      <ImageCible objet={objet} cadre={cadre} />
      {props.reglageZoom?.(calcul.ok ? (calcul.r.cadrage?.remplissage.value ?? null) : null)}
      <Resume
        objet={objet}
        s={synthese}
        culmination={nuit.creneau.chiffre ? nuit.creneau.creneau.heureCulmination : null}
        extinction={calcul.ok ? calcul.r.extinction : null}
        vaAInstant={props.vaAInstant}
      />
      <ChampsCible objet={objet} />
      {calcul.ok && synthese !== null && (
        <Photographie
          r={calcul.r}
          s={synthese}
          facilite={props.facilite ?? null}
          snrCible={snrCible}
          surSnr={(snrCible) => majFiche({ snrCible })}
          zeroSysteme={props.zeroSysteme}
          permissif={permissif}
          surPermissif={(permissif) => majFiche({ permissif })}
        />
      )}
      {(props.ecarteePlan ?? null) !== null && (
        <Mention ton="cause">
          <Etiquette cle="cause_exclusion" /> : {props.ecarteePlan!.cause}
        </Mention>
      )}
      {!calcul.ok && <Mention ton="erreur">{calcul.erreur}</Mention>}
    </div>
  )
}
