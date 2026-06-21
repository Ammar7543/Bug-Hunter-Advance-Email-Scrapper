'use strict';
// ===== BOUNTY HUNTER v4.4 POPUP =====

// ---- CATEGORIZED DORKS ----
const DORK_CATEGORIES = {
  '💰 Paid / Rewarded Programs': [
    'inurl:bug-bounty "reward" "$" -site:hackerone.com -site:bugcrowd.com',
    '"bug bounty" "up to $" inurl:security -hackerone -bugcrowd',
    '"we pay" "vulnerability" "USD" OR "EUR" -site:bugcrowd.com',
    '"security.txt" "reward" "$" -site:hackerone.com',
    '"vulnerability disclosure" "reward" "€" OR "$" -bugcrowd -hackerone',
    'inurl:bugbounty "reward" ("$1000" OR "$500" OR "$5000")',
    '"responsible disclosure" "cash" OR "paid" inurl:security',
    '"hall of fame" AND "monetary reward" -site:hackerone.com -site:bugcrowd.com',
  ],
  '🆕 Fresh / New VDP Programs': [
    `"vulnerability disclosure program" "new" OR "launched" ${new Date().getFullYear()} -site:hackerone.com -site:bugcrowd.com`,
    `"bug bounty program" "introducing" OR "launching" ${new Date().getFullYear()} -bugcrowd -hackerone`,
    `"responsible disclosure" "new program" ${new Date().getFullYear()} -site:hackerone.com`,
    '"we are launching" "bug bounty" OR "vulnerability disclosure" -hackerone -bugcrowd',
    `"security program" "open" "${new Date().getFullYear()}" -site:hackerone.com -site:bugcrowd.com`,
    '"private bug bounty" OR "invite only" inurl:security -site:bugcrowd.com',
    `"security.txt" "mailto" after:${new Date().getFullYear()-1}-06-01 -site:hackerone.com`,
    'site:*.io OR site:*.app "responsible disclosure" "security" -bugcrowd -hackerone',
  ],
  '🏦 Financial & FinTech': [
    'site:*.bank "responsible disclosure" OR "bug bounty" -site:hackerone.com -site:bugcrowd.com',
    'inurl:security "fintech" "vulnerability disclosure" -hackerone -bugcrowd',
    '"payment" "security disclosure" "report" inurl:security -site:bugcrowd.com',
    'site:*.bank "security.txt" "mailto"',
    '"digital bank" "bug bounty" OR "responsible disclosure" -site:hackerone.com',
    '"cryptocurrency" "vulnerability disclosure" "security" -hackerone -bugcrowd',
    '"fintech" "security contact" inurl:security.txt -site:hackerone.com',
    '"insurance" "responsible disclosure" "vulnerability" -site:bugcrowd.com',
  ],
  '💻 SaaS & Tech': [
    'site:*.io inurl:security "responsible disclosure" -site:hackerone.com -site:bugcrowd.com',
    '"SaaS" "vulnerability disclosure" inurl:security -hackerone -bugcrowd',
    '"API provider" "security disclosure" "reward" -site:bugcrowd.com',
    'inurl:"/.well-known/security.txt" "mailto" -github.com -wikipedia.org',
    '"cloud provider" "bug bounty" OR "disclosure" -site:hackerone.com',
    '"devops" "security vulnerability" "report" inurl:security -bugcrowd',
    'site:*.dev OR site:*.tech "security.txt" "contact" -site:hackerone.com',
    '"AI" OR "LLM" "security disclosure" "vulnerability" -site:bugcrowd.com',
  ],
  '🏥 Healthcare & Education': [
    'site:*.health "responsible disclosure" "vulnerability" -site:hackerone.com',
    '"telemedicine" "security contact" OR "disclosure" -bugcrowd -hackerone',
    'site:*.edu "responsible disclosure" "security report" -site:hackerone.com',
    '"hospital" OR "clinic" "vulnerability disclosure" inurl:security -bugcrowd',
    '"edtech" "bug bounty" OR "responsible disclosure" -site:hackerone.com',
    '"health insurance" "security" "report vulnerability" -bugcrowd -hackerone',
  ],
  '🛒 E-Commerce & Retail': [
    '"e-commerce" "bug bounty" OR "security disclosure" -site:bugcrowd.com -site:hackerone.com',
    '"online marketplace" "responsible disclosure" inurl:security -hackerone',
    '"subscription" "vulnerability disclosure" "reward" -bugcrowd -hackerone',
    'site:*.shop OR site:*.store "security.txt" "mailto" -site:hackerone.com',
    '"food delivery" "security" "responsible disclosure" -bugcrowd -hackerone',
  ],
  '🌐 Core Security Disclosure': [
    'inurl:/responsible-disclosure/ "reward" -site:hackerone.com -site:bugcrowd.com',
    'inurl:security.txt "mailto" -github.com -wikipedia.org -hackerone.com -bugcrowd.com',
    'inurl:/.well-known/security.txt "expires" "mailto" -site:hackerone.com',
    '"security.txt" "bug bounty" "reward" -bugcrowd -hackerone',
    'site:*.gov "responsible disclosure" "vulnerability" -site:hackerone.com',
    '"security policy" "disclose" "contact" inurl:security -hackerone -bugcrowd',
    'inurl:"security-policy" "report" "vulnerability" -site:bugcrowd.com',
    '"coordinated disclosure" "reward" OR "recognition" -hackerone -bugcrowd',
    '"penetration test" "disclosure" "security" inurl:security -bugcrowd',
    '"cybersecurity" "bug report" "reward" -site:hackerone.com -site:bugcrowd.com',
  ],
};

