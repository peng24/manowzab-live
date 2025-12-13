import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getDatabase, ref, set, update, remove, onValue, get, serverTimestamp, query, orderByChild, runTransaction } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { AppInfo } from "./version.js";

// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyAVYqEmdw-AwS1tCElhSaXDLP1Aq35chp0",
    authDomain: "manowlive-chat.firebaseapp.com",
    databaseURL: "https://manowlive-chat-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "manowlive-chat"
};

const API_KEYS = ["AIzaSyAVzYQN51V-kITnyJWGy8IVSktitxrVD8g", "AIzaSyBlnw6tpETYu61XSNqd7zXt25Fv_vmbWJU", "AIzaSyAX3dwUqBFeCBjjZixVnlcBz56gAfNWzs0", "AIzaSyAxjRAs01mpt-NxQiR3yStr6Q-57EiQq64"];

// --- INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// --- SWAL CONFIG (FIXED) ---
// Base configuration to prevent scroll jumping
const ModalSwal = Swal.mixin({
    heightAuto: false,
    scrollbarPadding: false
});
// Global override
window.Swal = ModalSwal;

// Toast configuration (Explicitly enable heightAuto to fix warning)
const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    heightAuto: true, // Fixes incompatibility warning
    didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer)
        toast.addEventListener('mouseleave', Swal.resumeTimer)
    }
});

// --- GLOBAL STATE ---
let currentKeyIdx = 0;
let isConnected = false;
let isConnecting = false;
let isSimulating = false;
let myDeviceId = 'dev-' + Math.random().toString(36).substr(2, 9); 
let isAiCommander = false; 
let geminiApiKey = localStorage.getItem('geminiApiKey') || '';

let currentVideoId = 'demo';
let stockData = {};
let savedNames = {};
let shippingData = {};
let seenMessageIds = {};

let intervalId, viewerIntervalId, simIntervalId, autoDisconnectTimer, chatTimeoutId;
let activeChatId = '';
let chatToken = '';
let unsubscribeStock, unsubscribeSystem;

let currentFontSize = 16;
let currentGridSize = 1;
let isUserScrolledUp = false;

// Audio Context
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const synth = window.speechSynthesis;
let speechQueue = [];
let isSpeaking = false;
let isSoundOn = true;
let activeUtterance = null;

// Away Mode
let isAway = false;
let awayStartTime = 0;
let awayInterval = null;
let currentAwayState = false;

// History & Pagination
let allHistoryData = [];
let historyCurrentPage = 1;
const historyItemsPerPage = 10;

// --- UTILITIES ---
function stringToColor(str) { var hash = 0; for (var i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash); return 'hsl(' + (Math.abs(hash) % 360) + ', 85%, 75%)'; }
function escapeHtml(text) { if (!text) return ""; return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
function updateStatusIcon(id, status) { 
    const el = document.getElementById(id);
    if(el) el.className = 'status-item ' + status; 
}
function setLoading(s) { document.getElementById('btnConnect').disabled = s; }
function formatThaiDate(timestamp) { const date = new Date(timestamp); const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]; return date.getDate() + ' ' + months[date.getMonth()] + ' ' + (date.getFullYear() + 543) + ' (' + date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0') + ')'; }
function updateKeyDisplay() { document.getElementById('stat-key').innerText = "🔑 " + (currentKeyIdx + 1); }

function saveHistory(vid, title) { 
    if(vid && vid!=='demo') set(ref(db, 'history/'+vid), {title, timestamp: serverTimestamp()}); 
}

// --- CORE FUNCTIONS (Moved Up) ---
function initVersionControl() {
    const badge = document.querySelector('.version-badge');
    if (badge) {
        badge.innerText = `${AppInfo.version}`;
        const tooltipText = `เวอร์ชั่น: ${AppInfo.version} (${AppInfo.releaseDate})\n\nรายการแก้ไข:\n${AppInfo.changelog.join('\n')}`;
        badge.title = tooltipText;
        console.log(`%c Manowzab Command Center ${AppInfo.version} `, 'background: #222; color: #bada55; padding: 4px; border-radius: 4px;', AppInfo.changelog);
    }
}

function syncAiCommanderStatus() {
    onValue(ref(db, 'system/aiCommander'), (snap) => {
        const commanderId = snap.val();
        const btn = document.getElementById('btnAICommander');
        if (commanderId === myDeviceId) { isAiCommander = true; btn.innerHTML = '🤖 AI: เปิด (Commander)'; btn.className = 'btn btn-ai active'; } 
        else if (commanderId) { isAiCommander = false; btn.innerHTML = '🤖 AI: ปิด (เครื่องอื่นคุม)'; btn.className = 'btn btn-ai remote'; } 
        else { isAiCommander = false; btn.innerHTML = '🤖 AI: ปิด'; btn.className = 'btn btn-ai inactive'; }
    });
}

