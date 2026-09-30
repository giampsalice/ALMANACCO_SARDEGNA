import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.149/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.149/build/pdf.worker.min.mjs";

const reader = document.getElementById("pdf-reader");
const stage = document.getElementById("pdf-reader-stage");
const canvas = document.getElementById("pdf-canvas");
const context = canvas.getContext("2d");
const title = document.getElementById("pdf-reader-title");
const status = document.getElementById("pdf-reader-status");
const prev = document.getElementById("pdf-prev");
const next = document.getElementById("pdf-next");
const zoomOut = document.getElementById("pdf-zoom-out");
const zoomIn = document.getElementById("pdf-zoom-in");
const fit = document.getElementById("pdf-fit");
const fullscreen = document.getElementById("pdf-fullscreen");
const close = document.getElementById("pdf-close");

let documentPdf = null;
let renderTask = null;
let pageNumber = 1;
let scale = 1;
let fitWidth = true;

function postParentFullscreen(active) {
  if (window.parent === window) return;
  window.parent.postMessage({ type: "almanacco:fullscreen", active: Boolean(active) }, "*");
}

function showMessage(heading, text) {
  stage.innerHTML = `<div class="pdf-reader__message"><strong>${heading}</strong>${text}</div>`;
}

function restoreCanvas() {
  stage.innerHTML = "";
  stage.appendChild(canvas);
}

async function renderPage() {
  if (!documentPdf) return;

  if (renderTask) {
    try { renderTask.cancel(); } catch {}
  }

  const page = await documentPdf.getPage(pageNumber);
  let useScale = scale;

  if (fitWidth) {
    const base = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(240, stage.clientWidth - 56);
    useScale = Math.max(.25, availableWidth / base.width);
  }

  const viewport = page.getViewport({ scale: useScale });
  const ratio = window.devicePixelRatio || 1;

  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  renderTask = page.render({
    canvasContext: context,
    viewport,
    transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null
  });

  try {
    await renderTask.promise;
  } catch (error) {
    if (error?.name !== "RenderingCancelledException") throw error;
  }

  status.textContent = `Pagina ${pageNumber} / ${documentPdf.numPages}`;
  prev.disabled = pageNumber <= 1;
  next.disabled = pageNumber >= documentPdf.numPages;
  stage.scrollTo({ top: 0, left: 0 });
}

async function openPdf(url, label) {
  title.textContent = label || "Lettura PDF";
  status.textContent = "Caricamento…";
  pageNumber = 1;
  scale = 1;
  fitWidth = true;
  restoreCanvas();
  canvas.hidden = true;

  if (!reader.open) reader.showModal();

  try {
    documentPdf = await pdfjsLib.getDocument({ url }).promise;
    canvas.hidden = false;
    await renderPage();
  } catch (error) {
    console.error(error);
    documentPdf = null;
    status.textContent = "Errore di caricamento";
    showMessage(
      "Il PDF non può essere visualizzato",
      "Verifica che il file sia presente nella cartella pdf del repository e che GitHub Pages abbia terminato la pubblicazione."
    );
  }
}

async function setExpanded(active) {
  if (active) {
    reader.classList.add("is-expanded");
    fullscreen.setAttribute("aria-label", "Riduci il lettore");
    postParentFullscreen(true);
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (fitWidth) await renderPage();
    return;
  }

  reader.classList.remove("is-expanded");
  fullscreen.setAttribute("aria-label", "Schermo intero");
  postParentFullscreen(false);
  await new Promise(resolve => requestAnimationFrame(resolve));
  if (fitWidth) await renderPage();
}

async function toggleFullscreen() {
  const isNativeFullscreen = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  const isExpanded = reader.classList.contains("is-expanded");

  if (isNativeFullscreen) {
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
    } catch {}
    await setExpanded(false);
    return;
  }

  if (isExpanded) {
    await setExpanded(false);
    return;
  }

  await setExpanded(true);

  try {
    if (reader.requestFullscreen) await reader.requestFullscreen();
    else if (reader.webkitRequestFullscreen) await reader.webkitRequestFullscreen();
  } catch {
    /*
      In WordPress il fullscreen nativo può essere bloccato dall'iframe.
      In quel caso restano attivi:
      1. la classe .is-expanded nel documento GitHub Pages;
      2. il messaggio al blocco embed WordPress, che rende l'iframe fixed a piena finestra.
    */
  }

  if (fitWidth) await renderPage();
}

document.addEventListener("click", event => {
  const link = event.target.closest("#pdf-link");
  if (!link || link.getAttribute("aria-disabled") === "true") return;

  const href = link.getAttribute("href");
  if (!href || href === "#") return;

  event.preventDefault();
  event.stopPropagation();
  openPdf(href, document.getElementById("dialog-title")?.textContent || "Almanacco della Sardegna");
}, true);

prev.addEventListener("click", () => {
  if (pageNumber > 1) {
    pageNumber--;
    renderPage();
  }
});

next.addEventListener("click", () => {
  if (documentPdf && pageNumber < documentPdf.numPages) {
    pageNumber++;
    renderPage();
  }
});

zoomOut.addEventListener("click", () => {
  scale = Math.max(.4, (fitWidth ? 1 : scale) - .2);
  fitWidth = false;
  renderPage();
});

zoomIn.addEventListener("click", () => {
  scale = Math.min(4, (fitWidth ? 1 : scale) + .2);
  fitWidth = false;
  renderPage();
});

fit.addEventListener("click", () => {
  fitWidth = true;
  renderPage();
});

fullscreen.addEventListener("click", toggleFullscreen);

close.addEventListener("click", () => reader.close());

function handleNativeFullscreenChange() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement && reader.classList.contains("is-expanded")) {
    fullscreen.setAttribute("aria-label", "Riduci il lettore");
  }
}

document.addEventListener("fullscreenchange", handleNativeFullscreenChange);
document.addEventListener("webkitfullscreenchange", handleNativeFullscreenChange);

reader.addEventListener("click", event => {
  if (event.target === reader) reader.close();
});

reader.addEventListener("cancel", event => {
  event.preventDefault();
  reader.close();
});

reader.addEventListener("close", () => {
  try { renderTask?.cancel(); } catch {}
  try { documentPdf?.destroy(); } catch {}
  renderTask = null;
  documentPdf = null;
  reader.classList.remove("is-expanded");
  fullscreen.setAttribute("aria-label", "Schermo intero");
  postParentFullscreen(false);
});

window.addEventListener("resize", () => {
  if (reader.open && fitWidth) renderPage();
});
