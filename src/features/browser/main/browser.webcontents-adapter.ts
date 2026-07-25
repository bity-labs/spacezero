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
  private readonly activeTabByWindowId = new Map<number, string>()
  private readonly observedWindowIds = new Set<number>()
  private service: BrowserService | null = null

  setService(service: BrowserService): void {
    this.service = service
  }

  createView(tabId: string, _options?: { partition: string; preferences: Record<string, unknown> }): void {
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

    const previouslyActiveTabId = this.activeTabByWindowId.get(window.id)
    if (previouslyActiveTabId && previouslyActiveTabId !== tabId) this.hideView(previouslyActiveTabId)

    if (record.attachedWindow && record.attachedWindow !== window) this.detachRecord(tabId, record)
    if (record.attachedWindow !== window) {
      window.contentView.addChildView(record.view)
      record.attachedWindow = window
      this.activeTabByWindowId.set(window.id, tabId)
      this.observeWindowClose(window)
    } else {
      this.activeTabByWindowId.set(window.id, tabId)
    }
    record.view.setBounds(bounds)
  }

  hideView(tabId: string): void {
    const record = this.views.get(tabId)
    if (!record?.attachedWindow) return
    this.detachRecord(tabId, record)
  }

  destroyView(tabId: string): void {
    const record = this.views.get(tabId)
    if (!record) return
    this.detachRecord(tabId, record)
    if (!record.view.webContents.isDestroyed()) record.view.webContents.close()
    this.views.delete(tabId)
  }

  loadUrl(tabId: string, url: string): void {
    const record = this.views.get(tabId)
    if (!record) return
    void record.view.webContents.loadURL(url)
  }

  private detachRecord(tabId: string, record: BrowserViewRecord): void {
    const window = record.attachedWindow
    if (!window) return
    window.contentView.removeChildView(record.view)
    if (this.activeTabByWindowId.get(window.id) === tabId) this.activeTabByWindowId.delete(window.id)
    record.attachedWindow = null
  }

  private observeWindowClose(window: BrowserWindow): void {
    if (this.observedWindowIds.has(window.id)) return
    this.observedWindowIds.add(window.id)
    window.once('closed', () => this.destroyViewsForWindow(window))
  }

  private destroyViewsForWindow(window: BrowserWindow): void {
    for (const [tabId, record] of [...this.views.entries()]) {
      if (record.attachedWindow !== window) continue
      this.destroyView(tabId)
    }
    this.activeTabByWindowId.delete(window.id)
    this.observedWindowIds.delete(window.id)
  }
}