function initTooltips() {
    const tips = {
        'btnVoice': 'เปิด/ปิดการสั่งงานด้วยเสียง',
        'btnAICommander': 'เปิดระบบ AI ช่วยจับการจองอัตโนมัติ',
        'btn-shipping': 'ดูรายการที่ลูกค้าแจ้งพร้อมส่ง (รูปรถ)',
        'btnConnect': 'เชื่อมต่อ/ตัดการเชื่อมต่อกับ YouTube Live',
        'btnSound': 'เปิด/ปิดเสียงพูดและเอฟเฟกต์',
        'stockSize': 'จำนวนรายการสินค้าทั้งหมด',
        'vidInput': 'รหัส Video ID ของ YouTube'
    };
    for (const [id, text] of Object.entries(tips)) {
        const el = document.getElementById(id);
        if(el) el.title = text;
    }
    const histBtn = document.querySelector('button[onclick="window.openHistory()"]');
    if(histBtn) histBtn.title = "ดูประวัติการไลฟ์ย้อนหลัง";
}

// --- AUDIO FUNCTIONS ---
function unlockAudio() {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
            const u = new SpeechSynthesisUtterance(" ");
            synth.speak(u);
        });
    }
}
document.addEventListener('click', () => { unlockAudio(); }, { once: true });

function queueSpeech(txt) { if(!isSoundOn) return; speechQueue.push(txt); if (!isSpeaking) processQueue(); }

function processQueue() {
    if (speechQueue.length === 0) { isSpeaking = false; return; }
    if (synth.speaking && !isSpeaking) { synth.cancel(); }
    isSpeaking = true;
    const u = new SpeechSynthesisUtterance(speechQueue.shift());
    u.lang = 'th-TH';
    const voices = synth.getVoices();
    const thVoice = voices.find(v => v.lang.includes('th'));
    if (thVoice) u.voice = thVoice;
    u.onend = () => { isSpeaking = false; processQueue(); };
    u.onerror = (e) => { console.error("TTS Error:", e.error); isSpeaking = false; processQueue(); };
    activeUtterance = u; 
    synth.speak(u);
}

function playDing() { if(!isSoundOn) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); o.frequency.setValueAtTime(800, audioCtx.currentTime); o.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime+0.1); g.gain.setValueAtTime(0.3, audioCtx.currentTime); g.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime+0.1); o.start(); o.stop(audioCtx.currentTime+0.1); }
function playCancel() { if(!isSoundOn) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type='sawtooth'; o.connect(g); g.connect(audioCtx.destination); o.frequency.setValueAtTime(150, audioCtx.currentTime); g.gain.setValueAtTime(0.2, audioCtx.currentTime); o.start(); o.stop(audioCtx.currentTime+0.3); }
setInterval(() => { if (!synth.speaking && speechQueue.length > 0 && !isSpeaking) processQueue(); }, 1000);

// --- GLOBAL WINDOW FUNCTIONS ---
window.toggleSound = () => { 
    isSoundOn = !isSoundOn; 
    const btn = document.getElementById('btnSound');
    if (isSoundOn) {
        btn.className = 'btn btn-mute active';
        btn.innerText = '🔊 เสียง: เปิด';
        unlockAudio(); 
        queueSpeech("เปิดเสียงค่ะ"); 
    } else { 
        btn.className = 'btn btn-mute';
        btn.innerText = '🔇 เสียง: ปิด';
        window.resetVoice(); 
    }
};

window.resetVoice = () => { 
    synth.cancel(); 
    speechQueue = []; 
    isSpeaking = false; 
    if(isSoundOn) queueSpeech("รีเซ็ตเสียงแล้ว"); 
};

window.testVoice = () => { queueSpeech("ทดสอบเสียง หนึ่ง สอง สาม สี่ ห้า"); };

window.askName = (uid, old) => { 
    Swal.fire({title: 'ตั้งชื่อเล่น', input: 'text', inputValue: old}).then(r => { 
        if (r.value) update(ref(db, `nicknames/${uid}`), {nick: r.value}); 
    }); 
};

window.updateAllChatNames = () => {
    document.querySelectorAll('.chat-header').forEach(function(el) {
        const uid = el.getAttribute('data-uid');
        const realName = el.getAttribute('data-realname');
        if (uid && realName) el.innerHTML = generateNameHtml(uid, realName);
    });
};

window.updateShippingButton = () => {
    let count = 0;
    const activeBuyerUids = new Set();
    Object.keys(stockData).forEach(key => { 
        if (stockData[key].uid) activeBuyerUids.add(stockData[key].uid); 
    });

    if (shippingData && shippingData[currentVideoId]) {
        const videoShipping = shippingData[currentVideoId];
        count = Object.keys(videoShipping).filter(uid => videoShipping[uid].ready && activeBuyerUids.has(uid)).length;
    }
    
    const btn = document.getElementById('btn-shipping');
    if(btn) {
        btn.innerText = '🚚 (' + count + ')'; 
        btn.className = count > 0 ? 'btn btn-shipping' : 'btn btn-shipping empty';
    }
};

