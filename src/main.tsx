import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { GardeErreur } from './ui/GardeErreur.tsx'
import { attendsPoliceIcones } from './ui/Icone.tsx'
import { appliqueModeNuit } from './ui/ModeNuit.tsx'
import { litEtatPersiste } from './data/mode-nuit.ts'
import './ui/styles.css'

// T-0298 — §11.1 : le mode nuit persisté se pose sur `<html>` AVANT le premier rendu. Laissé à
// l'effet de `App`, il arrivait après l'écran « Lecture… », peint en palette de jour : un
// éclair à chaque relance, en pleine adaptation à l'obscurité. Jusqu'ici la page n'a peint
// que le fond, noir dans les deux palettes. Pas de script en ligne : la CSP l'interdit.
appliqueModeNuit(litEtatPersiste())

const racine = document.getElementById('root')
if (racine === null) throw new Error('Élément racine introuvable')

// T-0300 — la famille est lue dans la feuille : `--police-icone` reste son seul nom.
void attendsPoliceIcones(
  document,
  getComputedStyle(document.documentElement).getPropertyValue('--police-icone').trim(),
).catch(() => {})

createRoot(racine).render(
  <StrictMode>
    <GardeErreur>
      <App />
    </GardeErreur>
  </StrictMode>,
)
