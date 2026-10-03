/** Gradual boundary types. Existing editor/store migration is intentionally separate. */
export interface HistoryVersion { id: string; revision: string; at: number }
export interface HistoryResponse { items: HistoryVersion[]; content?: string }
export interface ApiFailure { code?: string; message: string }
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure | string }
export async function readerRequest<T>(route: string, init?: RequestInit): Promise<T> {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
  const response = await fetch(base + '/api' + route, init)
  const result: ApiResult<T> = await response.json()
  if (!response.ok || !result.ok) {
    const error = !result.ok ? result.error : undefined
    throw new Error(typeof error === 'string' ? error : error?.message || `请求失败（${response.status}）`)
  }
  return result.data
}
