/**
 * §11.3 — le rail de la vue : ce qui commande CE QU'ON VOIT, posé sur la scène même.
 *
 * T-0213 — c'était la carte « Vue », repliée au démarrage. Ses neuf commandes se règlent EN
 * regardant le ciel : déplier une carte pour éteindre une couche, puis la replier pour revoir
 * ce qu'on vient de changer, c'est deux gestes pour un seul réglage — et sur le terrain, deux
 * gestes gantés dans le noir. Le rail les rend d'un clic, sans rien masquer de la scène qu'il
 * commande.
 *
 * TOUJOURS MONTÉ, donc jamais abonné à tout. La carte s'abonnait au magasin entier
 * (`useScene`), ce que son démontage rendait sans conséquence ; ici l'instant republié deux
 * fois par seconde rendrait le rail au même rythme (T-0056). Trois tranches, trois sélecteurs
 * définis au niveau du module — c'est le contrat de `useTrancheScene`.
 *
 * LES NOTES SONT DANS LES BULLES. La carte portait sept notes sous ses cases ; elles suivent
 * le contrôle qu'elles expliquent, au survol comme au focus clavier. Chaque bouton garde un
 * `aria-label` court : la bulle le DÉCRIT, elle ne le nomme pas — un nom accessible de trente
 * mots ne se laisse pas parcourir.
 */

import {
  RAPPEL_ASTERISME,
  RAPPEL_FIGURES,
  ecartFrontieresDeg,
} from '../core/constellations.ts'
import { bornesZoom, type ModeProjection } from '../core/projection.ts'
import type { MasqueHorizon } from '../core/site.ts'
import { BoutonGlyphe } from './BoutonGlyphe.tsx'
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
import { useSeance } from './seance-etat.ts'

export interface RailVueProps {
  /** §5.1 — la projection de l'objectif déclaré au panneau matériel, pas un réglage de rendu. */
  readonly modeObjectif: ModeProjection
  readonly gaiaCharge: boolean
  /** Époque de l'instant affiché : elle chiffre l'écart de précession des frontières B1875. */
  readonly epoqueAnnee: number
  /** §4.1 — relief du site : la couche Sol masque ce relief, et le déclare quand il est supposé. */
  readonly masque: MasqueHorizon
}

/** Sélecteurs définis au niveau du module — `useTrancheScene` exige une identité stable. */
function modeScene(etat: EtatScene): ModeProjection {
  return etat.vue.mode
}
function couchesScene(etat: EtatScene): CouchesActives {
  return etat.rendu.couches
}
/** T-0324 — la cible du parcours, `null` quand il n'y en a pas : la bulle la nomme. */
function cibleParcours(etat: EtatScene): string | null {
  return etat.rendu.parcours?.designation ?? null
}

/**
 * Les couches qui se décident, avec leur glyphe. L'horizon n'en fait pas partie : c'est la
 * ligne à laquelle se lisent les hauteurs et l'azimut, donc le repère du reste — l'effacer
 * rendait la scène illisible sans rien libérer. Il reste une passe de rendu
 * (`CouchesActives.horizon`), toujours allumée, que les tests de tracé isolent couche par
 * couche.
 *
 * `filter_hdr` et non `terrain` pour le sol : la ligature `terrain` n'existe pas dans la
 * police livrée, et une ligature absente s'affiche en toutes lettres.
 */
const COUCHES: readonly (readonly [keyof CouchesActives, string, string])[] = [
  ['figures', 'polyline', 'Figures IAU'],
  ['frontieres', 'map', 'Frontières IAU'],
  ['asterismes', 'auto_awesome', 'Astérismes'],
  ['cadre', 'crop', 'Cadre matériel'],
  ['sol', 'filter_hdr', 'Sol'],
  ['voieLactee', 'blur_on', 'Voie lactée'],
]

/**
 * T-0171 — un interrupteur qui ne commande rien doit dire pourquoi. Sous l'aperçu peint sur
 * toute la scène (§9.5), seuls le sol, l'horizon, le cadre matériel et le trait du plan
 * galactique s'ajoutent : ces quatre couches-ci restent éteintes quel que soit leur état.
 */
const ETEINTES_EN_PANORAMA: readonly (keyof CouchesActives)[] = [
  'figures',
  'frontieres',
  'asterismes',
  'voieLactee',
]

const NOTE_PANORAMA = 'masqué pendant l’aperçu photo'

/**
 * T-0324 — sous un parcours de pointage, la scène ne garde que le trajet, la cible et le cadre
 * matériel. AUCUNE bascule de couche n'y change quoi que ce soit — pas même celle du cadre, qui
 * est forcé allumé. Elles s'éteignent donc toutes, et disent pourquoi.
 */
const NOTE_PARCOURS = 'masqué pendant le parcours de pointage'

/* T-0097 — la bascule ne plafonne plus seulement la magnitude : elle peint le fond de ciel
   du site, son halo d'horizon et celui de la Lune. */