window.manualAddShipping = () => {
    const uid = document.getElementById('manualShipSelect').value;
    if(uid) {
        update(ref(db, `shipping/${currentVideoId}/${uid}`), {ready: true, timestamp: Date.now()})
        .then(() => {
            Toast.fire({
                icon: 'success',
                title: 'เพิ่มลงรายการส่งของแล้ว'
            });
        });
    }
};

window.saveStockSize = (val) => {
    set(ref(db, 'system/stockSize'), parseInt(val));
    document.getElementById('total-count').innerText = val;
};

window.updateNickSilent = (uid, val) => {
    if(!val) return;
    update(ref(db, `nicknames/${uid}`), {nick: val});
};

window.printLabel = (uid) => {
    let total=0, items=[]; Object.keys(stockData).forEach(n=>{ if(stockData[n].uid===uid) { items.push(`#${n} ${stockData[n].price?stockData[n].price:''}`); total+=parseInt(stockData[n].price||0); } });
    let address = "";
    if (shippingData[currentVideoId] && shippingData[currentVideoId][uid]) { address = shippingData[currentVideoId][uid].address || ""; } 
    else if (savedNames[uid]) { address = savedNames[uid].address || ""; }
    document.getElementById('print-area').innerHTML = `<div class="print-label"><div class="print-header">ผู้รับ: ${savedNames[uid]?.nick||'ลูกค้า'}</div><div class="print-address">${address}</div><div class="print-items">${items.join(', ')}<br>รวม: ${total} บาท</div></div>`; window.print();
};

window.toggleFullScreen = () => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen(); } 
        else if (document.documentElement.webkitRequestFullscreen) { document.documentElement.webkitRequestFullscreen(); }
    } else {
        if (document.exitFullscreen) { document.exitFullscreen(); } 
        else if (document.webkitExitFullscreen) { document.webkitExitFullscreen(); }
    }
};

window.toggleDropdown = () => { document.getElementById("toolsDropdown").classList.toggle("show"); };
window.addEventListener('click', (e) => {
    if (!e.target.closest('.btn-sim')) {
        const dropdowns = document.getElementsByClassName("dropdown-content");
        for (let i = 0; i < dropdowns.length; i++) {
            const openDropdown = dropdowns[i];
            if (openDropdown.classList.contains('show')) openDropdown.classList.remove('show');
        }
    }
});

window.askAiKey = () => { Swal.fire({ title: 'ตั้งค่า Gemini API Key', html: '<a href="https://aistudio.google.com/" target="_blank" style="color:#29b6f6">กดขอ Key ฟรีที่นี่</a>', input: 'text', inputValue: geminiApiKey, footer: geminiApiKey ? '<span style="color:lime">✅ มี Key อยู่ในเครื่องแล้ว</span>' : '' }).then(res => { if (res.value) { geminiApiKey = res.value.trim(); localStorage.setItem('geminiApiKey', geminiApiKey); Swal.fire('บันทึกแล้ว', '', 'success'); } }); };

window.adjustZoom = (n) => { currentFontSize+=n; document.documentElement.style.setProperty('--chat-size', currentFontSize+'px'); };
window.adjustGridZoom = (n) => { currentGridSize+=n; document.documentElement.style.setProperty('--grid-size', currentGridSize+'em'); };

