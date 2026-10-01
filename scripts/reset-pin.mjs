/* 계정을 지우지 않고 비밀번호만 바꾼다 (README §10).

     node scripts/reset-pin.mjs <학번> <새 4자리>      예) node scripts/reset-pin.mjs 29901 4821
     node scripts/reset-pin.mjs --teacher <관리자 코드>   교사 계정(teacher#코드). 없으면 만든다
     node scripts/reset-pin.mjs --viewer <참관용 코드>    보기 전용 계정(viewer#코드). 없으면 만든다

   학생 계정을 지우고 다시 입장시키는 방법은 쓰지 않는다: 지운 사이에는 누구든 그 학번으로 가입할 수 있고,
   교사·보기 전용 계정은 지운 사이에 그 권한을 통째로 가져갈 수 있다.
   Firebase CLI의 로그인(firebase login)으로 Identity Toolkit 관리 API를 부른다(fs-admin.mjs의 accessToken).
   학생 계정은 새로 만들지 않는다(처음 입장할 때 학생 화면이 만든다). 코드는 명령 기록에 남으니 실행 뒤 터미널 기록을 지워도 된다. */
import { accessToken, projectId } from "./fs-admin.mjs";

const DOMAIN = "@museum.class";
const args = process.argv.slice(2);
const usage = () => {
  console.error("사용법: node scripts/reset-pin.mjs <학번> <새 4자리>  |  --teacher <코드>  |  --viewer <코드>");
  process.exit(1);
};

let id, pw, mayCreate = false;
if (args[0] === "--teacher" || args[0] === "--viewer") {
  id = args[0].slice(2);
  const code = String(args[1] || "");
  if (code.length < 5) { console.error("코드는 5자리 이상이어야 합니다 (입장 화면의 검사와 같음)."); process.exit(1); }
  pw = id + "#" + code;
  mayCreate = true;
} else {
  id = String(args[0] || "").trim();
  const pin = String(args[1] || "").trim();
  if (!/^\d{3,6}$/.test(id) || !/^\d{4}$/.test(pin)) usage();
  pw = id + "#" + pin;
}

const token = await accessToken();
const base = `https://identitytoolkit.googleapis.com/v1/projects/${projectId()}`;
const call = async (path, body) => {
  const r = await fetch(`${base}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} 실패 ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
};

const email = id + DOMAIN;
const found = await call("accounts:lookup", { email: [email] });
const user = (found.users || [])[0];
if (user) {
  await call("accounts:update", { localId: user.localId, password: pw });
  console.log(`${email} 비밀번호를 바꿨습니다.`);
} else if (mayCreate) {
  await call("accounts", { email, password: pw, emailVerified: false });
  console.log(`${email} 계정이 없어 새로 만들었습니다.`);
} else {
  console.error(`${email} 계정이 없습니다. 학생 계정은 처음 입장할 때 만들어집니다.`);
  process.exit(1);
}
