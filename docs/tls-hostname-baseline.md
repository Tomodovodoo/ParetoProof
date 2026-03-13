# TLS Hostname Baseline

This document defines the MVP TLS termination owner and Cloudflare proxy mode for every intended ParetoProof hostname. The goal is to remove ambiguity for later deployment, ingress, and rollback work without introducing extra hostnames or an early staging edge.

## Rules

- Cloudflare owns the public DNS zone and is the public TLS terminator for every live ParetoProof hostname.
- All live public hostnames stay proxied through Cloudflare. Do not expose Railway directly with a DNS-only record during the MVP.
- Cloudflare Pages-managed hostnames stay on the Pages edge path rather than bypassing Pages with manual DNS passthrough.
- The Railway API origin still uses HTTPS as the origin target, but that origin TLS is a platform-to-platform hop behind the Cloudflare edge, not the public certificate boundary.
- Workers do not receive a public hostname. Internal worker traffic stays behind the API route boundary and later internal Access policy rather than through a separate public DNS entry.
- Local development is not part of the public hostname matrix. `localhost` and workstation TLS are contributor-local concerns.

## Hostname Matrix

| Hostname | Surface | Origin platform | Public TLS terminator | Cloudflare mode | MVP rule |
| --- | --- | --- | --- | --- | --- |
| `paretoproof.com` | Public site apex | Cloudflare Pages (`paretoproof-web`) | Cloudflare | proxied | Keep on the Pages custom-domain path. Do not flatten this into a direct non-Cloudflare origin mapping. |
| `www.paretoproof.com` | Public site alias or redirect | Cloudflare Pages (`paretoproof-web`) | Cloudflare | proxied | Keep proxied and let Pages handle the alias or redirect behavior for the public site. |
| `auth.paretoproof.com` | Branded sign-in entry | Cloudflare Pages (`paretoproof-web`) | Cloudflare | proxied | Keep on Pages and behind the same Cloudflare edge policy as the other web hostnames. |
| `portal.paretoproof.com` | Contributor portal | Cloudflare Pages (`paretoproof-web`) plus Cloudflare Access | Cloudflare | proxied | Keep proxied so Access remains in the request path and the portal never resolves as a direct origin hostname. |
| `api.paretoproof.com` | Control-plane API | Railway service `api` in project `ParetoProof API` | Cloudflare | proxied | Keep proxied to preserve the Cloudflare-owned edge, Access integration for browser-facing portal routes, and a stable CNAME target to Railway. |

## Non-hostnames and deferred hostnames

- `api.paretoproof.com/internal/*` is an internal route namespace on the existing API hostname, not a second hostname. It inherits the `api.paretoproof.com` TLS and proxy rule.
- No public worker hostname exists in the MVP. Modal workers are outbound callers and must not receive a browsable or DNS-resolvable public ingress surface.
- No dedicated staging hostname exists in the MVP. Pre-production validation happens through local development and owner-controlled hosted configuration, not through a second public edge.
- `math.paretoproof.com` remains out of scope and should not receive DNS or TLS setup during the MVP.
- A future `ops.paretoproof.com` surface remains deferred. If it is ever introduced, it should start from the same default rule as other admin-sensitive surfaces: Cloudflare-terminated TLS and proxied ingress, not direct origin exposure.

## Operational implications

- Certificate ownership stays simple: the owner manages hostname attachment and certificates through Cloudflare, while origin platform certificates remain platform-managed internals.
- Rollback does not change proxy mode. Revert the Pages or Railway deployment behind a hostname instead of flipping a record from proxied to DNS-only during an incident.
- Later ingress-hardening work may narrow which routes are reachable, but it should not reopen the hostname TLS decision unless the public edge provider changes.
