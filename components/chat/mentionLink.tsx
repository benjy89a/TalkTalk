"use client";
// [B] 말풍선 안 "@이름" 멘션 강조 — "@" 는 빼고 이름만 굵게 · 색으로 (누르는 기능은 없음)
//
// - 회색 말풍선(상대)엔 보라, 남색 말풍선(나)엔 밝은 노랑 → 파란 주소 링크와 구분
// - MentionProvider (MessageList · ThreadView 가 감쌈): 지금 채널 멤버 이름 목록을 한 번 불러온다
// - formatText 가 "@글자" 를 만나면 MentionLink 를 그린다
//   · 멤버 이름 중 가장 긴 것부터 맞춰 봄 → "@수정님" 처럼 호칭이 붙어도 "수정" 만 강조, "님" 은 그냥 글자
//   · 채널 멤버가 아닌 이름(예: 이메일 a@b, 아무 글자)은 "@글자" 그대로 둔다
// (35번에서 "나를 멘션한 사람에게 답장·DM" 메뉴를 달았다가, 내 이름을 눌러 다른 사람에게 가는 방식이 원리상 어색해서
//  37번에서 색 강조만 남기고 뺐다. 답장은 말풍선 막대의 "답장", DM 은 왼쪽 목록에서)
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

type Member = { id: string; name: string };

// 이름이 긴 것부터 (앞부분이 겹치는 이름을 바르게 고르려고)
const MentionContext = createContext<Member[] | null>(null);

export function MentionProvider({ channelId, children }: { channelId: string; children: ReactNode }) {
  const [loaded, setLoaded] = useState<{ channelId: string; members: Member[] } | null>(null);

  useEffect(() => {
    let active = true;
    createClient()
      .from("channel_members")
      .select("user_id, profiles(id, name)")
      .eq("channel_id", channelId)
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          console.error("[chat] 멘션용 멤버 이름을 불러오지 못함", error);
          return;
        }
        const members = data
          .filter((m) => m.profiles?.name)
          .map((m) => ({ id: m.user_id, name: m.profiles!.name.trim() }))
          .filter((m) => m.name)
          .sort((a, b) => b.name.length - a.name.length);
        setLoaded({ channelId, members });
      });
    return () => {
      active = false;
    };
  }, [channelId]);

  const members = loaded?.channelId === channelId ? loaded.members : null;
  return <MentionContext.Provider value={members}>{children}</MentionContext.Provider>;
}

// "@" 뒤 글자(token)에서 멤버 이름을 찾아 강조. 못 찾으면 원래 글자 그대로
export function MentionLink({ token, onDark }: { token: string; onDark: boolean }) {
  const members = useContext(MentionContext);
  const lower = token.toLowerCase();
  const member = members?.find((m) => lower.startsWith(m.name.toLowerCase()));
  if (!member) return <>@{token}</>;
  const rest = token.slice(member.name.length); // "님" 같은 호칭
  return (
    <>
      <span className={`font-bold ${onDark ? "text-amber-300" : "text-violet-700"}`}>{member.name}</span>
      {rest}
    </>
  );
}
