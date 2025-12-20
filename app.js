// Version: v3.0.1 | แก้ไขปุ่ม AI Commander กดไม่ได้ และแชทไม่ขึ้น
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  remove,
  onValue,
  get,
  serverTimestamp,
  query,
  orderByChild,
  runTransaction,
  limitToLast,
  onChildAdded,
  off,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { AppInfo } from "./version.js";

// ============================================================
// 1. CONFIGURATION & STATE
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyAVYqEmdw-AwS1tCElhSaXDLP1Aq35chp0",
  authDomain: "manowlive-chat.firebaseapp.com",
  databaseURL:
    "https://manowlive-chat-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "manowlive-chat",
};

const API_KEYS = [
  "AIzaSyAVzYQN51V-kITnyJWGy8IVSktitxrVD8g",
  "AIzaSyBlnw6tpETYu61XSNqd7zXt25Fv_vmbWJU",
  "AIzaSyAX3dwUqBFeCBjjZixVnlcBz56gAfNWzs0",
  "AIzaSyAxjRAs01mpt-NxQiR3yStr6Q-57EiQq64",
];

// --- Variables ---
let currentKeyIdx = 0;
let isConnected = false;
let isConnecting = false;
let isSimulating = false;
let myDeviceId = "dev-" + Math.random().toString(36).substr(2, 9);
let isAiCommander = false;
let geminiApiKey = localStorage.getItem("geminiApiKey") || "";

let currentVideoId = "demo";
let stockData = {};
let savedNames = {};
let shippingData = {};
let seenMessageIds = {};

let intervalId,
  viewerIntervalId,
  simIntervalId,
  autoDisconnectTimer,
  chatTimeoutId,
  awayInterval;
let activeChatId = "";
let chatToken = "";
let lastScrollTimestamp = 0;
let unsubscribeStock, unsubscribeSystem;

// V3 API Economy Variables
let unsubscribeChatStream = null;
let isUsingRelay = false;

let currentFontSize = 16;
let currentGridSize = 1;
let isUserScrolledUp = false;

// Chat Log Variables
let fullChatLog = [];
let streamStartTime = null;

// Audio
let audioCtx = null;
const synth = window.speechSynthesis;
let speechQueue = [];
let isSpeaking = false;
let isSoundOn = true;
let activeUtterance = null;
let isAudioUnlocked = false;

// Away Mode
let isAway = false;
let awayStartTime = 0;
let currentAwayState = false;

// History
let allHistoryData = [];
let historyCurrentPage = 1;
const historyItemsPerPage = 10;

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Check Version
const localVer = localStorage.getItem("app_version");
if (localVer !== AppInfo.version) {
  console.log(`Update: ${localVer} -> ${AppInfo.version}`);
  localStorage.setItem("app_version", AppInfo.version);
  window.location.reload(true);
}

// SWAL Config
const ModalSwal = Swal.mixin({ heightAuto: false, scrollbarPadding: false });
window.Swal = ModalSwal;

const Toast = Swal.mixin({
  toast: true,
  position: "top",
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  heightAuto: false,
  didOpen: (toast) => {
    toast.addEventListener("mouseenter", Swal.stopTimer);
    toast.addEventListener("mouseleave", Swal.resumeTimer);
  },
});

// ============================================================
// 2. ALL FUNCTIONS (DEFINED BEFORE USAGE)
// ============================================================

// --- 2.1 Helpers ---
function stringToColor(str) {
  var hash = 0;
  for (var i = 0; i < str.length; i++)
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return "hsl(" + (Math.abs(hash) % 360) + ", 85%, 75%)";
}
function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function updateStatusIcon(id, status) {
  const el = document.getElementById(id);
  if (el) {
    el.className = "status-item";
    el.classList.add(status);
  }
}
function updateKeyDisplay() {
  const el = document.getElementById("stat-key");
  if (el) el.innerHTML = `<i class="fa-solid fa-key"></i> ${currentKeyIdx + 1}`;
}
function setLoading(s) {
  const btn = document.getElementById("btnConnect");
  if (btn) btn.disabled = s;
}
function formatThaiDate(timestamp) {
  const date = new Date(timestamp);
  const months = [
    "ม.ค.",
    "ก.พ.",
    "มี.ค.",
    "เม.ย.",
    "พ.ค.",
    "มิ.ย.",
    "ก.ค.",
    "ส.ค.",
    "ก.ย.",
    "ต.ค.",
    "พ.ย.",
    "ธ.ค.",
  ];
  return (
    date.getDate() +
    " " +
    months[date.getMonth()] +
    " " +
    (date.getFullYear() + 543) +
    " (" +
    date.getHours().toString().padStart(2, "0") +
    ":" +
    date.getMinutes().toString().padStart(2, "0") +
    ")"
  );
}
function saveHistory(vid, title) {
  if (vid && vid !== "demo")
    set(ref(db, "history/" + vid), { title, timestamp: serverTimestamp() });
}
function updateAwayTimer() {
  if (!currentAwayState) return;
  const diff = Math.floor((Date.now() - awayStartTime) / 1000);
  const minutes = Math.floor(diff / 60);
  const seconds = diff % 60;
  const text = `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
  const el = document.getElementById("awayTimer");
  if (el) el.innerText = text;
}
function broadcastMessage(msg) {
  set(ref(db, "system/broadcast"), { text: msg, time: Date.now() });
}

function generateNameHtml(uid, realName) {
  const color = stringToColor(uid);
  let nick = realName;
  let displayName = realName;
  let isNickSet = false;
  if (savedNames[uid]) {
    if (typeof savedNames[uid] === "object") {
      nick = savedNames[uid].nick;
    } else {
      nick = savedNames[uid];
    }
    isNickSet = true;
    displayName = nick;
  }
  const valueToEdit = isNickSet ? nick : realName;
  let vipClass = "";
  if (/admin|แอดมิน/i.test(displayName) || /admin|แอดมิน/i.test(realName))
    vipClass = "vip-admin";
  if (isNickSet) {
    return `<div><span class="badge-nick ${vipClass}" style="${
      !vipClass ? "background:" + color : ""
    }" data-val="${escapeHtml(
      valueToEdit
    )}" onclick="window.askName('${uid}', this.getAttribute('data-val'))">${displayName}</span> <span class="real-name-sub">(${realName})</span></div>`;
  }
  return `<span class="badge-real ${vipClass}" style="color:${color}" data-val="${escapeHtml(
    realName
  )}" onclick="window.askName('${uid}', this.getAttribute('data-val'))">${realName}</span>`;
}

// --- 2.2 Audio ---
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}
function unlockAudio() {
  initAudio();
  if (isAudioUnlocked) return;
  if (audioCtx.state === "suspended") audioCtx.resume();
  synth.cancel();
  const buffer = audioCtx.createBuffer(1, 1, 22050);
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx.destination);
  source.start(0);
  isAudioUnlocked = true;
  console.log("🔊 Audio Unlocked");
}
if (typeof document !== "undefined") {
  ["click", "touchstart", "keydown"].forEach((evt) =>
    document.addEventListener(evt, unlockAudio, { once: false })
  );
}

function queueSpeech(txt) {
  if (!isSoundOn) return;
  initAudio();
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  speechQueue.push(txt);
  if (!isSpeaking) processQueue();
}

function processQueue() {
  if (speechQueue.length === 0) {
    isSpeaking = false;
    return;
  }
  if (synth.speaking && !isSpeaking) {
    synth.cancel();
  }
  isSpeaking = true;
  const u = new SpeechSynthesisUtterance(speechQueue.shift());
  u.lang = "th-TH";
  const voices = synth.getVoices();
  const thVoice = voices.find((v) => v.lang.includes("th"));
  if (thVoice) u.voice = thVoice;
  u.onend = () => {
    isSpeaking = false;
    processQueue();
  };
  u.onerror = () => {
    isSpeaking = false;
    processQueue();
  };
  activeUtterance = u;
  synth.speak(u);
}

