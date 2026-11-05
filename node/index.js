const segment = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new TypeError('Invalid Flow or run identifier');
  return value;
};

export class FlowApiError extends Error {
  constructor(status, code) {
    super('Flow API returned HTTP ' + status + ' (' + code + ')');
    this.status = status;
    this.code = code;
  }
}

export class FlowClient {
  #origin;
  #token;
  constructor({baseUrl, token}) {
    const url = new URL(baseUrl);
    if (!(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) ||
        url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new TypeError('Use an HTTPS origin or local loopback');
    if (!token || /\s/.test(token)) throw new TypeError('Missing or invalid server token');
    this.#origin=url.origin;
    this.#token=token;
  }
  async #request(path, options={}, stream=false) {
    const headers = new Headers(options.headers);
    headers.set('Authorization','Bearer ' + this.#token);
    const response = await fetch(this.#origin + path,{...options,headers,redirect:'error',signal:options.signal ?? AbortSignal.timeout(30000)});
    if (!response.ok) {
      const body = await response.json().catch(()=>null);
      throw new FlowApiError(response.status, body?.error?.code ?? body?.code ?? 'request_failed');
    }
    return stream ? response : response.json();
  }
  describe(flow) { return this.#request('/v1/pipelines/' + segment(flow)); }
  start(flow, input, idempotencyKey) {
    if (!idempotencyKey || !idempotencyKey.trim()) throw new TypeError('A stable idempotency key is required');
    return this.#request('/v1/pipelines/' + segment(flow) + '/runs',{method:'POST',
      headers:{'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify({input})});
  }
  get(id, signal) { return this.#request('/v1/runs/' + segment(id),{signal}); }
  cancel(id) { return this.#request('/v1/runs/' + segment(id) + '/cancel',{method:'POST'}); }
  artifact(id, asset) { return this.#request('/v1/runs/' + segment(id) + '/artifacts/' + segment(asset),{},true); }
  async wait(id,{timeoutMs=120000,intervalMs=1000}={}) {
    if(!Number.isSafeInteger(timeoutMs)||!Number.isSafeInteger(intervalMs)||timeoutMs<=0||intervalMs<=0)throw new TypeError('Positive timeout and interval required');
    const deadline=Date.now()+timeoutMs;
    while(Date.now()<deadline) {
      const result=await this.get(id,AbortSignal.timeout(Math.max(1,deadline-Date.now())));
      if(['succeeded','failed','canceled'].includes(result.status))return result;
      await new Promise(resolve=>setTimeout(resolve,Math.min(intervalMs,Math.max(0,deadline-Date.now()))));
    }
    throw new Error('Polling timed out. Resume with the same run ID.');
  }
}
