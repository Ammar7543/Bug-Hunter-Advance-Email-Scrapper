'use strict';
// ===== BOUNTY HUNTER v5.0 BACKGROUND =====

const K = {
  EMAILS:'bh_emails', STATS:'bh_stats', QUEUE:'bh_queue',
  GMAIL:'bh_user_gmail', TEMPLATE:'bh_template',
  BLACKLIST:'bh_blacklist', SCAN_MODE:'bh_scan_mode',
  VISITED:'bh_visited_urls'   // <-- PERSISTED visited set
};

const EMAIL_RE = /[a-zA-Z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+\/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}/g;
const DEEP_PATHS = ['/security','/security.txt','/.well-known/security.txt',
  '/responsible-disclosure','/bug-bounty','/contact','/contact-us','/about','/team','/support','/legal'];
const HV_WORDS = ['bug','bugbounty','bug-bounty','vulnerability','responsible disclosure',
  'security','pentest','hackerone','bugcrowd','security.txt','security contact'];
const CURRENCY_RE = /[\$€£¥₹₿]|\b(USD|EUR|GBP|reward|bounty|paid|payout)\b/i;
const PLATFORM_RE = /bugcrowd\.com|hackerone\.com|intigriti\.com|yeswehack\.com|synack\.com/i;
const JUNK_TLD = new Set(['png','jpg','gif','svg','css','js','woff','ttf','ico','zip','mp4','webp','map','ts']);
const JUNK_LOC = new Set(['noreply','no-reply','donotreply','mailer-daemon','postmaster','webmaster','bounce','unsubscribe','abuse','spam']);
const JUNK_DOM = new Set(['example.com','test.com','sentry.io','wixpress.com','schema.org','w3.org','cloudflare.com']);
const SOCIAL   = new Set(['facebook.com','fb.com','instagram.com','linkedin.com','twitter.com','x.com',
  'tiktok.com','youtube.com','pinterest.com','snapchat.com','reddit.com']);
const OPEN_PLATFORM_DOMAINS = [
  'bugcrowd.com','hackerone.com','intigriti.com','yeswehack.com','synack.com',
  'openbugbounty.org','cobalt.io','vulnerability.gov','disclose.io'
];

let queue=[], visitedUrls=new Set(), processing=false, paused=false, stopped=false;
let userEmailSet=new Set();
let blacklist={domains:new Set(),emails:new Set(),social:false,userGmail:true,openPlatforms:true};
let totalQueued=0, startTime=0, scanMode='domain';

const sGet=k=>new Promise(r=>chrome.storage.local.get(k,r));
const sSet=o=>new Promise(r=>chrome.storage.local.set(o,r));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function init() {
  const d = await sGet([K.EMAILS,K.STATS,K.QUEUE,K.GMAIL,K.BLACKLIST,K.SCAN_MODE,K.VISITED]);
  if (d[K.GMAIL]) buildGmailSet(d[K.GMAIL]);
  if (d[K.SCAN_MODE]) scanMode = d[K.SCAN_MODE];
  if (d[K.BLACKLIST]) {
    const bl=d[K.BLACKLIST];
    blacklist.domains  = new Set(bl.domains||[]);
    blacklist.emails   = new Set(bl.emails||[]);
    blacklist.social   = bl.social===true;
    blacklist.userGmail= bl.userGmail!==false;
    blacklist.openPlatforms = bl.openPlatforms!==false;
    if (blacklist.openPlatforms) OPEN_PLATFORM_DOMAINS.forEach(d=>blacklist.domains.add(d));
  }
  // Restore persisted visited URLs so we never re-scrape across sessions
  if (d[K.VISITED] && Array.isArray(d[K.VISITED])) {
    visitedUrls = new Set(d[K.VISITED]);
  }
  if (d[K.QUEUE] && d[K.QUEUE].length) {
    queue = d[K.QUEUE];
    queue.forEach(i=>visitedUrls.add(i.url));
    totalQueued = queue.length;
    processQueue();
  }
}
init();

function buildGmailSet(email) {
  if (!email) return;
  const e = email.toLowerCase().trim();
  userEmailSet.clear(); userEmailSet.add(e);
  if (e.endsWith('@gmail.com')||e.endsWith('@googlemail.com')) {
    const [loc] = e.split('@');
    const nodots = loc.replace(/\./g,'');
    const base   = loc.split('+')[0];
    userEmailSet.add(`${nodots}@gmail.com`);
    userEmailSet.add(`${base}@gmail.com`);
    userEmailSet.add(`${base.replace(/\./g,'')}@gmail.com`);
    userEmailSet.add(`${loc}@googlemail.com`);
    userEmailSet.add(`${nodots}@googlemail.com`);
  }
}

