/**
 * §5.1 + §7.2 — le corps de la carte Boîtier : quel appareil, l'ISO qu'il justifie, et comment
 * il suit. T-0238 — sans `<section>` ni `h2` : la `Carte` qui l'héberge porte déjà le cadre et
 * le nom.
 *
 * T-0234 — le format du capteur y a rejoint le reste : plein format ou recadrage APS-C décrit
 * l'appareil, pas l'objectif posé devant, et le ranger sous « Optique » séparait deux moitiés
 * de la même description. Le suivi y est venu pour la raison inverse : seul dans sa carte, il
 * n'occupait pas son cadre. Il arrive par `suivi` plutôt qu'en huit propriétés de plus —
 * c'est `PanneauMateriel` qui tient l'état de la monture, cette section l'héberge.
 *
 * T-0280 — et il OUVRE la section, au lieu de la fermer. C'est ce champ qui décide si le ciel
 * profond est ouvert (§5.2), donc celui qui lève la liste vide d'un profil neuf ; dernier d'un
 * corps qui défile, il était hors de vue au moment précis où l'écran demandait de le régler.
 * Le boîtier passe après sans rien perdre : son résumé se relit sur la carte repliée.
 *
 * Deux modes, un seul sélecteur. Un boîtier de la base apporte ses grandeurs capteur : il n'y
 * a alors plus rien à régler, donc plus rien à afficher — les champs disparaissent au lieu de
 * rester là, remplis par autre chose que l'utilisateur. Reste l'ISO, qui cesse d'être une
 * question posée pour devenir une réponse.
 *
 * T-0205 — le poids d'une image fait exception et reste saisissable dans les deux modes. Il ne
 * décrit pas le capteur mais le réglage RAW du moment : compressé, sans perte ou non compressé
 * changent le fichier du simple au triple sans changer d'appareil. La ligne de la base ne donne
 * donc qu'un départ, pas une réponse.
 *
 * Le mode personnalisé, lui, est inchangé : type de capteur et résolution, le pitch dérivé,
 * et les grandeurs avancées repliées. C'est le chemin de première classe pour un boîtier
 * absent de la base, pas un rattrapage — aucune base matériel n'est exhaustive.
 */

import type { ReactNode } from 'react'
import { nombre } from '../registry/ecriture.ts'
import {
  notesEstimation,
  type CapteurMode,
  type IsoRetenu,
  type SaisieBoitier,
} from '../data/equipment.ts'
import { BASE_BOITIERS, ligneBoitier, type LigneBoitier } from '../data/boitiers.ts'
import {
  TABLE_FORMATS_CAPTEUR,
  ligneFormatCapteur,
  pitchDepuisFormat,
  type FormatCapteur,
  estFormatCapteur,
} from '../registry/capteur-formats.ts'
import { nombreDeTexte, type DomaineId } from '../registry/domains.ts'
import { K } from '../registry/constants.ts'
import { GLOSSAIRE, type TermeGlossaire } from '../registry/glossaire.ts'
import { Etiquette } from './Terme.tsx'
import { ChampChoix } from './ChampChoix.tsx'
import { AlerteChamp, ChampDomaine } from './ChampDomaine.tsx'
import { Bulle } from './Bulle.tsx'
import { Icone } from './Icone.tsx'
import { Mention } from './Mention.tsx'

/**
 * T-0199 — pourquoi remplir un dépliant qu'on peut laisser fermé. Chaque champ porte déjà la
 * conséquence de son absence ; le dépliant, lui, dit ce que remplir fait gagner — sans quoi
 * le mode avancé n'a l'air que d'un recoin technique qu'on referme.
 */
const AIDE_AVANCEES =
  'Facultatif. Rend la pose et l’ISO propres à votre boîtier. Valeurs sur Photons to Photos.'

/**
 * §5.1 — les grandeurs du mode avancé, dans l'ordre où elles se saisissent.
 *
 * Une seule liste : les champs la parcourent, et le dépliant fermé s'en sert pour dire
 * lesquelles manquent. Deux énumérations séparées finiraient par diverger, et c'est le
 * résumé — celui qu'on lit sans ouvrir — qui mentirait.
 */
