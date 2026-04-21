#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  isDirectExecution,
  parseCommonCliOptions,
  readRepoText
} from "./lib/workflow-utils.mjs";

const requiredSections = [
  "Linked issues",
  "Verification",
  "Security and cost review",
  "Rollout and rollback"
];
const requiredChecklistLabelsBySection = new Map([
  [
    "Verification",
    [
      "Commands run are listed below",
      "Relevant logs, artifact paths, or screenshots are linked or described",
      "New or changed contracts are wired through implementation, not only documented"
    ]
  ],
  [
    "Security and cost review",
    [
      "No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue",
      "For security-sensitive changes, the threat boundary and mitigation are described below",
      "Cost or rate-limit impact is described below when relevant"
    ]
  ],
  [
    "Rollout and rollback",
    [
      "Rollout plan is described or marked not applicable",
      "Rollback plan is described or marked not applicable"
    ]
  ]
]);

const rawHtmlBlockTagsPattern =
  "address|article|aside|blockquote|details|dialog|div|dl|fieldset|figcaption|figure|footer|form|header|iframe|main|menu|nav|ol|p|pre|script|section|style|table|tbody|td|textarea|tfoot|th|thead|tr|ul";
const opaqueSingleLineRawHtmlTags = new Set([
  "details",
  "iframe",
  "pre",
  "script",
  "style",
  "table",
  "tbody",
  "td",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "tr"
]);
const rawHtmlUntilCloseTags = new Set([
  "details",
  "iframe",
  "pre",
  "script",
  "style",
  "textarea"
]);
const opaqueVisibleContentRawHtmlTags = new Set([
  "iframe",
  "pre",
  "script",
  "style",
  "textarea"
]);
const opaqueVisibleContentRawHtmlTagsInsideDetails = ["iframe", "script", "style", "textarea"];
const rawHtmlBlockTags = rawHtmlBlockTagsPattern.split("|");
export function parseMarkdownSections(markdown) {
  return collectMarkdownSections(markdown).sections;
}

function normalizeHeadingTitle(rawTitle) {
  return rawTitle
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+#+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtmlCommentsFromLine(line, commentState) {
  let remaining = line;
  let inComment = commentState;
  let visible = "";

  while (remaining.length > 0) {
    if (inComment) {
      const commentEnd = remaining.indexOf("-->");
      if (commentEnd === -1) {
        return { visible, inComment: true };
      }

      remaining = remaining.slice(commentEnd + 3);
      inComment = false;
      continue;
    }

    const commentStart = remaining.indexOf("<!--");
    if (commentStart === -1) {
      visible += remaining;
      return { visible, inComment: false };
    }

    visible += remaining.slice(0, commentStart);
    remaining = remaining.slice(commentStart + 4);
    inComment = true;
  }

  return { visible, inComment };
}

function matchFenceLine(line, { maxIndent = 3 } = {}) {
  const match = line.match(/^([ ]*)((`{3,}|~{3,}))(.*)$/);
  if (!match) {
    return null;
  }

  if (match[1].length > maxIndent) {
    return null;
  }

  return {
    marker: match[2],
    character: match[3][0],
    length: match[3].length,
    suffix: match[4]
  };
}

function canStartSetextHeading(line) {
  if (!/^(?: {0,3})\S/.test(line)) {
    return false;
  }

  const trimmed = line.trimStart();
  if (/^(?:[-+*](?:\s|$)|\d+[.)](?:\s|$)|>\s?|#{1,6}(?:\s|$)|`{3,}|~{3,})/.test(trimmed)) {
    return false;
  }

  if (/^(?:[-*_]\s*){3,}$/.test(trimmed)) {
    return false;
  }

  return true;
}

function stripMarkdownContainerPrefix(line) {
  let remaining = line;
  while (true) {
    const withoutQuote = remaining.replace(/^\s{0,3}>\s?/, "");
    if (withoutQuote !== remaining) {
      remaining = withoutQuote;
      continue;
    }

    const withoutList = remaining.replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/, "");
    if (withoutList !== remaining) {
      remaining = withoutList;
      continue;
    }

    return remaining;
  }
}

function updateRawHtmlBlockState(line, activeBlock, { opaqueDetails = true, allowedTags = null } = {}) {
  const contentLine = stripMarkdownContainerPrefix(line);
  if (activeBlock) {
    const closePattern = new RegExp(`</${activeBlock.tag}\\s*>`, "i");
    if (closePattern.test(contentLine)) {
      return null;
    }

    if (activeBlock.mode === "until_blank_or_close" && !contentLine.trim()) {
      return null;
    }

    return activeBlock;
  }

  const blockTags = allowedTags ?? (opaqueDetails ? rawHtmlBlockTags : rawHtmlBlockTags.filter((tag) => tag !== "details"));
  const blockTagPattern = blockTags.join("|");
  const openMatch = contentLine.match(new RegExp(`^\\s{0,3}<(${blockTagPattern})\\b[^>]*>`, "i"));
  if (!openMatch) {
    return null;
  }

  const tag = openMatch[1].toLowerCase();
  const closePattern = new RegExp(`</${tag}\\s*>`, "i");
  if (closePattern.test(contentLine)) {
    return opaqueSingleLineRawHtmlTags.has(tag)
      ? {
          tag,
          mode: "single_line"
        }
      : null;
  }

  return {
    tag,
    mode: rawHtmlUntilCloseTags.has(tag) ? "until_close" : "until_blank_or_close"
  };
}

function collectMarkdownSections(markdown) {
  const sections = new Map();
  const duplicateTitles = new Set();
  let currentTitle = null;
  let currentLines = [];
  let activeFence = null;
  let inHtmlComment = false;
  let activeRawHtmlBlock = null;
  let activeHiddenInlineTag = null;
  const lines = markdown.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const rawFenceMatch = matchFenceLine(line);
    if (activeFence) {
      if (
        rawFenceMatch &&
        activeFence.character === rawFenceMatch.character &&
        rawFenceMatch.length >= activeFence.length &&
        !rawFenceMatch.suffix.trim()
      ) {
        activeFence = null;
      }

      if (currentTitle) {
        currentLines.push(line);
      }
      continue;
    }

    if (rawFenceMatch) {
      activeFence = {
        character: rawFenceMatch.character,
        length: rawFenceMatch.length
      };
      if (currentTitle) {
        currentLines.push(line);
      }
      continue;
    }

    const strippedLine = stripHtmlCommentsFromLine(line, inHtmlComment);
    inHtmlComment = strippedLine.inComment;
    const hiddenInlineLine = stripHiddenInlineHtml(strippedLine.visible, activeHiddenInlineTag);
    activeHiddenInlineTag = hiddenInlineLine.activeTag;
    const visibleLine = hiddenInlineLine.visible;
    const nextRawHtmlBlock = updateRawHtmlBlockState(visibleLine, activeRawHtmlBlock);
    if (activeRawHtmlBlock || nextRawHtmlBlock) {
      activeRawHtmlBlock = nextRawHtmlBlock?.mode === "single_line" ? null : nextRawHtmlBlock;
      if (currentTitle) {
        currentLines.push(line);
      }
      continue;
    }

    let headingTitle = null;
    let consumeNextLine = false;
    const headingMatch = visibleLine.match(/^\s{0,3}##\s+(.+?)\s*$/);
    if (headingMatch) {
      headingTitle = normalizeHeadingTitle(headingMatch[1]);
    } else if (canStartSetextHeading(visibleLine)) {
      const nextLine = lines[index + 1];
      if (typeof nextLine === "string") {
        const nextStrippedLine = stripHtmlCommentsFromLine(nextLine, inHtmlComment);
        const nextHiddenInlineLine = stripHiddenInlineHtml(nextStrippedLine.visible, activeHiddenInlineTag);
        if (/^\s{0,3}(?:-{3,}|={3,})\s*$/.test(nextHiddenInlineLine.visible)) {
          headingTitle = normalizeHeadingTitle(visibleLine);
          consumeNextLine = true;
        }
      }
    }

    if (headingTitle) {
      if (currentTitle) {
        sections.set(currentTitle, currentLines.join("\n").trim());
      }

      currentTitle = headingTitle;
      if (sections.has(currentTitle) || duplicateTitles.has(currentTitle)) {
        duplicateTitles.add(currentTitle);
      }
      currentLines = [];
      if (consumeNextLine) {
        index += 1;
      }
      continue;
    }

    if (currentTitle) {
      currentLines.push(line);
    }
  }

  if (currentTitle) {
    sections.set(currentTitle, currentLines.join("\n").trim());
  }

  return { sections, duplicateTitles };
}

