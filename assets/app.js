const state = { issues: [], decade: "all", query: "", active: null };
const palette = [
  ["#173d35", "#f6f0df"], ["#8d3d32", "#fff5df"], ["#294766", "#f2e7cc"],
  ["#b18b42", "#17312c"], ["#4d5144", "#f6ebd6"], ["#744b5a", "#fff1dc"]
];
const $ = selector => document.querySelector(selector);
const grid = $("#grid");
const dialog = $("#volume-dialog");
const volumeCard = $("#volume-card");
const config = window.ALMANACCO_CONFIG || {};

function issuePalette(issue) {
  const index = Math.abs(Number(issue.volume || issue.year)) % palette.length;
  return palette[index];
}

function coverMarkup(issue, modal = false) {
  const [bg, fg] = issuePalette(issue);
  const image = issue.coverUrl ? `<img src="${escapeAttr(issue.coverUrl)}" alt="${escapeAttr(issue.coverAlt)}" loading="lazy">` : "";
  return `<div ${modal ? 'id="modal-cover"' : ""} class="${modal ? "modal-cover" : "cover"}" style="--cover-bg:${bg};--cover-fg:${fg}">
    ${image}<div class="cover-copy"><small>Almanacco della Sardegna</small><strong>${escapeHtml(issue.yearLabel)}</strong><span>Volume ${escapeHtml(issue.volume ?? "—")}</span></div>
  </div>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}
function escapeAttr(value = "") { return escapeHtml(value); }
function searchable(issue) {
  return [issue.title, issue.yearLabel, ...issue.contents.flatMap(x => [x.title, x.author, x.section])].join(" ").toLocaleLowerCase("it");
}

function parseCsv(source) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ""; }
    else if (char === '\n') { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

function numberValue(value, fallback = null) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapCsvIssues(csvText, localIssues) {
  const rows = parseCsv(csvText);
  const headerIndex = rows.findIndex(row => row.some(cell => cell.replace(/^\uFEFF/, "").trim() === "ID numero"));
  if (headerIndex < 0) throw new Error("Intestazione ID numero non trovata nel CSV");
  const headers = rows[headerIndex].map(cell => cell.replace(/^\uFEFF/, "").trim());
  const localById = new Map(localIssues.map(issue => [issue.id, issue]));
  const mapped = [];
  for (const values of rows.slice(headerIndex + 1)) {
    const record = Object.fromEntries(headers.map((header, index) => [header, (values[index] || "").trim()]));
    const id = record["ID numero"];
    if (!id) continue;
    const local = localById.get(id) || {};
    const year = numberValue(record["Anno"], local.year || 0);
    const title = record["Titolo"] || local.title || `Almanacco della Sardegna ${year}`;
    const labelMatch = title.match(/\b(?:19|20)\d{2}(?:[\/–-](?:19|20)?\d{2})?/);
    const yearLabel = labelMatch ? labelMatch[0].replace(/[–-]/g, "/") : (local.yearLabel || String(year));
    mapped.push({
      ...local,
      id,
      title,
      year,
      yearLabel,
      decade: Math.floor(year / 10) * 10,
      volume: numberValue(record["Volume numero"], local.volume),
      place: record["Luogo"] || local.place || "",
      publisher: record["Editore"] || local.publisher || "",
      lastPage: numberValue(record["Ultima pagina indicizzata"], local.lastPage),
      slug: record["Slug"] || local.slug || "",
      pdfUrl: record["URL download numero"] || "",
      coverUrl: record["URL immagine copertina"] || "",
      coverAlt: record["Testo alternativo copertina"] || local.coverAlt || `Copertina ${title}`,
      featured: (record["In evidenza"] || "Sì").toLocaleLowerCase("it") !== "no",
      sortOrder: numberValue(record["Ordinamento"], local.sortOrder || year),
      sourceFile: record["File sorgente"] || local.sourceFile || "",
      notes: record["Note"] || local.notes || "",
      contents: local.contents || []
    });
  }
  if (!mapped.length) throw new Error("Il CSV non contiene numeri pubblicabili");
  return mapped.sort((a, b) => a.sortOrder - b.sortOrder || (a.volume || 0) - (b.volume || 0));
}

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function loadCatalog() {
  const localResponse = await fetch("data/almanacco.json", { cache: "no-store" });
  if (!localResponse.ok) throw new Error("Catalogo locale non disponibile");
  const local = await localResponse.json();
  const source = $("#data-source");
  try {
    const csv = await fetchText(config.csvUrl);
    source.textContent = "Dati aggiornati da Google Drive";
    source.classList.add("is-live");
    return mapCsvIssues(csv, local.issues);
  } catch (remoteError) {
    try {
      const csv = await fetchText(config.csvFallback || "data/numeri.csv");
      source.textContent = "Copia sincronizzata da Google Drive";
      source.title = remoteError.message;
      return mapCsvIssues(csv, local.issues);
    } catch {
      source.textContent = "Catalogo locale";
      return local.issues;
    }
  }
}

function buildDecades() {
  const decades = [...new Set(state.issues.map(x => x.decade))];
  const items = [["all", "Tutte"], ...decades.map(d => [String(d), `Anni ${String(d).slice(2)}`])];
  $("#decades").innerHTML = items.map(([value, label]) => `<button type="button" data-decade="${value}" aria-pressed="${state.decade === value}">${label}</button>`).join("");
}

function visibleIssues() {
  const q = state.query.trim().toLocaleLowerCase("it");
  return state.issues.filter(issue => (state.decade === "all" || String(issue.decade) === state.decade) && (!q || searchable(issue).includes(q)));
}

function render() {
  buildDecades();
  const issues = visibleIssues();
  const title = state.decade === "all" ? "Tutti i numeri" : `Gli anni ${state.decade.slice(2)}`;
  $("#catalog-title").textContent = title;
  $("#result-count").textContent = `${issues.length} ${issues.length === 1 ? "numero" : "numeri"}`;
  grid.innerHTML = "";
  const template = $("#card-template");
  issues.forEach(issue => {
    const node = template.content.cloneNode(true);
    const button = node.querySelector("button");
    node.querySelector(".cover").outerHTML = coverMarkup(issue);
    node.querySelector(".issue-card__year").textContent = `Volume ${issue.volume} · ${issue.yearLabel}`;
    node.querySelector(".issue-card__title").textContent = issue.title.replace(/^Almanacco della Sardegna[. ]*/i, "") || issue.title;
    button.setAttribute("aria-label", `Apri ${issue.title}`);
    button.addEventListener("click", () => openIssue(issue));
    grid.appendChild(node);
  });
  $("#empty").hidden = issues.length !== 0;
  $("#catalogo").setAttribute("aria-busy", "false");
  notifyHeight();
}

function contentsMarkup(issue) {
  if (!issue.contents.length) return `<p>Nessun indice disponibile per questo numero.</p>`;
  return issue.contents.map((item, index) => `<article class="content-row">
    <span class="content-row__n">${String(index + 1).padStart(2,"0")}</span>
    <div><strong>${escapeHtml(item.title)}</strong>${item.author ? `<small>${escapeHtml(item.author)}</small>` : ""}</div>
    <span class="content-row__pages">${item.pages ? `pp. ${escapeHtml(item.pages)}` : ""}</span>
  </article>`).join("");
}

function openIssue(issue) {
  state.active = issue;
  volumeCard.classList.remove("is-flipped");
  $("#modal-cover").outerHTML = coverMarkup(issue, true);
  $("#dialog-volume").textContent = `Volume ${issue.volume} · ${issue.yearLabel}`;
  $("#dialog-title").textContent = issue.title;
  $("#back-title").textContent = issue.yearLabel;
  $("#dialog-meta").textContent = [issue.place, issue.publisher, issue.lastPage ? `${issue.lastPage} pagine indicizzate` : ""].filter(Boolean).join(" · ");
  $("#dialog-contents").innerHTML = contentsMarkup(issue);
  const pdf = $("#pdf-link");
  const available = /^https?:\/\//i.test(issue.pdfUrl);
  pdf.href = available ? issue.pdfUrl : "#";
  pdf.setAttribute("aria-disabled", String(!available));
  $("#pdf-status").textContent = available ? "Il documento si apre in una nuova scheda" : "PDF non ancora disponibile";
  if (!available) pdf.onclick = event => { event.preventDefault(); showToast("L’URL del PDF non è stato ancora inserito nel foglio."); };
  else pdf.onclick = null;
  history.replaceState(null, "", `#numero=${encodeURIComponent(issue.id)}`);
  dialog.showModal();
  notifyHeight();
}