const CHAMPS_AVANCES = Object.freeze([
  { champ: 'readNoiseE', domaine: 'read_noise_e', cle: 'bruit_de_lecture' },
  { champ: 'seuilDoubleGainIso', domaine: 'seuil_double_gain_iso', cle: 'seuil_double_gain' },
  { champ: 'zpSys', domaine: 'zp_sys', cle: 'point_zero_systeme' },
] as const satisfies readonly {
  readonly champ: keyof SaisieBoitier
  readonly domaine: DomaineId
  readonly cle: TermeGlossaire
}[])

/**
 * §5.1 — le recadrage tel qu'on le choisit. Une seule table : le sélecteur la lit, et la carte
 * repliée aussi (T-0238) — deux libellés écrits séparément finiraient par ne plus nommer la
 * même option.
 */
export const LIBELLE_RECADRAGE: Readonly<Record<CapteurMode, string>> = Object.freeze({
  FULL_FRAME: 'Plein format',
  APSC_CROP: 'Recadrage APS-C',
})

type NotesEstimation =Readonly<Partial<Record<keyof SaisieBoitier, string>>>

/**
 * T-0199 — ce que le dépliant FERMÉ doit dire. Sans ce résumé, les alertes de champ ne se
 * voient qu'une fois ouvert : une grandeur manquante n'aurait aucune chance d'être remarquée
 * par qui ne déplie jamais le mode avancé.
 */
function resumeManquantes(notes: NotesEstimation): string | undefined {
  const manquantes = CHAMPS_AVANCES.filter((c) => notes[c.champ] !== undefined)
  if (manquantes.length === 0) return undefined
  const s = manquantes.length > 1 ? 's' : ''
  return (
    `${manquantes.length} grandeur${s} laissée${s} vide${s} : ` +
    manquantes.map((c) => GLOSSAIRE[c.cle].libelle.toLowerCase()).join(', ') +
    '. Valeurs types utilisées [ESTIMÉ].'
  )
}

/** §5.1 — les grandeurs du mode avancé : facultatives, repliées derrière un dépliant. */
function ChampsAvances({
  boitier,
  surChamp,
  notes,
}: {
  readonly boitier: SaisieBoitier
  readonly surChamp: (champ: keyof SaisieBoitier) => (v: string) => void
  readonly notes: NotesEstimation
}) {
  return (
    <div className="champs">
      {CHAMPS_AVANCES.map(({ champ, domaine, cle }) => (
        <ChampDomaine
          key={champ}
          domaine={domaine}
          cle={cle}
          unite
          valeur={boitier[champ]}
          surValeur={surChamp(champ)}
          note={notes[champ]}
        />
      ))}
    </div>
  )
}

/**
 * §5.1 — retour immédiat sur le pitch dérivé, dès que la résolution saisie est exploitable.
 * Pas de `TracedValue` ici : ce n'est pas une formule de moteur tracée, juste un aperçu de
 * saisie — cohérent avec « chaque nombre reste dépliable » sans en être une instance.
 */
function ApercuPitch({
  formatCapteur,
  resolutionMpx,
}: {
  readonly formatCapteur: FormatCapteur
  readonly resolutionMpx: string
}) {
  const mpx = nombreDeTexte(resolutionMpx)
  if (!Number.isFinite(mpx) || mpx <= 0) return null
  const pitch = pitchDepuisFormat(ligneFormatCapteur(formatCapteur), mpx)
  return <p className="etat">Pitch calculé : {nombre(pitch, 2)} µm</p>
}

/**
 * T-0204 — le sélecteur de modèle, groupé par marque.
 *
 * Les groupes gardent l'ordre du fichier plutôt qu'un tri alphabétique : la base se lit de
 * haut en bas, et on retrouve son boîtier là où on l'a écrit.
 */
function SelecteurBoitier({
  boitierId,
  surBoitierId,
}: {
  readonly boitierId: string
  readonly surBoitierId: (v: string) => void
}) {
  const marques: string[] = []
  for (const b of BASE_BOITIERS) if (!marques.includes(b.marque)) marques.push(b.marque)
  return (
    <ChampChoix cle="mon_boitier" valeur={boitierId} surChangement={surBoitierId}>
      <option value="">Personnalisé — décrire le capteur</option>
      {marques.map((marque) => (
        <optgroup key={marque} label={marque}>
          {BASE_BOITIERS.filter((b) => b.marque === marque).map((b) => (
            <option key={b.id} value={b.id}>
              {b.libelle}
            </option>
          ))}
        </optgroup>
      ))}
    </ChampChoix>
  )
}

