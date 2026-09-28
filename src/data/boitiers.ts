/**
 * §5.1 — Base matériel : les boîtiers qui se choisissent dans une liste.
 *
 * La base vit dans `boitiers.md`, un tableau markdown lu tel quel. Un fichier de données qu'on
 * édite à la main doit rester lisible à la main : ajouter son boîtier ne demande pas d'écrire du
 * TypeScript, et il n'y a aucun artefact généré qui puisse dériver de sa source.
 *
 * Une ligne se projette sur `SaisieBoitier`, donc `resoutBoitier` la résout comme n'importe
 * quelle saisie : dimensions tirées du format, pitch dérivé de la résolution, bornes du registre,
 * replis du registre pour ce qui manque. Aucune validation n'est réécrite ici — une base mal
 * remplie est refusée exactement comme une saisie mal tapée.
 */

import source from './boitiers.md?raw'
import { resoutBoitier, type Boitier, type SaisieBoitier } from './equipment.ts'
import { valide } from '../registry/domains.ts'
import { estFormatCapteur } from '../registry/capteur-formats.ts'

export interface LigneBoitier {
  readonly id: string
  readonly libelle: string
  readonly marque: string
  readonly saisie: SaisieBoitier
  /** Courbe complète du bruit de lecture, par ISO. Vide quand la base ne la donne pas. */
  readonly readNoiseE: Readonly<Record<number, number>>
  readonly source: string
}

/** Ordre des colonnes du tableau. Le lecteur refuse une ligne qui n'en a pas autant. */
const COLONNES = 10

/**
 * Les lignes du tableau : celles qui commencent par `|` et ne sont ni l'en-tête ni son trait.
 * Le fichier porte aussi une table de documentation des colonnes ; la ligne d'en-tête `| id |`
 * marque le début de la base, et c'est elle qui sépare les deux.
 */
function lignes(texte: string): readonly (readonly string[])[] {
  const debut = texte.indexOf('\n| id |')
  const table = debut === -1 ? '' : texte.slice(debut)
  return table
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .map((l) => l.slice(1, l.lastIndexOf('|')).split('|').map((c) => c.trim()))
    .filter((c) => c.length === COLONNES && c[0] !== 'id' && !c[0]!.startsWith('---'))
}

/** `ISO:valeur` séparés par des espaces. Chaque valeur passe la borne du registre. */
function courbeReadNoise(cellule: string): Readonly<Record<number, number>> {
  const points: Record<number, number> = {}
  for (const point of cellule.split(/\s+/).filter((p) => p !== '')) {
    const [iso, e] = point.split(':')
    points[valide('iso_capture', Number(iso))] = valide('read_noise_e', Number(e))
  }
  return Object.freeze(points)
}

function ligneBoitierDepuis(cellules: readonly string[]): LigneBoitier {
  const [id, libelle, formatCapteur, resolutionMpx, tailleRawMo, seuilDoubleGainIso, courbe, fullWellE, zpSys, src] =
    cellules as [string, string, string, string, string, string, string, string, string, string]
  const readNoiseE = courbeReadNoise(courbe)
  // T-0343 — la base est un fichier : un format mal orthographié y devenait plein format.
  if (!estFormatCapteur(formatCapteur)) {
    throw new Error(`Base boîtiers, ligne ${id} : format de capteur inconnu « ${formatCapteur} ».`)
  }
  return Object.freeze({
    id,
    libelle,
    // La marque groupe le sélecteur : c'est le premier mot du modèle, pas une colonne de plus.
    marque: libelle.split(' ')[0]!,
    saisie: Object.freeze({
      formatCapteur,
      resolutionMpx,
      // La saisie ne porte qu'un bruit de lecture ; la courbe complète voyage à côté. Celui-ci
      // sert au repassage en mode personnalisé, où il n'y a qu'un champ à remplir.
      readNoiseE: String(readNoiseE[Number(seuilDoubleGainIso)] ?? ''),
      seuilDoubleGainIso,
      fullWellE,
      zpSys,
      tailleRawMo,
    }),
    readNoiseE,
    source: src,
  })
}

export const BASE_BOITIERS: readonly LigneBoitier[] = Object.freeze(
  lignes(source).map(ligneBoitierDepuis),
)

export function ligneBoitier(id: string): LigneBoitier | null {
  return BASE_BOITIERS.find((l) => l.id === id) ?? null
}

/**
 * Le boîtier résolu d'une ligne de la base. Le même chemin que la saisie manuelle, à ceci près
 * que la courbe de bruit de lecture est complète : un ISO forcé hors du palier recommandé garde
 * sa vraie valeur au lieu de retomber sur le générique du registre — l'écart va jusqu'à un
 * facteur trois sur la pose, bien au-delà de ce que la plage utile absorbe.
 *
 * T-0205 — `tailleRawMo` est la seule grandeur que l'utilisateur peut reprendre à la ligne :
 * elle ne décrit pas le capteur mais le réglage RAW du moment (compressé, sans perte, non
 * compressé), qui change d'un déclenchement à l'autre sur le même boîtier.
 */
export function boitierDeBase(ligne: LigneBoitier, tailleRawMo?: string): Boitier {
  const saisie =
    tailleRawMo === undefined ? ligne.saisie : { ...ligne.saisie, tailleRawMo }
  return resoutBoitier(saisie, {
    id: ligne.id,
    libelle: ligne.libelle,
    source: ligne.source,
    readNoiseE: ligne.readNoiseE,
  })
}
