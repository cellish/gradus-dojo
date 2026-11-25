/* Gradus 対位法ドリル — app.js(画面・操作・保存・音・MIDI)
 * 計算は engine.js(GE)。重い計算は worker.js 経由で task() から呼ぶ。
 */
(function(){
'use strict';
const G=window.GE;
const {LETTERS,N,midi,nameOf,noteStr,cpy,ivName,FUX,MODES,FUX_NOTES,modeOf,SPECIES,PATTERNS,PAT_FIRST,PAT_MID,hasEighth,
  defaultRhythm,RULES,RULE_LV,PRESETS,INJECT,buildSlots,skey,valsOf,editable,analyze,cfIssues,parseCF}=G;
const LEFT=G.LEFT;
const SAMPLE={'1-dorian-above':'A4 A4 B4 A4 B4 D5 C5 D5 D5 C5 D5'};
const $=s=>document.querySelector(s);
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ================= worker ================= */
let worker=null,wseq=0;const wwait={};
function runLocal(type,a){
  if(type==='solve')return G.solveFor(a.sp,a.cf,a.above,a.rhythm,a.ties,a.ms||2500);
  if(type==='genCF')return G.genCFChecked(a.mode,a.len,a.sps,a.budget||9000);
  if(type==='question')return G.makeQuestion(a.rule,a.prefSp);
  if(type==='cfSolvable')return G.cfSolvable(a.notes,a.sps,a.ms||600);
  if(type==='drill')return window.GD.make(a.id);
  throw new Error('unknown task '+type);
}
function failoverWorker(){
  if(!worker)return;try{worker.terminate();}catch(e){}worker=null;
  for(const [id,w] of Object.entries(wwait)){delete wwait[id];setTimeout(()=>{try{w.res(runLocal(w.type,w.args));}catch(e){w.rej(e);}},10);}
}
function initWorker(){
  try{
    worker=new Worker('js/worker.js');
    worker.onmessage=e=>{const {id,ok,result,error}=e.data||{};const w=wwait[id];if(!w)return;delete wwait[id];ok?w.res(result):w.rej(new Error(error));};
    worker.onerror=ev=>{if(ev&&ev.preventDefault)ev.preventDefault();failoverWorker();};
  }catch(e){worker=null;}
}
function task(type,args){
  if(worker)return new Promise((res,rej)=>{const id=++wseq;wwait[id]={res,rej,type,args};worker.postMessage({id,type,args});});
  return new Promise((res,rej)=>setTimeout(()=>{try{res(runLocal(type,args));}catch(e){rej(e);}},20));
}

/* ================= storage ================= */
const STORE='gradus-v2';
let store={drafts:{},prefs:{},history:[],stats:{},cfs:[],cfSeq:0,drillStats:{}};
function normStore(){store.drafts=store.drafts||{};store.prefs=store.prefs||{};store.history=store.history||[];store.stats=store.stats||{};store.cfs=store.cfs||[];store.cfSeq=store.cfSeq||0;store.drillStats=store.drillStats||{};}
function loadStore(){
  try{
    const s=JSON.parse(localStorage.getItem(STORE)||'null');
    if(s){store=Object.assign(store,s);normStore();return;}
    const old=JSON.parse(localStorage.getItem('gradus-drafts-v1')||'null');
    if(old&&old.drafts){
      for(const k in old.drafts){
        if(k.startsWith('_seen_')){store.drafts['_seen_1-'+k.slice(6)]=1;continue;}
        const cp={};(old.drafts[k]||[]).forEach((x,m)=>{if(x)cp[m+':0']=x;});store.drafts['1-'+k]={cp};
      }
      store.prefs={sp:1,mode:old.mode,above:old.above};
    }
  }catch(e){}
}
function persist(){try{localStorage.setItem(STORE,JSON.stringify(store));}catch(e){}}

/* ================= cantus firmus entries ================= */
function cfEntry(id){
  if(FUX_NOTES[id])return {id,kind:'fux',notes:FUX_NOTES[id],label:`${MODES[id].name}(${LETTERS[FUX_NOTES[id][FUX_NOTES[id].length-1].s%7]})`,short:`${MODES[id].name}(フックス)`};
  const e=store.cfs.find(x=>x.id===id);
  return e?{id,kind:e.kind,notes:e.notes.split(' ').map(N),label:e.label,short:e.label}:null;
}
const cfNotes=id=>(cfEntry(id)||cfEntry('dorian')).notes;

/* ================= state ================= */
const H=6,TOP=26,SMAX=45,SMIN=14,GAP=30;
const y=s=>TOP+(SMAX-s)*H+(s<=27?GAP:0);
function stepAt(yy){if(yy>y(28)+H+GAP/2)return Math.min(27,Math.round(SMAX-(yy-TOP-GAP)/H));return Math.max(28,Math.round(SMAX-(yy-TOP)/H));}
const NOTE_BOTTOM=y(SMIN);
const state={cfTemp:null,view:'practice',sp:1,mode:'dorian',above:true,cp:{},rhythm:[],ties:[],sel:0,
  hints:false,fb:'live',ivMode:'raw',levels:{},zoom:1,checkedSig:null,compare:null,focus:[],hist:[],future:[],example:false,playing:false,playSlot:-1};
const busy={cmp:false,gen:false,review:false,custom:false,fill:false};
let review=null,stash=null,curS=[],curV=[],lastR=null,clefFit=null,drawer=null;
const cf=()=>state.cfTemp||cfNotes(state.mode);
const dkey=()=>`${state.sp}-${state.mode}-${state.above?'above':'below'}`;
const cmpKey=()=>dkey()+'|'+JSON.stringify([state.rhythm,state.ties]);
const sig=()=>cmpKey()+'|'+JSON.stringify(state.cp);
// Review questions are built and checked against the strict (fux) rules, so the user's levels apply everywhere else.
const ctx=()=>({sp:state.sp,cf:cf(),above:state.above,slots:curS,vals:curV,rhythm:state.rhythm,ties:state.ties,
  levels:state.view==='review'||!Object.keys(state.levels).length?undefined:state.levels});
// state.levels holds only the rules that differ from RULE_LV (the fux default).
function cleanLevels(o){const r={};if(o&&typeof o==='object')for(const[k,v]of Object.entries(o))if(RULES[k]&&['err','warn','off'].includes(v)&&v!==RULE_LV[k])r[k]=v;return r;}
function presetOf(lv){for(const[k,p]of Object.entries(PRESETS)){const a=cleanLevels(p.levels);
  if(Object.keys(a).length===Object.keys(lv).length&&Object.keys(a).every(x=>a[x]===lv[x]))return k;}return null;}
const presetName=lv=>{const k=presetOf(lv);return k?PRESETS[k].name:'カスタム';};
function showJudg(){
  if(state.view==='review')return !!(review&&review.result);
  if(state.fill)return !!state.fill.guided||state.fill.checkedSig===sig();
  return state.fb==='live'||state.checkedSig===sig();
}
function refreshSlots(){
  const n=cf().length;
  if(state.sp===5&&state.rhythm.length!==n)state.rhythm=defaultRhythm(n);
  curS=buildSlots(state.sp,n,state.rhythm,state.ties);curV=valsOf(curS,state.cp);
  if(!(state.sel<curS.length)||!editable(curS[state.sel])){
    let j=Math.min(state.sel,curS.length-1);
    if(curS[j]&&curS[j].tiedFrom!=null)j=curS[j].tiedFrom;
    while(j<curS.length&&!editable(curS[j]))j++;
    if(j>=curS.length){j=curS.length-1;while(j>0&&!editable(curS[j]))j--;}
    state.sel=j;
  }
}
function snapshot(){return {cp:JSON.parse(JSON.stringify(state.cp)),rhythm:state.rhythm.slice(),ties:state.ties.slice()};}
function applySnap(s){state.cp=s.cp;state.rhythm=s.rhythm;state.ties=s.ties;}
function loadDraft(){
  const k=dkey(),d=store.drafts[k];state.example=false;state.compare=null;state.checkedSig=null;
  if(d){state.cp=JSON.parse(JSON.stringify(d.cp||{}));state.rhythm=(d.rhythm||[]).slice();state.ties=(d.ties||[]).slice();}
  else if(SAMPLE[k]&&!store.drafts['_seen_'+k]){state.cp={};SAMPLE[k].split(' ').forEach((x,m)=>{state.cp[m+':0']=N(x);});state.rhythm=[];state.ties=[];state.example=true;store.drafts['_seen_'+k]=1;persist();}
  else{state.cp={};state.rhythm=[];state.ties=[];}
  state.hist=[];state.future=[];state.focus=[];state.sel=0;refreshSlots();
  if(state.example)state.sel=3;
  else{const e=curS.findIndex((s,i)=>editable(s)&&!s.optRest&&!curV[i]);if(e>=0)state.sel=e;}
}
function saveDraft(){if(state.view==='review'||state.fill)return;store.drafts[dkey()]=snapshot();savePrefs();}
function savePrefs(){store.prefs={sp:state.sp,mode:state.mode,above:state.above,hint:state.hints,fb:state.fb,ivMode:state.ivMode,levels:state.levels,zoom:state.zoom,tempo:+$('#tempo').value,midi:midiOn};persist();}
function commit(next){
  state.hist.push(snapshot());if(state.hist.length>200)state.hist.shift();state.future=[];
  applySnap(next);state.example=false;state.focus=[];saveDraft();render();
}
function undo(){if(!state.hist.length)return;state.future.push(snapshot());applySnap(state.hist.pop());state.focus=[];saveDraft();render();}
function redo(){if(!state.future.length)return;state.hist.push(snapshot());applySnap(state.future.pop());state.focus=[];saveDraft();render();}
function setNote(i,note,play=true){
  const s=curS[i];if(!s)return;const root=s.tiedFrom!=null?curS[s.tiedFrom]:s;
  if(state.fill&&state.fill.locked.has(skey(root))){toast('この音は固定です。点線の枠を埋めてください。');return;}
  const cp=JSON.parse(JSON.stringify(state.cp));
  if(note)cp[skey(root)]=note;else delete cp[skey(root)];
  const sn=snapshot();sn.cp=cp;commit(sn);if(play&&note)playSlot(root.i);
}
function restructure(rhythm,ties){
  const before=curS,vb=curV,after=buildSlots(state.sp,cf().length,rhythm,ties),cp={};
  after.forEach(s=>{if(!editable(s))return;const j=before.findIndex(t=>t.m===s.m&&t.b===s.b);if(j>=0&&vb[j])cp[skey(s)]=cpy(vb[j]);});
  commit({cp,rhythm,ties});
}
function vrange(){const ss=cf().map(x=>x.s),mn=Math.min(...ss),mx=Math.max(...ss);
  const lo=state.above?mn-2:mn-11,hi=state.above?mx+11:mx+2;return [Math.max(SMIN+1,lo),Math.min(SMAX,hi)];}

/* ================= audio ================= */
let ac=null,master=null,active=[],timers=[];
function ensureAudio(){
  try{if(!ac){const C=window.AudioContext||window.webkitAudioContext;if(!C)return false;ac=new C();
      master=ac.createGain();master.gain.value=0.55;const comp=ac.createDynamicsCompressor();master.connect(comp);comp.connect(ac.destination);}
    if(ac.state==='suspended')ac.resume();return true;}catch(e){return false;}
}
const freq=n=>440*Math.pow(2,(midi(n)-69)/12);
function tone(f,t,dur,pan){
  const o1=ac.createOscillator(),o2=ac.createOscillator(),g=ac.createGain(),g2=ac.createGain(),lp=ac.createBiquadFilter();
  o1.type='triangle';o1.frequency.value=f;o2.type='sine';o2.frequency.value=f*2;g2.gain.value=0.22;
  lp.type='lowpass';lp.frequency.value=2400;o1.connect(lp);o2.connect(g2);g2.connect(lp);lp.connect(g);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.24,t+0.03);g.gain.setTargetAtTime(0.17,t+0.05,0.25);
  g.gain.setTargetAtTime(0,t+Math.max(0.06,dur-0.06),0.04);
  if(ac.createStereoPanner){const p=ac.createStereoPanner();p.pan.value=pan;g.connect(p);p.connect(master);}else g.connect(master);
  o1.start(t);o2.start(t);o1.stop(t+dur+0.3);o2.stop(t+dur+0.3);active.push(o1,o2);
}
function stopAll(){active.forEach(o=>{try{o.stop();}catch(e){}});active=[];}
function playSlot(i,dur=0.9){if(!ensureAudio()||state.playing)return;stopAll();const t=ac.currentTime+0.02,s=curS[i];
  tone(freq(cf()[s.m]),t,dur,-0.3);if(curV[i])tone(freq(curV[i]),t,dur,0.3);}
function playCols(cols){if(!ensureAudio()||state.playing)return;stopAll();const t0=ac.currentTime+0.03,d=0.7;
  cols.forEach((i,k)=>{tone(freq(cf()[curS[i].m]),t0+k*d,d*0.95,-0.3);if(curV[i])tone(freq(curV[i]),t0+k*d,d*0.95,0.3);});}
function playAll(override){
  if(state.playing){stopPlayback();return;}
  if(!ensureAudio())return;stopAll();
  const V=override||curV,q=60/+$('#tempo').value,v=$('#voiceSel').value,c=cf(),n=c.length,t0=ac.currentTime+0.1;
  state.playing=true;
  if(v!=='cp')c.forEach((note,m)=>tone(freq(note),t0+m*4*q,m===n-1?6*q:4*q*0.98,-0.3));
  curS.forEach((s,i)=>{const ts=t0+(s.m*4+s.b)*q;
    if(v!=='cf'&&V[i]&&s.tiedFrom==null){let dur=s.dur;if(s.tieTo!=null)dur+=curS[s.tieTo].dur;tone(freq(V[i]),ts,(s.m===n-1?6:dur)*q*0.96,0.3);}
    timers.push(setTimeout(()=>{state.playSlot=i;drawStaff(lastR);},Math.max(0,(ts-ac.currentTime)*1000)));});
  timers.push(setTimeout(()=>stopPlayback(false),(t0+n*4*q+0.8-ac.currentTime)*1000));
  render();
}
function stopPlayback(cut=true){timers.forEach(clearTimeout);timers=[];if(cut)stopAll();state.playing=false;state.playSlot=-1;render();}

/* ================= drawing ================= */
function noteSVG(n,x,cls,dur,stem,hideAcc){
  const yy=y(n.s);let s='';const led=[];
  if(n.s>=40)for(let k=40;k<=n.s;k+=2)led.push(k);
  if(n.s===28)led.push(28);
  if(n.s<=16)for(let k=16;k>=n.s;k-=2)led.push(k);
  const sc=cls.split(' ')[0];
  led.forEach(k=>{s+=`<line class="ledger ${sc}" x1="${x-13}" x2="${x+13}" y1="${y(k)}" y2="${y(k)}"/>`;});
  if(dur>=4)s+=`<g class="${cls}" transform="translate(${x},${yy})"><ellipse class="nb" rx="8.3" ry="5.9"/><ellipse class="hole" rx="4.3" ry="2.6" transform="rotate(-38)"/></g>`;
  else{
    s+=`<g class="${cls}" transform="translate(${x},${yy})"><ellipse class="nb" rx="7.2" ry="5.1" transform="rotate(-22)"/>${dur===2?'<ellipse class="hole" rx="4.9" ry="2.2" transform="rotate(-22)"/>':''}</g>`;
    if(stem==='up')s+=`<line class="stem ${sc}" x1="${x+6.4}" x2="${x+6.4}" y1="${yy-1.5}" y2="${yy-40}"/>`;
    else if(stem==='down')s+=`<line class="stem ${sc}" x1="${x-6.4}" x2="${x-6.4}" y1="${yy+1.5}" y2="${yy+40}"/>`;
  }
  if(n.a&&!hideAcc)s+=`<text class="acc ${sc}" x="${x-17}" y="${yy}" text-anchor="middle" dominant-baseline="central">${n.a>0?'♯':'♭'}</text>`;
  return s;
}
function restSVG(x,dur,opt){
  const mid=y(state.above?34:22),o=opt?' opt':'';
  if(dur===2)return `<rect class="rest${o}" x="${x-6}" y="${mid-5}" width="12" height="5"/>`;
  return `<path class="qrest${o}" d="M${x-3},${mid-13} L${x+3},${mid-6} L${x-2},${mid} L${x+3},${mid+6} Q${x-4},${mid+3} ${x-1},${mid+12}"/>`;
}
function hintSet(i){
  const res=[],[lo,hi]=vrange(),s=curS[i];
  for(let st=lo;st<=hi;st++){for(const a of(i===lastR.la?[0,1]:[0])){
    const cp=Object.assign({},state.cp);cp[skey(s)]={s:st,a};
    const r=analyze({...ctx(),vals:valsOf(curS,cp)});
    if(!r.issues.some(x=>x.lv==='err'&&x.cols.includes(i))){res.push({s:st,a});break;}}}
  return res;
}
function ivLabel(v){
  if(state.ivMode==='simple')return String(v.d===0?1:((v.d-1)%7)+2);
  if(state.ivMode==='quality')return v.q+(v.d+1);
  return String(v.d+1);
}
const LINE_RULES=new Set(['parallel','hidden','beatpar','antiparallel']);
function drawStaffLegacy(r){
  const c=cf(),n=c.length,S=curS,V=curV,{MW,g}=SPECIES[state.sp],judge=showJudg();
  const W=LEFT+n*MW+28,Hh=NOTE_BOTTOM+80,svg=$('#staff');
  svg.setAttribute('width',W);svg.setAttribute('height',Hh);svg.setAttribute('viewBox',`0 0 ${W} ${Hh}`);
  const lv=new Array(S.length).fill(null);
  if(judge)r.issues.forEach(is=>is.cols.forEach(i=>{if(is.lv==='err')lv[i]='err';else if(!lv[i])lv[i]='warn';}));
  const tt=y(38)-24,tb=y(18)+24,rx=i=>LEFT+S[i].m*MW+MW*S[i].b/4,rw=i=>MW*S[i].dur/4,cfx=m=>LEFT+m*MW+MW*(g/2)/4;let s='';
  for(let i=0;i<S.length;i++){
    if(lv[i])s+=`<rect class="t-${lv[i]}" x="${rx(i)+2}" y="${tt}" width="${rw(i)-4}" height="${tb-tt}" rx="6"/>`;
    if(i===state.playSlot)s+=`<rect class="t-play" x="${rx(i)+2}" y="${tt}" width="${rw(i)-4}" height="${tb-tt}" rx="6"/>`;}
  if(!state.playing)s+=`<rect class="t-sel" x="${rx(state.sel)+2}" y="${tt}" width="${rw(state.sel)-4}" height="${tb-tt}" rx="6"/>`;
  if(state.focus.length){const a=Math.min(...state.focus),b=Math.max(...state.focus);
    s+=`<rect class="t-focus" x="${rx(a)}" y="${tt-3}" width="${rx(b)+rw(b)-rx(a)}" height="${tb-tt+6}" rx="8"/>`;}
  for(const k of[30,32,34,36,38,18,20,22,24,26])s+=`<line class="sl" x1="12" x2="${W-12}" y1="${y(k)}" y2="${y(k)}"/>`;
  s+=`<line class="sys" x1="12" x2="12" y1="${y(38)}" y2="${y(18)}"/>`;
  for(let m=1;m<n;m++){const x=LEFT+m*MW;s+=`<line class="bar" x1="${x}" x2="${x}" y1="${y(38)}" y2="${y(18)}"/>`;}
  for(let m=0;m<n;m++)s+=`<text class="mnum" x="${LEFT+m*MW+4}" y="11">${m+1}</text>`;
  s+=`<line class="bar-end" x1="${W-19}" x2="${W-19}" y1="${y(38)}" y2="${y(18)}"/><line class="bar-end-thick" x1="${W-14}" x2="${W-14}" y1="${y(38)}" y2="${y(18)}"/>`;
  if(clefFit)for(const[k,ch]of[['t','\u{1D11E}'],['b','\u{1D122}']]){const f=clefFit[k];
    if(f)s+=`<text class="clef" font-size="100" x="0" y="0" transform="translate(${f.tx.toFixed(2)},${f.ty.toFixed(2)}) scale(${f.sc.toFixed(4)})">${ch}</text>`;}
  if(state.hints&&state.view==='practice'&&!state.playing){const x=S[state.sel].x;
    hintSet(state.sel).forEach(h=>{s+=`<circle class="hint" cx="${x}" cy="${y(h.s)}" r="3.4"/>`;
      if(h.a)s+=`<text class="hint-acc" x="${x-11}" y="${y(h.s)}" text-anchor="middle" dominant-baseline="central">♯</text>`;});}
  for(let m=0;m<n;m++)s+=noteSVG(c[m],cfx(m),'cf',4,null);
  const stem=state.above?'up':'down',off=[];
  for(let i=0;i<S.length;i++){const sl=S[i];off[i]=0;
    if(sl.rest){s+=restSVG(sl.x,sl.dur,false);continue;}
    if(!V[i]){if(sl.optRest)s+=restSVG(sl.x,sl.dur,true);continue;}
    off[i]=(sl.b===0&&Math.abs(V[i].s-c[sl.m].s)<=1)?15:0;
    s+=noteSVG(V[i],sl.x+off[i],'cp'+(i===state.sel?' on':''),sl.dur,stem,sl.tiedFrom!=null);}
  for(let i=0;i<S.length;i++){const sl=S[i];if(sl.tieTo==null||!V[i])continue;
    const x1=sl.x+off[i]+7,x2=S[sl.tieTo].x+(off[sl.tieTo]||0)-7,yy=y(V[i].s),dy=state.above?1:-1;
    s+=`<path class="tie" d="M${x1},${yy+dy*7} Q${(x1+x2)/2},${yy+dy*17} ${x2},${yy+dy*7}"/>`;}
  // 解答例の重ね表示
  if(state.compare&&state.view==='practice'){
    const SV=valsOf(S,state.compare.cp);
    for(let i=0;i<S.length;i++){const sl=S[i];if(!SV[i]||sl.tiedFrom!=null)continue;
      if(V[i]&&V[i].s===SV[i].s&&V[i].a===SV[i].a){s+=`<circle class="solsame" cx="${sl.x+off[i]}" cy="${y(V[i].s)}" r="11"/>`;continue;}
      s+=noteSVG(SV[i],sl.x+(V[i]?16:0),'sol',sl.dur,stem,false);}
  }
  // 最高音の印
  const filledIdx=S.map((sl,i)=>i).filter(i=>V[i]&&S[i].tiedFrom==null);
  if(filledIdx.length>=3){
    const hm=Math.max(...filledIdx.map(i=>midi(V[i]))),tops=filledIdx.filter(i=>midi(V[i])===hm);
    const many=tops.length>((state.sp===3||state.sp===5)?2:1);
    tops.forEach(i=>{const x=S[i].x+off[i],yy=y(V[i].s)-((state.above&&S[i].dur<4)?48:15);
      s+=`<path class="climax${many?' warn':''}" d="M${x-4},${yy-6} L${x+4},${yy-6} L${x},${yy}"><title>最高音</title></path>`;});
  }
  // 平行・隠伏の2音を結ぶ線
  if(judge)r.issues.forEach(is=>{if(!LINE_RULES.has(is.id)||is.cols.length<2)return;
    const [i0,i1]=is.cols;if(!V[i0]||!V[i1])return;const w=is.lv==='warn'?' warn':'';
    s+=`<line class="parline${w}" x1="${S[i0].x+off[i0]}" y1="${y(V[i0].s)}" x2="${S[i1].x+off[i1]}" y2="${y(V[i1].s)}"/>`;
    s+=`<line class="parline${w}" x1="${cfx(S[i0].m)}" y1="${y(c[S[i0].m].s)}" x2="${cfx(S[i1].m)}" y2="${y(c[S[i1].m].s)}"/>`;});
  s+='<g id="ghost"></g>';
  const ny=NOTE_BOTTOM+22;
  s+=`<text class="rowlab" x="14" y="${ny}" dominant-baseline="central">音程</text><text class="rowlab" x="14" y="${ny+32}" dominant-baseline="central">進行</text>`;
  for(let i=0;i<S.length;i++){const v=r.iv[i];if(S[i].rest)continue;
    if(!v){if(editable(S[i])&&!S[i].optRest)s+=`<text class="ivn iv-none" x="${S[i].x}" y="${ny}" text-anchor="middle" dominant-baseline="central">·</text>`;continue;}
    const cl=(!v.cons||v.crossed)?'iv-x':v.perfect?'iv-p':'iv-i';
    s+=`<text class="ivn ${cl}" x="${S[i].x}" y="${ny}" text-anchor="middle" dominant-baseline="central"><title>${ivName(v)}</title>${ivLabel(v)}</text>`;
    if(r.dis[i]==='?')s+=`<text class="distag pend" x="${S[i].x}" y="${ny+15}" text-anchor="middle" dominant-baseline="central"><title>前後の音が未入力のため判定を保留しています</title>保</text>`;
    else if(r.dis[i])s+=`<text class="distag" x="${S[i].x}" y="${ny+15}" text-anchor="middle" dominant-baseline="central">${r.dis[i]}</text>`;}
  const ML={contrary:'反',oblique:'斜',similar:'並',parallel:'平',none:'―'};
  for(let i=1;i<S.length;i++){if(S[i].b!==0)continue;const m=r.mo[i];if(!m)continue;
    s+=`<text class="mot m-${m}" x="${LEFT+S[i].m*MW}" y="${ny+32}" text-anchor="middle" dominant-baseline="central">${ML[m]}</text>`;}
  svg.innerHTML=s;
}
/* ---- VexFlow による楽譜(score.js)と、その座標に重ねる表示 ---- */
const VF_MW={1:74,2:120,3:184,4:120,5:204};
const VF_SC=1.2;  // VexFlow の譜表(線の間隔10)を画面で少し大きく
// The zoom select multiplies this for the main staff only (100% = the size used so far); snippets keep VF_SC.
// On narrow screens 160% makes the two staves taller than the phone screen, so cap at 130% there.
// state.zoom keeps the user's choice, so a wide screen still shows 160% when that was chosen.
const ZOOMS=[1,1.3,1.6],NARROW_MAX=1.3;
const effZoom=()=>matchMedia('(max-width:920px)').matches?Math.min(state.zoom,NARROW_MAX):state.zoom;
const mainSc=()=>VF_SC*effZoom();
function syncZoomSel(){const sel=$('#zoomSel');if(!sel)return;const cap=matchMedia('(max-width:920px)').matches;
  for(const o of sel.options){const big=+o.value>NARROW_MAX;o.hidden=cap&&big;o.disabled=cap&&big;}
  sel.value=String(effZoom());}
let geo=null;
const useVF=()=>!!(window.GScore&&GScore.ready());
function cssv(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim();}
function vfModel(V){
  return {cf:cf(),slots:curS.map(s=>({m:s.m,b:s.b,dur:s.dur,rest:!!s.rest,optRest:!!s.optRest,tiedFrom:s.tiedFrom,tieTo:s.tieTo})),
    vals:V.map(v=>v?{s:v.s,a:v.a}:null),above:state.above,MW:VF_MW[state.sp],
    col:{ink:cssv('--ink'),staff:cssv('--staff'),cp:cssv('--accent'),faint:cssv('--faint')}};
}
const yOn=(st,s)=>st.topY+(st.topS-s)*geo.step;
const cpSt=()=>geo[geo.cpStaff],cfSt=()=>geo[geo.cfStaff];
function ledgerSVG(st,s,x,cls){let o='';const top=st.topS,bot=top-8;
  if(s>=top+2)for(let k=top+2;k<=s;k+=2)o+=`<line class="ledger ${cls}" x1="${x-10}" x2="${x+10}" y1="${yOn(st,k)}" y2="${yOn(st,k)}"/>`;
  if(s<=bot-2)for(let k=bot-2;k>=s;k-=2)o+=`<line class="ledger ${cls}" x1="${x-10}" x2="${x+10}" y1="${yOn(st,k)}" y2="${yOn(st,k)}"/>`;
  return o;}
function headSVG(n,x,cls){const st=cpSt(),yy=yOn(st,n.s);
  return ledgerSVG(st,n.s,x,cls)+`<g class="${cls}" transform="translate(${x},${yy})"><ellipse class="nb" rx="6.6" ry="4.7" transform="rotate(-20)"/></g>`+
    (n.a?`<text class="acc ${cls}" x="${x-14}" y="${yy}" text-anchor="middle" dominant-baseline="central" font-size="15">${n.a>0?'♯':n.a<0?'♭':'♮'}</text>`:'');}
function drawStaffVF(r){
  const c=cf(),n=c.length,S=curS,V=curV,judge=showJudg();
  geo=GScore.engrave(vfModel(V));
  const {W,H}=geo,svg=$('#staff'),X=geo.slotX,cs=cpSt(),fs=cfSt();
  svg.setAttribute('width',Math.round(W*mainSc()));svg.setAttribute('height',Math.round(H*mainSc()));svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  const lv=new Array(S.length).fill(null);
  if(judge)r.issues.forEach(is=>is.cols.forEach(i=>{if(is.lv==='err')lv[i]='err';else if(!lv[i])lv[i]='warn';}));
  const tt=geo.top-16,tb=geo.bottom+16;let s='';
  const box=(i,cls)=>`<rect class="${cls}" x="${geo.slotL[i]+2}" y="${tt}" width="${Math.max(6,geo.slotR[i]-geo.slotL[i]-4)}" height="${tb-tt}" rx="6"/>`;
  for(let i=0;i<S.length;i++){if(lv[i])s+=box(i,'t-'+lv[i]);if(i===state.playSlot)s+=box(i,'t-play');}
  if(state.fill)S.forEach((sl,i)=>{if(state.fill.blanks.includes(skey(sl)))s+=box(i,'t-blank');});
  if(!state.playing)s+=box(state.sel,'t-sel');
  if(state.focus.length){const a=Math.min(...state.focus),b=Math.max(...state.focus);
    s+=`<rect class="t-focus" x="${geo.slotL[a]}" y="${tt-3}" width="${geo.slotR[b]-geo.slotL[a]}" height="${tb-tt+6}" rx="8"/>`;}
  for(let m=0;m<n;m++)s+=`<text class="mnum" x="${geo.measX[m]+3}" y="11">${m+1}</text>`;
  s+=`<g class="vfw">${geo.inner}</g>`;
  if(state.hints&&state.view==='practice'&&!state.playing){const x=X[state.sel];
    hintSet(state.sel).forEach(h=>{s+=`<circle class="hint" cx="${x}" cy="${yOn(cs,h.s)}" r="3"/>`;
      if(h.a)s+=`<text class="hint-acc" x="${x-10}" y="${yOn(cs,h.s)}" text-anchor="middle" dominant-baseline="central">♯</text>`;});}
  // 解答例の重ね表示
  if(state.compare&&state.view==='practice'){
    const SV=valsOf(S,state.compare.cp);
    for(let i=0;i<S.length;i++){if(!SV[i]||S[i].tiedFrom!=null)continue;
      if(V[i]&&V[i].s===SV[i].s&&V[i].a===SV[i].a){s+=`<circle class="solsame" cx="${X[i]}" cy="${yOn(cs,V[i].s)}" r="9"/>`;continue;}
      s+=headSVG(SV[i],X[i]+(V[i]?13:0),'sol');}
  }
  // 最高音の印
  const filledIdx=S.map((sl,i)=>i).filter(i=>V[i]&&S[i].tiedFrom==null);
  if(filledIdx.length>=3){
    const hm=Math.max(...filledIdx.map(i=>midi(V[i]))),tops=filledIdx.filter(i=>midi(V[i])===hm);
    const many=tops.length>((state.sp===3||state.sp===5)?2:1),ymin=Math.min(yOn(cs,V[tops[0]].s)-34,cs.topY-12);
    tops.forEach(i=>{const x=X[i];s+=`<path class="climax${many?' warn':''}" d="M${x-4},${ymin-6} L${x+4},${ymin-6} L${x},${ymin}"><title>最高音</title></path>`;});
  }
  // 平行・隠伏の2音を結ぶ線
  if(judge)r.issues.forEach(is=>{if(!LINE_RULES.has(is.id)||is.cols.length<2)return;
    const [i0,i1]=is.cols;if(!V[i0]||!V[i1])return;const w=is.lv==='warn'?' warn':'';
    s+=`<line class="parline${w}" x1="${X[i0]}" y1="${yOn(cs,V[i0].s)}" x2="${X[i1]}" y2="${yOn(cs,V[i1].s)}"/>`;
    s+=`<line class="parline${w}" x1="${geo.cfX[S[i0].m]}" y1="${yOn(fs,c[S[i0].m].s)}" x2="${geo.cfX[S[i1].m]}" y2="${yOn(fs,c[S[i1].m].s)}"/>`;});
  s+='<g id="ghost"></g>';
  const ny=geo.rowY;
  s+=`<text class="rowlab" x="6" y="${ny}" dominant-baseline="central">音程</text><text class="rowlab" x="6" y="${ny+28}" dominant-baseline="central">進行</text>`;
  for(let i=0;i<S.length;i++){const v=r.iv[i];if(S[i].rest)continue;
    if(!v){if(editable(S[i])&&!S[i].optRest)s+=`<text class="ivn iv-none" x="${X[i]}" y="${ny}" text-anchor="middle" dominant-baseline="central">·</text>`;continue;}
    const cl=(!v.cons||v.crossed)?'iv-x':v.perfect?'iv-p':'iv-i';
    s+=`<text class="ivn ${cl}" x="${X[i]}" y="${ny}" text-anchor="middle" dominant-baseline="central"><title>${ivName(v)}</title>${ivLabel(v)}</text>`;
    if(r.dis[i]==='?')s+=`<text class="distag pend" x="${X[i]}" y="${ny+14}" text-anchor="middle" dominant-baseline="central"><title>前後の音が未入力のため判定を保留しています</title>保</text>`;
    else if(r.dis[i])s+=`<text class="distag" x="${X[i]}" y="${ny+14}" text-anchor="middle" dominant-baseline="central">${r.dis[i]}</text>`;}
  const ML={contrary:'反',oblique:'斜',similar:'並',parallel:'平',none:'―'};
  for(let i=1;i<S.length;i++){if(S[i].b!==0)continue;const m=r.mo[i];if(!m)continue;
    s+=`<text class="mot m-${m}" x="${geo.slotL[i]}" y="${ny+28}" text-anchor="middle" dominant-baseline="central">${ML[m]}</text>`;}
  svg.innerHTML=s;
}
function drawStaff(r){
  syncZoomSel();
  svgEl.classList.toggle('vf',useVF());
  if(useVF()){try{drawStaffVF(r);followStaff();drawMiniMap();return;}catch(e){console.error(e);geo=null;}}
  geo=null;drawStaffLegacy(r);drawMiniMap();
}

/* ---- narrow screens: keep the selected (or playing) note in view, and a strip map of all bars ---- */
const narrow=()=>matchMedia('(max-width:920px)').matches;
const staffBox=()=>$('#staffScroll');
function followStaff(){
  if(!geo||!narrow())return;
  const box=staffBox(),i=state.playing&&state.playSlot>=0?state.playSlot:state.sel;
  if(!box||i==null||i<0||geo.slotX[i]==null)return;
  // Only recentre when the note leaves the middle half, so tapping a visible note does not jerk the staff under the finger.
  const sc=mainSc(),w=box.clientWidth,sl=box.scrollLeft,x=geo.slotX[i]*sc-sl,L=geo.slotL[i]*sc,R=geo.slotR[i]*sc;
  const boxFits=R-L<=w,boxOut=L<sl||R>sl+w;
  if(x<w*0.25||x>w*0.75||(boxFits&&boxOut)){
    let t=geo.slotX[i]*sc-w/2;
    if(boxFits)t=Math.min(L,Math.max(R-w,t));   // a wide slot (e.g. the final whole note) is shown whole
    box.scrollLeft=Math.max(0,t);
  }
  syncMiniFrame();
}
function drawMiniMap(){
  const mm=$('#miniMap');if(!mm)return;
  const on=!!geo&&narrow()&&state.view!=='learn'&&state.view!=='drill'&&state.view!=='history';
  mm.hidden=!on;if(!on)return;
  const n=geo.measX.length,key=n+'|'+geo.W+'|'+geo.measX[0];
  if(mm.dataset.k!==key){
    // Bars are laid out at their real proportions (bar 1 also carries the clefs) so the frame lines up with the staff.
    let h='';for(let m=0;m<n;m++){const x0=m===0?0:geo.measX[m],x1=m+1<n?geo.measX[m+1]:geo.W;
      h+=`<button type="button" class="mm-bar" data-mm="${m}" style="flex:${(x1-x0).toFixed(1)} 1 0" aria-label="第${m+1}小節へ">${m+1}</button>`;}
    mm.innerHTML=h+'<i class="mm-frame" aria-hidden="true"></i>';mm.dataset.k=key;}
  syncMiniFrame();
}
function syncMiniFrame(){
  const mm=$('#miniMap'),box=staffBox();if(!mm||mm.hidden||!geo||!box)return;
  const f=mm.querySelector('.mm-frame'),tot=geo.W*mainSc();if(!f)return;
  const a=Math.min(1,box.scrollLeft/tot),b=Math.min(1,(box.scrollLeft+box.clientWidth)/tot);
  f.style.left=(a*100)+'%';f.style.width=(Math.max(0.02,b-a)*100)+'%';
}

function rhythmIcon(id){
  const p=PATTERNS[id],W=hasEighth(id)?66:58,Hh=30,u=(W-10)/4;let s=`<line class="r-line" x1="2" x2="${W-2}" y1="22" y2="22"/>`,b=0,lastE=null;
  p.d.forEach((d,k)=>{const cx=7+b*u+2,cy=22;
    if(p.rest&&k===0)s+=`<rect class="r-fill" x="${cx-4}" y="${cy-4}" width="9" height="4"/>`;
    else if(d===4)s+=`<ellipse class="r-open" cx="${cx+2}" cy="${cy}" rx="4.6" ry="3.4"/>`;
    else{s+=`<ellipse class="${d<=1?'r-fill':'r-open'}" cx="${cx}" cy="${cy}" rx="3.9" ry="2.9" transform="rotate(-22 ${cx} ${cy})"/><line class="r-stem" x1="${cx+3.6}" x2="${cx+3.6}" y1="${cy-1}" y2="${cy-17}"/>`;
      if(d===0.5){if(lastE!=null){s+=`<rect class="r-fill" x="${lastE}" y="${cy-18}" width="${cx+3.6-lastE+0.7}" height="3"/>`;lastE=null;}else lastE=cx+3.6-0.7;}}
    b+=d;});
  if(p.tie)s+=`<path class="r-tie" d="M${W-14},${Hh-3} Q${W-6},${Hh+1} ${W-1},${Hh-5}"/>`;
  return `<svg viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" aria-hidden="true">${s}</svg>`;
}
const editList=()=>curS.filter(editable).map(s=>s.i);
function drawEditor(r){
  const i=state.sel,s=curS[i],c=cf()[s.m],p=curV[i],v=r.iv[i],n=cf().length;
  const ivTxt=v?`<span class="chip ${(!v.cons||v.crossed)?'c-x':v.perfect?'c-p':'c-i'}">${ivName(v)}${v.crossed?'(交差)':''}</span>`:'';
  const pos=state.sp===1||s.m===n-1?`第${s.m+1}小節`:`第${s.m+1}小節 ${beatLabel(s.b)}`;
  $('#edInfo').innerHTML=`<span class="ed-pos">${pos}</span><span>定旋律 <b>${nameOf(c)}</b></span><span>対旋律 <b>${p?nameOf(p):s.optRest?'休符':'―'}</b></span>${ivTxt}`;
  const L=editList();
  document.querySelectorAll('[data-act]').forEach(b=>{const a=b.dataset.act;
    if(['sharp','natural','flat','del'].includes(a))b.disabled=!p;
    if(a==='prev')b.disabled=!L.some(j=>j<i);
    if(a==='next')b.disabled=!L.some(j=>j>i);
    b.setAttribute('aria-pressed',!!p&&((a==='sharp'&&p.a===1)||(a==='flat'&&p.a===-1)||(a==='natural'&&p.a===0)));});
  let ex='';
  if(state.sp===4&&state.view==='practice'){
    if(s.m<=n-3){const on=state.ties[s.m]!==false;
      ex=`<span>第${s.m+1}小節の2拍目から次の小節へ</span><button class="btn" type="button" data-tie="${s.m}" aria-pressed="${on}">${on?'タイでつなぐ(オン)':'タイを切る(オフ)'}</button>`;}
    else ex='<span>終止の小節ではタイを使いません。</span>';
  }
  if(state.sp===5&&state.view==='practice'){
    if(s.m===n-1)ex='<span>最後の小節は全音符です。</span>';
    else{ex=`<span>第${s.m+1}小節のリズム</span>`;
      (s.m===0?PAT_FIRST:PAT_MID).forEach(id=>{const eNo=hasEighth(id)&&(s.m===0||s.m>=n-2),dis=(PATTERNS[id].tie&&s.m>n-3)||eNo;
        const tl=PATTERNS[id].lab+(eNo?'(8分音符は最初の小節と終止では使えません)':'');
        ex+=`<button class="btn rbtn" type="button" data-pat="${id}" aria-label="${tl}" title="${tl}" aria-pressed="${state.rhythm[s.m]===id}"${dis?' disabled':''}>${rhythmIcon(id)}</button>`;});}
  }
  $('#edExtra').innerHTML=ex;
  // 選んだ音に関わる指摘
  let si='';
  if(showJudg()){
    const mine=new Set([i]);curS.forEach((t,k)=>{if(t.tiedFrom===i)mine.add(k);});
    const list=r.issues.filter(x=>x.cols.some(k=>mine.has(k))).slice(0,3);
    si=list.map(x=>`<div class="si"><span class="sev ${x.lv}">${x.lv==='err'?'誤り':'注意'}</span><b>${x.t}</b><span class="x">${x.x}</span></div>`).join('');
  }
  $('#selIssues').innerHTML=si;
}
const beatLabel=b=>Number.isInteger(b)?`${b+1}拍目`:`${Math.floor(b)+1}拍目の後半`;
function where(cols){const a=curS[Math.min(...cols)],b=curS[Math.max(...cols)];
  const f=s=>state.sp===1||s.b===0&&curS.filter(t=>t.m===s.m).length===1?`${s.m+1}`:`${s.m+1}-${Number.isInteger(s.b)?s.b+1:Math.floor(s.b)+1+'後'}`;
  return a===b?`第${f(a)}`:`第${f(a)}〜${f(b)}`;}
let toastT=null,toastMsg='';
function toast(m){toastMsg=m;clearTimeout(toastT);toastT=setTimeout(()=>{toastMsg='';render();},5500);render();}
function issueList(list){
  return '<div class="issues">'+list.map(it=>`<button class="issue" type="button" data-issue="${lastR.issues.indexOf(it)}"><span class="sev ${it.lv}">${it.lv==='err'?'誤り':'注意'}</span><span><span class="it-title">${it.t}</span><span class="it-where">${where(it.cols)}</span><span class="pts">−${ptsOf(it)}</span></span><span class="it-x">${it.x}</span></button>`).join('')+'</div>';
}
function scoreOf(r){const e=r.issues.filter(x=>x.lv==='err').length,w=r.issues.length-e,g=G.grade(r,ctx());return {e,w,g};}
const ptsOf=x=>x.id==='run'?Math.max(1,x.cols.length-3):(G.POINTS[x.id]||1);
function compareBox(){
  if(!state.compare)return '';
  const SV=valsOf(curS,state.compare.cp);let diff=0;
  curS.forEach((s,i)=>{if(SV[i]&&s.tiedFrom==null&&!(curV[i]&&curV[i].s===SV[i].s&&curV[i].a===SV[i].a))diff++;});
  return `<div class="cmpbox"><p><b>解答例と比べています。</b>青い白抜きの音符が解答例で、自分と同じ音は青い円で囲んでいます。違う音は${diff}か所です。</p>
    <div class="btnrow"><button class="btn" type="button" id="cmpPlay">解答例を再生</button><button class="btn" type="button" id="cmpMine">自分の解答を再生</button></div>
    <div class="btnrow"><button class="btn" type="button" id="cmpAnother"${busy.cmp?' disabled':''}>${busy.cmp?'探しています…':'別の解答例'}</button><button class="btn" type="button" id="cmpAdopt">解答例を採用</button><button class="btn" type="button" id="cmpOff">比べるのをやめる</button></div>
    <p class="muted">解答例は探索で作った一例で、唯一の正解ではありません。「採用」しても「元に戻す」で自分の解答に戻れます。</p></div>`;
}
function drawPracticePanel(r){
  const {e,w,g}=scoreOf(r),st=r.stats,judge=showJudg();
  let h='';
  if(state.example)h+=`<div class="note-ex">例として、誤りを含む解答を表示しています。五線をクリックして自由に書き換えてください。</div>`;
  if(!judge&&!state.fill){
    const changed=state.checkedSig!=null;
    h+=`<div class="pending"><span>${r.complete?'書き終えたら答え合わせをしましょう。':`未入力 ${r.missing}音。書き終えたら答え合わせをしましょう。`}${changed?'(前回の答え合わせの後に変更があります)':''}</span>
      <button class="btn primary" type="button" id="checkBtn">答え合わせ</button></div>`;
  }else{
    const big=!e&&!w?`<span class="good">規則違反なし</span>`:`${e?`<span class="e">誤り ${e}</span>`:'<span class="good">誤り 0</span>'} · ${w?`<span class="w">注意 ${w}</span>`:'注意 0'}`;
    h+=`<div class="verdict"><div class="big">${big}${g.pass?'<span class="passbadge">合格</span>':''}</div><div class="sub">${r.complete?`減点 ${g.total}(重い誤り3点・中くらい2点・軽い1点)`:`未入力 ${r.missing}音(採点は書き終えてから)`}</div></div>`;
  }
  h+=compareBox();
  if(state.fill)h=(state.fill.guided?guidedBox(r):fillBox(r))+h;
  else h+=`<div class="btnrow"><button class="btn primary" type="button" id="saveBtn">この解答を保存</button></div>`;
  h+=`<dl class="stats"><div><dt>拍頭での反行の割合</dt><dd>${st.moves?Math.round(st.contra/st.moves*100)+'%':'―'}</dd></div><div><dt>途中の拍頭の完全協和</dt><dd>${st.perf}回</dd></div><div><dt>対旋律の音域</dt><dd>${st.span?st.span+'度':'―'}</dd></div><div><dt>跳躍(3度以上)</dt><dd>${st.leaps}回</dd></div></dl>`;
  if(judge){
    h+=`<h2>指摘<span>${r.issues.length}件 · クリックで該当箇所を再生</span></h2>`;
    if(!r.issues.length)h+=r.complete?`<div class="ok"><b>よくできました。</b>${SPECIES[state.sp].name}の規則をすべて満たしています。保存して記録に残しておけます。</div>`:`<div class="ok">いまのところ規則違反はありません。</div>`;
    else h+=issueList(r.issues);
    if(g.global.length)h+='<div class="issues">'+g.global.map(x=>`<div class="issue gl"><span class="sev warn">全体</span><span><span class="it-title">${x.t}</span><span class="pts">−${x.pts}</span></span><span class="it-x">途中の拍頭は、3度・6度を中心にすると2声部が独立して聞こえます。</span></div>`).join('')+'</div>';
  }
  h+=`<p class="toast" role="status">${toastMsg}</p>`;
  $('#panel').innerHTML=h;
}
function drawReviewPanel(r){
  if(!review){$('#panel').innerHTML=`<p class="muted">問題を作っています…</p><p class="toast" role="status">${toastMsg}</p>`;return;}
  const q=review;let h=`<div class="mission"><span class="k">${SPECIES[q.sp].name} · ${q.label||''} · 対旋律が${q.above?'上':'下'} · 第${q.no}問</span>
    <span class="rule">${RULES[q.rule]}</span>
    <p>この対旋律には「${RULES[q.rule]}」の誤りが1か所あります。音を直して「答え合わせ」を押してください。</p></div>`;
  h+=`<div class="btnrow"><button class="btn primary" type="button" id="rvCheck">答え合わせ</button><button class="btn" type="button" id="rvHint">場所のヒント</button><button class="btn" type="button" id="rvShow">模範解答</button></div>`;
  if(q.result){
    const res=q.result;
    if(res.shown)h+=`<p class="muted">模範解答を表示しています。聴き比べてから次の問題へ進んでください。</p>`;
    else if(res.ok)h+=`<p class="res-ok">正解です。「${RULES[q.rule]}」が解消され、ほかの誤りもありません。</p>`;
    else if(res.targetLeft)h+=`<p class="res-ng">まだ「${RULES[q.rule]}」が残っています。</p>`;
    else if(!res.complete)h+=`<p class="res-ng">空いている位置があります。すべての音を入れてください。</p>`;
    else h+=`<p class="res-ng">「${RULES[q.rule]}」は解消しましたが、別の誤りがあります。</p>`;
    const errs=r.issues.filter(x=>x.lv==='err');
    if(!res.ok&&!res.shown&&errs.length)h+=issueList(errs);
  }
  h+=`<div class="btnrow"><button class="btn${q.result&&(q.result.ok||q.result.shown)?' primary':''}" type="button" id="rvNext">次の問題</button><button class="btn" type="button" id="rvQuit">練習に戻る</button></div>`;
  h+=`<h2>出題のもとになる規則<span>誤りの多い順</span></h2>${weakHTML(5)}`;
  h+=`<p class="toast" role="status">${toastMsg}</p>`;
  $('#panel').innerHTML=h;
}
function weakRows(){
  return Object.entries(store.stats).map(([id,s])=>({id,s,p:(s.n||0)+0.5*(s.nw||0)+2*(s.w||0)-1.5*(s.r||0)})).filter(x=>RULES[x.id]&&((x.s.n||0)+(x.s.nw||0)+(x.s.w||0)+(x.s.r||0))>0).sort((a,b)=>b.p-a.p);
}
function weakHTML(limit){
  const rows=weakRows().slice(0,limit);
  if(!rows.length)return `<p class="muted">解答を保存すると、誤りの多かった規則がここに並び、そこから優先して出題します。まだ記録がないので、よくある誤りから出題しています。</p>`;
  const mx=Math.max(...rows.map(x=>(x.s.n||0)+(x.s.nw||0)),1);
  return '<div class="weak">'+rows.map(x=>{const cnt=(x.s.n||0)+(x.s.nw||0),rv=(x.s.r||0)+(x.s.w||0);
    return `<div class="wrow"><div><div class="w-name">${RULES[x.id]}</div><div class="w-meta">保存した解答で ${cnt}回${rv?` · 復習 ${x.s.r||0}/${rv}問正解`:''}</div></div>${INJECT[x.id]?`<button class="btn" type="button" data-review="${x.id}">復習</button>`:'<span></span>'}<div class="wbar"><i style="width:${Math.max(4,cnt/mx*100)}%"></i></div></div>`;}).join('')+'</div>';
}
let ioMode=null,ioText='',ioMsg='';
function drawHistory(){
  const L=store.history;let h=`<div class="hist-head"><h2>保存した解答</h2><span class="muted">${L.length}件 · この端末のブラウザ内に保存</span></div>`;
  if(!L.length)h+=`<div class="empty">まだ保存した解答はありません。練習画面の「この解答を保存」で追加できます。</div>`;
  else h+=L.map(e=>{const d=new Date(e.t),ds=`${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    return `<div class="hrow"><div><div class="h-title">${SPECIES[e.sp].name} · ${esc(e.label||(cfEntry(e.mode)||{short:''}).short)} · 対旋律が${e.above?'上':'下'}</div><div class="h-sub">${ds} · 誤り ${e.errs} · 注意 ${e.warns}${e.complete?'':' · 未完成'}${e.preset&&e.preset!==PRESETS.fux.name?` · 基準: ${esc(e.preset)}`:''}</div></div>
      <div class="h-score${e.complete?'':' inc'}">${!e.complete?'未完成':e.pts!=null?`−${e.pts}${e.pass?'<small class="passbadge">合格</small>':''}`:e.score}</div>
      <div class="h-acts"><button class="btn" type="button" data-hopen="${e.id}">${pendingDel==='open:'+e.id?'置き換えて開く':'開く'}</button><button class="btn danger" type="button" data-hdel="${e.id}">${pendingDel===e.id?'本当に削除':'削除'}</button></div></div>`;}).join('');
  $('#histView').innerHTML=h;
  let p=`<h2>よく間違える規則<span>保存した解答と復習の記録</span></h2>${weakHTML(10)}`;
  p+=`<div class="btnrow"><button class="btn primary" type="button" id="goReview">苦手な規則を復習する</button></div>`;
  const ds=DRILLS.concat([{id:'fill',title:'穴埋め課題'}]).filter(d=>store.drillStats[d.id]&&store.drillStats[d.id].n);
  p+=`<h2>ドリルの成績<span>正解 / 回答数</span></h2>`+(ds.length?'<div class="weak">'+ds.map(d=>{const st=store.drillStats[d.id],r=st.ok/st.n;
    return `<div class="wrow"><div><div class="w-name">${esc(d.title)}</div><div class="w-meta">${st.ok}/${st.n}問正解 · 最高連続 ${st.best||0}</div></div><span></span><div class="wbar"><i style="width:${Math.max(4,r*100)}%;background:var(--imperfect)"></i></div></div>`;}).join('')+'</div>':'<p class="muted">まだドリルに答えていません。</p>');
  p+=`<h2>記録の書き出し・読み込み<span>バックアップや端末の移行に</span></h2>
    <div class="io"><div class="btnrow"><button class="btn" type="button" id="exFile">ファイルに保存</button><button class="btn" type="button" id="exText">テキストで表示</button><button class="btn" type="button" id="imOpen">読み込む…</button></div>`;
  if(ioMode==='export')p+=`<textarea id="ioText" readonly aria-label="書き出した記録">${esc(ioText)}</textarea><div class="btnrow"><button class="btn" type="button" id="exCopy">コピー</button></div>`;
  if(ioMode==='import')p+=`<p class="muted">書き出したファイルを選ぶか、テキストを貼り付けてください。今の記録はすべて置き換わります。</p>
    <input type="file" id="imFile" accept=".json,application/json"><textarea id="imText" aria-label="読み込む記録" placeholder="ここに貼り付け">${esc(ioText)}</textarea>
    <div class="btnrow"><button class="btn danger" type="button" id="imGo">${pendingDel==='import'?'本当に置き換える':'読み込んで置き換える'}</button></div>`;
  if(ioMsg)p+=`<p class="muted">${ioMsg}</p>`;
  p+='</div>';
  if(L.length||Object.keys(store.stats).length)p+=`<div class="btnrow"><button class="btn danger" type="button" id="wipe">${pendingDel==='*'?'本当にすべて消去':'記録をすべて消去'}</button></div>`;
  p+=`<p class="toast" role="status">${toastMsg}</p>`;
  $('#panel').innerHTML=p;
}
let pendingDel=null,pendingT=null;
function armDelete(id){pendingDel=id;clearTimeout(pendingT);pendingT=setTimeout(()=>{pendingDel=null;render();},3500);render();}

const RULE_TEXT={
  common:[['縦の音程',['開始は完全協和音程。対旋律が下なら同度かオクターヴ。','終止は同度かオクターヴ。','2声部の間隔は10度以内が目安。声部を交差させない。']],
    ['声部進行',['平行5度・平行8度は禁止。','並行(同方向)の動きで完全協和音程に入る隠伏5度・8度も禁止。','反行を主体にする。']],
    ['対旋律の旋律',['順次進行が主体。7度、オクターヴを超える跳躍、増減音程の跳躍は禁止。','6度の跳躍は上行の短6度だけ。','4度以上の跳躍の後は反対方向へ戻る。','音域は10度以内、最高音ははっきり一度。']],
    ['終止',['定旋律が2→1で終わるとき、対旋律が上なら長6度 → オクターヴ、下なら短3度 → 同度(短10度 → オクターヴ)。','定旋律が7→1で終わるときは、上なら3度(10度)、下なら6度から反対方向へ順次進行して入る。','必要なら導音を♯で半音上げる(フリギアでは不要)。変化音は導音の♯とB♭にほぼ限る。']]],
  1:['1対1',['すべての音程を協和音程(完全1・5・8度、長短3・6度)にする。2声では4度も不協和。','途中で同度は使わない。同音反復は避ける。','同じ種類の3度・6度の連続は3回程度まで。']],
  2:['2対1',['各小節の1拍目(強拍)は協和音程。','2拍目(弱拍)の不協和は経過音(前後とも同じ方向の順次進行)だけ。','弱拍なら同度も使える。','弱拍をはさんでも、拍頭どうしの平行5度・8度は避ける。','最初の小節は2分休符から始めてもよい(空けておくと休符になる)。']],
  3:['4対1',['各小節の1拍目は協和音程。','2〜4拍目の不協和は、経過音・刺繍音、またはカンビアータ(2度下行した不協和から3度下へ跳び、2度上がる)。','拍頭どうしの平行5度・8度に注意する。','最初の拍は4分休符にしてもよい。']],
  4:['掛留',['2拍目(準備、協和音)をタイで次の小節の1拍目へ持ち越す。','持ち越した音が不協和なら、2度下行して協和音に解決する。上声は7-6・4-3・9-8、下声は2-3・4-5・9-10。','持ち越した音が協和なら、どちらへ進んでもよい。','タイを切るのは、掛留がうまく続かないときだけ(五線の下の編集欄で切り替え)。','終止は上声なら7-6-8、下声なら2-3-1。']],
  5:['華麗(混合)',['小節ごとにリズムを選ぶ(五線の下の編集欄)。2分音符・4分音符・タイを組み合わせる。','拍頭は協和音程(タイで持ち越した掛留を除く)。','4分音符の不協和は経過音・刺繍音・カンビアータ、2分音符の弱拍の不協和は経過音だけ。','タイを使った掛留を少なくとも1回入れる。','掛留の不協和は、解決音(2度下)の前に協和音を1つはさんで飾ってもよい(例: 7度 E5 → A4 → 6度 D5)。解決音は同じ小節の中に置く。','8分音符は2つ1組で、弱い拍(2拍目か4拍目)の4分音符1つの代わりに使う。前の音から順次で入り、2つの間も、次の音へも順次で進む(経過音・刺繍音の形)。下行が基本。','8分音符は最初の小節と終止(最後の2小節)では使わない。1曲に1〜2組まで。']]
};
function drawRules(){
  const sp=RULE_TEXT[state.sp];
  let h=`<div class="rules-grid"><div><h3>${SPECIES[state.sp].name}(${sp[0]})の要点</h3><ul>${sp[1].map(x=>`<li>${x}</li>`).join('')}</ul></div>`;
  RULE_TEXT.common.forEach(([t,l])=>{h+=`<div><h3>${t}</h3><ul>${l.map(x=>`<li>${x}</li>`).join('')}</ul></div>`;});
  h+=`<div><h3>採点のしかた</h3><ul><li>授業で使われている罰点表にならい、指摘ごとに点を引きます。重い誤り(平行5度・8度、反行による連続5度・8度)は3点、中くらいの誤り(隠伏5度・8度、不協和の扱い、掛留)は2点、それ以外は1点。</li><li>同じ種類の3度・6度の連続は、4つで1点、5つで2点と重くなります。途中の拍頭に完全協和が多すぎると、全体で1〜2点引きます。</li><li>書き終えていて「誤り」が0なら合格です。</li></ul></div>`;
  h+=`</div><p class="fine">教科書によって細部は異なります。既定(フックス厳格)ではフックスの規則をやや厳しめに適用しています。採点は N. Rogers(フロリダ州立大学)の類別対位法の採点基準を土台にしています。</p>`;
  h+=levelsHTML();
  $('#rulesBody').innerHTML=h;
}
function levelsHTML(){
  const pk=presetOf(state.levels),L={err:'誤り',warn:'注意',off:'無視'};
  let h=`<section class="levels"><h3>判定の基準</h3><p class="muted">規則ごとに「誤り」「注意」「無視」を選べます。誤りは合格の妨げになり、注意は直すとよい点、無視は表示も採点もしません。どこからを違反とみなすかの線引きは変わりません。解答例と復習の問題は、いつもフックス厳格の基準で作ります。</p>
  <div class="row"><label class="mini" for="lvPreset">基準</label><select id="lvPreset">${Object.entries(PRESETS).map(([k,p])=>`<option value="${k}"${k===pk?' selected':''}>${p.name}</option>`).join('')}${pk?'':'<option value="" selected>カスタム</option>'}</select></div>
  <ul class="lvlist">`;
  for(const id of Object.keys(RULES)){const cur=state.levels[id]||RULE_LV[id],chg=!!state.levels[id];
    h+=`<li${chg?' class="chg"':''}><span>${RULES[id]}${chg?`<small>既定: ${L[RULE_LV[id]]}</small>`:''}</span><select data-lv="${id}" aria-label="${RULES[id]}">${['err','warn','off'].map(v=>`<option value="${v}"${v===cur?' selected':''}>${L[v]}</option>`).join('')}</select></li>`;}
  return h+'</ul></section>';
}
function setLevels(lv){const b=document.querySelector('.drawer-body'),y=b?b.scrollTop:0;state.levels=cleanLevels(lv);savePrefs();drawRules();render();if(b)b.scrollTop=y;}

/* ================= drawer ================= */
function openDrawer(kind){
  drawer=kind;const d=$('#drawer');
  $('#drawerTitle').textContent=kind==='rules'?`${SPECIES[state.sp].name}の規則`:'定旋律の管理';
  $('#paneRules').hidden=kind!=='rules';$('#paneCf').hidden=kind!=='cf';
  d.hidden=false;$('#drawerBack').hidden=false;
  if(kind==='rules')drawRules();else drawCfTools();
  $('#drawerClose').focus();
}
function closeDrawer(){if(!drawer)return;const k=drawer;drawer=null;$('#drawer').hidden=true;$('#drawerBack').hidden=true;
  const opener=document.querySelector(`[data-drawer="${k}"]`);if(opener)opener.focus();}

/* ================= fill-in exercise ================= */
function fillBox(r){
  const f=state.fill,left=f.blanks.filter(k=>!state.cp[k]).length;
  let h=`<div class="fillbox"><span class="k">穴埋め課題 · ${SPECIES[state.sp].name}</span><p>点線の枠の${f.blanks.length}か所を埋めて、「答え合わせ」を押してください。ほかの音は固定です。${left?`(あと${left}か所)`:''}</p>
    <div class="btnrow"><button class="btn primary" type="button" id="fillCheck">答え合わせ</button><button class="btn" type="button" id="fillHint">ヒント(1か所)</button><button class="btn" type="button" id="fillQuit">やめる</button></div>`;
  if(f.result){const x=f.result;
    h+=x.ok?`<p class="res-ok">正解です。規則違反はありません${x.same?'(解答例と同じ音です)':'(解答例とは違う音ですが、これも正解です)'}。</p>`
      :x.left?`<p class="res-ng">まだ空いている枠が${x.left}か所あります。</p>`:`<p class="res-ng">誤りが${x.errs}件あります。下の指摘を見て直してください。</p>`;}
  return h+'</div>';
}
function pickBlanks(S,sol){
  const n=cf().length,ok=s=>editable(s)&&!s.optRest&&s.m>0,keys=[];
  const tail=S.filter(s=>ok(s)&&s.m>=n-2),mid=S.filter(s=>ok(s)&&s.m<n-2);
  if(state.sp===4){
    // Prefer the resolution of a dissonant suspension: that is the point of the 4th species.
    const r=analyze({...ctx(),slots:S,vals:valsOf(S,sol)});
    const res=S.filter((s,i)=>i>0&&r.dis[i-1]==='掛'&&ok(s)&&s.m<n-2);
    if(res.length)keys.push(skey(G.pickOne(res)));
  }
  if(tail.length)keys.push(skey(G.pickOne(tail)));
  const want=Math.random()<0.5?3:2;
  for(const s of mid.slice().sort(()=>Math.random()-0.5)){if(keys.length>=want)break;if(!keys.includes(skey(s)))keys.push(skey(s));}
  return keys;
}
async function startFill(){
  if(state.fill||busy.fill)return;
  busy.fill=true;render();
  let sol=null;try{sol=await task('solve',{sp:state.sp,cf:cf(),above:state.above,rhythm:state.rhythm,ties:state.ties,ms:2500});}catch(e){sol=null;}
  busy.fill=false;
  if(!sol||state.view!=='practice'){if(!sol)toast('課題を作れませんでした。もう一度押してください。');render();return;}
  const blanks=pickBlanks(curS,sol),cp=JSON.parse(JSON.stringify(sol));blanks.forEach(k=>{delete cp[k];});
  const locked=new Set(curS.filter(s=>editable(s)&&!blanks.includes(skey(s))).map(skey));
  state.fill={blanks,locked,answer:sol,checkedSig:null,result:null,stash:{snap:snapshot(),hist:state.hist,future:state.future,example:state.example,compare:state.compare}};
  state.cp=cp;state.hist=[];state.future=[];state.compare=null;state.example=false;state.focus=[];
  refreshSlots();const first=curS.filter(s=>blanks.includes(skey(s))).map(s=>s.i).sort((a,b)=>a-b)[0];if(first!=null)state.sel=first;
  render();toast(`穴埋め課題です。${blanks.length}か所を埋めてください。`);
}
function quitFill(){
  const f=state.fill;if(!f)return;state.fill=null;
  if(f.stash.sp){state.sp=f.stash.sp;state.mode=f.stash.mode;state.above=f.stash.above;}
  applySnap(f.stash.snap);state.hist=f.stash.hist;state.future=f.stash.future;state.example=f.stash.example;state.compare=f.stash.compare;state.focus=[];
}
function checkFill(){
  const f=state.fill;if(!f)return;const r=lastR;
  const left=f.blanks.filter(k=>!state.cp[k]).length,errs=r.issues.filter(x=>x.lv==='err').length;
  const ok=!left&&!errs,same=f.blanks.every(k=>state.cp[k]&&f.answer[k]&&state.cp[k].s===f.answer[k].s&&state.cp[k].a===f.answer[k].a);
  f.checkedSig=sig();f.result={ok,left,errs,same};
  if(!left&&!f.recorded){f.recorded=true;const st=store.drillStats.fill||(store.drillStats.fill={n:0,ok:0,streak:0,best:0});
    st.n++;if(ok)st.ok++;st.streak=ok?(st.streak||0)+1:0;st.best=Math.max(st.best||0,st.streak);st.t=Date.now();persist();}
  render();
}
function hintFill(){
  const f=state.fill;if(!f)return;
  const k=f.blanks.find(k=>!(state.cp[k]&&state.cp[k].s===f.answer[k].s&&state.cp[k].a===f.answer[k].a));
  if(!k){toast('すべての枠が解答例と同じ音になっています。');return;}
  const cp=JSON.parse(JSON.stringify(state.cp));cp[k]=f.answer[k];const sn=snapshot();sn.cp=cp;commit(sn);
  toast('1か所に解答例の音を入れました。');
}
// While a fill-in exercise is open, actions that would change the exercise ask once before quitting it.
function fillGuard(key){
  if(!state.fill)return true;
  if(pendingDel==='fill:'+key){pendingDel=null;quitFill();return true;}
  const what=state.fill.guided?'「書いてみる」':'穴埋め課題';
  armDelete('fill:'+key);toast(`${what}の途中です。もう一度押すと、${what}をやめて実行します。`);return false;
}

/* ================= drills ================= */
const DRILLS=(window.GD&&GD.DRILLS)||[];
const drill={id:DRILLS.length?DRILLS[0].id:null,q:null,answered:null,loading:false,token:0,streak:0};
const drillInfo=id=>DRILLS.find(d=>d.id===id)||{title:'',desc:''};
function vfCol(){return {ink:cssv('--ink'),staff:cssv('--staff'),cp:cssv('--accent'),faint:cssv('--faint')};}
function snippetVals(sc,answered){return sc.vals.map((v,i)=>{if(!answered&&sc.hide.includes(i))return null;if(!answered&&sc.pre&&sc.pre[i])return sc.pre[i];return v;});}
function drawSnippet(svg,sc,answered){
  if(!useVF()){svg.innerHTML='';svg.removeAttribute('width');return;}
  const vals=snippetVals(sc,answered);
  const g=GScore.engrave({cf:sc.cf,slots:sc.slots.map(s=>({m:s.m,b:s.b,dur:s.dur,rest:!!s.rest,optRest:false,tiedFrom:s.tiedFrom,tieTo:s.tieTo})),
    vals,above:sc.above,MW:VF_MW[sc.sp]||120,col:vfCol()});
  // Snippets draw no interval rows, so trim the space VexFlow reserves below the lower staff.
  const HH=Math.min(g.H,Math.round(g.bottom+30));
  svg.setAttribute('width',Math.round(g.W*VF_SC));svg.setAttribute('height',Math.round(HH*VF_SC));svg.setAttribute('viewBox',`0 0 ${g.W} ${HH}`);
  const tt=g.top-16,tb=g.bottom+16;let h='';
  sc.marks.forEach(i=>{h+=`<rect class="t-sel" x="${g.slotL[i]+2}" y="${tt}" width="${Math.max(6,g.slotR[i]-g.slotL[i]-4)}" height="${tb-tt}" rx="6"/>`;});
  h+=`<g class="vfw">${g.inner}</g>`;
  svg.innerHTML=h;
}
function playSnippet(){
  const q=drill.q;if(!q)return;
  playScore(q.score,snippetVals(q.score,drill.answered!=null),q.play==='dyad');
}
function playScore(sc,vals,dyad){
  if(!ensureAudio())return;stopAll();const t0=ac.currentTime+0.05;
  if(dyad){tone(freq(sc.cf[0]),t0,1.8,-0.3);if(vals[0])tone(freq(vals[0]),t0,1.8,0.3);return;}
  const bt=60/Math.max(60,Math.min(160,+$('#tempo').value||96)),n=sc.cf.length;
  sc.cf.forEach((c,m)=>tone(freq(c),t0+m*4*bt,(m===n-1?5:4)*bt*0.97,-0.3));
  sc.slots.forEach((s,i)=>{if(!vals[i]||s.tiedFrom!=null)return;let d=s.dur;if(s.tieTo!=null)d+=sc.slots[s.tieTo].dur;
    tone(freq(vals[i]),t0+(s.m*4+s.b)*bt,(s.m===n-1?5:d)*bt*0.95,0.3);});
}
async function newDrill(id){
  if(id)drill.id=id;drill.q=null;drill.answered=null;drill.loading=true;const tk=++drill.token;render();
  let q=null;try{q=await task('drill',{id:drill.id});}catch(e){q=null;}
  if(tk!==drill.token)return;
  drill.loading=false;drill.q=q;
  if(!q)toast('問題を作れませんでした。もう一度「次の問題」を押してください。');
  render();
  if(q&&q.hideScore)playSnippet();
}
function answerDrill(k){
  const q=drill.q;if(!q||drill.answered!=null||!q.choices[k])return;
  drill.answered=k;const ok=q.choices[k].ok;
  drill.streak=ok?drill.streak+1:0;
  const st=store.drillStats[q.id]||(store.drillStats[q.id]={n:0,ok:0,streak:0,best:0});
  st.n++;if(ok)st.ok++;st.streak=ok?(st.streak||0)+1:0;st.best=Math.max(st.best||0,st.streak);st.t=Date.now();persist();
  render();
}
function drawDrill(){
  $('#drillList').innerHTML=DRILLS.map(d=>{const st=store.drillStats[d.id];
    return `<button type="button" data-drill="${d.id}" aria-pressed="${d.id===drill.id}" title="${esc(d.desc)}">${esc(d.title)}${st&&st.n?`<small>${st.ok}/${st.n}</small>`:''}</button>`;}).join('');
  $('#drDesc').textContent=drillInfo(drill.id).desc;
  const q=drill.q,answered=drill.answered!=null,svg=$('#drStaff');
  const hidden=!!(q&&q.hideScore&&!answered);
  $('#drHidden').hidden=!hidden;svg.style.display=hidden||!q?'none':'';
  $('#drPlay').disabled=!q;
  if(q&&!hidden)drawSnippet(svg,q.score,answered);
  let h='';
  if(drill.loading||!q)h=`<p class="muted">${drill.loading?'問題を作っています…':'上の一覧からドリルを選んでください。'}</p>`;
  else{
    h+=`<p class="dq">${esc(q.prompt)}</p><div class="dch">`+q.choices.map((c,i)=>{
      const cls=answered?(c.ok?'right':(i===drill.answered?'wrong':'')):'';
      return `<button type="button" data-ch="${i}" class="${cls}"${answered?' disabled':''}><kbd>${i+1}</kbd>${esc(c.label)}</button>`;}).join('')+'</div>';
    if(answered){const ok=q.choices[drill.answered].ok;
      h+=`<p class="dres ${ok?'good':'bad'}">${ok?'正解です。':'不正解です。正しい答えは「'+esc(q.choices.find(c=>c.ok).label)+'」です。'}</p><p class="dexp">${esc(q.explain)}</p>`;
      h+=`<div class="btnrow"><button class="btn primary" type="button" id="drNext">次の問題(Enter)</button>${q.play?'<button class="btn" type="button" id="drReplay">もう一度聴く</button>':''}</div>`;}
    const st=store.drillStats[drill.id];
    h+=`<p class="dstreak">連続正解 ${drill.streak}${st&&st.n?` · この種類の成績 ${st.ok}/${st.n}(最高連続 ${st.best||0})`:''}</p>`;
  }
  h+=`<p class="toast" role="status">${toastMsg}</p>`;
  $('#panel').innerHTML=h;
}

/* ================= learn (lessons) ================= */
const GLs=window.GL||null;
const SECTIONS=[['intro','考え方'],['examples','模範例'],['bad','悪い例と直し方'],['guided','書いてみる']];
const learn={sp:1,sec:'intro',fixed:{}};
const learnSvgs=[];
function lessonSc(b,marks){return {sp:b.sp,above:b.above,cf:b.cf,slots:b.slots,vals:b.vals,marks:marks||[],hide:[],pre:{}};}
function atLabel(at){const p=GLs.pos(at),beat=p.b+1;return `第${p.m+1}小節${p.b?(Number.isInteger(beat)?` ${beat}拍目`:` ${Math.floor(beat)}拍目の後半`):''}`;}
function issueKey(x){return x.id+':'+x.cols.join(',');}
function drawLearn(){
  const L=GLs.LESSONS[learn.sp];learnSvgs.length=0;
  $('#lnSp').innerHTML=[1,2,3,4,5].map(k=>`<button type="button" data-lsp="${k}" aria-pressed="${k===learn.sp}">${SPECIES[k].name}<small>${SPECIES[k].ratio}</small></button>`).join('');
  $('#lnSec').innerHTML=SECTIONS.map(([id,t])=>`<button type="button" data-lsec="${id}" aria-pressed="${id===learn.sec}">${t}</button>`).join('');
  let h='';
  if(learn.sec==='intro'){
    h+=`<article class="lesson"><h2>${esc(L.title)}</h2>${L.intro.map(p=>`<p>${esc(p)}</p>`).join('')}
      <h3>要点</h3><dl class="lpoints">${L.points.map(p=>`<div><dt>${esc(p.h)}</dt><dd>${esc(p.body)}</dd></div>`).join('')}</dl></article>`;
  }else if(learn.sec==='examples'){
    h+=`<p class="lsrc">模範例はすべて ${esc(GLs.SOURCE)} から書き起こしたものです。定旋律は原書の D の定旋律(ドリア)です。</p>`;
    L.examples.forEach((ex,i)=>{
      const b=GLs.build(learn.sp,ex),r=GLs.analyzeBuilt(b),k=learnSvgs.length;
      learnSvgs.push({sc:lessonSc(b,[]),b,notes:ex.notes});
      const allowed=r.issues.filter(x=>x.lv==='err');
      h+=`<section class="lex"><div class="lex-head"><h3>${esc(ex.title)}</h3><span class="muted">原書 ${ex.page}ページ</span></div>
        <div class="staff-scroll"><svg class="lsvg" data-k="${k}" role="img" aria-label="${esc(L.title)} ${esc(ex.title)}の模範例"></svg></div>
        <div class="btnrow"><button class="btn primary" type="button" data-lplay="${k}">▶ 聴く</button></div>
        <ol class="lnotes">${ex.notes.map((n,j)=>`<li><button type="button" data-lnote="${k}:${j}"><b>${atLabel(n.at)}</b>${esc(n.text)}</button></li>`).join('')}</ol>
        ${allowed.length?`<p class="lwarn">このアプリの判定では「${[...new Set(allowed.map(x=>RULES[x.id]))].join('」「')}」が誤りになります(上の注釈を見てください)。</p>`:''}</section>`;
    });
  }else if(learn.sec==='bad'){
    h+=`<p class="lsrc">模範例の1音を変えて、規則に反する形を作りました。「直す」で原例に戻して聴き比べてください。</p>`;
    L.bad.forEach((bd,i)=>{
      const ex=L.examples[bd.ex],fixed=!!learn.fixed[learn.sp+':'+i];
      const orig=GLs.build(learn.sp,ex),bb=GLs.build(learn.sp,ex,bd.change),b=fixed?orig:bb;
      const base=new Set(GLs.analyzeBuilt(orig).issues.map(issueKey));
      const added=GLs.analyzeBuilt(bb).issues.filter(x=>!base.has(issueKey(x)));
      const k=learnSvgs.length;learnSvgs.push({sc:lessonSc(b,bb.changed),b});
      h+=`<section class="lex"><div class="lex-head"><h3>${esc(bd.title)}</h3><span class="muted">${esc(L.examples[bd.ex].title)}の模範例から</span></div>
        <div class="staff-scroll"><svg class="lsvg" data-k="${k}" role="img" aria-label="${esc(bd.title)}の例"></svg></div>
        <div class="btnrow"><button class="btn primary" type="button" data-lplay="${k}">▶ 聴く</button><button class="btn" type="button" data-lfix="${i}" aria-pressed="${fixed}">${fixed?'悪い例に戻す':'直す'}</button></div>
        ${fixed?`<p class="res-ok">原例に戻しました。枠の音を聴き比べてください。</p>`:`<ul class="lissues">${added.map(x=>`<li><span class="sev ${x.lv}">${x.lv==='err'?'誤り':'注意'}</span><b>${esc(x.t)}</b> ${esc(x.x)}</li>`).join('')}</ul>`}
        <p class="lfix"><b>直し方</b> ${esc(bd.text)}</p></section>`;
    });
  }else{
    const g=L.guided,cfn=FUX_NOTES[g.mode];
    h+=`<article class="lesson"><h2>書いてみる</h2><p>フックスの${MODES[g.mode].name}の定旋律に、対旋律を${g.above?'上':'下'}に付けます。練習画面で、次の4つの手順に分けて書きます。手順ごとに、書く場所だけが開き、ほかは固定されます。</p>
      <ol class="lsteps">${GLs.GUIDED_STEPS.map(st=>`<li><b>${esc(st.title)}</b> ${esc(st.text)}</li>`).join('')}</ol>
      <p class="muted">定旋律: ${cfn.map(nameOf).join(' ')}</p>
      <div class="btnrow"><button class="btn primary" type="button" id="lnGuided">練習画面で始める</button></div>
      <p class="muted">書き終えると、そのまま練習画面の解答として残ります(定旋律の一覧の「フックスの定旋律」の${MODES[g.mode].name})。</p></article>`;
  }
  $('#lnBody').innerHTML=h;
  document.querySelectorAll('#lnBody svg.lsvg').forEach(svg=>{const it=learnSvgs[+svg.dataset.k];if(!it)return;drawSnippet(svg,it.sc,true);scrollToMark(svg);});
  // The intro section already shows the points; elsewhere the panel keeps them at hand.
  let p=learn.sec==='intro'?`<h2>${esc(L.title)}</h2><p class="muted">考え方を読んだら、模範例を聴いてみましょう。</p>`:`<h2>${esc(L.title)}<span>要点</span></h2><ul class="lside">${L.points.map(x=>`<li><b>${esc(x.h)}</b><br>${esc(x.body)}</li>`).join('')}</ul>
    <div class="btnrow"><button class="btn primary" type="button" id="lnPractice">練習タブで${SPECIES[learn.sp].name}を開く</button></div>`;
  p+=`<p class="toast" role="status">${toastMsg}</p>`;
  $('#panel').innerHTML=p;
}
// Keep a marked note in view: a bad example's change may sit past the visible width of the staff.
function scrollToMark(svg){
  const r=svg.querySelector('rect.t-sel'),box=svg.parentElement;if(!r||!box)return;
  const k=svg.getBoundingClientRect().width/((svg.viewBox&&svg.viewBox.baseVal&&svg.viewBox.baseVal.width)||1);
  const x=(+r.getAttribute('x'))*k;
  if(x<box.scrollLeft+40||x>box.scrollLeft+box.clientWidth-80)box.scrollLeft=Math.max(0,x-box.clientWidth/3);
}
/* ---- guided task: the practice screen opened step by step ---- */
function guidedSteps(){
  const n=cf().length,ok=s=>editable(s);
  return {cadence:curS.filter(s=>ok(s)&&s.m>=n-2),opening:curS.filter(s=>ok(s)&&s.m===0),
    climax:curS.filter(s=>ok(s)&&s.m>0&&s.m<n-2),rest:curS.filter(s=>ok(s)&&s.m>0&&s.m<n-2)};
}
function guidedApply(){
  const f=state.fill,gs=guidedSteps(),open=new Set();
  GLs.GUIDED_STEPS.slice(0,f.guided.idx+1).forEach(st=>gs[st.kind].forEach(s=>open.add(skey(s))));
  const cur=gs[GLs.GUIDED_STEPS[f.guided.idx].kind];
  f.blanks=cur.map(skey);f.locked=new Set(curS.filter(s=>editable(s)&&!open.has(skey(s))).map(skey));
  const first=cur.find(s=>!curV[s.i]&&!s.optRest)||cur[0];if(first)state.sel=first.i;
}
function guidedDone(r){
  const f=state.fill,st=GLs.GUIDED_STEPS[f.guided.idx],slots=guidedSteps()[st.kind],idx=new Set(slots.map(s=>s.i));
  const errHere=r.issues.some(x=>x.lv==='err'&&x.cols.some(c=>idx.has(c)));
  if(st.kind==='climax')return slots.some(s=>curV[s.i])&&!errHere;
  if(st.kind==='rest')return r.complete&&!r.issues.some(x=>x.lv==='err');
  return slots.every(s=>curV[s.i]||s.optRest)&&!errHere;
}
function guidedBox(r){
  const f=state.fill,k=f.guided.idx,st=GLs.GUIDED_STEPS[k],last=k===GLs.GUIDED_STEPS.length-1,done=guidedDone(r);
  const filledMid=st.kind==='climax'?guidedSteps().climax.filter(s=>curV[s.i]):[];
  let h=`<div class="fillbox"><span class="k">書いてみる · ${SPECIES[state.sp].name} · 手順 ${k+1}/4</span><p><b>${esc(st.title)}</b> ${esc(st.text)}</p>`;
  if(st.kind==='climax'&&filledMid.length)h+=`<p class="muted">置いた音のうち最も高い音: ${nameOf(filledMid.map(s=>curV[s.i]).sort((a,b)=>midi(b)-midi(a))[0])}</p>`;
  h+=`<div class="btnrow"><button class="btn primary" type="button" id="gdNext"${done?'':' disabled'}>${last?'完成':'次へ'}</button><button class="btn" type="button" id="gdQuit">やめる</button></div>`;
  if(!done)h+=`<p class="muted">${st.kind==='rest'?'すべての音を入れ、誤りをなくすと完成です。':st.kind==='climax'?'途中の小節に1音置くと次へ進めます(誤りがないこと)。':'点線の枠をすべて埋め、誤りをなくすと次へ進めます。'}</p>`;
  return h+'</div>';
}
function startGuided(sp){
  const g=GLs.LESSONS[sp].guided;if(state.playing)stopPlayback();
  saveDraft();
  const stash={sp:state.sp,mode:state.mode,above:state.above,snap:snapshot(),hist:state.hist,future:state.future,example:state.example,compare:state.compare};
  state.sp=sp;state.mode=g.mode;state.above=g.above;state.cp={};state.rhythm=[];state.ties=[];
  state.hist=[];state.future=[];state.compare=null;state.example=false;state.focus=[];state.checkedSig=null;state.sel=0;
  state.view='practice';refreshCfSelect();refreshSlots();
  state.fill={guided:{sp,idx:0},blanks:[],locked:new Set(),answer:null,checkedSig:null,result:null,stash};
  guidedApply();render();toast('手順1: 最後の2小節から書きます。');
}
function guidedNext(){
  const f=state.fill;if(!f||!f.guided||!guidedDone(lastR))return;
  if(f.guided.idx<GLs.GUIDED_STEPS.length-1){f.guided.idx++;guidedApply();render();toast(`手順${f.guided.idx+1}: ${GLs.GUIDED_STEPS[f.guided.idx].title}`);return;}
  state.fill=null;saveDraft();render();toast('完成です。ここからは通常の練習画面です。保存して記録に残せます。');
}

/* ================= render ================= */
function drawMbar(r){
  const b=$('#mbar');
  if(state.view==='history'||state.view==='drill'||state.view==='learn'){b.hidden=true;return;}
  b.hidden=false;
  if(state.view==='review'){b.innerHTML=`<span>復習:${review?RULES[review.rule]:'問題を作っています…'}</span><span>操作へ ↓</span>`;return;}
  const {e,w}=scoreOf(r);
  const left=!showJudg()?`答え合わせ前${r.complete?'':` · 未入力 ${r.missing}音`}`:(!e&&!w?'<span class="good">規則違反なし</span>':`<span class="e">誤り ${e}</span> · <span class="w">注意 ${w}</span>`)+(r.complete||!showJudg()?'':` · 未入力 ${r.missing}`);
  b.innerHTML=`<span>${left}</span><span>指摘を見る ↓</span>`;
}
function render(){
  if(state.compare&&state.compare.key!==cmpKey())state.compare=null;
  refreshSlots();
  const r=analyze(ctx());lastR=r;const v=state.view;
  document.querySelectorAll('[data-show]').forEach(el=>{el.hidden=!el.dataset.show.split(' ').includes(v);});
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-selected',b.dataset.view===v));
  $('#subTitle').textContent=v==='learn'?`学ぶ · ${SPECIES[learn.sp].name}`:v==='drill'?`ドリル · ${drillInfo(drill.id).title}`:v==='history'?'記録':v==='review'?`復習 · ${SPECIES[state.sp].name}`:`${SPECIES[state.sp].name} · ${SPECIES[state.sp].ratio}`;
  {const pk=presetOf(state.levels);$('#rulesBtn').textContent=`${SPECIES[state.sp].name}の規則`+(pk==='fux'?'':` · ${presetName(state.levels)}`);}
  drawMbar(r);
  if(v==='history'){drawHistory();return;}
  if(v==='drill'){drawDrill();return;}
  if(v==='learn'){drawLearn();return;}
  drawStaff(r);drawEditor(r);
  if(drawer==='rules')drawRules();
  if(drawer==='cf')drawCfTools();
  if(v==='review')drawReviewPanel(r);else drawPracticePanel(r);
  $('#playBtn').textContent=state.playing?'■ 停止':'▶ 再生';
  $('#undoBtn').disabled=!state.hist.length;$('#redoBtn').disabled=!state.future.length;
  const cb=$('#cmpBtn');cb.setAttribute('aria-pressed',!!state.compare);cb.disabled=busy.cmp;cb.classList.toggle('busy',busy.cmp);
  cb.textContent=busy.cmp?'解答例を探しています…':state.compare?'比べるのをやめる':'解答例と比べる';
  const qg=$('#quickGen');qg.disabled=busy.gen;qg.textContent=busy.gen?'作っています…':'新しい定旋律';
  const gb=$('#genBtn');gb.disabled=busy.gen;gb.textContent=busy.gen?'作っています…':'生成する';
  $('#posAbove').setAttribute('aria-pressed',state.above);$('#posBelow').setAttribute('aria-pressed',!state.above);
  document.querySelectorAll('#spSeg button').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.sp===state.sp));
  sel.disabled=!!state.fill;$('#fillBtn').textContent=busy.fill?'作っています…':state.fill?'穴埋め中':'穴埋め';$('#fillBtn').setAttribute('aria-pressed',!!state.fill);
  $('#cfSel').value=state.mode;$('#hintChk').checked=state.hints;$('#fbSel').value=state.fb;$('#ivSel').value=state.ivMode;
}

/* ================= save / history / review ================= */
function recordStats(r){
  const seen={};r.issues.forEach(x=>{if(seen[x.id])return;seen[x.id]=1;
    const s=store.stats[x.id]||(store.stats[x.id]={n:0,nw:0,r:0,w:0});if(x.lv==='err')s.n++;else s.nw++;s.sp=state.sp;s.t=Date.now();});
}
function saveAnswer(){
  const r=lastR;if(!Object.keys(state.cp).length){toast('保存する音がまだありません。');return;}
  const {e,w,g}=scoreOf(r),snap=snapshot();
  const last=store.history.find(x=>x.key===dkey());
  if(last&&JSON.stringify({cp:last.cp,rhythm:last.rhythm,ties:last.ties})===JSON.stringify(snap)){last.t=Date.now();persist();toast('同じ解答がすでに保存されています(日時を更新しました)。');return;}
  store.history.unshift({id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),t:Date.now(),key:dkey(),sp:state.sp,mode:state.mode,label:(cfEntry(state.mode)||{short:''}).short,cfNotes:cf().map(noteStr).join(' '),above:state.above,
    cp:snap.cp,rhythm:snap.rhythm,ties:snap.ties,preset:presetName(state.levels),pts:g.total,pass:g.pass,errs:e,warns:w,complete:r.complete});
  if(store.history.length>300)store.history.length=300;
  recordStats(r);
  persist();toast('保存しました。「記録」タブで見返せます。');
}
function openHistory(id){
  if(state.fill)quitFill();
  const e=store.history.find(x=>x.id===id);if(!e)return;
  leaveReview();
  if(!cfEntry(e.mode)){
    if(!e.cfNotes){toast('この解答の定旋律は削除されているため開けません。');return;}
    store.cfs.push({id:e.mode,kind:'user',label:e.label||'復元した定旋律',notes:e.cfNotes,t:Date.now()});refreshCfSelect();
  }
  state.sp=e.sp;state.mode=e.mode;state.above=e.above;
  state.cp=JSON.parse(JSON.stringify(e.cp));state.rhythm=(e.rhythm||[]).slice();state.ties=(e.ties||[]).slice();
  state.hist=[];state.future=[];state.focus=[];state.example=false;state.compare=null;state.checkedSig=null;state.sel=0;state.view='practice';saveDraft();
  toast('記録の解答を開きました。');
}
// Opening a record replaces the draft kept for the same species, cantus firmus and voice position.
function openConflict(id){
  const e=store.history.find(x=>x.id===id);if(!e)return false;const d=store.drafts[e.key];
  if(!d||!d.cp||!Object.keys(d.cp).length)return false;
  return JSON.stringify({cp:d.cp,rhythm:d.rhythm||[],ties:d.ties||[]})!==JSON.stringify({cp:e.cp,rhythm:e.rhythm||[],ties:e.ties||[]});
}
function pickRule(exclude){
  const rows=weakRows().filter(x=>INJECT[x.id]&&x.p>0&&x.id!==exclude).slice(0,4).map(x=>x.id);
  const pool=rows.length?rows:['parallel','hidden','dissonance','leading','leapAug','weakdis','susp','unison'].filter(x=>x!==exclude);
  return pool[Math.floor(Math.random()*pool.length)];
}
let reviewToken=0;
async function startReview(rule){
  if(state.playing)stopPlayback();
  if(state.view!=='review'){stash={sp:state.sp,mode:state.mode,above:state.above,snap:snapshot(),sel:state.sel,hist:state.hist,future:state.future,example:state.example,compare:state.compare};}
  state.view='review';const no=review?review.no+1:1,prevRule=review?review.rule:null;review=null;render();
  const token=++reviewToken;
  let q=null,r=rule||pickRule(prevRule);
  for(let k=0;k<4&&!q;k++){
    try{q=await task('question',{rule:r,prefSp:store.stats[r]&&store.stats[r].sp});}catch(e){q=null;}
    if(token!==reviewToken||state.view!=='review')return;
    if(!q)r=pickRule(r);
  }
  if(!q){toast('問題を作れませんでした。もう一度「次の問題」を押してください。');review={rule:r,sp:1,label:'',above:true,no,result:null,answer:null,target:[]};render();return;}
  q.no=no;review=q;state.sp=q.sp;state.cfTemp=q.cf;state.above=q.above;applySnap({cp:q.cp,rhythm:q.rhythm,ties:q.ties});
  state.hist=[];state.future=[];state.focus=[];state.example=false;state.compare=null;state.sel=0;toastMsg='';render();
}
function leaveReview(){
  if(state.view!=='review')return;if(state.playing)stopPlayback();reviewToken++;
  review=null;state.cfTemp=null;
  if(stash){state.sp=stash.sp;state.mode=stash.mode;state.above=stash.above;applySnap(stash.snap);state.sel=stash.sel;state.hist=stash.hist;state.future=stash.future||[];state.example=stash.example;state.compare=stash.compare||null;}
  stash=null;state.view='practice';state.focus=[];
}
function checkReview(){
  if(!review||!review.answer)return;const r=lastR;
  const targetLeft=r.issues.some(x=>x.id===review.rule),errs=r.issues.filter(x=>x.lv==='err').length;
  const ok=!targetLeft&&!errs&&r.complete;
  if(!review.checked){review.checked=true;const s=store.stats[review.rule]||(store.stats[review.rule]={n:0,nw:0,r:0,w:0});if(ok)s.r++;else s.w++;s.sp=review.sp;persist();}
  review.result={ok,targetLeft,complete:r.complete};render();
}

/* ================= compare with a model answer ================= */
async function requestCompare(){
  if(busy.cmp)return;busy.cmp=true;render();
  const key=cmpKey();
  let sol=null;try{sol=await task('solve',{sp:state.sp,cf:cf(),above:state.above,rhythm:state.rhythm,ties:state.ties,ms:2500});}catch(e){sol=null;}
  busy.cmp=false;
  if(key!==cmpKey()){render();return;}
  if(!sol){toast('解答例が見つかりませんでした。もう一度押すか、リズムやタイを変えてみてください。');return;}
  state.compare={key,cp:sol};render();
}

/* ================= cantus firmus management ================= */
function addCF(kind,notes){
  store.cfSeq=(store.cfSeq||0)+1;const md=modeOf(notes);
  const mname=md?MODES[md].name:`${nameOf(notes[notes.length-1]).replace(/\d/,'')}終止`;
  const id=(kind==='gen'?'g':'u')+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  store.cfs.push({id,kind,label:`${kind==='gen'?'生成':'自作'}${store.cfSeq} · ${mname} · ${notes.length}音`,notes:notes.map(noteStr).join(' '),t:Date.now()});
  const gens=store.cfs.filter(x=>x.kind==='gen');
  if(gens.length>60)removeCF(gens[0].id);
  return id;
}
function removeCF(id){
  store.cfs=store.cfs.filter(x=>x.id!==id);
  for(const k of Object.keys(store.drafts))if(k.includes(`-${id}-`))delete store.drafts[k];
  persist();
}
const sel=$('#cfSel');
function refreshCfSelect(){
  const groups=[['フックスの定旋律',FUX.map(([k])=>cfEntry(k))],['自動生成',store.cfs.filter(x=>x.kind==='gen').slice().reverse().map(x=>cfEntry(x.id))],['自分で入力',store.cfs.filter(x=>x.kind!=='gen').slice().reverse().map(x=>cfEntry(x.id))]];
  sel.innerHTML=groups.filter(g=>g[1].length).map(([t,l])=>`<optgroup label="${t}">${l.map(e=>`<option value="${e.id}">${esc(e.label)}</option>`).join('')}</optgroup>`).join('');
  if(!cfEntry(state.mode))state.mode='dorian';
  sel.value=state.mode;
}
function switchCF(id){if(state.playing)stopPlayback();saveDraft();state.mode=id;loadDraft();saveDraft();refreshCfSelect();render();}
async function generateNew(){
  if(busy.gen)return;busy.gen=true;render();
  const sps=[4,state.sp,1,2,3,5].filter((x,i,a)=>a.indexOf(x)===i);
  let res=null;try{res=await task('genCF',{mode:$('#genMode').value,len:$('#genLen').value,sps,budget:9000});}catch(e){res=null;}
  busy.gen=false;
  if(!res||state.view!=='practice'){if(!res)toast('条件に合う定旋律が見つかりませんでした。もう一度押すか、長さや旋法を変えてください。');else render();return;}
  const id=addCF('gen',res.notes);persist();switchCF(id);
  toast(`新しい定旋律(${MODES[res.mode].name}・${res.notes.length}音)を作りました。第1〜5類のどれでも、対旋律が上でも下でも解答が作れることを確かめてあります。`);
}
let cfMsg='';
async function addCustom(){
  if(busy.custom)return;
  const r=parseCF($('#cfText').value);
  if(r.err){cfMsg=`<p class="cf-err">${esc(r.err)}</p>`;render();return;}
  busy.custom=true;cfMsg='<p class="muted">確かめています…</p>';render();
  const warns=cfIssues(r.notes);
  let solv=true;try{solv=await task('cfSolvable',{notes:r.notes,sps:[1],ms:600});}catch(e){}
  busy.custom=false;
  const id=addCF('user',r.notes);persist();$('#cfText').value='';
  let m=`<p class="cf-ok">追加しました(${r.notes.map(nameOf).join(' ')})。</p>`;
  if(!solv)m+=`<p class="cf-err">この定旋律では、第1類で規則を満たす解答が見つかりませんでした。書くことはできますが、誤りが残る可能性があります。</p>`;
  if(warns.length)m+=`<p class="muted">定旋律として気になる点:</p><ul class="cf-warn">${warns.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`;
  cfMsg=m;switchCF(id);
}
function drawCfTools(){
  const e=cfEntry(state.mode);if(!e)return;
  const kind={fux:'フックス『Gradus ad Parnassum』の定旋律',gen:'自動生成した定旋律',user:'自分で入力した定旋律'}[e.kind];
  let h=`<h3>選択中の定旋律</h3><p class="cf-cur"><b>${esc(e.label)}</b><br><span class="muted">${kind} · ${e.notes.map(nameOf).join(' ')}</span></p>`;
  if(e.kind!=='fux')h+=`<button class="btn danger" type="button" id="cfDel">${pendingDel==='cf:'+e.id?'本当に削除':'この定旋律を削除'}</button>`;
  $('#cfCur').innerHTML=h;$('#cfMsg').innerHTML=cfMsg;
}

/* ================= export / import ================= */
function exportJSON(){return JSON.stringify({app:'gradus',format:2,exported:new Date().toISOString(),data:store},null,1);}
function exportFile(){
  const txt=exportJSON(),d=new Date(),name=`gradus-記録-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}.json`;
  try{const url=URL.createObjectURL(new Blob([txt],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);}catch(e){}
  ioMode='export';ioText=txt;ioMsg='ファイルの保存が始まらない場合(Claude上のページなど)は、下のテキストをコピーして保存してください。';render();
}
function importFrom(text){
  let o;try{o=JSON.parse(text);}catch(e){ioMsg='読み込めませんでした。書き出したときのテキストをそのまま貼り付けてください。';render();return;}
  const d=o&&o.app==='gradus'&&o.data?o.data:null;
  if(!d||typeof d!=='object'||!Array.isArray(d.history||[])){ioMsg='Gradus の記録として読み取れませんでした。';render();return;}
  store={drafts:{},prefs:{},history:[],stats:{},cfs:[],cfSeq:0,drillStats:{},...d};normStore();persist();
  ioMode=null;ioText='';ioMsg='';pendingDel=null;
  const pf=store.prefs;if(SPECIES[pf.sp])state.sp=pf.sp;state.mode=cfEntry(pf.mode)?pf.mode:'dorian';state.above=pf.above!==false;state.levels=cleanLevels(pf.levels);state.zoom=ZOOMS.includes(pf.zoom)?pf.zoom:1;$('#zoomSel').value=String(state.zoom);
  refreshCfSelect();loadDraft();toast(`記録を読み込みました(保存した解答 ${store.history.length}件)。`);
}

/* ================= MIDI keyboard (step input) ================= */
// 綴り: 白鍵は幹音、黒鍵は C♯・E♭・F♯・G♯・B♭(厳格対位法で使う変化音は導音の♯とB♭がほとんどのため)
const MIDI_SPELL=[[0,0],[0,1],[1,0],[2,-1],[2,0],[3,0],[3,1],[4,0],[4,1],[5,0],[6,-1],[6,0]];
function midiToNote(m){const [L,a]=MIDI_SPELL[m%12];return {s:(Math.floor(m/12)-1)*7+L,a};}
let midiAcc=null,midiOn=false;
const midiInputs=()=>midiAcc?[...midiAcc.inputs.values()].filter(i=>i.state!=='disconnected'):[];
function bindMidi(){if(midiAcc)for(const inp of midiAcc.inputs.values())inp.onmidimessage=midiOn?onMidi:null;updMidi();}
function onMidi(e){const d=e.data;if(!d||d.length<3)return;if((d[0]&0xf0)!==0x90||d[2]===0)return;midiNote(d[1]);}
function midiNote(m){
  if(!midiOn||state.view==='history'||state.view==='learn'||state.view==='drill'||state.playing||drawer)return;
  const note=midiToNote(m);
  if(note.s<SMIN+1||note.s>SMAX){toast(`${nameOf(note)}は五線に表示できる範囲の外です。`);return;}
  const i=state.sel;ensureAudio();setNote(i,note);
  const L=state.fill?editList().filter(x=>!state.fill.locked.has(skey(curS[x]))):editList();
  const j=L.find(x=>x>i);if(j!=null){state.sel=j;state.focus=[];render();}
}
async function midiEnable(auto){
  try{midiAcc=await navigator.requestMIDIAccess({sysex:false});}
  catch(e){midiAcc=null;midiOn=false;updMidi();
    if(!auto)toast('MIDI機器へのアクセスが許可されませんでした。ブラウザのサイト設定で「MIDIデバイス」を許可してください。Claude上のページでは使えないため、公開したアプリ版をChromeかEdgeで開いてください。');
    return;}
  midiOn=true;midiAcc.onstatechange=bindMidi;bindMidi();savePrefs();
  if(!auto){const ins=midiInputs();
    toast(ins.length?`MIDI鍵盤(${ins.map(i=>i.name||'名称不明').join('、')})を使えます。押した音が選択中の位置に入り、次の位置へ進みます。`:'MIDI入力をオンにしました。鍵盤をつなぐと自動で使えるようになります。');}
}
function midiDisable(){midiOn=false;bindMidi();savePrefs();toast('MIDI鍵盤の入力をオフにしました。');}
function updMidi(){
  const b=$('#midiBtn'),ins=midiInputs();
  b.setAttribute('aria-pressed',midiOn);b.classList.toggle('nodev',midiOn&&!ins.length);
  b.textContent=!midiOn?'MIDI鍵盤を使う':ins.length?`MIDI: ${ins[0].name||'鍵盤'}${ins.length>1?` ほか${ins.length-1}台`:''}`:'MIDI: 鍵盤が未接続';
  b.title=midiOn?'クリックでMIDI入力をオフにします':'MIDI鍵盤から音を入力します(Chrome・Edge)';
  $('#midiHelp').hidden=!midiOn;
}

/* ================= clefs ================= */
// 音部記号は文字(Noto Music)で描く。大きさと位置は、文字の外枠ではなく記号の実際の形(インクの範囲)を測って合わせる。
// 目標: ト音記号 = 第5線の約1.75間上〜第1線の約1.5間下、ヘ音記号 = 第5線のわずか上〜第2線の少し下(点はF線をはさむ)。
const CLEF_FONT='"Noto Music","Bravura Text","Segoe UI Symbol","Apple Symbols",serif';
function measureClefs(){
  let ctx=null;try{ctx=document.createElement('canvas').getContext('2d');}catch(e){}
  if(!ctx)return null;
  ctx.font=`100px ${CLEF_FONT}`;
  const yT=s=>TOP+(SMAX-s)*H, yB=s=>TOP+(SMAX-s)*H+GAP; // ト音譜表・ヘ音譜表それぞれの連続座標
  const fit={};
  for(const[k,ch,top,bot,left]of[['t','\u{1D11E}',yT(41.6),yT(27.0),20],['b','\u{1D122}',yB(26.3),yB(20.5),22]]){
    const m=ctx.measureText(ch),asc=m.actualBoundingBoxAscent,desc=m.actualBoundingBoxDescent,l=m.actualBoundingBoxLeft||0;
    if(!(asc+desc>1)){fit[k]=null;continue;}
    const sc=(bot-top)/(asc+desc);
    fit[k]={sc,tx:left+l*sc,ty:top+asc*sc};
  }
  return fit;
}

/* ================= events ================= */
const svgEl=$('#staff');
function ptLegacy(e){
  const bb=svgEl.getBoundingClientRect(),x=e.clientX-bb.left,yy=e.clientY-bb.top,{MW}=SPECIES[state.sp],m=Math.floor((x-LEFT)/MW);
  if(m<0||m>=cf().length||yy<TOP-16||yy>NOTE_BOTTOM+8)return null;
  const q=(x-LEFT-m*MW)/MW*4;let sl=curS.find(s=>s.m===m&&q>=s.b&&q<s.b+s.dur);
  if(!sl)return null;if(sl.tiedFrom!=null)sl=curS[sl.tiedFrom];if(sl.rest)return null;
  const[lo,hi]=vrange();return {i:sl.i,s:Math.max(lo,Math.min(hi,stepAt(yy)))};
}
function ptVF(e){
  const bb=svgEl.getBoundingClientRect(),k=geo.W/bb.width,x=(e.clientX-bb.left)*k,yy=(e.clientY-bb.top)*k;
  if(yy<geo.top-40||yy>geo.bottom+20)return null;
  let i=curS.findIndex((s,j)=>x>=geo.slotL[j]&&x<geo.slotR[j]);if(i<0)return null;
  let sl=curS[i];if(sl.tiedFrom!=null)sl=curS[sl.tiedFrom];if(sl.rest)return null;
  const st=cpSt(),s0=Math.round(st.topS-(yy-st.topY)/geo.step);
  const[lo,hi]=vrange();return {i:sl.i,s:Math.max(lo,Math.min(hi,s0))};
}
function pt(e){return geo?ptVF(e):ptLegacy(e);}
staffBox().addEventListener('scroll',syncMiniFrame,{passive:true});
$('#miniMap').addEventListener('click',e=>{const b=e.target.closest('[data-mm]');if(!b||!geo)return;
  const m=+b.dataset.mm,box=staffBox();box.scrollLeft=Math.max(0,(m===0?0:geo.measX[m])*mainSc()-16);
  // Select the first editable note of that bar so the next render keeps the view there.
  const j=curS.findIndex(s=>s.m===m&&editable(s));if(j>=0&&state.view==='practice'){state.sel=j;render();}else syncMiniFrame();});
$('#zoomSel').addEventListener('change',e=>{const z=+e.target.value;state.zoom=ZOOMS.includes(z)?z:1;savePrefs();render();});
addEventListener('resize',()=>{drawMiniMap();followStaff();});
matchMedia('(max-width:920px)').addEventListener('change',()=>render());
svgEl.addEventListener('pointermove',e=>{const g=$('#ghost');if(!g)return;if(e.pointerType!=='mouse'){g.innerHTML='';return;}
  const p=pt(e);if(!p||(curV[p.i]&&curV[p.i].s===p.s)){g.innerHTML='';return;}
  g.innerHTML=geo?headSVG({s:p.s,a:0},geo.slotX[p.i],'ghost'):noteSVG({s:p.s,a:0},curS[p.i].x,'ghost',curS[p.i].dur,state.above?'up':'down');});
svgEl.addEventListener('pointerleave',()=>{const g=$('#ghost');if(g)g.innerHTML='';});
svgEl.addEventListener('click',e=>{const p=pt(e);if(!p)return;ensureAudio();state.sel=p.i;
  const cur=curV[p.i];if(cur&&cur.s===p.s){state.focus=[];render();playSlot(p.i);return;}
  setNote(p.i,{s:p.s,a:0});});
function setAcc(a){const cur=curV[state.sel];if(!cur||cur.a===a)return;setNote(state.sel,{s:cur.s,a});}
function moveNote(dir){const i=state.sel,cur=curV[i],[lo,hi]=vrange(),c=cf()[curS[i].m];
  const s=cur?cur.s+dir:(state.above?c.s+2:c.s-5);setNote(i,{s:Math.max(lo,Math.min(hi,s)),a:0});}
function selStep(dir){const L=editList();const j=dir>0?L.find(x=>x>state.sel):[...L].reverse().find(x=>x<state.sel);
  if(j!=null){state.sel=j;state.focus=[];render();}}
document.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('click',()=>{ensureAudio();const a=b.dataset.act;
  if(a==='prev')selStep(-1);else if(a==='next')selStep(1);else if(a==='up')moveNote(1);else if(a==='down')moveNote(-1);
  else if(a==='sharp')setAcc(1);else if(a==='flat')setAcc(-1);else if(a==='natural')setAcc(0);else if(a==='del')setNote(state.sel,null,false);}));
$('#edExtra').addEventListener('click',e=>{
  if(state.fill){toast('穴埋め中はリズムやタイを変えられません。');return;}
  const t=e.target.closest('[data-tie]'),p=e.target.closest('[data-pat]');
  if(t){const m=+t.dataset.tie,ties=state.ties.slice();ties[m]=ties[m]===false?true:false;restructure(state.rhythm.slice(),ties);}
  if(p&&!p.disabled){const m=curS[state.sel].m,rh=state.rhythm.slice();if(rh[m]===p.dataset.pat)return;rh[m]=p.dataset.pat;restructure(rh,state.ties.slice());}
});
$('#panel').addEventListener('click',e=>{
  const ch=e.target.closest('[data-ch]');if(ch){answerDrill(+ch.dataset.ch);return;}
  if(e.target.id==='drNext'){newDrill();return;}
  if(e.target.id==='fillCheck'){checkFill();return;}
  if(e.target.id==='gdNext'){guidedNext();return;}
  if(e.target.id==='gdQuit'){quitFill();state.view='learn';render();toast('書いてみるをやめて、元の練習に戻しました。');return;}
  if(e.target.id==='lnPractice'){saveDraft();state.sp=learn.sp;loadDraft();state.view='practice';render();return;}
  if(e.target.id==='fillHint'){hintFill();return;}
  if(e.target.id==='fillQuit'){quitFill();render();toast('穴埋めをやめて、元の解答に戻しました。');return;}
  if(e.target.id==='drReplay'){playSnippet();return;}
  const b=e.target.closest('[data-issue]');
  if(b&&lastR){const it=lastR.issues[+b.dataset.issue];if(!it)return;state.sel=curS[it.cols[0]].tiedFrom!=null?curS[it.cols[0]].tiedFrom:it.cols[0];render();state.focus=it.cols.slice();drawStaff(lastR);ensureAudio();playCols(it.cols);
    if(window.matchMedia('(max-width:920px)').matches)$('.staff-card').scrollIntoView({behavior:'smooth',block:'start'});return;}
  const rv=e.target.closest('[data-review]');if(rv){startReview(rv.dataset.review);return;}
  const id=e.target.id;
  if(id==='saveBtn')saveAnswer();
  else if(id==='checkBtn'){state.checkedSig=sig();render();}
  else if(id==='cmpPlay'&&state.compare)playAll(valsOf(curS,state.compare.cp));
  else if(id==='cmpMine')playAll();
  else if(id==='cmpAnother'){state.compare=null;requestCompare();}
  else if(id==='cmpAdopt'&&state.compare){const sn=snapshot();sn.cp=JSON.parse(JSON.stringify(state.compare.cp));state.compare=null;commit(sn);toast('解答例を採用しました。「元に戻す」で自分の解答に戻れます。');}
  else if(id==='cmpOff'){state.compare=null;render();}
  else if(id==='rvCheck')checkReview();
  else if(id==='rvHint'&&review&&review.target){state.focus=review.target.slice();drawStaff(lastR);ensureAudio();playCols(review.target);}
  else if(id==='rvShow'&&review&&review.answer){if(!review.checked){review.checked=true;const s=store.stats[review.rule]||(store.stats[review.rule]={n:0,nw:0,r:0,w:0});s.w++;persist();}
    state.cp=JSON.parse(JSON.stringify(review.answer));review.result={shown:true};state.focus=[];render();}
  else if(id==='rvNext')startReview();
  else if(id==='rvQuit'){leaveReview();render();}
  else if(id==='goReview')startReview();
  else if(id==='exFile')exportFile();
  else if(id==='exText'){ioMode='export';ioText=exportJSON();ioMsg='';render();}
  else if(id==='exCopy'){const ta=$('#ioText');const done=()=>{ioMsg='コピーしました。';render();};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(ioText).then(done,()=>{ta.select();ioMsg='選択しました。Ctrl+C(⌘+C)でコピーしてください。';});else{ta.select();}}
  else if(id==='imOpen'){ioMode='import';ioText='';ioMsg='';render();}
  else if(id==='imGo'){const t=$('#imText').value.trim();if(!t){ioMsg='読み込むテキストがありません。';render();return;}
    if(pendingDel!=='import'){ioText=t;armDelete('import');return;}importFrom(t);}
  else if(id==='wipe'){if(pendingDel!=='*'){armDelete('*');return;}store.history=[];store.stats={};persist();pendingDel=null;toast('記録を消去しました。');}
});
$('#panel').addEventListener('change',e=>{
  if(e.target.id!=='imFile'||!e.target.files||!e.target.files[0])return;
  const fr=new FileReader();fr.onload=()=>{ioText=String(fr.result||'');ioMsg='ファイルを読み込みました。内容を確かめてから「読み込んで置き換える」を押してください。';render();};fr.readAsText(e.target.files[0]);
});
$('#panel').addEventListener('input',e=>{if(e.target.id==='imText')ioText=e.target.value;});
$('#drillList').addEventListener('click',e=>{const b=e.target.closest('[data-drill]');if(!b)return;drill.streak=0;newDrill(b.dataset.drill);});
$('#drPlay').addEventListener('click',playSnippet);
$('#histView').addEventListener('click',e=>{
  const o=e.target.closest('[data-hopen]'),d=e.target.closest('[data-hdel]');
  if(o){const id=o.dataset.hopen;
    if(openConflict(id)&&pendingDel!=='open:'+id){armDelete('open:'+id);toast('同じ類・定旋律・位置の書きかけの解答があります。開くと置き換わります。もう一度押すと開きます。');return;}
    pendingDel=null;openHistory(id);}
  if(d){const id=d.dataset.hdel;if(pendingDel!==id){armDelete(id);return;}store.history=store.history.filter(x=>x.id!==id);pendingDel=null;persist();toast('削除しました。');}
});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{
  const v=b.dataset.view;if(v===state.view)return;
  // Leaving the practice screen ends a fill-in or guided task, so ask once instead of dropping the work silently.
  if(!fillGuard('view:'+v))return;
  if(state.playing)stopPlayback();closeDrawer();
  if(v==='review'){startReview();return;}
  leaveReview();state.view=v;ioMode=null;ioMsg='';render();
  if(v==='drill'&&!drill.q&&!drill.loading)newDrill();}));
$('#lnSp').addEventListener('click',e=>{const b=e.target.closest('[data-lsp]');if(!b)return;learn.sp=+b.dataset.lsp;render();});
$('#lnSec').addEventListener('click',e=>{const b=e.target.closest('[data-lsec]');if(!b)return;learn.sec=b.dataset.lsec;render();});
$('#lnBody').addEventListener('click',e=>{
  const pl=e.target.closest('[data-lplay]');if(pl){const it=learnSvgs[+pl.dataset.lplay];if(it)playScore(it.sc,it.sc.vals,false);return;}
  const fx=e.target.closest('[data-lfix]');if(fx){const k=learn.sp+':'+fx.dataset.lfix;learn.fixed[k]=!learn.fixed[k];stopAll();render();return;}
  const nt=e.target.closest('[data-lnote]');if(nt){const [k,j]=nt.dataset.lnote.split(':').map(Number),it=learnSvgs[k];if(!it)return;
    const i=GLs.slotAt(it.b,it.notes[j].at),svg=document.querySelector(`#lnBody svg[data-k="${k}"]`);
    if(i>=0&&svg){drawSnippet(svg,{...it.sc,marks:[i]},true);scrollToMark(svg);const S=it.sc.slots,m=S[i].m;
      playScore({...it.sc,cf:it.sc.cf.slice(m,m+2),slots:S.filter(s=>s.m>=m&&s.m<=m+1).map(s=>({...s,m:s.m-m,tiedFrom:null,tieTo:null})),vals:[]},
        S.map((s,x)=>x).filter(x=>S[x].m>=m&&S[x].m<=m+1).map(x=>it.sc.vals[x]),false);}
    return;}
  if(e.target.id==='lnGuided')startGuided(learn.sp);
});
document.querySelectorAll('[data-drawer]').forEach(b=>b.addEventListener('click',()=>{if(drawer===b.dataset.drawer)closeDrawer();else openDrawer(b.dataset.drawer);}));
$('#drawerClose').addEventListener('click',closeDrawer);
$('#drawerBack').addEventListener('click',closeDrawer);
$('#rulesBody').addEventListener('change',e=>{const t=e.target;
  if(t.id==='lvPreset'&&PRESETS[t.value]){setLevels(PRESETS[t.value].levels);toast(`判定の基準を「${PRESETS[t.value].name}」にしました。`);}
  else if(t.dataset.lv)setLevels({...state.levels,[t.dataset.lv]:t.value});});
$('#mbar').addEventListener('click',()=>{$('#panel').scrollIntoView({behavior:'smooth',block:'start'});});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&drawer){closeDrawer();return;}
  if(state.view==='drill'&&!drawer){
    const tg=(document.activeElement&&document.activeElement.tagName)||'';if(['SELECT','INPUT','TEXTAREA'].includes(tg))return;
    if(/^[1-4]$/.test(e.key)){e.preventDefault();answerDrill(+e.key-1);}
    else if(e.key==='Enter'&&drill.answered!=null){e.preventDefault();newDrill();}
    else if(e.key===' '||e.key==='p'){e.preventDefault();playSnippet();}
    return;}
  if(state.view==='history'||state.view==='learn'||drawer)return;
  const tag=(document.activeElement&&document.activeElement.tagName)||'';
  if(['SELECT','INPUT','TEXTAREA'].includes(tag))return;
  if(e.metaKey||e.ctrlKey){const k=e.key.toLowerCase();
    if(k==='z'&&e.shiftKey){e.preventDefault();redo();}else if(k==='z'){e.preventDefault();undo();}else if(k==='y'){e.preventDefault();redo();}
    return;}
  if(tag==='BUTTON'&&(e.key===' '||e.key==='Enter'))return;
  switch(e.key){
    case'ArrowLeft':selStep(-1);break;case'ArrowRight':selStep(1);break;
    case'ArrowUp':ensureAudio();moveNote(1);break;case'ArrowDown':ensureAudio();moveNote(-1);break;
    case'#':case's':setAcc(1);break;case'b':setAcc(-1);break;case'n':setAcc(0);break;
    case'Backspace':case'Delete':setNote(state.sel,null,false);break;
    case' ':playAll();break;case'Enter':ensureAudio();playSlot(state.sel);break;
    default:return;}
  e.preventDefault();
});
const spSeg=$('#spSeg');[1,2,3,4,5].forEach(k=>{const b=document.createElement('button');b.type='button';b.dataset.sp=k;
  b.innerHTML=`<b>${k}</b><small>${SPECIES[k].ratio}</small>`;b.setAttribute('aria-label',`${SPECIES[k].name}(${SPECIES[k].ratio})`);spSeg.appendChild(b);});
