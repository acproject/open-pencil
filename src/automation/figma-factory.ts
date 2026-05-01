import { FigmaAPI, IS_BROWSER } from '@open-pencil/core'

import type { EditorStore } from '@/stores/editor'

export function makeFigmaFromStore(store: EditorStore): FigmaAPI {
  const api = new FigmaAPI(store.graph)
  api.currentPage = api.wrapNode(store.state.currentPageId)
  api.currentPage.selection = [...store.state.selectedIds]
    .map((id) => api.getNodeById(id))
    .filter((n): n is NonNullable<typeof n> => n !== null)
  api.viewport = {
    center: {
      x: (-store.state.panX + window.innerWidth / 2) / store.state.zoom,
      y: (-store.state.panY + window.innerHeight / 2) / store.state.zoom
    },
    zoom: store.state.zoom
  }
  api.exportImage = (nodeIds, opts) =>
    store.renderExportImage(nodeIds, opts.scale ?? 1, opts.format ?? 'PNG')
  api.saveFile = async (filePath: string, data: Uint8Array) => {
    const isAIIDE = IS_BROWSER && new URLSearchParams(window.location.search).has('embed')
    if (isAIIDE) {
      const binary = Array.from(new Uint8Array(data))
        .map((b) => String.fromCharCode(b))
        .join('')
      const base64 = btoa(binary)
      const message = 'DESIGN_SAVE_FILE_DIRECT:' + filePath + ':' + base64
      if (window.webkit?.messageHandlers?.scriptMessageHandler) {
        window.webkit.messageHandlers.scriptMessageHandler.postMessage(message)
      } else {
        window.parent.postMessage(
          { type: 'DESIGN_SAVE_FILE_DATA', filePath, data: base64 },
          '*'
        )
      }
      return
    }
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filePath.split('/').pop() ?? 'export'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 100)
  }
  return api
}
