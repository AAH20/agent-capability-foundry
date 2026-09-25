# Agent Capability Foundry

**Package a business workflow as an executable, inspectable agent capability.** The first pack is `support-resolution`: investigate a ticket, propose an answer, require a human approval before closure, check separate reviewer acceptance, and account for the full cost of accepted work.

This release includes a **synthetic reference** plus CapabilityOps local staging. It has no real reviewers or deployed agent. It gives capability authors a strict pack contract, deterministic runner, offline verifier, metadata-only customer-export intake, local review queue, an MCP staging fixture, and an artifact-level gate for reports from [MCP Compatibility](https://github.com/AAH20/mcp-compatibility), [mcp-redteam](https://github.com/AAH20/mcp-redteam), and [Verified Effects Runtime](https://github.com/AAH20/verified-effects-runtime). A passing artifact gate creates a **candidate**, never a production authorization.

**Agent Capability Studio** adds a local interactive gallery for two runnable synthetic workflows: support resolution and invoice routing. Visitors can run a demo, inspect case outcomes and invented cost arithmetic, download the pack, and fork it locally. [Start the Studio](#agent-capability-studio) or read its [architecture and scope](docs/STUDIO.md).

## Agent Capability Studio

```bash
npm ci
npm run studio
# Open http://127.0.0.1:4327/
```

The CLI exposes the same catalog without a browser:

```bash
npm run studio:list
node src/studio-cli.js run invoice-routing --output reports/invoice-routing.json
node src/studio-cli.js install invoice-routing --output local/invoice-routing.pack.json
node src/studio-cli.js fork invoice-routing my-invoice-flow --output local/my-invoice-flow.pack.json
node src/studio-cli.js run local/my-invoice-flow.pack.json
```

The browser and CLI use a fixed local catalog; the server binds to loopback. The invoice example routes **fictional** invoices to review queues and cannot pay suppliers or connect to accounting software. Downloading a pack creates an editable file, not a hosted deployment. The Studio's path to community publishing and paid operations is a proposal, not a service claimed here.

## Run the pack

Node.js 20+; no credentials are needed. Install the MCP SDK dependency before running.

```bash
git clone https://github.com/AAH20/agent-capability-foundry.git
cd agent-capability-foundry
npm ci
npm run demo
node src/cli.js verify packs/support-resolution/pack.json reports/support-resolution.json
npm test
```

## CapabilityOps staging

```bash
npm run ops:demo
node src/ops-cli.js import examples/ticket-export.json --output reports/ticket-queue.json
```

The staging command exercises real MCP protocol calls against a **loopback synthetic ticket provider**. It reads all four cases, makes two distinct approved writes, replays each write to check idempotency within the fixture process, and records outcomes and costs. The import command accepts only customer-supplied ticket IDs, statuses, and timestamps; it makes no external request. A digest-bound local review command is also available, but reviewer labels are unverified and never authorize provider writes. See the [CapabilityOps architecture and release gates](docs/CAPABILITYOPS.md).

The four declared cases produce one accepted resolution, one wrong answer rejected, one correct answer held because approval is missing, and one closed ticket rejected during independent acceptance. The synthetic fixture receives four closure attempts, but records only two distinct effects. All seven cost categories total **210 invented USD cents**, or **210 cents per accepted resolution** across the four eligible cases. These are arithmetic fixture values, not customer economics or evidence of durable external exactly-once effects.

The runner checks the pack's minimum acceptance rate and maximum cost per accepted resolution. `verify` independently recomputes the report from the pack and detects changed output, but the pack author controls the reference answers: verification proves arithmetic and integrity, **not** real-world correctness.

## What is in a capability pack?

The [versioned example pack](packs/support-resolution/pack.json) declares its required tool names, the approval boundary, acceptance rule, synthetic cases, complete cost categories, and outcome targets. All seven cost categories are mandatory: inference, retrieval, infrastructure, human review, rework, operations, and allocated setup. Costs are nonnegative integer cents to avoid floating-point accounting surprises.

```mermaid
flowchart LR
  Pack[Versioned capability pack] --> Validate[Contract validation]
  Validate --> Runner[Synthetic workflow runner]
  Runner --> Approval[Human approval fixture]
  Approval --> Effect[Synthetic idempotent closure fixture]
  Effect --> Acceptance[Independent acceptance fixture]
  Acceptance --> Metrics[Accepted work and all-in cost]
  Metrics --> Receipt[Digest-bound report]
  Receipt --> Verify[Offline recalculation]
```

The [architecture guide](docs/ARCHITECTURE.md) documents the implemented boundaries and the proposed path to integrated deployments.

## Consume the other projects' reports

The gate reads existing JSON formats without altering those projects. Obtain reports against your **owned staging endpoint**:

```bash
# MCP Compatibility: edit the URL in the example and set STAGING_MCP_TOKEN.
node ../mcp-compatibility/src/cli.js run examples/compatibility-workload.json --json reports/compatibility.json

# mcp-redteam: independent HTTP probes can attempt a real tools/call.
node ../mcp-redteam/dist/src/cli.js scan --json --url https://YOUR-OWNED-STAGING-ENDPOINT.example/mcp --header "Authorization: Bearer $STAGING_MCP_TOKEN" > reports/redteam.json

# Verified Effects Runtime: checks its own runtime, not this deployed pack.
node ../verified-effects-runtime/dist/cli.js --output reports/effects.json > /dev/null

node src/cli.js gate packs/support-resolution/pack.json reports/support-resolution.json \
  --compat reports/compatibility.json \
  --redteam reports/redteam.json \
  --effects reports/effects.json \
  --output reports/candidate-gate.json
```

These commands are examples for local sibling checkouts after those projects are built. The Foundry does not install or invoke them automatically. The gate checks that required tools are listed, declared anonymous-access expectations pass, the five default HTTP red-team scenarios complete without high-severity findings, and all eight effect-runtime conformance scenarios pass. It does **not** bind the three reports cryptographically to the same endpoint or show that the pack's closure used Verified Effects Runtime. `productionEligible` is always `false` in this release.

## Release scope

| Implemented | Required before a customer deployment |
| --- | --- |
| Versioned synthetic pack and deterministic runner | Customer-owned data and a consented pilot |
| Explicit approval and separate acceptance states | Authenticated reviewer identity and approval record |
| Synthetic duplicate-effect convergence | Durable effect runtime wired to the actual provider |
| All-in cost per accepted resolution | Measured invoices, labor allocation, and case-mix review |
| Artifact-level candidate gate | Provenance tying one target, build, policy, and run together |
| Offline report recalculation | Live endpoint adapters and staged rollback |
| Local metadata export and review snapshot | Customer permission, authenticated reviewers, durable queue |
| Loopback MCP staging calls and ephemeral replay checks | Customer endpoint integration and durable effect reconciliation |

The public pack format and runner are the open layer. A later commercial service could maintain private customer packs, connectors, deployment operations, and outcome monitoring once a real pilot demonstrates demand. No hosted service is included here.

## Development

```bash
npm run check
npm test
```

CI runs the tests on Node 20, 22, and 24. Apache-2.0 · Ahmed Hassan / A2Z SOC.
