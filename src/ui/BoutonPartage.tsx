/**
 * T-0431 — partager le plan de la nuit : un clic copie le lien qui le rouvre sur un autre
 * appareil, avec sa nuit, son lieu, son matériel, ses poids et ses cibles.
 *
 * Posé au-dessus du mode nuit, sur le flanc gauche du ciel (§11.1) : c'est un geste qu'on fait
 * en partant, le téléphone déjà en main.
 *
 * Le compte rendu vaut pour CE lien : il s'efface dès que le plan change, sans jamais dire
 * « copié » d'un lien qui n'est plus celui du plan affiché, et sinon au bout d'un bref délai
 * pour que le bouton redevienne celui du partage.
 */

import { useEffect, useState } from 'react'
import { B } from '../registry/budgets.ts'
import { BoutonGlyphe } from './BoutonGlyphe.tsx'
import { useCiblesChoisies } from './cibles-choisies.ts'
import { ecritPlanUrl, lienDuPlan, type PlanAEcrire } from './plan-url.ts'

interface Copie {
  /** Le plan copié, en query string : l'adresse complète ne se lit qu'au clic, dans le navigateur. */
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
      {/* La bulle change de phrase, mais un changement de nom ne s'annonce pas : la région vive,
          elle, le dit au lecteur d'écran. */}
      <p className="annonce-lecteur" role="status">
        {annonce}
      </p>
    </>
  )
}