function collectFencedCodeBlocks(markdown) {
  const blocks = [];
  let activeFence = null;
  let currentLines = [];
  let inHtmlComment = false;
  let activeRawHtmlBlock = null;
  let activeHiddenInlineTag = null;

  for (const line of markdown.split(/\r?\n/)) {
    const rawFenceMatch = matchFenceLine(line, { maxIndent: Number.MAX_SAFE_INTEGER });
    if (activeFence) {
      if (
        rawFenceMatch &&
        activeFence.character === rawFenceMatch.character &&
        rawFenceMatch.length >= activeFence.length &&
        !rawFenceMatch.suffix.trim()
      ) {
        blocks.push(currentLines.join("\n").trim());
        activeFence = null;
        currentLines = [];
        continue;
      }

      currentLines.push(line);
      continue;
    }

    if (rawFenceMatch) {
      activeFence = {
        character: rawFenceMatch.character,
        length: rawFenceMatch.length
      };
      currentLines = [];
      continue;
    }

    const strippedLine = stripHtmlCommentsFromLine(line, inHtmlComment);
    inHtmlComment = strippedLine.inComment;
    const hiddenInlineLine = stripHiddenInlineHtml(strippedLine.visible, activeHiddenInlineTag);
    activeHiddenInlineTag = hiddenInlineLine.activeTag;
    const visibleLine = hiddenInlineLine.visible;
    const nextRawHtmlBlock = updateRawHtmlBlockState(visibleLine, activeRawHtmlBlock);
    if (activeRawHtmlBlock || nextRawHtmlBlock) {
      activeRawHtmlBlock = nextRawHtmlBlock?.mode === "single_line" ? null : nextRawHtmlBlock;
      continue;
    }
  }

  return blocks.filter(Boolean);
}

function countRequiredHeadingOccurrences(markdown) {
  const counts = new Map(requiredSections.map((sectionTitle) => [sectionTitle, 0]));
  const lines = markdown.split(/\r?\n/);
  let activeFence = null;
  let inHtmlComment = false;
  let activeRawHtmlBlock = null;
  let activeHiddenInlineTag = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const rawFenceMatch = matchFenceLine(line);
    if (activeFence) {
      if (
        rawFenceMatch &&
        activeFence.character === rawFenceMatch.character &&
        rawFenceMatch.length >= activeFence.length &&
        !rawFenceMatch.suffix.trim()
      ) {
        activeFence = null;
      }
      continue;
    }

    if (rawFenceMatch) {
      activeFence = {
        character: rawFenceMatch.character,
        length: rawFenceMatch.length
      };
      continue;
    }

    const strippedLine = stripHtmlCommentsFromLine(line, inHtmlComment);
    inHtmlComment = strippedLine.inComment;
    const hiddenInlineLine = stripHiddenInlineHtml(strippedLine.visible, activeHiddenInlineTag);
    activeHiddenInlineTag = hiddenInlineLine.activeTag;
    const visibleLine = hiddenInlineLine.visible;
    const nextRawHtmlBlock = updateRawHtmlBlockState(visibleLine, activeRawHtmlBlock);
    if (activeRawHtmlBlock || nextRawHtmlBlock) {
      activeRawHtmlBlock = nextRawHtmlBlock?.mode === "single_line" ? null : nextRawHtmlBlock;
      continue;
    }

    const atxHeadingMatch = visibleLine.match(/^\s{0,3}##\s+(.+?)\s*$/);
    if (atxHeadingMatch) {
      const normalizedTitle = normalizeHeadingTitle(atxHeadingMatch[1]);
      if (counts.has(normalizedTitle)) {
        counts.set(normalizedTitle, counts.get(normalizedTitle) + 1);
      }
      continue;
    }

    if (!canStartSetextHeading(visibleLine)) {
      continue;
    }

    const nextLine = lines[index + 1];
    if (typeof nextLine !== "string") {
      continue;
    }

    const nextStrippedLine = stripHtmlCommentsFromLine(nextLine, inHtmlComment);
    const nextHiddenInlineLine = stripHiddenInlineHtml(nextStrippedLine.visible, activeHiddenInlineTag);
    const setextUnderlineMatch = nextHiddenInlineLine.visible.match(/^\s{0,3}(?:-{3,}|={3,})\s*$/);
    if (!setextUnderlineMatch) {
      continue;
    }

    const normalizedTitle = normalizeHeadingTitle(visibleLine);
    if (!counts.has(normalizedTitle)) {
      continue;
    }

    counts.set(normalizedTitle, counts.get(normalizedTitle) + 1);
    index += 1;
  }

  return counts;
}

export function normalizeSectionBody(body) {
  return body.replace(/\r\n/g, "\n").trim();
}

function stripListPrefix(line) {
  return line
    .trim()
    .replace(/^(?:>\s*)+/, "")
    .replace(/^(?:(?:[-*+]\s*)+|\d+[.)]\s*)/, "")
    .trim();
}

function normalizeGuidanceLine(line) {
  return stripInlineMarkdownDecoration(stripListPrefix(line));
}

