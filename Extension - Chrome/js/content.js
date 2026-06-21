(function(){
'use strict';

const EMAIL_RE = /[a-zA-Z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+\/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}/g;
const CURRENCY_RE = /[\$€£¥₹₿]|\b(USD|EUR|GBP|reward|bounty|paid|payout|compensation)\b/i;
const PLATFORM_RE = /bugcrowd\.com|hackerone\.com|intigriti\.com|yeswehack\.com|synack\.com/i;
const JUNK_TLD = new Set(['png','jpg','jpeg','gif','svg','webp','css','js','map','woff','woff2','ttf','eot','ico','zip','mp4','ts']);
const JUNK_LOC = new Set(['noreply','no-reply','donotreply','do-not-reply','mailer-daemon','postmaster','webmaster','bounce','bounces','unsubscribe','abuse','spam']);
const JUNK_DOM = new Set(['example.com','example.org','example.net','test.com','test.org','domain.com','yourdomain.com','sentry.io','wixpress.com','w3.org','schema.org','cloudflare.com']);

// ---- Search engine detection ----
const SERP_HOSTS = [
  'google.com','google.co.uk','google.com.pk','google.ca','google.com.au',
  'bing.com','search.yahoo.com','duckduckgo.com','search.brave.com',
  'yandex.com','yandex.ru','baidu.com','ecosia.org','startpage.com'
];

function isSerpPage() {
  const host = location.hostname.replace(/^www\./,'');
  return SERP_HOSTS.some(s => host === s || host.endsWith('.'+s));
}

function isGoogleSerpPage() {
  const host = location.hostname.replace(/^www\./,'');
  return (host === 'google.com' || host.startsWith('google.co') || host.startsWith('google.com.'))
    && location.pathname === '/search';
}

function isBingSerpPage() {
  return location.hostname.replace(/^www\./,'') === 'bing.com' && location.pathname.startsWith('/search');
}

function isDuckDuckGoSerpPage() {
  return location.hostname.replace(/^www\./,'') === 'duckduckgo.com';
}

function deobfuscate(t) {
  return t
    .replace(/&#64;/gi,'@').replace(/&#x40;/gi,'@').replace(/%40/g,'@').replace(/\\u0040/gi,'@')
    .replace(/\[\s*at\s*\]/gi,'@').replace(/\(\s*at\s*\)/gi,'@').replace(/\{\s*at\s*\}/gi,'@')
    .replace(/\[\s*dot\s*\]/gi,'.').replace(/\(\s*dot\s*\)/gi,'.').replace(/\{\s*dot\s*\}/gi,'.');
}

function validEmail(e) {
  if (!e || !e.includes('@')) return false;
  const [loc, dom] = e.split('@');
  if (!loc || !dom || !dom.includes('.')) return false;
  const tld = dom.split('.').pop().toLowerCase();
  if (JUNK_TLD.has(tld) || JUNK_LOC.has(loc.toLowerCase()) || JUNK_DOM.has(dom.toLowerCase())) return false;
  if (e.length > 254 || loc.length > 64 || /\.{2,}/.test(e)) return false;
  return true;
}

function extractEmails() {
  const found = new Set();
  let m;
  document.querySelectorAll('a[href]').forEach(a => {
    const h = a.getAttribute('href') || '';
    if (!h.toLowerCase().includes('mailto:')) return;
    try {
      const raw = decodeURIComponent(h.replace(/^.*mailto:/i,'').split('?')[0].split('#')[0]).trim();
      if (validEmail(raw.toLowerCase())) found.add(raw.toLowerCase());
    } catch(e) {}
  });
  const txt = (document.body || document.documentElement).innerText || '';
  const deobTxt = deobfuscate(txt);
  EMAIL_RE.lastIndex = 0;
  while ((m = EMAIL_RE.exec(deobTxt)) !== null) {
    const e = m[0].toLowerCase().trim();
    if (validEmail(e)) found.add(e);
  }
  const html = document.documentElement.innerHTML || '';
  const deobHtml = deobfuscate(html);
  EMAIL_RE.lastIndex = 0;
  while ((m = EMAIL_RE.exec(deobHtml)) !== null) {
    const e = m[0].toLowerCase().trim();
    if (validEmail(e)) found.add(e);
  }
  document.querySelectorAll('meta[content]').forEach(el => {
    const c = deobfuscate(el.getAttribute('content') || '');
    EMAIL_RE.lastIndex = 0;
    while ((m = EMAIL_RE.exec(c)) !== null) {
      const e = m[0].toLowerCase().trim();
      if (validEmail(e)) found.add(e);
    }
  });
  document.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
    const c = deobfuscate(el.textContent || '');
    EMAIL_RE.lastIndex = 0;
    while ((m = EMAIL_RE.exec(c)) !== null) {
      const e = m[0].toLowerCase().trim();
      if (validEmail(e)) found.add(e);
    }
  });
  return [...found];
}

function detectGmail() {
  const html = document.documentElement.innerHTML || '';
  const checks = [
    () => document.querySelector('[data-email]')?.getAttribute('data-email'),
    () => document.querySelector('[email]')?.getAttribute('email'),
    () => {
      for (const el of document.querySelectorAll('[aria-label]')) {
        const lbl = el.getAttribute('aria-label') || '';
        const m = lbl.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
        if (m) return m[0];
      }
    },
    () => { const m = html.match(/"([a-zA-Z0-9._%+\-]+@gmail\.com)"/); return m?.[1]; },
  ];
  for (const fn of checks) {
    try { const r = fn(); if (r && r.includes('@')) return r.toLowerCase().trim(); } catch(e) {}
  }
  const m = html.match(/["'\s]([a-zA-Z0-9._%+\-]+@gmail\.com)["'\s]/);
  return m ? m[1].toLowerCase().trim() : null;
}

function showNotif(text, isGold) {
  const old = document.getElementById('_bh_n');
  if (old) old.remove();
  const el = document.createElement('div');
  el.id = '_bh_n';
  const color = isGold ? '#ffd700' : '#00ff41';
  Object.assign(el.style, {
    position:'fixed', top:'16px', left:'50%',
    transform:'translateX(-50%) translateY(-80px)',
    zIndex:'2147483647', background:'#020c06', color,
    border:`2px solid ${color}`,
    fontFamily:'"Orbitron",monospace', fontSize:'13px', fontWeight:'900',
    letterSpacing:'1.5px', padding:'12px 28px', borderRadius:'6px',
    boxShadow:`0 0 28px ${isGold?'rgba(255,215,0,.5)':'rgba(0,255,65,.5)'},0 6px 24px rgba(0,0,0,.9)`,
    pointerEvents:'none', transition:'transform .3s cubic-bezier(.175,.885,.32,1.275)', whiteSpace:'nowrap',
  });
  el.textContent = text;
  (document.body || document.documentElement).appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transform = 'translateX(-50%) translateY(0)'; }));
  setTimeout(() => { el.style.transform = 'translateX(-50%) translateY(-80px)'; setTimeout(()=>el.parentNode&&el.remove(),350); }, 4000);
}