function playDing() {
  if (!isSoundOn) return;
  initAudio();
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g);
  g.connect(audioCtx.destination);
  o.frequency.setValueAtTime(800, audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
  g.gain.setValueAtTime(0.3, audioCtx.currentTime);
  g.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
  o.start();
  o.stop(audioCtx.currentTime + 0.1);
}

function playCancel() {
  if (!isSoundOn) return;
  initAudio();
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "sawtooth";
  o.connect(g);
  g.connect(audioCtx.destination);
  o.frequency.setValueAtTime(150, audioCtx.currentTime);
  g.gain.setValueAtTime(0.2, audioCtx.currentTime);
  o.start();
  o.stop(audioCtx.currentTime + 0.3);
}
setInterval(() => {
  if (!synth.speaking && speechQueue.length > 0 && !isSpeaking) processQueue();
}, 1000);

// --- 2.3 Init Helpers ---
function initVersionControl() {
  const badge = document.querySelector(".version-badge");
  if (badge) {
    badge.innerText = `${AppInfo.version}`;
    badge.title = `เวอร์ชั่น: ${AppInfo.version} (${
      AppInfo.releaseDate
    })\n\n${AppInfo.changelog.join("\n")}`;
  }
  const toolsDropdown = document.getElementById("toolsDropdown");
  if (toolsDropdown && !document.getElementById("btnForceUpdate")) {
    const a = document.createElement("a");
    a.id = "btnForceUpdate";
    a.innerHTML =
      '<i class="fa-solid fa-rotate"></i> บังคับอัปเดต (Force Update)';
    a.style.color = "#00e676";
    a.onclick = () => window.forceUpdate();
    toolsDropdown.insertBefore(a, toolsDropdown.firstChild);
  }
}

function initStatusIcons() {
  const cluster = document.querySelector(".status-cluster");
  if (cluster) {
    cluster.innerHTML = `
            <span id="stat-db" class="status-item" title="สถานะฐานข้อมูล"><i class="fa-solid fa-database"></i></span>
            <span id="stat-api" class="status-item" title="สถานะ YouTube API"><i class="fa-brands fa-youtube"></i></span>
            <span id="stat-chat" class="status-item" title="สถานะการดึงแชท"><i class="fa-solid fa-comments"></i></span>
            <span id="stat-key" class="key-indicator" title="API Key"><i class="fa-solid fa-key"></i> 1</span>
        `;
  }
}

function initTooltips() {
  const tips = {
    btnAICommander: "ระบบ AI ช่วยจอง",
    "btn-shipping": "รายการพร้อมส่ง",
    btnConnect: "เชื่อมต่อ YouTube",
    btnSound: "เปิด/ปิดเสียง",
    stockSize: "จำนวนรายการ",
  };
  for (const [id, text] of Object.entries(tips)) {
    const el = document.getElementById(id);
    if (el) el.title = text;
  }
  const histBtn = document.querySelector(
    'button[onclick="window.openHistory()"]'
  );
  if (histBtn) histBtn.title = "ดูประวัติการไลฟ์ย้อนหลัง";
}

function syncAiCommanderStatus() {
  onValue(ref(db, "system/aiCommander"), (snap) => {
    const commanderId = snap.val();
    const btn = document.getElementById("btnAICommander");
    if (!btn) return;

    const oldIsAiCommander = isAiCommander; // เก็บสถานะเก่า

    if (commanderId === myDeviceId) {
      isAiCommander = true;
      btn.innerHTML = "🤖 AI: เปิด (Commander)";
      btn.className = "btn btn-ai active";
    } else if (commanderId) {
      isAiCommander = false;
      btn.innerHTML = "🤖 AI: ปิด (Viewer)";
      btn.className = "btn btn-ai remote";
    } else {
      isAiCommander = false;
      btn.innerHTML = "🤖 AI: ปิด";
      btn.className = "btn btn-ai inactive";
    }

    // [NEW] Dynamic Switching Logic for API Economy
    if (isConnected && activeChatId) {
      if (isAiCommander && !oldIsAiCommander) {
        // Switch to Commander
        console.log("Switching to Commander Mode (YouTube API)");
        if (unsubscribeChatStream) {
          unsubscribeChatStream();
          unsubscribeChatStream = null;
        }
        isUsingRelay = false;
        updateStatusIcon("stat-chat", "ok");
        loadChat();
        Toast.fire({
          icon: "info",
          title: "เปลี่ยนเป็นโหมด Commander (ดึงแชทเอง)",
        });
      } else if (!isAiCommander && oldIsAiCommander) {
        // Switch to Viewer
        console.log("Switching to Viewer Mode (Firebase Relay)");
        if (chatTimeoutId) clearTimeout(chatTimeoutId);
        isUsingRelay = true;
        subscribeToChatStream(activeChatId);
        Toast.fire({
          icon: "success",
          title: "เปลี่ยนเป็นโหมด Viewer (รับแชทจากแม่ข่าย)",
        });
      }
    }
  });
}

// --- 2.4 Data & Logic ---
function updateStats() {
  const total = parseInt(document.getElementById("stockSize").value) || 70;
  const soldCount = Object.keys(stockData).filter(
    (k) => stockData[k].owner
  ).length;
  document.getElementById("sold-count").innerText = soldCount;
  document.getElementById("total-count").innerText = total;
}

function renderSlot(num, data) {
  const el = document.getElementById("stock-" + num);
  if (!el) return;
  if (!data.owner) {
    el.className = "stock-item";
    document.getElementById(`status-${num}`).innerText = "ว่าง";
    if (data.price) {
      const pEl = document.getElementById(`price-${num}`);
      pEl.innerText = "฿" + data.price;
      pEl.style.display = "block";
      pEl.style.color = "var(--vacant-price)";
    }
    return;
  }
  el.className = "stock-item sold";
  const isNewOrder = Date.now() - data.time < 15000;
  if (isNewOrder) {
    el.classList.add("new-order");
    setTimeout(
      () => el.classList.remove("new-order"),
      15000 - (Date.now() - data.time)
    );
  } else {
    el.classList.remove("new-order");
  }
  document.getElementById(`status-${num}`).innerText = data.owner || "Unknown";
  document.getElementById(`price-${num}`).innerText = data.price
    ? "฿" + data.price
    : "";
  if (data.price)
    document.getElementById(`price-${num}`).style.color = "#ffd700";
  const lockIcon = el.querySelector(".lock-icon");
  const sourceIcon = el.querySelector(".source-icon");
  if (lockIcon) lockIcon.style.display = "none";
  if (sourceIcon) {
    sourceIcon.style.display = "block";
    sourceIcon.style.position = "absolute";
    sourceIcon.style.bottom = "5px";
    sourceIcon.style.left = "5px";
    sourceIcon.style.top = "auto";
    sourceIcon.style.right = "auto";
    sourceIcon.style.fontSize = "14px";
    if (data.source === "ai") {
      sourceIcon.innerHTML = '<i class="fa-solid fa-robot"></i>';
      sourceIcon.style.color = "var(--ai-active)";
    } else if (data.source === "regex") {
      sourceIcon.innerHTML = '<i class="fa-solid fa-bolt"></i>';
      sourceIcon.style.color = "var(--pattern-tag)";
    } else if (data.source === "manual") {
      sourceIcon.innerHTML = '<i class="fa-solid fa-hand-pointer"></i>';
      sourceIcon.style.color = "#fff";
    } else {
      sourceIcon.innerHTML = '<i class="fa-solid fa-lock"></i>';
      sourceIcon.style.color = "var(--primary)";
    }
  }
  const qBadge = document.getElementById(`qbadge-${num}`);
  if (data.queue && data.queue.length > 0) {
    qBadge.style.display = "block";
    qBadge.innerText = "+" + data.queue.length;
  } else qBadge.style.display = "none";
}

