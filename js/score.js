/* Gradus 対位法ドリル — score.js
 * 楽譜の浄書を VexFlow 5 に任せる部分。音符・臨時記号・休符・タイ・音部記号は VexFlow が置き、
 * 選択枠・色分け・音程の行などの重ね表示は app.js が、ここで返す座標(geo)から描く。
 * 声部ごとに1段(上の段=上声、下の段=下声)。音部記号は声域から選ぶ(加線が少ないほう)。
 */
(function(root){
'use strict';
const VF=()=>root.VexFlow;
let fontOk=false,failed=false,onReady=null;
const LET='cdefgab';

/* ---- 音部記号の選択 ---- */
const CLEF={treble:{top:38,bot:30},bass:{top:26,bot:18}};
function ledgers(ss,clef){const c=CLEF[clef];let n=0;for(const s of ss){if(s>c.top+1)n+=Math.floor((s-c.top)/2);if(s<c.bot-1)n+=Math.floor((c.bot-s)/2);}return n;}
function pickClef(ss,pref){const t=ledgers(ss,'treble'),b=ledgers(ss,'bass');return t<b?'treble':b<t?'bass':pref;}

const DUR={4:'w',2:'h',1:'q',0.5:'8'};
const keyOf=s=>`${LET[s%7]}/${Math.floor(s/7)}`;
const ACC={1:'#',[-1]:'b',0:'n'};

/* ---- 1回の浄書 ----
 * model: {cf:[{s,a}], slots:[{m,b,dur,rest,optRest,tiedFrom,tieTo}], vals:[{s,a}|null], above, MW, col:{ink,staff,cp,faint}}
 * 返り値 geo: {inner, W, H, slotX, slotL, slotR, cfX, measX, measW, noteStart, up, lo, cpStaff, cfStaff, top, bottom}
 */
let host=null;const cache=new Map();
function engrave(model){
  const key=JSON.stringify(model);
  const hit=cache.get(key);if(hit){cache.delete(key);cache.set(key,hit);return hit;}
  const geo=engraveNow(model);
  cache.set(key,geo);if(cache.size>40)cache.delete(cache.keys().next().value);
  return geo;
}
function engraveNow(md){
  const V=VF(),{cf,slots,vals,above,MW,col}=md,n=cf.length;
  // 声部ごとの音部記号(対旋律はまだ書かれていなくても変わらないよう、定旋律から予想した声域で決める)
  const cfSS=cf.map(x=>x.s),cpSS=cf.map(x=>x.s+(above?5:-5));
  const cfClef=pickClef(cfSS,above?'bass':'treble'),cpClef=pickClef(cpSS,above?'treble':'bass');
  const upClef=above?cpClef:cfClef,loClef=above?cfClef:cpClef;
  // 段の縦位置: 上の段の上と、2段の間に加線の音が入る余白をとる
  const upSS=above?vals.filter(Boolean).map(v=>v.s).concat(cpSS):cfSS, loSS=above?cfSS:vals.filter(Boolean).map(v=>v.s).concat(cpSS);
  const upHi=Math.max(...upSS)-CLEF[upClef].top, upLo=CLEF[upClef].bot-Math.min(...upSS), loHi=Math.max(...loSS)-CLEF[loClef].top, loLo=CLEF[loClef].bot-Math.min(...loSS);
  const SP=10,STEP=SP/2;
  const upTop=26+Math.max(0,upHi)*STEP+10;                       // 上の段の第5線
  const gap=Math.max(56,36+Math.max(0,upLo)*STEP+Math.max(0,loHi)*STEP);  // 2段の間: 譜表の間隔5.6つ分(VexFlow の標準ではなくこのアプリの値。最高音の印を下の段の上に置く余白を含む)。加線の音が入るときは広げる
  const loTop=upTop+4*SP+gap;                                     // 下の段の第5線
  const bottom=loTop+4*SP+Math.max(0,loLo)*STEP+14;
  // 横幅: 音部記号の分を最初の小節に足す。どの小節も音符の入る幅は同じ(MW)
  const probe=c=>new V.Stave(0,0,400).addClef(c).getNoteStartX();
  const clefW=Math.max(probe(upClef),probe(loClef))+10;
  const W=Math.ceil(clefW+n*MW+16);
  const H=Math.ceil(bottom+70);
  if(!host){host=document.createElement('div');host.setAttribute('aria-hidden','true');host.style.cssText='position:absolute;left:-10000px;top:0;visibility:hidden';document.body.appendChild(host);}
  host.innerHTML='';
  const R=new V.Renderer(host,V.Renderer.Backends.SVG);R.resize(W,H);const ctx=R.getContext();
  ctx.setFillStyle(col.ink);ctx.setStrokeStyle(col.ink);
  const st0=new V.Stave(0,0,100),boxOff=st0.getYForLine(0); // Stave の y は第5線より上の余白を含む
  const cpUp=above;
  const slotX=new Array(slots.length).fill(0),slotL=[],slotR=[],cfX=[],measX=[],measW=[],noteStart=[];
  const cpNotes=new Array(slots.length).fill(null);
  let firstUp=null,firstLo=null,lastUp=null,lastLo=null;
  for(let m=0;m<n;m++){
    const x=m===0?0:clefW+m*MW,w=m===0?clefW+MW:MW;
    const su=new V.Stave(x,upTop-boxOff,w),sl=new V.Stave(x,loTop-boxOff,w);
    for(const st of [su,sl])st.setStyle({strokeStyle:col.staff,fillStyle:col.staff});
    if(m===0){su.addClef(upClef);sl.addClef(loClef);}
    su.setNoteStartX(x+(m===0?clefW:0)+10);sl.setNoteStartX(x+(m===0?clefW:0)+10);
    if(m>0){su.setBegBarType(V.BarlineType.NONE);sl.setBegBarType(V.BarlineType.NONE);}
    if(m===n-1){su.setEndBarType(V.BarlineType.END);sl.setEndBarType(V.BarlineType.END);}
    su.setContext(ctx).draw();sl.setContext(ctx).draw();
    if(m===0){firstUp=su;firstLo=sl;}
    lastUp=su;lastLo=sl;
    measX.push(m===0?clefW:x);measW.push(MW);noteStart.push(su.getNoteStartX());
    // 定旋律: 全音符1つ
    const cfStave=cpUp?sl:su,cfClefNow=cpUp?loClef:upClef;
    const c=cf[m],cfn=new V.StaveNote({keys:[keyOf(c.s)],duration:'w',clef:cfClefNow});
    if(c.a)cfn.addModifier(new V.Accidental(ACC[c.a]),0);
    cfn.setStyle({fillStyle:col.ink,strokeStyle:col.ink});cfn.setLedgerLineStyle({strokeStyle:col.ink,lineWidth:1.5});  // 加線は既定が黒で、ダークテーマの背景に溶けるので色を指定する
    const cfVoice=new V.Voice({numBeats:4,beatValue:4}).setMode(V.Voice.Mode.SOFT);cfVoice.addTickables([cfn]);
    // 対旋律: この小節のスロット
    const cpStave=cpUp?su:sl,cpClefNow=cpUp?upClef:loClef;
    const idx=slots.map((s,i)=>i).filter(i=>slots[i].m===m);
    const seen={};const tk=[];
    idx.forEach(i=>{
      const s=slots[i],d=DUR[s.dur]||'q';let t;
      if(s.rest||(!vals[i]&&s.optRest)){
        t=new V.StaveNote({keys:[cpClefNow==='bass'?'d/3':'b/4'],duration:d+'r',clef:cpClefNow});
        t.setStyle({fillStyle:s.rest?col.cp:col.faint,strokeStyle:s.rest?col.cp:col.faint});
      }else if(!vals[i]){t=new V.GhostNote({duration:d});}
      else{
        const v=vals[i];t=new V.StaveNote({keys:[keyOf(v.s)],duration:d,clef:cpClefNow,autoStem:true});
        // 臨時記号: 同じ小節で直前と変わるときだけ付ける。タイで続く音には付けない
        const k=v.s,prev=seen[k]==null?0:seen[k];
        if(s.tiedFrom==null&&v.a!==prev)t.addModifier(new V.Accidental(ACC[v.a]),0);
        seen[k]=v.a;
        t.setStyle({fillStyle:col.cp,strokeStyle:col.cp});t.setLedgerLineStyle({strokeStyle:col.cp,lineWidth:1.5});
        cpNotes[i]=t;
      }
      tk.push([i,t]);
    });
    const cpVoice=new V.Voice({numBeats:4,beatValue:4}).setMode(V.Voice.Mode.SOFT);cpVoice.addTickables(tk.map(x=>x[1]));
    // Beam each pair of eighth notes (both must be real notes; a ghost note cannot carry a beam).
    const beams=[];
    for(let k=0;k+1<tk.length;k++){const [i,a]=tk[k],[j,b]=tk[k+1];
      if(slots[i].dur===0.5&&slots[j].dur===0.5&&cpNotes[i]&&cpNotes[j]){const bm=new V.Beam([a,b]);bm.setStyle({fillStyle:col.cp,strokeStyle:col.cp});beams.push(bm);k++;}}
    const fmt=new V.Formatter();fmt.joinVoices([cfVoice]);fmt.joinVoices([cpVoice]);
    fmt.format([cfVoice,cpVoice],x+w-su.getNoteStartX()-12);
    cfVoice.draw(ctx,cfStave);cpVoice.draw(ctx,cpStave);
    if(beams.length){ctx.setFillStyle(col.cp);ctx.setStrokeStyle(col.cp);beams.forEach(bm=>bm.setContext(ctx).draw());ctx.setFillStyle(col.ink);ctx.setStrokeStyle(col.ink);}
    cfX[m]=(cfn.getNoteHeadBeginX()+cfn.getNoteHeadEndX())/2;
    tk.forEach(([i,t])=>{slotX[i]=t.getNoteHeadBeginX?((t.getNoteHeadBeginX()+t.getNoteHeadEndX())/2):(t.getAbsoluteX()+6);
      if(!isFinite(slotX[i]))slotX[i]=t.getAbsoluteX()+6;});
    // 枠の左右: 小節線と、隣の音との中点
    const L0=m===0?su.getNoteStartX()-8:x,R0=x+w;
    idx.forEach((i,k)=>{slotL[i]=k===0?L0:(slotX[idx[k-1]]+slotX[i])/2;slotR[i]=k===idx.length-1?R0:(slotX[i]+slotX[idx[k+1]])/2;});
  }
  // タイ(対旋律の色で)
  ctx.setFillStyle(col.cp);ctx.setStrokeStyle(col.cp);
  slots.forEach((s,i)=>{if(s.tieTo==null)return;const a=cpNotes[i],b=cpNotes[s.tieTo];if(!a||!b)return;
    const tie=new V.StaveTie({firstNote:a,lastNote:b,firstIndexes:[0],lastIndexes:[0]});tie.setStyle&&tie.setStyle({fillStyle:col.cp,strokeStyle:col.cp});tie.setContext(ctx).draw();});
  // 2段をつなぐ線(始まりと終わり)
  ctx.setFillStyle(col.staff);ctx.setStrokeStyle(col.staff);
  const c1=new V.StaveConnector(firstUp,firstLo).setType(V.StaveConnector.type.SINGLE_LEFT);c1.setStyle&&c1.setStyle({strokeStyle:col.staff,fillStyle:col.staff});c1.setContext(ctx).draw();
  const c2=new V.StaveConnector(lastUp,lastLo).setType(V.StaveConnector.type.BOLD_DOUBLE_RIGHT);c2.setStyle&&c2.setStyle({strokeStyle:col.staff,fillStyle:col.staff});c2.setContext(ctx).draw();
  const inner=host.querySelector('svg').innerHTML;
  const up={topY:upTop,topS:CLEF[upClef].top,clef:upClef},lo={topY:loTop,topS:CLEF[loClef].top,clef:loClef};
  return {inner,W,H,slotX,slotL,slotR,cfX,measX,measW,noteStart,up,lo,step:STEP,
    cpStaff:above?'up':'lo',cfStaff:above?'lo':'up',top:upTop-4,bottom:loTop+4*SP+4,rowY:bottom+18};
}

/* ---- 準備(フォントの読み込み待ち) ---- */
function ready(){return !!VF()&&fontOk;}
function waitFonts(cb){
  onReady=cb;
  if(!VF()){failed=true;return;}
  let n=0;const tick=()=>{
    let ok=false;try{ok=document.fonts.check('30px Bravura');}catch(e){ok=true;}
    if(ok){fontOk=true;cache.clear();if(onReady)onReady();return;}
    if(++n<80)setTimeout(tick,100);else{failed=true;if(onReady)onReady();}
  };tick();
}
function clearCache(){cache.clear();}
root.GScore={engrave,ready,waitFonts,clearCache,failed:()=>failed};
})(typeof self!=='undefined'?self:globalThis);
