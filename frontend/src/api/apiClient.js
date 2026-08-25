const DEFAULT_API_BASE =
  'http://localhost:8000'

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  DEFAULT_API_BASE

function getStoredAuthToken() {
  try {
    return (localStorage.getItem('access_token') || '').replace(/^Bearer\s+/i, '')
  } catch {
    return ''
  }
}

function readJsonSafely(response) {
  return response.text().then((text) => {
    if (!text) return null

    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  })
}

function buildUrl(endpoint) {
  const normalizedBase = API_BASE.replace(/\/$/, '')

  const normalizedEndpoint = endpoint.startsWith('/')
    ? endpoint
    : `/${endpoint}`

  return `${normalizedBase}${normalizedEndpoint}`
}

async function request(endpoint, options = {}) {
  const token = getStoredAuthToken()

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(buildUrl(endpoint), {
    ...options,
    headers,
  })

  const payload = await readJsonSafely(response)

  if (!response.ok) {
    if (response.status === 401) {
      try {
        localStorage.removeItem('access_token')
      } catch {}

      window.dispatchEvent(new Event('auth:unauthorized'))
    }

    const validationDetail = Array.isArray(payload?.detail)
      ? payload.detail.map((item) => `${item.loc?.join('.') || 'request'}: ${item.msg}`).join('; ')
      : payload?.detail
    throw new Error(validationDetail || payload?.message || `API Error: ${response.status}`)
  }

  return payload
}

export async function apiRequest(endpoint, options = {}) {
  return request(endpoint, options)
}

export const apiGet = (endpoint, params = {}) => {
  const url = new URL(buildUrl(endpoint))

  Object.entries(params).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      url.searchParams.set(key, String(value))
    }
  })

  return request(url.pathname + url.search, {
    method: 'GET',
  })
}

export const apiPost = (endpoint, body = {}) =>
  request(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const apiPut = (endpoint, body = {}) =>
  request(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

export const apiPatch = (endpoint, body = {}) =>
  request(endpoint, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

export const apiDelete = (endpoint, body = {}) =>
  request(endpoint, {
    method: 'DELETE',
    body: JSON.stringify(body),
  })

export async function apiDownload(endpoint, params = {}) {
  const url = new URL(buildUrl(endpoint))
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  })
  const token = getStoredAuthToken()
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!response.ok) throw new Error(`API Error: ${response.status}`)
  return response.blob()
}

export async function checkBackendHealth() {
  return apiGet('/health')
}

export function setAuthToken(token) {
  try {
    if (token) {
      localStorage.setItem('access_token', token)
      return token
    }

    localStorage.removeItem('access_token')
    return null
  } catch {
    return token || null
  }
}

export function clearAuthToken() {
  try {
    localStorage.removeItem('access_token')
  } catch {}
}

export const API_URL = API_BASE

export { API_BASE }