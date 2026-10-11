const $ = (sel) => document.querySelector(sel);

const STORE_KEY = "dragonCard.v1";
const DEAL_GAP = 450;

const gate = $("#gate");
const intro = $("#intro");
const pick = $("#pick");
const pickRow = $("#pick-row");
const codeLayer = $("#code-layer");
const codeForm = $("#code-form");
const codeInput = $("#code-input");
const codeError = $("#code-error");
const revealLayer = $("#reveal-layer");
const gallery = $("#gallery");
const viewer = $("#viewer");
const toast = $("#toast");

let cards = [];
let cardMap = new Map();
let codeSalt = "";
let codeHashes = new Set();
let store = { used: [], pending: null, collection: [], music: true };
let choosing = false;
let toastTimer = 0;
let selecting = false;
let selected = new Set();
let viewerItem = null;
let installPrompt = null;
let music = null;
const fileCache = new Map();

function showToast(message, ms = 2800) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, ms);
}

function loadStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    store = {
      used: Array.isArray(raw.used) ? raw.used : [],
      pending: raw.pending && Array.isArray(raw.pending.cardIds) ? raw.pending : null,
      collection: Array.isArray(raw.collection) ? raw.collection : [],
      music: raw.music !== false,
    };
  } catch {
    store = { used: [], pending: null, collection: [], music: true };
  }
}

function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    showToast("저장 공간이 부족해서 기록을 저장하지 못했습니다.");
  }
}

function cardStyle(path) {
  return `url('${new URL(path, location.href).href}')`;
}

function formatWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function itemCard(item) {
  const card = cardMap.get(item.cardId);
  return {
    ...item,
    name: card ? card.name : item.name,
    image: card ? card.image : item.image,
  };
}

