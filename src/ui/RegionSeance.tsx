/**
 * Ce que la coque pose sur la scène, et ce qu'elle ouvre à côté.
 *
 * T-0113 — le panneau droit à quatre onglets est démonté. Les quatre intentions n'avaient pas
 * la même nature : deux se règlent EN regardant le ciel — la vue et la cible — et deux se
 * lisent de haut en bas — le plan de nuit et le filé. Les premières sont devenues des cartes
 * posées sur la scène, repliables ; les secondes, un panneau latéral.
 *
 * Le partage n'est pas esthétique : une carte qu'on replie libère la scène sans perdre son
 * état, là où un onglet forçait à en abandonner un pour en lire un autre.
 *
 * T-0181 — le panneau ne s'ouvre plus : il est à demeure, et le mode décide de son contenu.
 *
 * T-0238 — le matériel, passé en colonne par T-0197, est revenu en cartes : il vit dans
 * `PanneauMateriel`, que l'application monte à côté de celles-ci.
 */

import { useRef, useEffect } from 'react'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { photographiable, type EtatCible } from '../core/cibles-liste.ts'
import type { Etoile } from '../data/catalog.ts'
import { libelleZpSource } from '../data/equipment.ts'
import { Carte } from './Carte.tsx'
import { RailVue } from './RailVue.tsx'
import { PanneauLateral } from './PanneauLateral.tsx'
import { PanneauCibles } from './PanneauCibles.tsx'
import { PanneauFile } from './PanneauFile.tsx'
import { FicheCible } from './FicheCible.tsx'
import { Pastilles } from './Pastilles.tsx'
import { Bulle } from './Bulle.tsx'
import { ViseeCible } from './BoutonVisee.tsx'
import { BoutonChoixCible } from './BoutonChoixCible.tsx'
import { PlanSessionVue } from './PlanSession.tsx'
import { RegionNuit } from './RegionNuit.tsx'
import { modeObjectif } from './PanneauMateriel.tsx'
import { montreListeCibles, useSeance, type VueCibles } from './seance-etat.ts'
import { AIDE_MATERIEL_INCOMPLET } from './Inconnu.tsx'
import type { SaisieLieu, SaisieMateriel } from './app-saisie.ts'
import { RECALCUL_EN_COURS, type ChaineCalcul } from './app-calcul.ts'
import { Mention } from './Mention.tsx'
import { cibleFocus, idLigneCible } from './focus-panneau.ts'

export interface RegionSeanceProps {
  readonly chaine: ChaineCalcul
  readonly lieu: SaisieLieu
  readonly materiel: SaisieMateriel
  readonly catalogue: readonly ObjetCielProfond[]
  readonly etoiles: readonly Etoile[]
  /** §3.4 — la cible ouverte depuis le planétarium, `null` tant qu'aucune ne l'a été. */
  readonly cibleDuCiel: ObjetCielProfond | null
  readonly gaiaCharge: boolean
  readonly epoqueAnnee: number
  readonly modeNuitActif: boolean
}

/**
 * Les cartes de la scène.
 *
 * Le corps d'une carte repliée n'est PAS monté : replier le plan ne le cache pas, il cesse
 * d'exister — donc de s'abonner aux magasins et d'y recalculer quoi que ce soit à chaque
 * geste de visée. C'est ce qui rend le repli utile et pas seulement discret.
 *
 * T-0213 — le rail de la vue est monté ici plutôt qu'en carte : il reste toujours visible,
 * et ne lit du magasin de scène que les trois tranches dont ses bascules ont besoin.
 */