const $ = id => document.getElementById(id);
let allEmails=[], filteredEmails=[];
let stats={total:0,domains:0,highValue:0,pages:0,paid:0};
let sortField='email', sortAsc=true, filterHV=false, filterPaid=false;
let currentApproachEmail=null, currentScanMode='domain';

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async () => {
  await loadTheme();
  await loadData();
  await detectAndSetGmail();
  initTabs();
  initNetStatus();
  initAutoToggle();
  initModeSelect();
  initScanMode();
  bindSearchEvents();
  bindDorkEvents();
  bindBlacklistEvents();
  bindModalEvents();
  applyFilters();
  checkScrapingState();

  // Poll queue count every 2s so the counter stays live even without progress messages
  setInterval(async()=>{
    const r=await chrome.runtime.sendMessage({type:'GET_SCRAPING_STATE'}).catch(()=>null);
    if(!r) return;
    const sQ=$('statQueue'); if(sQ) sQ.textContent=r.queueLen||0;
    const pdQ=$('pdQueue'); if(pdQ) pdQ.textContent=r.queueLen||0;
  }, 2000);

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type==='EMAILS_UPDATED') { loadData().then(()=>{applyFilters();showNotifBubble(msg.added);}); }
    if (msg.type==='SCRAPING_PROGRESS') updateProgress(msg);
    if (msg.type==='SCRAPING_COMPLETE')  onScrapingDone();
  });
});

// ---- DATA ----
async function loadData() {
  const r=await chrome.runtime.sendMessage({type:'GET_DATA'});
  if (!r) return;
  allEmails=r.emails||[];
  stats=r.stats||{total:0,domains:0,highValue:0,pages:0,paid:0};
  updateStats(r);
}

async function loadTheme() {
  const r=await chrome.storage.local.get('bh_theme');
  const t=r.bh_theme||'green';
  $('themeSelect').value=t;
  document.body.className=t==='green'?'':`theme-${t}`;
}

// ---- GMAIL DETECTION ----
async function detectAndSetGmail() {
  try {
    const allTabs = await chrome.tabs.query({});
    const gTabs = allTabs.filter(t=>t.url&&['mail.google.com','google.com','accounts.google.com'].some(u=>t.url.includes(u)));
    for (const tab of gTabs) {
      try {
        const res = await chrome.scripting.executeScript({
          target:{tabId:tab.id},
          func:()=>{
            const fns=[
              ()=>document.querySelector('[data-email]')?.getAttribute('data-email'),
              ()=>document.querySelector('[email]')?.getAttribute('email'),
              ()=>{
                for(const el of document.querySelectorAll('[aria-label]')){
                  const m=(el.getAttribute('aria-label')||'').match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
                  if(m) return m[0];
                }
              },
              ()=>{const m=document.documentElement.innerHTML.match(/"([a-zA-Z0-9._%+\-]+@gmail\.com)"/);return m?.[1];}
            ];
            for(const f of fns){try{const r=f();if(r&&r.includes('@'))return r.toLowerCase().trim();}catch(e){}}
            return null;
          }
        });
        const gmail=res?.[0]?.result;
        if (gmail) { await chrome.runtime.sendMessage({type:'SET_USER_GMAIL',gmail}); break; }
      } catch(e){}
    }
  } catch(e){}
}

// ---- TABS ----
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p=>{p.classList.remove('active');p.classList.add('hidden');});
      btn.classList.add('active');
      const pane=$(`tab-${btn.dataset.tab}`);
      pane.classList.remove('hidden'); pane.classList.add('active');
      if (btn.dataset.tab==='dorks')     loadDorkUI();
      if (btn.dataset.tab==='blacklist') loadBlacklistUI();
    });
  });
}

// ---- NET STATUS ----
function initNetStatus() {
  const up=()=>{ const on=navigator.onLine; $('netStatus').className=`net-status ${on?'online':'offline'}`; $('netLabel').textContent=on?'ONLINE':'OFFLINE'; };
  up(); window.addEventListener('online',up); window.addEventListener('offline',up);
}

$('themeSelect').addEventListener('change',async()=>{
  const t=$('themeSelect').value;
  document.body.className=t==='green'?'':`theme-${t}`;
  await chrome.storage.local.set({bh_theme:t});
});

function initAutoToggle() {
  chrome.storage.local.get('bh_auto').then(r=>{ $('autoToggle').checked=r.bh_auto===true; });
  $('autoToggle').addEventListener('change',async()=>{
    const on=$('autoToggle').checked;
    await chrome.storage.local.set({bh_auto:on});
    toast(on?'⚡ Auto-Crawl ON — will hunt every search & site':'⏹ Auto-Crawl OFF');
  });
}