async function sendEmails(emails, mode, searchPage) {
  if (!emails.length) return 0;
  const isPaid = CURRENCY_RE.test((document.body?.innerText||'').slice(0,15000));
  if (PLATFORM_RE.test(document.documentElement.innerHTML.slice(0,20000))) {
    chrome.runtime.sendMessage({type:'ADD_TO_BLACKLIST', domain: location.hostname.replace(/^www\./, '')}).catch(()=>{});
    return 0;
  }
  try {
    const r = await chrome.runtime.sendMessage({
      type:'EXTRACT_EMAILS', emails,
      url:location.href, title:document.title,
      html:document.documentElement.innerHTML.slice(0,40000),
      mode:mode||'page', searchPage:searchPage||0, isPaid,
    });
    const added = r?.added || 0;
    if (added > 0) showNotif(`⬡ +${added} EMAIL${added>1?'S':''} GATHERED${isPaid?' 💰':''}`, isPaid);
    return added;
  } catch(e) { return 0; }
}

// ===== SERP URL EXTRACTORS =====

function extractGoogleURLs(searchPage) {
  const urls = [], seen = new Set();
  const SKIP = ['google.com','google.co','googleapis.com','gstatic.com','googletagmanager.com',
    'doubleclick.net','accounts.google','support.google','policies.google','maps.google',
    'translate.google','play.google','news.google','youtube.com','youtu.be','wikipedia.org'];
  function skipHost(href) {
    try { const h=new URL(href).hostname.toLowerCase(); return SKIP.some(s=>h===s||h.endsWith('.'+s)); }
    catch(e) { return true; }
  }
  function add(href) {
    if (!href) return;
    if (href.includes('/url?')) { try { href=new URL(href,location.href).searchParams.get('q')||href; } catch(e){} }
    if (!href.startsWith('http') || skipHost(href)) return;
    try {
      const u=new URL(href), clean=u.origin+u.pathname.replace(/\/$/, '');
      if (!seen.has(clean)) { seen.add(clean); urls.push({url:clean,searchPage:searchPage||1}); }
    } catch(e) {}
  }
  ['div.yuRUbf a','div.tF2Cxc a','div.g a[jsname]','div#rso div.g a[href]',
   'div#search div.g a[href]','div[data-hveid] a[href]','a[jsname][data-ved]'].forEach(sel => {
    try { document.querySelectorAll(sel).forEach(a => add(a.getAttribute('href'))); } catch(e) {}
  });
  try {
    (document.querySelector('#search')||document.querySelector('#rso')||document.body)
      .querySelectorAll('a[href]')
      .forEach(a => { const h=a.getAttribute('href'); if(h&&h.startsWith('http')&&!skipHost(h)) add(h); });
  } catch(e) {}
  document.querySelectorAll('cite').forEach(c => {
    let t=c.textContent.trim().split(/[\s›»>]/)[0];
    if (t) { if(!t.startsWith('http')) t='https://'+t; add(t); }
  });
  const fin=new Set();
  return urls.filter(i=>{ if(fin.has(i.url)) return false; fin.add(i.url); return true; });
}

