type SearchKeyEvent = {
  key: string; defaultPrevented: boolean; nativeEvent: { isComposing?: boolean };
  preventDefault: () => void; stopPropagation: () => void;
};

/** 검색 패널이 열려 있을 때만 Escape를 소비해 문서의 스레드 닫기로 전달하지 않는다. */
export function consumeSearchEscape(event: SearchKeyEvent, open: boolean): boolean {
  if (!open || event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing) return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}
