import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getDatabase, ref, set, update, remove, onValue, get, serverTimestamp, query, orderByChild, runTransaction } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { AppInfo } from "./version.js";

// ============================================================
// 1. CONFIGURATION & VARIABLES
// ============================================================
const firebaseConfig = {
    apiKey: "AIzaSyAVYqEmdw-AwS1tCElhSaXDLP1Aq35chp0",
    authDomain: "manowlive-chat.firebaseapp.com",
    databaseURL: "https://manowlive-chat-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "manowlive-chat"
};

const API_KEYS = ["AIzaSyAVzYQN51V-kITnyJWGy8IVSktitxrVD8g", "AIzaSyBlnw6tpETYu61XSNqd7zXt25Fv_vmbWJU", "AIzaSyAX3dwUqBFeCBjjZixVnlcBz56gAfNWzs0", "AIzaSyAxjRAs01mpt-NxQiR3yStr6Q-57EiQq64"];

// --- GLOBAL VARIABLES ---
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
let lastScrollTimestamp = 0; 
let unsubscribeStock, unsubscribeSystem;

let currentFontSize = 16;
let currentGridSize = 1;
let isUserScrolledUp = false;

// Audio
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const synth = window.speechSynthesis;
let speechQueue = [];
let isSpeaking = false;
let isSoundOn = true;
let activeUtterance = null;
let isAudioUnlocked = false;

// Away Mode
let isAway = false;
let awayStartTime = 0;
let awayInterval = null;
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
const localVer = localStorage.getItem('app_version');
if (localVer !== AppInfo.version) {
    console.log(`Version update: ${localVer} -> ${AppInfo.version}`);
    localStorage.setItem('app_version', AppInfo.version);
    window.location.reload(true);
}

// SWAL Config
const ModalSwal = Swal.mixin({
    heightAuto: false,
    scrollbarPadding: false
});
window.Swal = ModalSwal;

const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    heightAuto: false,
    didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer)
        toast.addEventListener('mouseleave', Swal.resumeTimer)
    }
});

// ============================================================
// 2. HELPER FUNCTIONS (Pure Logic)
// ============================================================

function stringToColor(str) { var hash = 0; for (var i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash); return 'hsl(' + (Math.abs(hash) % 360) + ', 85%, 75%)'; }
function escapeHtml(text) { if (!text) return ""; return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
function formatThaiDate(timestamp) { const date = new Date(timestamp); const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]; return date.getDate() + ' ' + months[date.getMonth()] + ' ' + (date.getFullYear() + 543) + ' (' + date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0') + ')'; }

function updateStatusIcon(id, status) { 
    const el = document.getElementById(id);
    if(el) {
        el.className = 'status-item';
        el.classList.add(status);
    }
}

function updateKeyDisplay() { 
    const el = document.getElementById('stat-key');
    if(el) el.innerHTML = `<i class="fa-solid fa-key"></i> ${currentKeyIdx + 1}`; 
}

function setLoading(s) { 
    const btn = document.getElementById('btnConnect');
    if(btn) btn.disabled = s; 
}

// ============================================================
// 3. CORE LOGIC FUNCTIONS (Hoisted)
// ============================================================

function initVersionControl() {
    const badge = document.querySelector('.version-badge');
    if (badge) {
        badge.innerText = `${AppInfo.version}`;
        badge.title = `เวอร์ชั่น: ${AppInfo.version} (${AppInfo.releaseDate})\n\n${AppInfo.changelog.join('\n')}`;
    }
    const toolsDropdown = document.getElementById('toolsDropdown');
    if (toolsDropdown && !document.getElementById('btnForceUpdate')) {
        const a = document.createElement('a');
        a.id = 'btnForceUpdate';
        a.innerHTML = '<i class="fa-solid fa-rotate"></i> บังคับอัปเดต (Force Update)';
        a.style.color = '#00e676';
        a.onclick = () => window.forceUpdate();
        toolsDropdown.insertBefore(a, toolsDropdown.firstChild);
    }
}

