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
console.log(`${pass} tests passed`);
