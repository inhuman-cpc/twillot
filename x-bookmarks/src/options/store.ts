import { produce, createStore } from 'solid-js/store'

import {
  type FontSet,
  type Tweet,
  type TweetWithPosition,
  type CountInfo,
} from 'utils/types'
import { DAYS } from 'utils/date'
import { type License, LICENSE_KEY } from 'utils/license'

const activeFont = JSON.parse(
  localStorage.getItem('activeFont') || 'null',
) as FontSet | null
const fontSize = parseInt(localStorage.getItem('fontSize') || '16', 10)

export const defaultState = () => ({
  keyword: '',
  category: '',
  folder: '',
  pageSize: 100,
  hasMore: true,
  totalCount: null as null | CountInfo,
  tweets: new Array<Tweet>(),
  selectedTweet: -1,
  topUsers: new Array<any>(),
  folders: new Array<{ name: string; count: number }>(),
  history: new Array<{ date: string; count: number }>(DAYS).fill({
    date: '',
    count: 0,
  }),
  historySize: 0,
  searchTime: 0,
  isAuthenicating: false,
  isAuthFailed: false,
  isAutoSyncing: false,
  isForceSyncing: false,
  isForceSyncTimedout: false,
  timeline: new Array<TweetWithPosition>(),
  activeFont,
  fontSize,
  theme: localStorage.getItem('theme') || 'light',
  isSidePanel: location.pathname.endsWith('sidepanel.html'),
  [LICENSE_KEY]: null as License | null,
  isDownloadingMedia: false,
  downloadMediaCount: 0,
  downloadedMediaCount: 0,
  // when downloading media, store the ids of the tweets that need to be downloaded and cancel them if necessary
  downloadedIds: new Array<number>(),
  isTagging: false,
  hasShownAIModal: !!localStorage.getItem('hasShownAIModal'),
  hasShowUpgradeModal: !!localStorage.getItem('hasShowUpgradeModal'),
})

const store = createStore(defaultState())

const [state, setStore] = store

type StoreType = typeof state

export const isFilterVisible = () =>
  state.category || state.folder || state.keyword

export const mutateStore = (fn: (state: StoreType) => void) =>
  setStore(produce(fn))

export default store
