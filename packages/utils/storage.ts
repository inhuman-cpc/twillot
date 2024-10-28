export enum StorageKeys {
  Last_Sync = 'lastForceSynced_v2',
  Token = 'token',
  Csrf = 'csrf',
  Bookmark_Cursor = 'bookmark_cursor',
  Cookie = 'cookie',
  Current_UID = 'current_user_id',
  Tasks = 'tasks',
  Uuid = 'uuid',
  Transaction_Id = 'transaction_id',
}

export async function getCurrentUserId(): Promise<string> {
  if (!chrome.storage) {
    return ''
  }
  const item = await chrome.storage.local.get(StorageKeys.Current_UID)
  return item[StorageKeys.Current_UID] || ''
}

export function setCurrentUserId(user_id: string) {
  return chrome.storage.local.set({ [StorageKeys.Current_UID]: user_id })
}

export function getStorageKey(key: string, user_id: string) {
  if (!user_id) {
    return key
  }

  if (key === StorageKeys.Current_UID) {
    return key
  }

  return `user:${user_id}:${key}`
}

export async function setLocal(items: { [key: string]: any }) {
  const user_id = await getCurrentUserId()

  let newItems
  if (user_id) {
    newItems = {}
    for (const key in items) {
      newItems[getStorageKey(key, user_id)] = items[key]
    }
  } else {
    newItems = items
  }

  return chrome.storage.local.set(newItems)
}

export async function getLocal(key: string | string[]) {
  const user_id = await getCurrentUserId()
  let result: any = {}
  if (Array.isArray(key)) {
    result = await chrome.storage.local.get(
      key.map((i) => getStorageKey(i, user_id)),
    )
  } else {
    result = await chrome.storage.local.get(getStorageKey(key, user_id))
  }

  if (user_id) {
    for (const k in result) {
      result[k.replace(`user:${user_id}:`, '')] = result[k]
    }
  }

  return result
}

export async function logout(user_id: string) {
  if (!user_id) {
    console.error('user_id is empty')
    return
  }

  const keys = [StorageKeys.Csrf, StorageKeys.Token]
  await chrome.storage.local.remove(
    keys.map((key) => getStorageKey(key, user_id)),
  )
}

export async function clearCurrentLocal() {
  const user_id = await getCurrentUserId()
  const config = await chrome.storage.local.get()

  if (user_id) {
    return chrome.storage.local.remove(
      Object.keys(config).filter((key) => key.startsWith(`user:${user_id}:`)),
    )
  }

  return chrome.storage.local.clear()
}

export function onLocalChanged(callback: (changes: any) => void) {
  chrome.storage.local.onChanged.addListener(async (changes) => {
    const uid = await getCurrentUserId()
    if (!uid) {
      console.error('current user id is not found in storage')
      return
    }

    const originalKeys = Object.keys(changes)
    const simpleKeys = originalKeys.map((key) => key.split(':').pop())
    const newChanges = {}
    simpleKeys.forEach((key, i) => {
      newChanges[key] = changes[originalKeys[i]]
    })
    callback(newChanges)
  })
}

export async function migrateStorage(user_id: string) {
  if (!user_id) {
    console.error('user_id is empty')
    return
  }

  const keys = `${StorageKeys.Bookmark_Cursor},${StorageKeys.Last_Sync}`.split(
    ',',
  )
  const config = await getLocal(keys)
  const newConfig = {}
  for (const key in config) {
    newConfig[getStorageKey(key, user_id)] = config[key]
  }
  await chrome.storage.local.set(newConfig)
  await chrome.storage.local.remove(
    keys.concat(StorageKeys.Cookie, StorageKeys.Token, StorageKeys.Csrf),
  )
}

export async function isMigrationNeeded(): Promise<boolean> {
  const storage = await chrome.storage.local.get()
  return 'token' in storage
}

function incrementFirstNumber(str: string): string {
  const numbers = str.match(/[1-8]/g) || []
  if (numbers.length === 0) return str

  const randomIndex = Math.floor(Math.random() * numbers.length)
  const targetNumber = numbers[randomIndex]

  return str.replace(new RegExp(targetNumber), (match) => {
    const num = parseInt(match)
    return (num < 8 ? num + 1 : 0).toString()
  })
}

export async function getAuthInfo(): Promise<{
  token: string
  csrf: string
  uuid: string
  transaction_id: string
  bookmark_cursor: string
}> {
  const keys = [
    StorageKeys.Token,
    StorageKeys.Csrf,
    StorageKeys.Uuid,
    StorageKeys.Transaction_Id,
    StorageKeys.Bookmark_Cursor,
  ]
  let auth = await getLocal(keys)
  if (auth && auth.transaction_id) {
    auth.transaction_id = incrementFirstNumber(auth.transaction_id)
  }
  return auth
}

export async function getLastSyncInfo(): Promise<number> {
  let obj = await getLocal(StorageKeys.Last_Sync)
  return obj[StorageKeys.Last_Sync] || 0
}

export async function syncAuthHeaders(
  requestHeaders: chrome.webRequest.HttpHeader[],
) {
  let csrf = '',
    token = '',
    uuid = '',
    transaction_id = ''

  for (const { name: k, value: o } of requestHeaders || []) {
    if (csrf && token && uuid && transaction_id) {
      break
    }

    const t = k.toLowerCase()
    if (t === 'x-csrf-token') {
      csrf = o || ''
    } else if (t === 'authorization') {
      token = o || ''
    } else if (t === 'x-client-uuid') {
      // uuid is optional
      // 相同的账户，chrome 没有，edge 有
      uuid = o || ''
    } else if (t === 'x-client-transaction-id') {
      transaction_id = o || ''
    }
  }

  if (!csrf || !token || !transaction_id) {
    console.log('syncAuthHeaders: missing headers', {
      csrf,
      token,
      uuid,
      transaction_id,
    })
    return
  }

  const uid = await getCurrentUserId()
  if (uid) {
    await setLocal({
      csrf,
      token,
      uuid,
      transaction_id,
    })
  } else {
    console.log('syncAuthHeaders: no user id')
  }
}
