import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { GardeErreur } from './ui/GardeErreur.tsx'
import { attendsPoliceIcones } from './ui/Icone.tsx'
import { appliqueModeNuit } from './ui/ModeNuit.tsx'
import { litEtatPersiste } from './data/mode-nuit.ts'
import './ui/styles.css'

// T-0298 — §11.1: persisted night mode set on `<html>` BEFORE first render. In `App`'s effect it
// landed after « Lecture… » painted in day palette: flash each relaunch, mid dark-adaptation.
// Page paints only background (black in both palettes). No inline script: CSP forbids.
appliqueModeNuit(litEtatPersiste())

const racine = document.getElementById('root')
if (racine === null) throw new Error('Élément racine introuvable')

// T-0300 — family read from stylesheet: `--police-icone` stays its only name.
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
