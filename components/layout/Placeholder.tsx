// "여기에 OO 담당이 무엇을 넣는다"를 보여주는 임시 상자. 실제 컴포넌트로 바꾸면 지운다.
export default function Placeholder({
  owner,
  children,
  dark = false,
}: {
  owner: string;
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <div
      className={`rounded border border-dashed p-2 text-xs ${
        dark ? "border-white/30 text-white/60" : "border-gray-300 text-gray-400"
      }`}
    >
      <span className="font-semibold">[{owner}]</span> {children}
    </div>
  );
}
