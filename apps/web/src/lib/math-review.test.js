import { describe, expect, it } from "bun:test";
import {
  findMathReviewDetail,
  getMathReviewFixtureDetails,
  parseMathReviewQueue,
  readMathReviewQueue
} from "./math-review.ts";

describe("math review fixtures", () => {
  it("defaults unknown queue searches to assigned review work", () => {
    expect(parseMathReviewQueue("?queue=release")).toBe("release");
    expect(parseMathReviewQueue("?queue=unknown")).toBe("assigned");
    expect(parseMathReviewQueue("")).toBe("assigned");
  });

  it("filters queue records by assignment, lane, and escalation state", () => {
    expect(readMathReviewQueue("assigned").items.map((item) => item.reviewId)).toEqual([
      "review-peer-problem9-submission",
      "review-release-package-candidate"
    ]);
    expect(readMathReviewQueue("triage").items.map((item) => item.reviewId)).toEqual([
      "review-triage-formalization"
    ]);
    expect(readMathReviewQueue("peer").items.map((item) => item.reviewId)).toEqual([
      "review-peer-problem9-submission"
    ]);
    expect(readMathReviewQueue("escalated").items.map((item) => item.reviewId)).toEqual([
      "review-triage-formalization",
      "review-release-package-candidate"
    ]);
  });

  it("keeps detail records parseable and line-comment ready", () => {
    const details = getMathReviewFixtureDetails();
    const peerDetail = findMathReviewDetail("review-peer-problem9-submission");

    expect(details).toHaveLength(3);
    expect(peerDetail?.sourceArtifact.availability).toBe("available");
    expect(peerDetail?.sourceArtifact.language).toBe("lean");
    expect(peerDetail?.comments[0]?.anchor).toMatchObject({
      anchorType: "line",
      path: "FirstProof/Problem9/Candidate.lean",
      startLine: 6
    });
    expect(findMathReviewDetail("missing-review")).toBeNull();
  });
});
