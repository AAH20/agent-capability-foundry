# Architecture and release boundaries

## Implemented pack lifecycle

```mermaid
flowchart TD
  Pack[Pack JSON and synthetic cases] --> Schema[Strict schema and cost validation]
  Schema --> Cases[Deterministic case evaluator]
  Cases --> Quality[Compare proposal with fixture reference]
  Quality --> Approval{Human approval declared}
  Approval -->|no| Hold[Hold without closure]
  Approval -->|yes and quality passes| Close[Synthetic closure fixture]
  Close --> Replay[Replay same idempotency key]
  Replay --> Accept[Separate reviewer acceptance fixture]
  Hold --> Metrics[Eligible cases and complete cost]
  Accept --> Metrics
  Metrics --> Digest[Pack digest and report digest]
  Digest --> Verify[Offline recalculation]
```

The in-memory closure fixture is intentionally small. It demonstrates the effect identity contract and duplicate suppression **inside one process**, not crash recovery or exactly-once behavior against a real provider. Verified Effects Runtime owns the durable side-effect design; production integration must call it on the actual closure path rather than treating a separate conformance report as proof.

## Candidate gate across existing repositories

```mermaid
flowchart LR
  Pack[Validated pack] --> Gate[Artifact gate]
  Run[Synthetic run and verifier] --> Gate
  Compat[MCP Compatibility JSON] --> Gate
  RedTeam[mcp-redteam JSON] --> Gate
  Effects[Verified Effects conformance JSON] --> Gate
  Gate -->|any check fails| Blocked[Blocked]
  Gate -->|all checks pass| Candidate[Candidate only]
  Candidate --> Missing[Integrated provenance and pilot still required]
```

Each input retains its native schema. The gate checks fields rather than guessing from filenames. Because current reports are not bound to one deployed endpoint and effect implementation, there is no path from this gate to `productionEligible=true`.

## Evidence and cost model

```mermaid
classDiagram
  class CapabilityPack {
    +schemaVersion
    +id
    +version
    +contract
    +targets
    +cases
  }
  class Case {
    +ticket
    +referenceResolution
    +proposal
    +humanApproved
    +reviewerAccepted
    +costCents
  }
  class RunReport {
    +evidenceClass SYNTHETIC
    +packDigest
    +status
    +metrics
    +reportDigest
  }
  class CandidateGate {
    +status candidate or blocked
    +productionEligible false
    +four checks
  }
  CapabilityPack "1" o-- "1..1000" Case
  CapabilityPack --> RunReport
  RunReport --> CandidateGate
```

`totalCostCents` includes every declared category across **all eligible cases**, including rejected and held cases. `costPerAcceptedCents = totalCostCents / acceptedCases` when the denominator is nonzero; otherwise it is `null` and the pack fails its cost target. No cost-saving or causal claim follows from a synthetic reference fixture.

## Path to a deployable capability

```mermaid
flowchart TD
  Synthetic[Current synthetic pack] --> Endpoint[Owned staging MCP endpoint]
  Endpoint --> Compat[Run protocol and catalog compatibility]
  Endpoint --> Safety[Run authorized red-team probes]
  Endpoint --> Bound[Bind endpoint build policy and identity to one run]
  Bound --> Runtime[Wire durable effect runtime to actual closure]
  Runtime --> Human[Authenticate reviewer and record approval]
  Human --> Pilot[Consented read-only then controlled-action pilot]
  Pilot --> Measured[Measure accepted outcomes and all-in cost]
  Measured --> Review[Independent production release review]
```

The strongest next engineering increment is a staging adapter that invokes the actual `get_ticket` and `close_ticket` MCP tools against an isolated synthetic backend, with durable effect identity, a separately authenticated approval event, and one retained trace linking every report. That would replace the current artifact-only boundary with a real integrated test. Customer data, secrets, and privileged actions should enter only after that path passes and the customer authorizes a pilot.
