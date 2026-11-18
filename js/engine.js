/* Gradus 対位法ドリル — engine.js
 * 純粋な計算部。DOM・localStorage・画面の状態に触れない。
 * ブラウザ本体・Web Worker・Node のどこでも動く(globalThis.GE / module.exports)。
 */
(function(root){
'use strict';
const LEFT=78; // 五線の左余白(スロットのx座標計算に使う)

/* ================= music basics ================= */
const LETTERS=['C','D','E','F','G','A','B'];
const PC=[0,2,4,5,7,9,11];
const QN={P:'完全',M:'長',m:'短',A:'増',d:'減'};
function N(name){const m=name.match(/^([A-G])([#b]?)(\d)$/);return {s:(+m[3])*7+LETTERS.indexOf(m[1]),a:m[2]==='#'?1:m[2]==='b'?-1:0};}
const midi=n=>12*(Math.floor(n.s/7)+1)+PC[n.s%7]+n.a;
const nameOf=n=>LETTERS[n.s%7]+(n.a===1?'♯':n.a===-1?'♭':'')+Math.floor(n.s/7);
const cpy=n=>n?{s:n.s,a:n.a}:null;
function interval(lo,hi){
  const d=hi.s-lo.s, semi=midi(hi)-midi(lo), oct=Math.floor(d/7), dn=d%7, ss=semi-12*oct;
  const PB={0:0,3:5,4:7}, MB={1:2,2:4,5:9,6:11};let q;
  if(dn in PB){const f=ss-PB[dn];q=f===0?'P':f>0?'A':'d';}
  else{const f=ss-MB[dn];q=f===0?'M':f===-1?'m':f>0?'A':'d';}
  const perfect=q==='P'&&(dn===0||dn===4);
  const cons=perfect||((q==='M'||q==='m')&&(dn===2||dn===5));
  return {d,dn,q,semi,perfect,cons};
}
const ivName=v=>`${QN[v.q]}${v.d+1}度`;
function vInfo(cfN,cpN,above){
  let lo=above?cfN:cpN, hi=above?cpN:cfN, crossed=false;
  if(hi.s<lo.s){crossed=true;[lo,hi]=[hi,lo];}
  const v=interval(lo,hi);v.crossed=crossed;return v;
}
function motion(a0,a1,b0,b1){
  const da=midi(a1)-midi(a0), db=midi(b1)-midi(b0);
  if(da===0&&db===0)return 'none';
  if(da===0||db===0)return 'oblique';
  return Math.sign(da)!==Math.sign(db)?'contrary':'similar';
}

/* ================= data ================= */
const FUX=[
  ['dorian','D4 F4 E4 D4 G4 F4 A4 G4 F4 E4 D4'],
  ['phrygian','E4 C4 D4 C4 A3 A4 G4 E4 F4 E4'],
  ['lydian','F4 G4 A4 F4 D4 E4 F4 C5 A4 F4 G4 F4'],
  ['mixolydian','G3 C4 B3 G3 C4 E4 D4 G4 E4 C4 D4 B3 A3 G3'],
  ['aeolian','A3 C4 B3 D4 C4 E4 F4 E4 D4 C4 B3 A3'],
  ['ionian','C4 E4 F4 G4 E4 A4 G4 E4 F4 E4 D4 C4']
];
const MODES={dorian:{name:'ドリア',f:'D4'},phrygian:{name:'フリギア',f:'E4'},lydian:{name:'リディア',f:'F4'},
  mixolydian:{name:'ミクソリディア',f:'G3'},aeolian:{name:'エオリア',f:'A3'},ionian:{name:'イオニア',f:'C4'}};
const FINAL_MODE={D:'dorian',E:'phrygian',F:'lydian',G:'mixolydian',A:'aeolian',C:'ionian'};
const FUX_NOTES={};FUX.forEach(([k,t])=>{FUX_NOTES[k]=t.split(' ').map(N);});
const noteStr=n=>LETTERS[n.s%7]+(n.a===1?'#':n.a===-1?'b':'')+Math.floor(n.s/7);
function modeOf(notes){const f=notes[notes.length-1];return f.a?null:(FINAL_MODE[LETTERS[f.s%7]]||null);}
const SPECIES={
  1:{name:'第1類',ratio:'1対1',MW:58,g:4},
  2:{name:'第2類',ratio:'2対1',MW:104,g:2},
  3:{name:'第3類',ratio:'4対1',MW:150,g:1},
  4:{name:'第4類',ratio:'掛留',MW:104,g:2},
  5:{name:'第5類',ratio:'華麗',MW:150,g:1}
};
const PATTERNS={
  hh:{d:[2,2],lab:'2分音符2つ'}, hht:{d:[2,2],tie:1,lab:'2分音符2つ(次の小節へタイ)'},
  hqq:{d:[2,1,1],lab:'2分音符+4分音符2つ'}, qqh:{d:[1,1,2],lab:'4分音符2つ+2分音符'},
  qqht:{d:[1,1,2],tie:1,lab:'4分音符2つ+2分音符(次の小節へタイ)'}, qqqq:{d:[1,1,1,1],lab:'4分音符4つ'},
  w:{d:[4],lab:'全音符'}, rh:{d:[2,2],rest:1,lab:'2分休符+2分音符'}, rht:{d:[2,2],rest:1,tie:1,lab:'2分休符+2分音符(次の小節へタイ)'},
  // Eighth notes come in pairs replacing one weak quarter (beat 2 or 4), following Fux/Jeppesen.
  hqee:{d:[2,1,0.5,0.5],lab:'2分音符+4分音符+8分音符2つ'}, qeeh:{d:[1,0.5,0.5,2],lab:'4分音符+8分音符2つ+2分音符'},
  qeeht:{d:[1,0.5,0.5,2],tie:1,lab:'4分音符+8分音符2つ+2分音符(次の小節へタイ)'},
  qeeqq:{d:[1,0.5,0.5,1,1],lab:'4分音符+8分音符2つ+4分音符2つ'}, qqqee:{d:[1,1,1,0.5,0.5],lab:'4分音符3つ+8分音符2つ'}
};
const PAT_FIRST=['rht','rh','hh','hht','hqq','qqh','qqht','qqqq'];
const PAT_MID=['hh','hht','hqq','qqh','qqht','qqqq','w','hqee','qeeh','qeeht','qeeqq','qqqee'];
const hasEighth=id=>!!(PATTERNS[id]&&PATTERNS[id].d.includes(0.5));
function defaultRhythm(n){
  const cyc=['hqq','qqqq','qqht','hh','qqh','hht','hh'],r=[];
  for(let m=0;m<n;m++)r[m]=m===0?'rht':m===n-1?'w':cyc[(m-1)%cyc.length];
  if(n-3>=1)r[n-3]='qqht';r[n-2]='hh';return r;
}
const RULES={
  crossing:'声部の交差', dissonance:'強拍の不協和', weakdis:'弱拍の不協和の扱い', susp:'掛留の解決', prep:'掛留の準備',
  first:'開始の音程', last:'終止の音程', unison:'途中の同度', spacing:'声部間の間隔', parallel:'平行5度・8度',
  antiparallel:'反行による連続5度・8度', hidden:'隠伏5度・8度', beatpar:'拍頭間の平行', run:'3度・6度の連続',
  chromatic:'半音階的進行', repeat:'同音反復', leapBig:'7度・オクターヴを超える跳躍', leapAug:'増・減音程の跳躍',
  sixth:'6度の跳躍', comp:'跳躍後の埋め合わせ', twoLeaps:'同方向の連続跳躍', range:'対旋律の音域', climax:'最高音の重複',
  ficta:'変化音の使用', cadStep:'終止の順次進行', leading:'終止前の導音', cadForm:'終止の形', syncBreak:'シンコペーションの中断', rhythm:'リズムの変化',
  eighthStep:'8分音符の順次進行', eighthPlace:'8分音符の位置', eighthUp:'8分音符の上行', eighthMany:'8分音符が多すぎる'
};
const INJECT={parallel:[1,2,3,5],hidden:[1,2,3,5],dissonance:[1,2,3,5],weakdis:[2,3,5],susp:[4],prep:[4],unison:[1,2],
  leapBig:[1,2,3],leapAug:[1,2,3],leading:[1,2,3,4],repeat:[1,2],comp:[1,2],beatpar:[2],first:[1,2],sixth:[1,2],twoLeaps:[1,2,3],cadStep:[1,2],eighthStep:[5]};

/* ================= slots ================= */
function buildSlots(sp,n,rhythm,ties){
  const S=[],{MW,g}=SPECIES[sp];
  for(let m=0;m<n;m++){
    let durs,rest=false,tie=false;
    if(m===n-1||sp===1)durs=[4];
    else if(sp===2)durs=[2,2];
    else if(sp===3)durs=[1,1,1,1];
    else if(sp===4){durs=[2,2];rest=m===0;tie=m<=n-3&&ties[m]!==false;}
    else{const p=PATTERNS[rhythm[m]]||PATTERNS.hh;durs=p.d;rest=!!p.rest;tie=!!p.tie&&m<=n-3;}
    let b=0;
    durs.forEach((d,k)=>{S.push({i:S.length,m,b,dur:d,rest:rest&&k===0,optRest:(sp===2||sp===3)&&m===0&&k===0,tiedFrom:null,tieTo:null,
      x:LEFT+m*MW+MW*(b+g/2)/4});b+=d;});
    if(tie)S[S.length-1].tieNext=true;
  }
  S.forEach((s,i)=>{if(s.tieNext&&S[i+1]){S[i+1].tiedFrom=i;s.tieTo=i+1;}});
  return S;
}
const skey=s=>s.m+':'+s.b;
function valsOf(S,cp){return S.map(s=>s.rest?null:(cp[skey(s.tiedFrom!=null?S[s.tiedFrom]:s)]||null));}
const editable=s=>!s.rest&&s.tiedFrom==null;

/* ================= analysis ================= */
function analyze(c){
  const {sp,cf,above,slots:S,vals:V}=c, n=cf.length, L=S.length;
  const issues=[], add=(id,lv,cols,t,x)=>issues.push({id,lv,cols,t,x});
  const iv=S.map((s,i)=>V[i]?vInfo(cf[s.m],V[i],above):null);
  const atk=S.map(editable), dis=new Array(L).fill(null), mo=new Array(L).fill(null);
  const nxt=i=>{for(let j=i+1;j<L;j++)if(atk[j])return V[j]?j:-2;return -1;};
  const prv=i=>{for(let j=i-1;j>=0;j--)if(atk[j])return V[j]?j:(S[j].optRest?-1:-2);return -1;};
  const at={};S.forEach((s,i)=>{at[s.m+':'+s.b]=i;});
  let fi=-1;for(let i=0;i<L;i++)if(V[i]){fi=i;break;}

  for(let i=0;i<L;i++){const v=iv[i];if(!v)continue;const s=S[i],strong=s.b===0;
    if(v.crossed)add('crossing','err',[i],'声部の交差',`対旋律が定旋律の${above?'下':'上'}に回り込んでいます。2声部は交差させません。`);
    if(!v.cons){
      if(s.tiedFrom!=null){
        const nx=nxt(i);
        if(nx===-1)add('susp','err',[i],`掛留の解決(${ivName(v)})`,'掛留した不協和音は、次の音で2度下行して協和音に解決します。');
        else if(nx>=0){
          const d=V[nx].s-V[i].s, r=iv[nx];
          if(!(d===-1&&r&&r.cons&&!r.crossed))add('susp','err',[i,nx],`掛留の解決(${ivName(v)})`,'強拍で掛留した不協和音は、次の音で2度下行して協和音に解決します。');
          else if(!above&&r.dn===0)add('susp','err',[i,nx],'下声の掛留の解決','対旋律が下の掛留は2-3・4-5・9-10で解決します。オクターヴや同度への解決(7-8)は使いません。');
          else if(above&&v.d===1&&r.d===0)add('susp','err',[i,nx],'2-1の掛留','上声の掛留が同度へ解決すると声部が重なってしまいます。7-6・4-3・9-8を使います。');
          else dis[i]='掛';
        }else dis[i]='掛';
      }else if(s.tieNext)add('prep','err',[i],`掛留の準備が不協和(${ivName(v)})`,'タイで次の小節へ持ち越す音(掛留の準備)は、協和音程にします。');
      else if(strong||sp===1||i===L-1){
        add('dissonance','err',[i],`${sp===1?'':'強拍の'}不協和音程(${ivName(v)})`,
          (sp===1?'1対1の対位法では協和音程(完全1・5・8度、長短3・6度とその複音程)だけを使います。':'拍頭(強拍)には協和音程を置きます。強拍に不協和音を置けるのは、タイで持ち越した掛留だけです。')
          +(v.dn===3&&v.q==='P'?'2声では完全4度も不協和として扱います。':''));
      }else{
        const p=prv(i),nx=nxt(i);
        if(p===-2||nx===-2){dis[i]='?';}
        else{
          let kind=null;
          if(p>=0&&nx>=0){
            const d1=V[i].s-V[p].s,d2=V[nx].s-V[i].s;
            if(Math.abs(d1)===1&&Math.abs(d2)===1&&Math.sign(d1)===Math.sign(d2))kind='経';
            else if(s.dur<=1&&Math.abs(d1)===1&&Math.abs(d2)===1)kind='刺';
            else if(s.dur===1&&d1===-1&&d2===-2){const n2=nxt(nx);if(n2===-2||n2===-1||(n2>=0&&V[n2].s-V[nx].s===1))kind='カ';}
          }
          if(kind)dis[i]=kind;
          else if(s.dur===0.5){} // reported once per pair by eighthStep below
          else add('weakdis','err',[i],`弱拍の不協和(${ivName(v)})`,s.dur===1
            ?'弱拍の不協和音は、経過音(同じ方向に順次進行)、刺繍音(隣の音へ行って戻る)、カンビアータ(2度下行した不協和から3度下へ跳び、2度上がる)に限ります。'
            :'2分音符の弱拍に置ける不協和音は、経過音(前後とも同じ方向への順次進行)だけです。');
        }
      }
      continue;
    }
    if(i===fi&&s.m===0){ // only the opening bar: notes written out of order (e.g. the cadence first) are not "the start"
      if(!v.perfect)add('first','err',[i],'開始は完全協和音程で','最初の音程は完全協和音程(対旋律が上なら同度・5度・8度)にします。');
      else if(!above&&v.dn===4)add('first','err',[i],'下声での5度開始','対旋律が下のとき5度で始めると、最低音が終止音と違う音になり旋法があいまいになります。同度かオクターヴで始めます。');
    }else if(i===L-1){
      if(!(v.perfect&&v.dn===0))add('last','err',[i],'終止は同度かオクターヴで','最後の音程は同度またはオクターヴにします。');
    }else if(v.d===0&&strong)add('unison','err',[i],sp===1?'途中の同度':'拍頭の同度',sp===1?'同度では2声部がひとつに溶けてしまうため、開始と終止以外では使いません。':'同度は開始と終止以外の拍頭では使いません(弱拍なら使えます)。');
    if(v.d>9)add('spacing','warn',[i],'声部間が離れすぎ',`${ivName(v)}は広すぎます。2声部の間隔は10度以内が目安です。`);
  }

  for(let i=1;i<L;i++){const a=iv[i-1],b=iv[i];if(!a||!b)continue;
    const m=motion(cf[S[i-1].m],cf[S[i].m],V[i-1],V[i]);
    mo[i]=(m==='similar'&&a.dn===b.dn)?'parallel':m;
    if(b.perfect&&!b.crossed&&(m==='similar'||m==='contrary')){
      const lab=b.dn===4?'5度':(b.d===0?'同度':'8度');
      if(a.perfect&&a.dn===b.dn){
        if(m==='similar')add('parallel','err',[i-1,i],`平行${lab}`,'完全協和音程を同じ方向に続けると、2声部がひとつの声のように聞こえます。反行か斜行で入り直します。');
        else add('antiparallel','err',[i-1,i],`反行による連続${lab}`,'反行でも完全協和音程が続くと、平行とほぼ同じ響きになります(「反行の5度・8度」)。平行と同じく使いません。');
      }else if(m==='similar')add('hidden','err',[i-1,i],`隠伏${lab}`,'並行(同方向)の動きで完全協和音程に入っています。2声の厳格対位法では、完全協和音程には反行か斜行で入ります。');
    }
  }
  const beatPairs=[];
  if(sp===2||sp===3||sp===5)for(let m=1;m<n;m++)beatPairs.push([at[(m-1)+':0'],at[m+':0'],'拍頭間の平行','弱拍をはさんでも、連続する拍頭の完全協和音程が同じ方向へ動くと平行に聞こえます。',sp===2?'err':'warn']);
  if(sp===4)for(let m=1;m<n-1;m++)beatPairs.push([at[(m-1)+':2'],at[m+':2'],'弱拍間の平行','掛留をはさんでも、準備音どうしの平行5度・8度は響きが残るので避けます。','warn']);
  for(const[i0,i1,t,x,lv]of beatPairs){
    if(i0==null||i1==null||i1===i0+1||!iv[i0]||!iv[i1])continue;const a=iv[i0],b=iv[i1];
    if(a.perfect&&b.perfect&&a.dn===b.dn&&!a.crossed&&!b.crossed&&motion(cf[S[i0].m],cf[S[i1].m],V[i0],V[i1])==='similar')
      add('beatpar',lv,[i0,i1],`${t}(${b.dn===4?'5度':'8度'})`,x);
  }
  if(sp===1){let run=[];
    for(let i=1;i<=L;i++){const cont=i<L&&mo[i]==='parallel'&&iv[i]&&iv[i].cons&&!iv[i].perfect;
      if(cont){if(!run.length)run=[i-1];run.push(i);}
      else{if(run.length>3){const v=iv[run[0]];add('run','warn',run.slice(),`${v.dn===2?'3度':'6度'}が${run.length}回連続`,'同じ種類の不完全協和音程が並行で続くと、声部の独立性が弱まります。3回程度までにします。');}run=[];}}
  }

  const P=[];for(let i=0;i<L;i++)if(atk[i])P.push(i);
  let leaps=0;
  for(let k=1;k<P.length;k++){const i0=P[k-1],i1=P[k],p=V[i0],q=V[i1];if(!p||!q)continue;
    const d=q.s-p.s,ad=Math.abs(d),semi=midi(q)-midi(p);
    if(ad===0){
      if(semi!==0)add('chromatic','err',[i0,i1],'半音階的進行',`${nameOf(p)}→${nameOf(q)}のような同じ音名の半音移動は、旋法的な旋律では使いません。`);
      else add('repeat','warn',[i0,i1],'同音反復',sp===4?'タイを使わずに同じ音を繰り返すと旋律が停滞します。':'同じ音の反復は旋律が停滞して聞こえるため控えます。');
      continue;}
    if(ad>=2)leaps++;
    const mi=interval(d>0?p:q,d>0?q:p);
    if(ad>7)add('leapBig','err',[i0,i1],'オクターヴを超える跳躍','跳躍はオクターヴまでにします。');
    else if(ad===6)add('leapBig','err',[i0,i1],'7度の跳躍','7度の跳躍は歌いにくく、禁じられています。');
    else if(mi.q==='A'||mi.q==='d')add('leapAug','err',[i0,i1],`${ivName(mi)}の跳躍`,'増・減音程(特に三全音)の旋律的進行は禁じられています。');
    else if(ad===5){
      if(d<0)add('sixth','warn',[i0,i1],'下行6度の跳躍','6度の跳躍は上行の短6度に限るのが原則です。');
      else if(mi.q==='M')add('sixth','warn',[i0,i1],'上行長6度の跳躍','6度の跳躍は上行の短6度に限るのが原則です。');
    }
  }
  for(let k=1;k<P.length-1;k++){const a=V[P[k-1]],b=V[P[k]],c2=V[P[k+1]];if(!a||!b||!c2)continue;
    const d1=b.s-a.s,d2=c2.s-b.s,cols=[P[k-1],P[k],P[k+1]];
    if(Math.abs(d1)>=3&&!(Math.sign(d2)===-Math.sign(d1)&&Math.abs(d2)<=2))add('comp','warn',cols,'跳躍の後の埋め合わせ','4度以上の跳躍の後は、反対方向へ順次進行(3度まで)で戻ります。');
    else if(Math.abs(d1)>=2&&Math.abs(d2)>=2&&Math.sign(d1)===Math.sign(d2)&&Math.abs(d1+d2)>4)add('twoLeaps','warn',cols,'同方向への連続跳躍','同じ方向に跳躍を重ねると旋律の輪郭が崩れます(三和音の分散程度まで)。');
  }
  const filled=P.filter(i=>V[i]);
  const missing=P.filter(i=>!V[i]&&!S[i].optRest).length;
  let span=0;
  if(filled.length>=2){
    const ss=filled.map(i=>V[i].s),mx=Math.max(...ss),mn=Math.min(...ss);span=mx-mn;
    if(span>9)add('range','warn',filled.filter(i=>V[i].s===mx||V[i].s===mn),'音域が広すぎる',`対旋律の音域が${span+1}度あります。10度以内が目安です。`);
    const hm=Math.max(...filled.map(i=>midi(V[i]))),tops=filled.filter(i=>midi(V[i])===hm);
    if(tops.length>1&&!missing&&sp!==3&&sp!==5)add('climax','warn',tops,'最高音が複数回',`最高音(${nameOf(V[tops[0]])})が${tops.length}回現れます。頂点を一度にすると旋律の形がはっきりします。`);
    if(tops.length>2&&!missing&&(sp===3||sp===5))add('climax','warn',tops,'最高音が何度も現れる',`最高音(${nameOf(V[tops[0]])})が${tops.length}回現れます。頂点ははっきり一度にまとめます。`);
  }
  const fin=L-1,la=prv(fin);
  for(const i of filled){const x=V[i];if(!x.a)continue;
    if((i===la&&x.a===1)||(LETTERS[x.s%7]==='B'&&x.a===-1))continue;
    add('ficta','warn',[i],'変化音の使用',`${nameOf(x)}:変化音は終止の導音(♯)とB♭にほぼ限られます。`);}
  if(V[fin]&&la>=0){
    if(Math.abs(V[fin].s-V[la].s)!==1)add('cadStep','err',[la,fin],'終止は順次進行で','対旋律は隣の音から順次進行で終止音に入ります。');
    const pen=iv[la],cfStep=cf[n-1].s-cf[n-2].s;
    if(pen&&!pen.crossed&&pen.cons&&Math.abs(cfStep)===1&&S[la].m===n-2){
      const wantDn=(above===(cfStep<0))?5:2,cpUp=V[fin].s>V[la].s,wantQ=wantDn===5?'M':'m';
      if(pen.dn===wantDn&&cpUp&&pen.q!==wantQ){const fix={s:V[la].s,a:V[la].a+1};
        add('leading','err',[la],'導音を半音上げる',`終止の直前は${wantDn===5?'長6度':'短3度'}にして、対旋律を半音で終止音へ導きます。ここは${nameOf(fix)}にします。`);}
      else if(pen.dn!==wantDn)add('cadForm','err',[la,fin],'終止の形',wantDn===5
        ?`定旋律が${cfStep<0?'上から':'下から'}終止音に入るので、終止の直前は6度にして、2声部が反対方向へ順次進行してオクターヴに入ります。`
        :`定旋律が${cfStep<0?'上から':'下から'}終止音に入るので、終止の直前は3度(または10度)にして、2声部が反対方向へ順次進行して同度(またはオクターヴ)に入ります。`);
    }
  }
  if(sp===5){
    const pairs=[];for(let i=0;i+1<L;i++)if(S[i].dur===0.5&&S[i+1].dur===0.5&&S[i].m===S[i+1].m&&S[i].b%1===0){pairs.push([i,i+1]);i++;}
    pairs.forEach(([i,j])=>{const m=S[i].m;
      if(m===0||m>=n-2)add('eighthPlace','err',[i,j],'8分音符の位置','8分音符は最初の小節と終止(最後の2小節)では使いません。途中の小節の弱い拍で使います。');
      if(!V[i]||!V[j])return;
      const p=prv(i),nx=nxt(j),bad=[];
      if(p>=0&&Math.abs(V[i].s-V[p].s)!==1)bad.push(p);
      if(Math.abs(V[j].s-V[i].s)!==1)bad.push(i);
      if(nx>=0&&Math.abs(V[nx].s-V[j].s)!==1)bad.push(nx);
      if(bad.length)add('eighthStep','err',[...new Set([i,j,...bad])].sort((a,b)=>a-b),'8分音符の順次進行','8分音符の組は、前の音から順次進行で入り、2つの間も順次、次の音へも順次進行で出ます(経過音・刺繍音の形)。跳躍や同音反復は使いません。');
      else if(V[j].s>V[i].s)add('eighthUp','warn',[i,j],'8分音符の上行','8分音符の組は下行が基本です。上行は使えますが、下行で書けないか確かめましょう。');
    });
    if(pairs.length>=3)add('eighthMany','warn',pairs.flat(),`8分音符の組が${pairs.length}つ`,'8分音符は飾りなので、1曲に1〜2組までにします。');
  }
  if(sp===4){const br=[];for(let m=0;m<=n-3;m++)if(c.ties&&c.ties[m]===false)br.push(at[m+':2']);
    if(br.length>2)add('syncBreak','warn',br,`タイを${br.length}回切っています`,'第4類ではシンコペーション(タイ)を続けるのが基本です。切るのは、掛留がうまく続かないときだけにします。');}
  if(sp===5&&c.rhythm){const mid=c.rhythm.slice(1,n-1);
    if(mid.length>2&&mid.every(x=>x===mid[0]))add('rhythm','warn',[at['1:0']],'リズムが単調','第5類では小節ごとにリズムを変え、2分音符・4分音符・タイを組み合わせます。');
    else if(!c.rhythm.slice(0,n-2).some(x=>PATTERNS[x]&&PATTERNS[x].tie))add('rhythm','warn',[at['1:0']],'掛留がない','第5類では、タイを使った掛留を少なくとも1回入れます。');}

  issues.sort((a,b)=>(a.lv===b.lv?0:a.lv==='err'?-1:1)||a.cols[0]-b.cols[0]);
  let moves=0,contra=0,perf=0;
  for(let m=1;m<n;m++){const i1=at[m+':0'],i0=i1-1;if(i0<0||!V[i0]||!V[i1])continue;
    const t=motion(cf[m-1],cf[m],V[i0],V[i1]);if(t!=='none'){moves++;if(t==='contrary')contra++;}}
  for(let m=1;m<n-1;m++){const i=at[m+':0'];if(iv[i]&&iv[i].perfect)perf++;}
  return {issues,iv,mo,dis,missing,complete:missing===0,la,stats:{moves,contra,perf,leaps,span:filled.length>=2?span+1:null}};
}

/* ================= grading =================
 * Based on classroom penalty rubrics (Nancy Rogers, FSU, Species Counterpoint Grading Guidelines):
 * 3 / 2 / 1 points by severity, escalating deductions for repeated weaknesses, and global deductions.
 */
const POINTS={parallel:3,antiparallel:3,hidden:2,dissonance:2,weakdis:2,susp:2,prep:2,beatpar:2,eighthStep:2};
function grade(r,c){
  const items=r.issues.map(x=>{
    let pts=POINTS[x.id]||1;
    if(x.id==='run')pts=Math.max(1,x.cols.length-3); // 4 in a row: 1 point, 5: 2 points ...
    return {id:x.id,t:x.t,pts,cols:x.cols};
  });
  const global=[],n=c.cf.length,mid=Math.max(1,n-2),ratio=r.stats.perf/mid;
  if(r.complete){
    if(ratio>1/2)global.push({t:'完全協和の使いすぎ(途中の拍頭の半分を超える)',pts:2});
    else if(ratio>1/3)global.push({t:'完全協和が多め(途中の拍頭の3分の1を超える)',pts:1});
  }
  const total=items.reduce((a,x)=>a+x.pts,0)+global.reduce((a,x)=>a+x.pts,0);
  const pass=r.complete&&!r.issues.some(x=>x.lv==='err');
  return {total,items,global,pass,complete:r.complete};
}

/* ================= solver ================= */
const STRICT=new Set(['beatpar','comp','sixth','spacing','range','twoLeaps','repeat','climax','run','eighthUp','eighthMany']);
function solve(sp,cf,above,S,rhythm,ties,limitMs){
  return solveOnce(sp,cf,above,S,rhythm,ties,limitMs*0.6,true)||solveOnce(sp,cf,above,S,rhythm,ties,limitMs*0.4,false);
}
function solveOnce(sp,cf,above,S,rhythm,ties,limitMs,strict){
  const n=cf.length,L=S.length,ss=cf.map(x=>x.s);
  const lo=above?Math.min(...ss):Math.min(...ss)-9, hi=above?Math.max(...ss)+9:Math.max(...ss);
  const order=S.filter(s=>editable(s)&&!s.optRest).map(s=>s.i);
  const laPos=order[order.length-2];
  const cp={};let best=null,bestW=Infinity;const t0=performance.now();let stop=false;
  const ctx=()=>({sp,cf,above,slots:S,vals:valsOf(S,cp),rhythm,ties});
  function rec(k){
    if(stop)return true;
    if(performance.now()-t0>limitMs){stop=true;return true;}
    if(k===order.length){const r=analyze(ctx());if(r.issues.some(x=>x.lv==='err'))return false;
      if(r.issues.length<bestW){bestW=r.issues.length;best={...cp};}return r.issues.length===0;}
    const i=order[k],s=S[i],prev=k>0?cp[skey(S[order[k-1]])]:null,cfN=cf[s.m];
    const mustCons=s.b===0||s.tieNext||sp===1||i===L-1;
    const cands=[];
    for(let st=lo;st<=hi;st++)for(const a of(i===laPos?[0,1]:[0])){
      const note={s:st,a},v=vInfo(cfN,note,above);if(v.crossed||(strict&&v.d>9))continue;
      const ad=prev?Math.abs(st-prev.s):0;
      if(prev&&(ad===0||ad===6||ad>7))continue;
      if(s.dur===0.5&&prev&&ad!==1)continue;
      if(!v.cons&&(mustCons||ad!==1))continue;
      if(!v.cons&&s.dur>=4)continue;
      cands.push({note,r:Math.random()+(ad<=1?0:ad===2?(sp===3?0.5:0.3):ad===7?1.4:0.9)+(v.cons?0:0.35)});
    }
    cands.sort((x,y)=>x.r-y.r);
    const key=skey(s);
    for(const c of cands){cp[key]=c.note;
      const r=analyze(ctx());
      if(!r.issues.some(x=>x.lv==='err'||(strict&&STRICT.has(x.id)&&x.cols.includes(i)))&&rec(k+1))return true;
      if(stop)break;}
    delete cp[key];return false;
  }
  rec(0);return best;
}

/* ================= cantus firmus ================= */
const pickOne=a=>a[Math.floor(Math.random()*a.length)];
function melBad(a,b){
  const d=b.s-a.s,ad=Math.abs(d);
  if(ad===0)return midi(a)===midi(b)?'同音の反復':'半音階的な動き';
  const mi=interval(d>0?a:b,d>0?b:a);
  if(mi.q==='A'||mi.q==='d')return `${ivName(mi)}の跳躍`;
  if(ad===6)return '7度の跳躍';
  if(ad>7)return 'オクターヴを超える跳躍';
  if(ad===5&&(d<0||mi.q!=='m'))return `${d<0?'下行':'上行'}${ivName(mi)}の跳躍`;
  return null;
}
function cfIssues(c,strict){
  const out=[],n=c.length,pos=(i,j)=>j==null?`第${i+1}音`:`第${i+1}〜${j+1}音`;
  if(midi(c[0])!==midi(c[n-1]))out.push('最初と最後の音が同じ音(終止音)ではありません。');
  if(Math.abs(c[n-1].s-c[n-2].s)!==1)out.push('終止音へは順次進行で入ります。');
  for(let i=1;i<n;i++){const m=melBad(c[i-1],c[i]);if(m)out.push(`${m}があります(${pos(i-1,i)})。`);}
  let run=1;
  for(let i=2;i<n;i++){const d1=c[i-1].s-c[i-2].s,d2=c[i].s-c[i-1].s;
    if(Math.abs(d1)>=4&&!(Math.sign(d2)===-Math.sign(d1)&&Math.abs(d2)<=2))out.push(`5度以上の跳躍の後に反対方向へ戻っていません(${pos(i-2,i)})。`);
    else if(Math.abs(d1)>=2&&Math.abs(d2)>=2&&Math.sign(d1)===Math.sign(d2)&&(Math.abs(d1+d2)>7||(Math.abs(d1)>=3&&Math.abs(d2)>=3)))out.push(`同じ方向に大きな跳躍が続いています(${pos(i-2,i)})。`);
    run=Math.sign(d1)===Math.sign(d2)&&d1?run+1:1;
    if(run===6)out.push(`同じ方向への動きが長く続きます(${pos(i-6,i)})。`);}
  const ss=c.map(x=>x.s),span=Math.max(...ss)-Math.min(...ss);
  if(span>9)out.push('音域が10度を超えています。');
  if(span<3)out.push('音域が狭すぎます(4度未満)。');
  const hm=Math.max(...c.map(midi));if(c.filter(x=>midi(x)===hm).length>1)out.push('最高音が複数回現れます。頂点は一度にします。');
  const tp=[0];for(let i=1;i<n-1;i++){const d1=c[i].s-c[i-1].s,d2=c[i+1].s-c[i].s;if(d1&&d2&&Math.sign(d1)!==Math.sign(d2))tp.push(i);}tp.push(n-1);
  for(let k=1;k<tp.length;k++){const a=c[tp[k-1]],b=c[tp[k]];if(a.s===b.s)continue;const v=interval(a.s<b.s?a:b,a.s<b.s?b:a);
    if((v.dn===3&&v.q==='A')||(v.dn===4&&v.q==='d')){out.push(`旋律の輪郭が三全音になっています(${pos(tp[k-1],tp[k])})。`);break;}
    if(strict&&v.dn===6&&v.d<7){out.push(`旋律の輪郭が7度になっています(${pos(tp[k-1],tp[k])})。`);break;}}
  return out;
}
function genCF(mode,len){
  const fin=N(MODES[mode].f).s,lo=fin-(mode==='phrygian'||mode==='mixolydian'?3:2),hi=fin+8;
  const nat=s=>({s,a:0});
  for(let restart=0;restart<40;restart++){
    const low=(mode==='dorian'||mode==='aeolian'||mode==='ionian'||mode==='mixolydian')&&Math.random()<0.25;
    const pen=low?fin-1:fin+1,notes=new Array(len);notes[0]=nat(fin);notes[len-2]=nat(pen);notes[len-1]=nat(fin);
    let nodes=0;
    const localOk=(i)=>{
      const a=notes[i-1],b=notes[i];if(melBad(a,b)||Math.abs(b.s-a.s)===7)return false;
      if(i>=2){const d1=a.s-notes[i-2].s,d2=b.s-a.s;
        if(Math.abs(d1)>=3&&!(Math.sign(d2)===-Math.sign(d1)&&Math.abs(d2)===1))return false;
        if(Math.abs(d1)>=2&&Math.abs(d2)>=2&&Math.sign(d1)===Math.sign(d2))return false;
        let run=1;for(let j=i;j>=2;j--){const x=notes[j].s-notes[j-1].s,y2=notes[j-1].s-notes[j-2].s;if(Math.sign(x)===Math.sign(y2))run++;else break;}
        if(run>=5)return false;}
      const ss=notes.slice(0,i+1).map(x=>x.s).concat([fin,pen]);if(Math.max(...ss)-Math.min(...ss)>9)return false;
      if(notes.slice(0,i+1).filter(x=>x.s===b.s).length>3)return false;
      if(notes.slice(0,i+1).filter(x=>x.s<fin).length>2)return false;
      if(i>=3&&b.s===notes[i-2].s&&a.s===notes[i-3].s)return false;
      return true;};
    const rec=(i)=>{
      if(++nodes>3000)return false;
      if(i===len-2){
        if(!localOk(len-2)||!localOk(len-1))return false;
        if(cfIssues(notes,true).length)return false;
        const ss=notes.map(x=>x.s),mx=Math.max(...ss),top=ss.indexOf(mx);
        if(top<2||top>len-3||mx-Math.min(...ss)<4||mx-fin<3)return false;
        let leaps=0;for(let k=1;k<len;k++)if(Math.abs(ss[k]-ss[k-1])>=2)leaps++;
        return leaps>=(len>=10?2:1)&&leaps<=Math.max(2,Math.floor((len-1)*0.3));
      }
      const ds=[-4,-3,-2,-1,1,2,3,4,5].map(d=>({d,r:Math.random()*(Math.abs(d)===1?1:Math.abs(d)===2?1.9:2.8)})).sort((x,y)=>x.r-y.r);
      for(const {d} of ds){const st=notes[i-1].s+d;if(st<lo||st>hi)continue;notes[i]=nat(st);if(localOk(i)&&rec(i+1))return true;}
      notes[i]=undefined;return false;};
    if(rec(1))return notes.map(x=>({s:x.s,a:0}));
  }
  return null;
}
function cfSolvable(c,sps,ms){
  const n=c.length;
  for(const spp of sps)for(const above of[true,false]){
    const rh=spp===5?defaultRhythm(n):[],S=buildSlots(spp,n,rh,[]);
    if(!solve(spp,c,above,S,rh,[],ms))return false;}
  return true;
}
function parseCF(text){
  const toks=text.trim().split(/[\s,、・]+/).filter(Boolean);
  if(toks.length<5)return {err:'5音以上入力してください。'};
  if(toks.length>16)return {err:'16音までにしてください。'};
  const out=[];
  for(const t of toks){
    const m=t.match(/^([A-Ga-g])(#|♯|b|♭|is|es)?(\d)?$/);
    if(!m)return {err:`「${t}」を音名として読めません。D4、F#4、Bb3 のように書いてください。`};
    const L=LETTERS.indexOf(m[1].toUpperCase()),a=m[2]?(/[#♯]|is/.test(m[2])?1:-1):0;
    let s;
    if(m[3]!=null)s=+m[3]*7+L;
    else if(!out.length){s=4*7+L;if(s>32)s-=7;}
    else{const p=out[out.length-1].s;s=Math.floor(p/7)*7+L;if(s-p>3)s-=7;else if(p-s>3)s+=7;}
    out.push({s,a});
  }
  const ss=out.map(x=>x.s);
  if(Math.min(...ss)<21||Math.max(...ss)>37)return {err:'音域はA2〜E5の範囲にしてください(大譜表に収まる高さ)。'};
  return {notes:out};
}

/* 規則を満たし、指定した類すべてで解ける定旋律を探す(時間予算つき) */
const LEN={short:[8,9],mid:[10,11],long:[12,14]};
function genCFChecked(modeSel,lenSel,sps,budgetMs){
  const t0=performance.now();
  for(let k=0;k<40&&performance.now()-t0<budgetMs;k++){
    const m=modeSel==='random'?pickOne(Object.keys(MODES)):modeSel,[a,b]=LEN[lenSel]||LEN.mid,len=a+Math.floor(Math.random()*(b-a+1));
    const c=genCF(m,len);if(!c||!cfSolvable(c,sps,500))continue;
    return {mode:m,notes:c};
  }
  return null;
}

/* ================= review questions ================= */
function makeQuestion(rule,prefSp){
  const opts=INJECT[rule];if(!opts)return null;
  let sp=prefSp&&opts.includes(prefSp)?prefSp:opts[Math.floor(Math.random()*opts.length)];
  for(let attempt=0;attempt<9;attempt++){
    if(attempt===5)sp=opts[0];
    let c,label;
    if(Math.random()<0.5){const k=FUX[Math.floor(Math.random()*FUX.length)][0];c=FUX_NOTES[k];label=`${MODES[k].name}(フックス)`;}
    else{const m=pickOne(Object.keys(MODES));c=genCF(m,9+Math.floor(Math.random()*4));if(!c)continue;label=`${MODES[m].name}(自動生成)`;}
    const above=Math.random()<0.6,n=c.length;
    const rhythm=sp===5?defaultRhythm(n):[],ties=[];
    if(sp===5&&rule.startsWith('eighth')&&n>=6)rhythm[2]='hqee';
    const S=buildSlots(sp,n,rhythm,ties);
    const sol=solve(sp,c,above,S,rhythm,ties,1400);if(!sol)continue;
    const base={sp,cf:c,above,slots:S,rhythm,ties};
    const cands=[];
    S.forEach(sl=>{if(!editable(sl)||sl.optRest)return;const k=skey(sl),cur=sol[k];if(!cur)return;
      const tries=[];for(let st=cur.s-6;st<=cur.s+6;st++)if(st!==cur.s)tries.push({s:st,a:0});
      tries.push({s:cur.s,a:cur.a?0:1});
      tries.forEach(nt=>{const cp=Object.assign({},sol);cp[k]=nt;
        const r=analyze({...base,vals:valsOf(S,cp)});const hit=r.issues.find(x=>x.id===rule);if(!hit)return;
        const other=r.issues.filter(x=>x.id!==rule&&x.lv==='err').length;cands.push({cp,other,cols:hit.cols});});});
    if(!cands.length)continue;
    const mn=Math.min(...cands.map(x=>x.other));const pool=cands.filter(x=>x.other===mn);
    const pick=pool[Math.floor(Math.random()*pool.length)];
    return {rule,sp,cf:c,label,above,rhythm,ties,cp:pick.cp,answer:sol,target:pick.cols,checked:false,result:null};
  }
  return null;
}

function solveFor(sp,cf,above,rhythm,ties,ms){
  const S=buildSlots(sp,cf.length,rhythm||[],ties||[]);
  return solve(sp,cf,above,S,rhythm||[],ties||[],ms);
}

const GE={LEFT,LETTERS,PC,QN,N,midi,nameOf,noteStr,cpy,interval,ivName,vInfo,motion,
  FUX,MODES,FINAL_MODE,FUX_NOTES,modeOf,SPECIES,PATTERNS,PAT_FIRST,PAT_MID,hasEighth,defaultRhythm,RULES,INJECT,
  buildSlots,skey,valsOf,editable,analyze,POINTS,grade,STRICT,solve,solveOnce,solveFor,
  pickOne,melBad,cfIssues,genCF,cfSolvable,parseCF,genCFChecked,makeQuestion};
root.GE=GE;
if(typeof module!=='undefined'&&module.exports)module.exports=GE;
})(typeof self!=='undefined'?self:globalThis);
