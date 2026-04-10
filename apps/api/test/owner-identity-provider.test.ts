import assert from "node:assert/strict";
import test from "node:test";
import {
  mapCloudflareIdpTypeToPortalIdentityProvider,
  parseBootstrapOwnerIdentityProvider,
  selectBootstrapOwnerAccessUser
} from "../src/lib/owner-identity-provider.ts";

test("parseBootstrapOwnerIdentityProvider accepts the supported branded providers", () => {
  assert.equal(
    parseBootstrapOwnerIdentityProvider("cloudflare_github"),
    "cloudflare_github"
  );
  assert.equal(
    parseBootstrapOwnerIdentityProvider("cloudflare_google"),
    "cloudflare_google"
  );
});

test("parseBootstrapOwnerIdentityProvider rejects missing and legacy OTP values", () => {
  assert.throws(
    () => parseBootstrapOwnerIdentityProvider(undefined),
    /OWNER_IDENTITY_PROVIDER must be set/
  );
  assert.throws(
    () => parseBootstrapOwnerIdentityProvider("cloudflare_one_time_pin"),
    /OWNER_IDENTITY_PROVIDER must be set/
  );
});

test("mapCloudflareIdpTypeToPortalIdentityProvider maps Cloudflare last-seen IdP types", () => {
  assert.equal(
    mapCloudflareIdpTypeToPortalIdentityProvider("github"),
    "cloudflare_github"
  );
  assert.equal(
    mapCloudflareIdpTypeToPortalIdentityProvider("google"),
    "cloudflare_google"
  );
  assert.equal(
    mapCloudflareIdpTypeToPortalIdentityProvider("onetimepin"),
    "cloudflare_one_time_pin"
  );
  assert.equal(
    mapCloudflareIdpTypeToPortalIdentityProvider("unknown"),
    null
  );
});

test("selectBootstrapOwnerAccessUser requires a last-seen identity that matches the declared provider", () => {
  const selectedUser = selectBootstrapOwnerAccessUser(
    [
      {
        email: "owner@example.com",
        id: "user-1",
        uid: "uid-1"
      }
    ],
    "owner@example.com",
    "cloudflare_google",
    new Map([
      [
        "user-1",
        {
          idpType: "google",
          userUuid: "subject-1"
        }
      ]
    ])
  );

  assert.deepEqual(selectedUser, {
    email: "owner@example.com",
    uid: "subject-1"
  });

  assert.throws(
    () =>
      selectBootstrapOwnerAccessUser(
        [
          {
            email: "owner@example.com",
            id: "user-1",
            uid: "uid-1"
          }
        ],
        "owner@example.com",
        "cloudflare_google",
        new Map([
          [
            "user-1",
            {
              idpType: "github",
              userUuid: "subject-1"
            }
          ]
        ])
      ),
    /last seen via cloudflare_google/
  );
});