spSeg.addEventListener('click',e=>{const b=e.target.closest('[data-sp]');if(!b||+b.dataset.sp===state.sp)return;if(!fillGuard('sp'))return;if(state.playing)stopPlayback();saveDraft();state.sp=+b.dataset.sp;loadDraft();saveDraft();render();});
sel.addEventListener('change',()=>{cfMsg='';switchCF(sel.value);});
$('#quickGen').addEventListener('click',()=>{if(!fillGuard('gen'))return;cfMsg='';generateNew();});
// The drawer's buttons also switch the cantus firmus, so they need the same guard as the task bar while a fill-in is open.
$('#genBtn').addEventListener('click',()=>{if(!fillGuard('gen'))return;cfMsg='';generateNew();});
$('#cfAdd').addEventListener('click',()=>{if(!fillGuard('add'))return;addCustom();});
$('#cfText').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(!fillGuard('add'))return;addCustom();}});
$('#paneCf').addEventListener('click',e=>{if(e.target.id!=='cfDel')return;const id=state.mode;
  if(!fillGuard('del'))return;
  if(pendingDel!=='cf:'+id){armDelete('cf:'+id);return;}
  pendingDel=null;removeCF(id);cfMsg='';state.mode='dorian';loadDraft();saveDraft();refreshCfSelect();render();toast('定旋律を削除しました(保存した解答の記録は残ります)。');});