function initTooltips() {
    const tips = {
        'btnVoice': 'สั่งงานด้วยเสียง', 'btnAICommander': 'ระบบ AI ช่วยจอง', 'btn-shipping': 'รายการพร้อมส่ง',
        'btnConnect': 'เชื่อมต่อ YouTube', 'btnSound': 'เปิด/ปิดเสียง', 'stockSize': 'จำนวนรายการ'
    };
    for(const [id, text] of Object.entries(tips)) { const el = document.getElementById(id); if(el) el.title = text; }
}

function initStatusIcons() {
    const cluster = document.querySelector('.status-cluster');
    if(cluster) {
        cluster.innerHTML = `
            <span id="stat-db" class="status-item" title="สถานะฐานข้อมูล"><i class="fa-solid fa-database"></i></span>
            <span id="stat-api" class="status-item" title="สถานะ YouTube API"><i class="fa-brands fa-youtube"></i></span>
            <span id="stat-chat" class="status-item" title="สถานะการดึงแชท"><i class="fa-solid fa-comments"></i></span>
            <span id="stat-key" class="key-indicator" title="API Key"><i class="fa-solid fa-key"></i> 1</span>
        `;
    }
}

function syncAiCommanderStatus() {
    onValue(ref(db, 'system/aiCommander'), (snap) => {
        const commanderId = snap.val();
        const btn = document.getElementById('btnAICommander');
        if(!btn) return;
        if (commanderId === myDeviceId) { isAiCommander = true; btn.innerHTML = '🤖 AI: เปิด (Commander)'; btn.className = 'btn btn-ai active'; } 
        else if (commanderId) { isAiCommander = false; btn.innerHTML = '🤖 AI: ปิด (เครื่องอื่นคุม)'; btn.className = 'btn btn-ai remote'; } 
        else { isAiCommander = false; btn.innerHTML = '🤖 AI: ปิด'; btn.className = 'btn btn-ai inactive'; }
    });
}

function updateStats() { 
    const total = parseInt(document.getElementById('stockSize').value) || 70;
    const soldCount = Object.keys(stockData).filter(k => stockData[k].owner).length; 
    document.getElementById('sold-count').innerText = soldCount;
    document.getElementById('total-count').innerText = total;
}

function generateNameHtml(uid, realName) {
    const color = stringToColor(uid); 
    let nick = realName;
    let displayName = realName;
    let isNickSet = false;

    if (savedNames[uid]) {
        if (typeof savedNames[uid] === 'object') { nick = savedNames[uid].nick; } 
        else { nick = savedNames[uid]; }
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
    
    if(panel) requestAnimationFrame(() => { panel.scrollTop = previousScrollTop; });
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

// --- Audio ---
function unlockAudio() {
    if (isAudioUnlocked) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(" ");
    synth.speak(u);
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    g.gain.value = 0;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(0);
    o.stop(0.1);
    isAudioUnlocked = true;
}
['click', 'touchstart', 'keydown'].forEach(evt => document.addEventListener(evt, unlockAudio, { once: true }));

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
    u.onerror = () => { isSpeaking = false; processQueue(); };
    activeUtterance = u; 
    synth.speak(u);
}

function playDing() { if(!isSoundOn) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); o.frequency.setValueAtTime(800, audioCtx.currentTime); o.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime+0.1); g.gain.setValueAtTime(0.3, audioCtx.currentTime); g.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime+0.1); o.start(); o.stop(audioCtx.currentTime+0.1); }
function playCancel() { if(!isSoundOn) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type='sawtooth'; o.connect(g); g.connect(audioCtx.destination); o.frequency.setValueAtTime(150, audioCtx.currentTime); g.gain.setValueAtTime(0.2, audioCtx.currentTime); o.start(); o.stop(audioCtx.currentTime+0.3); }
setInterval(() => { if (!synth.speaking && speechQueue.length > 0 && !isSpeaking) processQueue(); }, 1000);

