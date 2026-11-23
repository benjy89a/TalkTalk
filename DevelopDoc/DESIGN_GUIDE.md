# TalkTalk 디자인 가이드

> 작성: E 담당 재문 · E-1 / F-40 · **팀장 PR 검토용 초안**
>
> 현재 `components/layout/`의 3단 레이아웃을 기준으로 정리했습니다.
> **현재 적용**은 코드에서 확인한 값이고, **제안**은 아직 구현하지 않은 통일 규칙입니다.
> 이 문서만 추가했으며, 레이아웃·전역 스타일·설정·패키지는 변경하지 않았습니다.

## 1. 사용 원칙

- **남색 사이드바 + 흰색 대화 영역 + 얇은 회색 구분선**을 유지합니다.
- 스타일은 요소의 `className`에 Tailwind 클래스로 작성합니다. 별도 CSS 파일이나 디자인 패키지를 추가하지 않습니다.
- 현재 공통 버튼·입력창은 없으므로, 아래 제안은 팀장 검토 후 각자 담당 컴포넌트에 적용합니다.
- 담당 폴더 밖 파일은 수정하지 않습니다. 공통 레이아웃 연결은 팀장과 협의합니다.
- 기존 시스템 글꼴을 유지합니다. `app/globals.css`와 `app/layout.tsx`는 수정하지 않습니다.
- 데스크톱 브라우저가 우선입니다. 모바일 전체 대응은 현재 [PRD](PRD.md)의 범위 밖입니다.

## 2. 현재 적용: 3단 레이아웃

```text
사이드바                   가운데 대화 영역                  오른쪽 스레드
w-64, shrink-0             min-w-0, flex-1                   w-96, shrink-0
채널·DM·내 프로필          채널 헤더·검색·메시지·입력창      원본 메시지·답글
항상 표시                 남은 가로 공간 사용               lg 이상에서 표시
```

| 영역 | 현재 Tailwind 클래스 | 뜻 / 근거 파일 |
|---|---|---|
| 전체 화면 | `flex h-dvh w-full overflow-hidden bg-white text-gray-900` | 화면 높이를 채우고 바깥 스크롤을 막음 · [AppShell.tsx](../components/layout/AppShell.tsx) |
| 사이드바 | `flex w-64 shrink-0 flex-col bg-[#1e325c] text-white` | 고정 너비의 남색 영역 · [Sidebar.tsx](../components/layout/Sidebar.tsx) |
| 가운데 | `flex min-w-0 flex-1 flex-col` | 남은 너비를 채우고 긴 내용 때문에 영역이 늘어나는 것을 방지 · [MessageArea.tsx](../components/layout/MessageArea.tsx) |
| 스레드 | `hidden w-96 shrink-0 flex-col border-l border-gray-200 lg:flex` | 작은 화면에서는 숨김 · [ThreadPanel.tsx](../components/layout/ThreadPanel.tsx) |
| 사이드바 헤더 | `flex h-12 items-center border-b border-white/10 px-4 font-bold` | 서비스 이름 표시 |
| 대화 헤더 | `flex h-12 shrink-0 items-center justify-between border-b border-gray-200 px-4` | 채널 이름과 검색창 자리 |
| 스레드 헤더 | `flex h-12 shrink-0 items-center border-b border-gray-200 px-4 font-semibold` | 스레드 제목 |
| 사이드바 목록 | `flex-1 space-y-6 overflow-y-auto p-3` | 채널·DM 묶음 간격과 세로 스크롤 |
| 대화·스레드 목록 | `flex-1 space-y-2 overflow-y-auto p-4` | 목록 안에서 세로 스크롤 |
| 대화 입력 영역 | `shrink-0 border-t border-gray-200 p-4` | 하단 입력 영역 |

기본 Tailwind 크기와 루트 글자 크기 16px 기준으로 `w-64`는 256px, `w-96`은 384px, `h-12`는 48px입니다. `lg`는 기본 64rem(보통 1024px)부터 적용됩니다.

**현재 스레드는 `lg` 이상이면 항상 보입니다.** 열기·닫기 동작이나 좁은 화면에서의 대체 패널은 아직 구현되어 있지 않습니다.

## 3. 현재 적용: 색상

