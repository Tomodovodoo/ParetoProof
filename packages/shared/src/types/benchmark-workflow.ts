export type RepoSyncRecordStatus =
  | "proposed"
  | "pr_open"
  | "merged"
  | "rejected"
  | "superseded";

export type PackageFreezeStatus = "active" | "withdrawn" | "superseded";

export type BenchmarkVersionLaunchability =
  | "internal_only"
  | "launchable"
  | "withdrawn";

export type BenchmarkReleaseStatus =
  | "draft"
  | "approved"
  | "published"
  | "withdrawn";

export type BenchmarkReleaseVisibility =
  | "internal_only"
  | "held_out"
  | "public";

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