window.renderDashboardTable = () => {
    const dashboard = document.querySelector('.dashboard-overlay');
    const scrollY = dashboard ? dashboard.scrollTop : 0; 

    const tbody = document.getElementById('shipping-body'); 
    if(tbody) {
        tbody.innerHTML = '';
        const userOrders = {};
        const allBuyerUids = new Set();
        
        Object.keys(stockData).forEach(num => {
            const item = stockData[num]; 
            if(item.uid) {
                allBuyerUids.add(item.uid);
                if (!userOrders[item.uid]) userOrders[item.uid] = { name: item.owner, items: [], totalPrice: 0, uid: item.uid };
                const price = item.price ? parseInt(item.price) : 0;
                userOrders[item.uid].items.push({ num: num, price: price });
                userOrders[item.uid].totalPrice += price;
            }
        });

        const currentShipping = shippingData[currentVideoId] || {};
        const readyUids = [...allBuyerUids].filter(uid => currentShipping[uid] && currentShipping[uid].ready);
        const notReadyUids = [...allBuyerUids].filter(uid => !(currentShipping[uid] && currentShipping[uid].ready));

        if (notReadyUids.length > 0) {
            const addRow = document.createElement('tr');
            addRow.innerHTML = `
                <td colspan="3" style="text-align:center; padding:10px; background:#2a2a2a;">
                    <div style="display:flex; gap:10px; justify-content:center; align-items:center;">
                        <i class="fa-solid fa-user-plus"></i>
                        <select id="manualShipSelect" style="padding:5px; border-radius:4px; background:#444; color:#fff; border:1px solid #555; max-width:200px;">
                            <option value="">-- เลือกลูกค้าเพื่อส่งของ --</option>
                            ${notReadyUids.map(uid => `<option value="${uid}">${savedNames[uid]?.nick || userOrders[uid].name}</option>`).join('')}
                        </select>
                        <button class="btn btn-success" onclick="window.manualAddShipping()" style="padding:4px 10px; font-size:0.9em;">เพิ่ม</button>
                    </div>
                </td>
            `;
            tbody.appendChild(addRow);
        } else if (allBuyerUids.size > 0 && readyUids.length === allBuyerUids.size) {
             const infoRow = document.createElement('tr');
             infoRow.innerHTML = `<td colspan="3" style="text-align:center; color:#00e676; padding:10px;">✅ ลูกค้าทุกคนอยู่ในรายการส่งของแล้ว</td>`;
             tbody.appendChild(infoRow);
        }

        if (readyUids.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = `<td colspan="3" style="text-align:center; color:#888; padding:20px;">ยังไม่มีรายการที่แจ้งพร้อมส่ง</td>`;
            tbody.appendChild(emptyRow);
        } else {
            let index = 1;
            readyUids.forEach(uid => {
                const order = userOrders[uid];
                let custData = savedNames[uid] || { nick: order.name };
                
                const tr = document.createElement('tr');
                const itemStr = order.items.map(i => '#' + i.num + (i.price > 0 ? '('+i.price+')' : '')).join(', ');
                
                tr.innerHTML = `<td>${index++}</td><td><input class="edit-input" value="${custData.nick||order.name}" onchange="window.updateNickSilent('${uid}', this.value)" placeholder="พิมพ์ชื่อแล้ว Enter"></td><td>${itemStr}</td>`;
                tbody.appendChild(tr);
            });
        }
        
        if(dashboard) dashboard.scrollTop = scrollY;
    }
};

// --- LOGIC FUNCTIONS ---
function generateNameHtml(uid, realName) {
    const color = stringToColor(uid); 
    let nick = realName;
    let displayName = realName;
    let isNickSet = false;

    if (savedNames[uid]) {
        if (typeof savedNames[uid] === 'object') {
            nick = savedNames[uid].nick;
        } else {
             nick = savedNames[uid]; 
        }
        isNickSet = true;
        displayName = nick;
    }
    
    const valueToEdit = isNickSet ? nick : realName;
    let vipClass = "";
    if (/admin|แอดมิน/i.test(displayName) || /admin|แอดมิน/i.test(realName)) vipClass = "vip-admin";

    if (isNickSet) {
        return `<div><span class="badge-nick ${vipClass}" style="${!vipClass?'background:'+color:''}" data-val="${escapeHtml(valueToEdit)}" onclick="window.askName('${uid}', this.getAttribute('data-val'))">${displayName}</span> <span class="real-name-sub">(${realName})</span></div>`;
    }
    return `<span class="badge-real ${vipClass}" style="color:${color}" data-val="${escapeHtml(realName)}" onclick="window.askName('${uid}', this.getAttribute('data-val'))">${realName}</span>`;
}

function renderChat(name, msg, type, uid, img, realName, detectionMethod = null) {
    const div = document.createElement('div'); div.className = `chat-row ${type} new-msg`;
    
    let tagHtml = '';
    if (detectionMethod === 'regex') tagHtml = '<button class="tag-source regex" title="ตรวจจับด้วย Pattern"><i class="fa-solid fa-bolt"></i></button>';
    else if (detectionMethod === 'ai') tagHtml = '<button class="tag-source ai" title="ตรวจจับด้วย AI"><i class="fa-solid fa-robot"></i></button>';

    div.innerHTML = `<img src="${img}" class="avatar"><div class="chat-content"><div class="chat-header" data-uid="${uid}" data-realname="${escapeHtml(realName)}">${generateNameHtml(uid, realName)} ${tagHtml}</div><div class="chat-msg">${msg}</div></div>`;
    const list = document.getElementById('chat-list');
    list.appendChild(div);
    
    const vp = document.getElementById('chat-viewport');
    if (!isUserScrolledUp) {
        vp.scrollTop = vp.scrollHeight; 
    } else {
        document.getElementById('btn-scroll-down').style.display = 'block'; 
    }
}

window.scrollToBottom = () => {
    const vp = document.getElementById('chat-viewport');
    vp.scrollTop = vp.scrollHeight;
    isUserScrolledUp = false;
    document.getElementById('btn-scroll-down').style.display = 'none';
};

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
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const result = await response.json();
        const match = result.candidates?.[0]?.content?.parts?.[0]?.text?.match(/\{.*?\}/s);
        return match ? JSON.parse(match[0]) : null;
    } catch (e) { return null; }
}

