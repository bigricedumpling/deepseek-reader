import {requestEnvelope,ReaderError} from './readerClient'
import type {HistoryResponse} from '../contracts/reader'
export async function getHistory(path:string,version?:string):Promise<HistoryResponse>{
 const query=new URLSearchParams({path,...(version?{version}:{})})
 const {data}=await requestEnvelope<HistoryResponse>('/history?'+query)
 if(!Array.isArray(data?.items)||data.items.some(item=>typeof item.id!=='string'||typeof item.at!=='number'||typeof item.revision!=='string')||(version&&typeof data.content!=='string'))throw new ReaderError('历史版本数据无效','INVALID_RESPONSE',200)
 return data
}
