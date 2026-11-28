// node test/engine.test.js
const G=require('../js/engine.js');
const assert=require('assert');
let pass=0;const t=(name,fn)=>{try{fn();pass++;}catch(e){console.error('FAIL',name,'\n ',e.message);process.exitCode=1;}};
const notes=s=>s.split(' ').map(G.N);
const ctxOf=(sp,cf,above,cpArr,rhythm=[],ties=[])=>{
  const S=G.buildSlots(sp,cf.length,rhythm,ties),cp={};
  S.filter(G.editable).forEach((s,k)=>{if(cpArr[k])cp[G.skey(s)]=cpArr[k];});
  return {sp,cf,above,slots:S,vals:G.valsOf(S,cp),rhythm,ties};
};
const ids=r=>r.issues.map(x=>x.id);

t('interval qualities',()=>{
  const iv=(a,b)=>{const v=G.interval(G.N(a),G.N(b));return v.q+(v.d+1);};
  assert.equal(iv('C4','G4'),'P5');assert.equal(iv('F4','B4'),'A4');assert.equal(iv('B3','F4'),'d5');
  assert.equal(iv('D4','F4'),'m3');assert.equal(iv('C4','E5'),'M10');
});
t('note basics come from the dojo-shared core, with the app notation unchanged',()=>{
  const C=require('../vendor/dojo-shared/core/src/pitch.js');
  assert.equal(C.version,require('fs').readFileSync(__dirname+'/../vendor/dojo-shared/core/VERSION','utf8').trim());
  assert.deepEqual(G.N('F#4'),{s:31,a:1});assert.deepEqual(G.N('Bb3'),{s:27,a:-1});
  for(const bad of ['C##4','F♯4','c4','C10','H4','']) assert.throws(()=>G.N(bad),TypeError,bad); // the core reads these; N must not
  assert.equal(G.midi(G.N('B#3')),60);
  const lo=G.N('F4'),hi=G.N('B4');
  assert.deepEqual(G.interval(lo,hi),C.interval({step:lo.s,alter:lo.a},{step:hi.s,alter:hi.a}));
  assert.equal(G.motion(G.N('D4'),G.N('C4'),G.N('A4'),G.N('G5')),'contrary');
});
t('first species: parallel fifths detected',()=>{
  const cf=G.FUX_NOTES.dorian;
  const r=G.analyze(ctxOf(1,cf,true,notes('A4 C5 B4 A4 D5 C5 E5 D5 D5 C#5 D5')));
  assert(ids(r).includes('parallel'),ids(r).join(','));
});
t('first species: Fux-like correct line has no errors',()=>{
  const cf=G.FUX_NOTES.dorian;
  const r=G.analyze(ctxOf(1,cf,true,notes('A4 A4 G4 A4 B4 C5 C5 B4 D5 C#5 D5')));
  assert.equal(r.issues.filter(x=>x.lv==='err').length,0,JSON.stringify(r.issues.map(x=>x.t)));
});
t('leading tone required',()=>{
  const cf=G.FUX_NOTES.dorian;
  const r=G.analyze(ctxOf(1,cf,true,notes('A4 A4 G4 A4 B4 C5 C5 B4 D5 C5 D5')));
  assert(ids(r).includes('leading'));
});
t('solver finds error-free answers for every Fux cf, species and voice',()=>{
  for(const k of Object.keys(G.FUX_NOTES))for(const sp of [1,2,3,4,5])for(const above of [true,false]){
    const cf=G.FUX_NOTES[k],rh=sp===5?G.defaultRhythm(cf.length):[];
    const sol=G.solveFor(sp,cf,above,rh,[],3000);
    assert(sol,`no solution ${k} sp${sp} ${above?'above':'below'}`);
    const S=G.buildSlots(sp,cf.length,rh,[]);
    const r=G.analyze({sp,cf,above,slots:S,vals:G.valsOf(S,sol),rhythm:rh,ties:[]});
    assert.equal(r.issues.filter(x=>x.lv==='err').length,0);
    assert(r.complete);
  }
});
t('solver restarts: species 3 answers are almost always free of warnings',()=>{
  // Before restarts, about 1 in 7 searches spent the whole strict budget and returned an answer with a warning.
  let withFindings=0;
  for(let r=0;r<2;r++)for(const [k] of G.FUX)for(const above of [true,false]){
    const c=G.FUX_NOTES[k],S=G.buildSlots(3,c.length,[],[]),s=G.solve(3,c,above,S,[],[],2500);assert(s,k);
    if(G.analyze({sp:3,cf:c,above,slots:S,vals:G.valsOf(S,s),rhythm:[],ties:[]}).issues.length)withFindings++;
  }
  assert(withFindings<=4,'answers with findings: '+withFindings+'/24');
});
t('generated cantus firmi obey cf rules',()=>{
  for(const m of Object.keys(G.MODES))for(let i=0;i<5;i++){
    const c=G.genCF(m,10);assert(c,'gen failed '+m);
    assert.deepEqual(G.cfIssues(c,true),[]);
    assert.equal(G.modeOf(c),m);
  }
});
t('Fux cantus firmi pass lenient cf check',()=>{
  for(const k of Object.keys(G.FUX_NOTES))assert.deepEqual(G.cfIssues(G.FUX_NOTES[k]),[],k);
});
t('parseCF',()=>{
  const r=G.parseCF('D F E D G F A G F E D');assert(r.notes&&r.notes.length===11);assert.equal(r.notes[0].s,G.N('D4').s);
  assert(G.parseCF('C D X Y Z').err);assert(G.parseCF('C D E').err);
  assert.equal(G.parseCF('Bb3 C4 D4 Eb4 F4').notes[0].a,-1);
});
t('review question contains exactly the target rule error',()=>{
  for(const rule of ['parallel','hidden','leading','susp','weakdis']){
    const q=G.makeQuestion(rule);assert(q,'no question '+rule);
    const S=G.buildSlots(q.sp,q.cf.length,q.rhythm,q.ties);
    const r=G.analyze({sp:q.sp,cf:q.cf,above:q.above,slots:S,vals:G.valsOf(S,q.cp),rhythm:q.rhythm,ties:q.ties});
    assert(ids(r).includes(rule),rule+': '+ids(r));
  }
});
t('review question: model answer is free of the rule, and the level is reported',()=>{
  for(const rule of ['comp','sixth','repeat','parallel']){
    for(let k=0;k<12;k++){
      const q=G.makeQuestion(rule);assert(q,'no question '+rule);
      const S=G.buildSlots(q.sp,q.cf.length,q.rhythm,q.ties),an=v=>G.analyze({sp:q.sp,cf:q.cf,above:q.above,slots:S,vals:G.valsOf(S,v),rhythm:q.rhythm,ties:q.ties});
      assert(!ids(an(q.answer)).includes(rule),rule+': model answer has the rule');
      const hit=an(q.cp).issues.find(x=>x.id===rule);assert(hit,rule);assert.equal(q.lv,hit.lv,rule);
    }
  }
});
t('species 5 rhythm patterns fill each bar with 4 beats',()=>{
  for(const [id,p] of Object.entries(G.PATTERNS))assert.equal(p.d.reduce((a,b)=>a+b,0),4,id);
  for(const n of [8,10,11,14]){
    const rh=G.defaultRhythm(n),S=G.buildSlots(5,n,rh,[]);
    for(let m=0;m<n;m++)assert.equal(S.filter(s=>s.m===m).reduce((a,s)=>a+s.dur,0),4,`n=${n} bar ${m}`);
  }
});
t('eighth notes: stepwise pair is fine, leaping into it is an error',()=>{
  const cf=G.FUX_NOTES.dorian,n=cf.length,rh=G.defaultRhythm(n);rh[2]='hqee';
  // find a full error-free answer for this rhythm, then check its eighth pair
  const sol=G.solveFor(5,cf,true,rh,[],4000);assert(sol,'no solution with eighths');
  const S=G.buildSlots(5,n,rh,[]),ctx=v=>({sp:5,cf,above:true,slots:S,vals:G.valsOf(S,v),rhythm:rh,ties:[]});
  let r=G.analyze(ctx(sol));
  assert.equal(r.issues.filter(x=>x.lv==='err').length,0,JSON.stringify(r.issues.map(x=>x.t)));
  const e1=S.findIndex(s=>s.m===2&&s.b===3),e2=e1+1;
  assert.equal(S[e1].dur,0.5);assert.equal(S[e2].b,3.5);
  // move the first eighth a third away from its predecessor -> eighthStep
  const bad=JSON.parse(JSON.stringify(sol)),k=G.skey(S[e1]),prev=sol[G.skey(S[e1-1])];
  bad[k]={s:prev.s+2,a:0};
  r=G.analyze(ctx(bad));
  assert(ids(r).includes('eighthStep'),ids(r).join(','));
});
t('eighth notes: not offered in the first bar, flagged in the cadence',()=>{
  assert(!G.PAT_FIRST.some(G.hasEighth));
  const cf=G.FUX_NOTES.dorian,n=cf.length,rh=G.defaultRhythm(n);rh[n-2]='qqqee';
  const S=G.buildSlots(5,n,rh,[]);
  const cp={};S.filter(G.editable).forEach(s=>{cp[G.skey(s)]={s:cf[s.m].s+4,a:0};});
  const r=G.analyze({sp:5,cf,above:true,slots:S,vals:G.valsOf(S,cp),rhythm:rh,ties:[]});
  assert(ids(r).includes('eighthPlace'));
});
t('eighth notes: neighbour-note dissonance is labelled',()=>{
  // C5 (consonant 3rd? no: over F4 = 5th) -> B4 (dissonant 4th? over F4 = aug 4th) -> C5 : lower neighbour in eighths
  const cf=G.N('F4');const S=G.buildSlots(5,3,['rh','qeeqq','w'],[]);
  // build cf of 3 bars F4 F4 F4 with only middle bar relevant
  const cfs=[G.N('F4'),G.N('F4'),G.N('F4')];
  const vals={'0:2':G.N('C5'),'1:0':G.N('D5'),'1:1':G.N('C5'),'1:1.5':G.N('B4'),'1:2':G.N('C5'),'1:3':G.N('D5'),'2:0':G.N('F5')};
  const r=G.analyze({sp:5,cf:cfs,above:true,slots:S,vals:G.valsOf(S,vals),rhythm:['rh','qeeqq','w'],ties:[]});
  const iB=S.findIndex(s=>s.m===1&&s.b===1.5);
  assert.equal(r.dis[iB],'刺',JSON.stringify(r.issues.map(x=>x.t)));
});
t('species 5 solver handles eighth-note rhythms',()=>{
  for(const id of ['hqee','qeeh','qeeqq','qqqee']){
    const cf=G.FUX_NOTES.aeolian,n=cf.length,rh=G.defaultRhythm(n);rh[3]=id;
    const t0=Date.now(),sol=G.solveFor(5,cf,true,rh,[],3000);
    assert(sol,'no solution '+id);assert(Date.now()-t0<3500);
  }
});
t('eighth-step review question can be generated',()=>{
  const q=G.makeQuestion('eighthStep');assert(q,'no question');assert.equal(q.sp,5);
});
t('drills: every drill makes valid questions',()=>{
  const GD=require('../js/drills.js');
  for(const d of GD.DRILLS){
    for(let k=0;k<(['dis-kind','susp'].includes(d.id)?15:50);k++){
      const q=GD.make(d.id);assert(q,'no question '+d.id);
      assert.equal(q.choices.length,4,d.id);
      assert.equal(q.choices.filter(c=>c.ok).length,1,d.id+' '+JSON.stringify(q.choices));
      assert.equal(new Set(q.choices.map(c=>c.label)).size,4,d.id+' duplicate labels');
      assert.equal(q.score.slots.length,q.score.vals.length,d.id);
      GD.analyzeScore(q.score);
    }
  }
});
t('drills: cadence explanation matches the mode (no "from above" when the line rises)',()=>{
  const GD=require('../js/drills.js');const seen={};
  for(let k=0;k<200&&Object.keys(seen).length<6;k++){
    const q=GD.make('cadence');const v=q.score.vals,mode=Object.keys(G.MODES).find(m=>q.prompt.startsWith(G.MODES[m].name));
    seen[mode]=1;
    // Fux's cantus firmi all end by step from above, so the counterpoint always rises into the final.
    assert(v[0].s<v[1].s,'counterpoint rises into the final');
    assert(!q.explain.includes('対旋律が上から終止音に入る'),mode+': '+q.explain);
    if(v[0].a===0&&(mode==='lydian'||mode==='ionian'))assert(q.explain.includes('もともと'),mode+': '+q.explain);
  }
});
t('grading: 3/2/1 points, escalation, global deduction, pass',()=>{
  const cf=G.FUX_NOTES.dorian,c=v=>ctxOf(1,cf,true,notes(v));
  // parallel fifths (3) somewhere
  let g=G.grade(G.analyze(c('A4 C5 B4 A4 D5 C5 E5 D5 D5 C#5 D5')),c('A4 C5 B4 A4 D5 C5 E5 D5 D5 C#5 D5'));
  const par=g.items.find(x=>x.id==='parallel');assert(par&&par.pts===3,JSON.stringify(g.items));
  // hidden fifth/octave is 2 points
  assert.equal(G.POINTS.hidden,2);
  // forbidden leap is 1 point
  const leap=g.items.find(x=>x.id==='leapBig'||x.id==='leapAug');if(leap)assert.equal(leap.pts,1);
  // a correct Fux line passes
  const ok=c('A4 A4 G4 A4 B4 C5 C5 B4 D5 C#5 D5');g=G.grade(G.analyze(ok),ok);
  assert(g.pass);assert.equal(g.items.filter(x=>x.pts>=2).length,0);
  // run of five thirds: 2 points
  const cf2=notes('C4 D4 E4 F4 G4 A4 G4 F4 E4 D4 C4'),cc=ctxOf(1,cf2,true,notes('C5 F4 G4 A4 B4 C5 B4 A4 G4 B4 C5'));
  const r2=G.analyze(cc),run=G.grade(r2,cc).items.find(x=>x.id==='run');
  assert(run,'no run '+r2.issues.map(x=>x.id));assert.equal(run.pts,run.cols.length-3);
  // all-perfect downbeats get a global deduction
  const cf3=G.FUX_NOTES.dorian,pp=ctxOf(1,cf3,true,notes('D5 A4 B4 A4 D5 C5 E5 D5 D5 C#5 D5'));
  const g3=G.grade(G.analyze(pp),pp);
  assert(g3.global.length>=1,JSON.stringify(g3));
});
t('contrary-motion fifths are an error worth 3 points',()=>{
  // cf D4 -> C4 (down), cp A4 (5th) -> G5 (12th = compound 5th, up): contrary motion between perfect fifths.
  const cf=notes('D4 C4'),S=G.buildSlots(1,2,[],[]),vals=G.valsOf(S,{'0:0':G.N('A4'),'1:0':G.N('G5')});
  const r=G.analyze({sp:1,cf,above:true,slots:S,vals,rhythm:[],ties:[]});
  const x=r.issues.find(i=>i.id==='antiparallel');assert(x,ids(r).join(','));assert.equal(x.lv,'err');
  assert.equal(G.grade(r,{cf}).items.find(i=>i.id==='antiparallel').pts,3);
  assert(!G.grade(r,{cf}).pass);
});
t('opening rule applies only to the first bar, not to the first note written',()=>{
  const cf=G.FUX_NOTES.dorian,n=cf.length,S=G.buildSlots(1,n,[],[]),cp={};
  cp[G.skey(S[n-2])]=G.N('C#5');cp[G.skey(S[n-1])]=G.N('D5');
  let r=G.analyze({sp:1,cf,above:true,slots:S,vals:G.valsOf(S,cp),rhythm:[],ties:[]});
  assert(!ids(r).includes('first'),ids(r).join(','));
  cp[G.skey(S[0])]=G.N('F4');
  r=G.analyze({sp:1,cf,above:true,slots:S,vals:G.valsOf(S,cp),rhythm:[],ties:[]});
  assert(ids(r).includes('first'),'third at the start must be flagged');
});
t('species 5: ornamented suspension resolution (one consonant note between)',()=>{
  const L=require('../js/lessons.js'),ex=L.LESSONS[5].examples[0],susp=b=>L.analyzeBuilt(b).issues.filter(x=>x.id==='susp');
  // Fux p.7 bar 9: E5 (7th over F4) -> A4 (3rd) -> D5 (6th) is accepted
  assert.equal(susp(L.build(5,ex)).length,0);
  // the inserted note must be consonant: B4 is an augmented 4th over F4 (C5, a 5th, is fine)
  assert.equal(susp(L.build(5,ex,{'9-2':'B4'})).length,1);
  assert.equal(susp(L.build(5,ex,{'9-2':'C5'})).length,0);
  // after the ornament the line must still resolve a step down: C5 is not D5
  assert.equal(susp(L.build(5,ex,{'9-3':'C5'})).length,1);
  // lower voice, mirror image: E4 (2nd under F4) -> A3 -> D4
  assert.equal(susp(L.build(5,L.LESSONS[5].examples[1])).length,0);
});
t('levels: presets re-label or drop findings without changing the rules',()=>{
  // a line with parallel fifths (err) and a repeated note (warn)
  const cf=G.FUX_NOTES.dorian;
  const c=ctxOf(1,cf,true,notes('A4 C5 B4 A4 D5 C5 E5 D5 D5 C#5 D5'));
  const base=G.analyze(c);
  assert(ids(base).includes('parallel')&&ids(base).includes('repeat'),ids(base).join(','));
  const r=G.analyze({...c,levels:{parallel:'warn',repeat:'off'}});
  assert(!ids(r).includes('repeat'),'off must drop the rule');
  assert(r.issues.filter(x=>x.id==='parallel').every(x=>x.lv==='warn'),'parallel must become warn');
  assert.equal(r.issues.length,base.issues.length-base.issues.filter(x=>x.id==='repeat').length);
  // no levels / the fux preset: unchanged
  assert.deepEqual(G.analyze({...c,levels:G.PRESETS.fux.levels}).issues,base.issues);
  // every preset key is a real rule, and every rule has a default level
  for(const p of Object.values(G.PRESETS))for(const k of Object.keys(p.levels))assert(G.RULES[k],k);
  for(const k of Object.keys(G.RULES))assert(['err','warn'].includes(G.RULE_LV[k]),k);
});
t('levels: lenient turns a hidden fifth into a warning',()=>{
  // cf C4 -> D4, cp E4 -> A4: a 3rd to a 5th by similar motion with a leap in the upper voice
  const cf=notes('C4 D4'),S=G.buildSlots(1,2,[],[]),vals=G.valsOf(S,{'0:0':G.N('E4'),'1:0':G.N('A4')});
  const c={sp:1,cf,above:true,slots:S,vals,rhythm:[],ties:[]};
  const h=G.analyze(c).issues.find(x=>x.id==='hidden');assert(h&&h.lv==='err',ids(G.analyze(c)).join(','));
  const l=G.analyze({...c,levels:G.PRESETS.lenient.levels}).issues.find(x=>x.id==='hidden');assert(l&&l.lv==='warn');
  assert(G.grade(G.analyze({...c,levels:G.PRESETS.lenient.levels}),{cf}).items.some(x=>x.id==='hidden'));
});
t('lessons: Fux examples, bad examples and guided tasks',()=>{
  const L=require('../js/lessons.js');
  for(const sp of [1,2,3,4,5]){const les=L.LESSONS[sp];
    assert(les.intro.length>=3&&les.points.length>=3,'text sp'+sp);
    les.examples.forEach(ex=>{
      const b=L.build(sp,ex),r=L.analyzeBuilt(b);
      assert(r.complete,`sp${sp} ${ex.title} incomplete`);
      const errs=r.issues.filter(x=>x.lv==='err'&&!ex.allow.includes(x.id));
      assert.equal(errs.length,0,`sp${sp} ${ex.title}: ${errs.map(x=>x.id)}`);
      // every allowed rule is really needed (keeps the annotations honest)
      for(const a of ex.allow)assert(r.issues.some(x=>x.id===a),`sp${sp} ${ex.title}: allow ${a} unused`);
      for(const nt of ex.notes)assert(L.slotAt(b,nt.at)>=0,`sp${sp} ${ex.title}: note at ${nt.at}`);
    });
    les.bad.forEach(bd=>{
      const orig=L.build(sp,les.examples[bd.ex]),bb=L.build(sp,les.examples[bd.ex],bd.change);
      const base=new Set(L.analyzeBuilt(orig).issues.map(x=>x.id+':'+x.cols));
      const added=L.analyzeBuilt(bb).issues.filter(x=>!base.has(x.id+':'+x.cols));
      assert(added.some(x=>x.id===bd.rule),`sp${sp} bad "${bd.title}" lacks ${bd.rule}`);
      // A bad example should show its one point. These three have no single-note change that does so;
      // the screen lists their side findings apart.
      const mixed=['3:拍頭の不協和','4:上へ解決する掛留','5:不協和の飾り'];
      if(!mixed.includes(sp+':'+bd.title))assert(added.every(x=>x.id===bd.rule),`sp${sp} bad "${bd.title}" also adds ${added.map(x=>x.id)}`);
    });
    const g=les.guided,cf=G.FUX_NOTES[g.mode];
    assert(G.solveFor(sp,cf,g.above,sp===5?G.defaultRhythm(cf.length):[],[],3000),`guided sp${sp} unsolvable`);
  }
});
t('baseline: analyze, solver, questions and drills match the record (fixed random seed and clock)',()=>{
  // Regenerate only when a rule is changed on purpose: node test/baseline/generate.js
  const want=JSON.parse(require('fs').readFileSync(__dirname+'/baseline/record.json','utf8'));
  const got=JSON.parse(JSON.stringify(require('./baseline/run.js').record()));
  for(const k of Object.keys(want)){
    assert.equal(got[k].length,want[k].length,k);
    got[k].forEach((x,i)=>assert.deepEqual(x,want[k][i],`${k}[${i}]`));
  }
});
console.log(`${pass} tests passed`);
