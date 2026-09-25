import { $, el, clear } from "./dom.js";

export function initHistoryScreen({ onOpenCommit, onBack, onRefresh }) {
  const list = $("history-list");
  const title = $("history-title");
  const btnBack = $("history-back");
  const btnRefresh = $("history-refresh");

  btnBack.addEventListener("click", () => onBack());
  btnRefresh.addEventListener("click", () => onRefresh());

  return {
    setRepoLabel(text) { title.textContent = text; },
    render(commits, currentSha) {
      clear(list);
      if (!commits.length) {
        list.appendChild(el("li", { class: "empty", text: "Нет коммитов" }));
        return;
      }
      for (const c of commits) {
        const short = c.sha.slice(0, 7);
        const msg = (c.commit.message || "").split("\n")[0];
        const author = c.author?.login || c.commit.author?.name || "unknown";
        const date = c.commit.author?.date
          ? new Date(c.commit.author.date).toLocaleString()
          : "";

        const li = el("li", {
          class: "history-item",
          onclick: () => onOpenCommit(c),
        }, [
          el("div", { class: "history-line1" }, [
            el("span", { class: "sha", text: short }),
            el("span", { class: "msg", text: msg }),
          ]),
          el("div", { class: "history-line2" }, [
            el("span", { class: "author", text: author }),
            el("span", { class: "date", text: date }),
          ]),
        ]);
        if (c.sha === currentSha) li.classList.add("current");
        list.appendChild(li);
      }
    },
  };
}