function renderGrid() {
  const panel = document.getElementById("stockPanel");
  const previousScrollTop = panel ? panel.scrollTop : 0;
  const size = parseInt(document.getElementById("stockSize").value) || 70;
  const grid = document.getElementById("stockGrid");
  if (grid.children.length !== size) {
    grid.innerHTML = "";
    for (let i = 1; i <= size; i++) {
      const div = document.createElement("div");
      div.className = "stock-item";
      div.id = "stock-" + i;
      div.onclick = () => window.handleStockClick(i);
      div.innerHTML = `<span class="stock-num">${i}</span><span class="lock-icon">🔒</span><div class="queue-badge" id="qbadge-${i}" style="display:none"></div><span class="stock-status" id="status-${i}">ว่าง</span><span class="stock-price" id="price-${i}"></span><span class="source-icon"></span>`;
      grid.appendChild(div);
    }
  }
  Object.keys(stockData).forEach((key) => {
    const item = stockData[key];
    renderSlot(key, item);
  });
  for (let i = 1; i <= size; i++) {
    if (!stockData[i]) {
      const el = document.getElementById("stock-" + i);
      if (el) {
        el.className = "stock-item";
        el.classList.remove("new-order", "blinking-border");
        document.getElementById(`status-${i}`).innerText = "ว่าง";
        document.getElementById(`price-${i}`).innerText = "";
        document.getElementById(`qbadge-${i}`).style.display = "none";
        el.querySelector(".lock-icon").style.display = "none";
        el.querySelector(".source-icon").style.display = "none";
      }
    }
  }
  if (panel)
    requestAnimationFrame(() => {
      panel.scrollTop = previousScrollTop;
    });
}

function connectToStock(vid) {
  if (unsubscribeStock) unsubscribeStock();
  currentVideoId = vid;
  lastScrollTimestamp = Date.now();
  let isFirstLoad = true;
  unsubscribeStock = onValue(ref(db, `stock/${vid}`), (snap) => {
    const val = snap.val() || {};
    if (!isFirstLoad) {
      const keys = Object.keys({ ...val, ...stockData });
      for (const key of keys) {
        const newItem = val[key];
        const oldItem = stockData[key];
        if (newItem?.owner && (!oldItem || !oldItem.owner)) {
          playDing();
          setTimeout(() => {
            const el = document.getElementById("stock-" + key);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              el.classList.add("highlight");
            }
          }, 50);
        }
        if ((!newItem || !newItem.owner) && oldItem?.owner) {
          playCancel();
        }
      }
    }
    stockData = val;
    renderGrid();
    updateStats();
    window.updateShippingButton();
    if (document.getElementById("dashboard").style.display === "flex")
      window.renderDashboardTable();
    isFirstLoad = false;
  });
}

function renderChat(
  name,
  msg,
  type,
  uid,
  img,
  realName,
  detectionMethod = null
) {
  const div = document.createElement("div");
  div.className = `chat-row ${type} new-msg`;
  let tagHtml = "";
  if (detectionMethod === "regex")
    tagHtml =
      '<button class="tag-source regex" title="ตรวจจับด้วย Pattern"><i class="fa-solid fa-bolt"></i></button>';
  else if (detectionMethod === "ai")
    tagHtml =
      '<button class="tag-source ai" title="ตรวจจับด้วย AI"><i class="fa-solid fa-robot"></i></button>';

  const imgSrc =
    img ||
    "https://www.gstatic.com/youtube/img/creator/avatars/sample_avatar.png";

  div.innerHTML = `<img src="${imgSrc}" class="avatar"><div class="chat-content"><div class="chat-header" data-uid="${uid}" data-realname="${escapeHtml(
    realName
  )}">${generateNameHtml(
    uid,
    realName
  )} ${tagHtml}</div><div class="chat-msg">${msg}</div></div>`;
  const list = document.getElementById("chat-list");
  list.appendChild(div);
  const vp = document.getElementById("chat-viewport");
  if (!isUserScrolledUp) {
    vp.scrollTop = vp.scrollHeight;
  } else {
    document.getElementById("btn-scroll-down").style.display = "block";
  }
}

async function analyzeChatWithAI(text) {
  if (!geminiApiKey || !isAiCommander) return null;
  const prompt = `
Role: You are an AI assistant for a Thai live commerce clothing shop (Manowzab). 
Your task is to extract the user's intent from their chat message.

Key Entities:
- **Product ID**: Usually a number (e.g., 1, 15, 99) or starts with F/CF (e.g., F1, CF10).
- **Price**: A number usually followed by "บาท" or appearing after the ID (e.g., 10=100).

Intents:
1. **buy**: User wants to purchase an item.
   - Pattern: "[ID]", "F[ID]", "CF[ID]", "รับ [ID]", "[ID] [Name]", "[ID]=[Price]".
   - Examples: "10", "F10", "10 ครับ", "10 น้องบี", "10 100", "เอา 10".
   - CRITICAL EXCEPTION: If the message contains specific question words (เท่าไหร่, ไหม, หรอ, หรือ, ไง) OR specific attribute words (อก, เอว, ยาว, สี, ผ้า, ตำหนิ) appearing alongside a number, it is ALWAYS a "question", NOT a "buy".
     - "50 สีอะไร" -> question
     - "10 อกเท่าไหร่" -> question
     - "50 มีตำหนิไหม" -> question
     - "ผ้าอะไร 10" -> question

2. **cancel**: User wants to cancel an order.
   - Pattern: "CC", "cancel", "ยกเลิก", "ไม่เอา".
   - Examples: "CC 10", "ยกเลิก 10", "ไม่เอา 10 แล้ว".

3. **question**: User is asking about product details.
   - Keywords: อก, เอว, ยาว, ผ้า, ราคา, สี, ว่างไหม, ทันไหม, เท่าไหร่, กี่บาท, แบบไหน, ดู, ตำหนิ.
   - Examples: "10 ว่างไหม", "อก 50 ไหม", "ขอดู 10", "50 สีอะไร".

4. **shipping**: User wants to ship items.
   - Keywords: "พร้อมส่ง", "สรุปยอด", "ส่งของ", "คิดเงิน".

5. **spam**: Greetings, chit-chat.

Response Format (JSON only):
{"intent": "buy"|"cancel"|"question"|"shipping"|"spam", "id": number|null, "price": number|null}

Input Message: "${text}"
`;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const result = await response.json();
    const match =
      result.candidates?.[0]?.content?.parts?.[0]?.text?.match(/\{.*?\}/s);
    return match ? JSON.parse(match[0]) : null;
  } catch (e) {
    return null;
  }
}

// [ปรับปรุง] เพิ่มฟังก์ชันช่วยจัดการสถานะส่งของ (แยกออกมาเพื่อให้เรียกใช้ได้ทั้ง AI และ Regex)
function markAsReadyToShip(uid, nick) {
  const shipPath = `shipping/${currentVideoId}/${uid}`;
  // อัปเดตสถานะเป็น ready: true
  update(ref(db, shipPath), { ready: true, timestamp: Date.now() }).then(() => {
    // แจ้งเตือนเสียง
    queueSpeech(nick + " แจ้งส่งของค่ะ");
    // [Optional] อาจจะเพิ่มการตอบกลับในแชทหรือ Toast เตือนที่หน้าจอแอดมินด้วยก็ได้
    Toast.fire({ icon: "success", title: `${nick} แจ้งส่งของ` });
  });
}

