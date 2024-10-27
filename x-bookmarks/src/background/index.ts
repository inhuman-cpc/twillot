import { getOptionsPageTab } from 'utils/browser'
import { syncAuthHeaders } from 'utils/storage'
import { Host } from 'utils/types'

chrome.action.onClicked.addListener(function () {
  chrome.runtime.openOptionsPage()
})

chrome.webRequest.onSendHeaders.addListener(
  async (details: chrome.webRequest.WebRequestHeadersDetails) => {
    const { url, initiator } = details
    // 当前页面不监听
    if (initiator !== Host) {
      return
    }

    /**
     * The interface for members and non-members is different.
     * Members request folders first, while regular users directly request bookmarks.
     */
    if (!url.includes('/Bookmarks') && !url.includes('/BookmarkFoldersSlice')) {
      return
    }

    console.log('syncAuthHeaders: url', { url })

    await syncAuthHeaders(details.requestHeaders)

    const storage = await chrome.storage.local.get()
    console.log('syncAuthHeaders: storage', {
      url,
      ...storage,
    })
  },
  {
    types: ['xmlhttprequest'],
    urls: [`${Host}/i/api/graphql/*`],
  },
  ['requestHeaders'],
)

chrome.omnibox.onInputEntered.addListener(async (text) => {
  const newURL =
    chrome.runtime.getURL('pages/options.html') +
    '#/?q=' +
    encodeURIComponent(text)
  let tab = await getOptionsPageTab()
  if (tab) {
    await chrome.tabs.update(tab.id, { url: newURL, active: true })
  } else {
    await chrome.tabs.create({ url: newURL })
  }
})