function initModeSelect() {
  chrome.storage.local.get(['bh_last_mode','bh_max_pages']).then(r=>{
    if(r.bh_last_mode) $('modeSelect').value=r.bh_last_mode;
    if(r.bh_max_pages) $('maxPages').value=r.bh_max_pages;
    togglePageControls($('modeSelect').value);
  });
  $('modeSelect').addEventListener('change',async()=>{
    const m=$('modeSelect').value;
    await chrome.storage.local.set({bh_last_mode:m});
    togglePageControls(m);
  });
  $('maxPages').addEventListener('change',()=>chrome.storage.local.set({bh_max_pages:$('maxPages').value}));
}

function togglePageControls(mode) {
  $('pageControls').style.display=mode==='google-multi'?'flex':'none';
}

function initScanMode() {
  chrome.storage.local.get('bh_scan_mode').then(r=>{
    currentScanMode=r.bh_scan_mode||'domain';
    updateScanModeUI(currentScanMode);
  });
  document.querySelectorAll('.scan-mode-btn').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      currentScanMode=btn.dataset.mode;
      await chrome.storage.local.set({bh_scan_mode:currentScanMode});
      await chrome.runtime.sendMessage({type:'SET_SCAN_MODE',mode:currentScanMode});
      updateScanModeUI(currentScanMode);
    });
  });
}
function updateScanModeUI(mode) {
  document.querySelectorAll('.scan-mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  const h=$('scanModeHint');
  if(h) h.textContent=mode==='domain'?'Fast — main page only':'Thorough — internal pages too';
}

// ---- STATS ----
function updateStats(r) {
  $('statTotal').textContent=stats.total||0;
  $('statDomains').textContent=stats.domains||0;
  $('statHV').textContent=stats.highValue||0;
  $('statPages').textContent=stats.pages||0;
  // Update paid stat if element exists
  const pEl=$('statPaid'); if(pEl) pEl.textContent=stats.paid||0;
  const qEl=$('statQueue'); if(qEl) qEl.textContent=r?.queueLen||0;
  const has=allEmails.length>0;
  $('btnCSV').disabled=$('btnCopyAll').disabled=$('btnClear').disabled=!has;
}

// ---- PROGRESS ----
function showProgressWrap(){$('progressWrap').classList.remove('hidden');}
function hideProgressWrap(){$('progressWrap').classList.add('hidden');}
function updateProgress(d) {
  showProgressWrap();
  $('progressText').textContent=`Scraping... ${d.searchPage||''}/${d.totalPages||''}`;
  const pct=d.total>0?Math.round(d.done/d.total*100):0;
  $('progressFill').style.width=pct+'%';
  $('pdDomain').textContent=d.currentDomain||'-';
  $('pdDone').textContent=d.done||0;
  $('pdLeft').textContent=d.remaining||0;
  $('pdFound').textContent=d.emailsFound||0;
  const pdQ=$('pdQueue'); if(pdQ) pdQ.textContent=d.remaining||0;
  const sQ=$('statQueue'); if(sQ) sQ.textContent=d.remaining||0;
  if(d.etaSeconds>0){const m=Math.floor(d.etaSeconds/60),s=d.etaSeconds%60;$('progressETA').textContent=`ETA:${m}m${s}s`;}
}
async function checkScrapingState() {
  const r=await chrome.runtime.sendMessage({type:'GET_SCRAPING_STATE'});
  if(r&&(r.active||r.queueLen>0)){showProgressWrap();$('btnExecute').disabled=true;$('btnExecute').textContent='🔄 SCRAPING...';}
}
function onScrapingDone() {
  const sQ=$('statQueue'); if(sQ) sQ.textContent='0';
  const pdQ=$('pdQueue'); if(pdQ) pdQ.textContent='0';
  hideProgressWrap();
  $('btnExecute').disabled=false; $('btnExecute').textContent='▶ START';
  loadData().then(()=>applyFilters());
  toast('✓ Done!');
}

// ---- EVENTS ----
function bindSearchEvents() {
  $('btnExecute').addEventListener('click',execute);
  $('searchFilter').addEventListener('input',applyFilters);
  $('btnFilterHV').addEventListener('click',()=>{filterHV=!filterHV;$('btnFilterHV').dataset.active=filterHV;applyFilters();});
  $('btnFilterPaid').addEventListener('click',()=>{filterPaid=!filterPaid;$('btnFilterPaid').dataset.active=filterPaid;applyFilters();});
  $('btnSort').addEventListener('click',()=>{
    // Cycle: email → domain → date
    const fields=['email','domain','date'];
    const idx=fields.indexOf(sortField);
    sortField=fields[(idx+1)%fields.length];
    sortAsc=true;
    $('btnSort').textContent={email:'⇅ EMAIL',domain:'⇅ DOMAIN',date:'⇅ DATE'}[sortField];
    applyFilters();
  });
  $('btnCSV').addEventListener('click',exportCSV);
  $('btnCopyAll').addEventListener('click',copyAll);
  $('btnClear').addEventListener('click',clearAll);
  $('btnResetVisited').addEventListener('click',resetVisited);
  $('btnPause').addEventListener('click',async()=>{await chrome.runtime.sendMessage({type:'PAUSE_SCRAPING'});$('btnPause').classList.add('hidden');$('btnResume').classList.remove('hidden');});
  $('btnResume').addEventListener('click',async()=>{await chrome.runtime.sendMessage({type:'RESUME_SCRAPING'});$('btnResume').classList.add('hidden');$('btnPause').classList.remove('hidden');});
  $('btnStop').addEventListener('click',async()=>{await chrome.runtime.sendMessage({type:'STOP_SCRAPING'});hideProgressWrap();$('btnExecute').disabled=false;$('btnExecute').textContent='▶ START';toast('Stopped');});
}

// ---- EXECUTE ----
async function execute() {
  const mode=$('modeSelect').value;
  $('btnExecute').disabled=true; $('btnExecute').textContent='⏳...';
  try {
    if(mode==='current')       await doCurrentPage();
    else if(mode==='google-multi') await doGoogleMulti();
    else if(mode==='alltabs')  await doAllTabs();
  } catch(e) {
    toast('Error: '+e.message,true);
    $('btnExecute').disabled=false; $('btnExecute').textContent='▶ START';
  }
}

// ---- CURRENT PAGE — FIXED WITH FALLBACK ----
async function doCurrentPage() {
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.url?.startsWith('http')) {
    toast('Open a webpage first!',true);
    $('btnExecute').disabled=false; $('btnExecute').textContent='▶ START';
    return;
  }
  let count=0;
  try {
    // Force-inject content script
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['js/content.js']});
    await new Promise(r=>setTimeout(r,300));
    const res=await chrome.tabs.sendMessage(tab.id,{type:'EXTRACT_NOW',mode:'current'});
    count=res?.count||0;
  } catch(e) {
    // Direct fallback extraction
    try {
      const results=await chrome.scripting.executeScript({
        target:{tabId:tab.id},
        func:()=>{
          const RE=/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
          const found=new Set(); let m;
          document.querySelectorAll('a[href]').forEach(a=>{
            const h=a.getAttribute('href')||'';
            if(h.includes('mailto:')){try{found.add(decodeURIComponent(h.replace(/^.*mailto:/i,'').split('?')[0]).toLowerCase().trim());}catch(x){}}
          });
          const deob=(document.documentElement.innerHTML||'').replace(/&#64;/gi,'@').replace(/%40/g,'@').replace(/\[at\]/gi,'@');
          RE.lastIndex=0; while((m=RE.exec(deob))!==null) found.add(m[0].toLowerCase().trim());
          const txt=document.body?.innerText||'';
          RE.lastIndex=0; while((m=RE.exec(txt))!==null) found.add(m[0].toLowerCase().trim());
          return {emails:[...found].filter(e=>e.length>5&&e.includes('@')&&e.includes('.')),url:location.href,title:document.title};
        }
      });
      if (results?.[0]?.result) {
        const {emails,url,title}=results[0].result;
        if (emails.length) {
          await chrome.runtime.sendMessage({type:'EXTRACT_EMAILS',emails,url,title,mode:'current',searchPage:0,html:''});
          count=emails.length;
        }
      }
    } catch(e2){ toast('Cannot scan this page',true); }
  }
  toast(count>0?`Found ${count} emails on page ✓`:'No emails found');
  $('btnExecute').disabled=false; $('btnExecute').textContent='▶ START';
  await loadData(); applyFilters();
}