function closeDialog() {
  dialog.close();
  state.active = null;
  volumeCard.classList.remove("is-flipped");
  history.replaceState(null, "", location.pathname + location.search);
  notifyHeight();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function notifyHeight() {
  if (window.parent !== window) requestAnimationFrame(() => window.parent.postMessage({ type: "almanacco:height", height: document.documentElement.scrollHeight }, "*"));
}

document.addEventListener("click", event => {
  const decade = event.target.closest("[data-decade]");
  if (decade) { state.decade = decade.dataset.decade; render(); }
  if (event.target.closest("[data-close]")) closeDialog();
  if (event.target.closest("[data-flip]")) volumeCard.classList.toggle("is-flipped");
});
dialog.addEventListener("click", event => { if (event.target === dialog) closeDialog(); });
dialog.addEventListener("cancel", event => { event.preventDefault(); closeDialog(); });
$("#search").addEventListener("input", event => { state.query = event.target.value; render(); });
$("#reset").addEventListener("click", () => { state.decade = "all"; state.query = ""; $("#search").value = ""; render(); });
window.addEventListener("resize", notifyHeight);

loadCatalog()
  .then(issues => {
    state.issues = issues;
    render();
    const id = new URLSearchParams(location.hash.slice(1)).get("numero");
    if (id) { const issue = state.issues.find(x => x.id === id); if (issue) openIssue(issue); }
  })
  .catch(error => {
    $("#catalogo").innerHTML = `<div class="empty"><p>${escapeHtml(error.message)}.</p><p>Verifica che il file <code>data/almanacco.json</code> sia presente.</p></div>`;
  });
