# Hosted Worker Network Egress Baseline

This document defines the network egress, allowlist, and secret-exfiltration boundary for ParetoProof's hosted workers.

The goal is to stop hosted workers from behaving like generic internet-connected containers. Hosted workers should be dark compute nodes with a narrow outbound contract that is small enough to reason about, reproduce across environments, and enforce mechanically.

## Current baseline

The surrounding hosted-worker scopes already imply a restrictive network posture:

- the platform baseline requires hosted workers to fail closed on network egress outside the approved hosted policy
- the Modal topology baseline fixes hosted workers as outbound-only dark compute nodes behind the control plane
- the credential and provider-capability baselines define the secret classes and provider families workers may hold
- the isolation baseline defines which files and mounted secrets must never escape the leased workspace boundary
- the observability and runbook baselines define the operator evidence and incident posture when something goes wrong

What is still missing is the accepted network boundary that answers:

- which outbound destinations are required for normal hosted execution
- whether ParetoProof uses an allowlist or a denylist model
- how redirects, raw IPs, private-address resolution, and signed artifact URLs are handled
- which network actions count as secret or evidence exfiltration
- what workers and operators should observe when network policy blocks an action

Without that baseline, later implementation could easily drift into broad outbound internet access with only soft conventions about what workers "should not" call.

## Decision

ParetoProof should treat hosted-worker networking as a strict class-based allowlist, not as general outbound internet access with a small forbidden-host denylist.

The accepted rule is:

1. hosted workers may connect only to a small set of approved destination classes
2. every approved class must map to control-plane-owned product purpose
3. anything outside those classes is forbidden by default
4. blocked egress must fail closed and surface an operator-meaningful reason
5. overrides may temporarily widen a class only through explicit operator-approved policy, never through worker self-configuration

Hosted-worker network policy is therefore part of the product security boundary, not just an infrastructure convenience setting.

## Approved outbound classes

Hosted workers should have only four approved outbound destination classes in MVP.

### 1. Control-plane internal API

Workers must be able to reach the ParetoProof control plane for:

- registration
- claim
- heartbeat renewal
- execution-event append
- artifact registration and finalize flows
- terminal result or terminal failure submission

The approved product target is the ParetoProof backend internal worker surface on the canonical API host, not arbitrary internal service addresses discovered by the worker itself.

The worker should use the environment-approved API origin supplied by operator configuration. It must not accept user-supplied overrides for that origin during normal hosted serving.

### 2. Approved provider endpoints

Workers may reach the exact provider-owned API hosts required for the hosted provider families and auth modes explicitly approved by the provider-capability baseline.

For the current hosted-worker scope, that means:

- only the currently supported hosted provider family
- only the operator-owned machine-auth path for that provider family
- only the provider-owned HTTPS hosts needed for that approved request flow

Workers must not infer provider allowlisting from a model name, SDK default, or arbitrary user input. If a provider host is not explicitly approved for the environment and supported provider family, the worker must treat it as forbidden.

### 3. Signed artifact transfer targets

Workers may reach short-lived artifact upload or download targets only when the control plane has already issued a signed artifact URL or equivalent signed transfer intent for a specific registered artifact.

The allowed target is the exact signed-transfer destination, not the whole storage vendor domain and not arbitrary object-storage buckets.

This class exists only for:

- uploading registered artifact bytes
- downloading exact control-plane-approved benchmark or run inputs when the transfer contract requires it

Workers must not use generic storage endpoints, unregistered object keys, or operator-provided bucket URLs outside the signed-transfer contract.

### 4. Minimal platform support destinations

Hosted workers may use the minimal platform-managed support destinations needed to resolve and complete the approved classes above, such as DNS or other runtime prerequisites provided by the hosting substrate.

This class does not authorize workers to call arbitrary internet destinations just because the runtime stack needs basic network plumbing. It exists only so the runtime can complete the explicitly approved product calls above.

## Default-forbidden destinations

Anything outside the approved classes is forbidden by default.