| 용도 | 클래스 | 사용 위치 |
|---|---|---|
| 서비스 대표색 | `bg-[#1e325c]` | 사이드바 |
| 기본 배경 | `bg-white` | 전체 화면 |
| 기본 글자 | `text-gray-900` | 전체 화면에서 상속 |
| 어두운 배경의 기본 글자 | `text-white` | 사이드바 |
| 사이드바 소제목 | `text-white/60` | 채널·DM 제목 |
| 밝은 영역 구분선 | `border-gray-200` | 헤더·입력 영역·스레드 경계 |
| 어두운 영역 구분선 | `border-white/10` | 사이드바 헤더·프로필 경계 |
| 밝은 임시 상자 | `border-gray-300 text-gray-400` | 작업 담당자를 표시하는 Placeholder |
| 어두운 임시 상자 | `border-white/30 text-white/60` | 사이드바 Placeholder |

`Placeholder`의 연한 글자와 점선은 **개발 중 자리 표시용**입니다. 실제 메시지·검색 결과·오류 안내의 기본 스타일로 사용하지 않습니다.

## 4. 글자 크기와 굵기

현재 본문과 헤더에는 `text-sm`이나 `text-base`가 명시되어 있지 않습니다. 아래 표에서 새로 지정하는 글자 크기는 제안으로 구분합니다.

| 요소 | Tailwind 클래스 | 상태 |
|---|---|---|
| 서비스 이름 | `font-bold` | 현재 적용 · 부모 헤더가 크기 결정 |
| 채널명·스레드 제목 | `font-semibold` | 현재 적용 |
| 사이드바 소제목 | `mb-2 px-1 text-xs font-semibold uppercase text-white/60` | 현재 적용 |
| 담당자 임시 상자 | `text-xs`, 담당자 표시는 `font-semibold` | 현재 적용 · 실제 콘텐츠에는 그대로 복사하지 않음 |
| 실제 메시지 본문 | `text-sm leading-6 text-gray-900 break-words` | 제안 · 읽기 편한 본문과 줄바꿈 |
| 보낸 사람·검색 결과 제목 | `text-sm font-semibold text-gray-900` | 제안 |
| 시간·채널명 등 보조 정보 | `text-xs leading-5 text-gray-600` | 제안 |
| 빈 결과·도움말 | `text-sm leading-6 text-gray-600` | 제안 |
| 사이드바 채널·DM 이름 | `text-sm text-white/90` | 제안 · 행 스타일은 6절 참고 |

크기 기준: `text-xs`는 기본 12px, `text-sm`은 14px, `text-base`는 16px입니다. 제목을 크게 늘리기보다 굵기로 구분합니다.

글꼴은 현재 `app/globals.css`의 OS 기본 글꼴 목록을 사용하고, 루트의 `antialiased`를 유지합니다. 외부 글꼴 설치나 다운로드는 필요하지 않습니다.

## 5. 여백과 테두리

| 용도 | 클래스 | 상태 |
|---|---|---|
| 헤더 좌우 여백 | `px-4` | 현재 적용 |
| 메시지·스레드·입력 영역 안쪽 여백 | `p-4` | 현재 적용 |
| 사이드바 목록·프로필 안쪽 여백 | `p-3` | 현재 적용 |
| 채널과 DM 묶음 사이 | `space-y-6` | 현재 적용 |
| 목록 자식 사이 | `space-y-2` | 현재 적용 |
| 보조 버튼 줄 위 여백 | `mt-2` | 현재 적용 |
| 버튼·검색 행 내부 간격 | `gap-2` | 제안 · 아이콘과 글자 사이 |
| 버튼·입력창·결과 행 모서리 | `rounded-md` | 제안 |

기본 간격 기준: `2` = 8px, `3` = 12px, `4` = 16px, `6` = 24px입니다. `gap-*`은 flex/grid 항목 사이, `space-y-*`는 세로로 나열한 자식 사이에 사용합니다. 같은 간격을 두 방식으로 중복 지정하지 않습니다.

현재 `Placeholder`는 `rounded border border-dashed p-2`입니다. 실제 콘텐츠는 점선을 제거하고 위 제안처럼 용도별 모양을 사용합니다.

## 6. 제안: 그대로 복사할 클래스

> 아래는 아직 적용하지 않은 스타일 제안입니다. `className` 문자열로 사용하며, 새 공통 컴포넌트나 설정 파일을 만들 필요는 없습니다.
> `hover:`는 마우스를 올렸을 때, `focus-visible:`은 키보드로 초점이 갔을 때, `disabled:`는 사용 불가 상태에 적용됩니다.

