import {
  getMathReviewDecisionOutcomes,
  type MathReviewRecordDetail
} from "@paretoproof/shared";
import { type FormEvent, useEffect, useState } from "react";
import {
  addLineCommentToReview,
  escalateReview,
  recordReviewDecision,
  reassignPrimaryReview,
  resolveReviewComment,
  selfAssignReview,
  updateReviewChecklistItemState,
  type MathReviewActionContext
} from "../lib/math-review-actions";
import { findMathReviewDetail } from "../lib/math-review";
import { buildMathUrl, buildPortalUrl } from "../lib/surface";

function formatAnchor(anchor: MathReviewRecordDetail["comments"][number]["anchor"]) {
  if (anchor.anchorType === "line") {
    return `${anchor.path}:${anchor.startLine}${anchor.endLine === anchor.startLine ? "" : `-${anchor.endLine}`}`;
  }

  if (anchor.anchorType === "checklist_item") {
    return `Checklist item ${anchor.checklistItemId}`;
  }

  return `Field ${anchor.field}`;
}

function createActionContext(reviewerDisplayName: string): MathReviewActionContext {
  return {
    actorDisplayName: reviewerDisplayName,
    now: new Date().toISOString()
  };
}

function SourceViewer({ detail }: { detail: MathReviewRecordDetail }) {
  const artifact = detail.sourceArtifact;

  if (artifact.availability !== "available" || artifact.content === null) {
    return (
      <section className="math-review-source math-review-source-blocked">
        <div className="math-review-panel-subhead">
          <h2>{artifact.path}</h2>
          <span>{artifact.availability}</span>
        </div>
        <p>{artifact.reason ?? "This artifact is not available for inline review."}</p>
      </section>
    );
  }

  const lineComments = new Map<number, number>();

  for (const comment of detail.comments) {
    if (comment.anchor.anchorType !== "line") {
      continue;
    }

    for (let line = comment.anchor.startLine; line <= comment.anchor.endLine; line += 1) {
      lineComments.set(line, (lineComments.get(line) ?? 0) + 1);
    }
  }

  return (
    <section className="math-review-source">
      <div className="math-review-panel-subhead">
        <h2>{artifact.path}</h2>
        <span>{artifact.lineCount} lines</span>
      </div>
      <ol className="math-review-code-lines">
        {artifact.content.split(/\r?\n/u).map((line, index) => {
          const lineNumber = index + 1;
          const commentCount = lineComments.get(lineNumber) ?? 0;

          return (
            <li
              className={commentCount > 0 ? "math-review-code-line-commented" : undefined}
              data-line={lineNumber}
              key={`${lineNumber}:${line}`}
            >
              <span className="math-review-code-number">{lineNumber}</span>
              <code>{line || " "}</code>
              {commentCount > 0 ? (
                <span className="math-review-code-comment-marker">
                  {commentCount}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ChecklistPanel({
  detail,
  onDetailChange,
  reviewerDisplayName
}: {
  detail: MathReviewRecordDetail;
  onDetailChange: (detail: MathReviewRecordDetail) => void;
  reviewerDisplayName: string;
}) {
  return (
    <section className="math-review-side-section">
      <div className="math-review-panel-subhead">
        <h2>Checklist</h2>
        <span>{detail.reviewKind}</span>
      </div>
      <div className="math-review-checklist">
        {detail.checklistItems.map((item) => (
          <article
            className={`math-review-checklist-item math-review-checklist-${item.state}`}
            key={item.id}
          >
            <div>
              <strong>{item.label}</strong>
              <p>{item.rationale ?? "No rationale recorded."}</p>
            </div>
            <div className="math-review-checklist-state">
              <span>{item.state.replace("_", " ")}</span>
              <div className="math-review-checklist-actions">
                <button
                  disabled={!detail.capabilities.canUpdateChecklist}
                  onClick={() =>
                    onDetailChange(
                      updateReviewChecklistItemState(
                        detail,
                        item.id,
                        item.state === "satisfied" ? "open" : "satisfied",
                        createActionContext(reviewerDisplayName)
                      )
                    )
                  }
                  type="button"
                >
                  {item.state === "satisfied" ? "Reopen" : "Satisfy"}
                </button>
                <button
                  disabled={!detail.capabilities.canUpdateChecklist}
                  onClick={() =>
                    onDetailChange(
                      updateReviewChecklistItemState(
                        detail,
                        item.id,
                        item.state === "blocked" ? "open" : "blocked",
                        createActionContext(reviewerDisplayName)
                      )
                    )
                  }
                  type="button"
                >
                  {item.state === "blocked" ? "Clear block" : "Block"}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function AssignmentPanel({
  detail,
  onDetailChange,
  reviewerDisplayName
}: {
  detail: MathReviewRecordDetail;
  onDetailChange: (detail: MathReviewRecordDetail) => void;
  reviewerDisplayName: string;
}) {
  return (
    <section className="math-review-side-section">
      <div className="math-review-panel-subhead">
        <h2>Assignments</h2>
        <span>Round {detail.activeRound.roundNumber}</span>
      </div>
      <div className="math-review-assignment-list">
        {detail.activeRound.assignments.length > 0 ? (
          detail.activeRound.assignments.map((assignment) => (
            <div
              className="math-review-assignment"
              key={`${assignment.assignmentRole}:${assignment.assigneeDisplayName ?? "none"}`}
            >
              <span>{assignment.assignmentRole}</span>
              <strong>{assignment.assigneeDisplayName ?? "Unassigned"}</strong>
              <small>{assignment.state}</small>
            </div>
          ))
        ) : (
          <p>No active assignee.</p>
        )}
      </div>
      <div className="math-review-action-grid">
        <button
          disabled={!detail.capabilities.canSelfAssign}
          onClick={() =>
            onDetailChange(
              selfAssignReview(detail, createActionContext(reviewerDisplayName))
            )
          }
          type="button"
        >
          Self assign
        </button>
        <button
          disabled={!detail.capabilities.canReassignPrimary}
          onClick={() =>
            onDetailChange(
              reassignPrimaryReview(detail, createActionContext(reviewerDisplayName))
            )
          }
          type="button"
        >
          Reassign
        </button>
        <button
          disabled={!detail.capabilities.canEscalate}
          onClick={() =>
            onDetailChange(
              escalateReview(
                detail,
                "Escalated from the review workspace.",
                createActionContext(reviewerDisplayName)
              )
            )
          }
          type="button"
        >
          Escalate
        </button>
      </div>
    </section>
  );
}

function CommentPanel({
  detail,
  onDetailChange,
  reviewerDisplayName
}: {
  detail: MathReviewRecordDetail;
  onDetailChange: (detail: MathReviewRecordDetail) => void;
  reviewerDisplayName: string;
}) {
  const [draftBody, setDraftBody] = useState("");
  const [draftLine, setDraftLine] = useState("1");
  const canAddLineComment =
    detail.capabilities.canComment &&
    detail.sourceArtifact.availability === "available" &&
    detail.sourceArtifact.content !== null;

  function handleAddComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextDetail = addLineCommentToReview(
      detail,
      {
        body: draftBody,
        lineNumber: Number(draftLine)
      },
      createActionContext(reviewerDisplayName)
    );

    if (nextDetail !== detail) {
      setDraftBody("");
      onDetailChange(nextDetail);
    }
  }

  return (
    <section className="math-review-side-section">
      <div className="math-review-panel-subhead">
        <h2>Comments</h2>
        <span>{detail.comments.filter((comment) => comment.state === "open").length} open</span>
      </div>
      <div className="math-review-comments">
        {detail.comments.map((comment) => (
          <article className="math-review-comment" key={comment.id}>
            <div className="math-review-comment-head">
              <strong>{comment.authorDisplayName}</strong>
              <span>{formatAnchor(comment.anchor)}</span>
            </div>
            <p>{comment.body}</p>
            {comment.state === "open" ? (
              <button
                disabled={!detail.capabilities.canResolveComment}
                onClick={() =>
                  onDetailChange(
                    resolveReviewComment(
                      detail,
                      comment.id,
                      createActionContext(reviewerDisplayName)
                    )
                  )
                }
                type="button"
              >
                Resolve
              </button>
            ) : null}
            {comment.replies.map((reply) => (
              <div className="math-review-reply" key={reply.id}>
                <strong>{reply.authorDisplayName}</strong>
                <p>{reply.body}</p>
              </div>
            ))}
          </article>
        ))}
      </div>
      <form className="math-review-comment-form" onSubmit={handleAddComment}>
        <label>
          Line
          <input
            disabled={!canAddLineComment}
            max={Math.max(detail.sourceArtifact.lineCount, 1)}
            min="1"
            onChange={(event) => setDraftLine(event.currentTarget.value)}
            type="number"
            value={draftLine}
          />
        </label>
        <label>
          Comment
          <textarea
            disabled={!canAddLineComment}
            onChange={(event) => setDraftBody(event.currentTarget.value)}
            rows={3}
            value={draftBody}
          />
        </label>
        <button disabled={!canAddLineComment || draftBody.trim().length === 0} type="submit">
          Add line comment
        </button>
      </form>
    </section>
  );
}

function DecisionPanel({
  detail,
  onDetailChange,
  reviewerDisplayName
}: {
  detail: MathReviewRecordDetail;
  onDetailChange: (detail: MathReviewRecordDetail) => void;
  reviewerDisplayName: string;
}) {
  return (
    <section className="math-review-side-section">
      <div className="math-review-panel-subhead">
        <h2>Decisions</h2>
        <span>{detail.capabilities.canRecordDecision ? "available" : "locked"}</span>
      </div>
      <div className="math-review-decision-grid">
        {getMathReviewDecisionOutcomes(detail.reviewKind).slice(0, 4).map((outcome) => (
          <button
            disabled={!detail.capabilities.canRecordDecision}
            key={outcome}
            onClick={() =>
              onDetailChange(
                recordReviewDecision(
                  detail,
                  outcome,
                  `${outcome.replaceAll("_", " ")} recorded from the review workspace.`,
                  createActionContext(reviewerDisplayName)
                )
              )
            }
            type="button"
          >
            {outcome.replaceAll("_", " ")}
          </button>
        ))}
      </div>
      {detail.activeRound.decisionSummary ? (
        <p>{detail.activeRound.decisionSummary}</p>
      ) : null}
      <p>
        Review decisions stay separate from comments and do not publish or freeze packages.
      </p>
    </section>
  );
}

export function MathReviewDetail({
  reviewId,
  reviewerDisplayName = "Current reviewer"
}: {
  reviewId: string;
  reviewerDisplayName?: string;
}) {
  const [detail, setDetail] = useState(() => findMathReviewDetail(reviewId));

  useEffect(() => {
    setDetail(findMathReviewDetail(reviewId));
  }, [reviewId]);

  if (!detail) {
    return (
      <section className="math-review-panel">
        <div className="math-review-panel-head">
          <div>
            <p className="eyebrow">Math reviews</p>
            <h1>Review not found</h1>
            <p>This review record is not present in the current contract fixture.</p>
          </div>
          <a className="button button-secondary" href={buildMathUrl("/reviews")}>
            Back to reviews
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="math-review-detail">
      <div className="math-review-detail-head">
        <div>
          <p className="eyebrow">Math review detail</p>
          <h1>{detail.subjectLabel}</h1>
          <p>{detail.subjectSummary}</p>
        </div>
        <div className="math-review-detail-actions">
          <a className="button button-secondary" href={buildMathUrl("/reviews")}>
            Queues
          </a>
          <a className="button button-secondary" href={buildPortalUrl("/runs")}>
            Run evidence
          </a>
        </div>
      </div>
      <div className="math-review-status-grid">
        <span>{detail.reviewKind} review</span>
        <span>{detail.reviewPosture}</span>
        <span>{detail.subjectType.replace("_", " ")}</span>
        <span>Round {detail.activeRound.roundNumber}</span>
      </div>
      <div className="math-review-workspace">
        <SourceViewer detail={detail} />
        <aside className="math-review-side">
          <AssignmentPanel
            detail={detail}
            onDetailChange={setDetail}
            reviewerDisplayName={reviewerDisplayName}
          />
          <ChecklistPanel
            detail={detail}
            onDetailChange={setDetail}
            reviewerDisplayName={reviewerDisplayName}
          />
          <CommentPanel
            detail={detail}
            onDetailChange={setDetail}
            reviewerDisplayName={reviewerDisplayName}
          />
          <DecisionPanel
            detail={detail}
            onDetailChange={setDetail}
            reviewerDisplayName={reviewerDisplayName}
          />
        </aside>
      </div>
    </section>
  );
}