function extractBingURLs(searchPage) {
  const urls = [], seen = new Set();
  const SKIP = ['bing.com','microsoft.com','msn.com','live.com','wikipedia.org'];
  function skipHost(h) { return SKIP.some(s=>h===s||h.endsWith('.'+s)); }
  function add(href) {
    if (!href || !href.startsWith('http')) return;
    try {
      const u = new URL(href);
      if (skipHost(u.hostname.replace(/^www\./,''))) return;
      const clean = u.origin + u.pathname.replace(/\/$/,'');
      if (!seen.has(clean)) { seen.add(clean); urls.push({url:clean,searchPage:searchPage||1}); }
    } catch(e) {}
  }
  document.querySelectorAll('#b_results .b_algo h2 a, #b_results li.b_algo a.tilk, .b_title a').forEach(a=>add(a.href));
  return urls;
}

function extractDuckDuckGoURLs(searchPage) {
  const urls = [], seen = new Set();
  const SKIP = ['duckduckgo.com','wikipedia.org'];
  function skipHost(h) { return SKIP.some(s=>h===s||h.endsWith('.'+s)); }
  function add(href) {
    if (!href || !href.startsWith('http')) return;
    try {
      const u = new URL(href);
      if (skipHost(u.hostname.replace(/^www\./,''))) return;
      const clean = u.origin + u.pathname.replace(/\/$/,'');
      if (!seen.has(clean)) { seen.add(clean); urls.push({url:clean,searchPage:searchPage||1}); }
    } catch(e) {}
  }
  document.querySelectorAll('[data-result] h2 a, .result__a, .result__url').forEach(a=>add(a.href||('https://'+a.textContent.trim())));
  return urls;
}

