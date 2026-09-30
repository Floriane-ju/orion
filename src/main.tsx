import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { GardeErreur } from './ui/GardeErreur.tsx'
import { attendsPoliceIcones } from './ui/Icone.tsx'
import './ui/styles.css'

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
