export interface FlowRun { id:string; status:'queued'|'running'|'succeeded'|'failed'|'canceled'; outputs:Record<string,unknown>|null; error:{code:string;message:string;retryable:boolean}|null; statusUrl:string }
export interface FlowDescriptor { pipeline:{publicId:string;version:number;checksum:string;capabilityKey:string|null}; input:{fields:Record<string,unknown>}; output:{fields:Record<string,unknown>} }
export class FlowApiError extends Error { status:number; code:string }
export class FlowClient {
 constructor(options:{baseUrl:string;token:string});
 describe(flow:string):Promise<FlowDescriptor>;
 start(flow:string,input:Record<string,unknown>,idempotencyKey:string):Promise<FlowRun>;
 get(id:string,signal?:AbortSignal):Promise<FlowRun>;
 cancel(id:string):Promise<FlowRun>;
 artifact(id:string,asset:string):Promise<Response>;
 wait(id:string,options?:{timeoutMs?:number;intervalMs?:number}):Promise<FlowRun>;
}
