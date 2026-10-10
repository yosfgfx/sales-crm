export function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-white/20 bg-[#d3c6f4] text-sm font-bold text-[#514077]"
    >
      {name
        .split(" ")
        .slice(0, 2)
        .map((s) => s[0])
        .join("")}
    </span>
  );
}
