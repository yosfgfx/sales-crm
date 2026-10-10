"use client";

import { useEffect } from "react";
import { Direction } from "radix-ui";
import { useLocaleStore } from "@/stores/locale-store";

export default function DirectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const dir = useLocaleStore((state) => state.dir);
  const initFromStorage = useLocaleStore((state) => state.initFromStorage);

  useEffect(() => {
    initFromStorage();
  }, [initFromStorage]);

  return (
    <Direction.DirectionProvider dir={dir}>
      {children}
    </Direction.DirectionProvider>
  );
}
