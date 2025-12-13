import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getDatabase, ref, set, update, remove, onValue, get, serverTimestamp, query, orderByChild, runTransaction } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

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

// --- SWAL OVERRIDE ---
if (window.Swal) {
    window.Swal = window.Swal.mixin({
        heightAuto: false, 
        scrollbarPadding: false 
    });
}

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
let lastScrollTimestamp = 0;
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

// --- AUDIO SYSTEM ---
function unlockAudio() {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
            const u = new SpeechSynthesisUtterance(" ");
            synth.speak(u);
        });
    }
}
document.addEventListener('click', () => { unlockAudio(); }, { once: true });

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

window.testVoice = () => {
    queueSpeech("ทดสอบเสียง หนึ่ง สอง สาม สี่ ห้า");
};

function playDing() { if(!isSoundOn) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); o.frequency.setValueAtTime(800, audioCtx.currentTime); o.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime+0.1); g.gain.setValueAtTime(0.3, audioCtx.currentTime); g.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime+0.1); o.start(); o.stop(audioCtx.currentTime+0.1); }
function playCancel() { if(!isSoundOn) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type='sawtooth'; o.connect(g); g.connect(audioCtx.destination); o.frequency.setValueAtTime(150, audioCtx.currentTime); g.gain.setValueAtTime(0.2, audioCtx.currentTime); o.start(); o.stop(audioCtx.currentTime+0.3); }
setInterval(() => { if (!synth.speaking && speechQueue.length > 0 && !isSpeaking) processQueue(); }, 1000);

// --- HELPER FUNCTIONS DEFINITIONS ---
// Define this BEFORE it is called
function syncAiCommanderStatus() {
    onValue(ref(db, 'system/aiCommander'), (snap) => {
        const commanderId = snap.val();
        const btn = document.getElementById('btnAICommander');
        if (commanderId === myDeviceId) { isAiCommander = true; btn.innerHTML = '🤖 AI: เปิด (Commander)'; btn.className = 'btn btn-ai active'; } 
        else if (commanderId) { isAiCommander = false; btn.innerHTML = '🤖 AI: ปิด (เครื่องอื่นคุม)'; btn.className = 'btn btn-ai remote'; } 
        else { isAiCommander = false; btn.innerHTML = '🤖 AI: ปิด'; btn.className = 'btn btn-ai inactive'; }
    });
}

// --- UI FUNCTIONS ---
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

window.renderDashboardTable = () => {
    const dashboard = document.querySelector('.dashboard-overlay');
    const scrollY = dashboard ? dashboard.scrollTop : 0; 

    const tbody = document.getElementById('shipping-body'); 
    if(tbody) {
        tbody.innerHTML = '';
        const userOrders = {};
        
        Object.keys(stockData).forEach(num => {
            const item = stockData[num]; const uid = item.uid;
            if (!userOrders[uid]) userOrders[uid] = { name: item.owner, items: [], totalPrice: 0, uid: uid };
            const price = item.price ? parseInt(item.price) : 0;
            userOrders[uid].items.push({ num: num, price: price }); userOrders[uid].totalPrice += price;
        });

        let index = 1; 
        for (const uid in userOrders) {
            const order = userOrders[uid]; 
            let custData = savedNames[uid] || { nick: order.name };
            
            const tr = document.createElement('tr');
            const itemStr = order.items.map(i => '#' + i.num + (i.price > 0 ? '('+i.price+')' : '')).join(', ');
            
            tr.innerHTML = `<td>${index++}</td><td><input class="edit-input" value="${custData.nick||order.name}" onchange="window.updateNickSilent('${uid}', this.value)" placeholder="พิมพ์ชื่อแล้ว Enter"></td><td>${itemStr}</td>`;
            tbody.appendChild(tr);
        }
        
        if(dashboard) dashboard.scrollTop = scrollY;
    }
};

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

// --- CHAT RENDERING ---
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

