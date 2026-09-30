import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { Plugin } from 'vite'
import { ORIGINES_TIERS } from './src/registry/origines.ts'

// §13.1, §13.3 — l'application n'a pas de serveur applicatif et ne transmet ni profil ni plan
// de séance ; du site, seule sa zone part, vers les tuiles de relief (voir plus bas). `connect-src` fait tenir cette promesse par le navigateur à l'exécution :
// une dépendance qui appellerait un tiers demain est refusée sans qu'une revue de code ait à la
// rattraper.
//
// §6.4 — la liste n'est plus vide pour autant. L'image d'objet joint un service public, et son
// origine vient de `ORIGINES_IMAGERIE` : elle n'est pas réécrite ici, parce que la même liste
// sert de garantie de confidentialité en §13.1. Ce qui lui est transmis est un couple de
// coordonnées — jamais un profil, un site ou un plan de séance, donc le critère de §13.3 tient
// toujours.
//
// §4.1 — le relief du terrain joint le jeu Terrain Tiles : la zone du site part avec le numéro
// des tuiles, une fois par site (T-0359). §13.1 l'énumère ; la liste est `ORIGINES_TIERS`.
//
// Une seule directive s'ouvre. Les vignettes sont téléchargées, rangées en IndexedDB, puis
// affichées depuis un `blob:` : `img-src` n'a aucun hôte tiers à nommer, et il n'y a qu'une
// surface à surveiller au lieu de deux.
//
// La politique voyage dans `<meta>` plutôt que dans un en-tête parce que le dépôt ne fixe aucune
// cible d'hébergement (§13.1 : pas de serveur) : un `<meta>` part avec l'artefact et vaut sur
// n'importe quel hébergeur statique. Contrepartie assumée : `frame-ancestors` et `report-uri`
// sont ignorés en `<meta>` — le jour où un hébergeur est choisi, la même liste passe en en-tête
// et gagne l'anti-encadrement.
const CSP_COMMUNE = [
  "default-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  // React pose des styles en attribut (`style={{…}}`) et Vite injecte la feuille par script :
  // les deux exigent l'inline. Sans effet sur §13.3, qui se joue sur `connect-src`.
  "style-src 'self' 'unsafe-inline'",
  // `blob:` — les vignettes de §6.4, et rien d'autre : aucune origine distante ici.
  "img-src 'self' blob:",
]

/** `connect-src`, dérivé de la liste d'origines : une seule source de vérité (§13.1). */
function connectSrc(...supplements: readonly string[]): string {
  return ['connect-src', "'self'", ...supplements, ...ORIGINES_TIERS.map((o) => o.origine)].join(
    ' ',
  )
}

export const CSP_PRODUCTION = [...CSP_COMMUNE, "script-src 'self'", connectSrc()].join('; ')

// Assouplissements réservés au serveur de développement, jamais construits : Vite injecte le
// préambule de rafraîchissement React en script inline, et le rechargement à chaud ouvre une
// WebSocket vers l'hôte de développement.
export const CSP_DEVELOPPEMENT = [
  ...CSP_COMMUNE,
  "script-src 'self' 'unsafe-inline'",
  connectSrc('ws:', 'wss:'),
].join('; ')

export function politiqueDeSecurite(): Plugin {
  return {
    name: 'orion-csp',
    transformIndexHtml: {
      order: 'pre',
      handler: (_html, ctx) => [
        {
          tag: 'meta',
          // En tête du `<head>` : une politique en `<meta>` ne couvre que ce qui la suit.
          injectTo: 'head-prepend',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: ctx.server === undefined ? CSP_PRODUCTION : CSP_DEVELOPPEMENT,
          },
        },
      ],
    },
  }
}


// §12.1 — coquille web progressive. Le précache couvre le code, les styles et les
// paquets de données obligatoires : sans eux, un démarrage hors réseau donne une
// application vide.
export default defineConfig({
  server: { port: 5173 },
  plugins: [
    politiqueDeSecurite(),
    react(),
    VitePWA({
      registerType: 'prompt',
      workbox: {
        // `ttf` et `woff2` : les polices voyagent avec l'artefact (§13.1 interdit d'aller les
        // chercher ailleurs). Hors précache, un démarrage hors réseau afficherait le nom des
        // ligatures en clair à la place des glyphes (T-0122) et perdrait le dessin des deux
        // familles de texte (T-0191).
        globPatterns: ['**/*.{js,css,html,woff2,ttf,png,svg}', 'data/**/*.{bin,json}'],
        // Les paquets binaires dépassent la limite par défaut de 2 Mo (§12.2 : HYG ≈ 1,7 Mo,
        // OpenNGC ≈ 1,2 Mo, paquet Gaia différé ≈ 12 Mo).
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
      },
      manifest: {
        name: 'Orion — planétarium et plan de session',
        short_name: 'Orion',
        description:
          "Planétarium orienté observation et capture : lieu, date et matériel produisent un plan de session exécutable.",
        theme_color: '#000000',
        background_color: '#000000',
        lang: 'fr',
        display: 'standalone',
        start_url: '/',
        // §12.1 — sans 192 et 512, le navigateur ne propose pas l'installation ; la
        // variante `maskable` évite que le lanceur rogne le viseur (§11.1, `pnpm icones:build`).
        icons: [
          { src: '/icones/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icones/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icones/icone-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    // Node ≥ 25 expose un `localStorage` natif qui avertit faute de fichier : les tests qui en
    // ont besoin posent le leur, le reste doit voir un Node sans stockage, comme avant.
    execArgv: ['--no-experimental-webstorage'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