// ============================================================
// MODIFIED PROCESS MESSAGE FUNCTION
// ============================================================
async function processMessage(item) {
  if (!item.snippet || !item.authorDetails) return;
  if (seenMessageIds[item.id]) return;
  seenMessageIds[item.id] = true;

  // --- Log Chat Data (เหมือนเดิม) ---
  try {
    const msgDate = new Date(item.snippet.publishedAt);
    const msgTimeStr = msgDate.toLocaleString("en-US");
    let videoTimeStr = "0:00";
    if (streamStartTime) {
      const diffMs = msgDate.getTime() - streamStartTime;
      if (diffMs > 0) {
        const totalSeconds = Math.floor(diffMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const secStr = seconds.toString().padStart(2, "0");
        videoTimeStr =
          hours > 0
            ? `${hours}:${minutes.toString().padStart(2, "0")}:${secStr}`
            : `${minutes}:${secStr}`;
      }
    }
    fullChatLog.push({
      id: item.id,
      author: item.authorDetails.displayName,
      comment: item.snippet.displayMessage,
      videoTime: videoTimeStr,
      messageTime: `"${msgTimeStr}"`,
    });
  } catch (err) {
    console.error("Error logging chat:", err);
  }
  // ---------------------------

  const msg = item.snippet.displayMessage || "";
  if (!msg) return;
  const uid = item.authorDetails.channelId;
  const realName = item.authorDetails.displayName;
  let nick = realName;
  if (savedNames[uid])
    nick =
      typeof savedNames[uid] === "object"
        ? savedNames[uid].nick
        : savedNames[uid];
  const isAdmin = /admin|แอดมิน/i.test(nick);
  let stockSize = parseInt(document.getElementById("stockSize").value) || 70;

  let intent = null,
    targetId = null,
    targetPrice = null,
    method = null;

  // 1. AI Logic (คงเดิมแต่เรียกใช้ helper function)
  if (isAiCommander) {
    const aiResult = await analyzeChatWithAI(msg);
    if (aiResult) {
      if (aiResult.intent === "buy" && aiResult.id) {
        intent = "buy";
        targetId = aiResult.id;
        targetPrice = aiResult.price;
        method = "ai";
      } else if (aiResult.intent === "cancel" && aiResult.id) {
        intent = "cancel";
        targetId = aiResult.id;
        method = "ai";
      } else if (aiResult.intent === "shipping") {
        markAsReadyToShip(uid, nick); // เรียกใช้ Helper
        method = "ai";
      } else if (aiResult.intent === "question") {
        method = "ai-skip";
      }
    }
  }

  // 2. Regex Logic (ปรับปรุงใหม่)
  if (!method) {
    // [IMPROVED REGEX]
    // รองรับ Space หรือ Non-Word Characters (สัญลักษณ์, Emoji) เป็นตัวคั่นหน้าตัวเลข
    // ตัวอย่างที่รองรับ: "F10", "10", "กุ้ง-20", "😱26", "10=100"
    const buyRegex =
      /(?:^|[\s\p{P}\p{S}])(?:F|f|cf|CF|รับ|เอา)?\s*(\d+)(?:[\s=\/]+(\d+))?(?:$|[\s\p{P}\p{S}])/u;

    // Regex สำหรับยกเลิก
    const cancelRegex =
      /(?:^|[\s\p{P}\p{S}])(?:cc|CC|cancel|ยกเลิก|ไม่เอา|ปล่อย|หลุด)\s*(\d+)(?:$|[\s\p{P}\p{S}])/iu;

    // Regex สำหรับคำถาม (เพิ่มคำว่า "อะไร", "ป่าว", "มั้ย", "ขอดู")
    const isQuestion =
      /อก|เอว|ยาว|ราคา|เท่าไหร่|ทไหร|กี่บาท|แบบไหน|ผ้า|สี|ตำหนิ|ไหม|มั้ย|มั๊ย|อะไร|ป่าว|ขอดู|จริงดิ/i.test(
        msg
      );

    // [NEW] Regex สำหรับแจ้งส่งของ
    const isShipping =
      /(?:^|[\s])(?:ส่งเลย|พร้อมส่ง|สรุปยอด|เก็บเงิน|เช็คยอด|ปิดยอด)(?:$|[\s])/i.test(
        msg
      );

    const cMatch = msg.match(cancelRegex);
    const bMatch = msg.match(buyRegex);

    if (isShipping) {
      // เพิ่ม Logic แจ้งส่งของแบบไม่ต้องพึ่ง AI
      markAsReadyToShip(uid, nick);
      method = "regex-shipping";
    } else if (cMatch) {
      intent = "cancel";
      targetId = parseInt(cMatch[1]);
      method = "regex";
    } else if (bMatch && !isQuestion) {
      intent = "buy";
      targetId = parseInt(bMatch[1]);
      targetPrice = bMatch[2] ? parseInt(bMatch[2]) : null;
      method = "regex";
    }
  }

  // --- Rendering ---
  renderChat(
    nick,
    msg,
    isAdmin ? "admin" : "normal",
    uid,
    item.authorDetails.profileImageUrl,
    realName,
    method
  );

  // --- Speech Processing ---
  let speakMsg = msg.replace(
    /(?:[\u2700-\u27BF]|[\uE000-\uF8FF]|[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2011-\u26FF])+/g,
    " ส่งอีโมจิ "
  );
  speakMsg = speakMsg.replace(
    /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
    ""
  );

  if (speakMsg.trim().length > 0 && speakMsg.length < 100)
    queueSpeech(nick + " ... " + speakMsg);

  if (method === "ai-skip" || method === "regex-shipping") return; // ถ้าเป็นแค่ส่งของ หรือ AI บอกข้าม ไม่ต้องไปทำ processOrder

  // --- Order Processing ---
  if (targetId && targetId > 0) {
    if (targetId > stockSize) {
      stockSize = targetId;
      window.saveStockSize(stockSize);
    }
    if (intent === "buy") {
      let ownerName = nick,
        ownerUid = uid;
      if (isAdmin) {
        // Logic สำหรับแอดมินคีย์แทนลูกค้า
        let cleanName = msg;
        cleanName = cleanName
          .replace(targetId.toString(), "")
          .replace(/f|cf|รับ|เอา|=/gi, "");
        if (targetPrice)
          cleanName = cleanName.replace(targetPrice.toString(), "");
        cleanName = cleanName.replace(/^[:=\-\s]+|[:=\-\s]+$/g, "").trim();
        if (cleanName.length > 0) {
          ownerName = cleanName;
          ownerUid = "admin-proxy-" + Date.now();
        } else {
          ownerName = "ลูกค้า (Admin)";
          ownerUid = "admin-proxy-" + Date.now();
        }
      }
      await processOrder(
        targetId,
        ownerName,
        ownerUid,
        "chat",
        targetPrice,
        method
      );
    } else if (intent === "cancel") {
      if (isAdmin || (stockData[targetId] && stockData[targetId].uid === uid)) {
        const cancelMsg = `${nick} ยกเลิกรายการที่ ${targetId} ค่ะ`;
        processCancel(targetId, cancelMsg);
        broadcastMessage(cancelMsg);
      }
    }
  }
}

async function processOrder(num, owner, uid, src, price, method = "manual") {
  const itemRef = ref(db, `stock/${currentVideoId}/${num}`);
  try {
    await runTransaction(itemRef, (currentData) => {
      if (currentData === null) {
        return {
          owner,
          uid,
          time: Date.now(),
          queue: [],
          source: method,
          price: price || null,
        };
      } else if (!currentData.owner) {
        currentData.owner = owner;
        currentData.uid = uid;
        currentData.time = Date.now();
        currentData.source = method;
        if (price) currentData.price = price;
        if (!currentData.queue) currentData.queue = [];
        return currentData;
      } else {
        if (currentData.owner === owner) return;
        const queue = currentData.queue || [];
        if (queue.find((q) => q.owner === owner)) return;
        queue.push({ owner, uid, time: Date.now() });
        currentData.queue = queue;
        return currentData;
      }
    });
    const current = stockData[num];
    if (current && current.owner === owner) playDing();
  } catch (e) {
    console.error("Transaction failed: ", e);
  }
}

function processCancel(num, reason) {
  if (!stockData[num]) return;
  const current = stockData[num];
  if (
    current.queue &&
    Array.isArray(current.queue) &&
    current.queue.length > 0
  ) {
    const next = current.queue[0];
    const nextQ = current.queue.slice(1);
    const newData = {
      owner: next.owner,
      uid: next.uid,
      time: Date.now(),
      queue: nextQ,
      source: "queue",
    };
    if (current.price) newData.price = current.price;
    set(ref(db, `stock/${currentVideoId}/${num}`), newData).then(() => {
      setTimeout(
        () => broadcastMessage(`คุณ ${next.owner} ได้สิทธิ์ต่อค่ะ`),
        2500
      );
    });
  } else {
    remove(ref(db, `stock/${currentVideoId}/${num}`));
  }
}

async function smartFetch(url) {
  try {
    updateStatusIcon("stat-api", "ok");
    let res = await fetch(url + "&key=" + API_KEYS[currentKeyIdx]);
    let data = await res.json();
    if (data.error) {
      if (currentKeyIdx < API_KEYS.length - 1) {
        currentKeyIdx++;
        updateKeyDisplay();
        return smartFetch(url);
      } else {
        Swal.fire("API Key Error", "โควต้าเต็มทุกคีย์แล้ว", "error");
        throw new Error(data.error.message);
      }
    }
    return data;
  } catch (e) {
    updateStatusIcon("stat-api", "err");
    throw e;
  }
}

async function loadChat() {
  if (!isConnected || !activeChatId) return;

  // [NEW] Safety Check: ถ้าไม่ใช่ Commander และเชื่อมต่อแล้ว ให้หยุดยิง API (เผื่อ logic หลุด)
  if (!isAiCommander && isConnected) {
    console.warn("Viewer accidentally in loadChat loop. Stopping.");
    return;
  }

  if (isSimulating) return;

  const url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${activeChatId}&part=snippet,authorDetails${
    chatToken ? "&pageToken=" + chatToken : ""
  }`;

  try {
    const data = await smartFetch(url);
    if (data.items) {
      updateStatusIcon("stat-chat", "ok");
      for (const item of data.items) {
        try {
          // 1. Process Locally
          await processMessage(item);
          // [NEW] 2. Relay to Firebase for Viewers
          set(ref(db, `system/chatStream/${activeChatId}/${item.id}`), item);
        } catch (err) {
          console.error("Msg Error:", err, item);
        }
      }
    }
    if (data.nextPageToken) chatToken = data.nextPageToken;
    const delay = data.pollingIntervalMillis || 5000;
    chatTimeoutId = setTimeout(loadChat, Math.max(delay, 3000));
  } catch (e) {
    console.error("Load Chat Error:", e);
    updateStatusIcon("stat-chat", "err");
    chatTimeoutId = setTimeout(loadChat, 10000);
  }
}

// [NEW] ฟังก์ชันสำหรับ Viewer ฟังแชทจาก Firebase แทน YouTube API
function subscribeToChatStream(chatId) {
  if (unsubscribeChatStream) unsubscribeChatStream();

  // ฟังแชทใหม่ๆ เท่านั้น (limitToLast เพื่อไม่ให้โหลดประวัติเก่าเกินไปจนเครื่องค้าง)
  const chatRef = query(
    ref(db, `system/chatStream/${chatId}`),
    limitToLast(50)
  );

  unsubscribeChatStream = onChildAdded(chatRef, (snapshot) => {
    const item = snapshot.val();
    // เรียก processMessage เพื่อ render และทำงาน (แต่ถ้าเป็น Viewer มันจะไม่รัน AI ซ้ำตาม Logic ใน processMessage)
    processMessage(item);
    // อัปเดตไอคอนเพื่อให้รู้ว่าระบบทำงาน (ใช้สีเขียวแบบประหยัดพลังงาน)
    const statChat = document.getElementById("stat-chat");
    if (statChat) {
      statChat.classList.add("ok");
      statChat.style.color = "#00e676"; // Green
    }
  });

  // Handle errors / disconnects visually
  isUsingRelay = true;
  const statApi = document.getElementById("stat-api");
  if (statApi) {
    statApi.innerHTML = '<i class="fa-solid fa-satellite-dish"></i>'; // เปลี่ยนไอคอนเป็นจานดาวเทียมรับสัญญาณ
    statApi.title = "รับสัญญาณจากเครื่องแม่ (ประหยัด API)";
    statApi.style.color = "#29b6f6"; // Light Blue
  }
}

async function updateViewerCount(vid) {
  try {
    const d = await smartFetch(
      `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${vid}`
    );
    if (
      d.items?.[0]?.liveStreamingDetails?.actualEndTime &&
      !autoDisconnectTimer
    ) {
      queueSpeech("ไลฟ์จบแล้ว");
      autoDisconnectTimer = setTimeout(() => window.toggleConnection(), 180000);
    }
    if (d.items?.[0])
      document.getElementById("view-counter").innerText =
        "👁️ " +
        Number(
          d.items[0].liveStreamingDetails.concurrentViewers || 0
        ).toLocaleString();
  } catch (e) {
    console.error("Viewer Count Error:", e);
  }
}

async function connectYoutube(vid) {
  try {
    // ใช้ API เรียกแค่ครั้งเดียวเพื่อเอา ID และ Info (ไม่เปลือง Quota)
    const d = await smartFetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${vid}`
    );
    if (!d.items || d.items.length === 0) throw new Error("ID ไม่ถูกต้อง");
    const item = d.items[0];
    document.getElementById("live-title").innerText = item.snippet.title;
    saveHistory(vid, item.snippet.title);

    if (
      item.liveStreamingDetails &&
      item.liveStreamingDetails.actualStartTime
    ) {
      streamStartTime = new Date(
        item.liveStreamingDetails.actualStartTime
      ).getTime();
    } else {
      streamStartTime = Date.now();
    }
    fullChatLog = [];

    queueSpeech("เชื่อมต่อสำเร็จ กำลังอ่านคอมเมนต์จาก " + item.snippet.title);
    isConnected = true;
    setLoading(false);
    isConnecting = false;
    document.getElementById("btnConnect").innerText = "DISCONNECT";
    document.getElementById("btnConnect").className = "btn btn-dark";
    updateStatusIcon("stat-api", "ok");

    if (item.liveStreamingDetails?.activeLiveChatId) {
      activeChatId = item.liveStreamingDetails.activeLiveChatId;
      chatToken = "";

      // [NEW] Decision Logic: Commander ยิง API / Viewer รับ Relay
      if (isAiCommander) {
        console.log("Mode: Commander (Fetcher)");
        loadChat(); // Start Polling YouTube
        isUsingRelay = false;
      } else {
        console.log("Mode: Viewer (Listener)");
        subscribeToChatStream(activeChatId); // Start Listening Firebase
        isUsingRelay = true;
        // เปลี่ยนไอคอน API เป็นสีฟ้าแสดงสถานะ Relay
        document.getElementById("stat-api").innerHTML =
          '<i class="fa-solid fa-satellite-dish"></i>';
        document.getElementById("stat-api").style.color = "#29b6f6";
      }

      updateViewerCount(vid);
      viewerIntervalId = setInterval(() => updateViewerCount(vid), 15000);
    } else {
      activeChatId = null;
      throw new Error("No Live Chat");
    }
  } catch (e) {
    console.error(e);
    isConnected = true;
    setLoading(false);
    isConnecting = false;
    document.getElementById("btnConnect").innerText = "DISCONNECT";
    document.getElementById("btnConnect").className = "btn btn-dark";
    updateStatusIcon("stat-api", "err");
  }
}

