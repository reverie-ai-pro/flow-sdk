# REVERIE Flow SDK

Call a published Studio Flow from your own server with Node.js 20+, Python 3.9+ or curl. The clients use the Flow HTTP API v1 and have no application dependencies.

## Connect a Flow

1. In Studio, publish an executable section in the Flow editor. Open **Automations → Published**, select the Flow and issue a named access key. Save the full secret on your server when it is shown. Set an expiration date if appropriate.
2. Set `FLOW_ORIGIN` to the origin of the copied endpoint (HTTPS, or `http://127.0.0.1:3024` locally), `FLOW_ID` to its public identifier and `FLOW_TOKEN` to that Flow's key. The clients use `rvr_pipe_` Flow keys. Workspace application credentials for Runtime v2 have their own protocol.
3. Read the descriptor to discover the actual input names/types. Starting a run can spend credits. Save one stable `FLOW_REQUEST_ID` per business operation **before submitting**. A retry of the same payload uses the same key. A new operation uses a new key.

A Flow key pins the version that was published when you issued it. To move an integration to a new version, issue a second key after publication, read its descriptor, update your server, then revoke the old key. Costs and call counts remain attributed to each key.

## Install release 0.1.0

```sh
npm install https://github.com/reverie-ai-pro/flow-sdk/releases/download/v0.1.0/reverie-ai-pro-flow-sdk-0.1.0.tgz
python -m pip install https://github.com/reverie-ai-pro/flow-sdk/releases/download/v0.1.0/reverie_flow_sdk-0.1.0-py3-none-any.whl
```

## Read the contract (free of generation charges)

```sh
curl --fail-with-body -H "Authorization: Bearer $FLOW_TOKEN" "$FLOW_ORIGIN/v1/pipelines/$FLOW_ID"
```

## Call from Node.js

```js
import { FlowClient } from '@reverie-ai-pro/flow-sdk';
const client = new FlowClient({baseUrl:process.env.FLOW_ORIGIN, token:process.env.FLOW_TOKEN});
const descriptor = await client.describe(process.env.FLOW_ID);
console.log(descriptor.input.fields);
// Example for a Flow whose descriptor declares a text field named "input".
const run = await client.start(process.env.FLOW_ID, {input:'Hello'}, process.env.FLOW_REQUEST_ID);
const final = await client.wait(run.id);
console.log(final.status, final.outputs ?? final.error);
```

## Call from Python

```python
import os
from reverie_flow import FlowClient
client = FlowClient(os.environ["FLOW_ORIGIN"], os.environ["FLOW_TOKEN"])
flow = os.environ["FLOW_ID"]
print(client.describe(flow)["input"]["fields"])
run = client.start(flow, {"input": "Hello"}, os.environ["FLOW_REQUEST_ID"])
result = client.wait(run["id"])
print(result["status"], result["outputs"] or result["error"])
```

## HTTP

```sh
curl --fail-with-body -X POST "$FLOW_ORIGIN/v1/pipelines/$FLOW_ID/runs" \
  -H "Authorization: Bearer $FLOW_TOKEN" -H "Idempotency-Key: $FLOW_REQUEST_ID" \
  -H "Content-Type: application/json" -d '{"input":{"input":"Hello"}}'
# Set FLOW_RUN_ID to the id from the 202 response.
curl --fail-with-body -H "Authorization: Bearer $FLOW_TOKEN" "$FLOW_ORIGIN/v1/runs/$FLOW_RUN_ID"
```

A successful submission returns HTTP 202. Poll the run until `succeeded`, `failed` or `canceled`. A polling timeout leaves the run in progress. Resume with its ID or explicitly request cancellation. A transport error after submission can mean the server accepted the request.

| Operation | HTTP | SDK method |
| --- | --- | --- |
| Descriptor | GET /v1/pipelines/{flowId} | describe |
| Submit | POST /v1/pipelines/{flowId}/runs | start |
| Status and outputs | GET /v1/runs/{runId} | get, wait |
| Request cancellation | POST /v1/runs/{runId}/cancel | cancel |
| Download result | GET /v1/runs/{runId}/artifacts/{assetId} | artifact |

Artifact downloads use the same server credential. Node returns a streaming Response. In Python use `with client.artifact(run_id, asset_id) as file:`. An expired/revoked or mismatched key returns 401. A conflicting idempotency key returns 409. Use a server-side secret store and a separate key for each integration.

## Development

Run `node --test tests/client.test.mjs` from the repository root. The test runs both language clients against a local HTTP fixture. License: MIT.
