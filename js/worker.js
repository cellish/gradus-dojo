/* Gradus 対位法ドリル — worker.js
 * 重い計算(解答例の探索・定旋律の生成・復習問題の生成)を画面とは別のスレッドで行う。
 * メッセージ: {id, type, args} → {id, ok, result | error}
 */
importScripts('../vendor/dojo-shared/core/src/pitch.js','engine.js','drills.js');
const TASKS={
  solve:a=>GE.solveFor(a.sp,a.cf,a.above,a.rhythm,a.ties,a.ms||2500),
  genCF:a=>GE.genCFChecked(a.mode,a.len,a.sps,a.budget||9000),
  question:a=>GE.makeQuestion(a.rule,a.prefSp),
  cfSolvable:a=>GE.cfSolvable(a.notes,a.sps,a.ms||600),
  drill:a=>GD.make(a.id)
};
self.onmessage=e=>{
  const {id,type,args}=e.data||{};
  try{
    const fn=TASKS[type];if(!fn)throw new Error('unknown task '+type);
    self.postMessage({id,ok:true,result:fn(args||{})});
  }catch(err){self.postMessage({id,ok:false,error:String(err&&err.message||err)});}
};
