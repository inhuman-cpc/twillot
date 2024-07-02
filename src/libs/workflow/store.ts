import { unwrap } from 'solid-js/store'

import { readConfig, upsertConfig } from '../../libs/db/configs'
import dataStore, { mutateStore } from '../../options/store'
import { OptionName, OptionStoreField } from '../../types'
import { getTweetConversations, getUserById } from '../api/twitter'
import { addRecords, countRecords, deleteRecord, getRecord } from '../db/tweets'
import { getTasks, removeTask } from './task'
import { ClientPageStorageKey, Workflow } from './types'
import { TRIGGER_LIST, Trigger } from './trigger.type'
import { Action, ActionKey, ClientActionKey } from './actions'
import { getCurrentUserId, setLocal } from '../storage'
import {
  defaultCommentTemplates,
  defaultWorkflows,
  defaultSignatureTemplates,
  defaultCommentTemplateName,
  defaultSignatureTemplateName,
} from './defaults'
import { getLicense, isFreeLicense } from '../license'

const [store] = dataStore

function isSameAction(action1: Action, action2: Action) {
  if (action1.name !== action2.name) {
    return false
  }

  const inputs1 = action1.inputs || []
  const inputs2 = action2.inputs || []

  return inputs1.join(',') === inputs2.join(',')
}

export const getUnusedWhen = () => {
  const usedWhens = new Set(store.workflows.map((w) => w.when))
  const unusedWhens = TRIGGER_LIST.map((t) => t.name).filter(
    (action: Trigger) => !usedWhens.has(action),
  )
  return (unusedWhens.length > 0 ? unusedWhens[0] : 'CreateBookmark') as Trigger
}

export const isWorkflowUnchanged = async (index: number) => {
  const workflow = store.workflows[index]
  const workflowsDB = ((await readConfig(OptionName.WORKFLOW))?.option_value ||
    []) as Workflow[]
  const dbWorkflow = workflowsDB.find((wDB) => wDB.id === workflow.id)
  if (dbWorkflow) {
    return 'name,when,thenList'
      .split(',')
      .every((key) =>
        key === 'thenList'
          ? workflow.thenList.every((t, i) =>
              isSameAction(t, dbWorkflow.thenList[i]),
            )
          : workflow[key] === dbWorkflow[key],
      )
  } else {
    return !workflow.name || workflow.thenList.length < 1
  }
}

/**
 * 仅更新 store 中的数据，不更新数据库
 */
export const addWorkflow = () => {
  const newWorkflow: Workflow = {
    id: Date.now().toString(16),
    name: '',
    editable: true,
    unchanged: true,
    when: getUnusedWhen(),
    thenList: [
      {
        name: 'AutoComment',
        inputs: [
          store.templates.length > 0
            ? store.templates[0].content
            : defaultCommentTemplates[0].content,
        ],
      },
    ],
  }
  mutateStore((state) => {
    state.workflows.unshift(newWorkflow)
  })
}

export const renameWorkflow = (index: number, value: string) => {
  mutateStore(async (state) => {
    const current = state.workflows[index]
    current.name = value
    current.unchanged = await isWorkflowUnchanged(index)
  })
}

/**
 * 保存到数据库，仅更新一条记录
 */
export const saveWorkflow = async (index: number) => {
  if (store.workflows.length === 0) {
    return
  }

  const workflow = unwrap(store.workflows[index])
  const dbRecords = await readConfig(OptionName.WORKFLOW)
  let workflows = []
  delete workflow.unchanged
  // 如果数据库中没有记录，则直接插入
  if (!dbRecords) {
    workflows.push(workflow)
  } else {
    workflows = dbRecords.option_value as Workflow[]
    const posIndex = workflows.findIndex((w) => w.id === workflow.id)
    if (posIndex > -1) {
      workflows[posIndex] = workflow
    } else {
      workflows.unshift(workflow)
    }
  }
  await upsertConfig({
    option_name: OptionName.WORKFLOW,
    option_value: workflows,
  })
  mutateStore((state) => {
    state.workflows[index].unchanged = true
  })

  console.log('Workflow saved to database', workflows)
  await setLocal({ [ClientPageStorageKey.Workflows]: workflows })
}

export const removeWorkflow = async (index: number) => {
  const id = store.workflows[index].id
  const dbRecords = await readConfig(OptionName.WORKFLOW)
  const dbWorkflows = (dbRecords?.option_value || []) as Workflow[]
  const isDbItem = dbWorkflows.some((w) => w.id === id)
  mutateStore(async (state) => {
    state.workflows.splice(index, 1)
    if (isDbItem) {
      const items = unwrap(state.workflows)
      await upsertConfig({
        option_name: OptionName.WORKFLOW,
        option_value: items,
      })
      await setLocal({ [ClientPageStorageKey.Workflows]: items })
    }
  })
}

export const getWorkflows = async () => {
  const dbRecords = await readConfig(OptionName.WORKFLOW)
  let workflows = (dbRecords?.option_value || []) as Workflow[]
  if (!workflows || !workflows.length) {
    workflows = [...defaultWorkflows]
    await upsertConfig({
      option_name: OptionName.WORKFLOW,
      option_value: workflows,
    })
  }
  workflows.forEach((w) => {
    w.unchanged = true
  })
  mutateStore((state) => {
    state.workflows = workflows
  })
  await setLocal({ [ClientPageStorageKey.Workflows]: workflows })
  return workflows
}