async function doAllTabs() {
  const tabs=await chrome.tabs.query({});
  let n=0;
  for(const t of tabs){
    if(!t.url?.startsWith('http')) continue;
    try{await chrome.tabs.sendMessage(t.id,{type:'EXTRACT_NOW',mode:'alltabs'});n++;}catch(e){}
  }
  toast(`Scanned ${n} tabs ✓`);
  $('btnExecute').disabled=false; $('btnExecute').textContent='▶ START';
}

async function doGoogleMulti() {
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.url?.includes('google.')||!tab.url.includes('/search')) {
    toast('Open a Google search page first!',true);
    $('btnExecute').disabled=false; $('btnExecute').textContent='▶ START';
    return;
  }
  const maxPages=parseInt($('maxPages').value)||5;
  toast(`Starting ${maxPages}-page scrape...`);
  $('btnExecute').textContent='🔄 SCRAPING...';
  showProgressWrap();
  $('progressText').textContent=`Starting page 1 of ${maxPages}...`;
  try {
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['js/content.js']});
    await new Promise(r=>setTimeout(r,200));
    await chrome.tabs.sendMessage(tab.id,{type:'START_MULTIPAGE',maxPages,scanMode:currentScanMode});
  } catch(e) { toast('Error: '+e.message,true); $('btnExecute').disabled=false; $('btnExecute').textContent='▶ START'; }
}