// ============================================================
// 4. WINDOW FUNCTIONS (Assignments)
// ============================================================
window.forceUpdate = () => { if(confirm('ยืนยันการโหลดโปรแกรมใหม่?')) { localStorage.removeItem('app_version'); window.location.reload(true); } };
window.toggleSound = () => { isSoundOn = !isSoundOn; const btn = document.getElementById('btnSound'); if (isSoundOn) { btn.className = 'btn btn-mute active'; btn.innerText = '🔊 เสียง: เปิด'; unlockAudio(); queueSpeech("เปิดเสียงค่ะ"); } else { btn.className = 'btn btn-mute'; btn.innerText = '🔇 เสียง: ปิด'; window.resetVoice(); } };
window.resetVoice = () => { synth.cancel(); speechQueue = []; isSpeaking = false; if(isSoundOn) queueSpeech("รีเซ็ตเสียงแล้ว"); };
window.testVoice = () => { queueSpeech("ทดสอบเสียง หนึ่ง สอง สาม สี่ ห้า"); };
window.askName = (uid, old) => { Swal.fire({title: 'ตั้งชื่อเล่น', input: 'text', inputValue: old}).then(r => { if (r.value) update(ref(db, `nicknames/${uid}`), {nick: r.value}); }); };
window.updateAllChatNames = () => { document.querySelectorAll('.chat-header').forEach(function(el) { const uid = el.getAttribute('data-uid'); const realName = el.getAttribute('data-realname'); if (uid && realName) el.innerHTML = generateNameHtml(uid, realName); }); };
window.updateShippingButton = () => { let count = 0; const activeBuyerUids = new Set(); Object.keys(stockData).forEach(key => { if (stockData[key].uid) activeBuyerUids.add(stockData[key].uid); }); if (shippingData && shippingData[currentVideoId]) { const videoShipping = shippingData[currentVideoId]; count = Object.keys(videoShipping).filter(uid => videoShipping[uid].ready && activeBuyerUids.has(uid)).length; } const btn = document.getElementById('btn-shipping'); if(btn) { btn.innerText = '🚚 (' + count + ')'; btn.className = count > 0 ? 'btn btn-shipping' : 'btn btn-shipping empty'; } };
window.manualAddShipping = () => { const uid = document.getElementById('manualShipSelect').value; if(uid) { update(ref(db, `shipping/${currentVideoId}/${uid}`), {ready: true, timestamp: Date.now()}).then(() => { Toast.fire({ icon: 'success', title: 'เพิ่มลงรายการส่งของแล้ว' }); }); } };
window.saveStockSize = (val) => { set(ref(db, 'system/stockSize'), parseInt(val)); document.getElementById('total-count').innerText = val; };
window.updateNickSilent = (uid, val) => { if(!val) return; update(ref(db, `nicknames/${uid}`), {nick: val}); };
window.printLabel = (uid) => { let total=0, items=[]; Object.keys(stockData).forEach(n=>{ if(stockData[n].uid===uid) { items.push(`#${n} ${stockData[n].price?stockData[n].price:''}`); total+=parseInt(stockData[n].price||0); } }); let address = ""; if (shippingData[currentVideoId] && shippingData[currentVideoId][uid]) { address = shippingData[currentVideoId][uid].address || ""; } else if (savedNames[uid]) { address = savedNames[uid].address || ""; } document.getElementById('print-area').innerHTML = `<div class="print-label"><div class="print-header">ผู้รับ: ${savedNames[uid]?.nick||'ลูกค้า'}</div><div class="print-address">${address}</div><div class="print-items">${items.join(', ')}<br>รวม: ${total} บาท</div></div>`; window.print(); };
window.toggleFullScreen = () => { if (!document.fullscreenElement && !document.webkitFullscreenElement) { if (document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen(); } else if (document.documentElement.webkitRequestFullscreen) { document.documentElement.webkitRequestFullscreen(); } } else { if (document.exitFullscreen) { document.exitFullscreen(); } else if (document.webkitExitFullscreen) { document.webkitExitFullscreen(); } } };
window.toggleDropdown = () => { document.getElementById("toolsDropdown").classList.toggle("show"); };
window.askAiKey = () => { Swal.fire({ title: 'ตั้งค่า Gemini API Key', html: '<a href="https://aistudio.google.com/" target="_blank" style="color:#29b6f6">กดขอ Key ฟรีที่นี่</a>', input: 'text', inputValue: geminiApiKey, footer: geminiApiKey ? '<span style="color:lime">✅ มี Key อยู่ในเครื่องแล้ว</span>' : '' }).then(res => { if (res.value) { geminiApiKey = res.value.trim(); localStorage.setItem('geminiApiKey', geminiApiKey); Swal.fire('บันทึกแล้ว', '', 'success'); } }); };
window.adjustZoom = (n) => { currentFontSize+=n; document.documentElement.style.setProperty('--chat-size', currentFontSize+'px'); };
window.adjustGridZoom = (n) => { currentGridSize+=n; document.documentElement.style.setProperty('--grid-size', currentGridSize+'em'); };
window.renderDashboardTable = () => { /* ... (Defined above, kept separately for readability but assigned to window) ... */ 
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
            addRow.innerHTML = `<td colspan="3" style="text-align:center; padding:10px; background:#2a2a2a;"><div style="display:flex; gap:10px; justify-content:center; align-items:center;"><i class="fa-solid fa-user-plus"></i><select id="manualShipSelect" style="padding:5px; border-radius:4px; background:#444; color:#fff; border:1px solid #555; max-width:200px;"><option value="">-- เลือกลูกค้าเพื่อส่งของ --</option>${notReadyUids.map(uid => `<option value="${uid}">${savedNames[uid]?.nick || userOrders[uid].name}</option>`).join('')}</select><button class="btn btn-success" onclick="window.manualAddShipping()" style="padding:4px 10px; font-size:0.9em;">เพิ่ม</button></div></td>`;
            tbody.appendChild(addRow);
        } else if (allBuyerUids.size > 0 && readyUids.length === allBuyerUids.size) {
             const infoRow = document.createElement('tr'); infoRow.innerHTML = `<td colspan="3" style="text-align:center; color:#00e676; padding:10px;">✅ ลูกค้าทุกคนอยู่ในรายการส่งของแล้ว</td>`; tbody.appendChild(infoRow);
        }
        if (readyUids.length === 0) {
            const emptyRow = document.createElement('tr'); emptyRow.innerHTML = `<td colspan="3" style="text-align:center; color:#888; padding:20px;">ยังไม่มีรายการที่แจ้งพร้อมส่ง</td>`; tbody.appendChild(emptyRow);
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
window.handleStockClick = (num) => {
    const current = stockData[num];
    if (!current || !current.owner) {
        const currentPrice = current && current.price ? current.price : '';
        Swal.fire({
            title: `เบอร์ ${num}`, text: 'ใส่ชื่อเพื่อจอง หรือ ใส่ตัวเลขเพื่อตั้งราคา', input: 'text', inputValue: currentPrice,
            showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                const val = result.value.trim(); if (!val) return;
                if (/^\d+$/.test(val)) {
                    const updates = {};
                    if (!stockData[num]) { updates[`stock/${currentVideoId}/${num}`] = { price: val, source: 'manual' }; } 
                    else { updates[`stock/${currentVideoId}/${num}/price`] = val; }
                    update(ref(db), updates);
                } else { processOrder(num, val, 'manual-'+Date.now(), 'manual'); }
            }
        });
        return;
    }
    if (current) { 
        let queueHtml = '';
        if (current.queue && current.queue.length > 0) {
            queueHtml = '<div style="margin-top:10px; text-align:left; background:#eee; color:#000; padding:10px; border-radius:6px; border:1px solid #ccc;"><strong>คิวต่อ:</strong><ul style="padding-left:0; margin:10px 0; list-style:none;">';
            current.queue.forEach((q, idx) => {
                queueHtml += `<li style="background:#fff; padding:8px; margin-bottom:4px; border-radius:4px; display:flex; justify-content:space-between; align-items:center; border:1px solid #ddd; font-size:0.95em;"><span><strong style="color:#d32f2f;">${idx+1}.</strong> ${q.owner}</span><div><button onclick="window.moveQueueUp(${num}, ${idx})" style="background:#2196f3; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.8em; margin-right:5px;">▲</button><button onclick="window.editQueueName(${num}, ${idx})" style="background:#ff9800; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.8em; margin-right:5px;">✎</button><button onclick="window.removeQueue(${num}, ${idx})" style="background:#ff5252; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.8em;">ลบ</button></div></li>`;
            });
            queueHtml += '</ul></div>';
        }
        Swal.fire({ title: `เบอร์ ${num}`, html: `<div style="font-size:1.2em; color:#00e676; margin-bottom:10px;">${current.owner}</div><div style="display:flex; gap:5px; justify-content:center; flex-wrap:wrap;"><button onclick="window.doAction(${num}, 'edit')" class="swal2-confirm swal2-styled" style="background:#1976d2; margin:0;">แก้ชื่อ</button> <button onclick="window.doAction(${num}, 'price')" class="swal2-confirm swal2-styled" style="background:#555; margin:0;">แก้ราคา</button> <button onclick="window.doAction(${num}, 'cancel')" class="swal2-confirm swal2-styled" style="background:#d32f2f; margin:0;">ยกเลิกจอง</button></div>${queueHtml}`, showConfirmButton: false }); 
    }
};
window.removeQueue = (num, idx) => { const current=stockData[num]; if(current&&current.queue){ const newQ=[...current.queue]; newQ.splice(idx,1); set(ref(db,`stock/${currentVideoId}/${num}/queue`),newQ).then(()=>{ Swal.close(); window.handleStockClick(num); }); } };
window.moveQueueUp = (num, idx) => { if(idx===0)return; const current=stockData[num]; if(current&&current.queue){ const newQ=[...current.queue]; const temp=newQ[idx]; newQ[idx]=newQ[idx-1]; newQ[idx-1]=temp; set(ref(db,`stock/${currentVideoId}/${num}/queue`),newQ).then(()=>{ Swal.close(); window.handleStockClick(num); }); } };
window.editQueueName = (num, idx) => { const current=stockData[num]; if(current&&current.queue){ Swal.fire({title:'แก้ไขชื่อในคิว',input:'text',inputValue:current.queue[idx].owner,showCancelButton:true}).then(r=>{if(r.value){const updates={}; updates[`stock/${currentVideoId}/${num}/queue/${idx}/owner`]=r.value; update(ref(db),updates).then(()=>{Swal.close(); window.handleStockClick(num);});}}); } };
window.doAction = (num, action) => { Swal.close(); if(action==='edit'){Swal.fire({input:'text',inputValue:stockData[num].owner,title:'แก้ไขชื่อ (เฉพาะรายการนี้)'}).then(r=>{if(r.value)update(ref(db,`stock/${currentVideoId}/${num}`),{owner:r.value});});}else if(action==='price'){Swal.fire({input:'number'}).then(r=>{if(r.value)update(ref(db,`stock/${currentVideoId}/${num}`),{price:r.value});});}else if(action==='cancel')processCancel(num,`แอดมินลบรายการที่ ${num} ค่ะ`); };
window.fixDatabase = async () => { /* Same as before */ };
window.clearAllStock = () => { Swal.fire({title:'ล้างทั้งหมด?',showCancelButton:true}).then(r=>{if(r.isConfirmed)remove(ref(db,`stock/${currentVideoId}`));}); };
window.toggleAICommander = () => { if(!geminiApiKey)return Swal.fire({icon:'warning',title:'ต้องใส่ API Key ก่อน'}); isAiCommander=!isAiCommander; const btn=document.getElementById('btnAICommander'); if(isAiCommander){btn.innerHTML='🤖 AI: เปิด (Commander)';btn.className='btn btn-ai active';queueSpeech("เปิดระบบเอไอคอมมานเดอร์");}else{btn.innerHTML='🤖 AI: ปิด';btn.className='btn btn-ai inactive';} };
window.openTestMenu = () => { Swal.fire({title:'เครื่องมือ',showDenyButton:true,confirmButtonText:isSimulating?'🛑 หยุดจำลอง':'⚡ จำลองแชท',denyButtonText:'🔑 ตั้งค่า API Key'}).then(r=>{if(r.isConfirmed)window.toggleSimulation();else if(r.isDenied)window.askAiKey();}); };
window.toggleSimulation = () => { isSimulating=!isSimulating; const menu=document.getElementById('menuSim'); if(isSimulating){ menu.innerText="🛑 หยุดจำลอง"; const size=parseInt(document.getElementById('stockSize').value); simIntervalId=setInterval(()=>{ const rNum=Math.floor(Math.random()*size)+1; processMessage({id:'sim-'+Date.now(),snippet:{displayMessage:`F${rNum}`},authorDetails:{channelId:'sim',displayName:'SimUser',profileImageUrl:''}}); },1500); }else{ menu.innerText="⚡ เริ่มจำลองแชท"; clearInterval(simIntervalId); } };
window.openHistory = () => { document.getElementById('history-modal').style.display='flex'; window.loadHistoryList(); };
window.closeHistory = () => { document.getElementById('history-modal').style.display='none'; };
window.changeHistoryPage = (delta) => { historyCurrentPage+=delta; window.renderHistoryPage(); };
window.renderHistoryPage = () => { /* ... (Defined above) ... */ 
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    const searchText = document.getElementById('historySearchInput').value.toLowerCase();
    const filtered = allHistoryData.filter(i => (i.title && i.title.toLowerCase().includes(searchText)) || (i.id && i.id.toLowerCase().includes(searchText)));
    const totalPages = Math.ceil(filtered.length / historyItemsPerPage);
    if(historyCurrentPage > totalPages) historyCurrentPage = totalPages || 1;
    const start = (historyCurrentPage - 1) * historyItemsPerPage;
    const end = start + historyItemsPerPage;
    const pageItems = filtered.slice(start, end);
    const controls = document.createElement('li');
    controls.style.cssText = "display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; background:#1e1e1e; padding:10px; border-bottom:1px solid #333; z-index:10; margin-bottom:10px;";
    controls.innerHTML = `<button class="btn btn-dark" ${historyCurrentPage<=1?'disabled':''} onclick="window.changeHistoryPage(-1)">◀ ย้อน</button><span style="color:#aaa; font-size:0.9em;">หน้า ${historyCurrentPage} / ${totalPages || 1} (ทั้งหมด ${filtered.length})</span><button class="btn btn-dark" ${historyCurrentPage>=totalPages?'disabled':''} onclick="window.changeHistoryPage(1)">ถัดไป ▶</button>`;
    list.appendChild(controls);
    if(pageItems.length === 0) { const empty = document.createElement('li'); empty.innerHTML = `<div style="text-align:center; padding:20px; color:#555;">ไม่พบรายการ</div>`; list.appendChild(empty); return; }
    pageItems.forEach(i => { const li = document.createElement('li'); li.className = 'history-item'; li.innerHTML = `<div><span class="hist-date">${formatThaiDate(i.timestamp||0)}</span> ${i.title||i.id}</div> <button class="btn btn-dark" onclick="window.deleteHistory('${i.id}')">🗑️</button>`; li.querySelector('div').onclick = () => { window.closeHistory(); document.getElementById('vidInput').value = i.id; window.toggleConnection(); }; list.appendChild(li); });
};
window.deleteHistory = (vid) => { Swal.fire({title:'ลบประวัติ?', showCancelButton:true}).then(r=>{ if(r.isConfirmed) remove(ref(db, 'history/'+vid)).then(() => window.loadHistoryList()); }); };
window.toggleShowAll = () => { window.renderDashboardTable(); };
window.toggleAwayMode = async () => { try { unlockAudio(); const snap = await get(ref(db, 'system/awayMode')); const current = snap.val() || {}; if (current.isAway) { await update(ref(db, 'system/awayMode'), { isAway: false }); } else { await update(ref(db, 'system/awayMode'), { isAway: true, startTime: Date.now() }); await set(ref(db, 'system/aiCommander'), myDeviceId); } } catch(e) { console.error("Away Mode Error", e); } };
window.toggleConnection = () => { /* ... (Defined above) ... */ 
    if (isConnected) {
        clearInterval(intervalId); clearInterval(viewerIntervalId); if(chatTimeoutId) clearTimeout(chatTimeoutId); isConnected = false;
        document.getElementById('btnConnect').innerText = "CONNECT"; document.getElementById('btnConnect').className = "btn btn-primary";
        document.getElementById('status-dot').className = "status-dot"; queueSpeech("หยุดการเชื่อมต่อ"); 
        chatToken = ''; return;
    }
    const vid = document.getElementById('vidInput').value.trim();
    if (!vid) return Swal.fire('Error', 'ใส่ Video ID ก่อน', 'error');
    isConnecting = true; setLoading(true); if (audioCtx.state === 'suspended') audioCtx.resume();
    currentVideoId = vid; connectToStock(vid); set(ref(db, 'system/activeVideo'), vid); 
    chatToken = '';
    connectYoutube(vid).catch(e => { 
        Swal.fire({ icon: 'info', title: 'เชื่อมต่อวิดีโอแล้ว', text: 'ไม่พบห้องแชทสด (อาจเป็นคลิปย้อนหลัง) ระบบจะทำงานในโหมดรับคำสั่งเสียง/กดเองเท่านั้น', timer: 3000 });
        isConnected = true; setLoading(false); isConnecting = false;
        document.getElementById('btnConnect').innerText = "DISCONNECT"; document.getElementById('btnConnect').className = "btn btn-dark";
        document.getElementById('status-dot').className = "status-dot online";
    });
};