The forbidden set includes:

- browser-facing ParetoProof surfaces such as apex, auth, or portal routes when they are not part of the internal worker API
- arbitrary public internet hosts
- raw webhook, chat, email, pastebin, gist, or generic file-sharing endpoints
- arbitrary observability vendors, log sinks, or tracing backends not explicitly approved as part of the control-plane product path
- direct database, cache, or admin-service endpoints such as Neon, Railway internals, or other infrastructure consoles
- package registries, source-control hosts, or image registries during normal lease execution
- metadata endpoints and cloud-instance identity services
- loopback, link-local, RFC1918, ULA, or otherwise private-address targets unless a later explicit scope approves one of them
- raw IP literal destinations

The hosted worker should not have "some internet, plus a short list of obviously bad domains." It should have one small outbound contract and nothing else.

## Destination matching rules

The allowlist should be enforced against the effective outbound destination, not just against what the worker hoped it was calling.

The accepted matching rules are:

- match on approved hostname or signed-transfer target identity
- require TLS for all normal internet-routable destinations
- reject raw IP literals even if they happen to map to an approved service
- reject destinations that resolve to loopback, link-local, RFC1918, ULA, or metadata-service ranges
- reject redirects unless the final redirect target is still within the same approved destination class
- treat DNS resolution drift as policy-relevant evidence, not as a silent best-effort fallback

This matters because a network policy that checks only the first URL string is too easy to bypass through redirects, alternate hostnames, or private-address resolution.

## Redirect posture

Redirect-following must be narrow and explicit.

The accepted rule is:

- control-plane API requests should not rely on cross-host redirects in normal operation
- provider requests may follow redirects only when the final target remains inside the exact approved provider-owned host set for that supported family
- signed artifact transfers may follow redirects only when the redirect target is the exact storage host family approved by the signed transfer intent
- any redirect to a new unapproved host, raw IP, or private-address destination is a policy block, not a retry hint

Workers should classify redirect blocks separately from generic network timeouts because they indicate configuration drift or active policy violation.

## Secret and exfiltration boundary

Network policy is not only about "can the socket connect." It is also about what hosted workers are allowed to send where.

The secret and exfiltration boundary has three rules:

### 1. Secret-bearing material must never leave the approved destination class that already owns it

This includes:

- bootstrap credentials
- lease-scoped job tokens
- provider API keys or equivalent provider secrets
- signed artifact transfer URLs or bearer material

Those values may travel only in the approved request flow that already owns them. They must never be copied into provider prompts, artifact payloads, arbitrary HTTP headers, crash uploads, or log-export requests.

### 2. Benchmark and run evidence may move only through the control-plane-approved path

Benchmark inputs, prompts, outputs, traces, logs, and artifact bytes are allowed to leave the worker only through:

- provider requests required for the approved hosted execution flow
- control-plane event or finalize routes
- exact signed artifact transfers for registered artifact identities

Workers must not invent side-channel uploads for convenience, debugging, or "temporary" observability.

### 3. User or operator input must not widen egress scope

Hosted launches may choose approved benchmark, model, or pool settings, but they may not inject:

- arbitrary callback URLs
- arbitrary artifact destinations
- arbitrary provider base URLs
- arbitrary webhook or telemetry sinks
- arbitrary download URLs for lease execution

The worker may consume only operator-approved origins and control-plane-issued signed targets.

## Forbidden exfiltration examples

The policy should explicitly treat these as forbidden:

- sending bootstrap or job-token material to a provider endpoint
- posting worker logs or crash dumps to arbitrary public URLs
- uploading artifacts to a storage bucket that was not issued through the signed-transfer contract
- copying prompt or benchmark material to arbitrary web tools or diagnostics endpoints
- contacting metadata or identity endpoints to obtain broader credentials
- resolving an approved-looking hostname to a private address and sending secret-bearing traffic there

## Environment reproducibility rule

The hosted egress contract should be the same shape in `dev`, `staging`, and `prod`, even when the exact API origin, signed-transfer host, or provider project differs by environment.

