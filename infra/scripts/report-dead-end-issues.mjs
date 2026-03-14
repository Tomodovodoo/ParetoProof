import { execFileSync } from "node:child_process";

const DEFAULT_REPO = "Tomodovodoo/ParetoProof";
const DEFAULT_LIMIT = 200;

function parseArgs(argv) {
  const options = {
    limit: DEFAULT_LIMIT,
    repo: DEFAULT_REPO
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--repo") {
      options.repo = requireValue(argv[index + 1], "--repo");
      index += 1;
      continue;
    }

    if (argument === "--limit") {
      options.limit = parsePositiveInteger(requireValue(argv[index + 1], "--limit"), "--limit");
      index += 1;
      continue;
    }

    if (argument === "--help") {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function requireValue(value, flagName) {
  if (!value) {
    throw new Error(`${flagName} requires a value.`);
  }

  return value;
}

function parsePositiveInteger(value, flagName) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }

  return parsed;
}

function printHelp() {
  console.log(
    [
      "Usage: node infra/scripts/report-dead-end-issues.mjs [--repo owner/name] [--limit N]",
      "",
      "Reports closed issues that have no issue/PR/commit relationship signals in GitHub timeline data."
    ].join("\n")
  );
}

function ghGraphql(query, variables) {
  const args = ["api", "graphql", "-f", `query=${query}`];

  for (const [key, value] of Object.entries(variables)) {
    args.push("-F", `${key}=${value}`);
  }

  return JSON.parse(execFileSync("gh", args, { encoding: "utf8" }));
}

function fetchClosedIssues({ owner, repo, limit }) {
  const collected = [];
  let cursor = null;

  while (collected.length < limit) {
    const pageSize = Math.min(100, limit - collected.length);
    const response = ghGraphql(
      `query($owner:String!, $repo:String!, $pageSize:Int!, $cursor:String) {
        repository(owner:$owner, name:$repo) {
          issues(
            states:CLOSED
            first:$pageSize
            after:$cursor
            orderBy:{field:UPDATED_AT, direction:DESC}
          ) {
            pageInfo {
              endCursor
              hasNextPage
            }
            nodes {
              number
              title
              closedAt
              comments {
                totalCount
              }
              timelineItems(
                first:10
                itemTypes:[CROSS_REFERENCED_EVENT, CONNECTED_EVENT, REFERENCED_EVENT]
              ) {
                totalCount
                nodes {
                  __typename
                  ... on CrossReferencedEvent {
                    source {
                      __typename
                      ... on PullRequest {
                        number
                      }
                      ... on Issue {
                        number
                      }
                    }
                  }
                  ... on ConnectedEvent {
                    subject {
                      __typename
                    }
                  }
                  ... on ReferencedEvent {
                    commit {
                      abbreviatedOid
                    }
                  }
                }
              }
            }
          }
        }
      }`,
      {
        cursor,
        owner,
        pageSize,
        repo
      }
    );
    const issueConnection = response.data?.repository?.issues;

    if (!issueConnection) {
      throw new Error("GitHub API response did not include repository issues.");
    }

    collected.push(...issueConnection.nodes);

    if (!issueConnection.pageInfo.hasNextPage) {
      break;
    }

    cursor = issueConnection.pageInfo.endCursor;
  }

  return collected;
}

function normalizeRepo(value) {
  const [owner, repo] = value.split("/");

  if (!owner || !repo) {
    throw new Error("--repo must use owner/name format.");
  }

  return { owner, repo };
}

function summarizeRelationship(node) {
  switch (node.__typename) {
    case "CrossReferencedEvent":
      return `${node.source.__typename} #${node.source.number}`;
    case "ConnectedEvent":
      return `connected ${node.subject.__typename}`;
    case "ReferencedEvent":
      return `commit ${node.commit.abbreviatedOid}`;
    default:
      return node.__typename;
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const { owner, repo } = normalizeRepo(options.repo);
  const issues = fetchClosedIssues({
    limit: options.limit,
    owner,
    repo
  });
  const deadEnds = issues.filter((issue) => issue.timelineItems.totalCount === 0);

  console.log(
    `Dead-end issue audit for ${owner}/${repo}: ${deadEnds.length} of ${issues.length} closed issues have no issue/PR/commit relationship signals.`
  );

  if (deadEnds.length === 0) {
    return;
  }

  console.log("");

  for (const issue of deadEnds) {
    console.log(
      `- #${issue.number} ${issue.title} (closed ${issue.closedAt}, comments: ${issue.comments.totalCount})`
    );
  }

  const connectedExamples = issues
    .filter((issue) => issue.timelineItems.totalCount > 0)
    .slice(0, 3)
    .map(
      (issue) =>
        `- #${issue.number} ${issue.title}: ${issue.timelineItems.nodes
          .map(summarizeRelationship)
          .join(", ")}`
    );

  if (connectedExamples.length > 0) {
    console.log("");
    console.log("Recent linked examples:");
    for (const example of connectedExamples) {
      console.log(example);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
