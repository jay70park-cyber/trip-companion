/* K-Trip Companion — Redesign v2 overlay (behaviour).
   Runs after the app's own script in the dated test page (MMDD.html) and only rearranges the screen:
   bottom tabs, full-screen map with a draggable bottom sheet, line icons on chips, saved places,
   developer card only with ?dev=1. All app logic (KTO, TMAP, NAVER Map, audio, 5 languages,
   distance order) stays in index.html and is reused as is. Change list: redesign/CHANGES.md */
(function(){
"use strict";
const $=id=>document.getElementById(id);

/* ---------- R1. sections → tabs (each section lists the tabs it belongs to) ---------- */
const cards=[...document.querySelectorAll("main > section.card")];
const locCard=cards.find(c=>c.querySelector("#modeNear")), searchCard=cards.find(c=>c.querySelector("#chips")),
      listCard=cards.find(c=>c.querySelector("#list")), keyCard=$("keysec");
locCard.dataset.tabs="explore courses hike"; searchCard.dataset.tabs="explore"; listCard.dataset.tabs="explore hike";
$("coursecard").dataset.tabs="courses"; keyCard.dataset.tabs="explore"; document.querySelector("footer.foot").dataset.tabs="explore saved";
const emptyC=document.createElement("section");emptyC.className="card empty";emptyC.id="coursesEmpty";emptyC.dataset.tabs="courses";emptyC.hidden=true;
$("coursecard").after(emptyC);
const savedCard=document.createElement("section");savedCard.className="card";savedCard.id="savedCard";savedCard.dataset.tabs="saved";
savedCard.innerHTML='<h2 id="savedTitle"></h2><ol class="places" id="savedList"></ol>';
document.querySelector("footer.foot").before(savedCard);

/* ---------- R2. bottom sheet + full-screen map layer ---------- */
const guideEl=$("guide");
const sheet=document.createElement("div");sheet.className="sheet";sheet.id="sheet";sheet.hidden=true;sheet.setAttribute("role","dialog");
sheet.innerHTML='<div class="grab" id="grab" aria-hidden="true"></div>';
guideEl.before(sheet);sheet.append(guideEl);
const mapLayer=document.createElement("div");mapLayer.id="mapLayer";mapLayer.hidden=true;
mapLayer.innerHTML='<button type="button" class="mapclose" id="mapClose" aria-label="Close"><svg class="ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
sheet.before(mapLayer);

/* ---------- R3. bottom tab bar ---------- */
const nav=document.createElement("nav");nav.className="tabbar";nav.id="tabbar";nav.setAttribute("role","tablist");
const TAB_IC={explore:'<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  courses:'<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
  hike:'<path d="M3 19l6.5-11 4 6.5 2.5-4 5 8.5z"/><path d="M8.2 10.2l1.3 1.3 1.3-1.3"/>',
  saved:'<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>'};
nav.innerHTML=Object.keys(TAB_IC).map(k=>'<button type="button" role="tab" data-tab="'+k+'"><svg viewBox="0 0 24 24">'+TAB_IC[k]+'</svg><span></span></button>').join("");
document.body.append(nav);

/* ---------- strings ---------- */
const UI2={
 en:{tabs:{explore:"Explore",courses:"Walks",hike:"Hiking",saved:"Saved"},saved:"Saved places",savedNone:"Nothing saved yet. Tap ☆ Save on a place or mountain.",save:"☆ Save",saved1:"★ Saved",noCourse:"No walking course for this area yet. Choose another area above."},
 ko:{tabs:{explore:"탐색",courses:"도보코스",hike:"등산",saved:"저장"},saved:"저장한 곳",savedNone:"아직 저장한 곳이 없습니다. 장소나 산에서 ☆ 저장을 누르세요.",save:"☆ 저장",saved1:"★ 저장됨",noCourse:"이 지역에는 아직 도보 코스가 없습니다. 위에서 다른 지역을 골라 보세요."},
 ja:{tabs:{explore:"探す",courses:"散策コース",hike:"登山",saved:"保存"},saved:"保存した場所",savedNone:"まだ保存した場所はありません。場所や山の ☆ 保存 を押してください。",save:"☆ 保存",saved1:"★ 保存済み",noCourse:"この地域にはまだ散策コースがありません。上で別の地域を選んでください。"},
 zhs:{tabs:{explore:"探索",courses:"步行路线",hike:"登山",saved:"收藏"},saved:"已收藏",savedNone:"还没有收藏。点地点或山的 ☆ 收藏。",save:"☆ 收藏",saved1:"★ 已收藏",noCourse:"这个地区还没有步行路线，请在上方选择其他地区。"},
 zht:{tabs:{explore:"探索",courses:"步行路線",hike:"登山",saved:"收藏"},saved:"已收藏",savedNone:"還沒有收藏。點地點或山的 ☆ 收藏。",save:"☆ 收藏",saved1:"★ 已收藏",noCourse:"這個地區還沒有步行路線，請在上方選擇其他地區。"}};
const u2=k=>(UI2[lang]||UI2.en)[k];

/* ---------- R4. line icons on category chips (instead of OS emoji) ---------- */
const svgI=d=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+d+'</svg>';
const CHIP_IC={
 all:svgI('<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>'),
 sight:svgI('<path d="M3 9.5L12 4l9 5.5"/><path d="M5 9.5h14"/><path d="M6.5 9.5v8M10.5 9.5v8M13.5 9.5v8M17.5 9.5v8"/><path d="M4 20h16"/>'),
 temple:svgI('<path d="M12 20c-4 0-7-2.5-7-5.5 2 0 4 .8 5.2 2.2"/><path d="M12 20c4 0 7-2.5 7-5.5-2 0-4 .8-5.2 2.2"/><path d="M12 19c-2-2-2.6-6 0-10 2.6 4 2 8 0 10z"/>'),
 hike:svgI('<path d="M3 19l6.5-11 4 6.5 2.5-4 5 8.5z"/>'),
 culture:svgI('<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.6-.9 1.2-1.8-.5-1-.1-2.2 1.2-2.2H17a3.5 3.5 0 0 0 3.5-3.5c0-5.2-3.8-9.5-8.5-9.5z"/><circle cx="7.8" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="8" r="1"/>'),
 festival:svgI('<path d="M4 20l5-13 8 8z"/><path d="M14 4.5l.5 2M18.5 6l-1.5 1.5M19.5 10.5l-2 .5"/>'),
 food:svgI('<path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M9 4.5v3.5M12 3.5v4.5M15 4.5v3.5"/>'),
 shop:svgI('<path d="M5 8h14l-1 12H6z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>'),
 stay:svgI('<path d="M3 18V7M3 14h18v4M21 14v-2.5a3 3 0 0 0-3-3h-7v5.5"/><circle cx="7" cy="11" r="1.8"/>')};
const EMOJI2IC={"🏯":"sight","🪷":"temple","⛰️":"hike","🎨":"culture","🎉":"festival","🍜":"food","🛍":"shop","🛏":"stay"};
const _renderChips=renderChips;
renderChips=function(){_renderChips.apply(this,arguments);
  for(const b of document.querySelectorAll("#chips button")){
    const txt=b.textContent,sp=txt.indexOf(" "),head=sp>0?txt.slice(0,sp):"";
    const key=EMOJI2IC[head]||(head&&/\p{Extended_Pictographic}/u.test(head)?"all":"all");
    const label=EMOJI2IC[head]||/\p{Extended_Pictographic}/u.test(head)?txt.slice(sp+1):txt;
    b.innerHTML=CHIP_IC[key];b.append(document.createTextNode(label));
  }};

/* ---------- R5. saved places and mountains (this device only) ---------- */
function savedAll(){try{return JSON.parse(store.get("saved")||"[]")}catch(e){return[]}}
const savedKey=(type,x)=>type==="hike"?"hike:"+x.id:"place:"+(x.contentid||x.title);
const isSaved=(type,x)=>savedAll().some(s=>s.k===savedKey(type,x));
function toggleSaved(type,x){const k=savedKey(type,x);let a=savedAll();
  if(a.some(s=>s.k===k))a=a.filter(s=>s.k!==k);else a.unshift({k,type,x:type==="hike"?{id:x.id}:x,at:Date.now()});
  store.set("saved",JSON.stringify(a.slice(0,100)));}
function saveBtn(type,x){const b=el("button","ghost small savebtn");b.type="button";
  const set=()=>{const on=isSaved(type,x);b.textContent=on?u2("saved1"):u2("save");b.setAttribute("aria-pressed",String(on));};set();
  b.onclick=()=>{toggleSaved(type,x);set();if(document.body.dataset.tab==="saved")renderSaved();};return b;}
// add a Save button to each row the app draws (same order as the items it was given)
const _renderList=renderList;
renderList=function(items){_renderList.apply(this,arguments);
  [...$("list").children].forEach((li,i)=>{const it=items[i],acts=li.querySelector(".acts");if(it&&acts)acts.append(saveBtn("place",it));});};
const _searchHikes=searchHikes;
searchHikes=async function(){await _searchHikes.apply(this,arguments);const ms=await loadHikes();if(!ms)return;
  for(const li of $("list").children){const name=li.querySelector(".t")?.textContent,m=ms.find(x=>L10(x.name)===name),acts=li.querySelector(".acts");
    if(m&&acts)acts.append(saveBtn("hike",m));const th=li.querySelector(".hikethumb");if(th)th.innerHTML=CHIP_IC.hike;}};
async function renderSaved(){
  $("savedTitle").textContent=u2("saved");const ul=$("savedList");ul.innerHTML="";
  const a=savedAll();
  if(!a.length){const li=el("li","empty");li.innerHTML=svgI('<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>');li.append(document.createTextNode(u2("savedNone")));ul.append(li);return;}
  const ms=a.some(s=>s.type==="hike")?await loadHikes():null,pos=origin();
  for(const s of a){
    const li=el("li"),info=el("div","info"),acts=el("div","acts");
    if(s.type==="hike"){const m=(ms||[]).find(x=>x.id===s.x.id);if(!m)continue;
      info.append(el("div","t",L10(m.name)),el("div","pm",[m.heightM?m.heightM+" m":"",hk("diff")[m.difficulty],L10(m.time)].filter(Boolean).join(" · ")));
      const g=el("button","small",hk("guide"));g.type="button";g.onclick=()=>openHike(m);acts.append(g,saveBtn("hike",m));
      const th=el("div","thumb hikethumb");th.innerHTML=CHIP_IC.hike;li.append(th,info);
    }else{const it=s.x;
      const addr=el("div","a");if(pos&&it.mapy)addr.append(el("span","d",fmtD(meters(pos.lat,pos.lng,+it.mapy,+it.mapx))));addr.append(document.createTextNode([it.addr1,it.addr2].filter(Boolean).join(" ")));
      info.append(el("div","t",it.title||""),addr);
      const g=el("button","small",t("guide"));g.type="button";g.onclick=()=>openGuide(it);acts.append(g,saveBtn("place",it));
      li.append(img(it,"thumb"),info);}
    info.append(acts);ul.append(li);
  }
}

/* ---------- R6. tabs ---------- */
function tabLabels(){for(const b of nav.querySelectorAll("button"))b.querySelector("span").textContent=u2("tabs")[b.dataset.tab];}
async function setTab(tab,{silent}={}){
  document.body.dataset.tab=tab;store.set("tab",tab);
  for(const b of nav.querySelectorAll("button"))b.setAttribute("aria-selected",String(b.dataset.tab===tab));
  closeSheet();window.scrollTo({top:0});
  if(silent)return;
  if(tab==="hike"){if(cat!=="hike"){cat="hike";renderChips();}search();}
  else if(tab==="explore"){if(cat==="hike"){cat="";renderChips();search();}}
  else if(tab==="courses"){await renderCourseCard();const none=$("coursecard").hidden;emptyC.hidden=!none;emptyC.textContent=none?u2("noCourse"):"";}
  else if(tab==="saved")renderSaved();
}
nav.querySelectorAll("button").forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
// changing the area while on the Walks tab refreshes the course card
$("area").addEventListener("change",()=>{if(document.body.dataset.tab==="courses")setTab("courses");});

/* ---------- R7. the sheet: open/close, map in the layer behind it, drag, back button ---------- */
const SNAP={full:4,half:46,peek:74};   // % of the sheet hidden below the screen edge
let sheetState="half",pushed=false;
const setY=p=>sheet.style.setProperty("--sheet-y",p+"%");
function setSheet(state){sheetState=state;setY(SNAP[state]);}
// height of the map that is not covered by the sheet
function freeMapH(){const ml=mapLayer.getBoundingClientRect(),sh=sheet.getBoundingClientRect();return Math.max(80,Math.min(ml.bottom,sh.top)-ml.top);}
function refreshMap(fit){setTimeout(()=>{try{if(!map)return;const b=$("map");
  if(engine==="naver")map.setSize(new naver.maps.Size(b.clientWidth,b.clientHeight));else map.invalidateSize();
  if(fit)fitAll();}catch(e){}},320);}
// fit the route into the part of the map above the sheet (not under it);
// your position is included only when it is near (otherwise the map zooms out to the whole region)
const _fitAll=fitAll;
fitAll=function(){
  if(sheet.hidden||!map)return _fitAll.apply(this,arguments);
  try{
    const pts=[destLL,originLL,...routePts].filter(Boolean);
    if(gpsPos&&destLL&&meters(gpsPos.lat,gpsPos.lng,destLL[0],destLL[1])<15000)pts.push([gpsPos.lat,gpsPos.lng]);
    let s=90,w=180,n=-90,e=-180;for(const q of pts){s=Math.min(s,q[0]);n=Math.max(n,q[0]);w=Math.min(w,q[1]);e=Math.max(e,q[1]);}
    const b=$("map"),covered=Math.max(0,b.clientHeight-freeMapH());
    if(engine==="naver"){map.fitBounds(new naver.maps.LatLngBounds(N([s,w]),N([n,e])),{top:70,right:30,bottom:covered+30,left:30});if(map.getZoom()>17)map.setZoom(17);}
    else map.fitBounds([[s,w],[n,e]],{paddingTopLeft:[30,70],paddingBottomRight:[30,covered+30],maxZoom:17});
  }catch(err){_fitAll.apply(this,arguments);}
};
function openSheet(){sheet.hidden=false;mapLayer.hidden=false;document.body.classList.add("sheet-open");setSheet("half");refreshMap(true);setTimeout(()=>refreshMap(true),1200);
  if(!pushed){history.pushState({sheet:1},"");pushed=true;}}
function closeSheet(){if(sheet.hidden)return;stopSpeaking();guideEl.hidden=true;}
new MutationObserver(()=>{
  if(guideEl.hidden){sheet.hidden=true;mapLayer.hidden=true;document.body.classList.remove("sheet-open");
    if(pushed){pushed=false;if(history.state&&history.state.sheet)history.back();}}
  else if(sheet.hidden)openSheet();
}).observe(guideEl,{attributes:true,attributeFilter:["hidden"]});
// the app puts its map inside the guide; move that same element to the full-screen layer
new MutationObserver(()=>{
  const m=guideEl.querySelector("#map");
  if(m){for(const old of [...mapLayer.querySelectorAll("#map")])if(old!==m)old.remove();mapLayer.append(m);refreshMap(false);guideEl.scrollTop=0;}
}).observe(guideEl,{childList:true});
// Android back / browser back closes the sheet instead of leaving the app
addEventListener("popstate",()=>{if(pushed){pushed=false;closeSheet();}});
$("mapClose").onclick=closeSheet;
addEventListener("keydown",e=>{if(e.key==="Escape"&&!sheet.hidden)closeSheet();});
// drag: from the handle anywhere; from the content when it is scrolled to the top (down) or the sheet is not full (up)
(function(){
  let y0=0,start=0,h=0,mode=null,lastY=0,lastT=0,vel=0;
  const cur=()=>parseFloat(sheet.style.getPropertyValue("--sheet-y"))||SNAP[sheetState];
  function begin(y){y0=lastY=y;lastT=performance.now();vel=0;start=cur();h=sheet.getBoundingClientRect().height;mode="pending";}
  function moveTo(y,fromContent){
    const dy=y-y0;
    if(mode==="pending"){
      if(Math.abs(dy)<6)return false;
      if(fromContent){const top=guideEl.scrollTop<=0;
        if(!((dy>0&&top)||(dy<0&&sheetState!=="full"))){mode=null;return false;}}
      mode="drag";sheet.classList.add("dragging");
    }
    if(mode!=="drag")return false;
    const now=performance.now();vel=(y-lastY)/Math.max(1,now-lastT);lastY=y;lastT=now;
    setY(Math.min(92,Math.max(0,start+dy/h*100)));return true;
  }
  function end(){
    if(mode!=="drag"){mode=null;return;}
    mode=null;sheet.classList.remove("dragging");const p=cur();
    if(p>84||(vel>0.9&&sheetState==="peek")){setSheet("peek");closeSheet();return;}
    let next;
    if(Math.abs(vel)>0.45)next=vel<0?(p<SNAP.half?"full":"half"):(p>SNAP.half?"peek":"half");
    else next=Object.keys(SNAP).sort((a,b)=>Math.abs(SNAP[a]-p)-Math.abs(SNAP[b]-p))[0];
    setSheet(next);refreshMap(true);
  }
  const grab=$("grab");
  grab.addEventListener("pointerdown",e=>{begin(e.clientY);grab.setPointerCapture?.(e.pointerId);});
  grab.addEventListener("pointermove",e=>{if(mode)moveTo(e.clientY,false);});
  grab.addEventListener("pointerup",end);grab.addEventListener("pointercancel",end);
  grab.addEventListener("click",()=>setSheet(sheetState==="full"?"half":"full"));
  guideEl.addEventListener("touchstart",e=>{if(e.touches.length===1)begin(e.touches[0].clientY);},{passive:true});
  guideEl.addEventListener("touchmove",e=>{if(!mode)return;if(moveTo(e.touches[0].clientY,true))e.preventDefault();},{passive:false});
  guideEl.addEventListener("touchend",end);guideEl.addEventListener("touchcancel",end);
})();

/* ---------- S. strings for stage 2 ---------- */
const UI3={
 en:{play:"Play",pause:"Pause",back15:"Back 15 seconds",cc:"Subtitles",close:"Stop",stop:n=>"Stop "+n,
  safe:"Safe",caution:"Caution",danger:"Danger",now:"Now",back:"Back down",sunset:"Sunset",dark:"The sun has already set. Do not start a hike now.",
  gaugeSafe:"You should be down well before sunset.",gaugeCaution:"Tight: less than an hour of daylight to spare. Keep a steady pace and set a turn-back time.",gaugeDanger:"You would still be on the mountain after sunset. Start earlier or choose a shorter route.",
  sos:"119 Emergency (copies my location)",sosNote:"Copies your GPS coordinates, then calls 119 (fire & rescue). Read out the coordinates and the number on the nearest yellow trail signpost (National Point Number).",copied:"Location copied",noFix:"Location not available — describe where you are.",
  tipTitle:"Before you open the map app",tipNaver:"NAVER Map: works best in the app. If it isn't installed, get “NAVER Map” from the Play Store / App Store first. To use it in English, Japanese or Chinese: open the app → Settings → Language.",tipKakao:"Kakao Map: opens in the app if installed, otherwise in the web browser. It shows mostly Korean — the place name from K-Trip helps you check you have the right place.",tipGo:"Open",tipCancel:"Cancel"},
 ko:{play:"재생",pause:"일시정지",back15:"15초 뒤로",cc:"자막",close:"정지",stop:n=>n+"번 지점",
  safe:"안전",caution:"주의",danger:"위험",now:"지금",back:"예상 하산",sunset:"일몰",dark:"이미 해가 졌습니다. 지금은 산행을 시작하지 마세요.",
  gaugeSafe:"일몰 전에 여유 있게 하산할 수 있습니다.",gaugeCaution:"빠듯합니다: 일몰까지 여유가 1시간이 안 됩니다. 페이스를 유지하고 되돌아올 시각을 정하세요.",gaugeDanger:"일몰 뒤에도 산에 있게 됩니다. 일찍 출발하거나 짧은 코스를 고르세요.",
  sos:"119 긴급 신고 (내 위치 복사)",sosNote:"현재 GPS 좌표를 복사한 뒤 119(소방·구조)로 전화를 겁니다. 좌표와 가장 가까운 노란색 등산로 표지판의 국가지점번호를 알려 주세요.",copied:"위치를 복사했습니다",noFix:"위치를 확인할 수 없습니다 — 주변 지형지물을 설명하세요.",
  tipTitle:"지도 앱을 열기 전에",tipNaver:"네이버지도: 앱에서 가장 잘 동작합니다. 설치되어 있지 않으면 Play 스토어/App Store에서 ‘네이버지도’를 먼저 설치하세요. 영어·일본어·중국어로 보려면 앱 → 설정 → 언어에서 바꿀 수 있습니다.",tipKakao:"카카오맵: 앱이 있으면 앱으로, 없으면 웹 브라우저로 열립니다. 주로 한국어로 표시되니, K-Trip에 보이는 장소 이름으로 맞는 곳인지 확인하세요.",tipGo:"열기",tipCancel:"취소"},
 ja:{play:"再生",pause:"一時停止",back15:"15秒戻る",cc:"字幕",close:"停止",stop:n=>"スポット"+n,
  safe:"安全",caution:"注意",danger:"危険",now:"今",back:"下山予定",sunset:"日の入り",dark:"すでに日が沈みました。今から登山を始めないでください。",
  gaugeSafe:"日の入り前に余裕を持って下山できます。",gaugeCaution:"ぎりぎりです。日の入りまでの余裕が1時間未満です。ペースを保ち、引き返す時刻を決めてください。",gaugeDanger:"日の入り後も山にいることになります。早めに出発するか、短いコースを選んでください。",
  sos:"119 緊急通報（現在地をコピー）",sosNote:"現在のGPS座標をコピーしてから119（消防・救助）に電話します。座標と、近くの黄色い登山道標識の「国家地点番号」を伝えてください。",copied:"現在地をコピーしました",noFix:"位置を取得できません。周りの目印を伝えてください。",
  tipTitle:"地図アプリを開く前に",tipNaver:"NAVER Map：アプリで使うのが一番です。未インストールなら Play ストア / App Store で「NAVER Map」を先に入れてください。日本語・英語・中国語にするには、アプリ → 設定 → 言語。",tipKakao:"Kakao Map：アプリがあればアプリで、なければブラウザで開きます。表示は主に韓国語なので、K-Trip の場所名で確認してください。",tipGo:"開く",tipCancel:"キャンセル"},
 zhs:{play:"播放",pause:"暂停",back15:"后退15秒",cc:"字幕",close:"停止",stop:n=>"第"+n+"站",
  safe:"安全",caution:"注意",danger:"危险",now:"现在",back:"预计下山",sunset:"日落",dark:"太阳已经落山，现在不要开始登山。",
  gaugeSafe:"可以在日落前从容下山。",gaugeCaution:"时间紧张：距日落不到1小时余量。请保持节奏并定好折返时间。",gaugeDanger:"日落后您仍会在山上。请早点出发或选择较短路线。",
  sos:"119 紧急求救（复制我的位置）",sosNote:"先复制当前GPS坐标，再拨打119（消防·救援）。请报出坐标和附近黄色登山路标上的“国家地点编号”。",copied:"已复制位置",noFix:"无法获取位置，请描述周围的地标。",
  tipTitle:"打开地图应用前",tipNaver:"NAVER Map：在应用中使用效果最好。如未安装，请先在 Play 商店 / App Store 安装“NAVER Map”。切换为中文、英文或日文：应用 → 设置 → 语言。",tipKakao:"Kakao Map：已安装则在应用中打开，否则在浏览器中打开。界面以韩文为主，请用 K-Trip 中的地点名称核对。",tipGo:"打开",tipCancel:"取消"},
 zht:{play:"播放",pause:"暫停",back15:"倒退15秒",cc:"字幕",close:"停止",stop:n=>"第"+n+"站",
  safe:"安全",caution:"注意",danger:"危險",now:"現在",back:"預計下山",sunset:"日落",dark:"太陽已經下山，現在不要開始登山。",
  gaugeSafe:"可以在日落前從容下山。",gaugeCaution:"時間緊湊：距日落不到1小時餘裕。請保持節奏並訂好折返時間。",gaugeDanger:"日落後您仍會在山上。請提早出發或選擇較短路線。",
  sos:"119 緊急求救（複製我的位置）",sosNote:"先複製目前GPS座標，再撥打119（消防・救援）。請報出座標和附近黃色登山路標上的「國家地點編號」。",copied:"已複製位置",noFix:"無法取得位置，請描述周圍的地標。",
  tipTitle:"開啟地圖App前",tipNaver:"NAVER Map：在App中使用效果最好。如未安裝，請先在 Play 商店 / App Store 安裝「NAVER Map」。切換為中文、英文或日文：App → 設定 → 語言。",tipKakao:"Kakao Map：已安裝則在App中開啟，否則在瀏覽器中開啟。介面以韓文為主，請用 K-Trip 中的地點名稱核對。",tipGo:"開啟",tipCancel:"取消"}};
const u3=k=>(UI3[lang]||UI3.en)[k];
const IC={play:'<path d="M8 5.5v13l10.5-6.5z"/>',pause:'<path d="M8 5.5v13M16 5.5v13"/>',
  back15:'<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v3.5H8"/><text x="12" y="15.2" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor" stroke="none">15</text>',
  cc:'<rect x="3.5" y="6" width="17" height="12" rx="2.5"/><path d="M10.5 10.3a2 2 0 1 0 0 3.4M16.5 10.3a2 2 0 1 0 0 3.4"/>',
  x:'<path d="M6 6l12 12M18 6L6 18"/>',sos:'<path d="M12 3.5l9 16H3z"/><path d="M12 10v4.5M12 17.2v.3"/>'};
const ic=k=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+IC[k]+'</svg>';

/* ---------- P. floating audio mini player + lock-screen controls (Media Session) ---------- */
const player=document.createElement("div");player.className="miniplayer";player.id="miniplayer";player.hidden=true;
player.innerHTML='<div class="mp-n" id="mpN"></div><div class="mp-txt"><div class="mp-t" id="mpT"></div><div class="mp-sub" id="mpSub" hidden></div></div>'+
  '<button type="button" class="mp-b" id="mpBack">'+ic("back15")+'</button><button type="button" class="mp-b mp-main" id="mpPlay">'+ic("pause")+'</button>'+
  '<button type="button" class="mp-b" id="mpCC" aria-pressed="false">'+ic("cc")+'</button><button type="button" class="mp-b" id="mpX">'+ic("x")+'</button>';
document.body.append(player);
let mp={s:null,btn:null,lines:[],idx:0,ttsU:null,ccOn:store.get("cc")==="1"};
// remember which sentence the phone's voice is reading (for subtitles and "back 15 s")
if("speechSynthesis" in window){const _speak=speechSynthesis.speak.bind(speechSynthesis);
  speechSynthesis.speak=function(u){mp.ttsU=u;const i=mp.lines.indexOf(u.text);if(i>=0)mp.idx=i;updateSub();return _speak(u);};}
const isRec=()=>!!(narr&&mp.s);
function playing(){if(narr)return !narr.paused;try{return speechSynthesis.speaking&&!speechSynthesis.paused;}catch(e){return false;}}
function updateSub(){const sub=$("mpSub");sub.hidden=!mp.ccOn;if(!mp.ccOn||!mp.s)return;
  let i=mp.idx;
  if(narr&&narr.duration>0){ // recorded narration: estimate the sentence from the playback position
    const tot=mp.lines.reduce((a,x)=>a+x.length,0),at=narr.currentTime/narr.duration*tot;let acc=0;i=0;
    for(;i<mp.lines.length-1;i++){acc+=mp.lines[i].length;if(acc>at)break;}}
  sub.textContent=mp.lines[i]||"";}
function updatePlayer(){
  if(!mp.s)return;
  if(!speakingBtn&&!narr){hidePlayer();return;}
  const on=playing();$("mpPlay").innerHTML=ic(on?"pause":"play");$("mpPlay").setAttribute("aria-label",u3(on?"pause":"play"));
  $("mpCC").setAttribute("aria-pressed",String(mp.ccOn));updateSub();
  if("mediaSession" in navigator)try{navigator.mediaSession.playbackState=on?"playing":"paused";}catch(e){}
}
function showPlayer(s,btn){
  mp.s=s;mp.btn=btn;mp.idx=0;mp.lines=[L10(s.name)+"."].concat(sentences(L10(s.text)));
  $("mpN").textContent=s.n?s.n:"♪";$("mpT").textContent=L10(s.name);
  for(const [id,k] of [["mpBack","back15"],["mpCC","cc"],["mpX","close"]])$(id).setAttribute("aria-label",u3(k));
  player.hidden=false;document.body.classList.add("player-on");updatePlayer();
  if("mediaSession" in navigator){try{
    navigator.mediaSession.metadata=new MediaMetadata({title:L10(s.name),artist:"K-Trip Companion",album:(current&&current.title)||"",
      artwork:[{src:"icons/icon-192.png",sizes:"192x192",type:"image/png"},{src:"icons/icon-512.png",sizes:"512x512",type:"image/png"}]});
    navigator.mediaSession.setActionHandler("play",()=>togglePlay(true));
    navigator.mediaSession.setActionHandler("pause",()=>togglePlay(false));
    navigator.mediaSession.setActionHandler("seekbackward",()=>back15());
    navigator.mediaSession.setActionHandler("stop",()=>stopSpeaking());
  }catch(e){}}
}
function hidePlayer(){mp.s=null;player.hidden=true;document.body.classList.remove("player-on");
  if("mediaSession" in navigator)try{navigator.mediaSession.playbackState="none";navigator.mediaSession.metadata=null;}catch(e){}}
function togglePlay(want){const on=playing();if(want===undefined)want=!on;
  if(narr){want?narr.play().catch(()=>{}):narr.pause();}
  else try{want?speechSynthesis.resume():speechSynthesis.pause();}catch(e){}
  setTimeout(updatePlayer,60);}
function back15(){
  if(narr){narr.currentTime=Math.max(0,narr.currentTime-15);updatePlayer();return;}
  // the phone's voice cannot seek: restart about two sentences (≈15 s) earlier
  if(!mp.s||!speakingBtn)return;const btn=speakingBtn,from=Math.max(0,mp.idx-2),rest=mp.lines.slice(from);
  if(mp.ttsU){mp.ttsU.onend=null;mp.ttsU.onerror=null;}speakQ=[];try{speechSynthesis.cancel();}catch(e){}
  const first=rest.shift()||"";const s2={name:{[lang]:first.replace(/[.。．]$/,"")},text:{[lang]:rest.join(" ")}};
  const done=()=>{if(speakingBtn===btn){btn.textContent=t("listen");speakingBtn=null;}narr=null;};
  setTimeout(()=>{speakingBtn=btn;deviceSpeak(s2,btn,done);mp.idx=from;updatePlayer();},120);
}
$("mpPlay").onclick=()=>togglePlay();$("mpBack").onclick=back15;$("mpX").onclick=()=>{stopSpeaking();hidePlayer();};
$("mpCC").onclick=()=>{mp.ccOn=!mp.ccOn;store.set("cc",mp.ccOn?"1":"0");updatePlayer();};
const _toggleSpeak=toggleSpeak;
toggleSpeak=function(s,btn){_toggleSpeak.apply(this,arguments);if(speakingBtn===btn)showPlayer(s,btn);else hidePlayer();};
setInterval(()=>{if(mp.s)updatePlayer();},400);

/* ---------- H. hiking safety: sunset gauge + one-touch 119 ---------- */
function gauge(m){
  const now=new Date(),ss=sunsetAt(m.trailhead.lat,m.trailhead.lng),need=(m.upMin*1.8+30)*6e4,ret=new Date(now.getTime()+need);
  const box=el("div","gauge");
  if(now>=ss&&now.getHours()>=12){box.classList.add("danger");box.append(el("div","g-head",u3("danger")+" · "+u3("dark")));return box;}
  const level=ret>ss?"danger":ret>new Date(ss.getTime()-36e5)?"caution":"safe";
  box.classList.add(level);
  const end=new Date(Math.max(ss.getTime(),ret.getTime())+30*6e4),span=end-now,pct=d=>Math.max(0,Math.min(100,(d-now)/span*100));
  const head=el("div","g-head");head.append(el("span","g-chip",u3(level)),document.createTextNode(" "+u3(level==="safe"?"gaugeSafe":level==="caution"?"gaugeCaution":"gaugeDanger")));
  const bar=el("div","g-bar");
  const cut1=pct(new Date(ss.getTime()-36e5)),cut2=pct(ss);
  bar.style.setProperty("--c1",cut1+"%");bar.style.setProperty("--c2",cut2+"%");
  const mk=(cls,p,label)=>{const x=el("div","g-mk "+cls);x.style.left=p+"%";x.append(el("span",null,label));return x;};
  bar.append(mk("g-ret",pct(ret),u3("back")+" "+hhmm(ret)),mk("g-ss",cut2,u3("sunset")+" "+hhmm(ss)));
  const axis=el("div","g-axis");axis.append(el("span",null,u3("now")+" "+hhmm(now)),el("span",null,hhmm(end)));
  box.append(head,bar,axis);return box;
}
function sosBlock(m){
  const wrap=el("div","sos");
  const b=el("a","sosbtn");b.href="tel:119";b.innerHTML=ic("sos");b.append(document.createTextNode(u3("sos")));
  const out=el("div","meta sos-out");
  b.addEventListener("click",()=>{ // copy first (inside the tap), then the phone dialer opens
    const p=gpsPos;
    if(p){const txt=p.lat.toFixed(5)+", "+p.lng.toFixed(5)+" ("+L10(m.name)+")";out.textContent="📍 "+txt;
      try{navigator.clipboard&&navigator.clipboard.writeText(txt).then(()=>{out.textContent="✓ "+u3("copied")+": "+txt;});}catch(e){}}
    else{out.textContent=u3("noFix");if(watchId===null&&hasConsent())$("gps").click();}
  });
  wrap.append(b,el("div","meta",u3("sosNote")),out);return wrap;
}
const _openHike=openHike;
openHike=async function(m){
  const p=_openHike.apply(this,arguments);
  // replace the plain sunset line with the gauge, and add the 119 button under it
  const line=[...guideEl.children].find(x=>/^🌇/.test(x.textContent||""));
  if(line){const g=gauge(m);line.replaceWith(g);g.after(sosBlock(m));}
  return p;
};

/* ---------- T. first-time tip before handing off to NAVER Map / Kakao Map ---------- */
const tip=document.createElement("div");tip.className="tipwrap";tip.hidden=true;
tip.innerHTML='<div class="tipbox" role="dialog" aria-modal="true"><h3 id="tipT"></h3><p id="tipN"></p><p id="tipK"></p><div class="row"><button type="button" id="tipGo"></button><button type="button" class="ghost" id="tipNo"></button></div></div>';
document.body.append(tip);
let tipTarget=null;
document.addEventListener("click",e=>{
  const a=e.target.closest&&e.target.closest("a,button");if(!a||!guideEl.contains(a))return;
  const txt=(a.textContent||"").trim();if(txt!==t("naver")&&txt!==t("kakao"))return;
  if(store.get("handoffTip")==="1")return;
  e.preventDefault();e.stopImmediatePropagation();tipTarget=a;
  $("tipT").textContent=u3("tipTitle");$("tipN").textContent=u3("tipNaver");$("tipK").textContent=u3("tipKakao");
  $("tipGo").textContent=u3("tipGo");$("tipNo").textContent=u3("tipCancel");tip.hidden=false;$("tipGo").focus();
},true);
$("tipGo").onclick=()=>{store.set("handoffTip","1");tip.hidden=true;if(tipTarget)tipTarget.click();tipTarget=null;};
$("tipNo").onclick=()=>{store.set("handoffTip","1");tip.hidden=true;tipTarget=null;};

/* ---------- R8. developer card only with ?dev=1 ---------- */
if(new URLSearchParams(location.search).get("dev")==="1")document.body.classList.add("dev");

/* ---------- start ---------- */
const _applyLang=applyLang;
applyLang=function(){_applyLang.apply(this,arguments);tabLabels();if(document.body.dataset.tab==="saved")renderSaved();};
window.__v2={setTab,renderSaved,setSheet};
renderChips();tabLabels();
const first=["explore","courses","hike","saved"].includes(store.get("tab"))?store.get("tab"):"explore";
setTab(first,{silent:first==="explore"});
})();
