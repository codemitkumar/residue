// The only bridge between the game page and the machine: read and write the one-life lock.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('residueHost', {
  desktop: true,
  /** { locked, reason?, kind?, at?, endedOn?, ending? (the final world as JSON) } */
  readLock: () => ipcRenderer.sendSync('lock:read'),
  /** Record the ending against this machine for good. */
  lock: (endingJson) => ipcRenderer.sendSync('lock:write', endingJson),
})