function setPos(ab){if(state.above===ab)return;if(!fillGuard('pos'))return;if(state.playing)stopPlayback();saveDraft();state.above=ab;loadDraft();saveDraft();render();}
$('#posAbove').addEventListener('click',()=>setPos(true));$('#posBelow').addEventListener('click',()=>setPos(false));
$('#playBtn').addEventListener('click',()=>playAll());
$('#tempo').addEventListener('input',e=>{$('#tempoVal').textContent='♩ = '+e.target.value;});
$('#tempo').addEventListener('change',()=>{if(state.view!=='review')savePrefs();});
$('#undoBtn').addEventListener('click',undo);
$('#redoBtn').addEventListener('click',redo);
$('#clearBtn').addEventListener('click',()=>{if(!fillGuard('clear'))return;if(!Object.keys(state.cp).length)return;const sn=snapshot();sn.cp={};state.sel=0;commit(sn);toast('対旋律を消去しました。「元に戻す」で戻せます。');});
$('#hintChk').addEventListener('change',e=>{state.hints=e.target.checked;savePrefs();render();});
$('#fbSel').addEventListener('change',e=>{state.fb=e.target.value;state.checkedSig=null;savePrefs();render();});
$('#ivSel').addEventListener('change',e=>{state.ivMode=e.target.value;savePrefs();render();});
$('#cmpBtn').addEventListener('click',()=>{if(!fillGuard('cmp'))return;if(state.compare){state.compare=null;render();}else requestCompare();});
$('#fillBtn').addEventListener('click',()=>{if(state.fill){toast('穴埋め課題の途中です。右の「やめる」で終われます。');return;}startFill();});

