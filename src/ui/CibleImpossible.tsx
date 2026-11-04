/**
 * §6.4, §8.3 — écartée cible card: why + lever that brings it back.
 * T-0379 — cadrage refusal as FOCALE, not arcmin (focale = what user changes).
 * T-0380 — hors saison: says so, offers return night.
 * No calc: focale/saison from `cible-ecartee.ts` (inverts écartant engine rules).
 * Prochain créneau searched on CLICK only: ~15 nights ephemerides × 200 cards freezes list.
 */

import { useState } from 'react'
import type { EtatCible } from '../core/cibles-liste.ts'
import {
  exclusionCreneau,
  focaleRequise,
  prochainCreneau,
  prochaineNuitSansLune,
  type ExclusionCreneau,
  type FocaleRequise,
} from '../core/cible-ecartee.ts'
import type { CauseEcart } from '../core/session.ts'
import { objectifPour, type Objectif } from '../core/objectif.ts'
import type { ContexteSession } from '../core/session.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { nombre } from '../registry/ecriture.ts'
import { BoutonGlyphe } from './BoutonGlyphe.tsx'
import { cadreA } from './BoutonCadrer.tsx'

export const HORS_SAISON = 'Invisible aujourd’hui'
/** Too low / never risen: same card answer (neither focale nor date helps); hauteur on fiche. */
export const NON_PHOTOGRAPHIABLE_ICI = 'Non photographiable d’ici'
export const AUCUN_CRENEAU = 'Aucun créneau de nuit dans l’année qui vient'
export const AUCUNE_NUIT_SANS_LUNE = 'Aucune nuit sans Lune gênante dans le mois qui vient'

/** T-0380, T-0382 — dates an écartée card can search: saison return, Lune set. Same button. */
const RECHERCHES = Object.freeze({
  SAISON: {
    icone: 'fast_forward',
    aide: 'Prochain créneau',
    introuvable: AUCUN_CRENEAU,
    chercher: prochainCreneau,
  },
  LUNE: {
    icone: 'dark_mode',
    aide: 'Prochaine nuit sans Lune',
    introuvable: AUCUNE_NUIT_SANS_LUNE,
    chercher: prochaineNuitSansLune,
  },
})

/** Round toward kept promise: AU_MOINS up, AU_PLUS down. */
function arrondie(f: FocaleRequise): FocaleRequise {
  if (f.sens === 'AU_MOINS') return { sens: f.sens, focaleMm: Math.ceil(f.focaleMm) }
  if (f.sens === 'AU_PLUS') return { sens: f.sens, focaleMm: Math.floor(f.focaleMm) }
  return f
}

/** T-0404 — §6.1: if parc can cadrer it, phrase names objectif + focale (already owned). */
export function phraseFocale(requise: FocaleRequise, parc: readonly Objectif[] = []): string {
  const f = arrondie(requise)
  const solution = objectifPour(parc, f)
  const avec = solution === null ? '' : ` — ${solution.objectif.nom} à ${nombre(solution.focaleMm, 0)} mm`
  switch (f.sens) {
    case 'AU_MOINS':
      return `Focale min ${nombre(f.focaleMm, 0)} mm${avec}`
    case 'AU_PLUS':
      return `Focale max ${nombre(f.focaleMm, 0)} mm${avec}`
    case 'MOSAIQUE':
      return 'Mosaïque requise'
    case 'TROP_PETITE':
      return 'Trop petite pour ce capteur'
  }
}

/** Codes where créneau may hide a second cause (not decided). */
const CRENEAU_A_TESTER: ReadonlySet<CauseEcart | null> = new Set(['CADRAGE', 'HAUTEUR', 'RELIEF', 'FENETRE'])

/**
 * Card phrases: ALL causes, not first only: taille then créneau (action order: matériel, date).
 * No numeric lever → engine phrase. Suivi, donnée manquante close the rest: no combining.
 */
export function causesCarte(
  contexte: ContexteSession,
  objet: ObjetCielProfond,
  etat: EtatCible,
  parc: readonly Objectif[] = [],
): { readonly phrases: readonly string[]; readonly horsSaison: boolean } {
  if (!CRENEAU_A_TESTER.has(etat.code)) {
    return { phrases: etat.cause === null ? [] : [etat.cause], horsSaison: false }
  }
  const focale = focaleRequise(contexte, objet)
  const creneau = exclusionCreneau(contexte, objet)
  const horsSaison = creneau?.cause === 'HORS_FENETRE'
  const phrases = [
    focale !== null ? phraseFocale(focale, parc) : null,
    creneau === null ? null : phraseCreneau(creneau),
  ].filter((p): p is string => p !== null)
  // Neither taille nor créneau (other cadrage verdict, créneau too short): engine phrase.
  return {
    phrases:
      phrases.length > 0 || etat.cause === null
        ? phrases
        : [etat.code === 'HAUTEUR' ? NON_PHOTOGRAPHIABLE_ICI : etat.cause],
    horsSaison,
  }
}

function phraseCreneau({ cause, message }: ExclusionCreneau): string {
  if (cause === 'HORS_FENETRE') return HORS_SAISON
  if (cause === 'HAUTEUR' || cause === 'JAMAIS_LEVE') return NON_PHOTOGRAPHIABLE_ICI
  return message
}

/** `causesCarte` phrases, computed once by card (which also decides pied). */
export function CibleImpossible({ phrases }: { readonly phrases: readonly string[] }) {
  return (
    <span className="cible-impossible">
      <span className="libelle">Photographie impossible</span>
      {phrases.map((p) => (
        <span key={p} className="cible-cause">
          {p}
        </span>
      ))}
    </span>
  )
}

/**
 * Outside-fiche button like « Cadrer » (`<button>` can't nest): in card pied beside it; « hors
 * saison » phrase stays with other causes. No créneau in year: button says so, goes eteinte
 * (no-op click would lie).
 */
export interface BoutonProchainCreneauProps {
  readonly objet: ObjetCielProfond
  readonly contexte: ContexteSession
  /** What écarte tonight: saison (default) or Lune. */
  readonly attendre?: keyof typeof RECHERCHES
  /** List-card pied spells gesture out: the bulle phrase. */
  readonly avecLibelle?: boolean
}

export function BoutonProchainCreneau({
  objet,
  contexte,
  attendre = 'SAISON',
  avecLibelle = false,
}: BoutonProchainCreneauProps) {
  const [introuvable, setIntrouvable] = useState(false)
  const recherche = RECHERCHES[attendre]
  return (
    <BoutonGlyphe
      icone={recherche.icone}
      aide={introuvable ? recherche.introuvable : recherche.aide}
      place="gauche"
      eteinte={introuvable}
      {...(avecLibelle ? { texte: recherche.aide } : {})}
      onClick={() => {
        if (introuvable) return
        const instant = recherche.chercher(contexte, objet)
        if (instant === null) {
          setIntrouvable(true)
          return
        }
        cadreA(objet, contexte.site, instant)
      }}
    />
  )
}
