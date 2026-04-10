export type RepoSyncRecordStatus =
  | "proposed"
  | "pr_open"
  | "merged"
  | "rejected"
  | "superseded";

export type PackageFreezeStatus = "active";

export type BenchmarkVersionLaunchability =
  | "internal_only"
  | "launchable";

export type BenchmarkReleaseStatus =
  | "draft"
  | "approved"
  | "published";

export type BenchmarkReleaseVisibility =
  | "internal_only"
  | "held_out"
  | "public";

export type PublicBenchmarkReleasePublicationStatus =
  | "released"
  | "withdrawn";

export type BenchmarkWorkflowSummaryPayload = Record<string, unknown>;

export type RepoSyncRecord = {
  createdAt: string;
  id: string;
  lastUpdatedByUserId: string | null;
  mathPackageCandidateId: string | null;
  mergeCommitSha: string | null;
  note: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  recordedByUserId: string | null;
  repoName: string;
  repoOwner: string;
  status: RepoSyncRecordStatus;
  targetRepoPath: string;
  updatedAt: string;
};

export type PackageFreeze = {
  benchmarkFamily: string;
  createdAt: string;
  createdByUserId: string | null;
  id: string;
  mathPackageCandidateId: string | null;
  note: string | null;
  packageDigest: string;
  packageId: string;
  packageVersion: string;
  repoCommitSha: string;
  repoSyncRecordId: string;
  repoTreePath: string;
  status: PackageFreezeStatus;
  updatedAt: string;
};

export type BenchmarkVersion = {
  benchmarkFamily: string;
  benchmarkVersionId: string;
  createdAt: string;
  createdByUserId: string | null;
  displayLabel: string;
  itemSetDefinition: BenchmarkWorkflowSummaryPayload | null;
  launchability: BenchmarkVersionLaunchability;
  packageDigest: string;
  packageFreezeId: string;
  packageId: string;
  packageVersion: string;
  scopeLabel: string;
  updatedAt: string;
};

export type BenchmarkRelease = {
  approvedAt: string | null;
  approvedByUserId: string | null;
  benchmarkReleaseId: string;
  benchmarkVersionId: string;
  createdAt: string;
  createdByUserId: string | null;
  methodologyArtifactRefs: string[];
  publishedAt: string | null;
  releaseLabel: string;
  status: BenchmarkReleaseStatus;
  summaryArtifactRefs: string[];
  summaryPayload: BenchmarkWorkflowSummaryPayload | null;
  updatedAt: string;
  visibility: BenchmarkReleaseVisibility;
};

export type PublicBenchmarkArtifactPresence = {
  hasMethodologyArtifacts: boolean;
  hasSummaryArtifacts: boolean;
};

export type PublicBenchmarkMetricSummary = {
  label: string;
  unitLabel: string | null;
  value: number | null;
  valueText: string | null;
};

export type PublicBenchmarkReleaseSummary = {
  benchmarkReleaseId: string;
  benchmarkLabel: string;
  benchmarkVersionId: string;
  benchmarkVersionLabel: string;
  includedModelCount: number | null;
  linkedPublicArtifactPresence: PublicBenchmarkArtifactPresence;
  publicationStatus: PublicBenchmarkReleasePublicationStatus;
  publishedAt: string;
  releaseLabel: string;
  topLineMetricSummary: PublicBenchmarkMetricSummary | null;
};

export type PublicBenchmarkReleaseDetail = PublicBenchmarkReleaseSummary & {
  releaseMethodologySummary: string | null;
  releasedAggregateMetrics: PublicBenchmarkMetricSummary[];
};

export type PublicReportingFreshness = {
  generatedAt: string;
  publishedAt: string | null;
  recommendedRevalidateAfterSeconds: number;
  snapshotVersion: string;
};

export type AdminRepoSyncRecordCreateInput = {
  mathPackageCandidateId: string | null;
  mergeCommitSha: string | null;
  note: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  repoName: string;
  repoOwner: string;
  status: RepoSyncRecordStatus;
  targetRepoPath: string;
};

export type AdminRepoSyncRecordStatusUpdateInput = {
  mergeCommitSha?: string | null;
  note?: string | null;
  pullRequestNumber?: number | null;
  pullRequestUrl?: string | null;
  status: RepoSyncRecordStatus;
};

export type AdminPackageFreezeCreateInput = {
  benchmarkFamily: string;
  note: string | null;
  packageDigest: string;
  packageId: string;
  packageVersion: string;
  repoCommitSha: string;
  repoSyncRecordId: string;
};

export type AdminBenchmarkVersionCreateInput = {
  benchmarkVersionId: string;
  displayLabel: string | null;
  itemSetDefinition: BenchmarkWorkflowSummaryPayload | null;
  scopeLabel: string;
};

export type AdminBenchmarkVersionLaunchabilityUpdateInput = {
  launchability: BenchmarkVersionLaunchability;
};

export type AdminBenchmarkReleaseCreateInput = {
  benchmarkReleaseId: string;
  methodologyArtifactRefs: string[];
  releaseLabel: string;
  summaryArtifactRefs: string[];
  summaryPayload: BenchmarkWorkflowSummaryPayload | null;
  visibility: BenchmarkReleaseVisibility;
};

export type RepoSyncRecordListResponse = {
  items: RepoSyncRecord[];
};

export type RepoSyncRecordDetailResponse = {
  item: RepoSyncRecord;
};

export type PackageFreezeListResponse = {
  items: PackageFreeze[];
};

export type PackageFreezeDetailResponse = {
  item: PackageFreeze;
};

export type BenchmarkVersionListResponse = {
  items: BenchmarkVersion[];
};

export type BenchmarkVersionDetailResponse = {
  item: BenchmarkVersion;
};

export type BenchmarkReleaseListResponse = {
  items: BenchmarkRelease[];
};

export type BenchmarkReleaseDetailResponse = {
  item: BenchmarkRelease;
};

export type PublicBenchmarkReleaseListResponse = PublicReportingFreshness & {
  items: PublicBenchmarkReleaseSummary[];
};

export type PublicBenchmarkReleaseDetailResponse = PublicReportingFreshness & {
  item: PublicBenchmarkReleaseDetail;
};