async function processMessage(item) {
    if (!item.snippet || !item.authorDetails) return; 
    if (seenMessageIds[item.id]) return; seenMessageIds[item.id] = true;
    const msg = item.snippet.displayMessage || ""; if (!msg) return;

    const uid = item.authorDetails.channelId; 
    const realName = item.authorDetails.displayName;
    let nick = realName; if(savedNames[uid]) nick = (typeof savedNames[uid] === 'object') ? savedNames[uid].nick : savedNames[uid];
    const isAdmin = /admin|แอดมิน/i.test(nick);
    
    let stockSize = parseInt(document.getElementById('stockSize').value) || 70;
    let intent = null, targetId = null, targetPrice = null, method = null;

    if (isAiCommander) {
        const aiResult = await analyzeChatWithAI(msg);
        if (aiResult) {
            if (aiResult.intent === 'buy' && aiResult.id) {
                intent = 'buy'; targetId = aiResult.id; targetPrice = aiResult.price; method = 'ai';
            } else if (aiResult.intent === 'cancel' && aiResult.id) {
                intent = 'cancel'; targetId = aiResult.id; method = 'ai';
            } else if (aiResult.intent === 'shipping') {
                const shipPath = `shipping/${currentVideoId}/${uid}`;
                update(ref(db, shipPath), {ready: true, timestamp: Date.now()}).then(() => queueSpeech(nick + " แจ้งส่งของ"));
                method = 'ai';
            } else if (aiResult.intent === 'question') {
                method = 'ai-skip';
            }
        }
    }

    if (!method) {
        const buyRegex = /(?:^|[\s])(?:F|f|cf|CF|รับ|เอา)?\s*(\d+)(?:[\s=\/]+(\d+))?(?:$|[\s])/; 
        const cancelRegex = /(?:^|[\s])(?:cc|CC|cancel|ยกเลิก|ไม่เอา|ปล่อย|หลุด)\s*(\d+)(?:$|[\s])/i;
        const isQuestion = /อก|เอว|ยาว|ราคา|เท่าไหร่|ทไหร|กี่บาท|แบบไหน|ผ้า|สี|ตำหนิ|ไหม/i.test(msg);
        const cMatch = msg.match(cancelRegex);
        const bMatch = msg.match(buyRegex);

        if (cMatch) { 
            intent = 'cancel'; targetId = parseInt(cMatch[1]); method = 'regex';
        } else if (bMatch && !isQuestion) { 
            intent = 'buy'; targetId = parseInt(bMatch[1]); targetPrice = bMatch[2] ? parseInt(bMatch[2]) : null; method = 'regex';
        }
    }

    renderChat(nick, msg, isAdmin ? 'admin' : 'normal', uid, item.authorDetails.profileImageUrl, realName, method);
    
    let speakMsg = msg.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '');
    if (speakMsg.trim().length > 0 && speakMsg.length < 100) queueSpeech(nick + " ... " + speakMsg);

    if (method === 'ai-skip') return; 

    if (targetId && targetId > 0) {
        if (targetId > stockSize) {
            stockSize = targetId;
            window.saveStockSize(stockSize);
        }

        if (intent === 'buy') {
            let ownerName = nick, ownerUid = uid;
            if (isAdmin) {
                let cleanName = msg;
                cleanName = cleanName.replace(targetId.toString(), '').replace(/f|cf|รับ|เอา|=/gi, '');
                if (targetPrice) cleanName = cleanName.replace(targetPrice.toString(), '');
                cleanName = cleanName.replace(/^[:=\-\s]+|[:=\-\s]+$/g, '').trim();
                if (cleanName.length > 0) { ownerName = cleanName; ownerUid = 'admin-proxy-' + Date.now(); } 
                else { ownerName = "ลูกค้า (Admin)"; ownerUid = 'admin-proxy-' + Date.now(); }
            }
            await processOrder(targetId, ownerName, ownerUid, 'chat', targetPrice, method); 
        } else if (intent === 'cancel') {
            if (isAdmin || (stockData[targetId] && stockData[targetId].uid === uid)) {
                const cancelMsg = `${nick} ยกเลิกรายการที่ ${targetId} ค่ะ`;
                processCancel(targetId, cancelMsg);
            }
        }
    }
}

