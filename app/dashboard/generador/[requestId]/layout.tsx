import type { ReactNode } from "react";
import RequestFeedbackWidget from "./RequestFeedbackWidget";

export default function GeneratorRequestLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {children}
      <RequestFeedbackWidget />
    </>
  );
}