// ============================================================
// 3. WINDOW EXPORTS
// ============================================================

// [NEW] Toggle AI Commander (This was missing!)
window.toggleAICommander = async () => {
  try {
    const snap = await get(ref(db, "system/aiCommander"));
    const current = snap.val();

    if (current === myDeviceId) {
      // If I am commander, resign.
      await set(ref(db, "system/aiCommander"), null);
    } else {
      // Take command
      await set(ref(db, "system/aiCommander"), myDeviceId);
    }
  } catch (e) {
    console.error("Error toggling AI Commander:", e);
    Swal.fire("Error", "ไม่สามารถเปลี่ยนสถานะได้: " + e.message, "error");
  }
};

window.scrollToBottom = () => {
  const vp = document.getElementById("chat-viewport");
  if (vp) vp.scrollTop = vp.scrollHeight;
  document.getElementById("btn-scroll-down").style.display = "none";
  isUserScrolledUp = false;
};

window.forceUpdate = () => {
  if (confirm("ยืนยันการโหลดโปรแกรมใหม่?")) {
    localStorage.removeItem("app_version");
    window.location.reload(true);
  }
};
window.toggleSound = () => {
  isSoundOn = !isSoundOn;
  const btn = document.getElementById("btnSound");
  if (isSoundOn) {
    btn.className = "btn btn-mute active";
    btn.innerText = "🔊 เสียง: เปิด";
    unlockAudio();
    queueSpeech("เปิดเสียงค่ะ");
  } else {
    btn.className = "btn btn-mute";
    btn.innerText = "🔇 เสียง: ปิด";
    window.resetVoice();
  }
};
window.resetVoice = () => {
  synth.cancel();
  speechQueue = [];
  isSpeaking = false;
  if (isSoundOn) queueSpeech("รีเซ็ตเสียงแล้ว");
};
window.testVoice = () => {
  queueSpeech("ทดสอบเสียง หนึ่ง สอง สาม สี่ ห้า");
};
window.askName = (uid, old) => {
  Swal.fire({ title: "ตั้งชื่อเล่น", input: "text", inputValue: old }).then(
    (r) => {
      if (r.value) update(ref(db, `nicknames/${uid}`), { nick: r.value });
    }
  );
};
window.updateAllChatNames = () => {
  document.querySelectorAll(".chat-header").forEach(function (el) {
    const uid = el.getAttribute("data-uid");
    const realName = el.getAttribute("data-realname");
    if (uid && realName) el.innerHTML = generateNameHtml(uid, realName);
  });
};
window.updateShippingButton = () => {
  let count = 0;
  const activeBuyerUids = new Set();
  Object.keys(stockData).forEach((key) => {
    if (stockData[key].uid) activeBuyerUids.add(stockData[key].uid);
  });
  if (shippingData && shippingData[currentVideoId]) {
    const videoShipping = shippingData[currentVideoId];
    count = Object.keys(videoShipping).filter(
      (uid) => videoShipping[uid].ready && activeBuyerUids.has(uid)
    ).length;
  }
  const btn = document.getElementById("btn-shipping");
  if (btn) {
    btn.innerText = "🚚 (" + count + ")";
    btn.className = count > 0 ? "btn btn-shipping" : "btn btn-shipping empty";
  }
};
window.manualAddShipping = () => {
  const uid = document.getElementById("manualShipSelect").value;
  if (uid) {
    update(ref(db, `shipping/${currentVideoId}/${uid}`), {
      ready: true,
      timestamp: Date.now(),
    }).then(() => {
      Toast.fire({ icon: "success", title: "เพิ่มลงรายการส่งของแล้ว" });
    });
  }
};
window.saveStockSize = (val) => {
  set(ref(db, "system/stockSize"), parseInt(val));
  document.getElementById("total-count").innerText = val;
};
window.updateNickSilent = (uid, val) => {
  if (!val) return;
  update(ref(db, `nicknames/${uid}`), { nick: val });
};
window.printLabel = (uid) => {
  let total = 0,
    items = [];
  Object.keys(stockData).forEach((n) => {
    if (stockData[n].uid === uid) {
      items.push(`#${n} ${stockData[n].price ? stockData[n].price : ""}`);
      total += parseInt(stockData[n].price || 0);
    }
  });
  let address = "";
  if (shippingData[currentVideoId] && shippingData[currentVideoId][uid]) {
    address = shippingData[currentVideoId][uid].address || "";
  } else if (savedNames[uid]) {
    address = savedNames[uid].address || "";
  }
  document.getElementById(
    "print-area"
  ).innerHTML = `<div class="print-label"><div class="print-header">ผู้รับ: ${
    savedNames[uid]?.nick || "ลูกค้า"
  }</div><div class="print-address">${address}</div><div class="print-items">${items.join(
    ", "
  )}<br>รวม: ${total} บาท</div></div>`;
  window.print();
};
window.toggleFullScreen = () => {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    } else if (document.documentElement.webkitRequestFullscreen) {
      document.documentElement.webkitRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
};
window.toggleDropdown = (event) => {
  if (event) event.stopPropagation();
  document.getElementById("toolsDropdown").classList.toggle("show");
};
window.addEventListener("click", (e) => {
  if (!e.target.closest(".btn-sim")) {
    const dropdowns = document.getElementsByClassName("dropdown-content");
    for (let i = 0; i < dropdowns.length; i++) {
      if (dropdowns[i].classList.contains("show"))
        dropdowns[i].classList.remove("show");
    }
  }
});
window.askAiKey = () => {
  Swal.fire({
    title: "ตั้งค่า Gemini API Key",
    html: '<a href="https://aistudio.google.com/" target="_blank" style="color:#29b6f6">กดขอ Key ฟรีที่นี่</a>',
    input: "text",
    inputValue: geminiApiKey,
    footer: geminiApiKey
      ? '<span style="color:lime">✅ มี Key อยู่ในเครื่องแล้ว</span>'
      : "",
  }).then((res) => {
    if (res.value) {
      geminiApiKey = res.value.trim();
      localStorage.setItem("geminiApiKey", geminiApiKey);
      Swal.fire("บันทึกแล้ว", "", "success");
    }
  });
};
window.adjustZoom = (n) => {
  currentFontSize += n;
  document.documentElement.style.setProperty(
    "--chat-size",
    currentFontSize + "px"
  );
};
window.adjustGridZoom = (n) => {
  currentGridSize += n;
  document.documentElement.style.setProperty(
    "--grid-size",
    currentGridSize + "em"
  );
};
window.filterHistory = () => {
  historyCurrentPage = 1;
  window.renderHistoryPage();
};
window.deleteHistory = (vid) => {
  Swal.fire({ title: "ลบประวัติ?", showCancelButton: true }).then((r) => {
    if (r.isConfirmed)
      remove(ref(db, "history/" + vid)).then(() => window.loadHistoryList());
  });
};
window.toggleShowAll = () => {
  window.renderDashboardTable();
};
window.toggleAwayMode = async () => {
  try {
    unlockAudio();
    const snap = await get(ref(db, "system/awayMode"));
    const current = snap.val() || {};
    if (current.isAway) {
      await update(ref(db, "system/awayMode"), { isAway: false });
    } else {
      await update(ref(db, "system/awayMode"), {
        isAway: true,
        startTime: Date.now(),
      });
      await set(ref(db, "system/aiCommander"), myDeviceId);
    }
  } catch (e) {
    console.error("Away Mode Error", e);
  }
};
window.toggleConnection = () => {
  if (isConnected) {
    clearInterval(intervalId);
    clearInterval(viewerIntervalId);
    if (chatTimeoutId) clearTimeout(chatTimeoutId);
    if (unsubscribeChatStream) {
      unsubscribeChatStream();
      unsubscribeChatStream = null;
    }
    isConnected = false;
    document.getElementById("btnConnect").innerText = "CONNECT";
    document.getElementById("btnConnect").className = "btn btn-primary";
    document.getElementById("status-dot").className = "status-dot";

    // Reset Icons
    document.getElementById("stat-api").innerHTML =
      '<i class="fa-brands fa-youtube"></i>';
    document.getElementById("stat-api").style.color = "";
    document.getElementById("stat-api").classList.remove("ok", "err");

    queueSpeech("หยุดการเชื่อมต่อ");
    chatToken = "";
    return;
  }
  const vid = document.getElementById("vidInput").value.trim();
  if (!vid) return Swal.fire("Error", "ใส่ Video ID ก่อน", "error");
  isConnecting = true;
  setLoading(true);
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  currentVideoId = vid;
  connectToStock(vid);
  set(ref(db, "system/activeVideo"), vid);
  chatToken = "";
  connectYoutube(vid).catch((e) => {
    Swal.fire({
      icon: "info",
      title: "เชื่อมต่อวิดีโอแล้ว",
      text: "ไม่พบห้องแชทสด (อาจเป็นคลิปย้อนหลัง) ระบบจะทำงานในโหมดรับคำสั่งเสียง/กดเองเท่านั้น",
      timer: 3000,
    });
    isConnected = true;
    setLoading(false);
    isConnecting = false;
    document.getElementById("btnConnect").innerText = "DISCONNECT";
    document.getElementById("btnConnect").className = "btn btn-dark";
    document.getElementById("status-dot").className = "status-dot online";
  });
};
window.renderDashboardTable = () => {
  const dashboard = document.querySelector(".dashboard-overlay");
  const scrollY = dashboard ? dashboard.scrollTop : 0;
  const tbody = document.getElementById("shipping-body");
  if (tbody) {
    tbody.innerHTML = "";
    const userOrders = {};
    const allBuyerUids = new Set();
    Object.keys(stockData).forEach((num) => {
      const item = stockData[num];
      if (item.uid) {
        allBuyerUids.add(item.uid);
        if (!userOrders[item.uid])
          userOrders[item.uid] = {
            name: item.owner,
            items: [],
            totalPrice: 0,
            uid: item.uid,
          };
        const price = item.price ? parseInt(item.price) : 0;
        userOrders[item.uid].items.push({ num: num, price: price });
        userOrders[item.uid].totalPrice += price;
      }
    });
    const currentShipping = shippingData[currentVideoId] || {};
    const readyUids = [...allBuyerUids].filter(
      (uid) => currentShipping[uid] && currentShipping[uid].ready
    );
    const notReadyUids = [...allBuyerUids].filter(
      (uid) => !(currentShipping[uid] && currentShipping[uid].ready)
    );
    if (notReadyUids.length > 0) {
      const addRow = document.createElement("tr");
      addRow.innerHTML = `<td colspan="4" style="text-align:center; padding:10px; background:#2a2a2a;"><div style="display:flex; gap:10px; justify-content:center; align-items:center;"><i class="fa-solid fa-user-plus"></i><select id="manualShipSelect" style="padding:5px; border-radius:4px; background:#444; color:#fff; border:1px solid #555; max-width:200px;"><option value="">-- เลือกลูกค้าเพื่อส่งของ --</option>${notReadyUids
        .map(
          (uid) =>
            `<option value="${uid}">${
              savedNames[uid]?.nick || userOrders[uid].name
            }</option>`
        )
        .join(
          ""
        )}</select><button class="btn btn-success" onclick="window.manualAddShipping()" style="padding:4px 10px; font-size:0.9em;">เพิ่ม</button></div></td>`;
      tbody.appendChild(addRow);
    } else if (
      allBuyerUids.size > 0 &&
      readyUids.length === allBuyerUids.size
    ) {
      const infoRow = document.createElement("tr");
      infoRow.innerHTML = `<td colspan="4" style="text-align:center; color:#00e676; padding:10px;">✅ ลูกค้าทุกคนอยู่ในรายการส่งของแล้ว</td>`;
      tbody.appendChild(infoRow);
    }
    if (readyUids.length === 0) {
      const emptyRow = document.createElement("tr");
      emptyRow.innerHTML = `<td colspan="4" style="text-align:center; color:#888; padding:20px;">ยังไม่มีรายการที่แจ้งพร้อมส่ง</td>`;
      tbody.appendChild(emptyRow);
    } else {
      let index = 1;
      readyUids.forEach((uid) => {
        const order = userOrders[uid];
        let custData = savedNames[uid] || { nick: order.name };
        const tr = document.createElement("tr");
        const itemStr = order.items
          .map((i) => "#" + i.num + (i.price > 0 ? "(" + i.price + ")" : ""))
          .join(", ");
        tr.innerHTML = `
                    <td>${index++}</td>
                    <td><input class="edit-input" value="${
                      custData.nick || order.name
                    }" onchange="window.updateNickSilent('${uid}', this.value)" placeholder="พิมพ์ชื่อแล้ว Enter"></td>
                    <td>${itemStr}</td>
                    <td style="text-align:center;"><button class="btn btn-dark" style="background:#d32f2f; color:white; padding:4px 8px; font-size:0.8em;" onclick="window.removeShipping('${uid}')"><i class="fa-solid fa-trash"></i></button></td>
                `;
        tbody.appendChild(tr);
      });
    }
    if (dashboard) dashboard.scrollTop = scrollY;
  }
};

