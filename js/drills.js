/* Gradus 対位法ドリル — drills.js
 * 小ドリルの出題部(純粋な計算。DOM に触れない)。GD.make(id) が1問を返す。
 * 判定の線引きは engine.js(GE)をそのまま真とし、ここで規則を二重に書かない。
 *
 * 問題の形:
 *   {id, prompt, score:{sp, above, cf, slots, vals, marks:[slot], hide:[slot], pre:{slot:note}},
 *    play:'dyad'|'all'|null, hideScore:bool, choices:[{label, ok}], explain}
 *   score.slots は {m,b,dur,rest,optRest,tiedFrom,tieTo,tieNext} の並び(抜粋した小節を0から数え直したもの)。
 *   hide のスロットは答える前は空欄、pre のスロットは答える前だけ別の音で見せる。
 */
(function(root){
'use strict';
const G=root.GE||(typeof require!=='undefined'?require('./engine.js'):null);
const {N,interval,ivName,vInfo,motion,nameOf,FUX,FUX_NOTES,MODES,buildSlots,valsOf,skey,analyze,solveFor,pickOne,LETTERS,QN}=G;

const rnd=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const cpy=n=>n?{s:n.s,a:n.a}:null;
const ivLabel=v=>QN[v.q]+(v.d+1)+'度';
// Accidentals that occur in strict modal counterpoint: F♯ C♯ G♯ (leading tones) and B♭ E♭.
function okSpell(n){const L=LETTERS[n.s%7];return n.a===0||(n.a===1&&'FCG'.includes(L))||(n.a===-1&&'BE'.includes(L));}

function choicesOf(correct,others){
  const seen=new Set([correct]),list=[{label:correct,ok:true}];
  for(const o of others){if(list.length>=4)break;if(!o||seen.has(o))continue;seen.add(o);list.push({label:o,ok:false});}
  return list.length===4?shuffle(list):null;
}

/* 抜粋: 小節 m0〜m1 を0から数え直す */
function excerpt(sp,cf,above,S,vals,m0,m1){
  const idx=[];S.forEach((s,i)=>{if(s.m>=m0&&s.m<=m1)idx.push(i);});
  const map={};idx.forEach((i,k)=>{map[i]=k;});
  const slots=idx.map((i,k)=>{const s=S[i];
    const tf=s.tiedFrom!=null&&map[s.tiedFrom]!=null?map[s.tiedFrom]:null,tt=s.tieTo!=null&&map[s.tieTo]!=null?map[s.tieTo]:null;
    return {i:k,m:s.m-m0,b:s.b,dur:s.dur,rest:!!s.rest,optRest:false,tiedFrom:tf,tieTo:tt,tieNext:tt!=null};});
  return {sc:{sp,above,cf:cf.slice(m0,m1+1).map(cpy),slots,vals:idx.map(i=>cpy(vals[i])),marks:[],hide:[],pre:{}},map};
}
function plainSlots(sp,n,rhythm,ties){return buildSlots(sp,n,rhythm||[],ties||[]).map(s=>({i:s.i,m:s.m,b:s.b,dur:s.dur,rest:!!s.rest,optRest:false,tiedFrom:s.tiedFrom,tieTo:s.tieTo,tieNext:!!s.tieNext}));}
function analyzeScore(sc){return analyze({sp:sc.sp,cf:sc.cf,above:sc.above,slots:sc.slots,vals:sc.vals,rhythm:[],ties:[]});}
function fuxCase(){const k=pickOne(FUX.map(x=>x[0]));return {mode:k,cf:FUX_NOTES[k],above:Math.random()<0.6};}
function fullSolve(sp,cf,above,ms){
  const sol=solveFor(sp,cf,above,[],[],ms||1500);if(!sol)return null;
  const S=buildSlots(sp,cf.length,[],[]);return {S,vals:valsOf(S,sol)};
}

/* ---- 2b/2c 音程当て ---- */
function intervalExplain(lo,hi,v){
  const semi=G.midi(hi)-G.midi(lo);
  let names='';
  if(v.d<=7){const a=[];for(let s=lo.s;s<=hi.s;s++)a.push(LETTERS[s%7]);names=`(${a.join('-')})`;}
  return `${nameOf(lo)} から ${nameOf(hi)} まで、音名で数えて${v.d+1}度${names}。半音で${semi}個分の幅なので、${ivLabel(v)}です。`;
}
function ivDistractors(lo,hi,v){
  const out=[];
  const perfectClass=v.dn===0||v.dn===3||v.dn===4;
  const qs=perfectClass?['P','A','d']:['M','m','A','d'];
  for(const q of shuffle(qs.slice()))if(q!==v.q&&!(v.d===0&&q==='d'))out.push(QN[q]+(v.d+1)+'度');
  for(const dd of shuffle([-1,1])){const d=v.d+dd;if(d<0)continue;const dn=d%7,pc=dn===0||dn===3||dn===4;
    out.push(QN[pc?'P':pickOne(['M','m'])]+(d+1)+'度');}
  return shuffle(out);
}
function makeIvEye(){
  for(let t=0;t<200;t++){
    const lo={s:rnd(25,32),a:0};if(Math.random()<0.15){lo.a=pickOne([1,-1]);if(!okSpell(lo))lo.a=0;}
    const hi={s:lo.s+rnd(0,11),a:0};if(Math.random()<0.35){hi.a=pickOne([1,-1]);if(!okSpell(hi))hi.a=0;}
    const v=interval(lo,hi);if(v.d===0&&v.q!=='P')continue;
    const ch=choicesOf(ivLabel(v),ivDistractors(lo,hi,v));if(!ch)continue;
    return {id:'iv-eye',prompt:'この2つの音の音程は?',score:{sp:1,above:true,cf:[lo],slots:plainSlots(1,1),vals:[hi],marks:[],hide:[],pre:{}},
      play:'dyad',hideScore:false,choices:ch,explain:intervalExplain(lo,hi,v)};
  }
  return null;
}
const EAR_TARGETS=[['m',1],['M',1],['m',2],['M',2],['A',3],['d',4],['P',4],['m',5],['M',5],['m',6],['M',6],['P',7],['m',9],['M',9]];
function makeIvEar(){
  for(let t=0;t<200;t++){
    const [q,d]=pickOne(EAR_TARGETS),lo={s:rnd(25,31),a:0};
    let hi=null;for(const a of [0,1,-1]){const h={s:lo.s+d,a};if(!okSpell(h))continue;const v=interval(lo,h);if(v.q===q&&v.d===d){hi=h;break;}}
    if(!hi)continue;
    const v=interval(lo,hi),ch=choicesOf(ivLabel(v),ivDistractors(lo,hi,v));if(!ch)continue;
    return {id:'iv-ear',prompt:'聴こえた2つの音の音程は?(▶ で何度でも聴けます)',score:{sp:1,above:true,cf:[lo],slots:plainSlots(1,1),vals:[hi],marks:[],hide:[],pre:{}},
      play:'dyad',hideScore:true,choices:ch,explain:intervalExplain(lo,hi,v)+(v.cons?'':' この音程は不協和です。')};
  }
  return null;
}

/* ---- 2d 進行の種類 ---- */
const MOTION_LABEL={contrary:'反行',oblique:'斜行',similar:'並行',parallel:'平行'};
const CONS_OFFSETS=[2,4,5,7,9];
function makeMotion(){
  const target=pickOne(['contrary','oblique','similar','parallel']);
  for(let t=0;t<400;t++){
    const cf0={s:rnd(27,32),a:0},cf1={s:cf0.s+pickOne([-2,-1,0,1,2]),a:0};
    const cp0={s:cf0.s+pickOne(CONS_OFFSETS),a:0},cp1={s:cf1.s+pickOne(CONS_OFFSETS),a:0};
    const a=vInfo(cf0,cp0,true),b=vInfo(cf1,cp1,true);if(!a.cons||!b.cons)continue;
    const m=motion(cf0,cf1,cp0,cp1);if(m==='none')continue;
    const kind=m==='similar'&&a.dn===b.dn?'parallel':m;if(kind!==target)continue;
    let ex='反行は2声部が反対の方向へ、斜行は一方が止まり他方が動く、並行は同じ方向へ違う音程で、平行は同じ方向へ同じ種類の音程のまま動くことです。';
    if(kind==='parallel'&&b.perfect)ex+=` ここは${b.dn===4?'5度':'8度'}が続く平行${b.dn===4?'5度':'8度'}で、禁じられた進行です。`;
    else ex+=` ここは ${ivName(a)} → ${ivName(b)} で、${MOTION_LABEL[kind]}です。`;
    return {id:'motion',prompt:'2つの声部の動きは?',score:{sp:1,above:true,cf:[cf0,cf1],slots:plainSlots(1,2),vals:[cp0,cp1],marks:[],hide:[],pre:{}},
      play:'all',hideScore:false,choices:['反行','斜行','並行','平行'].map(l=>({label:l,ok:l===MOTION_LABEL[kind]})),explain:ex};
  }
  return null;
}

/* ---- 2e 不協和の種類分け ---- */
const DIS_LABEL={'経':'経過音','刺':'刺繍音','カ':'カンビアータ'};
const DIS_EXPLAIN={
  '経':'経過音: 前の音から順次進行で入り、同じ方向へ順次進行で抜ける不協和です。',
  '刺':'刺繍音: 隣の音へ順次進行で行き、元の音へ戻る不協和です(第3類・第5類の4分音符)。',
  'カ':'カンビアータ: 2度下行した不協和から3度下へ跳び、2度上がって戻る型です(第3類)。'
};
function makeDisKind(){
  // Decide the answer first so the four answers come up about equally often.
  const want=pickOne(['経','刺','カ','err']);
  for(let t=0;t<14;t++){
    const sp=want==='カ'?3:pickOne([2,3,3]),{cf,above}=fuxCase(),fs=fullSolve(sp,cf,above,1500);if(!fs)continue;
    const {S,vals}=fs,n=cf.length,ctx=v=>({sp,cf,above,slots:S,vals:v,rhythm:[],ties:[]});
    let target=null,label=null,ex='',v2=null;
    if(want==='経'||want==='刺'){
      const r=analyze(ctx(vals)),c=r.dis.map((k,i)=>k===want&&S[i].m<n-2?i:-1).filter(i=>i>=0);
      if(!c.length)continue;
      target=pickOne(c);v2=vals.map(cpy);label=DIS_LABEL[want];ex=DIS_EXPLAIN[want];
    }else if(want==='カ'){
      // Write a cambiata into one bar: beat1 x (consonant), beat2 x-1 (dissonant), beat3 x-3, beat4 x-2, then step on.
      for(const m of shuffle([...Array(n-3).keys()].map(k=>k+1))){
        const i0=S.findIndex(s=>s.m===m&&s.b===0);
        for(const x of shuffle([0,1,-1,2,-2].map(d=>vals[i0].s+d))){
          const test=vals.map(cpy);[x,x-1,x-3,x-2].forEach((st,k)=>{test[i0+k]={s:st,a:0};});
          if(vInfo(cf[m],test[i0+1],above).cons)continue;
          const r=analyze(ctx(test));
          if(r.dis[i0+1]!=='カ')continue;
          if(r.issues.some(q=>q.lv==='err'&&q.cols.some(c=>S[c].m>=m-1&&S[c].m<=m+1)))continue;
          target=i0+1;v2=test;break;
        }
        if(target!=null)break;
      }
      if(target==null)continue;
      label=DIS_LABEL['カ'];ex=DIS_EXPLAIN['カ'];
    }else{
      const weak=S.map((s,i)=>i).filter(i=>S[i].b>0&&S[i].m>0&&S[i].m<n-2);
      for(const i of shuffle(weak)){
        for(const dd of shuffle([-2,2,-3,3])){
          const cand={s:vals[i].s+dd,a:0},test=vals.map(cpy);test[i]=cand;
          if(vInfo(cf[S[i].m],cand,above).cons)continue;
          const hit=analyze(ctx(test)).issues.find(x=>x.id==='weakdis'&&x.cols.includes(i));
          if(hit){target=i;v2=test;label='誤り(どれでもない)';ex=hit.x;break;}
        }
        if(target!=null)break;
      }
      if(target==null)continue;
    }
    const m=S[target].m,{sc,map}=excerpt(sp,cf,above,S,v2,m,Math.min(n-1,m+1));
    sc.marks=[map[target]];
    const v=vInfo(cf[m],v2[target],above);
    return {id:'dis-kind',prompt:`枠で囲んだ音(${nameOf(v2[target])}、定旋律と${ivName(v)})の種類は?`,score:sc,play:'all',hideScore:false,
      choices:['経過音','刺繍音','カンビアータ','誤り(どれでもない)'].map(l=>({label:l,ok:l===label})),explain:ex};
  }
  return null;
}

/* ---- 2f 平行5度を耳で探す ---- */
function makeParEar(){
  const none=Math.random()<0.25;
  for(let t=0;t<40;t++){
    const {cf,above}=fuxCase(),fs=fullSolve(1,cf,above,1200);if(!fs)continue;
    const n=cf.length,m0=rnd(0,n-4),{sc}=excerpt(1,cf,above,fs.S,fs.vals,m0,m0+3);
    sc.slots=plainSlots(1,4);
    const pars=r=>r.issues.filter(x=>x.id==='parallel');
    if(none){if(pars(analyzeScore(sc)).length)continue;
      return {id:'par-ear',prompt:'4小節を聴いて、平行5度・平行8度があるのはどこ?',score:sc,play:'all',hideScore:true,
        choices:['1→2小節','2→3小節','3→4小節','ない'].map((l,i)=>({label:l,ok:i===3})),explain:'この4小節に平行5度・平行8度はありません。'};}
    const want=rnd(1,3);
    for(const k of [want]){
      const a=vInfo(sc.cf[k-1],sc.vals[k-1],above);if(!a.perfect||a.d===0)continue;
      if(sc.cf[k].s===sc.cf[k-1].s)continue;
      const test=sc.vals.map(cpy),off=sc.vals[k-1].s-sc.cf[k-1].s;test[k]={s:sc.cf[k].s+off,a:0};
      const b=vInfo(sc.cf[k],test[k],above);if(!b.perfect||b.dn!==a.dn)continue;
      const tsc={...sc,vals:test},ps=pars(analyzeScore(tsc));
      if(ps.length!==1||ps[0].cols[0]!==k-1)continue;
      const lab=a.dn===4?'5度':'8度';
      return {id:'par-ear',prompt:'4小節を聴いて、平行5度・平行8度があるのはどこ?',score:{...tsc,marks:[k-1,k]},play:'all',hideScore:true,
        choices:['1→2小節','2→3小節','3→4小節','ない'].map((l,i)=>({label:l,ok:i===k-1})),
        explain:`第${k}小節から第${k+1}小節へ、2声部が同じ方向に動いて完全${lab}が続く平行${lab}です。2つの声部がひとつに溶けて聞こえます。`};
    }
  }
  return null;
}

/* ---- 2g 掛留の解決 ---- */
function suspNum(v){let d=v.d+1;if(d>10)d-=7;return d;}
function makeSusp(){
  for(let t=0;t<15;t++){
    const {cf,above}=fuxCase(),fs=fullSolve(4,cf,above,2500);if(!fs)continue;
    const {S,vals}=fs,n=cf.length,r=analyze({sp:4,cf,above,slots:S,vals,rhythm:[],ties:[]});
    const cands=r.dis.map((k,i)=>k==='掛'?i:-1).filter(i=>i>0&&S[i].m<n-1);
    if(!cands.length)continue;
    const i=pickOne(cands),res=i+1,m=S[i].m;if(!vals[res]||S[res].m!==m)continue;
    const vs=vInfo(cf[m],vals[i],above),vr=vInfo(cf[m],vals[res],above);
    const lab=`${suspNum(vs)}-${suspNum(vr)}`;
    const sus=vals[i],ok=vals[res];
    const ch=choicesOf(nameOf(ok),[nameOf({s:sus.s+1,a:0}),nameOf(sus),nameOf({s:sus.s-2,a:0}),nameOf({s:sus.s-3,a:0})]);if(!ch)continue;
    const {sc,map}=excerpt(4,cf,above,S,vals,m-1,m);
    sc.marks=[map[res]];sc.hide=[map[res]];
    return {id:'susp',prompt:`掛留 ${lab} の解決音は?(枠の位置)`,score:sc,play:'all',hideScore:false,choices:ch,
      explain:`タイで持ち越した${ivName(vs)}は不協和なので、2度下行して${ivName(vr)}に解決します。対旋律が上なら 7-6・4-3・9-8、下なら 2-3・4-5・9-10 の形です。`};
  }
  return null;
}

/* ---- 2h 終止の型 ---- */
function makeCadence(){
  for(let t=0;t<15;t++){
    const {mode,cf,above}=fuxCase(),fs=fullSolve(1,cf,above,1200);if(!fs)continue;
    const n=cf.length,pen=fs.vals[n-2],fin=fs.vals[n-1];
    const lab=(p,f)=>`${nameOf(p)} → ${nameOf(f)}`;
    const others=[
      lab({s:pen.s,a:pen.a?0:1},fin),
      lab({s:fin.s+(pen.s>fin.s?2:-2),a:0},fin),
      lab({s:cf[n-2].s+(above?4:-4),a:0},fin),
      lab(fin,fin)
    ];
    const ch=choicesOf(lab(pen,fin),others);if(!ch)continue;
    const {sc}=excerpt(1,cf,above,fs.S,fs.vals,n-2,n-1);
    sc.slots=plainSlots(1,2);sc.hide=[0,1];sc.marks=[0,1];
    const cfDown=cf[n-1].s<cf[n-2].s,want=(above===cfDown)?'6度 → オクターヴ':'3度 → 同度(10度 → オクターヴ)';
    const lead=pen.a===1?`導音を♯で半音上げて(${nameOf(pen)})、終止音へ半音で入ります。`:(mode==='phrygian'?'フリギアでは終止音の上の音が半音なので、♯は付けません。':'ここでは対旋律が上から終止音に入るので、♯は要りません。');
    return {id:'cadence',prompt:`${MODES[mode].name}の定旋律で、対旋律が${above?'上':'下'}のとき、対旋律の最後の2音は?`,score:sc,play:'all',hideScore:false,choices:ch,
      explain:`定旋律が${cfDown?'上から':'下から'}終止音に入るので、終止の直前は${want}の形にし、2声部が反対方向へ順次進行して終わります。${lead}`};
  }
  return null;
}

/* ---- 2i ムジカ・フィクタ ---- */
const FICTA_CHOICES=['♯が必要','♭が必要','そのままでよい','どちらでもよい'];
function makeFicta(){
  const type=Math.random()<0.5?1:(Math.random()<0.5?2:3);
  if(type===1){
    for(let t=0;t<15;t++){
      const {mode,cf,above}=fuxCase(),fs=fullSolve(1,cf,above,1200);if(!fs)continue;
      const n=cf.length,pen=fs.vals[n-2];
      const {sc}=excerpt(1,cf,above,fs.S,fs.vals,n-2,n-1);
      sc.slots=plainSlots(1,2);sc.marks=[0];sc.pre={0:{s:pen.s,a:0}};
      const need=pen.a===1;
      return {id:'ficta',prompt:`${MODES[mode].name}の終止。枠の音(臨時記号なしで ${nameOf({s:pen.s,a:0})})に臨時記号は必要?`,score:sc,play:'all',hideScore:false,
        choices:FICTA_CHOICES.map(l=>({label:l,ok:l===(need?'♯が必要':'そのままでよい')})),
        explain:need?`終止音へ下から入る音は、半音下の導音にします。${MODES[mode].name}ではそのままだと全音なので、♯を付けて ${nameOf(pen)} にします。`
          :(pen.s>fs.vals[n-1].s?'対旋律は上から終止音に入るので、導音の♯は要りません。':`${MODES[mode].name}では、この音はもともと終止音の半音下(または上)にあるので、臨時記号は要りません。`)};
    }
    return null;
  }
  // F–B outline: the line F G A B turns at B, outlining a tritone, so B is sung as B♭.
  const cf=[N('F3'),N('F3')],slots=[{i:0,m:0,b:0,dur:1},{i:1,m:0,b:1,dur:1},{i:2,m:0,b:2,dur:1},{i:3,m:0,b:3,dur:1},{i:4,m:1,b:0,dur:4}]
    .map(s=>({...s,rest:false,optRest:false,tiedFrom:null,tieTo:null,tieNext:false}));
  const vals=[N('F4'),N('G4'),N('A4'),N('Bb4'),N('A4')];
  if(type===2){
    return {id:'ficta',prompt:'枠の音(臨時記号なしで B4)に臨時記号は必要?',score:{sp:3,above:true,cf,slots,vals,marks:[3],hide:[],pre:{3:N('B4')}},play:'all',hideScore:false,
      choices:FICTA_CHOICES.map(l=>({label:l,ok:l==='♭が必要'})),
      explain:'F から上がって B で折り返すと、旋律の輪郭が F–B の三全音(増4度)になります。これを避けるため B を B♭ にします(「ラの上の1音はファで歌う」という昔からの決まり)。'};
  }
  const k=pickOne([1,2]);
  return {id:'ficta',prompt:`枠の音(${nameOf(vals[k])})に臨時記号は必要?`,score:{sp:3,above:true,cf,slots,vals,marks:[k],hide:[],pre:{}},play:'all',hideScore:false,
    choices:FICTA_CHOICES.map(l=>({label:l,ok:l==='そのままでよい'})),
    explain:'変化音を使うのは、終止の導音と、三全音を避けるための B♭ がほとんどです。この音は経過の途中の音で、どちらにも当たらないので、そのままです。'};
}

const DRILLS=[
  {id:'iv-eye',title:'音程(目)',desc:'2つの音の音程を、楽譜を見て答えます。',make:makeIvEye},
  {id:'iv-ear',title:'音程(耳)',desc:'2つの音の音程を、聴いて答えます。',make:makeIvEar},
  {id:'motion',title:'進行の種類',desc:'反行・斜行・並行・平行を見分けます。',make:makeMotion},
  {id:'dis-kind',title:'不協和の種類',desc:'経過音・刺繍音・カンビアータ・誤りを見分けます。',make:makeDisKind},
  {id:'par-ear',title:'平行を聴く',desc:'4小節を聴いて、平行5度・8度の場所を当てます。',make:makeParEar},
  {id:'susp',title:'掛留の解決',desc:'掛留した不協和の解決音を答えます。',make:makeSusp},
  {id:'cadence',title:'終止の型',desc:'旋法ごとの終止の2音を答えます。',make:makeCadence},
  {id:'ficta',title:'ムジカ・フィクタ',desc:'臨時記号が要るかどうかを判断します。',make:makeFicta}
];
function make(id){const d=DRILLS.find(x=>x.id===id);if(!d)return null;
  for(let k=0;k<3;k++){const q=d.make();if(q)return q;}return null;}
const GD={DRILLS:DRILLS.map(({id,title,desc})=>({id,title,desc})),make,excerpt,analyzeScore};
root.GD=GD;
if(typeof module!=='undefined'&&module.exports)module.exports=GD;
})(typeof self!=='undefined'?self:globalThis);