function isUserEmail(email) {
  if (!blacklist.userGmail||!userEmailSet.size) return false;
  const e=email.toLowerCase().trim();
  if (userEmailSet.has(e)) return true;
  const [eloc,edom]=e.split('@'); if (!eloc||!edom) return false;
  for (const u of userEmailSet) {
    const [uloc,udom]=u.split('@'); if (!uloc||!udom) continue;
    if ((edom==='gmail.com'||edom==='googlemail.com')&&(udom==='gmail.com'||udom==='googlemail.com')) {
      if (eloc.replace(/\./g,'').split('+')[0]===uloc.replace(/\./g,'').split('+')[0]) return true;
    }
  }
  return false;
}

function isBlacklisted(email, url) {
  const e=email.toLowerCase().trim();
  if (isUserEmail(e)) return true;
  if (blacklist.emails.has(e)) return true;
  let host=''; try { host=new URL(url).hostname.toLowerCase().replace(/^www\./,''); } catch(x){}
  if (blacklist.domains.has(host)) return true;
  if (blacklist.social&&SOCIAL.has(host)) return true;
  const edom=e.split('@')[1]||'';
  if (blacklist.domains.has(edom)) return true;
  if (blacklist.social&&SOCIAL.has(edom)) return true;
  return false;
}

function validEmail(e) {
  if (!e||e.length<6||e.length>254||!e.includes('@')) return false;
  const [loc,dom]=e.split('@'); if (!loc||!dom||!dom.includes('.')) return false;
  const tld=dom.split('.').pop().toLowerCase();
  if (JUNK_TLD.has(tld)) return false;
  if (JUNK_LOC.has(loc.toLowerCase())) return false;
  if (JUNK_DOM.has(dom.toLowerCase())) return false;
  if (loc.length>64||/\.{2,}/.test(e)) return false;
  if (!/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(e)) return false;
  return true;
}

function isHighValue(email,html,url) {
  return HV_WORDS.some(w=>(email+' '+url+' '+(html||'').slice(0,5000)).toLowerCase().includes(w));
}
function isPolicyPage(url) {
  return ['/security','/disclosure','/bug-bounty','/vulnerability','security.txt','well-known'].some(k=>url.toLowerCase().includes(k));
}