### 기본 버튼 — 전송·검색 실행 등 주요 동작

```text
inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-[#1e325c] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#172746] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50
```

강조색은 기존 사이드바 색을 재사용합니다. `hover:bg-[#172746]`는 그보다 어두운 색으로 제안합니다.

### 보조 버튼 — AI 요약·할 일 추출·취소

```text
inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50
```

### 아이콘 버튼 — 첨부·스레드 닫기

```text
inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50
```

아이콘만 있는 버튼에는 `aria-label="스레드 닫기"`처럼 동작 이름을 붙입니다. 글자를 넣을 경우 고정 너비 `w-9` 대신 기본·보조 버튼을 사용합니다.

### 검색창·한 줄 입력창

```text
h-9 w-full min-w-0 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 focus-visible:border-[#1e325c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c] disabled:cursor-not-allowed disabled:bg-gray-100
```

검색창에는 별도 `<label>` 또는 `aria-label="메시지 검색"`을 제공합니다. placeholder 문구만으로 이름을 대신하지 않습니다. 메시지 입력창처럼 여러 줄이 필요하면 `h-9` 대신 `min-h-20 py-2`를 사용하고, 실제 입력 동작은 B 담당과 맞춥니다.

### 사이드바 채널·DM 행

공통 행:

```text
flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-white/90 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1e325c]
```

- 이름 부분: `min-w-0 flex-1 truncate` — 긴 이름은 한 줄 말줄임.
- 선택된 채널: 공통 행에 `bg-white/15 font-semibold` 추가, `aria-current="page"` 등으로 선택 상태도 전달.
- 미읽음 채널: 이름에 `font-bold` 추가. 색만으로 구분하지 않음.
- 멘션 배지: `inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white`.
- 선택 상태는 C, 미읽음·멘션 값은 D의 실제 데이터와 연결. 임의의 숫자나 상태를 표시하지 않음.

### 검색 결과 행

```text
w-full rounded-md border border-gray-200 bg-white p-3 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:ring-offset-2
```

- 제목: `text-sm font-semibold text-gray-900`.
- 본문: `mt-1 text-sm leading-6 text-gray-900 break-words`.
- 채널·작성 시각: `mt-2 text-xs text-gray-600`.
- 검색어 강조: `rounded bg-yellow-100 px-0.5 text-gray-900`.
- 클릭 가능한 결과는 실제 `<button type="button">` 또는 이동용 링크로 구현. 스타일만 준 `<div>`를 버튼처럼 쓰지 않음.

### AI 결과·빈 상태·오류

| 상태 | 클래스 / 표시 방식 |
|---|---|
| AI 요약·할 일 결과 상자 | `rounded-md border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-900` |
| 결과 없음·초기 안내 | `p-4 text-center text-sm leading-6 text-gray-600` |
| 검색·AI 처리 중 | `text-sm text-gray-600` + “검색 중입니다” / “요약 중입니다” 문구 |
| 오류 | `rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700` + 원인·재시도 안내 |

처리 중에는 실행 버튼의 실제 `disabled` 속성을 사용합니다. 결과 상태 안내에는 `role="status"`, 즉시 알려야 하는 오류에는 `role="alert"`를 용도에 맞게 사용합니다. AI 결과에는 원문 확인이 필요함을 안내하고, 담당자·기한이 불명확하면 추측 대신 “미정”으로 표시합니다.

## 7. 팀장 협의 요청 — 코드 변경은 하지 않음

