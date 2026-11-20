/* K-Trip Companion — Redesign v2 overlay (behaviour).
   Runs after the app's own script in next.html and only rearranges the screen:
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
function openSheet(){sheet.hidden=false;mapLayer.hidden=false;document.body.classList.add("sheet-open");setSheet("half");refreshMap(true);
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
