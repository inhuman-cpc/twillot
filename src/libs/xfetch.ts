export enum FetchError {
  TimeoutError = 'TimeoutError',
  IdentityError = 'IdentityError',
  // 通用错误
  NetworkError = 'NetworkError',
}

export default async function fetchWithTimeout(
  url: string,
  options: RequestInit | undefined,
  timeout = 2800,
) {
  const controller = new AbortController()
  const signal = controller.signal
  options = options || {}
  options.signal = signal
  let timer

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('Fetch request timed out')
      error.name = FetchError.TimeoutError
      reject(error)
      controller.abort()
    }, timeout)
  })

  try {
    const response = await Promise.race([fetch(url, options), timeoutPromise])
    return response as Response
  } catch (error) {
    throw error
  } finally {
    clearTimeout(timer)
  }
}