export function CartesSeance(props: RegionSeanceProps) {
  const { chaine, lieu, materiel } = props
  const { calcul, ciel } = chaine

  /* §11.2 — la seule région qui survit à l'impression : elle est nommée pour ça. */
  const planImprimable =
    calcul.ok && ciel.ok && chaine.plan !== null && chaine.fenetreUtile !== null ? (
      <PlanSessionVue
        plan={chaine.plan}
        fenetreUtile={chaine.fenetreUtile}
        site={chaine.site}
        fovHDeg={calcul.optique.fovHDeg.value}
        fovLDeg={calcul.optique.fovLDeg.value}
        mLimOeil={ciel.ciel.mLimOeil.value}
        etoiles={props.etoiles}
        enTete={{
          nuitIso: lieu.nuitIso,
          lieu: `${lieu.latitude}° / ${lieu.longitude}° — Bortle ${lieu.bortle}`,
          materiel:
            `${materiel.focale} mm f/${materiel.ouverture} — ${calcul.boitier.libelle} · ` +
            `ISO ${calcul.iso.iso} · ${libelleZpSource(calcul.zeroSysteme)}`,
        }}
      />
    ) : null

  return (
    <>
      {/* T-0213 — le rail remplace la carte « Vue ». Ses réglages se prennent EN regardant le
          ciel : une carte à déplier puis replier coûtait deux gestes par bascule. Il est monté
          avant la carte Plan pour que la tabulation le rencontre d'abord — il borde la scène,
          elle flotte dessus. */}
      <RailVue
        modeObjectif={modeObjectif(materiel.typeObjectif)}
        gaiaCharge={props.gaiaCharge}
        epoqueAnnee={props.epoqueAnnee}
        masque={chaine.masque}
      />

      {/* T-0183 — le plan se consulte pendant qu'on regarde le ciel : vérifier l'heure du
          prochain créneau, la pose retenue, ce qui a été écarté. C'est ce qui en fait une
          carte, et non une colonne qu'on parcourt. Son corps reste monté replié — il est la
          seule région imprimable (§11.2). */}
      <Carte cle="PLAN" titre="Plan de nuit">
        {ciel.ok && (
          <RegionNuit
            nuit={ciel.nuit}
            ciel={ciel.ciel}
            offsetMidi={ciel.offsetMidi}
            nuitIso={lieu.nuitIso}
            planIndisponible={chaine.plan === null && props.catalogue.length === 0}
          />
        )}
        {/* T-0291 — le plan est calculé hors du rendu de la frappe : tant qu'il est en vol,
            ce bloc montre celui de la saisie précédente, et le dit. Un horaire de créneau qui
            ne correspond plus à la focale tapée est faux s'il ne s'annonce pas. */}
        {chaine.recalculEnCours && <Mention ton="etat">{RECALCUL_EN_COURS}</Mention>}
        <div className="plan-session" aria-busy={chaine.recalculEnCours}>
          {planImprimable}
        </div>
      </Carte>
    </>
  )
}

/**
 * §6.4 — le rappel de facilité, et la glose qui dit de quoi on parle.
 *
 * « Facilité » seul est ambigu — facilité de quoi, à trouver, à cadrer, à traiter ? La bulle
 * le ferme en une phrase, et la cause d'écart s'y ajoute sur une note 0 : un zéro qui ne dit
 * pas ce qui bloque n'indique aucun levier à tirer.
 *
 * `Bulle` plutôt qu'un `title` : T-0147 — l'infobulle native est la seule surface que la
 * palette de §11.1 ne peut pas atteindre, donc une lampe blanche en pleine interface de nuit.
 */
function RappelFacilite({ etat }: { readonly etat: EtatCible }) {
  const glose =
    etat.cause === null
      ? 'Facilité de prise de vue avec ce matériel, cette nuit.'
      : `Facilité de prise de vue avec ce matériel, cette nuit. ${etat.cause}`
  return (
    <Bulle texte={glose} place="bas">
      <span className="carte-rappel-glose">
        {/* §10.1 — le pointillé d'`Etiquette`, réemployé tel quel : c'est le signe que l'app
            emploie partout pour dire « une glose attend ici ». Le redessiner ailleurs en ferait
            une seconde convention, donc un mot souligné que l'utilisateur n'a plus à survoler. */}
        <span className="terme">
          <abbr>Facilité</abbr>
        </span>
        <Pastilles note={etat.note} libelle={etat.libelle} />
      </span>
    </Bulle>
  )
}

/**
 * Le panneau latéral et son plan imprimable.
 *
 * T-0181 — il n'y a plus de panneau à choisir : le mode le dit. En Ciel profond on choisit une
 * cible dans le catalogue, en Panorama on règle le panorama, et rien d'autre n'est monté.
 *
 * T-0188 — gestion du focus quand le contenu du panneau change.
 */