function randomIndex(max) {
  if (window.crypto && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / max) * max;
    do crypto.getRandomValues(buf); while (buf[0] >= limit);
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function pickThree() {
  const pool = cards.slice();
  if (pool.length >= 3) {
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = randomIndex(i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 3);
  }
  return [0, 1, 2].map(() => pool[randomIndex(pool.length)]);
}

function healPending() {
  const pending = store.pending;
  if (!pending) return;
  if (pending.cardIds.length === 3 && pending.cardIds.every((id) => cardMap.has(id))) return;
  store.used = store.used.filter((hash) => hash !== pending.hash);
  store.pending = null;
  saveStore();
}

function updateCount() {
  $("#gallery-count").textContent = String(store.collection.length);
}

function openCode() {
  if (store.pending) {
    showPick(true);
    return;
  }
  if (!cards.length) {
    showToast("뽑을 카드가 없습니다. PC판에서 카드를 등록한 뒤 다시 만들어 주세요.");
    return;
  }
  codeError.textContent = "";
  codeInput.value = "";
  codeLayer.hidden = false;
  setTimeout(() => codeInput.focus(), 50);
}

function closeCode() {
  codeInput.blur();
  codeLayer.hidden = true;
}

function failCode(message) {
  codeError.textContent = message;
  codeError.classList.remove("shake");
  void codeError.offsetWidth;
  codeError.classList.add("shake");
}

async function submitCode(event) {
  event.preventDefault();
  const code = CodeInput.normalizeCode(codeInput.value);
  codeInput.value = code;
  if (code.length !== 5) {
    failCode("코드 5자리를 입력해 주세요.");
    return;
  }
  if (store.pending) {
    showPick(true);
    return;
  }
  const submit = codeForm.querySelector("[type=submit]");
  submit.disabled = true;
  try {
    const hash = await sha256Hex(`${codeSalt}:${code}`);
    if (!codeHashes.has(hash)) {
      failCode("없는 코드입니다.");
      return;
    }
    if (store.used.includes(hash)) {
      failCode("이미 사용한 코드입니다.");
      return;
    }
    store.used.push(hash);
    store.pending = { hash, code, cardIds: pickThree().map((card) => card.id) };
    saveStore();
    codeInput.blur();
    showPick(false);
  } finally {
    submit.disabled = false;
  }
}

function showPick(resumed) {
  choosing = true;
  pickRow.classList.remove("locked", "picked");
  pickRow.innerHTML = "";
  $("#pick-note").textContent = resumed ? "아직 고르지 않은 카드가 있습니다" : "코드가 확인되었습니다";
  $("#pick-title").textContent = "카드를 나눠 주는 중…";
  codeLayer.hidden = true;
  gallery.hidden = true;
  pick.hidden = false;
  for (let index = 0; index < 3; index += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot";
    button.disabled = true;
    button.setAttribute("aria-label", `${index + 1}번째 카드`);
    button.innerHTML = `<span class="inner"><span class="face back"></span><span class="face front"></span></span>`;
    button.addEventListener("click", () => chooseCard(index, button));
    pickRow.appendChild(button);
    setTimeout(() => button.classList.add("dealt"), 250 + index * DEAL_GAP);
  }
  setTimeout(() => {
    choosing = false;
    $("#pick-title").textContent = "세 장 중 한 장을 고르세요";
    pickRow.querySelectorAll(".slot").forEach((slot) => {
      slot.disabled = false;
    });
  }, 250 + 3 * DEAL_GAP + 300);
}

function chooseCard(index, button) {
  if (choosing || !store.pending) return;
  choosing = true;
  pickRow.classList.add("locked");
  pickRow.querySelectorAll(".slot").forEach((slot) => {
    slot.disabled = true;
  });
  const card = cardMap.get(store.pending.cardIds[index]);
  if (!card) {
    healPending();
    pick.hidden = true;
    showToast("카드를 찾을 수 없습니다. 같은 코드로 다시 뽑아 주세요.");
    return;
  }
  const item = {
    id: `${Date.now().toString(36)}${randomIndex(1e6).toString(36)}`,
    cardId: card.id,
    name: card.name,
    image: card.image,
    code: store.pending.code,
    acquiredAt: new Date().toISOString(),
  };
  store.collection.unshift(item);
  store.pending = null;
  saveStore();
  updateCount();
  fileFor(item);
  button.querySelector(".front").style.setProperty("--card", cardStyle(card.image));
  button.classList.add("chosen", "flipped");
  pickRow.classList.add("picked");
  $("#pick-title").textContent = card.name;
  setTimeout(() => openReveal(item), 1500);
}

function openReveal(item) {
  $("#reveal-name").textContent = item.name;
  $("#reveal-card").style.setProperty("--card", cardStyle(item.image));
  revealLayer.hidden = false;
}

function renderGallery() {
  const box = $("#gallery-grid");
  const items = store.collection.map(itemCard);
  const kinds = new Set(items.map((item) => item.cardId)).size;
  $("#gallery-summary").textContent = items.length
    ? `모두 ${items.length}장 · ${kinds}종류`
    : "아직 뽑은 카드가 없습니다. 카드 뽑기로 첫 카드를 모아 보세요.";
  $("#select-mode").hidden = !items.length;
  box.classList.toggle("selecting", selecting);
  box.innerHTML = items
    .map((item) => {
      const on = selected.has(item.id);
      return `<button class="gallery-item${on ? " selected" : ""}" type="button" data-id="${escapeHtml(item.id)}" aria-pressed="${on}">
        <span class="gallery-card face-front" style="--card: ${cardStyle(item.image)}"></span>
        <span class="tick" aria-hidden="true">✓</span>
        <strong>${escapeHtml(item.name)}</strong>
        <small>${formatWhen(item.acquiredAt)}</small>
      </button>`;
    })
    .join("");
  box.querySelectorAll(".gallery-item").forEach((button) => {
    button.addEventListener("click", () => {
      const item = items.find((entry) => entry.id === button.dataset.id);
      if (!item) return;
      if (selecting) toggleSelect(item, button);
      else openViewer(item);
    });
  });
  updateSelectionUi();
}

function toggleSelect(item, button) {
  if (selected.has(item.id)) selected.delete(item.id);
  else {
    selected.add(item.id);
    fileFor(item);
  }
  const on = selected.has(item.id);
  button.classList.toggle("selected", on);
  button.setAttribute("aria-pressed", String(on));
  updateSelectionUi();
}

function updateSelectionUi() {
  $("#select-mode").textContent = selecting ? "선택 취소" : "선택";
  $("#select-all").hidden = !selecting;
  $("#save-selected").hidden = !selecting;
  $("#save-selected").disabled = selected.size === 0;
  $("#save-selected").textContent = selected.size ? `${selected.size}장 저장` : "저장";
  const total = store.collection.length;
  $("#select-all").textContent = total && selected.size === total ? "선택 해제" : "전체 선택";
}

function setSelecting(on) {
  selecting = on;
  selected = new Set();
  renderGallery();
}

function selectAll() {
  const items = store.collection.map(itemCard);
  if (selected.size === items.length) selected = new Set();
  else {
    selected = new Set(items.map((item) => item.id));
    items.forEach(fileFor);
  }
  renderGallery();
}

function openGallery() {
  revealLayer.hidden = true;
  pick.hidden = true;
  selecting = false;
  selected = new Set();
  renderGallery();
  gallery.hidden = false;
  gallery.scrollTop = 0;
}

function closeGallery() {
  gallery.hidden = true;
}

function openViewer(item) {
  viewerItem = item;
  fileFor(item);
  const value = cardStyle(item.image);
  $("#viewer-front").style.setProperty("--card", value);
  $("#viewer-back").style.setProperty("--card", value);
  $("#viewer-card").classList.remove("flipped");
  $("#viewer-name").textContent = item.name;
  $("#viewer-meta").textContent = `${formatWhen(item.acquiredAt)} 획득${item.code ? ` · 코드 ${item.code}` : ""}`;
  viewer.hidden = false;
}

function closeViewer() {
  viewer.hidden = true;
  viewerItem = null;
}

function safeName(name) {
  return String(name || "card").replace(/[\\/:*?"<>|]+/g, "").trim() || "card";
}

function fileFor(item) {
  const key = item.image;
  if (!fileCache.has(key)) {
    const job = fetch(item.image)
      .then((response) => {
        if (!response.ok) throw new Error("그림을 불러오지 못했습니다.");
        return response.blob();
      })
      .then((blob) => {
        const type = blob.type || "image/png";
        const ext = type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : "png";
        return new File([blob], `${safeName(item.name)}.${ext}`, { type });
      });
    job.catch(() => fileCache.delete(key));
    fileCache.set(key, job);
  }
  return fileCache.get(key);
}

function isAppleTouch() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function uniqueFiles(files) {
  const seen = new Map();
  return files.map((file) => {
    const count = seen.get(file.name) || 0;
    seen.set(file.name, count + 1);
    if (!count) return file;
    const dot = file.name.lastIndexOf(".");
    const name = `${file.name.slice(0, dot)} (${count + 1})${file.name.slice(dot)}`;
    return new File([file], name, { type: file.type });
  });
}

function download(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function saveItems(items) {
  if (!items.length) return;
  let files;
  try {
    files = uniqueFiles(await Promise.all(items.map(fileFor)));
  } catch (error) {
    showToast(error.message || "그림을 불러오지 못했습니다.");
    return;
  }
  if (isAppleTouch() && navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({ files });
      showToast("‘이미지 저장’을 누르면 사진에 저장됩니다.");
      return;
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
  }
  for (const file of files) {
    download(file);
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  showToast(`${files.length}장을 저장했습니다. 다운로드 폴더(갤러리의 Download 앨범)를 확인하세요.`, 4200);
}

function saveSelected() {
  const items = store.collection.map(itemCard).filter((item) => selected.has(item.id));
  saveItems(items);
}

function setMusic(on) {
  store.music = on;
  saveStore();
  const button = $("#toggle-music");
  button.classList.toggle("off", !on);
  button.setAttribute("aria-label", on ? "배경음악 끄기" : "배경음악 켜기");
  if (!music) return;
  if (on) music.play().catch(() => {});
  else music.pause();
}

function startMusic() {
  if (!music) {
    music = new Audio("assets/bgm.mp3");
    music.loop = true;
    music.volume = 0.7;
  }
  if (store.music) music.play().catch(() => {});
}

function finishIntro() {
  if (intro.hidden || intro.classList.contains("done")) return;
  $("#intro-video").pause();
  intro.classList.add("done");
  setTimeout(() => {
    intro.hidden = true;
  }, 650);
  if (store.pending) showPick(true);
}

function enterApp() {
  if (gate.hidden) return;
  gate.hidden = true;
  startMusic();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  const standalone = matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches
    || navigator.standalone;
  if (!standalone && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
  const video = $("#intro-video");
  intro.hidden = false;
  video.muted = true;
  video.currentTime = 0;
  video.play().catch(finishIntro);
}

function setupInstall() {
  const button = $("#install-app");
  const standalone = matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches
    || navigator.standalone;
  if (standalone) return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    button.hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    button.hidden = true;
    showToast("앱이 설치되었습니다. 홈 화면 아이콘으로 실행하세요.");
  });
  if (isAppleTouch()) button.hidden = false;
  button.addEventListener("click", async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice.catch(() => null);
      installPrompt = null;
      button.hidden = true;
      return;
    }
    if (isAppleTouch()) {
      showToast("Safari 아래쪽(또는 위쪽) 공유 버튼 → ‘홈 화면에 추가’를 누르세요.", 5200);
    }
  });
}

function setupServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  const status = $("#gate-status");
  navigator.serviceWorker.register("sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data || {};
    if (data.type === "progress" && !gate.hidden) {
      status.textContent = `오프라인 준비 중… ${data.done}/${data.total}`;
    }
    if (data.type === "ready" && !gate.hidden) {
      status.textContent = "인터넷 없이도 실행할 수 있습니다";
    }
  });
}