function extractSerpURLs(searchPage) {
  if (isGoogleSerpPage()) return extractGoogleURLs(searchPage);
  if (isBingSerpPage())   return extractBingURLs(searchPage);
  if (isDuckDuckGoSerpPage()) return extractDuckDuckGoURLs(searchPage);
  // Generic fallback for other search engines
  const urls = [], seen = new Set();
  document.querySelectorAll('a[href]').forEach(a => {
    const href = a.href;
    if (!href || !href.startsWith('http')) return;
    try {
      const u = new URL(href);
      const host = u.hostname.replace(/^www\./,'');
      if (host === location.hostname.replace(/^www\./,'')) return;
      const clean = u.origin + u.pathname.replace(/\/$/,'');
      if (!seen.has(clean)) { seen.add(clean); urls.push({url:clean,searchPage:searchPage||1}); }
    } catch(e) {}
  });
  return urls;
}

function isRobotPage() {
  return document.title.toLowerCase().includes('unusual traffic') ||
    !!document.querySelector('#captcha-form,#recaptcha,.g-recaptcha') ||
    (document.body?.innerText||'').includes('unusual traffic from your computer');
}

// ===== AUTO-CRAWL FOR SERP PAGES =====
// When auto mode is on AND we're on a search engine page, automatically
// extract all result URLs and queue them for background scraping.

async function autoSerpCrawl(scanMode) {
  if (isRobotPage()) {
    showNotif('⚠ CAPTCHA detected — please solve it!', true);
    return;
  }
  // Wait for results to load
  await new Promise(r => setTimeout(r, 1800));
  const urls = extractSerpURLs(1);
  if (!urls.length) return;
  showNotif(`⬡ AUTO-CRAWL: Queueing ${urls.length} sites...`, false);
  try {
    await chrome.runtime.sendMessage({type:'AUTO_SERP_CRAWL', urls, searchPage:1, scanMode});
  } catch(e) {}
}

// ===== MULTI-PAGE ORCHESTRATOR =====
async function runMultiPage(maxPages, scanMode) {
  let page = 1;
  window._bh_stopped = false;

  async function waitContent(ms) {
    const dl = Date.now()+ms;
    while (Date.now()<dl) {
      if (document.querySelectorAll('div.g,div.tF2Cxc,div#rso a[href],.b_algo,#links .result').length>2) return true;
      await new Promise(r=>setTimeout(r,400));
    }
    return false;
  }

  async function doPage() {
    if (window._bh_stopped || page>maxPages) return;
    if (isRobotPage()) {
      showNotif('⚠ CAPTCHA — Please solve it!', true);
      let w=0;
      while (isRobotPage()&&w<90000) { await new Promise(r=>setTimeout(r,1000)); w+=1000; }
      if (isRobotPage()) { showNotif('⚠ Timed out', true); return; }
      showNotif('✓ Resuming...', false);
      await new Promise(r=>setTimeout(r,1500));
    }
    await waitContent(8000);
    const urls = extractSerpURLs(page);
    showNotif(`⬡ SERP PAGE ${page}/${maxPages} — ${urls.length} URLs`, false);
    if (urls.length>0) {
      chrome.runtime.sendMessage({type:'START_SCRAPING', urls, searchPage:page, scanMode});
    }
    chrome.runtime.sendMessage({
      type:'SCRAPING_PROGRESS', searchPage:page, totalPages:maxPages,
      done:page, total:maxPages, remaining:maxPages-page
    });
    if (page < maxPages) {
      // Next page button — Google, Bing, DDG
      const next = document.querySelector(
        'a#pnnext, a[aria-label="Next page"], a[aria-label="Next"], ' +
        '[data-ved] a[jsname="VlcLAe"], a.sb_pagN, a.next-page, ' +
        '.nav-link[rel="next"], a[data-testid="pagination-page-next"]'
      );
      if (next) {
        page++;
        await new Promise(r=>setTimeout(r,1000));
        const prevHref = location.href;
        next.click();
        let waited = 0;
        await new Promise(r=>{
          const iv = setInterval(()=>{
            waited += 300;
            const urlChanged = location.href !== prevHref;
            const hasContent = document.querySelectorAll('div.g,div.tF2Cxc,.b_algo,.result').length > 1;
            if ((urlChanged && hasContent) || waited > 12000) { clearInterval(iv); r(); }
          }, 300);
        });
        await new Promise(r=>setTimeout(r,800));
        doPage();
      } else {
        showNotif(`⬡ Done — no more pages found`, true);
        chrome.runtime.sendMessage({type:'SCRAPING_COMPLETE'});
      }
    } else {
      showNotif(`⬡ DONE — All ${maxPages} pages scraped!`, true);
      chrome.runtime.sendMessage({type:'SCRAPING_COMPLETE'});
    }
  }
  doPage();
}

