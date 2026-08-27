const mem = {}; let user = null; let cb = null;
export const emailOf = (id) => id + "@museum.class";
export const pwOf = (id, code) => id + "#" + code;
const fire = () => { if (cb) cb(user); };
export const authApi = {
  watch(fn) { cb = fn; setTimeout(fire, 0); return () => { cb = null; }; },
  async studentEnter(sid) { user = { email: emailOf(sid) }; fire(); return { ok: true }; },
  async teacherEnter() { user = { email: emailOf("teacher") }; fire(); return { ok: true }; },
  async changeCode() { return { ok: true }; },
  async leave() { user = null; fire(); },
};
const subs = { doc: {}, students: [], worksheets: [], surveys: [] };
function wsAll() { const o = {}; for (const k in mem) if (k.startsWith("ws:")) o[k.slice(3)] = mem[k]; return o; }
export const fbStore = {
  async get(k) { return k in mem ? mem[k] : null; },
  async set(k, v) { mem[k] = v; (subs.doc[k]||[]).forEach(f=>f(v)); if (k.startsWith("ws:")) subs.worksheets.forEach(f=>f(wsAll())); return true; },
  async remove(k) { delete mem[k]; return true; },
  watchDoc(k, fn) { (subs.doc[k]=subs.doc[k]||[]).push(fn); setTimeout(()=>fn(k in mem?mem[k]:null),0); return ()=>{}; },
  watchStudents(fn) { subs.students.push(fn); setTimeout(()=>fn(mem.roster||{}),0); return ()=>{}; },
  watchWorksheets(fn) { subs.worksheets.push(fn); setTimeout(()=>fn(wsAll()),0); return ()=>{}; },
  watchSurveys(fn) { subs.surveys.push(fn); setTimeout(()=>fn(mem.surveys||{}),0); return ()=>{}; },
  async allGrades() { return mem.grades || {}; },
  async allSurveys() { return mem.surveys || {}; },
  async setStudent(sid, d) { mem.roster = { ...(mem.roster||{}), [sid]: { ...((mem.roster||{})[sid]||{}), ...d } }; subs.students.forEach(f=>f(mem.roster)); return true; },
  async removeStudent(sid) { const r={...(mem.roster||{})}; delete r[sid]; mem.roster=r; subs.students.forEach(f=>f(r)); return true; },
};
mem.config = { open: { "1차시":true,"2차시":true,"3차시":true,"4차시":true,"5차시":true,"6차시":true,"7차시":true,"8차시":true } };
window.__probeMem = mem;
