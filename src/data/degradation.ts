/**
 * §12.5 — Matrice de dégradation hors-ligne.
 *
 * Contrat explicite, affiché dans l'interface. Le noyau — planétarium, cadrage, pose,
 * planification, filé, pédagogie — est intégralement hors-ligne. Ce qui tombe est de
 * l'agrément visuel ou du probabiliste, jamais du déterministe : le physique est
 * calculable donc offline, le probabiliste dépend d'un service donc en ligne. La frontière
 * technique coïncide avec la frontière épistémique.
 */

export type ModeReseau = 'EN_LIGNE' | 'HORS_LIGNE' | 'DEGRADE'

export type DisponibiliteHorsLigne = 'COMPLET' | 'COMPLET_SI_EN_CACHE' | 'TOMBE'

export interface LigneDegradation {
  readonly fonction: string
  readonly sections: string
  readonly horsReseau: DisponibiliteHorsLigne
  readonly degradation: string
}

export const MATRICE_DEGRADATION: readonly LigneDegradation[] = Object.freeze([
  {
    fonction: 'Planétarium, curseur temporel, constellations',
    sections: '§3',
    horsReseau: 'COMPLET',
    degradation: 'aucune',
  },
  {
    fonction: 'Profil matériel, champ, échantillonnage',
    sections: '§5',
    horsReseau: 'COMPLET',
    degradation: 'aucune',
  },
  {
    fonction: 'Focale idéale, cadrage, détectabilité',
    sections: '§6.1–6.3',
    horsReseau: 'COMPLET',
    degradation: 'aucune',
  },
  {
    fonction: 'Prévisualisation du cadre sur imagerie de fond',
    sections: '§6.2',
    horsReseau: 'TOMBE',
    degradation: 'cadre schématique sur positions d’étoiles réelles',
  },
  {
    fonction: 'Image de l’objet dans la liste et la fiche',
    sections: '§6.4',
    horsReseau: 'TOMBE',
    degradation:
      'cible déjà consultée : image du cache ; cible neuve : désignation et type, sans image',
  },
  {
    fonction: 'Flux, pose unitaire, nombre de poses, calibration',
    sections: '§7',
    horsReseau: 'COMPLET',
    degradation: 'aucune',
  },
  {
    fonction: 'Fenêtre nocturne, Lune, créneaux, plan de session',
    sections: '§8.1–8.3',
    horsReseau: 'COMPLET',
    degradation: 'aucune',
  },
  {
    fonction: 'Masque d’horizon',
    sections: '§4, §8.1',
    horsReseau: 'COMPLET_SI_EN_CACHE',
    degradation: 'site inconnu → masque plat marqué [HYPOTHÈSE]',
  },
  {
    fonction: 'Météo, couverture nuageuse, seeing, température',
    sections: '§4, §9.4',
    horsReseau: 'TOMBE',
    degradation: 'planification sans filtre météo, signalée',
  },
  {
    fonction: 'Cheminement et carte de pointage',
    sections: '§8.4',
    horsReseau: 'COMPLET',
    degradation: 'aucune',
  },
  {
    fonction: 'Prévisualisation fixe et filé',
    sections: '§9.2–9.3',
    horsReseau: 'COMPLET',
    degradation: 'Voie lactée procédurale, pas HiPS',
  },
  {
    fonction: 'Glossaire et explications de verdict',
    sections: '§10',
    horsReseau: 'COMPLET',
    degradation: 'aucune',
  },
  {
    fonction: 'Mode nuit',
    sections: '§11',
    horsReseau: 'COMPLET',
    degradation: 'aucune',
  },
  {
    fonction: 'Satellites, ISS, comètes',
    sections: '§12.4',
    horsReseau: 'TOMBE',
    degradation: 'bloqué, âge du TLE affiché',
  },
].map(Object.freeze) as LigneDegradation[])

export function modeReseauCourant(): ModeReseau {
  // Hors navigateur — tests, rendu serveur — `onLine` n'existe pas : ne pas confondre
  // « information indisponible » avec « hors ligne », sous peine de bloquer les
  // téléchargements de paquets pour une raison fausse.
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
    return 'EN_LIGNE'
  }
  return navigator.onLine ? 'EN_LIGNE' : 'HORS_LIGNE'
}

/**
 * §12.5 — `mode_reseau` reflète l'état réel : lu une fois au démarrage, il mentirait dès
 * la première perte de réseau, c'est-à-dire exactement au moment où il compte.
 * Retourne la fonction de désabonnement.
 */
export function abonneModeReseau(surChangement: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('online', surChangement)
  window.addEventListener('offline', surChangement)
  return () => {
    window.removeEventListener('online', surChangement)
    window.removeEventListener('offline', surChangement)
  }
}
