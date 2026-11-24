// [B] 이모지 단축 입력 — 입력창에 ":웃음" 처럼 치면 이모지 후보가 뜬다 (↑↓ 이동 · Enter/Tab 넣기 · Esc 닫기)
// 새 패키지 없이 자주 쓰는 이모지에 한글·영어 이름을 직접 붙여 둠
// 콜론(:) 앞이 줄 처음이거나 띄어쓰기일 때만 → "시간:3시" 같은 평범한 글에서는 안 뜬다

const EMOJI_NAMES: [string, string][] = [
  ["👍", "좋아 최고 따봉 굿 like thumbsup good ok"],
  ["👎", "싫어 별로 나빠 dislike thumbsdown bad"],
  ["❤️", "하트 사랑 좋아요 heart love"],
  ["😂", "웃김 ㅋㅋ 빵터짐 joy lol laugh"],
  ["🤣", "웃김 ㅋㅋㅋ 데굴 rofl laugh"],
  ["😀", "웃음 미소 smile grin"],
  ["😊", "웃음 미소 기쁨 행복 smile happy blush"],
  ["🙂", "미소 괜찮 slight smile"],
  ["😅", "땀 머쓱 민망 sweat"],
  ["😆", "웃음 신남 laughing"],
  ["😉", "윙크 wink"],
  ["😍", "반함 하트눈 heart eyes love"],
  ["🥰", "사랑 행복 love"],
  ["😘", "뽀뽀 kiss"],
  ["😎", "멋짐 선글라스 cool"],
  ["🤔", "생각 고민 흠 think hmm"],
  ["🙄", "눈굴림 어이없음 eyeroll"],
  ["😏", "씩 비웃음 smirk"],
  ["😐", "무표정 neutral"],
  ["😮", "놀람 헉 wow surprised"],
  ["😲", "놀람 깜짝 astonished"],
  ["😱", "비명 충격 scream shock"],
  ["😳", "당황 부끄 flushed"],
  ["🥺", "부탁 글썽 pleading"],
  ["😢", "슬픔 눈물 sad cry"],
  ["😭", "엉엉 통곡 sob cry"],
  ["😡", "화남 분노 angry"],
  ["😤", "씩씩 흥 huff"],
  ["😴", "졸림 잠 sleep"],
  ["😷", "아픔 마스크 sick mask"],
  ["🤯", "머리터짐 충격 mindblown"],
  ["🥳", "축하 파티 party"],
  ["😇", "천사 angel"],
  ["🤗", "포옹 안아 hug"],
  ["🤫", "쉿 조용 shh"],
  ["🙏", "감사 부탁 기도 제발 thanks please pray"],
  ["👏", "박수 짝짝 clap"],
  ["🙌", "만세 야호 hooray"],
  ["👋", "안녕 인사 바이 hi bye wave"],
  ["👌", "오케이 좋아 ok"],
  ["✌️", "브이 피스 victory peace"],
  ["🤝", "악수 협력 handshake deal"],
  ["💪", "힘 화이팅 파이팅 strong fighting"],
  ["👀", "눈 보는중 확인 eyes look"],
  ["🙋", "손들기 저요 질문 raise hand"],
  ["🙇", "죄송 꾸벅 sorry bow"],
  ["🤷", "몰라 글쎄 shrug"],
  ["🤦", "아이고 한숨 facepalm"],
  ["🎉", "축하 파티 짝짝 tada party congrats"],
  ["🎊", "축하 confetti"],
  ["🎁", "선물 gift"],
  ["🎂", "생일 케이크 birthday cake"],
  ["🏆", "우승 트로피 trophy"],
  ["🔥", "불 대박 최고 fire hot"],
  ["✨", "반짝 sparkle"],
  ["⭐", "별 star"],
  ["💯", "백점 완벽 100 perfect"],
  ["✅", "완료 체크 확인 done check yes"],
  ["❌", "취소 안됨 엑스 no x cancel"],
  ["⭕", "동그라미 맞음 o correct"],
  ["❗", "느낌표 중요 important"],
  ["❓", "물음표 질문 question"],
  ["⚠️", "주의 경고 warning"],
  ["💡", "아이디어 전구 idea"],
  ["📌", "고정 핀 중요 pin"],
  ["📝", "메모 기록 note memo"],
  ["📅", "일정 날짜 달력 calendar"],
  ["⏰", "시간 알람 마감 alarm time"],
  ["🚀", "출시 배포 로켓 launch rocket ship"],
  ["💻", "컴퓨터 노트북 개발 computer laptop"],
  ["☕", "커피 coffee"],
  ["🍺", "맥주 beer"],
  ["🍻", "건배 회식 cheers"],
  ["🍕", "피자 pizza"],
  ["🍜", "라면 국수 ramen noodle"],
  ["🍱", "도시락 점심 lunch"],
  ["💤", "잠 쿨쿨 zzz"],
  ["💬", "말 대화 chat"],
  ["💔", "상처 이별 broken heart"],
  ["🌈", "무지개 rainbow"],
  ["☀️", "해 맑음 sun"],
];

// 커서 바로 앞이 ":검색어" 면 그 위치와 검색어를 돌려준다
const QUERY_RE = /(^|\s):([0-9A-Za-z가-힣ㄱ-ㅎ_]{1,15})$/;
export function findShortcode(text: string, caret: number): { start: number; query: string } | null {
  const m = QUERY_RE.exec(text.slice(0, caret));
  if (!m) return null;
  return { start: caret - m[2].length - 1, query: m[2].toLowerCase() };
}

// 이름이 검색어로 시작하는 것을 먼저, 그다음 이름 중간에 들어 있는 것
export function matchEmojis(query: string, limit = 8): { emoji: string; name: string }[] {
  const starts: { emoji: string; name: string }[] = [];
  const contains: { emoji: string; name: string }[] = [];
  for (const [emoji, names] of EMOJI_NAMES) {
    const words = names.toLowerCase().split(" ");
    const hit = words.find((w) => w.startsWith(query));
    if (hit) starts.push({ emoji, name: hit });
    else {
      const part = words.find((w) => w.includes(query));
      if (part) contains.push({ emoji, name: part });
    }
  }
  return [...starts, ...contains].slice(0, limit);
}