function deob(text) {
  return text
    .replace(/&#64;/gi,'@').replace(/&#x40;/gi,'@').replace(/%40/g,'@').replace(/\\u0040/gi,'@')
    .replace(/\[\s*at\s*\]/gi,'@').replace(/\(\s*at\s*\)/gi,'@').replace(/\{\s*at\s*\}/gi,'@')
    .replace(/\[\s*dot\s*\]/gi,'.').replace(/\(\s*dot\s*\)/gi,'.').replace(/\{\s*dot\s*\}/gi,'.');
}

function extractEmails(html) {
  const found = new Set();
  const mtRe = /href=["']mailto:([^"'?\s]+)/gi;
  let m;
  while ((m = mtRe.exec(html)) !== null) {
    try {
      const e = decodeURIComponent(m[1]).toLowerCase().trim();
      if (validEmail(e)) found.add(e);
    } catch(x) {}
  }
  const stripped = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<[^>]+>/g,' ');
  for (const src of [stripped, html]) {
    const d = deob(src);
    EMAIL_RE.lastIndex = 0;
    while ((m = EMAIL_RE.exec(d)) !== null) {
      const e = m[0].toLowerCase().trim();
      if (validEmail(e)) found.add(e);
    }
  }
  return [...found];
}

function extractTitle(html) {
  const m=(html||'').match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  return m?m[1].trim():'';
}

async function fetchHTML(url,timeout=12000) {
  for (let a=0;a<2;a++) {
    try {
      const ctrl=new AbortController(), tid=setTimeout(()=>ctrl.abort(),timeout);
      const res=await fetch(url,{signal:ctrl.signal,headers:{
        'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':'text/html,application/xhtml+xml,*/*;q=0.8','Accept-Language':'en-US,en;q=0.9'},redirect:'follow'});
      clearTimeout(tid);
      if (!res.ok) return null;
      const ct=res.headers.get('content-type')||'';
      if (!ct.includes('html')&&!ct.includes('text')) return null;
      return await res.text();
    } catch(e) { if(a===0) await sleep(400); }
  }
  return null;
}

// Persist visited URLs so results survive extension close/reopen
async function persistVisited() {
  // Store only last 5000 to avoid bloating storage
  const arr = [...visitedUrls].slice(-5000);
  await sSet({[K.VISITED]: arr});
}

async function storeEmails(emails, url, title, searchPage, html, isPaid) {
  if (!emails.length) return 0;
  const d=await sGet([K.EMAILS,K.STATS]);
  const stored=d[K.EMAILS]||[];
  const stats=d[K.STATS]||{total:0,domains:0,highValue:0,pages:0,paid:0};

  const seenEmails = new Set(stored.map(e=>e.email));
  const hv=isHighValue('',html||'',url), isPol=isPolicyPage(url), now=new Date().toISOString();
  let added=0;

  for (const email of emails) {
    const e=email.toLowerCase().trim();
    if (!validEmail(e)||isBlacklisted(e,url)) continue;
    if (seenEmails.has(e)) continue;
    seenEmails.add(e);
    const hvEmail=hv||isHighValue(e,'',url);
    stored.push({email:e,url,title:title||'',isPolicy:isPol,isHighValue:hvEmail,isPaid:isPaid||false,searchPage:searchPage||0,timestamp:now});
    if (hvEmail) stats.highValue=(stats.highValue||0)+1;
    if (isPaid)  stats.paid=(stats.paid||0)+1;
    added++;
  }

  if (added) {
    stats.total=stored.length;
    stats.domains=new Set(stored.map(e=>{try{return new URL(e.url).hostname;}catch(x){return e.url;}})).size;
    stats.pages=(stats.pages||0)+1;
    await sSet({[K.EMAILS]:stored,[K.STATS]:stats});
    try{chrome.runtime.sendMessage({type:'EMAILS_UPDATED',added,stats});}catch(x){}
    showNotif(added,url,isPol||hv);
  }
  return added;
}

function showNotif(n,url,isHV) {
  try {
    chrome.notifications.create(`bh_${Date.now()}`,{type:'basic',iconUrl:'icons/icon48.png',
      title:`⬡ +${n} Email${n>1?'s':''} Found${isHV?' ⭐':''}`,message:`From: ${new URL(url).hostname}`,priority:2});
  } catch(x){}
}

async function scrapeItem(item) {
  const {url,searchPage}=item;
  let origin; try{origin=new URL(url).origin;}catch(e){return;}
  try {
    const host=new URL(url).hostname.toLowerCase().replace(/^www\./,'');
    if (blacklist.domains.has(host)||(blacklist.social&&SOCIAL.has(host))) return;
  } catch(x){}
  notifyProgress(url);

  const html=await fetchHTML(url);
  let mainEmails = [];
  if (html) {
    if (PLATFORM_RE.test(html.slice(0,15000))) {
      try{const host=new URL(url).hostname.replace(/^www\./,'');blacklist.domains.add(host);await saveBlacklist();}catch(x){}
      return;
    }
    const isPaid=CURRENCY_RE.test(html.slice(0,15000));
    mainEmails = extractEmails(html);
    await storeEmails(mainEmails,url,extractTitle(html),searchPage,html,isPaid);
  }

  if (scanMode==='domain' && mainEmails.length===0) {
    const quickPaths = ['/contact','/contact-us','/about','/security'];
    for (const path of quickPaths) {
      if (stopped) return;
      const sib = origin + path;
      if (visitedUrls.has(sib)) continue;
      visitedUrls.add(sib);
      const sibHtml = await fetchHTML(sib, 7000);
      if (!sibHtml) { await sleep(150); continue; }
      const sibEmails = extractEmails(sibHtml);
      if (sibEmails.length > 0) {
        const isPaid = CURRENCY_RE.test(sibHtml.slice(0,10000));
        await storeEmails(sibEmails, sib, extractTitle(sibHtml)||path, searchPage, sibHtml, isPaid);
        break;
      }
      await sleep(150);
    }
  }

  if (scanMode==='deep') {
    const paths=DEEP_PATHS.filter(p=>{const s=origin+p;if(visitedUrls.has(s))return false;visitedUrls.add(s);return true;});
    for (let i=0;i<paths.length;i+=3) {
      if (stopped) return;
      await Promise.all(paths.slice(i,i+3).map(async path=>{
        const sub=origin+path, subHtml=await fetchHTML(sub,8000);
        if (subHtml) {
          const isPaid=CURRENCY_RE.test(subHtml.slice(0,10000));
          const em=extractEmails(subHtml);
          if(em.length) await storeEmails(em,sub,extractTitle(subHtml)||path,searchPage,subHtml,isPaid);
        }
      }));
      await sleep(150);
    }
  }
}

async function notifyProgress(currentUrl) {
  const d=await sGet(K.STATS), st=d[K.STATS]||{};
  const done=totalQueued-queue.length, elapsed=startTime?(Date.now()-startTime)/1000:1;
  const eta=elapsed>0?Math.round(queue.length/Math.max(done/elapsed,0.1)):0;
  try{chrome.runtime.sendMessage({type:'SCRAPING_PROGRESS',currentDomain:new URL(currentUrl).hostname,
    done,total:totalQueued,remaining:queue.length,emailsFound:st.total||0,highValue:st.highValue||0,etaSeconds:eta});}catch(x){}
}

async function processQueue() {
  if (processing) return;
  processing=true; stopped=false; startTime=Date.now();
  const BATCH=scanMode==='deep'?2:5;
  while (queue.length>0&&!stopped) {
    if (paused){await waitResume();}
    const batch=queue.splice(0,BATCH);
    await sSet({[K.QUEUE]:queue});
    await Promise.all(batch.map(item=>scrapeItem(item).catch(e=>console.warn('[BH]',e.message))));
    // Persist visited URLs after each batch
    await persistVisited();
    await sleep(scanMode==='domain'?200:400);
  }
  processing=false; await sSet({[K.QUEUE]:[]});
  try{chrome.runtime.sendMessage({type:'SCRAPING_COMPLETE'});}catch(x){}
}

async function waitResume(){while(paused&&!stopped)await sleep(300);}

async function saveBlacklist() {
  await sSet({[K.BLACKLIST]:{
    domains:[...blacklist.domains],emails:[...blacklist.emails],
    social:blacklist.social,userGmail:blacklist.userGmail,openPlatforms:blacklist.openPlatforms
  }});
}

async function purgeBlacklisted() {
  const d=await sGet(K.EMAILS), stored=d[K.EMAILS]||[];
  const clean=stored.filter(e=>!isBlacklisted(e.email,e.url));
  if (clean.length!==stored.length) {
    const st={total:clean.length,domains:new Set(clean.map(e=>{try{return new URL(e.url).hostname;}catch(x){return''}})).size,
      highValue:clean.filter(e=>e.isHighValue).length,pages:0,paid:clean.filter(e=>e.isPaid).length};
    await sSet({[K.EMAILS]:clean,[K.STATS]:st});
    try{chrome.runtime.sendMessage({type:'EMAILS_UPDATED',added:0,stats:st});}catch(x){}
  }
}

// ===== AUTO-CRAWL: triggered from content.js when a search engine page is detected =====
async function handleAutoSerpCrawl(urls, searchPage, tabScanMode) {
  if (!urls || !urls.length) return;
  const sm = tabScanMode || scanMode;
  const items = urls.map(i=>typeof i==='string'?{url:i,searchPage:searchPage||1}:i);
  const fresh = items.filter(i=>{if(visitedUrls.has(i.url))return false;visitedUrls.add(i.url);return true;});
  if (!fresh.length) return;
  queue.push(...fresh);
  totalQueued = Math.max(totalQueued, queue.length);
  await sSet({[K.QUEUE]:queue});
  await persistVisited();
  processQueue();
}

// ---- Messages ----
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  (async()=>{
    try{
      switch(msg.type){
        case 'EXTRACT_EMAILS':{
          const clean=(msg.emails||[]).filter(e=>!isBlacklisted(e,msg.url||''));
          const added=await storeEmails(clean,msg.url||'',msg.title||'',msg.searchPage||0,msg.html||'',msg.isPaid||false);
          sendResponse({success:true,added}); break;
        }
        case 'AUTO_SERP_CRAWL':{
          // Content script detected a search page in auto mode — queue all result URLs
          await handleAutoSerpCrawl(msg.urls, msg.searchPage, msg.scanMode);
          sendResponse({success:true, queued: msg.urls?.length||0}); break;
        }
        case 'START_SCRAPING':{
          if(msg.scanMode){scanMode=msg.scanMode;await sSet({[K.SCAN_MODE]:scanMode});}
          const items=(msg.urls||[]).map(i=>typeof i==='string'?{url:i,searchPage:msg.searchPage||0}:i);
          const fresh=items.filter(i=>{if(visitedUrls.has(i.url))return false;visitedUrls.add(i.url);return true;});
          queue.push(...fresh); totalQueued=Math.max(totalQueued,queue.length);
          await sSet({[K.QUEUE]:queue}); await persistVisited(); processQueue();
          sendResponse({success:true,queued:fresh.length}); break;
        }
        case 'PAUSE_SCRAPING': paused=true; sendResponse({success:true}); break;
        case 'RESUME_SCRAPING': paused=false; sendResponse({success:true}); break;
        case 'STOP_SCRAPING': stopped=true;paused=false;queue=[];await sSet({[K.QUEUE]:[]});processing=false;sendResponse({success:true}); break;
        case 'SET_SCAN_MODE': scanMode=msg.mode;await sSet({[K.SCAN_MODE]:scanMode});sendResponse({success:true}); break;
        case 'GET_DATA':{
          const d=await sGet([K.EMAILS,K.STATS]);
          sendResponse({emails:d[K.EMAILS]||[],stats:d[K.STATS]||{total:0,domains:0,highValue:0,pages:0,paid:0},queueLen:queue.length,processing}); break;
        }
        case 'GET_SCRAPING_STATE': sendResponse({active:processing||queue.length>0,paused,queueLen:queue.length}); break;
        case 'REMOVE_EMAIL':{
          const d=await sGet(K.EMAILS), arr=(d[K.EMAILS]||[]).filter(e=>e.email!==msg.email);
          const st={total:arr.length,domains:new Set(arr.map(e=>{try{return new URL(e.url).hostname;}catch(x){return''}})).size,
            highValue:arr.filter(e=>e.isHighValue).length,pages:0,paid:arr.filter(e=>e.isPaid).length};
          await sSet({[K.EMAILS]:arr,[K.STATS]:st}); sendResponse({success:true}); break;
        }
        case 'CLEAR_DATA':
          queue=[];visitedUrls=new Set();processing=false;paused=false;stopped=false;totalQueued=0;
          await sSet({[K.EMAILS]:[],[K.STATS]:{total:0,domains:0,highValue:0,pages:0,paid:0},[K.QUEUE]:[],[K.VISITED]:[]});
          sendResponse({success:true}); break;
        case 'SET_USER_GMAIL':
          buildGmailSet(msg.gmail);await sSet({[K.GMAIL]:msg.gmail.toLowerCase().trim()});
          await purgeBlacklisted(); sendResponse({success:true}); break;
        case 'GET_USER_GMAIL':{const d=await sGet(K.GMAIL);sendResponse({gmail:d[K.GMAIL]||null});break;}
        case 'SAVE_TEMPLATE': await sSet({[K.TEMPLATE]:msg.template});sendResponse({success:true}); break;
        case 'GET_TEMPLATE':{const d=await sGet(K.TEMPLATE);sendResponse({template:d[K.TEMPLATE]||null});break;}
        case 'GET_BLACKLIST':
          sendResponse({domains:[...blacklist.domains],emails:[...blacklist.emails],
            social:blacklist.social,userGmail:blacklist.userGmail,openPlatforms:blacklist.openPlatforms}); break;
        case 'ADD_TO_BLACKLIST':
          if(msg.domain) blacklist.domains.add(msg.domain.toLowerCase().replace(/^www\./,''));
          if(msg.email)  blacklist.emails.add(msg.email.toLowerCase().trim());
          await saveBlacklist(); await purgeBlacklisted(); sendResponse({success:true}); break;
        case 'REMOVE_FROM_BLACKLIST':
          if(msg.domain) blacklist.domains.delete(msg.domain);
          if(msg.email)  blacklist.emails.delete(msg.email);
          await saveBlacklist(); sendResponse({success:true}); break;
        case 'SET_BLACKLIST_TOGGLE':
          if(msg.key==='social') blacklist.social=msg.value;
          if(msg.key==='userGmail') blacklist.userGmail=msg.value;
          if(msg.key==='openPlatforms') {
            blacklist.openPlatforms=msg.value;
            if(msg.value) OPEN_PLATFORM_DOMAINS.forEach(d=>blacklist.domains.add(d));
            else OPEN_PLATFORM_DOMAINS.forEach(d=>blacklist.domains.delete(d));
          }
          await saveBlacklist(); await purgeBlacklisted(); sendResponse({success:true}); break;
        case 'CLEAR_BLACKLIST':
          blacklist.domains.clear();blacklist.emails.clear();
          if(blacklist.openPlatforms) OPEN_PLATFORM_DOMAINS.forEach(d=>blacklist.domains.add(d));
          await saveBlacklist(); sendResponse({success:true}); break;
        case 'RESET_VISITED':
          visitedUrls=new Set();
          await sSet({[K.VISITED]:[]});
          sendResponse({success:true}); break;
      }
    }catch(err){console.error('[BH]',err);sendResponse({success:false,error:err.message});}
  })();
  return true;
});
