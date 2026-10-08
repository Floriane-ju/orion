/**
 * T-0398 — le client de la passe de filé hors du fil principal.
 *
 * Le worker lui-même demande un `OffscreenCanvas`, que Node n'a pas : ce qui s'éprouve ici est
 * le contrat du client, avec un faux port. Une seule demande en vol, la plus récente seule
 * repart, chaque image reçue se signale, et une panne rend la passe au fil principal.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  clientFile,
  type DemandeImageFile,
  type MessageDuFile,
  type MessageVersFile,
  type PortFile,
} from '../src/ui/file-hors-fil.ts'
import type { SortieDessinChamp } from '../src/ui/dessine-champ.ts'
import type { Vue } from '../src/core/projection.ts'

function fauxPort(): PortFile & { readonly envoyes: MessageVersFile[] } {
  const envoyes: MessageVersFile[] = []
  return {
    envoyes,
    postMessage: (m) => {
      envoyes.push(m)
    },
    onmessage: null,
    onerror: null,
    terminate: vi.fn(),
  }
}

/** Une demande reconnaissable à son champ : seul l'ordre des envois compte ici. */
const demande = (dureeS: number): DemandeImageFile =>
  ({ parametres: { dureeS } }) as unknown as DemandeImageFile

function repond(port: PortFile): { readonly close: ReturnType<typeof vi.fn> } {
  const bitmap = { close: vi.fn() }
  const message: MessageDuFile = {
    type: 'image',
    bitmap: bitmap as unknown as ImageBitmap,
    sortie: { etoilesReelles: 1 } as SortieDessinChamp,
    vue: {} as Vue,
  }
  port.onmessage?.({ data: message } as MessageEvent<MessageDuFile>)
  return bitmap
}

const demandesEnvoyees = (port: ReturnType<typeof fauxPort>): number[] =>
  port.envoyes.flatMap((m) => (m.type === 'image' ? [m.demande.parametres.dureeS] : []))

describe('client de la passe de filé hors fil (T-0398)', () => {
  it('garde une seule demande en vol et n’envoie que la plus récente au retour', () => {
    const port = fauxPort()
    const client = clientFile(port)
    client.demande(demande(1))
    client.demande(demande(2))
    client.demande(demande(3))
    expect(demandesEnvoyees(port)).toEqual([1])
    repond(port)
    expect(demandesEnvoyees(port)).toEqual([1, 3])
    repond(port)
    client.demande(demande(4))
    expect(demandesEnvoyees(port)).toEqual([1, 3, 4])
  })

  it('signale chaque image reçue et libère la précédente', () => {
    const port = fauxPort()
    const client = clientFile(port)
    expect(client.derniere()).toBeNull()
    client.demande(demande(1))
    const premiere = repond(port)
    expect(client.version()).toBe(1)
    client.demande(demande(2))
    repond(port)
    expect(client.version()).toBe(2)
    expect(premiere.close).toHaveBeenCalledOnce()
    expect(client.derniere()?.sortie.etoilesReelles).toBe(1)
  })

  it('passe en panne sur un échec annoncé ou une erreur du worker', () => {
    const annonce = fauxPort()
    const client = clientFile(annonce)
    annonce.onmessage?.({ data: { type: 'echec' } } as MessageEvent<MessageDuFile>)
    expect(client.enPanne()).toBe(true)

    const erreur = fauxPort()
    const autre = clientFile(erreur)
    erreur.onerror?.({} as ErrorEvent)
    expect(autre.enPanne()).toBe(true)
  })
})