// ---- FILTERS ----
function applyFilters() {
  const q=$('searchFilter').value.toLowerCase().trim();
  filteredEmails=allEmails.filter(e=>{
    const txt=!q||e.email.includes(q)||e.url.toLowerCase().includes(q);
    const hv=!filterHV||e.isHighValue;
    const paid=!filterPaid||e.isPaid;
    return txt&&hv&&paid;
  });
  filteredEmails.sort((a,b)=>{
    let va,vb;
    if(sortField==='email')  {va=a.email;vb=b.email;}
    else if(sortField==='domain'){va=(a.email.split('@')[1]||'');vb=(b.email.split('@')[1]||'');}
    else if(sortField==='date') {va=a.timestamp||'';vb=b.timestamp||'';}
    else {va=a.email;vb=b.email;}
    return sortAsc?va.localeCompare(vb):vb.localeCompare(va);
  });
  renderEmails();
}

// ---- RENDER ----
function renderEmails() {
  const list=$('emailList'); list.innerHTML='';
  if(!filteredEmails.length){
    list.innerHTML=`<div class="empty-state"><div class="empty-icon">◎</div><div class="empty-text">${allEmails.length?'No results match filter.':'No emails yet.<br/>Select mode and press START.'}</div></div>`;
    return;
  }
  const frag=document.createDocumentFragment();
  filteredEmails.forEach(e=>frag.appendChild(makeCard(e)));
  list.appendChild(frag);
}

function makeCard(e) {
  const card=document.createElement('div');
  const isHV=e.isHighValue, isPaid=e.isPaid;
  card.className=`email-card${isHV?' hv-card':''}${isPaid&&!isHV?' paid-card':''}`;
  const domain=e.email.split('@')[1]||'';
  const hvBadge=isHV?`<div class="hv-badge">⭐ BUG BOUNTY</div>`:'';
  const paidBadge=isPaid?`<div class="hv-badge paid-badge">💰 PAID PROGRAM</div>`:'';
  const pageTag=e.searchPage?`<span class="page-tag">PG${e.searchPage}</span>`:'';
  card.innerHTML=`
    ${hvBadge}${paidBadge}
    <div class="email-header">
      <div class="email-addr">${esc(e.email)}</div>
      <div class="domain-badge">${esc(domain)}</div>
    </div>
    <div class="email-url">${pageTag}${esc(e.url)}</div>
    <div class="email-actions">
      <button class="act copy">⎘ COPY</button>
      <button class="act visit">🔗 VISIT</button>
      <button class="act approach">⚡ APPROACH</button>
      <button class="act bl">🚫 BLOCK</button>
      <button class="act remove">✕</button>
    </div>`;
  card.querySelector('.copy').onclick=()=>{navigator.clipboard.writeText(e.email);toast('Copied ✓');};
  card.querySelector('.visit').onclick=()=>chrome.tabs.create({url:e.url});
  card.querySelector('.approach').onclick=()=>openModal(e.email,e.url);
  card.querySelector('.bl').onclick=async()=>{
    let domain=''; try{domain=new URL(e.url).hostname.replace(/^www\./,'');}catch(x){}
    if(domain){await chrome.runtime.sendMessage({type:'ADD_TO_BLACKLIST',domain});toast(`🚫 Blocked: ${domain}`);}
    await loadData(); applyFilters();
  };
  card.querySelector('.remove').onclick=async()=>{
    await chrome.runtime.sendMessage({type:'REMOVE_EMAIL',email:e.email,url:e.url});
    await loadData(); applyFilters(); toast('Removed');
  };
  return card;
}

// ---- EXPORT ----
function exportCSV() {
  // Deduplicate in export too
  const seenEmails=new Set();
  const unique=allEmails.filter(e=>{ if(seenEmails.has(e.email)) return false; seenEmails.add(e.email); return true; });
  const rows=[['Email','Domain','URL','Page','HighValue','Paid','Policy','Timestamp']];
  unique.forEach(e=>rows.push([`"${e.email}"`,`"${e.email.split('@')[1]}"`,`"${e.url}"`,`"${e.searchPage||0}"`,`"${e.isHighValue?'YES':'NO'}"`,`"${e.isPaid?'YES':'NO'}"`,`"${e.isPolicy?'YES':'NO'}"`,`"${e.timestamp||''}"`]));
  const csv=rows.map(r=>r.join(',')).join('\n');
  const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv'})),download:`bounty-${Date.now()}.csv`});
  a.click(); toast(`Exported ${unique.length} unique emails ✓`);
}
function copyAll(){navigator.clipboard.writeText(filteredEmails.map(e=>e.email).join('\n'));toast(`Copied ${filteredEmails.length} ✓`);}
async function resetVisited(){
  await chrome.runtime.sendMessage({type:'RESET_VISITED'});
  toast('🔄 Visited URLs cleared — sites will be re-crawled');
}

async function clearAll(){
  if(!confirm('Clear ALL emails?'))return;
  await chrome.runtime.sendMessage({type:'CLEAR_DATA'});
  allEmails=[];stats={total:0,domains:0,highValue:0,pages:0,paid:0};
  updateStats();applyFilters();toast('Cleared');
}

// ---- APPROACH MODAL ----
function bindModalEvents(){
  $('modalClose').onclick=closeModal;
  $('approachModal').onclick=e=>{if(e.target===$('approachModal'))closeModal();};
  $('btnSendGmail').onclick=sendGmail;
  $('btnCopyApproach').onclick=()=>{navigator.clipboard.writeText($('approachBody').value);toast('Copied ✓');};
  $('btnLoadTpl').onclick=loadTpl;
  $('btnSaveTpl').onclick=saveTpl;
}

