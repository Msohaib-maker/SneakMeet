import { els } from "./dom.js";

export function renderSummary(sum, practice) {
  const b = els.psBody;
  b.textContent = "";
  const add = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    b.appendChild(e);
    return e;
  };
  if (!sum) {
    add("p", "muted", "No readings were collected.");
    return;
  }
  add("div", `p-state ${sum.state}`, sum.headline || sum.state);
  add("p", "", sum.summary);
  const listOf = (title, xs) => {
    if (!xs.length) return;
    add("div", "panel-title", title);
    const ul = add("ul", "ps-list");
    for (const x of xs) {
      const li = document.createElement("li");
      li.textContent = x;
      ul.appendChild(li);
    }
  };
  listOf("Strengths", sum.strengths);
  listOf("To work on", sum.improvements);
  const t = add("div", "p-timeline");
  t.replaceChildren(
    ...[...els.pTimeline.childNodes].map((n) => n.cloneNode(true)),
  );
  add(
    "div",
    "muted",
    `${sum.source === "gemini" ? "Written by Gemini from your numbers." : "Offline summary (no AI)."} ${practice.session.windows.length} reading windows · camera-based estimates, not a medical assessment.`,
  );
}
