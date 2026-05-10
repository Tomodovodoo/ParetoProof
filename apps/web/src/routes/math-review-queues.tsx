import { mathReviewQueueTabs, type MathReviewQueueItem } from "@paretoproof/shared";
import { parseMathReviewQueue, readMathReviewQueue } from "../lib/math-review";
import { buildMathUrl } from "../lib/surface";

const reviewKindLabelById = {
  editor: "Editor",
  peer: "Peer",
  release: "Release",
  triage: "Triage"
} as const;

function formatQueueTime(value: string) {
  return value.replace("T", " ").replace(".000Z", "Z");
}

function QueueRow({ item }: { item: MathReviewQueueItem }) {
  const href = buildMathUrl(item.href);
  const blockedClass =
    item.gateSummary.state === "blocked"
      ? " math-review-signal-blocked"
      : item.gateSummary.state === "missing" || item.gateSummary.state === "stale"
        ? " math-review-signal-warning"
        : "";

  return (
    <a className="math-review-row" href={href}>
      <div className="math-review-row-main">
        <span className="math-review-kind">{reviewKindLabelById[item.reviewKind]}</span>
        <h2>{item.subjectLabel}</h2>
        <p>
          {item.subjectType.replace("_", " ")} - {item.subjectPosture} - round{" "}
          {item.roundNumber}
        </p>
      </div>
      <div className="math-review-row-meta">
        <span>{item.primaryAssigneeDisplayName ?? "Unassigned"}</span>
        <span>
          {item.checklistSummary.completed}/{item.checklistSummary.total} checklist
        </span>
        <span className={`math-review-signal${blockedClass}`}>{item.gateSummary.label}</span>
        <span>{item.commentSummary.unresolved} open comments</span>
        <span>{formatQueueTime(item.updatedAt)}</span>
      </div>
    </a>
  );
}

export function MathReviewQueues({ search }: { search: string }) {
  const activeQueue = parseMathReviewQueue(search);
  const queue = readMathReviewQueue(activeQueue);
  const activeTab = mathReviewQueueTabs.find((tab) => tab.id === activeQueue);

  return (
    <section className="math-review-panel">
      <div className="math-review-panel-head">
        <div>
          <p className="eyebrow">Math reviews</p>
          <h1>Review queues</h1>
          <p>{activeTab?.summary ?? "Open review work across the math surface."}</p>
        </div>
        <span className="math-review-source-badge">Contract fixture</span>
      </div>
      <nav className="math-review-tabs" aria-label="Math review queues">
        {mathReviewQueueTabs.map((tab) => (
          <a
            aria-current={tab.id === activeQueue ? "page" : undefined}
            className={`math-review-tab${tab.id === activeQueue ? " math-review-tab-active" : ""}`}
            href={buildMathUrl(`/reviews?queue=${tab.id}`)}
            key={tab.id}
          >
            {tab.label}
          </a>
        ))}
      </nav>
      <div className="math-review-list">
        {queue.items.length > 0 ? (
          queue.items.map((item) => <QueueRow item={item} key={item.reviewId} />)
        ) : (
          <div className="math-review-empty">
            <h2>No review items in this queue.</h2>
            <p>The current contract fixture has no open records for this review lane.</p>
          </div>
        )}
      </div>
    </section>
  );
}