/**
 * T-0204 — ce qui manque encore à un boîtier de la base.
 *
 * Les champs disparaissent, pas le contrat T-0199 : une grandeur absente de la ligne choisie
 * a les mêmes conséquences que laissée vide à la main, et doit se dire quelque part.
 *
 * `notesEstimation` ne convient pas ici : elle décrit une SAISIE, qui ne porte qu'un bruit de
 * lecture rattaché à un seul ISO. Une ligne de la base porte une courbe — la lui faire juger
 * par le contrat de la saisie lui reprocherait une absence qui n'existe pas.
 *
 * Le seuil de double gain n'y figure pas : son absence est déjà dite, et mieux, par le message
 * de l'ISO juste en dessous. Deux fois la même chose vaut moins qu'une.
 *
 * T-0205 — le poids d'une image n'y figure plus non plus : son champ est resté à l'écran, et
 * c'est lui qui porte l'alerte. Une colonne vide n'est pas une base incomplète quand la
 * grandeur n'était de toute façon pas à la base de la donner.
 */
function ManquesDeLaBase({ ligne }: { readonly ligne: LigneBoitier }) {
  if (Object.keys(ligne.readNoiseE).length > 0) return null
  return (
    <Mention ton="cause">
      <AlerteChamp
        note={
          `Bruit de lecture inconnu : ${K('READ_NOISE_DEFAUT_E')} e⁻ par défaut, pose [ESTIMÉ].`
        }
      />{' '}
      Base incomplète pour ce boîtier.
    </Mention>
  )
}

/**
 * §7.2 — l'ISO. Boîtier de la base : un fait, pas une question.
 *
 * L'ISO du double gain ne se choisit pas, il se constate — demander à quelqu'un de taper le
 * chiffre qu'on vient de lui calculer est une question dont on connaît déjà la réponse.
 *
 * T-0206 — il ne se modifie donc plus du tout. Le seuil de la ligne désigne un palier et un
 * seul : en dessous le bruit de lecture impose des poses plus longues, au-dessus la dynamique
 * est sacrifiée sans rien gagner. Garder la main dessus offrait un réglage dont toutes les
 * valeurs sont moins bonnes que celle affichée, et le forcer faussait la pose calculée. Un
 * boîtier absent de la base garde son champ : là, aucune courbe ne répond à sa place.
 */
function LigneIso({
  iso,
  surIso,
  lecture,
  fige,
}: {
  readonly iso: string
  readonly surIso: (v: string) => void
  readonly lecture?: IsoRetenu | undefined
  /** Vrai quand un boîtier de la base répond déjà à la question. */
  readonly fige: boolean
}) {
  return (
    <>
      {fige ? (
        <p className="etat">
          <Etiquette cle="iso_recommande" precision={lecture?.message} /> :{' '}
          {lecture === undefined ? '—' : lecture.iso}
        </p>
      ) : (
        <ChampDomaine
          domaine="iso_capture"
          cle="iso_recommande"
          precision={lecture?.message}
          valeur={iso}
          surValeur={surIso}
          inputMode="numeric"
          placeholder={lecture === undefined ? 'recommandé' : `recommandé : ${lecture.iso}`}
        />
      )}
    </>
  )
}

export interface PanneauBoitierProps {
  readonly boitierId: string
  readonly surBoitierId: (v: string) => void
  readonly boitier: SaisieBoitier
  readonly surBoitier: (v: SaisieBoitier) => void
  readonly iso: string
  readonly surIso: (v: string) => void
  /** §5.1 — plein format ou recadrage APS-C : une propriété du boîtier, pas de l'objectif. */
  readonly capteurMode: CapteurMode
  readonly surCapteurMode: (v: CapteurMode) => void
  /** §5.1 — le message anti-confusion du recadrage, quand il s'applique. */
  readonly noteRecadrage?: string | undefined
  /** §7.2 — l'ISO retenu et sa justification. Absent tant que la saisie est refusée. */
  readonly lectureIso?: IsoRetenu | undefined
  /** §5.2 — le suivi, monté par `PanneauMateriel` qui en tient l'état. */
  readonly suivi?: ReactNode
}