/* ================= boot ================= */
loadStore();
const pf=store.prefs||{};
if(SPECIES[pf.sp])state.sp=pf.sp;if(cfEntry(pf.mode))state.mode=pf.mode;state.above=pf.above!==false;
state.hints=pf.hint===true;state.zoom=ZOOMS.includes(pf.zoom)?pf.zoom:1;$('#zoomSel').value=String(state.zoom);state.levels=cleanLevels(pf.levels);state.fb=pf.fb==='check'?'check':'live';state.ivMode=['raw','simple','quality'].includes(pf.ivMode)?pf.ivMode:'raw';
if(pf.tempo){$('#tempo').value=pf.tempo;$('#tempoVal').textContent='♩ = '+pf.tempo;}
if(navigator.requestMIDIAccess){
  $('#midiBtn').hidden=false;
  $('#midiBtn').addEventListener('click',()=>{if(midiOn)midiDisable();else midiEnable(false);});
  if(pf.midi)midiEnable(true);
}
initWorker();
if(window.GScore)GScore.waitFonts(()=>{GScore.clearCache();render();});
const rethemed=()=>{if(window.GScore)GScore.clearCache();render();};
try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',rethemed);}catch(e){}
new MutationObserver(rethemed).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
refreshCfSelect();
loadDraft();
clefFit=measureClefs();render();
const refit=()=>{clefFit=measureClefs();render();};
if(document.fonts){document.fonts.load('100px "Noto Music"','\u{1D11E}\u{1D122}').then(refit,()=>{});document.fonts.ready.then(refit);}
})();
