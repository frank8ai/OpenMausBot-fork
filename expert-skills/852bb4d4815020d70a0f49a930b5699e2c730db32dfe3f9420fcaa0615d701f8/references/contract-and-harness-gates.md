# Reference 2: Contract-as-Code Gatekeeper Templates (TypeSpec + Spectral + Buf + D2 + XState)

## 1. TypeSpec Single-Source API Contract (`main.tsp` + `tspconfig.yaml`)

Never hand-author sprawling 2,000-line OpenAPI YAML files. Author concise `.tsp` contracts and compile deterministically in CI.

```tsp
// contracts/main.tsp
import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi3";

using TypeSpec.Http;
using TypeSpec.Rest;

@service({ title: "Domain Execution API" })
@server("https://api.internal.example.com/v1", "Production Endpoint")
namespace DomainService;

/** RFC 9457 Problem Details envelope for deterministic error handling */
@error
model ProblemDetails {
  type: url;
  title: string;
  @statusCode status: int32;
  detail: string;
  code: "RATE_LIMITED" | "IDEMPOTENCY_CONFLICT" | "UPSTREAM_CIRCUIT_OPEN" | "VALIDATION_FAILED";
  traceId: string;
  retryAfterSeconds?: int32;
}

enum JobLifecycleState {
  Queued: "QUEUED",
  Running: "RUNNING",
  Succeeded: "SUCCEEDED",
  FailedTerminal: "FAILED_TERMINAL",
  Compensated: "COMPENSATED",
}

model CreateJobRequest {
  @minLength(1) @maxLength(128)
  tenantId: string;
  payloadHash: string;
}

model JobResource {
  @key id: string;
  state: JobLifecycleState;
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

@route("/jobs")
interface Jobs {
  @post
  create(
    /** Mandatory on all non-idempotent mutations */
    @header("Idempotency-Key") @minLength(16) @maxLength(64) idempotencyKey: string,
    @body body: CreateJobRequest,
  ): {
    @statusCode statusCode: 202;
    @body job: JobResource;
  } | ProblemDetails;
}
```

```yaml
# contracts/tspconfig.yaml
emit:
  - "@typespec/openapi3"
options:
  "@typespec/openapi3":
    emitter-output-dir: "{project-root}/generated/openapi"
    openapi-versions:
      - 3.1.0
```

---

## 2. Stoplight Spectral Hard Gate (`.spectral.yaml`)

```yaml
extends: ["spectral:oas"]
rules:
  operation-idempotency-key-on-mutations:
    description: "Every POST/PATCH operation MUST declare an Idempotency-Key header parameter."
    severity: error
    given: "$.paths[*][post,patch]"
    then:
      field: parameters
      function: schema
      functionOptions:
        schema:
          type: array
          contains:
            type: object
            properties:
              name: { const: "Idempotency-Key" }
              in: { const: "header" }
              required: { const: true }
            required: ["name", "in", "required"]

  no-unbounded-array-responses:
    description: "2xx list responses MUST paginate or declare maxItems to prevent memory OOM."
    severity: error
    given: "$.paths[*].get.responses[200].content['application/json'].schema"
    then:
      field: type
      function: pattern
      functionOptions:
        notMatch: "^array$"
```

---

## 3. Buf CLI Breaking-Change Gate (`buf.yaml`)

```yaml
version: v2
lint:
  use:
    - STANDARD
breaking:
  use:
    - WIRE_JSON
```

CI Gate Commands (Zero-Interactive):
```bash
CI=1 tsp compile contracts/main.tsp --warn-as-error < /dev/null
CI=1 spectral lint generated/openapi/openapi.yaml --fail-severity=error < /dev/null
CI=1 buf lint && CI=1 buf breaking --against '.git#branch=main' < /dev/null
```

---

## 4. Harness Unidirectional Layering Gate (OpenAI Ryan Lopopolo Standard)

Enforce strictly acyclic intra-domain imports:
`Types (0) → Config (1) → Repo (2) → Service (3) → Runtime (4) → UI (5)`
Cross-cutting capabilities (`auth`, `telemetry`, `model-gateway`, `feature-flags`) enter ONLY via `Providers`.
Write custom AST/lint error messages that **teach the downstream coding agent the exact remediation path** rather than emitting cryptic failures.
