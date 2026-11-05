import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {FlowClient} from '../node/index.js';
test('both clients send server credentials, a stable operation key and correctly read the run', async () => {
  let submissions=0;
  const server=createServer(async(req,res)=>{
    if(req.headers.authorization!=='Bearer synthetic') {res.writeHead(401);res.end('{}');return;}
    if(req.url==='/v1/pipelines/f' && req.method==='GET'){res.end('{"input":{"fields":{}}}');return;}
    if(req.url==='/v1/pipelines/f/runs' && req.method==='POST'){
      let data='';for await(const chunk of req)data+=chunk;
      assert.deepEqual(JSON.parse(data),{input:{input:'hello'}});assert.equal(req.headers['idempotency-key'],'op');submissions++;
      res.writeHead(202);res.end('{"id":"r","status":"queued"}');return;
    }
    if(req.url==='/v1/runs/r'){res.end('{"id":"r","status":"succeeded","outputs":{"text":"hello"}}');return;}
    res.writeHead(404);res.end('{}');
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  try {
    const baseUrl='http://127.0.0.1:'+server.address().port;
    const client=new FlowClient({baseUrl,token:'synthetic'});
    assert.ok((await client.describe('f')).input); const run=await client.start('f',{input:'hello'},'op');
    assert.equal((await client.wait(run.id)).outputs.text,'hello');
    assert.throws(()=>client.describe('..'));
    assert.throws(()=>new FlowClient({baseUrl:'http://remote.example',token:'s'}));
    const python=`from reverie_flow import FlowClient\nimport sys\nc=FlowClient(sys.argv[1],"synthetic")\nassert c.describe("f")["input"]\nr=c.start("f",{"input":"hello"},"op")\nassert c.wait(r["id"])["outputs"]["text"]=="hello"`;
    await promisify(execFile)('python3',['-c',python,baseUrl],{env:{...process.env,PYTHONPATH:'python'}});
    assert.equal(submissions,2);
  } finally {server.closeAllConnections();await new Promise(done=>server.close(done));}
});