window.removeShipping = (uid) => {
  if (confirm("ต้องการลบลูกค้าคนนี้ออกจากรายการส่งของหรือไม่?")) {
    update(ref(db, `shipping/${currentVideoId}/${uid}`), { ready: null }).then(
      () => {
        Toast.fire({ icon: "success", title: "ลบออกจากรายการแล้ว" });
      }
    );
  }
};

window.openDashboard = () => {
  document.getElementById("dashboard").style.display = "flex";
  window.renderDashboardTable();
};
window.closeDashboard = () => {
  document.getElementById("dashboard").style.display = "none";
};
window.loadHistoryList = async () => {
  const list = document.getElementById("history-list");
  list.innerHTML =
    '<li style="text-align:center; color:#888;">กำลังโหลดประวัติ...</li>';
  try {
    const snapshot = await get(ref(db, "history"));
    const items = [];
    snapshot.forEach((c) => items.push({ id: c.key, ...c.val() }));
    items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    allHistoryData = items;
    historyCurrentPage = 1;
    window.renderHistoryPage();
  } catch (e) {
    list.innerHTML = `<li style="color:red; text-align:center;">โหลดไม่สำเร็จ: ${e.message}</li>`;
  }
};

window.handleStockClick = (num) => {
  const current = stockData[num];
  if (!current || !current.owner) {
    const currentPrice = current && current.price ? current.price : "";
    Swal.fire({
      title: `เบอร์ ${num}`,
      text: "ใส่ชื่อเพื่อจอง หรือ ใส่ตัวเลขเพื่อตั้งราคา",
      input: "text",
      inputValue: currentPrice,
      showCancelButton: true,
      confirmButtonText: "บันทึก",
      cancelButtonText: "ยกเลิก",
    }).then((result) => {
      if (result.isConfirmed) {
        const val = result.value.trim();
        if (!val) return;
        if (/^\d+$/.test(val)) {
          const updates = {};
          if (!stockData[num]) {
            updates[`stock/${currentVideoId}/${num}`] = {
              price: val,
              source: "manual",
            };
          } else {
            updates[`stock/${currentVideoId}/${num}/price`] = val;
          }
          update(ref(db), updates);
        } else {
          processOrder(num, val, "manual-" + Date.now(), "manual");
          Toast.fire({
            icon: "success",
            title: `คุณ ${val} จองเบอร์ ${num} สำเร็จ`,
          });
        }
      }
    });
    return;
  }
  if (current) {
    let queueHtml = "";
    if (current.queue && current.queue.length > 0) {
      queueHtml =
        '<div style="margin-top:10px; text-align:left; background:#eee; color:#000; padding:10px; border-radius:6px; border:1px solid #ccc;"><strong>คิวต่อ:</strong><ul style="padding-left:0; margin:10px 0; list-style:none;">';
      current.queue.forEach((q, idx) => {
        queueHtml += `<li style="background:#fff; padding:8px; margin-bottom:4px; border-radius:4px; display:flex; justify-content:space-between; align-items:center; border:1px solid #ddd; font-size:0.95em;"><span><strong style="color:#d32f2f;">${
          idx + 1
        }.</strong> ${
          q.owner
        }</span><div><button onclick="window.moveQueueUp(${num}, ${idx})" style="background:#2196f3; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.8em; margin-right:5px;">▲</button><button onclick="window.editQueueName(${num}, ${idx})" style="background:#ff9800; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.8em; margin-right:5px;">✎</button><button onclick="window.removeQueue(${num}, ${idx})" style="background:#ff5252; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.8em;">ลบ</button></div></li>`;
      });
      queueHtml += "</ul></div>";
    }
    Swal.fire({
      title: `เบอร์ ${num}`,
      html: `<div style="font-size:1.2em; color:#00e676; margin-bottom:10px;">${current.owner}</div><div style="display:flex; gap:5px; justify-content:center; flex-wrap:wrap;"><button onclick="window.doAction(${num}, 'edit')" class="swal2-confirm swal2-styled" style="background:#1976d2; margin:0;">แก้ชื่อ</button> <button onclick="window.doAction(${num}, 'price')" class="swal2-confirm swal2-styled" style="background:#555; margin:0;">แก้ราคา</button> <button onclick="window.doAction(${num}, 'cancel')" class="swal2-confirm swal2-styled" style="background:#d32f2f; margin:0;">ยกเลิกจอง</button></div>${queueHtml}`,
      showConfirmButton: false,
    });
  }
};

