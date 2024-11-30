import { createSignal, Show } from 'solid-js'

import { openNewTab } from 'utils/browser'
import { findRecords, iterate } from 'utils/db/tweets'
import {
  getMediaItemsIncludeQuote,
  getTweetsContainsMedia,
} from 'utils/api/twitter-media'
import { exportData } from 'utils/exporter'
import { Host } from 'utils/types'
import { MemberLevel } from 'utils/license'

import { IconClose, IconCrown } from '../components/Icons'
import {
  EXPORT_FORM_FIELDS,
  EXPORT_MEDIA_FIELDS,
  getExportFields,
  getMediaSavePath,
  MAX_EXPORT_SIZE,
  MAX_MEDIA_EXPORT_SIZE,
  PRICING_URL,
} from '../libs/member'
import dataStore, { mutateStore } from './store'
import Spinner from '../components/Spinner'
import { useMemberLevel } from '~/hooks/useMemberLevel'

const [store, setStore] = dataStore

const ExportPage = () => {
  const level = useMemberLevel()
  const [maxMediaRows, setMaxMediaRows] = createSignal(
    MAX_MEDIA_EXPORT_SIZE[level()],
  )
  const isLimited = () =>
    maxMediaRows() < MAX_MEDIA_EXPORT_SIZE[MemberLevel.Pro]
  const maxRows = () => MAX_EXPORT_SIZE[level()]
  const onRadioChange = (row, field) => {
    if (row.level > level) {
      alert(
        row.level === MemberLevel.Pro
          ? 'Unlock unlimited exporting to access this feature.'
          : 'You need upgrade your membership level to access this feature.',
      )
    }

    if (field.name === 'action_type') {
      if (row.value === 'csv') {
        setMaxMediaRows(MAX_MEDIA_EXPORT_SIZE[MemberLevel.Pro])
      } else {
        setMaxMediaRows(MAX_MEDIA_EXPORT_SIZE[level()])
      }
    } else if (field.name === 'file_format') {
      document
        .querySelectorAll(
          'input[name="unroll"][value="yes"], input[name="metadata"][value="yes"]',
        )
        .forEach((el: HTMLElement) => {
          el.click()
        })
    }
  }
  const exportBookmarks = async (e) => {
    e.preventDefault()
    const form: HTMLFormElement = e.target
    const params: any = {}
    EXPORT_FORM_FIELDS.forEach((field) => {
      params[field.name] = form[field.name].value
    })
    let minLevel = MemberLevel.Free
    if (params.metadata === 'yes' || params.unroll === 'yes') {
      minLevel = MemberLevel.Basic
    }

    if (level() < minLevel) {
      openNewTab(PRICING_URL)
      return
    }

    const max = MAX_EXPORT_SIZE[level()]
    if (store.totalCount?.total > max) {
      alert(
        `Max ${max} rows reached, unlock unlimited exporting to export more.`,
      )
    }

    const records = await findRecords(
      '',
      '',
      '',
      '',
      Math.min(store.totalCount?.total, max),
    )
    if (records.length === 0) {
      alert('No bookmarks found.')
      return
    }

    if (params.file_format === 'csv') {
      exportData(
        records.map((i) => ({
          ...i,
          is_thread: i.is_thread || i.conversations?.length > 0,
          url: `${Host}/${i.screen_name}/status/${i.tweet_id}`,
          full_text:
            level() < MemberLevel.Basic
              ? i.full_text
              : i.conversations?.length
                ? i.full_text +
                  '\n' +
                  i.conversations.map((i) => i?.full_text || '').join('\n')
                : i.full_text,
        })),
        'CSV',
        'twillot-bookmarks.csv',
        getExportFields(level(), params.file_format),
      )
    } else if (params.file_format === 'json') {
      exportData(records, 'JSON', 'twillot-bookmarks.json')
    }
  }
  const exportMedia = async (e) => {
    e.preventDefault()
    const form: HTMLFormElement = e.target
    const params: any = {}
    EXPORT_MEDIA_FIELDS.forEach((field) => {
      params[field.name] = form[field.name].value
    })
    params['custom_save_path'] = form['custom_save_path']?.value
    const records = await getTweetsContainsMedia(
      params.media_type,
      true,
      maxMediaRows(),
    )
    const mediaList = []
    for (const record of records) {
      const list = getMediaItemsIncludeQuote(record, params.media_type)
      mediaList.push(...list)
    }

    if (params.action_type === 'csv') {
      exportData(
        mediaList,
        'CSV',
        `twillot-${params.media_type === 'all' ? 'media' : params.media_type}-files.csv`,
        {
          media_url: 'Media URL',
          tweet_id: 'Post ID',
          tweet_url: 'Post URL',
          user_id: 'User ID',
          username: 'Username',
          screen_name: 'Screen Name',
          folder: 'Folder',
          created_at: 'Created At',
        },
      )
    } else if (params.action_type === 'media') {
      if (params.save_mode === 'custom' && !params.custom_save_path) {
        alert('Please set a custom save path.')
        return
      }

      let isCanceled = false
      setStore({
        isDownloadingMedia: true,
        downloadMediaCount: mediaList.length,
        downloadedMediaCount: 0,
        downloadedIds: [],
      })

      for (const item of mediaList) {
        // 可能随时取消
        if (!store.isDownloadingMedia) {
          isCanceled = true
          break
        }

        try {
          const filename = getMediaSavePath(
            item,
            params.save_mode,
            params.custom_save_path,
          )
          const id = await chrome.downloads.download({
            url: item.media_url,
            filename,
          })
          mutateStore((state) => {
            state.downloadedMediaCount += 1
            state.downloadedIds.push(id)
          })
        } catch (error) {
          console.error(error, item)
          setStore({
            downloadedMediaCount: store.downloadedMediaCount + 1,
          })
        }
      }
      setStore({
        isDownloadingMedia: false,
        downloadMediaCount: 0,
        downloadedMediaCount: 0,
        downloadedIds: [],
      })
      alert(
        isCanceled
          ? 'Download canceled.'
          : 'Your media files have been downloaded completely.',
      )
    }
  }

  const cancelDownloadMeida = async () => {
    // 先取消之前未完成的下载任务
    for (let index = 0; index < store.downloadedIds.length; index++) {
      const element = store.downloadedIds[index]
      await chrome.downloads.cancel(element)
    }
    setStore({
      isDownloadingMedia: false,
      downloadMediaCount: 0,
      downloadedMediaCount: 0,
      downloadedIds: [],
    })
  }

  return (
    <div class="container mx-auto p-4 text-base">
      <div class="mb-4 rounded-md border border-gray-200 p-4 dark:border-gray-700">
        <div class="w-full border-b pb-4 pt-2 text-lg font-bold text-gray-900 outline-none dark:border-gray-600  dark:border-b-[#121212]  dark:bg-[#121212] dark:text-white">
          Export Bookmarks
        </div>

        <div class="relative overflow-x-auto p-4 sm:rounded-lg">
          <form class="mx-auto block max-w-3xl" onSubmit={exportBookmarks}>
            {EXPORT_FORM_FIELDS.map((field) => {
              return (
                <div class="mb-4 flex gap-8">
                  <label class="mb-2 block w-32 text-right font-medium text-gray-900 dark:text-white">
                    {field.label}:
                  </label>
                  <fieldset class="flex-1">
                    {field.data.map((row, index) => (
                      <div class="mb-4 flex items-center text-sm">
                        <input
                          id={`${field.name}_${index}`}
                          type="radio"
                          value={row.value}
                          name={field.name}
                          class="h-4 w-4 border-gray-300 focus:ring-2 focus:ring-blue-300 dark:border-gray-600 dark:bg-gray-700 dark:focus:bg-blue-600 dark:focus:ring-blue-600"
                          checked={row.value === field.default}
                          onChange={() => onRadioChange(row, field)}
                        />
                        <label
                          for={`${field.name}_${index}`}
                          class="ms-2 flex cursor-pointer items-center font-medium text-gray-900 dark:text-gray-300"
                        >
                          {row.label}
                          <a
                            class="ml-2 flex scale-75 text-yellow-400"
                            href={PRICING_URL}
                            target="_blank"
                          >
                            {new Array(row.level).fill(0).map((_) => (
                              <IconCrown />
                            ))}
                          </a>
                        </label>
                      </div>
                    ))}
                  </fieldset>
                </div>
              )
            })}

            <div class="mb-4 flex gap-8">
              <label class="mb-2 block w-32 text-right font-medium text-gray-900 dark:text-white">
                Rows Limited:
              </label>
              <div class="flex-1 text-sm">
                <p class="flex cursor-pointer items-center font-medium text-gray-900 dark:text-gray-300">
                  {level() > MemberLevel.Basic ? 'Unlimited' : maxRows()}
                </p>
              </div>
            </div>
            <div class="my-5">
              <button
                type="submit"
                class="mb-2 me-8 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
              >
                <Show when={isLimited()} fallback="Unlimited Download">
                  Download
                </Show>
              </button>
              <Show when={isLimited()}>
                <a
                  href={PRICING_URL}
                  target="_blank"
                  class="mb-2 me-2 inline-block rounded-lg bg-gradient-to-br from-purple-600 to-blue-500 px-5 py-2.5 text-center text-sm font-medium text-white hover:bg-gradient-to-bl focus:outline-none focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-800"
                >
                  Unlock Unlimited Exporting
                </a>
              </Show>
            </div>
          </form>
        </div>
      </div>

      <div class="mb-4 rounded-md border border-gray-200 p-4 dark:border-gray-700">
        <div class="w-full border-b pb-4 pt-2 text-lg font-bold text-gray-900 outline-none dark:border-gray-600  dark:border-b-[#121212]  dark:bg-[#121212] dark:text-white">
          Export Media Files from Bookmarks
        </div>

        <div class="relative overflow-x-auto p-4 sm:rounded-lg">
          <form class="mx-auto block max-w-3xl" onSubmit={exportMedia}>
            {EXPORT_MEDIA_FIELDS.map((field) => {
              return (
                <div class={`mb-4 flex gap-8`}>
                  <label class="mb-2 block w-32 text-right font-medium text-gray-900 dark:text-white">
                    {field.label}:
                  </label>
                  <fieldset class="flex-1">
                    {field.data.map((row, index) => (
                      <div class="mb-4 flex items-center text-sm">
                        <input
                          id={`${field.name}_${index}`}
                          type="radio"
                          value={row.value}
                          name={field.name}
                          class="h-4 w-4 border-gray-300 focus:ring-2 focus:ring-blue-300 dark:border-gray-600 dark:bg-gray-700 dark:focus:bg-blue-600 dark:focus:ring-blue-600"
                          checked={row.value === field.default}
                          onChange={() => onRadioChange(row, field)}
                        />
                        <label
                          for={`${field.name}_${index}`}
                          class="ms-2 flex min-w-80 cursor-pointer items-center font-medium text-gray-900 dark:text-gray-300"
                        >
                          {typeof row.label === 'string'
                            ? row.label
                            : row.label()}
                          <a
                            class="ml-2 flex scale-75 text-yellow-400"
                            href={PRICING_URL}
                            target="_blank"
                          >
                            {new Array(row.level).fill(0).map((_) => (
                              <IconCrown />
                            ))}
                          </a>
                        </label>
                      </div>
                    ))}
                  </fieldset>
                </div>
              )
            })}

            <div class="mb-4 flex gap-8">
              <label class="mb-2 block w-32 text-right font-medium text-gray-900 dark:text-white">
                Rows Limited:
              </label>
              <div class="flex-1 text-sm">
                <p class="flex items-center font-medium text-gray-900 dark:text-gray-300">
                  <Show when={isLimited()} fallback="Unlimited">
                    {maxMediaRows()}
                  </Show>
                </p>
              </div>
            </div>

            <div class="my-5 flex">
              <Show
                when={store.isDownloadingMedia}
                fallback={
                  <button
                    type="submit"
                    class={`mb-2 me-8 flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800`}
                  >
                    <Show when={isLimited()} fallback="Unlimited Download">
                      Download
                    </Show>
                  </button>
                }
              >
                <button
                  type="button"
                  title="Click to cancel downloading"
                  onClick={cancelDownloadMeida}
                  class={`mb-2 me-8 flex w-36 items-center justify-center gap-2 rounded-lg bg-red-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-4 focus:ring-red-300 dark:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-800`}
                >
                  <Spinner className="h-5 w-5 fill-white text-gray-400 dark:text-gray-400" />
                  <span class="text-xs">
                    {store.downloadedMediaCount}/{store.downloadMediaCount}
                  </span>

                  <IconClose className="h-5 w-5" />
                </button>
              </Show>

              <Show when={isLimited()}>
                <a
                  href={PRICING_URL}
                  target="_blank"
                  class="mb-2 me-4 inline-block rounded-lg bg-gradient-to-br from-purple-600 to-blue-500 px-5 py-2.5 text-center text-sm font-medium text-white hover:bg-gradient-to-bl focus:outline-none focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-800"
                >
                  Unlock Unlimited Exporting
                </a>
              </Show>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default ExportPage