export const getTemplates = async (option_key: string) => {
  const option_name = OptionName[option_key]
  const dbRecords = await readConfig(option_name)
  let templates: any[] = dbRecords?.option_value || []
  if (!templates.length) {
    if (option_key === 'COMMENT_TEMPLATE') {
      templates = [...defaultCommentTemplates]
    } else if (option_key === 'SIGNATURE_TEMPLATE') {
      const userProfile = await getUserById(await getCurrentUserId())
      const desc = userProfile.data.user.result.legacy.description
      if (desc) {
        templates = [
          {
            id: new Date().getTime().toString(16),
            name: 'My Profile',
            content: '📢📢📢📢\n' + desc,
            createdAt: Math.floor(Date.now() / 1000),
          },
        ]
      }
    }
    await upsertConfig({
      option_name,
      option_value: templates,
    })
  }
  if (option_key === 'COMMENT_TEMPLATE') {
    const hasDefault = templates.some(
      (t) => t.name === defaultCommentTemplateName,
    )
    if (!hasDefault) {
      templates.push(defaultCommentTemplates[0])
    }
  } else if (option_key === 'SIGNATURE_TEMPLATE') {
    const hasDefault = templates.some(
      (t) => t.name === defaultSignatureTemplateName,
    )
    if (!hasDefault) {
      templates.push(defaultSignatureTemplates[0])
    }
  }
  mutateStore((state) => {
    console.log('update templates', option_key, templates)
    state[OptionStoreField[option_key]] = templates
  })
  return templates
}

export const updateWhen = (workflowIndex: number, newWhen: Trigger) => {
  mutateStore(async (state) => {
    const current = state.workflows[workflowIndex]
    current.when = newWhen
    current.unchanged = await isWorkflowUnchanged(workflowIndex)
  })
}

/**
 * 仅添加到内存中，还没有同步到数据库
 */
export const addThen = (index: number) => {
  mutateStore(async (state) => {
    const current = state.workflows[index]
    current.thenList.push({
      name: 'AutoComment',
      inputs: [store.templates[0]?.content || ''],
    })
    current.unchanged = await isWorkflowUnchanged(index)
  })
}

export const removeThen = (workflowIndex: number, thenIndex: number) => {
  const workflow = store.workflows[workflowIndex]
  if (workflow.thenList.length === 1) {
    return
  }

  mutateStore(async (state) => {
    const current = state.workflows[workflowIndex]
    state.workflows[workflowIndex].thenList.splice(thenIndex, 1)
    current.unchanged = await isWorkflowUnchanged(workflowIndex)
  })
}

export const updateThen = (
  workflowIndex: number,
  thenIndex: number,
  actionKey: ActionKey | ClientActionKey,
) => {
  let newThen: Action
  if (actionKey === 'AutoComment') {
    newThen = {
      name: 'AutoComment',
      inputs: [store.templates[0].content],
    }
  } else {
    newThen = {
      name: actionKey,
    }
  }

  mutateStore(async (state) => {
    const current = state.workflows[workflowIndex]
    // 一个 workflow 只能加一个同类型 action
    const index = current.thenList.findIndex((t) => t.name === newThen.name)
    current.thenList[thenIndex] = newThen
    if (index > -1) {
      state.workflows[workflowIndex].thenList.splice(index, 1)
    }
    current.unchanged = await isWorkflowUnchanged(workflowIndex)
  })
}

export const updateAction = (
  workflowIndex: number,
  thenIndex: number,
  content: string,
) => {
  mutateStore(async (state) => {
    const current = state.workflows[workflowIndex]
    current.thenList[thenIndex].inputs = [content]
    current.unchanged = await isWorkflowUnchanged(workflowIndex)
  })
}

/**
 * Precondition for task execution: sync the latest bookmark data (mainly the sortIndex field)
 */
export async function executeAllTasks() {
  const tasks = await getTasks()
  console.log('execute tasks', tasks)
  for (const task of tasks) {
    console.log('execute task', task)
    /**
     * Automatically sync threads
     */
    if (task.name === 'UnrollThread') {
      const dbItem = await getRecord(task.tweetId)
      if (dbItem) {
        const conversations = await getTweetConversations(task.tweetId)
        if (conversations) {
          dbItem.conversations = conversations
          await addRecords([dbItem], true)
          mutateStore((state) => {
            const index = state.tweets.findIndex(
              (t) => t.tweet_id === task.tweetId,
            )
            if (index > -1) {
              state.tweets[index].conversations = conversations
            }
          })
        } else {
          console.log('no conversations found for tweet', task.tweetId)
        }
      } else {
        console.error(
          `Bookmark is not found in database for tweet ${task.tweetId}`,
        )
      }
    } else if (task.name === 'DeleteBookmark') {
      const record = await deleteRecord(task.tweetId)
      if (!record) {
        console.log('record not found for tweet', task.tweetId)
      } else {
        const totalCount = await countRecords()
        mutateStore((state) => {
          const index = state.tweets.findIndex(
            (t) => t.tweet_id === task.tweetId,
          )
          if (index > -1) {
            state.tweets.splice(index, 1)
          }
          if (record.folder) {
            state.folders[record.folder] -= 1
          }
          state.totalCount = totalCount
          state.selectedTweet = -1
        })
      }
    } else {
      console.error(`task ${task.name} not supported`)
    }
    await removeTask(task.id)
  }
}
