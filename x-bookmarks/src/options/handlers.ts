import { untrack } from 'solid-js/web'

import { getAuthInfo } from '../libs/browser'
import dataStore from './store'
import { syncAllBookmarks } from '../libs/bookmark'
import { AuthStatus } from '../types'
import {
  countRecords,
  findRecords,
  getRencentTweets,
  getTopUsers,
} from '../libs/db/tweets'
import { FetchError } from '../libs/xfetch'
import { reconcile } from 'solid-js/store'
import { DAYS, getLastNDaysDates } from '../libs/date'
import { getCurrentUserId, logout, setLocal } from '../libs/storage'

async function query(
  keyword = '',
  category = '',
  folder = '',
  lastId = '',
  limit = 100,
  append = false,
) {
  const [store, setStore] = dataStore
  const start = new Date().getTime()
  const tweets = await findRecords(keyword, category, folder, lastId, limit)
  setStore('hasMore', tweets.length === limit)
  if (append) {
    if (tweets.length > 0) {
      setStore('tweets', (current) => [...current, ...tweets])
    }
  } else {
    setStore('tweets', tweets)
    if (!store.isSidePanel && (keyword.trim() || category || folder)) {
      window.scrollTo(0, 720)
    }
  }
  setStore('searchTime', new Date().getTime() - start)
}

export async function queryByCondition(append = false) {
  const [store] = dataStore
  const tweets = untrack(() => store.tweets)
  query(
    store.keyword,
    store.category,
    store.folder,
    append ? tweets[tweets.length - 1]?.tweet_id || '' : '',
    store.pageSize,
    append,
  )
}

export async function initSync() {
  const [store, setStore] = dataStore
  try {
    /**
     * 可能之前已经同步过数据
     */
    setStore('topUsers', await getTopUsers(10))
    setStore('totalCount', await countRecords())

    const auth = await getAuthInfo()
    if (!auth || !auth.token) {
      throw new Error(AuthStatus.AUTH_FAILED)
    }

    if (!auth.lastForceSynced) {
      setStore('isForceSyncing', true)
      /**
       * 全量同步时展示最新的 100 条数据
       * 后续更新只更新总数
       */
      for await (const docs of syncAllBookmarks(true)) {
        /**
         * 已经有最新的数据展示，不对数据进行操作
         */
        if (store.tweets.length > 0) {
          setStore('totalCount', await countRecords())
        } else {
          setStore('tweets', docs)
        }
        await initHistory()
      }

      setStore('isForceSyncing', false)
      setStore('topUsers', reconcile(await getTopUsers(10)))
      const syncedTime = Math.floor(Date.now() / 1000)
      await setLocal({
        lastForceSynced: syncedTime,
      })
    } else {
      /**
       * 增量更新时先展示最新的 100 条
       * 后续更新同时更新总数和展示数据
       */
      setStore('isAutoSyncing', true)
      for await (const docs of syncAllBookmarks()) {
        setStore('totalCount', await countRecords())
        /**
         * 当前正在搜索时不更新数据
         */
        const isSearching = store.keyword.trim() || store.category
        if (store.isAutoSyncing && isSearching) {
          continue
        }
        await query(store.keyword)
      }
      await initHistory()
      setStore('isAutoSyncing', false)
    }

    setStore('topUsers', reconcile(await getTopUsers(10)))
  } catch (err) {
    console.error(err)
    if (
      err.name == FetchError.IdentityError ||
      err.message == AuthStatus.AUTH_FAILED
    ) {
      setStore('isAuthFailed', true)
      await logout(await getCurrentUserId())
    } else {
      setStore('isForceSyncTimedout', true)
      setStore('isForceSyncing', false)
    }
  }
}

export async function initHistory() {
  const [_, setStore] = dataStore
  const days = getLastNDaysDates(DAYS)
  const { total, data: items } = await getRencentTweets(DAYS)
  const countMap = items.reduce((map, item) => {
    map[item.date] = item.count
    return map
  }, {})
  const history = days.map((date) => {
    return {
      date: date,
      count: countMap[date] || 0,
    }
  })
  setStore({
    history,
    historySize: total,
  })
}

export async function getNextTweet() {
  const [store, setStore] = dataStore
  const index = store.selectedTweet
  if (index < 0) {
    console.warn('Invalid index')
    return
  }
  const nextIndex = index + 1
  if (nextIndex >= store.tweets.length) {
    console.warn('Invalid index')
    return
  }
  setStore('selectedTweet', nextIndex)
}

export async function getPrevTweet() {
  const [store, setStore] = dataStore
  const index = store.selectedTweet

  if (index < 0) {
    console.warn('Invalid index')
    return
  }
  const prevIndex = index - 1
  if (prevIndex < 0) {
    console.warn('Invalid index')
    return
  }
  setStore('selectedTweet', prevIndex)
}

export function resetQuery() {
  const [store, setStore] = dataStore
  setStore({
    keyword: '',
    category: '',
    folder: '',
  })
}