export function PanneauBoitier(props: PanneauBoitierProps) {
  const ligne = ligneBoitier(props.boitierId)
  // T-0199 — les notes viennent de la SAISIE, pas des lectures : c'est quand la saisie est
  // refusée qu'il importe le plus de voir ce qui manque, et les lectures sont alors absentes.
  const notes = notesEstimation(props.boitier)
  const resumeAvancees = resumeManquantes(notes)
  const surChamp = (champ: keyof SaisieBoitier) => (v: string) =>
    props.surBoitier({ ...props.boitier, [champ]: v })

  return (
    <>
      {props.suivi}
      <div className="champs">
        <SelecteurBoitier boitierId={props.boitierId} surBoitierId={props.surBoitierId} />
        {ligne === null && (
          <>
            <ChampChoix
              cle="format_capteur"
              valeur={props.boitier.formatCapteur}
              surChangement={(v) => {
                // Un `<select>` rend une chaîne : seule une valeur de la table entre.
                if (estFormatCapteur(v)) props.surBoitier({ ...props.boitier, formatCapteur: v })
              }}
            >
              {TABLE_FORMATS_CAPTEUR.map((f) => (
                <option key={f.format} value={f.format}>
                  {f.libelle}
                </option>
              ))}
            </ChampChoix>
            <ChampDomaine
              domaine="resolution_mpx"
              cle="resolution_capteur"
              unite
              valeur={props.boitier.resolutionMpx}
              surValeur={surChamp('resolutionMpx')}
              requis
            />
          </>
        )}
        {/* T-0155 — §7.3 tient le budget de stockage pour « bloquant en pratique ». Un chiffre
            qui décide de la sortie ne se range pas sous un dépliant : il varie d'un boîtier à
            l'autre, et c'est la seule grandeur avancée dont l'absence fausse un volume affiché.
            T-0205 — il survit au choix d'un boîtier de la base, prérempli par sa ligne : le
            réglage RAW change le poids sans changer d'appareil. */}
        <ChampDomaine
          domaine="taille_raw_mo"
          cle="poids_image"
          unite
          valeur={props.boitier.tailleRawMo}
          surValeur={surChamp('tailleRawMo')}
          note={notes.tailleRawMo}
        />
        {/* T-0234 — il survit au choix d'un boîtier de la base, comme le poids : le recadrage
            est un MODE de prise de vue, pas une caractéristique de la ligne choisie. */}
        <ChampChoix
          cle="recadrage_capteur"
          valeur={props.capteurMode}
          surChangement={props.surCapteurMode}
        >
          <option value="FULL_FRAME">{LIBELLE_RECADRAGE.FULL_FRAME}</option>
          <option value="APSC_CROP">{LIBELLE_RECADRAGE.APSC_CROP}</option>
        </ChampChoix>
      </div>
      {props.noteRecadrage !== undefined && <Mention ton="cause">{props.noteRecadrage}</Mention>}
      {ligne === null ? (
        <>
          <ApercuPitch
            formatCapteur={props.boitier.formatCapteur}
            resolutionMpx={props.boitier.resolutionMpx}
          />
          {/* T-0199 — l'absence de ces grandeurs se signale à chaque champ, plus dans un bloc
              d'encadrés sous la section : une alerte loin de sa cause ne désigne rien. La ligne
              `zp_source` part avec eux — §7.1 l'exige partout où une pose est affichée, et ce
              panneau n'en affiche aucune ; elle vit dans les verdicts, le filé et la séance. */}
          <details className="avancees">
            <summary>
              <Bulle texte={AIDE_AVANCEES} place="bas">
                <span className="aide">Grandeurs du capteur — mode avancé</span>
              </Bulle>
              {resumeAvancees !== undefined && <AlerteChamp note={resumeAvancees} />}
              {/* Le chevron remplace le marqueur natif : celui-ci se pose avant le texte, à
                  gauche, et une étiquette qui passe à la ligne le laissait seul sur la sienne. */}
              <Icone nom="expand_more" classe="chevron" />
            </summary>
            <ChampsAvances boitier={props.boitier} surChamp={surChamp} notes={notes} />
          </details>
        </>
      ) : (
        <ManquesDeLaBase ligne={ligne} />
      )}
      <LigneIso
        iso={props.iso}
        surIso={props.surIso}
        lecture={props.lectureIso}
        fige={ligne !== null}
      />
    </>
  )
}
