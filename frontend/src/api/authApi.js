import { apiGet, apiPost } from './apiClient'

export function login(username, password) {
  return apiPost('/api/v1/auth/login', {
    username,
    password,
  })
}

export function logout() {
  return apiPost('/api/v1/auth/logout', {})
}

export function refreshToken(refreshToken) {
  return apiPost('/api/v1/auth/refresh', {
    refresh_token: refreshToken,
  })
}

export function getCurrentUser() {
  return apiGet('/api/v1/auth/me')
}