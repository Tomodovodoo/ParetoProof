import fs from "node:fs";

const eventName = process.env.GITHUB_EVENT_NAME;
const eventPath = process.env.GITHUB_EVENT_PATH;
const repository = process.env.GITHUB_REPOSITORY;
const githubToken = process.env.GITHUB_TOKEN;
const githubApiUrl = process.env.GITHUB_API_URL || "https://api.github.com";
const githubServerUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiModel = process.env.OPENAI_MODEL || "gpt-5";

if (!eventPath || !repository || !githubToken) {
  console.error("Missing required GitHub context.");
  process.exit(1);
}

if (!openaiApiKey) {
  console.log("OPENAI_API_KEY is not configured; skipping Codex assistant.");
  process.exit(0);
}

const payload = JSON.parse(fs.readFileSync(eventPath, "utf8"));
const [owner, repo] = repository.split("/");

function truncate(text, max = 50000) {
  if (!text) {
    return "";
  }

  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max)}\n\n[truncated]`;
}

async function github(path, init = {}) {
  const response = await fetch(`${githubApiUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "User-Agent": "paretoproof-codex-assistant",
      ...(init.headers || {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function openai(input) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify({
      model: openaiModel,
      input
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API ${response.status}: ${body}`);
  }

  const data = await response.json();

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const text = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        text.push(content.text);
      }
    }
  }

  return text.join("\n").trim();
}

async function postIssueComment(issueNumber, body) {
  await github(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body })
  });
}

async function buildIssuePrompt(issueNumber) {
  const issue = await github(`/repos/${owner}/${repo}/issues/${issueNumber}`);
  const comments = await github(`/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=10`);

  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text:
            "You are Codex acting as a repository assistant for ParetoProof. " +
            "Respond concisely with concrete next steps, missing information, and references to repository process where useful. " +
            "Do not invent repository state."
        }
      ]
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: truncate(
            [
              `Repository: ${repository}`,
              `Issue: #${issue.number} ${issue.title}`,
              `URL: ${issue.html_url}`,
              `Labels: ${(issue.labels || []).map((label) => label.name).join(", ") || "none"}`,
              "",
              "Issue body:",
              issue.body || "(empty)",
              "",
              "Recent comments:",
              comments
                .map((comment) => `${comment.user.login}: ${comment.body || "(empty)"}`)
                .join("\n\n")
            ].join("\n")
          )
        }
      ]
    }
  ];
}

async function buildPullRequestPrompt(prNumber) {
  const pr = await github(`/repos/${owner}/${repo}/pulls/${prNumber}`);
  const files = await github(`/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`);

  const changedFiles = files
    .map((file) =>
      [
        `File: ${file.filename}`,
        `Status: ${file.status}`,
        `Additions: ${file.additions}, deletions: ${file.deletions}`,
        "Patch:",
        file.patch || "(binary or patch unavailable)"
      ].join("\n")
    )
    .join("\n\n---\n\n");

  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text:
            "You are Codex reviewing a pull request for ParetoProof. " +
            "Prioritize bugs, regressions, security issues, workflow breakage, benchmark-policy risks, and missing validation. " +
            "If you find no material issues, say so explicitly in one sentence."
        }
      ]
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: truncate(
            [
              `Repository: ${repository}`,
              `Pull request: #${pr.number} ${pr.title}`,
              `URL: ${pr.html_url}`,
              `Base: ${pr.base.ref}`,
              `Head: ${pr.head.ref}`,
              "",
              "Pull request body:",
              pr.body || "(empty)",
              "",
              "Changed files:",
              changedFiles
            ].join("\n")
          )
        }
      ]
    }
  ];
}

async function main() {
  if (eventName === "issue_comment") {
    const issueNumber = payload.issue.number;
    const prompt = await buildIssuePrompt(issueNumber);
    const reply = await openai(prompt);

    await postIssueComment(
      issueNumber,
      `Automated Codex response:\n\n${reply}\n\n_Triggered by comment command. Configure \`OPENAI_API_KEY\` and optionally \`OPENAI_MODEL\` to control this workflow._`
    );
    return;
  }

  if (eventName === "pull_request_target" || eventName === "workflow_dispatch") {
    const prNumber = payload.pull_request?.number;

    if (!prNumber) {
      console.log("No pull request in payload; skipping.");
      return;
    }

    const prompt = await buildPullRequestPrompt(prNumber);
    const review = await openai(prompt);

    await postIssueComment(
      prNumber,
      `Automated Codex review:\n\n${review}\n\n_This workflow is advisory only and does not merge or modify code._`
    );
    return;
  }

  console.log(`Unhandled event ${eventName}; skipping.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
