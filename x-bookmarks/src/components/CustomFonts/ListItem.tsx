import { createMemo, onCleanup, onMount, Show } from 'solid-js'
import { FontSet } from '../../types'
import dataStore from '../../options/store'
import { IconCheck } from '../Icons'
import { createStyleSheet } from '../../libs/dom'

const previewTextList = [
  'The quick brown fox jumps over the lazy dog.',
  '狐狸快速跳过懒狗',
  'Le vif renard brun saute par-dessus le chien paresseux.',
  'El rápido zorro marrón salta sobre el perro perezoso.',
]

const ListItem = (props: { font: FontSet }) => {
  const [store, setStore] = dataStore
  const isApplied = createMemo(() => store.activeFont?.name === props.font.name)
  const applyFont = () => {
    if (isApplied()) {
      return
    }
    const link = document.getElementById(props.font.name)
    if (!link) {
      console.error('Link not found')
      return
    }
    localStorage.setItem('activeFont', JSON.stringify(props.font))
    setStore({ activeFont: props.font })
  }

  onMount(() => {
    createStyleSheet(props.font.url, props.font.name)
  })

  onCleanup(() => {
    const link = document.getElementById(props.font.name)
    if (link) {
      document.head.removeChild(link)
    }
  })

  return (
    <div class="flex flex-col items-start justify-center bg-white p-4 text-gray-700 shadow">
      <div class="mb-4 flex w-full items-center justify-start border-b border-gray-300 pb-2 text-base">
        <div class="flex-1">{props.font.name}</div>

        <Show when={isApplied()}>
          <div class="ml-4 flex items-center justify-center text-sm font-medium ">
            <IconCheck />
            Applied
          </div>
        </Show>
      </div>
      <div
        class="mb-4 text-lg"
        style={{ 'font-family': `"${props.font.name}"` }}
      >
        {previewTextList.map((text) => (
          <p class="mb-2">{text}</p>
        ))}
      </div>
      <Show when={!isApplied()}>
        <button
          type="button"
          onClick={applyFont}
          class="mx-auto mb-2 flex w-28 items-center justify-center rounded-lg border border-gray-300 bg-white py-2 text-sm font-medium text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-4 focus:ring-gray-100 dark:border-gray-600 dark:hover:border-gray-600  dark:focus:ring-gray-700"
        >
          Apply
        </button>
      </Show>
    </div>
  )
}

export default ListItem
