// mind.js
import { $, makeBubble, makeTyping, scrollToBottom, wireAutosize, typeIntroLines } from "./ui.js";
import { startSnow, createMusicController } from "./scene.js";
import { createAIClient } from "./ai.js";

function hsRandPick(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

function hsGetGreetingIntentOnce(){
  const key = "hs_greet_state_v2";
  const saved = sessionStorage.getItem(key);
  if(saved) return saved;

  const pool = [
    // comunes
    "hs_greet_happy","hs_greet_happy","hs_greet_happy",
    "hs_greet_romantic","hs_greet_romantic","hs_greet_romantic",
    "hs_greet_flirty","hs_greet_flirty","hs_greet_flirty",
    "hs_greet_curious","hs_greet_curious",

    // especial 
    "hs_greet_poetic","hs_greet_poetic",

    // raros 
    "hs_greet_sad","hs_greet_sad",
    "hs_greet_broken","hs_greet_broken",
    "hs_greet_jealous_nivi",
    "hs_greet_jealous_venus"
  ];

  const picked = hsRandPick(pool);
  sessionStorage.setItem(key, picked);
  return picked;
}

// worker
const USE_REAL_AI = true;
const AI_DEBUG    = true;
const AI_ENDPOINT = "https://yukibou-whisper.bangboxs7.workers.dev/api/chat";


async function hsSafeAI(run, fallback){
  if(!USE_REAL_AI){
    if(fallback) await fallback();
    return false;
  }
  try{
    await run();
    return true;
  }catch(e){
    if(AI_DEBUG) console.error(e);
    if(fallback) await fallback();
    return false;
  }
}
const MUSIC_TRACKS = [
  { id:"m1", src:"assets/audio/bgm/m1.mp3", label:"M1" },
  { id:"m2", src:"assets/audio/bgm/m2.mp3", label:"M2" },
  { id:"m3", src:"assets/audio/bgm/m3.mp3", label:"M3" },
];

const SECRET_CODE = "701013";
const SECRET_TARGET_HTML = "secret.html";

const enterBtn   = $("enterBtn");
const introLayer = $("introLayer");
const chatLayer  = $("chatLayer");

const chatArea   = $("chatArea");
const sendBtn    = $("sendBtn");
const ta         = $("msgInput");

const paperMusicBtn = $("paperMusicBtn");
const paperLockBtn  = $("paperLockBtn");

let introTyper = null;

startSnow($("snowCanvas"));
const music = createMusicController(paperMusicBtn, MUSIC_TRACKS);

const autosize = wireAutosize(ta);

async function initIntroSticker(){
  const img = document.getElementById("introSticker");
  if(!img) return;

  // fallback
  const FALLBACK_SRC = img.getAttribute("src") || "assets/images/healing_station.png";

  function setSrcSafe(src){ img.src = src; }

  function preload(src){
    return new Promise((resolve, reject)=>{
      const im = new Image();
      im.onload = ()=>resolve(src);
      im.onerror = ()=>reject(new Error("image failed: " + src));
      im.src = src;
    });
  }

  function shuffle(arr){
    const a = arr.slice();
    for(let i=a.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function weightedPick(items, defaultWeight=1){
    const pool = items.map(it => Math.max(0, Number(it.weight ?? defaultWeight) || defaultWeight));
    const total = pool.reduce((a,b)=>a+b, 0);
    if(total <= 0) return items[0];
    let r = Math.random() * total;
    for(let i=0;i<items.length;i++){
      r -= pool[i];
      if(r <= 0) return items[i];
    }
    return items[items.length-1];
  }

  try{
    const res = await fetch("assets/data/stickers/stickers.json", { cache: "no-cache" });
    if(!res.ok) throw new Error("stickers.json not found: " + res.status);
    const cfg = await res.json();

    const basePath = (cfg.basePath || "assets/images/stickers/").toString();
    const fallback = (cfg.fallback && cfg.fallback.src) ? cfg.fallback.src : FALLBACK_SRC;

    const enabled = Array.isArray(cfg.stickers) ? cfg.stickers.filter(s => s && s.enabled !== false) : [];
    if(enabled.length === 0){
      setSrcSafe(fallback);
      console.warn("[Healing] stickers.json sin stickers enabled; usando fallback.");
      return;
    }

    const first = weightedPick(enabled, cfg.selection?.defaultWeight ?? 1);
    const rest = enabled.filter(s => s !== first);
    const candidates = [first, ...shuffle(rest)];

    const maxAttempts = Number(cfg.rules?.maxAttemptsBeforeFallback ?? 8);
    let attempts = 0;
    let finalSrc = null;

    function resolveSrc(stk){
      const s = (stk.src || "").toString();
      if(!s) return null;
      if(/^https?:\/\//i.test(s) || s.startsWith("/") || s.startsWith("assets/")) return s;
      return basePath + s;
    }

    for(const stk of candidates){
      if(attempts >= maxAttempts) break;
      attempts++;
      const src = resolveSrc(stk);
      if(!src) continue;
      try{
        await preload(src);
        finalSrc = src;
        break;
      }catch(e){
      }
    }

    setSrcSafe(finalSrc || fallback);

    if(!finalSrc){
      console.warn("[Healing] Sticker fallback usado: revisa rutas/404 en Network.");
    }
  }catch(e){
    setSrcSafe(FALLBACK_SRC);
    console.warn("[Healing] initIntroSticker falló:", e);
  }
}

enterBtn?.addEventListener("click", () => {
  if(introTyper) introTyper.stop();
  introLayer.style.opacity = "0";
  introLayer.style.transform = "scale(0.97)";
  introLayer.style.pointerEvents = "none";
  introLayer.setAttribute("aria-hidden","true");

  setTimeout(() => {
    chatLayer.style.opacity = "1";
    chatLayer.style.pointerEvents = "auto";
    chatLayer.setAttribute("aria-hidden", "false");

    bootMessage();
    scrollToBottom(chatArea);
    ta.focus();
  }, 750);
});

ta?.addEventListener("keydown", (e)=>{
  if(e.key === "Enter" && !e.shiftKey){
    e.preventDefault();
    sendMessage();
  }
});

async function loadIntroVerse(){
  const container = document.querySelector(".introLines");
  if(!container) return;

  try{
    const res = await fetch("assets/data/verses/intro.json", { cache: "no-store" });
    if(!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    if(!Array.isArray(data) || data.length === 0) return;

    const items = data.map((v, i) => {
      if(typeof v === "string") return { id: "s_" + i, text: v, weight: 1, tag: "suave" };
      if(v && typeof v === "object"){
        const text = String(v.text ?? "");
        const weight = Number(v.weight ?? 1);
        const tag = String(v.tag ?? "suave");
        const id = String(v.id ?? ("o_" + i));
        return { id, text, weight: isFinite(weight) && weight > 0 ? weight : 1, tag };
      }
      return { id: "x_" + i, text: "", weight: 1, tag: "suave" };
    }).filter(it => it.text.trim().length > 0);

    if(items.length === 0) return;

    const lastId = localStorage.getItem("nivalis_intro_last_id") || "";

    function weightedPick(excludeId){
      let total = 0;
      for(const it of items){
        if(items.length > 1 && it.id === excludeId) continue;
        total += it.weight;
      }
      let r = Math.random() * total;
      for(const it of items){
        if(items.length > 1 && it.id === excludeId) continue;
        r -= it.weight;
        if(r <= 0) return it;
      }
      return items[items.length - 1];
    }

    let chosen = weightedPick(lastId);
    if(items.length > 1 && chosen.id === lastId) chosen = weightedPick(lastId);

    localStorage.setItem("nivalis_intro_last_id", chosen.id);
    renderIntroFromVerse(String(chosen.text));
  }catch(err){
    console.error("No se pudo cargar intro.json:", err);
  }
}

function renderIntroFromVerse(verse){
  const container = document.querySelector(".introLines");
  if(!container) return;

  const lines = verse.split("\n").map(s => s.trim()).filter(Boolean);

  if(introTyper) introTyper.stop();
  introTyper = typeIntroLines(container, lines, {
    slots: 4,
    speed: 50,
    gapMs: 140,
  });
}

window.addEventListener("load", loadIntroVerse);
window.addEventListener("load", ()=>{

  if(chatLayer?.getAttribute("aria-hidden") !== "false"){
    try{ enterBtn?.focus(); }catch{}
  }
});

document.addEventListener("keydown", (e)=>{
  const t = e.target;
  const tag = (t && t.tagName) ? t.tagName.toLowerCase() : "";
  if(tag === "textarea" || tag === "input" || tag === "select") return;
  if(e.altKey || e.ctrlKey || e.metaKey) return;

  const introActive = (chatLayer?.getAttribute("aria-hidden") !== "false")
    && (introLayer && introLayer.style.pointerEvents !== "none");

  if(!introActive) return;

  if(e.key === "Enter" || e.code === "Space" || e.key === " "){
    e.preventDefault(); 
    enterBtn?.click();
  }
}, { passive:false });

introLayer?.addEventListener("click", (e)=>{
  if(e.target === enterBtn) return;
  if(introTyper && introTyper.typing) introTyper.skipAll();
});

let isBusy = false;
function setBusy(v){
  isBusy = v;
  sendBtn.style.opacity = v ? "0.5" : "1";
  sendBtn.style.pointerEvents = v ? "none" : "auto";
}

let booted = false;
function bootMessage(){
  if(booted) return;
  booted = true;

  hsSafeAI(
    () => hsBootHelloAI(),
    () => {
      hsSay("Estoy despierto… 🌷");
      hsSay("Escribe cuando quieras.");    }
  );
}

function hsSay(text){
  chatArea.appendChild(makeBubble("healing", text));
  scrollToBottom(chatArea);
}

function hsTyping(){
  const row = makeTyping();
  chatArea.appendChild(row);
  scrollToBottom(chatArea);
  return row;
}

let unlockRequested = false;
let secretUnlocked = (localStorage.getItem("nivalis_secret_unlocked") === "1");

function normalizeSecretInput(s){
  return (s || "").toString().trim().toLowerCase().replace(/\\s+/g, "");
}

function openSecret(){ window.location.href = SECRET_TARGET_HTML; }

function unlockSecret(){
  secretUnlocked = true;
  unlockRequested = false;
  localStorage.setItem("nivalis_secret_unlocked", "1");
}

function onSecretTrigger(){
  if(secretUnlocked){ openSecret(); return; }

  hsSafeAI(
    () => hsLockTeaseAI(),
    () => hsSay("Shhh… Aun no es el dia. hehe~")
  );

  unlockRequested = true;
}

paperLockBtn?.addEventListener("click", onSecretTrigger);
paperLockBtn?.addEventListener("keydown", (e)=>{
  if(e.key === "Enter" || e.key === " "){
    e.preventDefault();
    onSecretTrigger();
  }
});

async function handleSecretAttempt(userText){
  if(secretUnlocked) return false;

  const MIN_SECRET_DIGITS = 4;
  const MAX_SECRET_DIGITS = (typeof SECRET_CODE === "string" ? SECRET_CODE.length : 8);

  const raw = String(userText || "").trim();
  const hasDigits = /\d/.test(raw);

  const stripToDigits = (s)=> String(s||"").replace(/\D/g, "");
  const numericOnly = hasDigits && /^[\d\s\-_.\/\?]+$/.test(raw);
  const hasKey = /(c[oó]digo|code|password|pass|pw)/i.test(raw);

  let digits = "";

  if(numericOnly){
    digits = stripToDigits(raw);
  }else if(hasKey && hasDigits){
    const blocks = raw.match(/[\d][\d\s\-_.\/]*\d/g) || raw.match(/\d+/g) || [];
    let best = "";
    for(const b of blocks){
      const d = stripToDigits(b);
      if(d.length > best.length) best = d;
    }
    digits = best;
  }else{
    return false; 
  }

  const n = digits.length;
  if(n < MIN_SECRET_DIGITS || n > MAX_SECRET_DIGITS) return false;

  const attempt = digits;

  if(attempt === SECRET_CODE){
    await hsSafeAI(
      () => hsSecretTeaseAI({ attempt, outcome: "success" }),
      () => hsSay("ok.")
    );
    unlockSecret();
    return true;
  }

  if(!unlockRequested) return false;

  await hsSafeAI(
    () => hsSecretTeaseAI({ attempt, outcome: "wrong" }),
    () => hsSay("no.")
  );
  return true;
}

const ai = createAIClient({ endpoint: AI_ENDPOINT, debug: AI_DEBUG });
async function hsLockTeaseAI(){
  const typingRow = hsTyping();
  const row = makeBubble("healing", "");
  const bubble = row.firstChild;

  let shown = false;
  function showBubbleOnce(){
    if(shown) return;
    shown = true;
    typingRow.remove();
    chatArea.appendChild(row);
    scrollToBottom(chatArea);
  }

  try{
    await ai.replyStreaming({
    message: "[LOCK]",

    meta: { intent: "lock", mode: "lock" },
    onTypingDone: () => showBubbleOnce(),
    onDelta: (d) => { showBubbleOnce(); bubble.textContent += d; scrollToBottom(chatArea); },
    onFinal: (text) => { showBubbleOnce(); bubble.textContent = text || "…"; scrollToBottom(chatArea); }
    });
  }catch(e){
    try{ typingRow.remove(); }catch{}
    if(AI_DEBUG) console.error(e);
    throw e;
  }
}

async function hsBootHelloAI(){
  const typingRow = hsTyping();
  const row = makeBubble("healing", "");
  const bubble = row.firstChild;

  let shown = false;
  function showBubbleOnce(){
    if(shown) return;
    shown = true;
    typingRow.remove();
    chatArea.appendChild(row);
    scrollToBottom(chatArea);
  }
  const greetIntent = hsGetGreetingIntentOnce();

  try{
    await ai.replyStreaming({
    message: "[BOOT]",

    meta: { intent: greetIntent, mode: "boot" },
    onTypingDone: () => showBubbleOnce(),
    onDelta: (d) => { showBubbleOnce(); bubble.textContent += d; scrollToBottom(chatArea); },
    onFinal: (text) => { showBubbleOnce(); bubble.textContent = (text && text.trim()) ? text : "…"; scrollToBottom(chatArea); }
    });
  }catch(e){
    try{ typingRow.remove(); }catch{}
    if(AI_DEBUG) console.error(e);
    throw e;
  }
}

async function hsSecretTeaseAI({ attempt, outcome }){
  const typingRow = hsTyping();
  const row = makeBubble("healing", "");
  const bubble = row.firstChild;

  let shown = false;
  function showBubbleOnce(){
    if(shown) return;
    shown = true;
    typingRow.remove();
    chatArea.appendChild(row);
    scrollToBottom(chatArea);
  }
  const msg = (attempt && String(attempt).trim().length) ? String(attempt) : "[CODE]";

  try{
    await ai.replyStreaming({
      message: msg,

      meta: { intent: "code_attempt", mode: (outcome === "success" ? "secret_success" : "secret_fail") },
      onTypingDone: () => showBubbleOnce(),
      onDelta: (d) => { showBubbleOnce(); bubble.textContent += d; scrollToBottom(chatArea); },
      onFinal: (text) => { showBubbleOnce(); bubble.textContent = (text || "…"); scrollToBottom(chatArea); }
    });
    return bubble.textContent;
  }catch(e){
    try{ typingRow.remove(); }catch{}
    if(AI_DEBUG) console.error(e);
    throw e;
  }
}

async function hsReplyMock(userText){
  const t = hsTyping();
  setTimeout(()=>{
    t.remove();
    hsSay("…");
  }, 520);
}

async function hsReplyAI(userText){

  const typingRow = hsTyping();

  const row = makeBubble("healing", "");
  const bubble = row.firstChild;

  let shown = false;
  function showBubbleOnce(){
    if(shown) return;
    shown = true;
    typingRow.remove();
    chatArea.appendChild(row);
    scrollToBottom(chatArea);
  }

const trimmed = (userText || "").trim();
const isOnlyNumbers = /^\d+$/.test(trimmed);
const intent = isOnlyNumbers ? "num_only" : "chat";
const mode = "chat";

    try{
    await ai.replyStreaming({
    message: trimmed,

    meta: { intent, mode },
    onTypingDone: () => showBubbleOnce(),
    onDelta: (d) => { showBubbleOnce(); bubble.textContent += d; scrollToBottom(chatArea); },
    onFinal: (text) => { showBubbleOnce(); bubble.textContent = text; scrollToBottom(chatArea); }
    });
  }catch(e){
    try{ typingRow.remove(); }catch{}
    if(AI_DEBUG) console.error(e);
    throw e;
  }
}

async function hsReply(userText){
  await hsSafeAI(
    () => hsReplyAI(userText),
    () => hsReplyMock(userText)
  );
}

sendBtn?.addEventListener("click", sendMessage);

async function sendMessage(){
  if(isBusy) return;
  const userText = ta.value.trim();
  if(!userText) return;

  chatArea.appendChild(makeBubble("user", userText));
  ta.value = "";
  autosize();
  scrollToBottom(chatArea);

  setBusy(true);
  try{
    const consumed = await handleSecretAttempt(userText);
    if(!consumed){
      await hsReply(userText);
    }
  }finally{
    setBusy(false);
  }
}

(function(){
  const hole = paperLockBtn;
  if(!hole) return;

  let pressTimer = null;

  function resetAll(){
    localStorage.removeItem("nivalis_secret_unlocked");
    localStorage.removeItem("nivalis_music_index");
    try{ music.pause(); }catch{}
    console.warn("[RESET] Estado limpiado (solo pruebas)");
    const t = hsTyping();
    setTimeout(()=>{
      t.remove();
      hsSay("shhh…");
    }, 420);
  }

  hole.addEventListener("pointerdown", ()=>{ pressTimer = setTimeout(resetAll, 1600); });
  hole.addEventListener("pointerup", ()=>{ if(pressTimer) clearTimeout(pressTimer); pressTimer=null; });
  hole.addEventListener("pointerleave", ()=>{ if(pressTimer) clearTimeout(pressTimer); pressTimer=null; });
})();

initIntroSticker();