// ---- Message handler ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'EXTRACT_NOW') {
    const emails = extractEmails();
    const gmail  = detectGmail();
    if (gmail) chrome.runtime.sendMessage({type:'SET_USER_GMAIL', gmail}).catch(()=>{});
    sendEmails(emails, msg.mode||'current', 0).then(n => sendResponse({success:true, count:n}));
    return true;
  }
  if (msg.type === 'START_MULTIPAGE') {
    runMultiPage(msg.maxPages||5, msg.scanMode||'domain');
    sendResponse({success:true});
    return true;
  }
  if (msg.type === 'STOP_MULTIPAGE') { window._bh_stopped=true; sendResponse({success:true}); return true; }
  if (msg.type === 'GET_GOOGLE_URLS') { sendResponse({urls:extractSerpURLs(msg.searchPage||1)}); return true; }
  if (msg.type === 'DETECT_GMAIL') { sendResponse({gmail:detectGmail()}); return true; }
});

// ===== AUTO MODE INIT =====
let lastCount = 0;
let serpCrawlDone = false;

async function init() {
  if (!location.protocol.startsWith('http')) return;

  const gmail = detectGmail();
  if (gmail) chrome.runtime.sendMessage({type:'SET_USER_GMAIL', gmail}).catch(()=>{});

  const r = await chrome.storage.local.get(['bh_auto','bh_scan_mode']).catch(()=>({}));
  const autoOn = r.bh_auto === true;
  const scanMode = r.bh_scan_mode || 'domain';

  if (!autoOn) return;

  await new Promise(res => setTimeout(res, 1500));

  // === SERP PAGE: auto-queue all result URLs in background ===
  if (isSerpPage() && !serpCrawlDone) {
    serpCrawlDone = true;
    await autoSerpCrawl(scanMode);
    // Also observe for SPA navigation (DDG, etc.) to catch dynamically loaded results
    const obs = new MutationObserver(() => {
      clearTimeout(obs._t);
      obs._t = setTimeout(async () => {
        if (!serpCrawlDone) return;
        serpCrawlDone = false;
        await autoSerpCrawl(scanMode);
        serpCrawlDone = true;
      }, 2000);
    });
    obs.observe(document.documentElement, {childList:true, subtree:false});
    return; // On SERP pages, we queue sites — don't try to extract emails from the SERP itself
  }

  // === REGULAR PAGE: extract emails directly ===
  const emails = extractEmails();
  lastCount = emails.length;
  if (emails.length) await sendEmails(emails, 'auto', 0);

  // Watch for dynamically loaded content
  const obs = new MutationObserver(() => {
    clearTimeout(obs._t);
    obs._t = setTimeout(async () => {
      const em = extractEmails();
      if (em.length > lastCount) { lastCount = em.length; await sendEmails(em, 'auto', 0); }
    }, 2500);
  });
  obs.observe(document.documentElement, {childList:true, subtree:true});
}

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
else init();
})();
