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
console.log(`${pass} tests passed`);