| 파일 | 현재 상태 | 협의할 변경과 이유 | 협의 대상 |
|---|---|---|---|
| `components/layout/Sidebar.tsx` | 헤더가 `h-12`이지만 `shrink-0` 없음 | 다른 헤더처럼 `shrink-0`을 추가할지 확인. 화면 높이가 부족할 때 헤더 높이가 줄어들지 않게 하기 위함 | A·E |
| `components/layout/Sidebar.tsx` | 채널·DM·프로필이 임시 상자 | C·D 컴포넌트를 연결할 때 6절의 행·선택·미읽음 스타일을 적용할지 확인 | A·C·D·E |
| `components/layout/MessageArea.tsx` | 헤더 검색 자리 `w-64`와 임시 상자 | E 검색 컴포넌트 연결 승인 필요. 좁은 데스크톱에서 채널명과 검색창이 겹치면 헤더에 `gap-3`, 채널명에 `min-w-0 truncate`, 검색 래퍼에 `min-w-0 w-full max-w-64` 등을 검토 | A·E |
| `components/layout/MessageArea.tsx` | AI 버튼·결과가 임시 상자 | E가 `components/search/`에 만든 버튼·결과 컴포넌트를 어느 위치에 넣을지 확정 | A·E |
| `components/layout/AppShell.tsx`, `components/layout/ThreadPanel.tsx` | `lg` 이상에서 스레드가 항상 보임 | 선택한 원본 메시지와 패널 열림 상태의 연결 방식, 닫기 버튼 위치 결정. 실제 답글 기능은 B 담당이며 E가 대신 구현하지 않음 | A·B·E |
| `components/layout/MessageArea.tsx`, `components/layout/ThreadPanel.tsx`, 필요 시 `Sidebar.tsx` | 목록이 `flex-1 overflow-y-auto` | 긴 실제 목록에서 목록만 스크롤되는지 확인. 넘침이 재현되면 필요한 flex 자식에 한해 `min-h-0` 추가 검토 | A·B·C·E |
| `components/layout/ThreadPanel.tsx` | `lg` 미만에서 패널 숨김 | 우선 데스크톱 시연 크기를 합의. 작은 창에서도 답글이 필요하면 대체 표시 방식 별도 협의. 모바일 대응을 임의로 추가하지 않음 | A·B·E |

위 항목은 개선 제안이며 승인·구현 완료를 의미하지 않습니다. 문서의 클래스 예시는 시각적 기준일 뿐, 채널 선택·메시지 이동·스레드 상태 연결을 대신하지 않습니다.

### 팀장에게 전달할 메시지

> E-1 디자인 가이드 초안을 `DevelopDoc/DESIGN_GUIDE.md`로 정리했습니다. 현재 남색·흰색 3단 레이아웃을 유지하고, 버튼·입력창·사이드바 행 스타일을 제안했습니다. 공통 레이아웃 코드는 변경하지 않았습니다. 제안 스타일 승인과 함께 검색·AI 컴포넌트 연결 위치, 스레드 열기/닫기 역할 분담을 확인 부탁드립니다. 레이아웃 개선 후보는 문서 7절에 파일별로 정리했습니다.

## 8. 적용·확인 체크리스트

- [ ] 팀장이 제안 스타일과 공통 레이아웃 변경 범위를 확인했다.
- [ ] 각 담당자가 자기 컴포넌트에 승인된 스타일을 적용했다.
- [ ] 헤더 높이·여백·구분선이 3개 영역에서 자연스럽게 맞는다.
- [ ] 긴 채널명·검색어·메시지에서도 전체 화면이 옆으로 밀리지 않는다.
- [ ] 목록이 길어져도 헤더·입력창은 유지되고 목록 안에서 스크롤된다.
- [ ] Tab 키로 버튼·검색창·검색 결과에 이동할 수 있고 초점 테두리가 보인다.
- [ ] 선택·미읽음·멘션·처리 중·오류를 색상 외에 글자나 상태 정보로도 구분한다.
- [ ] 실제 기능 적용 후 `npm run lint`, `npm run build`가 통과하고 화면을 직접 확인했다.

화면 확인은 프로젝트 폴더에서 다음 명령으로 실행합니다. 이미 개발 서버가 켜져 있다면 다시 실행하지 않고 기존 화면을 사용합니다.

```bash
npm run dev
```

브라우저에서 <http://localhost:3000>을 엽니다. **이번 PR은 문서만 추가하므로 화면 모양은 바뀌지 않습니다.** E-1의 실제 레이아웃 통일·스레드 열기/닫기 완료 여부는 코드 적용 후 별도로 확인합니다.

## 9. 참고 파일

- [CLAUDE.md — 팀 규칙·담당 범위](../CLAUDE.md)
- [WORK_UNITS.md — E 담당 작업 단위](WORK_UNITS.md#e--재문-ui검색ai)
- [TECH_SPEC.md — 화면 구성](TECH_SPEC.md#6-화면-구성)
- [PRD.md — 우선순위·범위](PRD.md)
- [components/layout/ — 현재 레이아웃](../components/layout/)
- [app/globals.css — 현재 글꼴](../app/globals.css)
- [app/layout.tsx — 공통 문서·글꼴 렌더링 설정](../app/layout.tsx)
