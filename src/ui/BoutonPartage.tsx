/**
 * T-0431 — share the night plan: one click copies the link reopening it on another device (night,
 * lieu, matériel, weights, cibles).
 * Above mode nuit, left flank of sky (§11.1): a gesture made on leaving, phone in hand.
 * Feedback valid for THIS link: cleared when plan changes (never "copié" for a stale link), else
 * after a short delay → button is the share button again.
 */

import { useEffect, useState } from 'react'
import { B } from '../registry/budgets.ts'
import { BoutonGlyphe } from './BoutonGlyphe.tsx'
import { useCiblesChoisies } from './cibles-choisies.ts'
import { ecritPlanUrl, lienDuPlan, type PlanAEcrire } from './plan-url.ts'

interface Copie {
  /** Copied plan as query string: full address is read at click, in browser. */
  readonly recherche: string
  readonly reussie: boolean
}

export interface BoutonPartageProps {
  readonly plan: Omit<PlanAEcrire, 'cibles'>
}

export function BoutonPartage({ plan }: BoutonPartageProps) {
  const cibles = useCiblesChoisies()
  const complet = { ...plan, cibles: [...cibles] }
  const recherche = ecritPlanUrl(complet)
  const [copie, setCopie] = useState<Copie | null>(null)
  const courante = copie?.recherche === recherche ? copie : null

  useEffect(() => {
    if (copie === null) return
    const minuterie = setTimeout(() => setCopie(null), B('COMPTE_RENDU_COPIE_MS'))
    return () => clearTimeout(minuterie)
  }, [copie])
  const annonce =
    courante === null
      ? ''
      : courante.reussie
        ? 'Lien du plan copié'
        : 'Copie refusée par le navigateur'

  async function copier(): Promise<void> {
    try {
      await navigator.clipboard.writeText(lienDuPlan(complet))
      setCopie({ recherche, reussie: true })
    } catch {
      setCopie({ recherche, reussie: false })
    }
  }

  return (
    <>
      <BoutonGlyphe
        icone={courante?.reussie === true ? 'check' : 'share'}
        aide={annonce === '' ? 'Copier le lien du plan' : annonce}
        variante="flottant"
        place="droite"
        onClick={() => void copier()}
      />
      {/* Bulle changes sentence but a name change isn't announced; live region tells the screen
          reader. */}
      <p className="annonce-lecteur" role="status">
        {annonce}
      </p>
    </>
  )
}