async function processOrder(num, owner, uid, src, price, method = 'manual') {
    const itemRef = ref(db, `stock/${currentVideoId}/${num}`);
    
    try {
        await runTransaction(itemRef, (currentData) => {
            if (currentData === null) {
                // Slot is empty, claim it
                return { owner, uid, time: Date.now(), queue: [], source: method, price: price || null };
            } else if (!currentData.owner) {
                // Slot exists but has no owner (e.g. only price was set)
                currentData.owner = owner;
                currentData.uid = uid;
                currentData.time = Date.now();
                currentData.source = method;
                if(price) currentData.price = price;
                if(!currentData.queue) currentData.queue = [];
                return currentData;
            } else {
                // Slot occupied
                if (currentData.owner === owner) return; 
                const queue = currentData.queue || [];
                if (queue.find(q => q.owner === owner)) return; 
                
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
    
    if (current.queue && Array.isArray(current.queue) && current.queue.length > 0) {
        const next = current.queue[0];
        const nextQ = current.queue.slice(1);
        const newData = { owner: next.owner, uid: next.uid, time: Date.now(), queue: nextQ, source: 'queue' };
        if (current.price) newData.price = current.price;
        set(ref(db, `stock/${currentVideoId}/${num}`), newData).then(() => {
            if (reason) queueSpeech(reason);
            setTimeout(() => queueSpeech(`คุณ ${next.owner} ได้สิทธิ์ต่อค่ะ`), 2500);
        });
    } else {
        remove(ref(db, `stock/${currentVideoId}/${num}`)).then(() => { 
            playCancel(); 
            if(reason) queueSpeech(reason); 
        });
    }
}

function renderGrid() {
    const panel = document.getElementById('stockPanel');
    const previousScrollTop = panel ? panel.scrollTop : 0;
    
    const size = parseInt(document.getElementById('stockSize').value) || 70;
    const grid = document.getElementById('stockGrid');
    if (grid.children.length !== size) {
        grid.innerHTML = '';
        for(let i=1; i<=size; i++) {
            const div = document.createElement('div'); div.className = 'stock-item'; div.id = 'stock-'+i;
            div.onclick = () => window.handleStockClick(i);
            div.innerHTML = `<span class="stock-num">${i}</span><span class="lock-icon">🔒</span><div class="queue-badge" id="qbadge-${i}" style="display:none"></div><span class="stock-status" id="status-${i}">ว่าง</span><span class="stock-price" id="price-${i}"></span><span class="source-icon"></span>`;
            grid.appendChild(div);
        }
    }
    
    Object.keys(stockData).forEach(key => {
        const item = stockData[key]; renderSlot(key, item);
    });
    for(let i=1; i<=size; i++) { 
        if(!stockData[i]) { 
            const el = document.getElementById('stock-'+i); 
            if(el) { 
                el.className='stock-item'; 
                el.classList.remove('new-order');
                el.classList.remove('blinking-border');
                document.getElementById(`status-${i}`).innerText='ว่าง'; 
                document.getElementById(`price-${i}`).innerText=''; 
                document.getElementById(`qbadge-${i}`).style.display='none'; 
                el.querySelector('.lock-icon').style.display='none'; 
                el.querySelector('.source-icon').style.display='none'; 
            } 
        } 
    }
    
    if(panel) {
        requestAnimationFrame(() => {
            panel.scrollTop = previousScrollTop;
        });
    }
}

function renderSlot(num, data) {
    const el = document.getElementById('stock-' + num); if(!el) return;
    
    if (!data.owner) {
        el.className = 'stock-item';
        document.getElementById(`status-${num}`).innerText = 'ว่าง';
        if (data.price) {
            const pEl = document.getElementById(`price-${num}`);
            pEl.innerText = '฿' + data.price;
            pEl.style.display = 'block';
            pEl.style.color = 'var(--vacant-price)';
        }
        return;
    }

    el.className = 'stock-item sold';
    
    const isNewOrder = (Date.now() - data.time) < 15000;
    if (isNewOrder) {
        el.classList.add('new-order');
        const remaining = 15000 - (Date.now() - data.time);
        setTimeout(() => el.classList.remove('new-order'), remaining);
    } else {
        el.classList.remove('new-order');
    }

    document.getElementById(`status-${num}`).innerText = data.owner || 'Unknown';
    document.getElementById(`price-${num}`).innerText = data.price ? '฿'+data.price : '';
    if (data.price) document.getElementById(`price-${num}`).style.color = '#ffd700';

    const lockIcon = el.querySelector('.lock-icon');
    const sourceIcon = el.querySelector('.source-icon'); 
    if(lockIcon) lockIcon.style.display = 'none'; 

    if (sourceIcon) {
        sourceIcon.style.display = 'block';
        sourceIcon.style.position = 'absolute';
        sourceIcon.style.bottom = '5px'; sourceIcon.style.left = '5px';
        sourceIcon.style.top = 'auto'; sourceIcon.style.right = 'auto';
        sourceIcon.style.fontSize = '14px';

        if (data.source === 'ai') {
            sourceIcon.innerHTML = '<i class="fa-solid fa-robot"></i>';
            sourceIcon.style.color = 'var(--ai-active)';
        } else if (data.source === 'regex') {
            sourceIcon.innerHTML = '<i class="fa-solid fa-bolt"></i>';
            sourceIcon.style.color = 'var(--pattern-tag)';
        } else if (data.source === 'manual') {
                sourceIcon.innerHTML = '<i class="fa-solid fa-hand-pointer"></i>';
                sourceIcon.style.color = '#fff';
        } else {
            sourceIcon.innerHTML = '<i class="fa-solid fa-lock"></i>';
            sourceIcon.style.color = 'var(--primary)'; 
        }
    }

    const qBadge = document.getElementById(`qbadge-${num}`);
    if (data.queue && data.queue.length > 0) { qBadge.style.display='block'; qBadge.innerText = '+'+data.queue.length; } 
    else qBadge.style.display='none';
}

function updateStats() { 
    const total = parseInt(document.getElementById('stockSize').value) || 70;
    const soldCount = Object.keys(stockData).filter(k => stockData[k].owner).length; 
    document.getElementById('sold-count').innerText = soldCount;
    document.getElementById('total-count').innerText = total;
}

function connectToStock(vid) {
    if (unsubscribeStock) unsubscribeStock();
    currentVideoId = vid; lastScrollTimestamp = Date.now();
    let isFirstLoad = true; 

    unsubscribeStock = onValue(ref(db, `stock/${vid}`), snap => {
        const val = snap.val() || {};
        
        if (!isFirstLoad) {
            const keys = Object.keys(val);
            for (const key of keys) {
                const newItem = val[key];
                const oldItem = stockData[key];
                
                if (newItem.owner && (!oldItem || !oldItem.owner)) {
                    setTimeout(() => {
                        const el = document.getElementById('stock-' + key);
                        if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.classList.add('highlight');
                        }
                    }, 50);
                    break;
                }
            }
        }

        stockData = val; 
        renderGrid(); 
        updateStats(); 
        window.updateShippingButton();
        if(document.getElementById('dashboard').style.display === 'flex') window.renderDashboardTable();
        
        isFirstLoad = false;
    });
}

function updateAwayTimer() {
    if (!currentAwayState) return;
    const diff = Math.floor((Date.now() - awayStartTime) / 1000);
    const minutes = Math.floor(diff / 60);
    const seconds = diff % 60;
    const text = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    const el = document.getElementById('awayTimer');
    if (el) el.innerText = text;
}

window.toggleAwayMode = async () => {
    try {
        unlockAudio();
        const snap = await get(ref(db, 'system/awayMode'));
        const current = snap.val() || {};
        if (current.isAway) {
            await update(ref(db, 'system/awayMode'), { isAway: false });
        } else {
            await update(ref(db, 'system/awayMode'), { isAway: true, startTime: Date.now() });
            await set(ref(db, 'system/aiCommander'), myDeviceId);
        }
    } catch(e) {
        console.error("Away Mode Error", e);
    }
};

window.openHistory = () => { 
    document.getElementById('history-modal').style.display = 'flex'; 
    window.loadHistoryList(); 
};
window.closeHistory = () => { document.getElementById('history-modal').style.display = 'none'; };

window.loadHistoryList = async () => {
    const list = document.getElementById('history-list');
    list.innerHTML = '<li style="text-align:center; color:#888;">กำลังโหลดประวัติ...</li>';
    
    try {
        const snapshot = await get(ref(db, 'history'));
        const items = [];
        snapshot.forEach(c => items.push({ id: c.key, ...c.val() }));
        items.sort((a,b) => (b.timestamp||0)-(a.timestamp||0));
        allHistoryData = items;
        historyCurrentPage = 1;
        window.renderHistoryPage();
    } catch(e) {
        list.innerHTML = `<li style="color:red; text-align:center;">โหลดไม่สำเร็จ: ${e.message}</li>`;
    }
};

window.renderHistoryPage = () => {
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    
    const searchText = document.getElementById('historySearchInput').value.toLowerCase();
    const filtered = allHistoryData.filter(i => 
        (i.title && i.title.toLowerCase().includes(searchText)) || 
        (i.id && i.id.toLowerCase().includes(searchText))
    );

    const totalPages = Math.ceil(filtered.length / historyItemsPerPage);
    if(historyCurrentPage > totalPages) historyCurrentPage = totalPages || 1;
    
    const start = (historyCurrentPage - 1) * historyItemsPerPage;
    const end = start + historyItemsPerPage;
    const pageItems = filtered.slice(start, end);

    const controls = document.createElement('li');
    controls.style.cssText = "display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; background:#1e1e1e; padding:10px; border-bottom:1px solid #333; z-index:10; margin-bottom:10px;";
    controls.innerHTML = `
        <button class="btn btn-dark" ${historyCurrentPage<=1?'disabled':''} onclick="window.changeHistoryPage(-1)">◀ ย้อน</button>
        <span style="color:#aaa; font-size:0.9em;">หน้า ${historyCurrentPage} / ${totalPages || 1} (ทั้งหมด ${filtered.length})</span>
        <button class="btn btn-dark" ${historyCurrentPage>=totalPages?'disabled':''} onclick="window.changeHistoryPage(1)">ถัดไป ▶</button>
    `;
    list.appendChild(controls);

    if(pageItems.length === 0) {
        const empty = document.createElement('li');
        empty.innerHTML = `<div style="text-align:center; padding:20px; color:#555;">ไม่พบรายการ</div>`;
        list.appendChild(empty);
        return;
    }

    pageItems.forEach(i => {
        const li = document.createElement('li'); 
        li.className = 'history-item';
        li.innerHTML = `<div><span class="hist-date">${formatThaiDate(i.timestamp||0)}</span> ${i.title||i.id}</div> <button class="btn btn-dark" onclick="window.deleteHistory('${i.id}')">🗑️</button>`;
        li.querySelector('div').onclick = () => { window.closeHistory(); document.getElementById('vidInput').value = i.id; window.toggleConnection(); };
        list.appendChild(li);
    });
};

window.changeHistoryPage = (delta) => {
    historyCurrentPage += delta;
    window.renderHistoryPage();
};

window.filterHistory = () => {
    historyCurrentPage = 1;
    window.renderHistoryPage();
};

window.deleteHistory = (vid) => { 
    Swal.fire({title:'ลบประวัติ?', showCancelButton:true}).then(r=>{ 
        if(r.isConfirmed) remove(ref(db, 'history/'+vid)).then(() => window.loadHistoryList()); 
    }); 
};

window.toggleShowAll = () => { 
    window.renderDashboardTable();
};

// --- INIT LISTENERS ---
signInAnonymously(auth);
remove(ref(db, 'stock/demo'));

onAuthStateChanged(auth, user => {
    if (user) {
        initTooltips(); 
        onValue(ref(db, 'system/stockSize'), s => { 
            const val = s.val() || 70;
            document.getElementById('stockSize').value = val;
            renderGrid(); 
            updateStats(); 
        });
        if (unsubscribeSystem) unsubscribeSystem();
        unsubscribeSystem = onValue(ref(db, 'system/activeVideo'), snap => {
            const vid = snap.val();
            if (vid && vid !== 'demo') { document.getElementById('vidInput').value = vid; connectToStock(vid); } 
            else connectToStock('demo');
        });
        onValue(ref(db, 'nicknames'), s => { 
            try {
                savedNames = s.val() || {}; 
                window.updateAllChatNames();
                if(document.getElementById('dashboard').style.display === 'flex') window.renderDashboardTable(); 
            } catch(e) {}
        });
        onValue(ref(db, 'shipping'), s => {
            try {
                shippingData = s.val() || {};
                window.updateShippingButton();
                if(document.getElementById('dashboard').style.display === 'flex') window.renderDashboardTable();
            } catch(e) {}
        });
        onValue(ref(db, '.info/connected'), s => updateStatusIcon('stat-db', s.val() ? 'ok' : 'err'));

        // Away Mode Listener
        onValue(ref(db, 'system/awayMode'), (snap) => {
            const val = snap.val();
            const banner = document.getElementById('awayBanner');
            const newState = val ? val.isAway : false;

            if (newState && !currentAwayState) {
                 queueSpeech("แอดมินพาลูกเข้านอนแล้ว");
                 Toast.fire({
                     title: '🌙 โหมดพาลูกนอนทำงาน',
                     text: 'แอดมินไม่อยู่หน้าจอ ระบบจะสแตนบาย',
                     icon: 'info'
                 });
            } else if (!newState && currentAwayState) {
                 queueSpeech("ลูกหลับแล้ว แอดมินสแตนบาย");
            }
            
            currentAwayState = newState;

            if (currentAwayState) {
                if (banner) banner.style.display = 'flex';
                awayStartTime = val?.startTime || Date.now(); 
                if (!awayInterval) {
                     updateAwayTimer(); 
                     awayInterval = setInterval(updateAwayTimer, 1000); 
                }
            } else {
                if (banner) banner.style.display = 'none';
                if (awayInterval) {
                    clearInterval(awayInterval);
                    awayInterval = null;
                }
            }
        });

        // AI Commander Sync
        syncAiCommanderStatus();
        initVersionControl();
    }
});

const vp = document.getElementById('chat-viewport');
if (vp) {
    vp.addEventListener('scroll', function() { 
        const isAtBottom = vp.scrollHeight - vp.scrollTop - vp.clientHeight < 100;
        isUserScrolledUp = !isAtBottom;

        if(isAtBottom) 
            document.getElementById('btn-scroll-down').style.display = 'none'; 
        else 
            document.getElementById('btn-scroll-down').style.display = 'block'; 
    });
}