// --- LOGIC ---
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
                processCancel(targetId, isAdmin ? 'แอดมินยกเลิก' : 'ว่างแล้วค่ะ');
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
        set(ref(db, `stock/${currentVideoId}/${num}`), newData).then(() => queueSpeech(`เบอร์ ${num} หลุดจอง คุณ ${next.owner} ได้สิทธิ์`));
    } else {
        remove(ref(db, `stock/${currentVideoId}/${num}`)).then(() => { playCancel(); if(reason) queueSpeech(reason); });
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
    
    // Fix 2: Restore scroll position
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
    
    // NEW ORDER HIGHLIGHT (GOLDEN)
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
        
        // AUTO SCROLL LOGIC
        if (!isFirstLoad) {
            const keys = Object.keys(val);
            for (const key of keys) {
                const newItem = val[key];
                const oldItem = stockData[key];
                
                // Check if newly occupied
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

// --- INTERACTIVE WINDOW FUNCTIONS ---
window.toggleDropdown = () => { document.getElementById("toolsDropdown").classList.toggle("show"); };
window.addEventListener('click', (e) => {
    if (!e.target.closest('.btn-sim')) {
        var dropdowns = document.getElementsByClassName("dropdown-content");
        for (var i = 0; i < dropdowns.length; i++) {
            var openDropdown = dropdowns[i];
            if (openDropdown.classList.contains('show')) {
                openDropdown.classList.remove('show');
            }
        }
    }
});

window.askAiKey = () => { Swal.fire({ title: 'ตั้งค่า Gemini API Key', html: '<a href="https://aistudio.google.com/" target="_blank" style="color:#29b6f6">กดขอ Key ฟรีที่นี่</a>', input: 'text', inputValue: geminiApiKey, footer: geminiApiKey ? '<span style="color:lime">✅ มี Key อยู่ในเครื่องแล้ว</span>' : '' }).then(res => { if (res.value) { geminiApiKey = res.value.trim(); localStorage.setItem('geminiApiKey', geminiApiKey); Swal.fire('บันทึกแล้ว', '', 'success'); } }); };

window.adjustZoom = (n) => { currentFontSize+=n; document.documentElement.style.setProperty('--chat-size', currentFontSize+'px'); };
window.adjustGridZoom = (n) => { currentGridSize+=n; document.documentElement.style.setProperty('--grid-size', currentGridSize+'em'); };

window.filterHistory = () => {
    const input = document.getElementById('historySearchInput');
    const filter = input.value.toUpperCase();
    const ul = document.getElementById("history-list");
    const li = ul.getElementsByTagName('li');
    for (let i = 0; i < li.length; i++) {
        const txtValue = li[i].textContent || li[i].innerText;
        if (txtValue.toUpperCase().indexOf(filter) > -1) { li[i].style.display = ""; } 
        else { li[i].style.display = "none"; }
    }
};

window.handleStockClick = (num) => {
    const current = stockData[num];
    
    // Case 1: Vacant Item
    if (!current || !current.owner) {
        const currentPrice = current && current.price ? current.price : '';
        Swal.fire({
            title: `เบอร์ ${num}`,
            text: 'ใส่ชื่อเพื่อจอง หรือ ใส่ตัวเลขเพื่อตั้งราคา',
            input: 'text',
            inputValue: currentPrice,
            showCancelButton: true,
            confirmButtonText: 'บันทึก',
            cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                const val = result.value.trim();
                if (!val) return;

                if (/^\d+$/.test(val)) {
                    const updates = {};
                    if (!stockData[num]) {
                        updates[`stock/${currentVideoId}/${num}`] = { price: val, source: 'manual' }; 
                    } else {
                        updates[`stock/${currentVideoId}/${num}/price`] = val;
                    }
                    update(ref(db), updates);
                } else {
                    processOrder(num, val, 'manual-'+Date.now(), 'manual');
                }
            }
        });
        return;
    }

    // Case 2: Sold Item
    if (current) { 
        let queueHtml = '';
        if (current.queue && current.queue.length > 0) {
            queueHtml = '<div style="margin-top:10px; text-align:left; background:#eee; color:#000; padding:10px; border-radius:6px; border:1px solid #ccc;"><strong>คิวต่อ:</strong><ul style="padding-left:0; margin:10px 0; list-style:none;">';
            current.queue.forEach((q, idx) => {
                queueHtml += `<li style="background:#fff; padding:8px; margin-bottom:4px; border-radius:4px; display:flex; justify-content:space-between; align-items:center; border:1px solid #ddd; font-size:0.95em;">
                    <span><strong style="color:#d32f2f;">${idx+1}.</strong> ${q.owner}</span>
                    <div>
                        <button onclick="window.moveQueueUp(${num}, ${idx})" style="background:#2196f3; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.8em; margin-right:5px;">▲</button>
                        <button onclick="window.editQueueName(${num}, ${idx})" style="background:#ff9800; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.8em; margin-right:5px;">✎</button>
                        <button onclick="window.removeQueue(${num}, ${idx})" style="background:#ff5252; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.8em;">ลบ</button>
                    </div>
                </li>`;
            });
            queueHtml += '</ul></div>';
        }
        Swal.fire({ 
            title: `เบอร์ ${num}`, 
            html: `<div style="font-size:1.2em; color:#00e676; margin-bottom:10px;">${current.owner}</div><div style="display:flex; gap:5px; justify-content:center; flex-wrap:wrap;"><button onclick="window.doAction(${num}, 'edit')" class="swal2-confirm swal2-styled" style="background:#1976d2; margin:0;">แก้ชื่อ</button> <button onclick="window.doAction(${num}, 'price')" class="swal2-confirm swal2-styled" style="background:#555; margin:0;">แก้ราคา</button> <button onclick="window.doAction(${num}, 'cancel')" class="swal2-confirm swal2-styled" style="background:#d32f2f; margin:0;">ยกเลิกจอง</button></div>${queueHtml}`, 
            showConfirmButton: false 
        }); 
    }
};

window.removeQueue = (num, idx) => {
    const current = stockData[num];
    if (current && current.queue) {
        const newQ = [...current.queue];
        newQ.splice(idx, 1);
        set(ref(db, `stock/${currentVideoId}/${num}/queue`), newQ).then(() => { Swal.close(); window.handleStockClick(num); });
    }
};

window.moveQueueUp = (num, idx) => {
    if (idx === 0) return; 
    const current = stockData[num];
    if (current && current.queue) {
        const newQ = [...current.queue];
        const temp = newQ[idx];
        newQ[idx] = newQ[idx-1];
        newQ[idx-1] = temp;
        set(ref(db, `stock/${currentVideoId}/${num}/queue`), newQ).then(() => { Swal.close(); window.handleStockClick(num); });
    }
};

window.editQueueName = (num, idx) => {
    const current = stockData[num];
    if (current && current.queue) {
        Swal.fire({
            title: 'แก้ไขชื่อในคิว',
            input: 'text',
            inputValue: current.queue[idx].owner,
            showCancelButton: true
        }).then((result) => {
            if (result.value) {
                    const updates = {};
                    updates[`stock/${currentVideoId}/${num}/queue/${idx}/owner`] = result.value;
                    update(ref(db), updates).then(() => { Swal.close(); window.handleStockClick(num); });
            }
        });
    }
};

window.doAction = (num, action) => {
    Swal.close();
    if (action === 'edit') { Swal.fire({input: 'text', inputValue: stockData[num].owner, title: 'แก้ไขชื่อ (เฉพาะรายการนี้)'}).then(r => { if (r.value) { update(ref(db, `stock/${currentVideoId}/${num}`), {owner: r.value}); } }); } 
    else if (action === 'price') Swal.fire({input: 'number'}).then(r => { if(r.value) update(ref(db, `stock/${currentVideoId}/${num}`), {price: r.value}); });
    else if (action === 'cancel') processCancel(num, 'แอดมินลบรายการ');
};

window.fixDatabase = async () => {
    const result = await Swal.fire({ title: 'จัดระเบียบฐานข้อมูล', text: "ระบบจะย้ายข้อมูล 'พร้อมส่ง' และ 'ที่อยู่' ไปจัดเก็บแยกตามไลฟ์ และลบข้อมูลขยะออกจากชื่อเล่น เพื่อให้แอปเร็วขึ้น", icon: 'warning', showCancelButton: true, confirmButtonColor: '#3085d6', cancelButtonColor: '#d33', confirmButtonText: '🚀 เริ่มจัดระเบียบ' });
    if (!result.isConfirmed) return;
    Swal.fire({ title: 'กำลังทำงาน...', didOpen: () => { Swal.showLoading() } });
    try {
        const nickSnap = await get(ref(db, 'nicknames'));
        const updates = {};
        let count = 0;
        nickSnap.forEach(function(child) {
            const uid = child.key; const val = child.val();
            if (typeof val === 'object') {
                if (val.nick) { updates[`nicknames/${uid}`] = { nick: val.nick }; } else { updates[`nicknames/${uid}`] = null; }
                if (val.readyToShip || val.address) {
                    let targetVid = currentVideoId; 
                    const shippingPath = `shipping/${targetVid}/${uid}`;
                    const shippingPayload = {};
                    if (val.readyToShip) shippingPayload.ready = true;
                    if (val.address) shippingPayload.address = val.address;
                    if (Object.keys(shippingPayload).length > 0) { updates[shippingPath] = shippingPayload; }
                }
                count++;
            }
        });
        if(count > 0) { await update(ref(db), updates); Swal.fire('สำเร็จ', 'จัดระเบียบลูกค้า ' + count + ' ราย เรียบร้อยแล้ว', 'success'); } else { Swal.fire('ปกติ', 'ข้อมูลเรียบร้อยดีอยู่แล้ว', 'info'); }
    } catch(e) { Swal.fire('Error', e.message, 'error'); }
};

window.clearAllStock = () => { Swal.fire({title:'ล้างทั้งหมด?', showCancelButton:true}).then(r => { if(r.isConfirmed) remove(ref(db, `stock/${currentVideoId}`)); }); };

window.toggleAICommander = () => {
    if (!geminiApiKey) return Swal.fire({icon:'warning', title:'ต้องใส่ API Key ก่อน'});
    isAiCommander = !isAiCommander;
    const btn = document.getElementById('btnAICommander');
    if (isAiCommander) { btn.innerHTML = '🤖 AI: เปิด (Commander)'; btn.className = 'btn btn-ai active'; queueSpeech("เปิดระบบเอไอคอมมานเดอร์"); } 
    else { btn.innerHTML = '🤖 AI: ปิด'; btn.className = 'btn btn-ai inactive'; }
};

window.openTestMenu = () => {
    Swal.fire({ title: 'เครื่องมือ', showDenyButton: true, confirmButtonText: isSimulating ? '🛑 หยุดจำลอง' : '⚡ จำลองแชท', denyButtonText: '🔑 ตั้งค่า API Key' }).then(r => {
        if (r.isConfirmed) window.toggleSimulation();
        else if (r.isDenied) window.askAiKey();
    });
};

window.toggleSimulation = () => {
    isSimulating = !isSimulating; const menu = document.getElementById('menuSim');
    if (isSimulating) {
        menu.innerText = "🛑 หยุดจำลอง";
        const size = parseInt(document.getElementById('stockSize').value);
        simIntervalId = setInterval(() => {
            const rNum = Math.floor(Math.random()*size)+1;
            processMessage({ id: 'sim-'+Date.now(), snippet: { displayMessage: `F${rNum}` }, authorDetails: { channelId: 'sim', displayName: 'SimUser', profileImageUrl: '' } });
        }, 1500);
    } else { menu.innerText = "⚡ เริ่มจำลองแชท"; clearInterval(simIntervalId); }
};

window.openHistory = () => { document.getElementById('history-modal').style.display = 'flex'; loadHistoryList(); };
window.closeHistory = () => { document.getElementById('history-modal').style.display = 'none'; };
async function loadHistoryList() {
    const list = document.getElementById('history-list'); list.innerHTML = 'Loading...';
    const snapshot = await get(ref(db, 'history'));
    list.innerHTML = ''; const items = []; 
    snapshot.forEach(c => items.push({ id: c.key, ...c.val() }));
    items.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
    
    const displayItems = items.slice(0, 100); 

    displayItems.forEach(i => {
        const li = document.createElement('li'); li.className = 'history-item';
        li.innerHTML = `<div><span class="hist-date">${formatThaiDate(i.timestamp||0)}</span> ${i.title||i.id}</div> <button class="btn btn-dark" onclick="window.deleteHistory('${i.id}')">🗑️</button>`;
        li.querySelector('div').onclick = () => { window.closeHistory(); document.getElementById('vidInput').value = i.id; window.toggleConnection(); };
        list.appendChild(li);
    });
}
window.deleteHistory = (vid) => { Swal.fire({title:'ลบประวัติ?', showCancelButton:true}).then(r=>{ if(r.isConfirmed) remove(ref(db, 'history/'+vid)).then(()=>loadHistoryList()); }); };
window.openDashboard = () => { document.getElementById('dashboard').style.display = 'flex'; window.renderDashboardTable(); };
window.closeDashboard = () => { document.getElementById('dashboard').style.display = 'none'; };

window.toggleConnection = () => {
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
        document.getElementById('status-dot').className = "status-dot online";
        if (item.liveStreamingDetails?.activeLiveChatId) {
            activeChatId = item.liveStreamingDetails.activeLiveChatId; chatToken = ''; loadChat(); updateViewerCount(vid); viewerIntervalId = setInterval(()=>updateViewerCount(vid), 15000);
        } else { activeChatId = null; throw new Error("No Live Chat"); }
    } catch(e) { console.error(e); isConnected = true; setLoading(false); isConnecting = false; document.getElementById('btnConnect').innerText = "DISCONNECT"; document.getElementById('btnConnect').className = "btn btn-dark"; document.getElementById('status-dot').className = "status-dot online"; }
}

async function smartFetch(url) {
    try {
        updateStatusIcon('stat-api', 'ok'); let res = await fetch(url + "&key=" + API_KEYS[currentKeyIdx]); let data = await res.json();
        if (data.error) { if (currentKeyIdx < API_KEYS.length - 1) { currentKeyIdx++; return smartFetch(url); } else throw new Error(data.error.message); }
        return data;
    } catch(e) { updateStatusIcon('stat-api', 'err'); throw e; }
}

// --- INIT LISTENERS ---
signInAnonymously(auth);
remove(ref(db, 'stock/demo'));
syncAiCommanderStatus();

onAuthStateChanged(auth, user => {
    if (user) {
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
