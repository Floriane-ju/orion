/**
 * §12.5 — Offline degradation matrix: explicit contract, shown in UI. Core (planétarium, cadrage,
 * pose, planification, filé, pédagogie) fully offline. What drops = visual comfort or
 * probabilistic, never deterministic: physical = computable = offline, probabilistic = service =
 * online. Technical border = epistemic border.
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
    fonction: 'Carte de choix du lieu',
    sections: '§4.1',
    horsReseau: 'COMPLET',
    degradation: 'fond embarqué (côtes, frontières, villes), sans le détail des tuiles OSM',
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
  // No `onLine` outside browser (tests, server render): « info unavailable » ≠ « offline », else
  // package downloads get blocked wrongly.
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
    return 'EN_LIGNE'
  }
  return navigator.onLine ? 'EN_LIGNE' : 'HORS_LIGNE'
}

/**
 * §12.5 — `mode_reseau` reflects real state: read once at startup it would lie from first
 * network loss, when it matters. Returns unsubscribe.
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