async function openModal(email,url){
  currentApproachEmail=email;
  $('modalEmail').textContent=email;
  const r=await chrome.runtime.sendMessage({type:'GET_TEMPLATE'});
  const domain=url.match(/https?:\/\/([^/]+)/)?.[1]||url;
  $('approachBody').value=r.template||defaultTpl(email,domain);
  $('approachModal').classList.remove('hidden');
}

function defaultTpl(email,domain){
return `Subject: Security Vulnerability Disclosure Inquiry — ${domain}

Dear Security Team at ${domain},

My name is [Your Name], and I am an independent security researcher. I am writing to inquire whether your organization currently operates a Bug Bounty or Vulnerability Disclosure Program (VDP).

I have a genuine interest in contributing to the security of ${domain} and its users by identifying and responsibly disclosing any potential vulnerabilities I may discover.

I would appreciate clarification on the following points:

1. Do you have a formal Bug Bounty or VDP in place?
2. What is the scope of your program (in-scope assets, domains, or APIs)?
3. What is your preferred method for receiving vulnerability reports?
4. Do you offer any form of recognition or monetary reward for valid findings?

I am committed to responsible disclosure and will not publicly disclose any vulnerabilities without your explicit consent. I follow ethical security research guidelines and adhere to a responsible disclosure timeline.

If your program is private or not publicly listed, I am happy to operate under a confidentiality agreement.

Thank you for your time and consideration. I look forward to your response.

Best regards,
[Your Full Name]
[Your Email Address]
[LinkedIn / Security Profile URL]`;
}

function closeModal(){$('approachModal').classList.add('hidden');currentApproachEmail=null;}
async function loadTpl(){const r=await chrome.runtime.sendMessage({type:'GET_TEMPLATE'});if(r.template){$('approachBody').value=r.template;toast('Loaded ✓');}else toast('No saved template',true);}
async function saveTpl(){const t=$('approachBody').value.trim();if(!t){toast('Empty!',true);return;}await chrome.runtime.sendMessage({type:'SAVE_TEMPLATE',template:t});toast('Saved ✓');}
function sendGmail(){
  if(!currentApproachEmail)return;
  const lines=$('approachBody').value.split('\n');
  const subjLine=lines.find(l=>l.startsWith('Subject:'));
  const sub=subjLine?subjLine.replace('Subject:','').trim():'Bug Bounty Inquiry';
  const body=lines.filter(l=>!l.startsWith('Subject:')).join('\n').trim();
  chrome.tabs.create({url:`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(currentApproachEmail)}&su=${encodeURIComponent(sub)}&body=${encodeURIComponent(body)}`});
  closeModal(); toast('Opening Gmail ✓');
}

// ---- DORKS ----
function bindDorkEvents(){
  $('btnAddDork').onclick=()=>{const v=$('dorkInput').value.trim();if(v){addDork($('dorkCategorySelect').value,v);$('dorkInput').value='';}};
  $('dorkInput').addEventListener('keydown',e=>{if(e.key==='Enter'){const v=e.target.value.trim();if(v){addDork($('dorkCategorySelect').value,v);e.target.value='';}}});
  $('btnClearDorks').onclick=async()=>{if(!confirm('Clear all custom dorks?'))return;await chrome.storage.local.set({bh_custom_dorks:{}});loadDorkUI();toast('Cleared');};
  $('btnLaunchDorks').onclick=launchSelectedDorks;
  $('dorkCategoryFilter').addEventListener('change',renderDorkSections);
  bindSmartDorkBuilder();
}

async function loadDorkUI(){
  // Populate category selects
  const cats=Object.keys(DORK_CATEGORIES);
  const catSel=$('dorkCategorySelect'), catFilter=$('dorkCategoryFilter');
  catSel.innerHTML=cats.map(c=>`<option value="${esc(c)}">${c}</option>`).join('');
  catFilter.innerHTML=`<option value="all">All Categories</option>`+cats.map(c=>`<option value="${esc(c)}">${c}</option>`).join('');
  // Smart builder uses the same category list for "save to"
  const targetCat=$('smartTargetCat');
  if(targetCat) targetCat.innerHTML=cats.map(c=>`<option value="${esc(c)}">${c}</option>`).join('');
  populateSmartYears();
  renderDorkSections();
}

