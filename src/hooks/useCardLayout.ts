import { useCallback, useEffect, useState } from "react";
import {
  type CardDef,
  type CardLayoutState,
  type CardSection,
  CARD_LAYOUT_HYDRATE_EVENT,
  loadCardLayout,
  saveCardLayout,
} from "../lib/card-layout";

const EVENT = "nio-card-layout-change";

export function useCardLayout(section: CardSection, defs: CardDef[]) {
  const [layout, setLayout] = useState<CardLayoutState>(() => loadCardLayout(section, defs));

  useEffect(() => {
    const reload = () => setLayout(loadCardLayout(section, defs));
    const onExternalChange = (event: Event) => {
      const detail = (event as CustomEvent<{ section?: CardSection }>).detail;
      if (!detail?.section || detail.section === section) {
        reload();
      }
    };
    window.addEventListener(EVENT, onExternalChange);
    window.addEventListener(CARD_LAYOUT_HYDRATE_EVENT, reload);
    return () => {
      window.removeEventListener(EVENT, onExternalChange);
      window.removeEventListener(CARD_LAYOUT_HYDRATE_EVENT, reload);
    };
  }, [section, defs]);

  const updateLayout = useCallback(
    (next: CardLayoutState) => {
      const merged = saveCardLayout(section, next, defs);
      setLayout(merged);
      window.dispatchEvent(new CustomEvent(EVENT, { detail: { section } }));
    },
    [section, defs],
  );

  return [layout, updateLayout] as const;
}