The accepted rule is:

- environments may differ in concrete approved host values
- environments must not differ in destination classes or in the fail-closed policy model
- staging must prove the same egress posture production will enforce

If production relies on a narrower or materially different network policy than staging, rollout evidence is incomplete.

## Blocked-action behavior

When a network action is blocked by policy, the worker must fail closed with a classified reason rather than silently retrying forever or degrading into alternate transport behavior.

The accepted worker behavior is:

1. stop the blocked request immediately
2. classify the block with a stable reason such as:
   - `host_not_allowlisted`
   - `raw_ip_forbidden`
   - `private_address_forbidden`
   - `redirect_target_forbidden`
   - `signed_transfer_target_mismatch`
   - `provider_host_forbidden`
3. emit sanitized structured evidence through the control-plane-approved path if that path is still available
4. continue only when the block affects a non-critical auxiliary action that the product explicitly allows to be skipped
5. otherwise transition the lease toward controlled failure or recovery instead of guessing

Hosted workers must not respond to a block by:

- disabling certificate or hostname validation
- retrying the same action through a different arbitrary host
- falling back to a browser-origin or user-supplied URL
- logging raw secret-bearing request material for debugging

## Control-plane and operator consequences

Blocked network actions should be operator-visible through the observability model.

The minimum control-plane consequences are:

- a structured event with the policy-block reason class
- an alert when policy blocks threaten serving posture or indicate possible exfiltration attempts
- incident linkage when the block affects production serving, suggests credential risk, or indicates topology drift
- rollout-blocking evidence when the target environment cannot perform required approved egress

The runbook consequence is straightforward:

- blocked egress on required control-plane destinations means the pool is not healthy to serve
- blocked egress on required provider destinations means the pool is not eligible for that hosted capability
- blocked egress on forbidden destinations is healthy policy behavior, but repeated attempts should still be investigated if they suggest code drift or hostile behavior

## Override and change-control policy

Network policy overrides are allowed only through explicit operator change control.

An override may:

- add one new approved hostname or host family to an existing destination class
- narrow a class further during an incident
- temporarily disable a non-essential class in a lower environment for testing

An override may not:

- turn hosted workers into general outbound internet clients
- authorize browser-provided callback URLs
- bypass secret-exfiltration boundaries
- bypass the provider-capability matrix
- convert a forbidden private-address or metadata target into a normal serving dependency without a new scope decision

Production overrides should be time-bounded, attributable, and auditable just like the budget and rollout exceptions defined in the adjacent hosted-worker baselines.

## Relationship to adjacent scopes

This network baseline depends on and sharpens the surrounding hosted-worker scopes:

- `#917` defines hosted workers as outbound-only dark compute nodes behind the API
- `#918` defines the secret classes whose values must never cross the wrong egress boundary
- `#919` defines which provider families may appear in the approved provider destination class
- `#923` defines the artifact and residue boundaries that signed transfers and exfiltration rules must preserve
- `#924` defines the alert, incident, and redaction posture for blocked network actions
- `#925` defines the operator response when required egress is unavailable or forbidden egress is attempted
- `#928` defines the budget override posture that network overrides are not allowed to bypass

## Consequences for follow-up execution

This baseline should directly shape the next implementation slices:

- `#935` should enforce the class-based egress allowlist, raw-IP and private-address rejection, and reproducible environment policy
- `#942` should add regression coverage for secret emission, forbidden-host attempts, and blocked-destination handling across logs, events, artifacts, and failure paths
- later operator-facing work should surface blocked-egress posture and policy-drift evidence as first-class incident signals

## Out of scope

This scope does not:

- implement the enforcement mechanism yet
- choose one specific vendor feature or firewall product for enforcement
- redefine browser auth or user-facing auth handoff
- approve direct worker streaming to arbitrary observability backends

It defines the authoritative hosted-worker egress and exfiltration boundary that later infrastructure, worker, and operator work must honor.
