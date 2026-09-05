// Pure renderer: walks a ProseMirror/TipTap-shaped JSON content tree (a
// DocumentTemplateSection's `content` column) and produces the final HTML
// for a document. Three custom node types carry everything that was
// genuinely computed code in V1's hardcoded `buildXHtml` functions, not
// admin-authored prose:
//
//   - mergeTag         — resolved from `ctx.data` by dot-path
//                        (e.g. "entity.shortName"), exactly matching V1's
//                        `${entity.shortName}` template-literal
//                        interpolation, just moved from JS into
//                        admin-authored content. An unresolved or unknown
//                        tag renders as an empty string rather than
//                        throwing — a template mid-draft with a dangling
//                        tag should still preview, not crash the editor.
//   - conditionalBlock — evaluated with the EXACT SAME closed condition
//                        grammar as the Pricing Engine's waiver rules
//                        (evaluateConditions, from ../pricing/rules.js),
//                        not a second parallel one, per the schema's
//                        design comment. `ctx.conditionCtx` is the same
//                        shape evaluateConditions already expects
//                        elsewhere (lockinYears, setupEnabled, ...).
//   - computedTable    — filled from `ctx.computedTables[tableKey]`, a
//                        pre-rendered HTML string supplied by the caller
//                        (the Pricing Engine's live QuoteLine/
//                        QuoteScheduleRow output) — never resolved here.
//
// An Annex is just a Section with `kind === "ANNEX"`; renderSection is
// where that shows up (a different heading tag/class), matching how V1's
// own AgreementTemplateSection already treats every section uniformly.

import { evaluateConditions } from "../pricing/rules.js";

const MARK_TAGS = { bold: "strong", italic: "em", underline: "u" };

export function renderDocument(sections, ctx) {
  return [...sections]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((section) => renderSection(section, ctx))
    .join("\n");
}

export function renderSection(section, ctx) {
  const isAnnex = section.kind === "ANNEX";
  const headingTag = isAnnex ? "h1" : "h2";
  const classAttr = isAnnex ? ' class="annex"' : "";
  const body = renderNode(section.content, ctx);
  return `<section data-section-key="${escapeAttr(section.sectionKey)}"${classAttr}><${headingTag}>${escapeHtml(section.title)}</${headingTag}>${body}</section>`;
}

export function renderNode(node, ctx) {
  if (!node) return "";
  switch (node.type) {
    case "doc":
      return renderChildren(node, ctx);
    case "paragraph":
      return `<p>${renderChildren(node, ctx)}</p>`;
    case "heading": {
      const level = node.attrs?.level || 2;
      return `<h${level}>${renderChildren(node, ctx)}</h${level}>`;
    }
    case "bulletList":
      return `<ul>${renderChildren(node, ctx)}</ul>`;
    case "orderedList":
      return `<ol>${renderChildren(node, ctx)}</ol>`;
    case "listItem":
      return `<li>${renderChildren(node, ctx)}</li>`;
    case "text":
      return applyMarks(escapeHtml(node.text || ""), node.marks);
    case "mergeTag":
      return escapeHtml(resolveMergeTag(node.attrs?.tag, ctx.data));
    case "conditionalBlock":
      return evaluateConditions(node.attrs?.conditions, ctx.conditionCtx || {}) ? renderChildren(node, ctx) : "";
    case "computedTable":
      return ctx.computedTables?.[node.attrs?.tableKey] || "";
    default:
      // An unrecognized node kind still renders its children, so a
      // wrapper type this renderer doesn't know about yet doesn't
      // silently drop real content underneath it.
      return renderChildren(node, ctx);
  }
}

function renderChildren(node, ctx) {
  return (node.content || []).map((child) => renderNode(child, ctx)).join("");
}

function applyMarks(html, marks) {
  if (!marks) return html;
  return marks.reduce((acc, mark) => {
    const tag = MARK_TAGS[mark.type];
    return tag ? `<${tag}>${acc}</${tag}>` : acc;
  }, html);
}

function resolveMergeTag(tag, data) {
  if (!tag || !data) return "";
  const value = tag.split(".").reduce((obj, key) => (obj == null ? undefined : obj[key]), data);
  return value == null ? "" : String(value);
}

// Text-content escaping only needs `&`/`<`/`>` — this renderer never
// places arbitrary text inside an HTML attribute (that's escapeAttr,
// below), so `"`/`'` are left as literal characters. That matters for
// golden-value parity: V1's legal text is full of quoted defined terms
// (the "Setup Period") and possessives (CLIENT's) written as raw HTML,
// not entities — escaping them here would make otherwise-identical text
// diff against V1's real shipped output for no security benefit.
function escapeHtml(str) {
  return String(str).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function escapeAttr(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
