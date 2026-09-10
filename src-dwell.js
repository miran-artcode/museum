/* 살펴본 시간 판정기 — 화면을 켜 두기만 한 시간을 걸러 낸다.

   학생이 사이트를 열어 둔 채 자리를 비우거나 다른 창을 보는 일이 잦아, 벽시계 시간이나
   「최근에 마우스가 한 번 움직였는가」만으로는 머문 시간이 크게 부풀려진다. 여기서는
   5초마다 다음 조건을 모두 만족할 때만 5초를 「살펴본 시간」에 넣는다.

   1. 탭이 보이고(visibilityState) 창에 초점이 있다(document.hasFocus). 창이 열려 있어도
      다른 프로그램을 앞에 띄웠으면 초점이 없으므로 세지 않는다.
   2. 최근 30초 안에 무언가 움직였다 — 마우스는 3px 이상 옮겨야 움직임으로 친다
      (책상 진동이나 1px 왕복 흔들기는 무시).
   3. 최근 2분 안에 「분명한 조작」이 있었다 — 클릭·키 입력·스크롤·휠·터치.
      마우스만 흔드는 것은 분명한 조작이 아니므로, 흔들기만으로는 2분 뒤 적립이 멈춘다.
      키를 꾹 누르고 있는 자동 반복(e.repeat)도 세지 않는다.

   조건 1은 맞지만 2·3이 아닌 시간은 「켜 둔 채 비활동(idle)」으로 따로 센다. 이 값이 크면
   화면을 켜 놓기만 했다는 뜻이므로 교사 화면과 CSV에 함께 내보낸다. 탭이 숨겨졌거나
   초점을 잃은 시간은 어느 쪽에도 넣지 않는다(무엇을 했는지 알 수 없다).

   탭이 숨겨지면 두 시각을 지운다 — 돌아온 뒤에는 새 조작이 있어야 다시 쌓인다.
   화면을 보며 생각만 하는 시간은 과소 집계되는데, 부풀리는 쪽보다 낫다고 보고 감수한다. */

export const DWELL_TICK_SEC = 5;          // 판정 주기(초)
export const DWELL_ANY_WINDOW_MS = 30000; // 어떤 움직임이든 이 안에 있어야 함
export const DWELL_STRONG_WINDOW_MS = 120000; // 분명한 조작이 이 안에 있어야 함
export const DWELL_MOVE_PX = 3;           // 마우스 이동으로 인정하는 최소 거리

const STRONG_EVENTS = ["pointerdown", "keydown", "wheel", "scroll", "touchstart", "input"];

/* onTick(active, sec): active가 true면 살펴본 시간, false면 켜 둔 채 비활동 시간에 sec를 더하라는 뜻.
   반환값은 정리 함수. */
export function startDwell(onTick) {
  let lastAny = 0, lastStrong = 0, lastX = null, lastY = null;

  const strong = (e) => {
    if (e && e.repeat) return;
    lastStrong = lastAny = Date.now();
  };
  const move = (e) => {
    const x = e.clientX, y = e.clientY;
    if (lastX != null && Math.abs(x - lastX) < DWELL_MOVE_PX && Math.abs(y - lastY) < DWELL_MOVE_PX) return;
    lastX = x; lastY = y;
    lastAny = Date.now();
  };
  const onVis = () => { if (document.visibilityState !== "visible") { lastAny = 0; lastStrong = 0; } };

  // scroll·wheel은 창까지 올라오지 않으므로(안쪽 스크롤 상자) capture로 받는다
  const opt = { passive: true, capture: true };
  STRONG_EVENTS.forEach((ev) => window.addEventListener(ev, strong, opt));
  window.addEventListener("pointermove", move, opt);
  document.addEventListener("visibilitychange", onVis);

  const t = setInterval(() => {
    if (document.visibilityState !== "visible" || !document.hasFocus()) return;
    const n = Date.now();
    const active = n - lastAny <= DWELL_ANY_WINDOW_MS && n - lastStrong <= DWELL_STRONG_WINDOW_MS;
    onTick(active, DWELL_TICK_SEC);
  }, DWELL_TICK_SEC * 1000);

  return () => {
    STRONG_EVENTS.forEach((ev) => window.removeEventListener(ev, strong, opt));
    window.removeEventListener("pointermove", move, opt);
    document.removeEventListener("visibilitychange", onVis);
    clearInterval(t);
  };
}