async function renderDorkSections(){
  const filter=$('dorkCategoryFilter').value;
  const r=await chrome.storage.local.get('bh_custom_dorks');
  const custom=r.bh_custom_dorks||{};
  const container=$('dorkSections'); container.innerHTML='';

  const cats=filter==='all'?Object.keys(DORK_CATEGORIES):[filter];
  cats.forEach(cat=>{
    const allDorks=[...DORK_CATEGORIES[cat],...(custom[cat]||[])];
    const section=document.createElement('div'); section.className='dork-cat-section';
    section.innerHTML=`<div class="dork-cat-header"><span class="dork-cat-title">${esc(cat)}</span><span class="dork-cat-count">${allDorks.length}</span></div>`;
    const chips=document.createElement('div'); chips.className='dork-chips';
    allDorks.forEach((d,i)=>{
      const chip=document.createElement('div');
      const isCustom=i>=DORK_CATEGORIES[cat].length;
      chip.className=`dork-chip${isCustom?' custom-chip':''}`;
      chip.textContent=d; chip.title=d;
      chip.onclick=()=>launchDork(d);
      if(isCustom){
        const del=document.createElement('span'); del.className='chip-del'; del.textContent='×';
        del.onclick=async(e)=>{e.stopPropagation();await removeDork(cat,d);renderDorkSections();};
        chip.appendChild(del);
      }
      chips.appendChild(chip);
    });
    section.appendChild(chips);
    container.appendChild(section);
  });
}

async function addDork(cat,dork){
  const r=await chrome.storage.local.get('bh_custom_dorks');
  const custom=r.bh_custom_dorks||{};
  if(!custom[cat]) custom[cat]=[];
  if(!custom[cat].includes(dork)&&!DORK_CATEGORIES[cat]?.includes(dork)){
    custom[cat].push(dork);
    await chrome.storage.local.set({bh_custom_dorks:custom});
    renderDorkSections(); toast('Dork added ✓');
  }
}

async function removeDork(cat,dork){
  const r=await chrome.storage.local.get('bh_custom_dorks');
  const custom=r.bh_custom_dorks||{};
  if(custom[cat]) custom[cat]=custom[cat].filter(d=>d!==dork);
  await chrome.storage.local.set({bh_custom_dorks:custom});
}

function launchDork(d){
  chrome.tabs.create({url:`https://www.google.com/search?q=${encodeURIComponent(d)}&tbs=qdr:m3`});
}

async function launchSelectedDorks(){
  const filter=$('dorkCategoryFilter').value;
  const r=await chrome.storage.local.get('bh_custom_dorks');
  const custom=r.bh_custom_dorks||{};
  const cats=filter==='all'?Object.keys(DORK_CATEGORIES):[filter];
  let all=[];
  cats.forEach(c=>{all=[...all,...DORK_CATEGORIES[c],...(custom[c]||[])];});
  if(!all.length){toast('No dorks!',true);return;}
  all.forEach((d,i)=>setTimeout(()=>chrome.tabs.create({url:`https://www.google.com/search?q=${encodeURIComponent(d)}&tbs=qdr:m3`,active:i===0}),i*400));
  toast(`Launched ${all.length} dorks (last 3 months filter) ✓`);
}

// ---- SMART DORK BUILDER ----
// Country code → Google ccTLD / domain hint used in the dork query
const SMART_COUNTRY_MAP = {
  us:'site:*.com OR site:*.us',
  uk:'site:*.uk',
  nl:'site:*.nl',
  de:'site:*.de',
  fr:'site:*.fr',
  in:'site:*.in',
  pk:'site:*.pk',
  au:'site:*.au',
  ca:'site:*.ca',
  ae:'site:*.ae',
  sa:'site:*.sa',
  br:'site:*.br',
  eu:'site:*.eu',
};

function populateSmartYears(){
  const sel=$('sdYear'); if(!sel) return;
  const current=new Date().getFullYear();
  let opts='<option value="">Any</option>';
  for(let y=current;y>=current-6;y--) opts+=`<option value="${y}">${y}</option>`;
  sel.innerHTML=opts;
}

// Build the dork string from only the fields the user actually picked
function buildSmartDork(){
  const year=$('sdYear')?.value||'';
  const currency=$('sdCurrency')?.value||'';
  const countryKey=$('sdCountry')?.value||'';

  const parts=[];
  // Core disclosure intent always included — this is what makes it a "bounty" dork
  parts.push('"bug bounty" OR "vulnerability disclosure" OR "responsible disclosure"');
  parts.push('inurl:security OR inurl:security.txt');

  if(countryKey && SMART_COUNTRY_MAP[countryKey]) parts.push(SMART_COUNTRY_MAP[countryKey]);
  if(currency) parts.push(`"${currency}"`);
  if(year) parts.push(`"${year}"`);

  // Always exclude noisy open platforms — keeps results private-program focused
  parts.push('-site:hackerone.com -site:bugcrowd.com');

  return parts.join(' ');
}

function updateSmartPreview(){
  const preview=$('smartPreview'); if(!preview) return;
  const dork=buildSmartDork();
  preview.textContent=dork;
}

function bindSmartDorkBuilder(){
  ['sdYear','sdCurrency','sdCountry'].forEach(id=>{
    const el=$(id);
    if(el) el.addEventListener('change',updateSmartPreview);
  });
  const btnSearch=$('btnSmartSearch');
  if(btnSearch) btnSearch.onclick=()=>{
    const dork=buildSmartDork();
    launchDork(dork);
    toast('Smart dork launched ✓');
  };
  const btnSave=$('btnSmartSave');
  if(btnSave) btnSave.onclick=async()=>{
    const dork=buildSmartDork();
    const cat=$('smartTargetCat')?.value;
    if(!cat){ toast('No category to save to!',true); return; }
    await addDork(cat,dork);
    toast('Smart dork saved to category ✓');
  };
  updateSmartPreview();
}

