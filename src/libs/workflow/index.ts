/**
 * bg 任务
 * 通常 bg 只是记录任务，并不执行具体的操作
 * 实际执行在 options 页面
 */

import { sendMessageToOptions } from '../browser'
import { ACTION_LIST } from './actions'
import { Emitter, TriggerContext } from './trigger'
import { Message, MessageType, Task, Workflow } from './types'

/**
 * 同时向 options 页面发送消息，通知任务已添加
 */
export async function addTask(task: Task) {
  let tasks = await getTasks()
  /**
   * 先取消删除再收藏会导致数据数据被删
   * 对任务做些过滤以及合并
   */
  if (task.name === 'UnrollThread') {
    tasks = tasks.filter(
      (t) => t.name !== 'DeleteBookmark' || t.tweetId !== task.tweetId,
    )
  }
  // 避免重复添加
  tasks = tasks.filter(
    (t) => t.name !== task.name || t.tweetId !== task.tweetId,
  )
  tasks.push(task)
  console.log('Current tasks:', tasks)
  await saveTasks(tasks)
  await sendMessageToOptions({ type: MessageType.SyncTasks, payload: task })
}

export async function getTasks(): Promise<Task[]> {
  const obj = await chrome.storage.local.get('tasks')
  return obj.tasks || []
}

export async function saveTasks(tasks: Task[]) {
  await chrome.storage.local.set({ tasks })
}

export async function removeTask(id: string) {
  const tasks = (await getTasks()) as Task[]
  const index = tasks.findIndex((task) => task.id === id)
  if (index !== -1) {
    tasks.splice(index, 1)
    await saveTasks(tasks)
  } else {
    console.warn(`task ${id} not found`)
  }
}

export async function getWorkflows(): Promise<Workflow[]> {
  const item = await chrome.storage.local.get('workflows')
  return item.workflows || []
}

/**
 * Options 页面同步工作流数据到 bg
 */
export function sendWorkflows(workflows: Workflow[]) {
  chrome.runtime.sendMessage({
    type: MessageType.GetWorkflows,
    payload: workflows,
  })
}

/**
 * Init workflows in bg
 */
export function initWorkflows() {
  const monitor = new Emitter()
  ACTION_LIST.forEach((action) => {
    // @ts-ignore
    monitor.register(action.name, action.handler)
  })

  chrome.runtime.onMessage.addListener((message: Message) => {
    if (message.type === MessageType.GetTriggerResponse) {
      monitor.emit(message.payload as TriggerContext)
    } else if (message.type === MessageType.GetWorkflows) {
      const workflows = message.payload as Workflow[]
      if (!workflows || workflows.length === 0) {
        return
      }

      chrome.storage.local.set({ workflows })
      monitor.workflows = workflows
    } else {
      console.log('Unknown message type:', message)
    }
  })
  monitor.init()
}
