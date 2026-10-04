/** Gradual boundary types. Existing editor/store migration is intentionally separate. */
export interface HistoryVersion { id: string; revision: string; at: number }
export interface HistoryResponse { items: HistoryVersion[]; content?: string }
export interface ApiFailure { code?: string; message: string }
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure | string }
export {ReaderError} from '../services/readerClient'
import {requestEnvelope} from '../services/readerClient'
export async function readerRequest<T>(route:string,init?:RequestInit):Promise<T>{return (await requestEnvelope<T>(route,init)).data}