async function loadData() {
  const [cardData, codeData] = await Promise.all([
    fetch("data/cards.json").then((response) => response.json()),
    fetch("data/codes.json").then((response) => response.json()),
  ]);
  cards = Array.isArray(cardData.cards) ? cardData.cards : [];
  cardMap = new Map(cards.map((card) => [card.id, card]));
  codeSalt = String(codeData.salt || "");
  codeHashes = new Set(codeData.hashes || []);
}

async function boot() {
  const params = new URLSearchParams(location.search);
  loadStore();
  setupServiceWorker();
  setupInstall();
  setMusic(store.music);

  gate.addEventListener("click", enterApp);
  $("#skip-intro").addEventListener("click", finishIntro);
  $("#intro-video").addEventListener("ended", finishIntro);
  $("#intro-video").addEventListener("error", finishIntro);
  $("#open-draw").addEventListener("click", openCode);
  $("#open-gallery").addEventListener("click", openGallery);
  $("#close-gallery").addEventListener("click", closeGallery);
  $("#toggle-music").addEventListener("click", () => {
    if (!music) startMusic();
    setMusic(!store.music);
  });
  $("#code-cancel").addEventListener("click", closeCode);
  codeForm.addEventListener("submit", submitCode);
  CodeInput.bindCodeInput(codeInput);
  $("#reveal-ok").addEventListener("click", () => {
    revealLayer.hidden = true;
    pick.hidden = true;
  });
  $("#reveal-gallery").addEventListener("click", openGallery);
  $("#select-mode").addEventListener("click", () => setSelecting(!selecting));
  $("#select-all").addEventListener("click", selectAll);
  $("#save-selected").addEventListener("click", saveSelected);
  $("#viewer-close").addEventListener("click", closeViewer);
  $("#viewer-save").addEventListener("click", () => viewerItem && saveItems([viewerItem]));
  $("#viewer-card").addEventListener("click", () => $("#viewer-card").classList.toggle("flipped"));
  viewer.addEventListener("click", (event) => {
    if (event.target === viewer) closeViewer();
  });
  document.addEventListener("visibilitychange", () => {
    if (!music) return;
    if (document.hidden) music.pause();
    else if (store.music && gate.hidden) music.play().catch(() => {});
  });

  try {
    await loadData();
  } catch {
    showToast("카드 정보를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.", 5000);
  }
  healPending();
  updateCount();

  if (params.has("home")) {
    gate.hidden = true;
    if (params.has("gallery")) openGallery();
  }
  if (store.pending && gate.hidden) showPick(true);
}

boot();