async function connectYoutube(vid) {
    try {
        const d = await smartFetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${vid}`);
        if (!d.items || d.items.length === 0) throw new Error("ID ไม่ถูกต้อง");
        const item = d.items[0];
        document.getElementById('live-title').innerText = item.snippet.title;
        saveHistory(vid, item.snippet.title);
        queueSpeech("เชื่อมต่อสำเร็จ กำลังอ่านคอมเมนต์จาก " + item.snippet.title);
        isConnected = true; setLoading(false); isConnecting = false;
        document.getElementById('btnConnect').innerText = "DISCONNECT"; document.getElementById('btnConnect').className = "btn btn-dark";
        updateStatusIcon('stat-api', 'ok');
        if (item.liveStreamingDetails?.activeLiveChatId) {
            activeChatId = item.liveStreamingDetails.activeLiveChatId; chatToken = ''; loadChat(); updateViewerCount(vid); viewerIntervalId = setInterval(()=>updateViewerCount(vid), 15000);
        } else { activeChatId = null; throw new Error("No Live Chat"); }
    } catch(e) { 
        console.error(e); 
        isConnected = true; setLoading(false); isConnecting = false; 
        document.getElementById('btnConnect').innerText = "DISCONNECT"; document.getElementById('btnConnect').className = "btn btn-dark"; 
        updateStatusIcon('stat-api', 'err'); 
    }
}

async function smartFetch(url) {
    try {
        updateStatusIcon('stat-api', 'ok'); let res = await fetch(url + "&key=" + API_KEYS[currentKeyIdx]); let data = await res.json();
        if (data.error) { 
            if (currentKeyIdx < API_KEYS.length - 1) { currentKeyIdx++; return smartFetch(url); } 
            else { Swal.fire('API Key Error', 'โควต้าเต็มทุกคีย์แล้ว', 'error'); throw new Error(data.error.message); }
        }
        return data;
    } catch(e) { updateStatusIcon('stat-api', 'err'); throw e; }
}

async function loadChat() {
    if (!isConnected || !activeChatId) return; if (isSimulating) return;
    const url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${activeChatId}&part=snippet,authorDetails${chatToken ? '&pageToken=' + chatToken : ''}`;
    try {
        const data = await smartFetch(url);
        if (data.items) { 
            updateStatusIcon('stat-chat', 'ok'); 
            for (const item of data.items) { await processMessage(item); }
            chatToken = data.nextPageToken; 
        }
        const delay = data.pollingIntervalMillis || 5000; chatTimeoutId = setTimeout(loadChat, Math.max(delay, 3000));
    } catch(e) { updateStatusIcon('stat-chat', 'err'); chatTimeoutId = setTimeout(loadChat, 10000); }
}

async function updateViewerCount(vid) {
    try {
        const d = await smartFetch(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${vid}`);
        if (d.items?.[0]?.liveStreamingDetails?.actualEndTime && !autoDisconnectTimer) { queueSpeech("ไลฟ์จบแล้ว"); autoDisconnectTimer = setTimeout(() => window.toggleConnection(), 180000); }
        if (d.items?.[0]) document.getElementById('view-counter').innerText = "👁️ " + Number(d.items[0].liveStreamingDetails.concurrentViewers||0).toLocaleString();
    } catch (e) { console.error("Viewer Count Error:", e); }
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
                return { owner, uid, time: Date.now(), queue: [], source: method, price: price || null };
            } else if (!currentData.owner) {
                currentData.owner = owner;
                currentData.uid = uid;
                currentData.time = Date.now();
                currentData.source = method;
                if(price) currentData.price = price;
                if(!currentData.queue) currentData.queue = [];
                return currentData;
            } else {
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

// ============================================================
// 6. EXECUTION START
// ============================================================
signInAnonymously(auth);
remove(ref(db, 'stock/demo'));

onAuthStateChanged(auth, user => {
    if (user) {
        initTooltips();
        initStatusIcons();
        initVersionControl();
        syncAiCommanderStatus();
        updateStatusIcon('stat-db', 'ok');

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

        onValue(ref(db, 'system/awayMode'), (snap) => {
            const val = snap.val();
            const banner = document.getElementById('awayBanner');
            const newState = val ? val.isAway : false;

            if (newState && !currentAwayState) {
                 queueSpeech("แอดมินพาลูกเข้านอนแล้ว");
                 Toast.fire({ title: '🌙 โหมดพาลูกนอนทำงาน', text: 'แอดมินไม่อยู่หน้าจอ ระบบจะสแตนบาย', icon: 'info' });
            } else if (!newState && currentAwayState) {
                 queueSpeech("ลูกหลับแล้ว แอดมินสแตนบาย");
            }
            currentAwayState = newState;
            if (currentAwayState) {
                if (banner) banner.style.display = 'flex';
                awayStartTime = val?.startTime || Date.now(); 
                if (!awayInterval) { updateAwayTimer(); awayInterval = setInterval(updateAwayTimer, 1000); }
            } else {
                if (banner) banner.style.display = 'none';
                if (awayInterval) { clearInterval(awayInterval); awayInterval = null; }
            }
        });
    }
});

const vp = document.getElementById('chat-viewport');
if (vp) {
    vp.addEventListener('scroll', function() { 
        const isAtBottom = vp.scrollHeight - vp.scrollTop - vp.clientHeight < 100;
        isUserScrolledUp = !isAtBottom;
        if(isAtBottom) document.getElementById('btn-scroll-down').style.display = 'none'; 
        else document.getElementById('btn-scroll-down').style.display = 'block'; 
    });
}
