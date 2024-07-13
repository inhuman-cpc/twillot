import browser from 'webextension-polyfill'
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { Monitor } from './trigger'
import { TriggerContext, TriggerReuqestBody } from './trigger.type'

describe('Trigger Module', () => {
  beforeEach(() => {
    global.chrome = browser
    browser.reset()
  })

  it('Monitor.getRealTrigger should return the correct trigger', () => {
    const body = {
      variables: { attachment_url: 'http://example.com' },
    } as TriggerReuqestBody
    const trigger = Monitor.getRealTrigger('CreateTweet', body)
    expect(trigger).toBe('CreateQuote')
  })

  it('Monitor.getRealTrigger should return the correct trigger for CreateReply', () => {
    const body = {
      variables: { reply: { in_reply_to_tweet_id: '123' } },
    } as TriggerReuqestBody
    const trigger = Monitor.getRealTrigger('CreateTweet', body)
    expect(trigger).toBe('CreateReply')
  })

  it('Monitor.getRealTrigger should return the correct trigger for CreateTweet', () => {
    const body = {
      variables: {},
    } as TriggerReuqestBody
    const trigger = Monitor.getRealTrigger('CreateTweet', body)
    expect(trigger).toBe('CreateTweet')
  })

  it('Monitor.getContext should return the correct context for CreateTweet', () => {
    const request = { variables: { tweet_id: '123' } } as TriggerReuqestBody
    const response = {
      data: { create_tweet: { tweet_results: { result: { rest_id: '456' } } } },
    }
    const context = Monitor.getContext('CreateTweet', request, response)
    expect(context).toEqual({ destination: '456' })
  })

  it('Monitor.postContentScriptMessage should post a message to the content script', () => {
    const trigger = 'CreateTweet'
    const request = {
      url: '/url',
      method: 'POST',
      body: {
        variables: { attachment_url: 'http://example.com' },
        features: {},
      },
    } as TriggerContext['request']
    const response = {
      status: 200,
      statusText: 'OK',
      body: {
        data: {
          create_tweet: { tweet_results: { result: { rest_id: '456' } } },
        },
      },
    }
    window.postMessage = vi.fn()
    Monitor.postContentScriptMessage(trigger, request, response)
    expect(window.postMessage).toHaveBeenCalled()
  })
})