window.doAction = (num, action) => {
  Swal.close();
  if (action === "edit") {
    Swal.fire({
      input: "text",
      inputValue: stockData[num].owner,
      title: "แก้ไขชื่อ (เฉพาะรายการนี้)",
    }).then((r) => {
      if (r.value) {
        update(ref(db, `stock/${currentVideoId}/${num}`), { owner: r.value });
      }
    });
  } else if (action === "price")
    Swal.fire({ input: "number" }).then((r) => {
      if (r.value)
        update(ref(db, `stock/${currentVideoId}/${num}`), { price: r.value });
    });
  else if (action === "cancel") {
    const nick = stockData[num].owner || "ลูกค้า";
    const msg = `${nick} ยกเลิกรายการที่ ${num} ค่ะ`;
    processCancel(num, msg);
    broadcastMessage(msg);
    Toast.fire({ icon: "success", title: "ยกเลิกรายการสำเร็จ" });
  }
};

window.removeQueue = (num, idx) => {
  const current = stockData[num];
  if (current && current.queue) {
    const newQ = [...current.queue];
    newQ.splice(idx, 1);
    set(ref(db, `stock/${currentVideoId}/${num}/queue`), newQ).then(() => {
      Swal.close();
      window.handleStockClick(num);
    });
  }
};

