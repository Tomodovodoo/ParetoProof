import type {
  WorkerExecutionEventCatalogEntry,
  WorkerJobTokenScopeCatalogEntry,
  WorkerTerminalFailureCatalogEntry
} from "../types/worker-control.js";

export const workerExecutionEventCatalog = [
  {
    id: "attempt_started",
    purpose:
      "The worker accepted a lease, materialized the offline bundle inputs, and started the bounded attempt lifecycle."
  },
  {
    id: "compile_started",
    purpose:
      "The current candidate entered authoritative Lean compilation as part of the attempt loop."
  },
  {
    id: "compile_succeeded",
    purpose:
      "Lean compilation passed for the current candidate and the worker can continue to verifier or proof-policy checks."
  },
  {
    id: "compile_failed",
    purpose:
      "Lean compilation failed for the current candidate and the worker recorded the failure before any repair or terminal stop decision."
  },
  {
    id: "compile_repair_requested",
    purpose:
      "The bounded compile-repair loop requested another generation pass after a compile failure that remains retryable within the attempt budget."
  },
  {
    id: "compile_repair_applied",
    purpose:
      "A compile repair candidate replaced the prior candidate and is ready for another compile attempt."
  },
  {
    id: "verifier_started",
    purpose:
      "The verifier and theorem-policy checks started for a candidate that already passed compilation."
  },
  {
    id: "verifier_passed",
    purpose:
      "The candidate satisfied the verifier and theorem-policy boundary and can finalize the bundle as a success."
  },
  {
    id: "verifier_failed",
    purpose:
      "The verifier produced a failing verdict for the current candidate before any allowed verifier-side repair step."
  },
  {
    id: "verifier_repair_requested",
    purpose:
      "The bounded verifier-repair loop requested another candidate after a verifier failure that remains repairable."
  },
  {
    id: "verifier_repair_applied",
    purpose:
      "A verifier repair candidate replaced the previous candidate and is ready to re-enter compilation or verification."
  },
  {
    id: "budget_exhausted",
    purpose:
      "One of the authoritative attempt ceilings was exhausted, forcing terminal stop semantics for the current attempt."
  },
  {
    id: "artifact_manifest_written",
    purpose:
      "The worker finalized the artifact manifest that maps bundle roles to uploaded or ingestable artifact references."
  },
  {
    id: "bundle_finalized",
    purpose:
      "The worker finished the offline-compatible terminal bundle boundary and is ready to submit success or terminal failure."
  }
] satisfies WorkerExecutionEventCatalogEntry[];

