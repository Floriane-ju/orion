# Licences des polices livrées

Les polices voyagent avec les sources : §12.2 impose un démarrage hors réseau et §13.1
(`default-src 'self'`) interdit toute origine tierce. Leur licence les accompagne, comme
elles l'exigent.

## IBM Plex Mono — `IBMPlexMono-{400,500,700}.woff2`

> Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"

SIL Open Font License 1.1 — texte intégral dans [`OFL-1.1.txt`](./OFL-1.1.txt).
Source amont : <https://github.com/IBM/plex>.

## Barlow Condensed — `BarlowCondensed-{600,700}.woff2`

> Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow)

SIL Open Font License 1.1 — texte intégral dans [`OFL-1.1.txt`](./OFL-1.1.txt).
Source amont : <https://github.com/jpt/barlow>.

## Material Symbols Sharp — `MaterialSymbolsSharp-VariableFont_FILL,GRAD,opsz,wght.ttf`

> Copyright Google LLC

Apache License 2.0 — <https://www.apache.org/licenses/LICENSE-2.0>.
Source amont : <https://github.com/google/material-design-icons>.

## Provenance des sous-ensembles

Les cinq WOFF2 sont les sous-ensembles **latins** (`U+0000-00FF` et les signes
typographiques) servis par l'API Google Fonts pour ces deux familles — le français y tient
entièrement. Ils ne sont pas régénérés par `pnpm data:build` : ce sont des binaires amont
versionnés tels quels, à remplacer par un nouveau téléchargement si une graisse s'ajoute.

## Noto Sans Mono — `NotoSansMono-couverture.woff2`

> Copyright 2022 The Noto Project Authors (https://github.com/notofonts/latin-greek-cyrillic)

SIL Open Font License 1.1 — texte intégral dans [`OFL-1.1.txt`](./OFL-1.1.txt).
Source amont : <https://github.com/notofonts/latin-greek-cyrillic>.

Sous-ensemble variable (axe `wght`) servi par l'API Google Fonts avec le paramètre `text=` :
grec, flèches, exposants et indices, signes mathématiques, U+2009 et U+202F — ce que le
sous-ensemble latin de Plex ne dessine pas (T-0389). Déclaré sous la famille
`'IBM Plex Mono'` avec une `unicode-range` : il comble Plex, il ne le remplace jamais. Pour
couvrir un signe de plus, le retélécharger avec le texte élargi et mettre la plage à jour
dans `styles.css` ; `tests/polices.test.ts` dira s'il en manque un.