// ---- BLACKLIST ----
function bindBlacklistEvents(){
  $('blGmail').addEventListener('change',async()=>{await chrome.runtime.sendMessage({type:'SET_BLACKLIST_TOGGLE',key:'userGmail',value:$('blGmail').checked});toast($('blGmail').checked?'Gmail filter ON':'Gmail filter OFF');});
  $('blSocial').addEventListener('change',async()=>{await chrome.runtime.sendMessage({type:'SET_BLACKLIST_TOGGLE',key:'social',value:$('blSocial').checked});toast($('blSocial').checked?'Social filter ON':'Social filter OFF');});
  $('blOpenPlatforms').addEventListener('change',async()=>{await chrome.runtime.sendMessage({type:'SET_BLACKLIST_TOGGLE',key:'openPlatforms',value:$('blOpenPlatforms').checked});toast($('blOpenPlatforms').checked?'Open platforms blocked':'Open platforms unblocked');});
  $('btnAddBL').onclick=addToBlacklist;
  $('blInput').addEventListener('keydown',e=>{if(e.key==='Enter')addToBlacklist();});
  $('btnClearBL').onclick=async()=>{if(!confirm('Clear blacklist?'))return;await chrome.runtime.sendMessage({type:'CLEAR_BLACKLIST'});loadBlacklistUI();toast('Cleared');};
  $('btnExportBL').onclick=exportBlacklist;
  $('blSearch').addEventListener('input',()=>loadBlacklistUI($('blSearch').value.toLowerCase()));
}

async function loadBlacklistUI(query=''){
  const r=await chrome.runtime.sendMessage({type:'GET_BLACKLIST'});
  $('blGmail').checked=r.userGmail!==false;
  $('blSocial').checked=r.social===true;
  $('blOpenPlatforms').checked=r.openPlatforms!==false;
  const list=$('blList'); list.innerHTML='';
  const items=[...(r.domains||[]).map(d=>({val:d,type:'DOMAIN'})),...(r.emails||[]).map(e=>({val:e,type:'EMAIL'}))];
  const filtered=query?items.filter(i=>i.val.includes(query)):items;
  if(!filtered.length){list.innerHTML='<div style="color:var(--text-dim);font-size:10px;padding:8px 0">// Blacklist empty</div>';return;}
  filtered.forEach(({val,type})=>{
    const item=document.createElement('div'); item.className='bl-item';
    item.innerHTML=`<span>${esc(val)}</span><span class="bl-type">${type}</span><button class="bl-del">✕</button>`;
    item.querySelector('.bl-del').onclick=async()=>{
      const p=type==='DOMAIN'?{domain:val}:{email:val};
      await chrome.runtime.sendMessage({type:'REMOVE_FROM_BLACKLIST',...p});
      loadBlacklistUI(query);
    };
    list.appendChild(item);
  });
}

async function addToBlacklist(){
  const val=$('blInput').value.trim().toLowerCase();
  if(!val)return;
  const p=val.includes('@')?{email:val}:{domain:val.replace(/^www\./,'')};
  await chrome.runtime.sendMessage({type:'ADD_TO_BLACKLIST',...p});
  $('blInput').value='';
  await loadBlacklistUI(); toast(`🚫 Added: ${val}`);
}

async function exportBlacklist(){
  const r=await chrome.runtime.sendMessage({type:'GET_BLACKLIST'});
  const lines=[...(r.domains||[]).map(d=>`domain:${d}`),...(r.emails||[]).map(e=>`email:${e}`)];
  const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain'})),download:`blacklist-${Date.now()}.txt`});
  a.click(); toast(`Exported ${lines.length} items ✓`);
}

// ---- NOTIF BUBBLE ----
function showNotifBubble(n){
  $('notifCount').textContent=`+${n}`;
  $('notifBubble').classList.remove('hidden');
  clearTimeout($('notifBubble')._t);
  $('notifBubble')._t=setTimeout(()=>$('notifBubble').classList.add('hidden'),4000);
}

// ---- UTILS ----
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function toast(msg,isErr=false){
  let el=$('_bh_toast');
  if(!el){el=document.createElement('div');el.id='_bh_toast';
    Object.assign(el.style,{position:'fixed',bottom:'16px',left:'50%',transform:'translateX(-50%)',
      background:'var(--bg2)',border:'1px solid',fontFamily:'var(--disp)',fontSize:'10px',fontWeight:'700',
      letterSpacing:'1px',padding:'8px 18px',borderRadius:'4px',zIndex:'99999',whiteSpace:'nowrap',
      opacity:'0',transition:'opacity .2s',pointerEvents:'none'});
    document.body.appendChild(el);}
  el.textContent=msg;
  el.style.borderColor=isErr?'var(--red)':'var(--green)';
  el.style.color=isErr?'var(--red)':'var(--green)';
  el.style.boxShadow=isErr?'0 0 16px rgba(255,53,53,.3)':'0 0 16px rgba(0,255,65,.3)';
  el.style.opacity='1';
  clearTimeout(el._t); el._t=setTimeout(()=>el.style.opacity='0',2500);
}
