import type { ReactNode } from "react";
import RequestFeedbackWidget from "./RequestFeedbackWidget";
import LogoOverlayWidget from "./LogoOverlayWidget";

export default function GeneratorRequestLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {children}
      <LogoOverlayWidget />
      <RequestFeedbackWidget />
    </>
  );
}