function normalizeEvidenceLine(line) {
  return line
    .trim()
    .replace(/^(?:>\s*)+/, "")
    .replace(/^(?:(?:[-*+]\s*)+|\d+[.)]\s*)/, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 $2")
    .replace(
      /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>[\s\S]*?<\/a>/gi,
      (match, doubleQuotedHref, singleQuotedHref, unquotedHref) => doubleQuotedHref ?? singleQuotedHref ?? unquotedHref
    )
    .replace(/<((?:https?:\/\/|\/|\.\.\/)[^>\s]+)>/gi, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<\/?[^>\n]+>/g, " ")
    .replace(/\\([`*_~[\]()])/g, "$1")
    .replace(/[*_~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeBasicHtmlEntities(text) {
  const namedEntities = new Map([
    ["amp", "&"],
    ["apos", "'"],
    ["gt", ">"],
    ["lt", "<"],
    ["nbsp", " "],
    ["num", "#"],
    ["quot", "\""]
  ]);
  return text
    .replace(/&#(\d+);/g, (match, codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (match, codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 16)))
    .replace(/&([a-z]+);/gi, (match, entityName) => namedEntities.get(entityName.toLowerCase()) ?? match);
}

function normalizeComparableText(text) {
  return decodeBasicHtmlEntities(text).replace(/[\u200B-\u200D\uFEFF]/g, "");
}

function stripInlineMarkdownDecoration(line) {
  return line
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<\/?[^>\n]+>/g, " ")
    .replace(/\\([`*_~[\]()])/g, "$1")
    .replace(/[`*_~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasHiddenInlineAttribute(attributes) {
  const styleMatch = attributes.match(/(?:^|\s)style\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
  const styleValue = styleMatch?.[1] ?? styleMatch?.[2] ?? styleMatch?.[3] ?? "";
  return (
    /(?:^|\s)hidden(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?(?=\s|$)/i.test(attributes) ||
    /(?:^|\s)aria-hidden\s*=\s*(?:"true"|'true'|true)(?=\s|$)/i.test(attributes) ||
    /\bdisplay\s*:\s*none\b/i.test(styleValue) ||
    /\bvisibility\s*:\s*hidden\b/i.test(styleValue) ||
    /\bopacity\s*:\s*(?:0(?:\.0+)?|\.0+|0%)(?:\s*!important)?(?=\s*(?:;|$))/i.test(styleValue)
  );
}

function consumeHiddenInlineTag(line, tag, depth = 1) {
  const openPattern = new RegExp(`<${tag}\\b[^>]*>`, "ig");
  const closePattern = new RegExp(`</${tag}\\s*>`, "ig");
  let cursor = 0;
  let remainingDepth = depth;

  while (true) {
    openPattern.lastIndex = cursor;
    closePattern.lastIndex = cursor;
    const nextOpen = openPattern.exec(line);
    const nextClose = closePattern.exec(line);
    if (!nextClose) {
      return {
        closed: false,
        remainder: "",
        depth: remainingDepth
      };
    }

    const nextOpenIndex = nextOpen?.index ?? Number.POSITIVE_INFINITY;
    if (nextOpenIndex < nextClose.index) {
      cursor = openPattern.lastIndex;
      if (!/\/>\s*$/.test(nextOpen[0])) {
        remainingDepth += 1;
      }
      continue;
    }

    remainingDepth -= 1;
    cursor = closePattern.lastIndex;
    if (remainingDepth === 0) {
      return {
        closed: true,
        remainder: line.slice(cursor),
        depth: 0
      };
    }
  }
}

function continuePendingInlineTag(line, state) {
  const combined = `${state.buffer}\n${line}`;
  const tagEndIndex = combined.indexOf(">");
  if (tagEndIndex === -1) {
    return {
      visible: "",
      activeTag: {
        kind: "pending_open",
        prefix: state.prefix,
        buffer: combined
      }
    };
  }

  const openFragment = combined.slice(0, tagEndIndex + 1);
  const openMatch = openFragment.match(/^<([A-Za-z][\w:-]*)([\s\S]*)>$/i);
  if (!openMatch) {
    return {
      visible: `${state.prefix} ${combined}`,
      activeTag: null
    };
  }

  const tag = openMatch[1].toLowerCase();
  const attributes = openMatch[2] ?? "";
  const afterOpen = combined.slice(tagEndIndex + 1);
  if (!hasHiddenInlineAttribute(attributes)) {
    return {
      visible: `${state.prefix} ${afterOpen}`,
      activeTag: null
    };
  }

  if (/\/>\s*$/.test(openFragment)) {
    return {
      visible: `${state.prefix} ${afterOpen}`,
      activeTag: null
    };
  }

  const consumedHiddenTag = consumeHiddenInlineTag(afterOpen, tag);
  if (consumedHiddenTag.closed) {
    return {
      visible: `${state.prefix} ${consumedHiddenTag.remainder}`,
      activeTag: null
    };
  }

  return {
    visible: `${state.prefix} `,
    activeTag: {
      kind: "hidden_content",
      tag,
      depth: consumedHiddenTag.depth
    }
  };
}

function stripHiddenInlineHtml(line, activeTag = null) {
  let visible = line;
  let nextActiveTag = activeTag;

  if (nextActiveTag?.kind === "pending_open") {
    const resolvedPendingTag = continuePendingInlineTag(visible, nextActiveTag);
    visible = resolvedPendingTag.visible;
    nextActiveTag = resolvedPendingTag.activeTag;
  }

  if (nextActiveTag && nextActiveTag?.kind !== "pending_open") {
    const activeTagName =
      typeof nextActiveTag === "string" ? nextActiveTag :
      nextActiveTag.tag;
    const activeTagDepth =
      typeof nextActiveTag === "string" ? 1 :
      nextActiveTag.depth;
    const consumedActiveTag = consumeHiddenInlineTag(visible, activeTagName, activeTagDepth);
    if (!consumedActiveTag.closed) {
      return {
        visible: "",
        activeTag: {
          kind: "hidden_content",
          tag: activeTagName,
          depth: consumedActiveTag.depth
        }
      };
    }

    visible = ` ${consumedActiveTag.remainder}`;
    nextActiveTag = null;
  }

  while (true) {
    const tagPattern = /<([A-Za-z][\w:-]*)([^>]*)>/ig;
    let openMatch = null;
    while ((openMatch = tagPattern.exec(visible)) !== null) {
      if (hasHiddenInlineAttribute(openMatch[2] ?? "")) {
        break;
      }
    }
    if (!openMatch) {
      break;
    }

    const tag = openMatch[1].toLowerCase();
    const openIndex = openMatch.index ?? 0;
    const afterOpen = visible.slice(openIndex + openMatch[0].length);
    if (/\/>\s*$/.test(openMatch[0])) {
      visible = `${visible.slice(0, openIndex)} ${afterOpen}`;
      continue;
    }

    const consumedHiddenTag = consumeHiddenInlineTag(afterOpen, tag);
    if (consumedHiddenTag.closed) {
      visible = `${visible.slice(0, openIndex)} ${consumedHiddenTag.remainder}`;
      continue;
    }

    visible = `${visible.slice(0, openIndex)} `;
    nextActiveTag = {
      kind: "hidden_content",
      tag,
      depth: consumedHiddenTag.depth
    };
    break;
  }

  const partialOpenMatch = visible.match(/<([A-Za-z][\w:-]*)\b[^>]*$/);
  if (partialOpenMatch) {
    const openIndex = partialOpenMatch.index ?? 0;
    return {
      visible: visible.slice(0, openIndex),
      activeTag: {
        kind: "pending_open",
        prefix: visible.slice(0, openIndex),
        buffer: visible.slice(openIndex)
      }
    };
  }

  return {
    visible,
    activeTag: nextActiveTag
  };
}

function revealSingleLineDetailsContent(line) {
  return line.replace(/<details\b[^>]*>([\s\S]*?)<\/details>/gi, "$1");
}

// GitHub renders <details> as an explicit reviewer disclosure widget, so the contents count as visible
// governance text even while section parsing still treats raw details blocks as opaque containers.
function revealVisibleDetailsMarkup(line) {
  return revealSingleLineDetailsContent(line)
    .replace(/<\/?details\b[^>]*>/gi, " ")
    .replace(/<\/?summary\b[^>]*>/gi, " ");
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isTemplateGuidanceLine(line) {
  const stripped = normalizeGuidanceLine(line);
  return stripped === "Replace the placeholder with real issue references before opening or merging." ||
    stripped ===
      "Use literal markdown such as Closes #123, Related: #456, or a direct GitHub issue link; do not leave the placeholder blank and do not paste escaped \\n text." ||
    stripped === "If there is intentionally no issue, say so explicitly here." ||
    stripped === "CI rejects untouched placeholder text in this section." ||
    stripped ===
      "Replace the checklist-only default with checked items and a brief note or not applicable; CI rejects untouched default sections here.";
}

function collectVisibleMarkdownLines(markdown) {
  const lines = [];
  let activeFence = null;
  let inHtmlComment = false;
  let activeRawHtmlBlock = null;
  let activeHiddenInlineTag = null;
  let activeDetailsDepth = 0;

  for (const line of markdown.split(/\r?\n/)) {
    const rawFenceMatch = matchFenceLine(line, { maxIndent: Number.MAX_SAFE_INTEGER });
    if (activeFence) {
      if (
        rawFenceMatch &&
        activeFence.character === rawFenceMatch.character &&
        rawFenceMatch.length >= activeFence.length &&
        !rawFenceMatch.suffix.trim()
      ) {
        activeFence = null;
      }

      continue;
    }

    if (rawFenceMatch) {
      activeFence = {
        character: rawFenceMatch.character,
        length: rawFenceMatch.length
      };
      continue;
    }

    const strippedLine = stripHtmlCommentsFromLine(line, inHtmlComment);
    inHtmlComment = strippedLine.inComment;
    const hiddenInlineLine = stripHiddenInlineHtml(strippedLine.visible, activeHiddenInlineTag);
    activeHiddenInlineTag = hiddenInlineLine.activeTag;
    const lineTouchesDetails = /<\/?details\b/i.test(hiddenInlineLine.visible);
    const visibleLine = revealVisibleDetailsMarkup(hiddenInlineLine.visible);
    const nextRawHtmlBlock = updateRawHtmlBlockState(
      visibleLine,
      activeRawHtmlBlock,
      activeDetailsDepth > 0 || lineTouchesDetails
        ? { allowedTags: opaqueVisibleContentRawHtmlTagsInsideDetails }
        : { opaqueDetails: false }
    );
    const nextOpaqueRawHtmlBlock =
      nextRawHtmlBlock && opaqueVisibleContentRawHtmlTags.has(nextRawHtmlBlock.tag) ? nextRawHtmlBlock : null;
    if (activeRawHtmlBlock || nextOpaqueRawHtmlBlock) {
      activeRawHtmlBlock = nextOpaqueRawHtmlBlock?.mode === "single_line" ? null : nextOpaqueRawHtmlBlock;
      const openedDetailsCount = (hiddenInlineLine.visible.match(/<details\b[^>]*>/gi) ?? []).length;
      const closedDetailsCount = (hiddenInlineLine.visible.match(/<\/details\s*>/gi) ?? []).length;
      activeDetailsDepth = Math.max(0, activeDetailsDepth + openedDetailsCount - closedDetailsCount);
      continue;
    }

    lines.push(visibleLine);
    activeRawHtmlBlock = null;
    const openedDetailsCount = (hiddenInlineLine.visible.match(/<details\b[^>]*>/gi) ?? []).length;
    const closedDetailsCount = (hiddenInlineLine.visible.match(/<\/details\s*>/gi) ?? []).length;
    activeDetailsDepth = Math.max(0, activeDetailsDepth + openedDetailsCount - closedDetailsCount);
  }

  return lines;
}

function collectComparableMarkdownLines(markdown, { excludeTemplateGuidance = false, includeIndentedLines = false } = {}) {
  return collectVisibleMarkdownLines(normalizeSectionBody(markdown))
    .filter((line) => !isMarkdownReferenceDefinitionLine(line))
    .filter((line) => includeIndentedLines || !/^(?: {4,}|\t)/.test(line))
    .map(normalizeGuidanceLine)
    .filter(Boolean)
    .filter((line) => !excludeTemplateGuidance || !isTemplateGuidanceLine(line));
}

function collectRawComparableMarkdownLines(markdown, { includeIndentedLines = false } = {}) {
  return collectVisibleMarkdownLines(normalizeSectionBody(markdown))
    .filter((line) => !isMarkdownReferenceDefinitionLine(line))
    .filter((line) => includeIndentedLines || !/^(?: {4,}|\t)/.test(line))
    .map(stripListPrefix)
    .filter(Boolean);
}

function listMeaningfulLines(body) {
  return collectComparableMarkdownLines(body, {
    excludeTemplateGuidance: true,
    includeIndentedLines: true
  });
}

function hasUncheckedChecklist(body) {
  return collectVisibleMarkdownLines(normalizeSectionBody(body))
    .filter((line) => !/^(?: {4}|\t)/.test(line))
    .map((line) => line.replace(/^(?:>\s*)+/, ""))
    .some((line) => /^\s*(?:(?:[-*+]\s*)|\d+[.)]\s*)\[[ ]\]/.test(line));
}

function hasCheckedChecklist(body) {
  return collectVisibleMarkdownLines(normalizeSectionBody(body))
    .filter((line) => !/^(?: {4}|\t)/.test(line))
    .map((line) => line.replace(/^(?:>\s*)+/, ""))
    .some((line) => /^\s*(?:(?:[-*+]\s*)|\d+[.)]\s*)\[[xX]\]/.test(line));
}

function collectChecklistItems(body) {
  const items = [];
  let currentItem = null;
  const lines = collectVisibleMarkdownLines(normalizeSectionBody(body))
    .map((line) => line.replace(/^(?:>\s*)+/, "").trimEnd());

  const flushCurrentItem = () => {
    if (!currentItem) {
      return;
    }

    items.push({
      checked: currentItem.checked,
      label: stripInlineMarkdownDecoration(currentItem.labelParts.join(" ")).replace(/\s+/g, " ").trim()
    });
    currentItem = null;
  };

  for (const line of lines) {
    const match = line.match(/^\s*(?:(?:[-*+]\s*)+|\d+[.)]\s*)\[([ xX])\]\s*(.+)$/);
    if (match) {
      flushCurrentItem();
      currentItem = {
        checked: /[xX]/.test(match[1]),
        labelParts: [match[2].trim()]
      };
      continue;
    }

    if (currentItem && /^(?: {2,}|\t+)/.test(line) && line.trim()) {
      currentItem.labelParts.push(line.trim());
      continue;
    }

    flushCurrentItem();
  }

  flushCurrentItem();
  return items.filter((item) => item.label);
}

function checklistLabelMatchesRequiredLabel(actualLabel, requiredLabel) {
  if (actualLabel === requiredLabel) {
    return true;
  }

  return new RegExp(`^${escapeRegExp(requiredLabel)}(?:\\s|[(:;,.!-])`).test(actualLabel);
}

function normalizeRequiredChecklistLabels(requiredLabelsOrTemplateBody) {
  if (Array.isArray(requiredLabelsOrTemplateBody)) {
    return requiredLabelsOrTemplateBody.filter(Boolean);
  }

  return collectChecklistItems(requiredLabelsOrTemplateBody)
    .map((item) => item.label)
    .filter(Boolean);
}

function templateKeepsRequiredChecklistItems(templateBody, requiredLabels) {
  const templateLabels = new Set(normalizeRequiredChecklistLabels(templateBody));
  return requiredLabels.every((requiredLabel) => templateLabels.has(requiredLabel));
}

function hasRequiredCheckedChecklistItems(requiredLabelsOrTemplateBody, body) {
  const requiredLabels = new Set(
    normalizeRequiredChecklistLabels(requiredLabelsOrTemplateBody)
  );

  if (requiredLabels.size === 0) {
    return true;
  }

  const checkedLabels = new Set(
    collectChecklistItems(body)
      .filter((item) => item.checked)
      .map((item) => item.label)
  );

  for (const label of requiredLabels) {
    if (![...checkedLabels].some((checkedLabel) => checklistLabelMatchesRequiredLabel(checkedLabel, label))) {
      return false;
    }
  }

  return true;
}

function hasMeaningfulNarrativeText(prose) {
  const normalizedProse = prose.replace(/\s+/g, " ").trim();
  if (!normalizedProse) {
    return false;
  }

  const proseWithoutReferences = normalizedProse
    .replace(/https?:\/\/[^\s]+/gi, " ")
    .replace(
      /(?:^|\s)(?:[A-Za-z]:\\|\/|\.\/|\.\.\/|\.\\|\.\.\\|[\w.-]+[\\/])[^\r\n]*?\.(?:png|jpg|jpeg|log|txt|md|json|html|pdf|csv|tsv|xml|ya?ml|zip|tar|gz|tgz)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  if (/^(note|later|todo|tbd|pending|follow up)$/i.test(proseWithoutReferences)) {
    return false;
  }

  if (/(?:^|[\s(>:-])(?:not applicable|n\/a)(?=$|[\s).,;:-])/i.test(proseWithoutReferences)) {
    return true;
  }

  const alphaTokens = proseWithoutReferences.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
  if (alphaTokens.length === 0) {
    return false;
  }

  if (/[.:;!?()]/.test(proseWithoutReferences)) {
    return alphaTokens.length >= 2;
  }

  return (
    alphaTokens.length >= 3 &&
    /\b(?:after|and|are|as|because|before|by|for|from|if|in|into|is|let|no|none|of|on|only|or|so|that|the|this|to|via|when|with|without)\b/i.test(
      proseWithoutReferences
    )
  );
}

function hasMeaningfulChecklistNarrativeText(prose) {
  if (hasMeaningfulNarrativeText(prose)) {
    return true;
  }

  const proseWithoutReferences = prose
    .replace(/\s+/g, " ")
    .trim()
    .replace(/https?:\/\/[^\s]+/gi, " ")
    .replace(
      /(?:^|\s)(?:[A-Za-z]:\\|\/|\.\/|\.\.\/|\.\\|\.\.\\|[\w.-]+[\\/])[^\r\n]*?\.(?:png|jpg|jpeg|log|txt|md|json|html|pdf|csv|tsv|xml|ya?ml|zip|tar|gz|tgz)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  return /^(?:not applicable|n\/a)(?:\.)?$/i.test(proseWithoutReferences);
}

function isStandalonePathLikeNarrativeLine(line) {
  const normalizedLine = normalizeEvidenceLine(line);
  if (!normalizedLine) {
    return false;
  }

  const pathLikeTarget = (target) => {
    const normalizedTarget = target.trim().replace(/^[("'`<]+|[)"'`>,.;:]+$/g, "");
    if (!normalizedTarget) {
      return false;
    }

    if (!/\.(?:png|jpg|jpeg|webp|log|txt|md|json|html|pdf|csv|tsv|xml|ya?ml|zip|tar|gz|tgz)$/i.test(normalizedTarget)) {
      return false;
    }

    return (
      /^(?:[A-Za-z]:\\|\/|\.\/|\.\.\/|\.\\|\.\.\\|[\w.-]+[\\/]).+/i.test(normalizedTarget) ||
      !/\s/.test(normalizedTarget)
    );
  };

  if (pathLikeTarget(normalizedLine)) {
    return true;
  }

  const tokens = normalizedLine.split(/\s+/).filter(Boolean);
  return (
    tokens.length >= 2 &&
    tokens.length <= 5 &&
    /^[A-Za-z0-9._-]+(?:\s+[A-Za-z0-9._-]+){0,3}$/.test(tokens.slice(0, -1).join(" ")) &&
    pathLikeTarget(tokens.at(-1) ?? "")
  );
}

function hasMeaningfulNarrative(body) {
  const prose = listMeaningfulLines(body)
    .filter((line) => !isMarkdownReferenceDefinitionLine(line))
    .filter((line) => !line.match(/^\[[ xX]\]/))
    .filter((line) => !hasArtifactReferenceLine(line))
    .filter((line) => !isStandalonePathLikeNarrativeLine(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return hasMeaningfulNarrativeText(prose);
}

function hasMeaningfulChecklistNarrative(requiredLabelsOrTemplateBody, body) {
  const requiredLabels = normalizeRequiredChecklistLabels(requiredLabelsOrTemplateBody);
  const checkedItems = collectChecklistItems(body).filter((item) => item.checked);

  return checkedItems.some((item) =>
    requiredLabels.some((requiredLabel) => {
      if (!checklistLabelMatchesRequiredLabel(item.label, requiredLabel)) {
        return false;
      }

      const narrativeSuffix = item.label
        .slice(requiredLabel.length)
        .replace(/^[\s:;,.!()-]+/, "")
        .trim();

      return hasMeaningfulChecklistNarrativeText(narrativeSuffix);
    })
  );
}

function extractGitHubIssueNumberFromDestination(destination) {
  return (
    destination.match(/https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/(\d+)\b/i) ??
    destination.match(/^\/[^/\s]+\/[^/\s]+\/issues\/(\d+)\b/i) ??
    destination.match(/^\.\.\/issues\/(\d+)\b/i)
  );
}

function normalizeLinkedIssueAnchor(text, destination, invalidFallback = "") {
  const normalizedText = stripInlineMarkdownDecoration(text).replace(/\s+/g, " ").trim();
  const textIssueMatch = normalizedText.match(/(?:^|[^/\w.-])(?:[\w.-]+\/[\w.-]+)?#(\d+)\b/);
  const destinationIssueMatch = extractGitHubIssueNumberFromDestination(destination);
  if (textIssueMatch && destinationIssueMatch && destinationIssueMatch[1] === textIssueMatch[1]) {
    return normalizedText;
  }

  return destinationIssueMatch ? `#${destinationIssueMatch[1]}` : invalidFallback;
}

function normalizeLinkedIssueAutolink(destination, invalidFallback = "") {
  const destinationIssueMatch = extractGitHubIssueNumberFromDestination(destination);
  return destinationIssueMatch ? `#${destinationIssueMatch[1]}` : invalidFallback;
}

function isMarkdownReferenceDefinitionLine(line) {
  return /^\s*\[([^\]]+)\]:\s*(?:<([^>\n]+)>|(\S+))(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*$/.test(line);
}

function collectLinkReferenceDefinitions(body) {
  const definitions = new Map();
  const referenceDefinitionPattern =
    /^\s*\[([^\]]+)\]:\s*(?:<([^>\n]+)>|(\S+))(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*$/;
  for (const line of collectVisibleMarkdownLines(normalizeSectionBody(body))) {
    const match = line.match(referenceDefinitionPattern);
    if (!match) {
      continue;
    }

    definitions.set(match[1].trim().toLowerCase(), (match[2] ?? match[3]).trim());
  }

  return definitions;
}

function hasLinkedIssueReference(body, referenceDefinitionSource = body) {
  const referenceDefinitions = collectLinkReferenceDefinitions(referenceDefinitionSource);
  return collectRawComparableMarkdownLines(body).some((line) => {
    const normalizedLine = line
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, destination) =>
        normalizeLinkedIssueAnchor(text, destination, match)
      )
      .replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (match, text, label) => {
        const resolvedLabel = (label || text).trim().toLowerCase();
        const destination = referenceDefinitions.get(resolvedLabel);
        if (!destination) {
          return match;
        }

        return normalizeLinkedIssueAnchor(text, destination, match);
      })
      .replace(/\[([^\]]+)\](?![\[(]:)/g, (match, text) => {
        const destination = referenceDefinitions.get(text.trim().toLowerCase());
        if (!destination) {
          return match;
        }

        return normalizeLinkedIssueAnchor(text, destination, match);
      })
      .replace(
        /<((?:https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+\b|\/[^/\s]+\/[^/\s]+\/issues\/\d+\b|\.\.\/issues\/\d+\b))>/gi,
        (match, destination) => normalizeLinkedIssueAutolink(destination, match)
      )
      .replace(
        /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi,
        (match, doubleQuotedHref, singleQuotedHref, unquotedHref, text) =>
          normalizeLinkedIssueAnchor(text, doubleQuotedHref ?? singleQuotedHref ?? unquotedHref, " ")
      )
      .replace(
        /\b(https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+\b|\/[^/\s]+\/[^/\s]+\/issues\/\d+\b|\.\.\/issues\/\d+\b)\b/gi,
        (match, destination) => normalizeLinkedIssueAutolink(destination, match)
      )
      .replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, " ")
      .replace(/`[^`]+`/g, " ")
      .replace(/<\/?[^>\n]+>/g, " ")
      .replace(/\\([`*_~[\]()])/g, "$1")
      .replace(/[`*_~]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const comparableLine = normalizeComparableText(normalizedLine);
    return /^(?:(?:closes|close|fixes|fix|resolves|resolve|related|issue|tracked in|tracked issue|reference|ref):?\s+)?(?:#\d+\b|[\w.-]+\/[\w.-]+#\d+\b)/i.test(
      comparableLine
    );
  });
}

function hasExplicitNoIssueDeclaration(body) {
  return listMeaningfulLines(body).some((line) => {
      const match = line.match(
        /^(?:no issue(?: applies)?|no linked issue(?: applies)?|intentionally no issue(?: applies)?|there is no issue(?: applies)?|there is intentionally no issue(?: applies)?)(.*)$/i
      );

      if (!match) {
        return false;
      }

      const suffix = match[1].trim();
      return (
        suffix === "" ||
        /^[.;]$/.test(suffix) ||
        /^[(),:;.-]\s*.+$/.test(suffix) ||
        /^(?:because|since|as|for|to|on|in|within|across|through|due to|under|during|here|there|this|that|these|those|where|when)\b.+$/i.test(
          suffix
        )
      );
    });
}

function hasLinkedIssuePlaceholder(body) {
  return collectComparableMarkdownLines(body).some((line) =>
    /^(?:closes|close|fixes|fix|resolves|resolve|related:?)\s+#$/i.test(normalizeComparableText(line))
  );
}

function collectIndentedCodeBlocks(markdown) {
  const blocks = [];
  let activeFence = null;
  let currentLines = [];
  let inHtmlComment = false;
  let activeRawHtmlBlock = null;
  let activeHiddenInlineTag = null;

  const flushCurrentBlock = () => {
    const block = currentLines.join("\n").trim();
    if (block) {
      blocks.push(block);
    }
    currentLines = [];
  };

  for (const line of markdown.split(/\r?\n/)) {
    const rawFenceMatch = matchFenceLine(line, { maxIndent: Number.MAX_SAFE_INTEGER });
    if (activeFence) {
      if (
        rawFenceMatch &&
        activeFence.character === rawFenceMatch.character &&
        rawFenceMatch.length >= activeFence.length &&
        !rawFenceMatch.suffix.trim()
      ) {
        activeFence = null;
      }

      continue;
    }

    if (rawFenceMatch) {
      flushCurrentBlock();
      activeFence = {
        character: rawFenceMatch.character,
        length: rawFenceMatch.length
      };
      continue;
    }

    const strippedLine = stripHtmlCommentsFromLine(line, inHtmlComment);
    inHtmlComment = strippedLine.inComment;
    const hiddenInlineLine = stripHiddenInlineHtml(strippedLine.visible, activeHiddenInlineTag);
    activeHiddenInlineTag = hiddenInlineLine.activeTag;
    const visibleLine = hiddenInlineLine.visible;
    const nextRawHtmlBlock = updateRawHtmlBlockState(visibleLine, activeRawHtmlBlock);
    if (activeRawHtmlBlock || nextRawHtmlBlock) {
      activeRawHtmlBlock = nextRawHtmlBlock?.mode === "single_line" ? null : nextRawHtmlBlock;
      flushCurrentBlock();
      continue;
    }

    if (/^(?: {4}|\t)/.test(visibleLine)) {
      currentLines.push(visibleLine.replace(/^(?: {4}|\t)/, ""));
      continue;
    }

    if (!visibleLine.trim() && currentLines.length > 0) {
      currentLines.push("");
      continue;
    }

    flushCurrentBlock();
  }

  flushCurrentBlock();
  return blocks;
}

function collectEvidenceLinkDestinations(line, referenceDefinitions = new Map()) {
  const destinations = [];
  line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, destination) => {
    destinations.push(destination);
    return match;
  });
  line.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (match, text, label) => {
    const resolvedLabel = (label || text).trim().toLowerCase();
    const destination = referenceDefinitions.get(resolvedLabel);
    if (destination) {
      destinations.push(destination);
    }
    return match;
  });
  line.replace(/\[([^\]]+)\](?![\[(]:)/g, (match, text) => {
    const destination = referenceDefinitions.get(text.trim().toLowerCase());
    if (destination) {
      destinations.push(destination);
    }
    return match;
  });
  line.replace(
    /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>[\s\S]*?<\/a>/gi,
    (match, doubleQuotedHref, singleQuotedHref, unquotedHref) => {
      destinations.push(doubleQuotedHref ?? singleQuotedHref ?? unquotedHref);
      return match;
    }
  );
  line.replace(/<((?:https?:\/\/|\/|\.\.\/|\.\/)[^>\s]+)>/gi, (match, destination) => {
    destinations.push(destination);
    return match;
  });
  return destinations;
}

function isWorkflowRunTarget(target) {
  return (
    /https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/actions\/runs\/\d+\b/i.test(target) ||
    /^\/[^/\s]+\/[^/\s]+\/actions\/runs\/\d+\b/i.test(target) ||
    /^\.\.\/actions\/runs\/\d+\b/i.test(target)
  );
}

function isArtifactReferenceTarget(target) {
  const normalizedTarget = target.trim().replace(/^[("'`<]+|[)"'`>,.;:]+$/g, "");
  if (!normalizedTarget) {
    return false;
  }

  if (/https:\/\/github\.com\/user-attachments\/assets\/[A-Za-z0-9-]+/i.test(normalizedTarget)) {
    return true;
  }

  const artifactExtensionPattern = /\.(?:png|jpg|jpeg|webp|log|txt|md|json|html|pdf|csv|tsv|xml|ya?ml|zip|tar|gz|tgz)$/i;
  const artifactBasenamePattern =
    /(?:^|[._-])(?:digest|digests|proof|proofs|report|reports|result|results|screenshot|screenshots|log|logs)(?:[._-]|$)/i;
  const screenshotDirectoryPattern = /^screenshots?$/i;
  const topLevelArtifactDirectoryPattern = /^(?:artifacts?|proofs?|logs?|results?)$/i;
  const reportDirectoryPattern = /^reports?$/i;
  const genericBuildDirectoryPattern = /^(?:dist|build|out|tmp|\.tmp|coverage)$/i;
  const hasExplicitRootPrefix = /^(?:[A-Za-z]:\\|\/|\.\/|\.\.\/|\.\\|\.\.\\)/.test(normalizedTarget);
  const normalizedRelativeTarget = normalizedTarget.replace(/^(?:[A-Za-z]:\\|\/|\.\/|\.\.\/|\.\\|\.\.\\)/, "");
  const segments = normalizedRelativeTarget.split(/[\\/]+/).filter(Boolean);
  const fileName = segments.at(-1) ?? "";
  if (!artifactExtensionPattern.test(fileName)) {
    return false;
  }

  const baseName = fileName.replace(artifactExtensionPattern, "");
  const directorySegments = segments.slice(0, -1);

  if (directorySegments.some((segment) => screenshotDirectoryPattern.test(segment)) && /\.(?:png|jpg|jpeg|webp)$/i.test(fileName)) {
    return true;
  }

  if (topLevelArtifactDirectoryPattern.test(directorySegments[0] ?? "")) {
    return true;
  }

  if (reportDirectoryPattern.test(directorySegments[0] ?? "") && artifactBasenamePattern.test(baseName)) {
    return true;
  }

  if (
    directorySegments.some((segment) => genericBuildDirectoryPattern.test(segment)) &&
    artifactBasenamePattern.test(baseName)
  ) {
    return true;
  }

  return hasExplicitRootPrefix && directorySegments.length === 0 && artifactBasenamePattern.test(baseName);
}

function hasArtifactReferenceLine(line, referenceDefinitions = new Map()) {
  const normalizedLine = normalizeEvidenceLine(line);
  if (!normalizedLine) {
    return false;
  }

  if (collectEvidenceLinkDestinations(line, referenceDefinitions).some(isArtifactReferenceTarget)) {
    return true;
  }

  const labeledArtifactMatch = normalizedLine.match(
    /^(?:artifacts?|artifact paths?|proofs?|screenshots?|logs?|reports?|results?|digests?)(?: linked| links?| path(?:s)?| file(?:s)?)?\s*:\s*(.+)$/i
  );
  const candidate = (labeledArtifactMatch?.[1] ?? normalizedLine).trim();
  if (isArtifactReferenceTarget(candidate)) {
    return true;
  }

  const candidateTokens = candidate.split(/\s+/).filter(Boolean);
  if (
    candidateTokens.length >= 2 &&
    candidateTokens.length <= 4 &&
    /^[A-Za-z0-9._-]+(?:\s+[A-Za-z0-9._-]+){0,2}$/.test(candidateTokens.slice(0, -1).join(" ")) &&
    isArtifactReferenceTarget(candidateTokens.at(-1) ?? "")
  ) {
    return true;
  }

  return false;
}

function hasUntouchedVerificationPlaceholderBlock(body) {
  const placeholderLine = "# Paste exact commands, workflow runs, or artifact paths here";
  return [...collectFencedCodeBlocks(normalizeSectionBody(body)), ...collectIndentedCodeBlocks(normalizeSectionBody(body))].some(
    (block) => {
      const meaningfulLines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      return meaningfulLines.length === 1 && meaningfulLines[0] === placeholderLine;
    }
  );
}

function hasConcreteVerificationEvidence(body, referenceDefinitionSource = body) {
  const normalized = normalizeSectionBody(body);
  const referenceDefinitions = collectLinkReferenceDefinitions(referenceDefinitionSource);
  const rawVisibleLines = collectVisibleMarkdownLines(normalized).filter(
    (line) => !isMarkdownReferenceDefinitionLine(line)
  );
  const visibleLines = rawVisibleLines.map(normalizeEvidenceLine).filter(Boolean);
  const codeBlocks = [...collectFencedCodeBlocks(normalized), ...collectIndentedCodeBlocks(normalized)];
  const codeBlockText = codeBlocks.join("\n");
  const commandPattern =
    /^(?:(?:\.{0,2}[\\/]|[A-Za-z]:\\)[^\s]+|(?:bun|bunx|node|npm|npx|pnpm|yarn|gh|docker|python|pytest|uv|cargo|go|git|make|bash|sh|pwsh|powershell|cmd|lean|lake)\b)\s+\S+/i;
  const bareCommandPattern =
    /^(?:pytest|make|lake)\b\s*$/i;
  const stripCommandPreamble = (line) => {
    let candidate = line.replace(/^(?:(?:\$|>|PS>)\s+)/, "").trimStart();
    let previousCandidate;

    do {
      previousCandidate = candidate;
      candidate = candidate
        .replace(/^(?:(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*=(?:"[^"\n]*"|'[^'\n]*'|[^\s;]+)\s+)+/i, "")
        .replace(
          /^(?:\$env:[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:"[^"\n]*"|'[^'\n]*'|[^;\r\n]+)\s*;\s*)+/i,
          ""
        )
        .replace(/^(?:set\s+[A-Za-z_][A-Za-z0-9_]*=(?:"[^"\n]*"|'[^'\n]*'|[^&\r\n]+)\s*&&\s*)+/i, "")
        .trimStart();
    } while (candidate !== previousCandidate);

    return candidate;
  };
  const hasCliLikeArgumentToken = (line) => {
    const normalizedLine = stripCommandPreamble(line).trim();
    const tokens = normalizedLine.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return false;
    }

    if (tokens.length === 1) {
      return bareCommandPattern.test(normalizedLine);
    }

    return tokens.slice(1).some((token) => {
      const normalizedToken = token.replace(/^[("'`]+|[)"'`,;]+$/g, "");
      if (!normalizedToken) {
        return false;
      }

      return (
        normalizedToken === "." ||
        normalizedToken === ".." ||
        /^-{1,2}[\w-]/.test(normalizedToken) ||
        /^[.]{1,2}[\\/]/.test(normalizedToken) ||
        /^[A-Za-z]:\\/.test(normalizedToken) ||
        /[\\/]/.test(normalizedToken) ||
        /[:=]/.test(normalizedToken) ||
        /\.[A-Za-z0-9]{1,8}\b/.test(normalizedToken)
      );
    });
  };
  const extractVisibleCommandCandidate = (line) => {
    const labeledCommandMatch = line.match(/^(?:exact )?commands?(?: run)?\s*:\s*(.+)$/i);
    if (labeledCommandMatch) {
      return {
        candidate: labeledCommandMatch[1].trim(),
        explicit: true
      };
    }

    return {
      candidate: line,
      explicit: false
    };
  };
  const commandLikeEvidence =
    visibleLines.some((line) => {
      const commandCandidate = extractVisibleCommandCandidate(line);
      const normalizedCandidate = stripCommandPreamble(commandCandidate.candidate);
      return (
        (commandCandidate.explicit &&
          (commandPattern.test(normalizedCandidate) || bareCommandPattern.test(normalizedCandidate))) ||
        (!commandCandidate.explicit &&
          commandPattern.test(normalizedCandidate) &&
          hasCliLikeArgumentToken(normalizedCandidate))
      );
    }) ||
    codeBlocks.some((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .map(stripCommandPreamble)
        .some((line) => commandPattern.test(line) || bareCommandPattern.test(line))
    );
  const evidenceText = `${visibleLines.join("\n")}\n${codeBlockText}`.trim();
  const evidenceLinkDestinations = [
    ...rawVisibleLines.flatMap((line) => collectEvidenceLinkDestinations(line, referenceDefinitions)),
    ...codeBlocks.flatMap((block) =>
      block
        .split("\n")
        .flatMap((line) => collectEvidenceLinkDestinations(line, referenceDefinitions))
    )
  ];
  const workflowLikeEvidence =
    /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/actions\/runs\/\d+\b/i.test(evidenceText) ||
    /(?:^|\s)\/[^/\s]+\/[^/\s]+\/actions\/runs\/\d+\b/i.test(evidenceText) ||
    /(?:^|\s)\.\.\/actions\/runs\/\d+\b/i.test(evidenceText) ||
    evidenceLinkDestinations.some(isWorkflowRunTarget);
  const artifactLikeEvidence =
    rawVisibleLines.some((line) => hasArtifactReferenceLine(line, referenceDefinitions)) ||
    codeBlocks.some((block) =>
      block.split("\n").some((line) => hasArtifactReferenceLine(line, referenceDefinitions))
    );

  return commandLikeEvidence || workflowLikeEvidence || artifactLikeEvidence;
}

function readBodyFromEventFile(eventFilePath) {
  const payload = JSON.parse(readFileSync(eventFilePath, "utf8"));
  const body = payload?.pull_request?.body;

  if (typeof body !== "string") {
    throw new Error(`${eventFilePath} does not contain pull_request.body text`);
  }

  return body;
}

function resolveBodySource(args) {
  let bodyFilePath = "";
  let eventFilePath = process.env.GITHUB_EVENT_PATH ?? "";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--body-file") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--body-file requires a path");
      }

      bodyFilePath = path.resolve(value);
      index += 1;
      continue;
    }

    if (arg === "--event-json") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--event-json requires a path");
      }

      eventFilePath = path.resolve(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument "${arg}"`);
  }

  if (bodyFilePath) {
    return readFileSync(bodyFilePath, "utf8");
  }

  if (eventFilePath) {
    return readBodyFromEventFile(eventFilePath);
  }

  throw new Error(
    "Provide --body-file <path> or --event-json <path>, or run under pull_request CI with GITHUB_EVENT_PATH set."
  );
}

export function validatePrGovernanceBody(repoRoot, bodyMarkdown) {
  const templatePath = ".github/PULL_REQUEST_TEMPLATE.md";
  const templateMarkdown = readRepoText(repoRoot, templatePath);
  const templateParseResult = collectMarkdownSections(templateMarkdown);
  const bodyParseResult = collectMarkdownSections(bodyMarkdown);
  const templateHeadingCounts = countRequiredHeadingOccurrences(templateMarkdown);
  const bodyHeadingCounts = countRequiredHeadingOccurrences(bodyMarkdown);

  for (const sectionTitle of requiredSections) {
    if (templateParseResult.duplicateTitles.has(sectionTitle) || templateHeadingCounts.get(sectionTitle) > 1) {
      throw new Error(`${templatePath} contains duplicate required section heading "${sectionTitle}"`);
    }

    if (bodyParseResult.duplicateTitles.has(sectionTitle) || bodyHeadingCounts.get(sectionTitle) > 1) {
      throw new Error(`PR body contains duplicate required section heading "${sectionTitle}"`);
    }
  }

  const templateSections = templateParseResult.sections;
  const bodySections = bodyParseResult.sections;

  for (const sectionTitle of requiredSections) {
    const templateBody = templateSections.get(sectionTitle);
    if (!templateBody) {
      throw new Error(`${templatePath} is missing required section "${sectionTitle}"`);
    }

    const body = bodySections.get(sectionTitle);
    if (!body) {
      throw new Error(`PR body is missing required section "${sectionTitle}"`);
    }

    if (normalizeSectionBody(body) === normalizeSectionBody(templateBody)) {
      throw new Error(`PR body section "${sectionTitle}" is still the untouched template default`);
    }

    const requiredChecklistLabels = requiredChecklistLabelsBySection.get(sectionTitle) ?? [];
    if (requiredChecklistLabels.length > 0 && !templateKeepsRequiredChecklistItems(templateBody, requiredChecklistLabels)) {
      throw new Error(`${templatePath} section "${sectionTitle}" must keep the required checklist items`);
    }
  }

  const linkedIssues = bodySections.get("Linked issues");
  if (hasLinkedIssuePlaceholder(linkedIssues)) {
    throw new Error('PR body section "Linked issues" still contains the placeholder "Closes #"');
  }

  if (!hasLinkedIssueReference(linkedIssues, bodyMarkdown) && !hasExplicitNoIssueDeclaration(linkedIssues)) {
    throw new Error(
      'PR body section "Linked issues" must contain a real issue reference like "#123" or explicitly say no issue applies'
    );
  }

  const verification = bodySections.get("Verification");
  if (hasUntouchedVerificationPlaceholderBlock(verification)) {
    throw new Error('PR body section "Verification" still contains the placeholder command block');
  }

  if (hasUncheckedChecklist(verification)) {
    throw new Error('PR body section "Verification" still contains unchecked checklist items');
  }

  const verificationTemplateBody = templateSections.get("Verification");
  const verificationRequiredChecklistLabels = requiredChecklistLabelsBySection.get("Verification") ?? [];
  if (!hasRequiredCheckedChecklistItems(verificationRequiredChecklistLabels, verification)) {
    throw new Error('PR body section "Verification" must keep and complete the required checklist items');
  }

  if (!hasConcreteVerificationEvidence(verification, bodyMarkdown)) {
    throw new Error(
      'PR body section "Verification" must include concrete evidence such as commands, workflow runs, or artifact paths'
    );
  }

  for (const sectionTitle of ["Security and cost review", "Rollout and rollback"]) {
    const sectionBody = bodySections.get(sectionTitle);
    const requiredChecklistLabels = requiredChecklistLabelsBySection.get(sectionTitle) ?? [];

    if (hasUncheckedChecklist(sectionBody)) {
      throw new Error(`PR body section "${sectionTitle}" still contains unchecked checklist items`);
    }

    if (!hasRequiredCheckedChecklistItems(requiredChecklistLabels, sectionBody)) {
      throw new Error(`PR body section "${sectionTitle}" must keep and complete the required checklist items`);
    }

    if (!hasMeaningfulNarrative(sectionBody) && !hasMeaningfulChecklistNarrative(requiredChecklistLabels, sectionBody)) {
      throw new Error(
        `PR body section "${sectionTitle}" must include a brief explanatory note or an explicit not-applicable statement`
      );
    }
  }
}

function main() {
  try {
    const { repoRoot, remainingArgs } = parseCommonCliOptions(import.meta.url);
    const bodyMarkdown = resolveBodySource(remainingArgs);
    validatePrGovernanceBody(repoRoot, bodyMarkdown);
    console.log("PR governance body check passed.");
  } catch (error) {
    console.error(`PR governance body check failed: ${error.message}`);
    process.exit(1);
  }
}

if (isDirectExecution(import.meta.url)) {
  main();
}
