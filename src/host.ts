// The desktop app (Electron) exposes the one-life machine lock here. In a plain browser it's absent.

export interface MachineLock {
  locked: boolean
  reason?: string
  kind?: string
  at?: number
  endedOn?: string
  /** The final world as JSON, if it's still on disk. */
  ending?: string | null
}

interface Host {
  desktop: true
  readLock(): MachineLock
  lock(endingJson: string): MachineLock
}

export const host: Host | undefined = (window as unknown as { residueHost?: Host }).residueHost

/** Read once at startup: has this machine already used its one life? */
export function machineLock(): MachineLock | null {
  try {
    return host?.readLock() ?? null
  } catch {
    return null
  }
}

/** Record the ending against this machine. */
export function lockMachine(endingJson: string) {
  try {
    host?.lock(endingJson)
  } catch {
    /* the browser copy still holds */
  }
}
