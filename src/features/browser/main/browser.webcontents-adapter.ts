import { BrowserWindow, WebContentsView, type WebContents } from 'electron'

import type { BrowserBounds } from '../shared'
import {
  BROWSER_PARTITION,
  BROWSER_WEB_PREFERENCES,
  type BrowserService,
  type BrowserViewAdapter
} from './browser.service'

type BrowserViewRecord = {
  view: WebContentsView
  attachedWindow: BrowserWindow | null
}

export class ElectronBrowserViewAdapter implements BrowserViewAdapter {
  private readonly views = new Map<string, BrowserViewRecord>()
  private service: BrowserService | null = null

  setService(service: BrowserService): void {
    this.service = service
  }

  createView(tabId: string): void {
    const view = new WebContentsView({
      webPreferences: {
        ...BROWSER_WEB_PREFERENCES,
        partition: BROWSER_PARTITION
      }
    })
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    view.webContents.on('did-navigate', (_event, url) =>
      this.service?.markNavigationCommitted(tabId, url)
    )
    view.webContents.on('did-navigate-in-page', (_event, url) =>
      this.service?.markNavigationCommitted(tabId, url)
    )
    view.webContents.on('did-fail-load', (_event, _code, description) =>
      this.service?.markNavigationFailed(tabId, description)
    )
    view.webContents.on('page-title-updated', (_event, title) =>
      this.service?.markTitleChanged(tabId, title)
    )
    this.views.set(tabId, { view, attachedWindow: null })
  }

  showView(tabId: string, bounds: BrowserBounds, sender?: WebContents): void {
    const record = this.views.get(tabId)
    if (!record || !sender) return
    const window = BrowserWindow.fromWebContents(sender)
    if (!window) return
    if (record.attachedWindow && record.attachedWindow !== window) {
      record.attachedWindow.contentView.removeChildView(record.view)
    }
    if (record.attachedWindow !== window) {
      window.contentView.addChildView(record.view)
      record.attachedWindow = window
    }
    record.view.setBounds(bounds)
  }

  hideView(tabId: string): void {
    const record = this.views.get(tabId)
    if (!record?.attachedWindow) return
    record.attachedWindow.contentView.removeChildView(record.view)
    record.attachedWindow = null
  }

  destroyView(tabId: string): void {
    const record = this.views.get(tabId)
    if (!record) return
    if (record.attachedWindow) record.attachedWindow.contentView.removeChildView(record.view)
    if (!record.view.webContents.isDestroyed()) record.view.webContents.close()
    this.views.delete(tabId)
  }

  loadUrl(tabId: string, url: string): void {
    const record = this.views.get(tabId)
    if (!record) return
    void record.view.webContents.loadURL(url)
  }
}
