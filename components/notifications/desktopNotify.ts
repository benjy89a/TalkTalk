// 윈도우 알림 (브라우저 Notification) 도우미 (D)
//
// - 처음 한 번 사용자가 "알림 켜기"를 눌러 허락해야 한다 (브라우저 규칙)
// - localhost 와 https(배포 주소)에서만 동작한다
// - 브라우저가 지원하지 않거나 막아 둔 경우에도 앱이 멈추지 않도록 모두 try/catch

const ASKED_KEY = "talktalk:notifyAsked";

/** 이 브라우저가 윈도우 알림을 지원하는지 */
export function desktopSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** 이미 허락받았는지 */
export function desktopAllowed(): boolean {
  return desktopSupported() && Notification.permission === "granted";
}

/** "알림 켜기" 안내를 보여줄지: 아직 묻지 않았고(default), 전에 "나중에"를 누르지 않았을 때 */
export function shouldAskDesktop(): boolean {
  if (!desktopSupported() || Notification.permission !== "default") return false;
  try {
    return localStorage.getItem(ASKED_KEY) !== "1";
  } catch {
    return true;
  }
}

/** "나중에"를 누르면 다시 묻지 않도록 기억 */
export function rememberAsked() {
  try {
    localStorage.setItem(ASKED_KEY, "1");
  } catch {
    // 저장 못 해도 다음에 한 번 더 물어볼 뿐
  }
}

/** 허락 요청. 허락되면 true */
export async function requestDesktop(): Promise<boolean> {
  if (!desktopSupported()) return false;
  try {
    const result = await Notification.requestPermission();
    rememberAsked();
    return result === "granted";
  } catch {
    return false;
  }
}

/** 윈도우 알림 띄우기. 누르면 onClick (TalkTalk 창을 앞으로 가져오고 그 메시지로 이동) */
export function showDesktop(title: string, body: string, tag: string, onClick: () => void) {
  if (!desktopAllowed()) return;
  try {
    const n = new Notification(title, { body, tag });
    n.onclick = () => {
      window.focus();
      onClick();
      n.close();
    };
  } catch (err) {
    console.warn("[notify] 윈도우 알림을 띄우지 못했어요:", err);
  }
}