const AIDE_REALISTE = 'le ciel tel qu’on le voit depuis ce site'

/** Une phrase par bulle : le libellé du contrôle, puis ce qu'il faut savoir avant de cliquer. */
function aide(libelle: string, ...notes: readonly (string | undefined)[]): string {
  return [libelle, ...notes.filter((n) => n !== undefined && n !== '')].join(' — ')
}

interface BasculeProps {
  readonly nom: string
  /** Nom accessible du bouton : court, c'est lui qu'un lecteur d'écran annonce. */
  readonly libelle: string
  /** Ce que la bulle dit au survol et au focus. Elle DÉCRIT le bouton, elle ne le nomme pas. */
  readonly aide: string
  readonly actif: boolean
  /** La commande est sans effet dans le mode courant : elle le montre au lieu de faire semblant. */
  readonly eteinte?: boolean
  readonly sur: () => void
}

function Bascule(props: BasculeProps) {
  return (
    // `aria-pressed` plutôt qu'une case : ces boutons ne déplient rien, ils tiennent un état à
    // deux positions — même grammaire que la bascule de mode de la barre haute.
    <BoutonGlyphe
      icone={props.nom}
      aide={props.aide}
      libelle={props.libelle}
      place="droite"
      variante="flottant"
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
  const { mode: modeInterface } = useSeance()

  /* Les bornes de champ sont une propriété de la PROJECTION (`fovMaxSelonMode`), et leur
     plancher une propriété du paquet chargé : la cause se lit donc sur les deux boutons qui
     choisissent la projection. §3.3 — un geste sans effet doit nommer ce qui l'arrête. */
  const bornes = bornesZoom(props.gaiaCharge, mode)
  const vueAppareil = mode !== 'MODE_PLANETARIUM'
  const aideProjection = vueAppareil
    ? `Vue comme l’appareil — ${props.modeObjectif === 'MODE_FISHEYE' ? 'équidistante' : 'gnomonique'}`
    : 'Vue planétarium — stéréographique'

  /* §4.1 — le sol masque, il doit donc dire sur quoi il repose. L'hypothèse d'horizon plat
     reste au panneau Lieu : elle invite à éditer le relief, un geste que le rail ne propose
     pas. */
  const noteSol =
    !props.masque.estHypothese && props.masque.note !== undefined ? props.masque.note : undefined

  /* §10.2 — tout nombre affiché est dépliable jusqu'à sa formule. Une bulle ne déplie rien :
     y écrire l'écart de précession en ferait un chiffre à croire sur parole. Elle porte donc
     la phrase que la trace adresse à l'utilisateur, et le nombre reste au compteur de visée
     et aux valeurs tracées, où il se déplie. */
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
        {/* Une bascule, pas deux choix : éteinte la vue de planétarium, allumée celle de
            l'objectif déclaré. Offrir gnomonique ET équidistante ici laisserait choisir une
            projection que le matériel ne produit pas — §5.1 en fait une propriété de
            l'objectif. Le nom reste fixe, `aria-pressed` porte l'état ; la bulle dit la vue
            affichée. */}
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

        {/* T-0324 — le parcours se déclenche depuis le plan de nuit, un panneau qui se replie.
            Sans cette sortie posée près de la scène, on resterait devant un ciel dépouillé sans
            savoir d'où il vient. Pas de bascule : il n'y a rien à rallumer, seulement à sortir. */}
        {parcours && (
          <div className="rail-groupe" role="group" aria-label="Parcours de pointage">
            {/* T-0324 — la bulle NOMME la cible : deux étapes du plan peuvent avoir leur aide
                au pointage ouverte en même temps, et un libellé générique laisserait deviner
                lequel des deux trajets la scène montre. */}
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
          {COUCHES.map(([cle, glyphe, libelle]) => {
            const eteintePanorama =
              modeInterface === 'PANORAMA' && ETEINTES_EN_PANORAMA.includes(cle)
            const eteinte = parcours || eteintePanorama
            return (
              <Bascule
                key={cle}
                nom={glyphe}
                libelle={libelle}
                aide={aide(
                  libelle,
                  notes[cle],
                  parcours ? NOTE_PARCOURS : eteintePanorama ? NOTE_PANORAMA : undefined,
                )}
                actif={couches[cle]}
                eteinte={eteinte}
                sur={() =>
                  majRendu((r) => ({ couches: { ...r.couches, [cle]: !r.couches[cle] } }))
                }
              />
            )
          })}
        </div>

        {/* T-0069 — « un raccourci qui n'est écrit que dans le code n'existe pas ». La carte
            Vue les affichait ; le rail n'a pas la place d'un paragraphe, mais il a celle d'un
            bouton. Ce n'est pas une bascule : il ne commande rien, il ANNONCE — d'où l'absence
            d'`aria-pressed`. Sa bulle s'ouvre au focus autant qu'au survol, et c'est exactement
            le public concerné : qui pilote la scène au clavier l'atteint au clavier. */}
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
