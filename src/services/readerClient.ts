export interface ReaderSuccess<T>{ok:true;data:T}
export class ReaderError extends Error{
 constructor(message:string,public code:string,public status:number,public details?:unknown){super(message)}
}
export async function requestEnvelope<T>(endpoint:string,init:RequestInit={}):Promise<ReaderSuccess<T>>{
 const base=(import.meta.env.BASE_URL||'/').replace(/\/+$/,'')
 const response=await fetch(base+'/api'+endpoint,init)
 let value:unknown
 try{value=await response.json()}catch{throw new ReaderError(`接口返回异常（${response.status}）`,'INVALID_RESPONSE',response.status)}
 if(!value||typeof value!=='object'||!('ok' in value))throw new ReaderError('接口返回格式无效','INVALID_RESPONSE',response.status)
 const result=value as {ok:boolean;data:T;error?:string;code?:string;details?:unknown}
 if(!response.ok||result.ok!==true)throw new ReaderError(result.error||'请求失败',result.code||'REQUEST_FAILED',response.status,result.details)
 return {ok:true,data:result.data}
}
export function readerApi<T>(method:string,endpoint:string,payload?:unknown){
 return requestEnvelope<T>(endpoint,{method,...(method==='GET'?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(payload||{})})})
}