window.moveQueueUp = (num, idx) => {
  if (idx === 0) return;
  const current = stockData[num];
  if (current && current.queue) {
    const newQ = [...current.queue];
    const temp = newQ[idx];
    newQ[idx] = newQ[idx - 1];
    newQ[idx - 1] = temp;
    set(ref(db, `stock/${currentVideoId}/${num}/queue`), newQ).then(() => {
      Swal.close();
      window.handleStockClick(num);
    });
  }
};

window.editQueueName = (num, idx) => {
  const current = stockData[num];
  if (current && current.queue) {
    Swal.fire({
      title: "แก้ไขชื่อในคิว",
      input: "text",
      inputValue: current.queue[idx].owner,
      showCancelButton: true,
    }).then((result) => {
      if (result.value) {
        const updates = {};
        updates[`stock/${currentVideoId}/${num}/queue/${idx}/owner`] =
          result.value;
        update(ref(db), updates).then(() => {
          Swal.close();
          window.handleStockClick(num);
        });
      }
    });
  }
};

window.clearAllStock = () => {
  Swal.fire({ title: "ล้างทั้งหมด?", showCancelButton: true }).then((r) => {
    if (r.isConfirmed) remove(ref(db, `stock/${currentVideoId}`));
  });
};

window.openTestMenu = () => {
  Swal.fire({
    title: "เครื่องมือ",
    showDenyButton: true,
    confirmButtonText: isSimulating ? "🛑 หยุดจำลอง" : "⚡ จำลองแชท",
    denyButtonText: "🔑 ตั้งค่า API Key",
  }).then((r) => {
    if (r.isConfirmed) window.toggleSimulation();
    else if (r.isDenied) window.askAiKey();
  });
};

window.toggleSimulation = () => {
  isSimulating = !isSimulating;
  const menu = document.getElementById("menuSim");
  if (isSimulating) {
    menu.innerText = "🛑 หยุดจำลอง";
    const size = parseInt(document.getElementById("stockSize").value);
    simIntervalId = setInterval(() => {
      const rNum = Math.floor(Math.random() * size) + 1;
      processMessage({
        id: "sim-" + Date.now(),
        snippet: {
          displayMessage: `F${rNum}`,
          publishedAt: new Date().toISOString(),
        }, // Add Time
        authorDetails: {
          channelId: "sim",
          displayName: "SimUser",
          profileImageUrl: "",
        },
      });
    }, 1500);
  } else {
    menu.innerText = "⚡ เริ่มจำลองแชท";
    clearInterval(simIntervalId);
  }
};

// CSV Download
window.downloadChatCSV = () => {
  if (fullChatLog.length === 0) {
    Swal.fire("ไม่มีข้อมูล", "ยังไม่มีข้อความแชทเข้ามา", "warning");
    return;
  }

  let csvContent = "\uFEFFId,Author name,Comment,Video time,Message time\n";

  fullChatLog.forEach((row) => {
    const safeComment = row.comment ? row.comment.replace(/"/g, '""') : "";
    const safeAuthor = row.author ? row.author.replace(/"/g, '""') : "";
    csvContent += `${row.id},"${safeAuthor}","${safeComment}",${row.videoTime},${row.messageTime}\n`;
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `chat_log_${currentVideoId || "live"}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// ============================================================
// 5. EXECUTION START
// ============================================================
signInAnonymously(auth);
remove(ref(db, "stock/demo"));

onAuthStateChanged(auth, (user) => {
  if (user) {
    initTooltips();
    initStatusIcons();
    initVersionControl();
    syncAiCommanderStatus();
    updateStatusIcon("stat-db", "ok");

    onValue(ref(db, "system/stockSize"), (s) => {
      const val = s.val() || 70;
      document.getElementById("stockSize").value = val;
      renderGrid();
      updateStats();
    });

    if (unsubscribeSystem) unsubscribeSystem();
    unsubscribeSystem = onValue(ref(db, "system/activeVideo"), (snap) => {
      const vid = snap.val();
      if (vid && vid !== "demo") {
        document.getElementById("vidInput").value = vid;
        connectToStock(vid);
      } else connectToStock("demo");
    });

    onValue(ref(db, "nicknames"), (s) => {
      try {
        savedNames = s.val() || {};
        window.updateAllChatNames();
        if (document.getElementById("dashboard").style.display === "flex")
          window.renderDashboardTable();
      } catch (e) {}
    });

    onValue(ref(db, "shipping"), (s) => {
      try {
        shippingData = s.val() || {};
        window.updateShippingButton();
        if (document.getElementById("dashboard").style.display === "flex")
          window.renderDashboardTable();
      } catch (e) {}
    });

    onValue(ref(db, ".info/connected"), (s) =>
      updateStatusIcon("stat-db", s.val() ? "ok" : "err")
    );

    onValue(ref(db, "system/awayMode"), (snap) => {
      const val = snap.val();
      const banner = document.getElementById("awayBanner");
      const newState = val ? val.isAway : false;

      if (newState && !currentAwayState) {
        queueSpeech("แอดมินพาลูกเข้านอนแล้ว");
        Toast.fire({
          title: "🌙 โหมดพาลูกนอนทำงาน",
          text: "แอดมินไม่อยู่หน้าจอ ระบบจะสแตนบาย",
          icon: "info",
        });
      } else if (!newState && currentAwayState) {
        queueSpeech("ลูกหลับแล้ว แอดมินสแตนบาย");
      }
      currentAwayState = newState;
      if (currentAwayState) {
        if (banner) banner.style.display = "flex";
        awayStartTime = val?.startTime || Date.now();
        if (!awayInterval) {
          updateAwayTimer();
          awayInterval = setInterval(updateAwayTimer, 1000);
        }
      } else {
        if (banner) banner.style.display = "none";
        if (awayInterval) {
          clearInterval(awayInterval);
          awayInterval = null;
        }
      }
    });

    onValue(ref(db, "system/broadcast"), (snap) => {
      const val = snap.val();
      if (val && val.time > Date.now() - 10000 && val.text) {
        queueSpeech(val.text);
      }
    });
  }
});

const vp = document.getElementById("chat-viewport");
if (vp) {
  vp.addEventListener("scroll", function () {
    const isAtBottom = vp.scrollHeight - vp.scrollTop - vp.clientHeight < 100;
    isUserScrolledUp = !isAtBottom;
    if (isAtBottom)
      document.getElementById("btn-scroll-down").style.display = "none";
    else document.getElementById("btn-scroll-down").style.display = "block";
  });
}

// Add touch events for iPad audio
document.addEventListener("touchstart", unlockAudio, { once: false });
document.addEventListener("click", unlockAudio, { once: false });
