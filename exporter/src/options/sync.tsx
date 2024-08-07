import { getCurrentUserId, getLocal, setLocal } from 'utils/storage'
import {
  getAllInstructionDetails,
  getInstructions,
  ResponseKeyPath,
} from 'utils/api/twitter-res-utils'
import {
  getPosts,
  getReplies,
  getMedia,
  getLikes,
  getFollowers,
} from 'utils/api/twitter-user'
import { toRecord } from 'utils/api/twitter'
import { FetchError } from 'utils/xfetch'
import { getRateLimitInfo } from 'utils/api/twitter-base'
import { Endpoint, TimelineTweet, Tweet } from 'utils/types'
import { createSchema, getObjectStore, indexFields, openDb } from 'utils/db'

import { mutateStore, TaskState } from './store'
import { getPostId } from 'utils/db/tweets'

const dbName = 'twillot'
const dbVersion = 2
const tableName = 'posts'

export async function initDb() {
  await openDb(dbName, dbVersion, function upgradeDb(db, transaction) {
    createSchema(
      db,
      transaction,
      tableName,
      'id',
      indexFields.concat({
        name: 'category_name',
        options: {
          unique: false,
          multiEntry: false,
        },
      }),
    )
  })
}

export async function upsertDocs(docs: Tweet[]) {
  const db = await openDb(dbName, dbVersion)

  return new Promise((resolve, reject) => {
    const { transaction: tx, objectStore } = getObjectStore(db, tableName)
    docs.forEach((doc) => {
      objectStore.put(doc)
    })
    tx.oncomplete = () => {
      resolve(true)
    }
    tx.onerror = () => {
      reject(false)
    }
  })
}

export async function startSyncTask(
  category: 'posts' | 'replies' | 'media' | 'likes' | 'followers',
  endpoint: Endpoint,
  func:
    | typeof getPosts
    | typeof getReplies
    | typeof getMedia
    | typeof getLikes
    | typeof getFollowers,
) {
  const uid = await getCurrentUserId()
  if (!uid) {
    console.error('User not logged in', category)
    return
  }

  const key = category + '_cursor'
  let result = await getLocal(key)
  let cursor = result[key]
  console.log('Last cursor:', category, cursor)
  let jsonPosts
  const finish = () => {
    mutateStore((state) => {
      state[category].total = state[category].done
      state[category].state = TaskState.finished
    })
  }

  while (true) {
    try {
      jsonPosts = await func(uid, cursor)
      mutateStore((state) => {
        state[category].state = TaskState.started
      })
    } catch (err) {
      if (err.name === FetchError.RateLimitError) {
        const rate_limit = getRateLimitInfo(endpoint, uid)
        mutateStore((state) => {
          state[category].state = TaskState.paused
          state[category].reset = rate_limit.reset
        })
      } else {
        console.error(err)
        mutateStore((state) => {
          state[category].state = TaskState.errored
        })
      }

      break
    }

    const instructions = getInstructions(
      jsonPosts,
      ResponseKeyPath[`user_${category}`],
    )
    const { cursorEntry, itemEntries, moduleEntries, moduleItems } =
      getAllInstructionDetails(instructions)
    const list = [
      ...itemEntries,
      ...moduleItems,
      ...moduleEntries,
    ] as TimelineTweet[]

    if (list.length < 1) {
      console.log('End of timeline reached, no data found', category)
      finish()

      /**
       * 如果已经获取不到数据了，退出循环
       * 记录上次的 cursor 到本地（不更新本次的 cursor），以便下次继续同步
       */
      break
    }

    const tweets = list.map((item) => {
      const tweet = toRecord(item, '')
      const key = getPostId(uid, tweet.tweet_id)
      tweet.sort_index = tweet.created_at.toString()
      tweet.id = key
      tweet.owner_id = uid

      return {
        ...tweet,
        category_name: category,
      }
    })

    try {
      await upsertDocs(tweets)
    } catch (err) {
      console.error(err)
      break
    }

    mutateStore((state) => {
      state[category].done += list.length
      state[category].reset = 0
    })

    if (cursorEntry) {
      cursor = cursorEntry
      await setLocal({ [key]: cursor })
    } else {
      console.log('End of timeline reached')
      finish()
      break
    }
  }
}
