import React from "react";
import { createRoot } from "react-dom/client";
import { ApplicationProvider } from "@semicoder/fn-ui";
import { useI18n } from "@semicoder/fn-sdk/react";
import { setLocale } from "./i18n.ts";
import { Kanban, view } from "./client.tsx";
function Page() {
  const { locale } = useI18n(view);
  setLocale(locale);
  return <Kanban />;
}
createRoot(document.getElementById("root")!).render(
  <ApplicationProvider view={view}>
    <Page />
  </ApplicationProvider>,
);