export const workerTerminalFailureCatalog = [
  {
    id: "provider_auth_error",
    purpose:
      "Provider authentication failed and the worker could not obtain a valid model response under the configured auth mode."
  },
  {
    id: "provider_rate_limited",
    purpose:
      "The upstream model provider throttled the request and the attempt stopped with a canonical provider-rate-limit outcome."
  },
  {
    id: "provider_transport_error",
    purpose:
      "A network or transport failure occurred at the provider boundary before a valid response could be consumed."
  },
  {
    id: "provider_timeout",
    purpose:
      "The provider request exceeded the allowed timeout window for the active attempt."
  },
  {
    id: "provider_cancelled",
    purpose:
      "The provider request was cancelled before producing a usable model response."
  },
  {
    id: "provider_refusal",
    purpose:
      "The provider returned a refusal instead of a candidate that the harness can treat as normal output."
  },
  {
    id: "provider_unsupported_request",
    purpose:
      "The requested model or feature combination is not supported by the selected provider backend."
  },
  {
    id: "provider_malformed_response",
    purpose:
      "The provider boundary returned malformed data before the harness could extract a valid candidate artifact."
  },
  {
    id: "provider_tool_contract_error",
    purpose:
      "The provider-side tool contract was violated in a way that prevented valid worker execution."
  },
  {
    id: "provider_internal_error",
    purpose:
      "The provider returned an internal failure that prevented further progress for the active attempt."
  },
  {
    id: "harness_bootstrap_failed",
    purpose:
      "The worker could not initialize the harness or offline bundle environment needed to start the attempt."
  },
  {
    id: "harness_crashed",
    purpose:
      "The harness crashed after attempt start and before a valid terminal bundle could be finalized."
  },
  {
    id: "harness_output_missing",
    purpose:
      "The harness completed an execution step without producing output files required by the run-bundle contract."
  },
  {
    id: "tool_bootstrap_failed",
    purpose:
      "A required tool layer such as Codex runtime, Lean toolchain, or verifier wrapper failed before normal execution."
  },
  {
    id: "tool_contract_violation",
    purpose:
      "A tool returned data outside the declared contract and the worker could not safely continue."
  },
  {
    id: "tool_permission_violation",
    purpose:
      "A tool attempted an operation outside the allowed permission profile for the run."
  },
  {
    id: "tool_use_outside_policy",
    purpose:
      "The model or harness attempted a tool call pattern that violates the prompt-run tool policy."
  },
  {
    id: "tool_result_missing",
    purpose:
      "A required tool invocation completed without the result artifact or structured payload the harness expected."
  },
  {
    id: "stuck_loop_detected",
    purpose:
      "The bounded generation loop stopped because the worker detected non-progressing repeated behavior."
  },
  {
    id: "wall_clock_budget_exhausted",
    purpose:
      "The attempt exceeded the authoritative wall-clock budget and must terminate."
  },
  {
    id: "provider_usage_budget_exhausted",
    purpose:
      "Provider token or spend ceilings were exhausted before the attempt produced a valid success bundle."
  },
  {
    id: "turn_budget_exhausted",
    purpose:
      "The overall bounded attempt loop used all allowed turns and must stop without further retries inside the attempt."
  },
  {
    id: "compile_repair_budget_exhausted",
    purpose:
      "Compile-side repairs hit their ceiling and the worker can no longer continue the attempt."
  },
  {
    id: "verifier_repair_budget_exhausted",
    purpose:
      "Verifier-side repairs hit their ceiling and the worker can no longer continue the attempt."
  },
  {
    id: "manual_cancelled",
    purpose:
      "An authorized cancellation request terminated the attempt before a normal success outcome."
  },
  {
    id: "compile_failed",
    purpose:
      "The terminal candidate failed Lean compilation and no further repair path remained."
  },
  {
    id: "candidate_output_missing",
    purpose:
      "No candidate artifact was produced for the attempt even though a candidate output was required."
  },
  {
    id: "candidate_output_malformed",
    purpose:
      "A candidate artifact existed but did not conform to the expected candidate-source contract."
  },
  {
    id: "candidate_file_outside_contract",
    purpose:
      "The produced candidate referenced files or paths outside the allowed benchmark/package contract."
  },
  {
    id: "forbidden_placeholder_token",
    purpose:
      "The candidate used a forbidden placeholder token such as `sorry` or `admit`."
  },
  {
    id: "theorem_reference_missing",
    purpose:
      "The candidate failed to reference the expected theorem target required by the benchmark package."
  },
  {
    id: "theorem_surface_drift_only",
    purpose:
      "The verifier observed surface drift without the semantic theorem identity required for acceptance."
  },
  {
    id: "theorem_semantic_mismatch",
    purpose:
      "The candidate proved a semantically different statement than the benchmark target."
  },
  {
    id: "extra_theorem_assumptions",
    purpose:
      "The candidate introduced additional assumptions that invalidate equivalence to the target theorem."
  },
  {
    id: "wrong_theorem_target",
    purpose:
      "The proof targeted a different theorem than the one named by the benchmark package."
  },
  {
    id: "forbidden_axiom_dependency",
    purpose:
      "The verifier detected a forbidden axiom or dependency outside the allowed proof-policy boundary."
  },
  {
    id: "environment_instability_detected",
    purpose:
      "The worker observed environment instability that makes the attempt result non-reproducible or unsafe to accept."
  },
  {
    id: "proof_policy_failed",
    purpose:
      "The candidate failed a proof-policy gate other than the more specific theorem or axiom checks above."
  },
  {
    id: "benchmark_input_missing",
    purpose:
      "Required benchmark package material was missing when the worker attempted to materialize the run."
  },
  {
    id: "benchmark_input_digest_mismatch",
    purpose:
      "Input package material existed but did not match the expected immutable benchmark digest."
  },
  {
    id: "lane_configuration_invalid",
    purpose:
      "The selected Lean lane or verifier lane configuration is invalid for this attempt."
  },
  {
    id: "prompt_package_missing",
    purpose:
      "The worker could not find the prompt package required to reproduce the assigned attempt."
  },
  {
    id: "run_configuration_invalid",
    purpose:
      "The run or attempt configuration failed validation before a valid terminal result could be produced."
  },
  {
    id: "worker_lease_lost",
    purpose:
      "The worker lease expired or was revoked before a terminal submission completed."
  }
] satisfies WorkerTerminalFailureCatalogEntry[];

export const workerJobTokenScopeCatalog = [
  {
    id: "heartbeat",
    purpose:
      "Allows the leased worker to renew liveness and receive cancellation or token-rotation responses for the active job."
  },
  {
    id: "event_append",
    purpose:
      "Allows the leased worker to append ordered execution events for the active attempt."
  },
  {
    id: "artifact_manifest_write",
    purpose:
      "Allows the leased worker to register the offline-bundle artifact manifest for the active attempt."
  },
  {
    id: "verifier_verdict_write",
    purpose:
      "Allows the leased worker to submit the structured verifier verdict data carried by terminal bundle messages."
  },
  {
    id: "result_finalize",
    purpose:
      "Allows the leased worker to finalize the attempt as a success with the bundle and verifier digests."
  },
  {
    id: "failure_finalize",
    purpose:
      "Allows the leased worker to finalize the attempt as a terminal failure with canonical classification metadata."
  }
] satisfies WorkerJobTokenScopeCatalogEntry[];
