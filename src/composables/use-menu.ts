import { useFileDialog } from '@vueuse/core'
import { onUnmounted } from 'vue'

import { IS_BROWSER, IS_TAURI } from '@/constants'
import { useEditorStore } from '@/stores/editor'
import { openFileInNewTab, createTab, closeTab, activeTab } from '@/stores/tabs'

const fileDialog = useFileDialog({ accept: '.fig,.pen', multiple: false, reset: true })
fileDialog.onChange((files) => {
  const file = files?.[0]
  if (file) void openFileInNewTab(file)
})

if (IS_BROWSER) {
  ;(
    window as Window & { __OPEN_PENCIL_OPEN_FILE__?: (path: string) => Promise<void> }
  ).__OPEN_PENCIL_OPEN_FILE__ = async (path: string) => {
    const name = path.split('/').pop() ?? 'file.pen'
    const isPen = name.toLowerCase().endsWith('.pen')

    if (path.startsWith('/') || path.match(/^[A-Za-z]:\\/)) {
      const response = await fetch('http://localhost:3300/files/read?path=' + encodeURIComponent(path))
      const data = await response.json()
      if (data.content !== undefined) {
        const encoding = data.encoding ?? (isPen ? 'utf-8' : 'base64')
        if (encoding === 'base64') {
          const binaryStr = atob(data.content)
          const bytes = new Uint8Array(binaryStr.length)
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
          const file = new File([bytes], name, { type: 'application/octet-stream' })
          await openFileInNewTab(file, undefined, path)
        } else {
          const encoder = new TextEncoder()
          const bytes = encoder.encode(data.content)
          const file = new File([bytes], name, { type: 'application/json' })
          await openFileInNewTab(file, undefined, path)
        }
      } else if (data.error) {
        console.error('[__OPEN_PENCIL_OPEN_FILE__] Server error:', data.error)
        throw new Error(data.error)
      }
      return
    }

    const response = await fetch(path)
    const blob = await response.blob()
    const file = new File([blob], name, { type: 'application/octet-stream' })
    await openFileInNewTab(file, undefined, path)
  }
}

export async function openFileDialog() {
  if (IS_TAURI) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { readFile } = await import('@tauri-apps/plugin-fs')
    const path = await open({
      filters: [{ name: 'Design file', extensions: ['fig', 'pen'] }],
      multiple: false
    })
    if (!path) return
    const bytes = await readFile(path)
    const file = new File([bytes], path.split('/').pop() ?? 'file.fig')
    await openFileInNewTab(file, undefined, path)
    return
  }

  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: 'Design file',
            accept: {
              'application/octet-stream': ['.fig'],
              'application/json': ['.pen'],
              'text/plain': ['.pen']
            }
          }
        ]
      })
      const file = await handle.getFile()
      await openFileInNewTab(file, handle)
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }

  fileDialog.open()
}

export async function importFileDialog() {
  await openFileDialog()
}

const store = useEditorStore()

const MENU_ACTIONS: Partial<Record<string, () => void>> = {
  new: () => createTab(),
  open: () => void openFileDialog(),
  import: () => void importFileDialog(),
  close: () => {
    if (activeTab.value) closeTab(activeTab.value.id)
  },
  save: () => {
    console.log('[use-menu] save action triggered')
    void store.saveFigFile()
  },
  'save-as': () => {
    console.log('[use-menu] save-as action triggered')
    void store.saveFigFileAs()
  },
  duplicate: () => store.duplicateSelected(),
  delete: () => store.deleteSelected(),
  group: () => store.groupSelected(),
  ungroup: () => store.ungroupSelected(),
  'create-component': () => store.createComponentFromSelection(),
  'create-component-set': () => store.createComponentSetFromComponents(),
  'detach-instance': () => store.detachInstance(),
  'zoom-100': () => store.zoomTo100(),
  'zoom-fit': () => store.zoomToFit(),
  'zoom-selection': () => store.zoomToSelection(),
  export: () => {
    if (store.state.selectedIds.size > 0) void store.exportSelection(1, 'png')
  }
}

export function useMenu() {
  if (!IS_TAURI) return

  let unlisten: (() => void) | undefined

  void import('@tauri-apps/api/event').then(({ listen }) => {
    void listen<string>('menu-event', (event) => {
      const action = MENU_ACTIONS[event.payload]
      if (action) action()
    }).then((fn) => {
      unlisten = fn
    })
  })

  onUnmounted(() => unlisten?.())
}