export function LateralSeance(props: RegionSeanceProps) {
  const { chaine, catalogue } = props
  const { mode, vueCibles } = useSeance()

  /* §3.4 — la fiche n'existe que sur une cible désignée : `ouvreCible` pose les deux d'un
     coup, et rien d'autre ne mène ici. */
  const fiche = mode === 'CIEL_PROFOND' && vueCibles === 'FICHE' && props.cibleDuCiel !== null

  /**
   * §6.4 — la note se LIT dans la map de la chaîne, elle ne se recalcule pas ici : c'est la
   * même entrée que la ligne de la liste du catalogue montre pour cette cible. Deux appels au
   * moteur, même identiques, étaient deux couvertures à garder d'accord — et elles ne
   * l'étaient pas.
   *
   * Elle ne vit QUE dans l'en-tête : la fiche détaille déjà cadrage, pose et intégration, et
   * une note qui agrège ces trois-là n'y ajoutait qu'une ligne à faire défiler.
   */
  const facilite =
    props.cibleDuCiel === null
      ? null
      : chaine.etatsCibles.get(props.cibleDuCiel.designation) ?? null

  /**
   * §8.3 — `CONFLIT_CRENEAU` ne naît qu'à l'allocation de la nuit : la fiche ne peut pas le
   * recalculer seule, contrairement au cadrage, à la détectabilité ou au créneau. C'est le
   * plan lui-même — `chaine.plan.ciblesEcartees` — qui le porte.
   *
   * T-0322 — c'est désormais le SEUL écart d'allocation. Le budget ne retire plus de cible :
   * une nuit trop courte se lit sur l'étape, qui reste au plan avec son nombre de nuits.
   */
  const cible = props.cibleDuCiel
  const ecarteePlan =
    cible === null || chaine.plan === null
      ? null
      : (chaine.plan.ciblesEcartees.find(
          (c) => c.designation === cible.designation && c.code === 'CONFLIT_CRENEAU',
        ) ?? null)

  // T-0188 — le focus suit le contenu du panneau. La liste et la fiche ne coexistent jamais :
  // au moment où l'effet s'exécute, celle qui portait le focus est déjà démontée.
  const titreRef = useRef<HTMLHeadingElement | null>(null)
  const rechercheRef = useRef<HTMLInputElement | null>(null)
  const vuePrecedente = useRef<VueCibles>(vueCibles)

  useEffect(() => {
    const precedente = vuePrecedente.current
    vuePrecedente.current = vueCibles

    // La ligne de la cible consultée : elle vient d'être remontée, ou les filtres l'ont
    // écartée pendant la consultation — c'est ce que le repli couvre.
    const ligne =
      props.cibleDuCiel === null
        ? null
        : document.getElementById(idLigneCible(props.cibleDuCiel.designation))

    switch (cibleFocus(precedente, vueCibles, ligne !== null)) {
      case 'TITRE_FICHE':
        titreRef.current?.focus()
        break
      case 'LIGNE_CIBLE':
        ligne?.focus()
        break
      case 'CHAMP_RECHERCHE':
        rechercheRef.current?.focus()
        break
      default:
        break
    }
  }, [vueCibles, props.cibleDuCiel])

  return (
    <PanneauLateral
      fiche={
        fiche && props.cibleDuCiel !== null
          ? {
              titre: props.cibleDuCiel.designation,
              retour: montreListeCibles,
              rappel: (
                <span className="lateral-actions">
                  {facilite !== null && <RappelFacilite etat={facilite} />}
                  {/* T-0221 — viser depuis la fiche, sans repasser par la ligne de liste. */}
                  <ViseeCible objet={props.cibleDuCiel} site={chaine.site} />
                  {/* §8.3 — le geste qui compose le plan. Le même prédicat que la liste :
                      ce que la nuit ne permet pas ne s'ajoute pas. */}
                  {photographiable(facilite ?? undefined) && (
                    <BoutonChoixCible designation={props.cibleDuCiel.designation} />
                  )}
                </span>
              ),
            }
          : null
      }
      titreRef={titreRef}
    >
      {fiche && props.cibleDuCiel !== null ? (
        /* T-0149 — sans optique chiffrable, la fiche dit ce qui manque plutôt que de meubler. */
        chaine.contexteFiche === null ? (
          <p className="etat">{AIDE_MATERIEL_INCOMPLET}</p>
        ) : (
          <FicheCible
            {...chaine.contexteFiche}
            objet={props.cibleDuCiel}
            site={chaine.site}
            contexteSession={chaine.contexteSession}
            ecarteePlan={ecarteePlan}
          />
        )
      ) : mode === 'PANORAMA' ? (
        chaine.panneauFile === null ? (
          <p className="etat">{AIDE_MATERIEL_INCOMPLET}</p>
        ) : (
          <PanneauFile {...chaine.panneauFile} />
        )
      ) : /* T-0149 — la liste chiffre un cadrage : sans optique, elle dit ce qui manque.
             T-0291 — c'est le contexte de séance qui la monte, et non `calcul.ok && ciel.ok` :
             les deux conditions sont équivalentes, mais la première est celle dont la liste
             tire ses lectures, et c'est elle qui porte la cadence différée. */
      chaine.contexteSession !== null ? (
        <PanneauCibles
          catalogue={catalogue}
          site={chaine.site}
          contexteSession={chaine.contexteSession}
          etats={chaine.etatsCibles}
          recalcul={chaine.recalculEnCours}
          inputRef={rechercheRef}
        />
      ) : (
        <p className="etat">{AIDE_MATERIEL_INCOMPLET}</p>
      )}
    </PanneauLateral>
  )
}
