import React from "react";
import { createRoot } from "react-dom/client";
import {
  HandrailBugReporterDialog,
  HandrailBugReporterProvider,
} from "@handrail/bug-reporter/react";

const root = createRoot(document.getElementById("root"));

window.mountReporter = ({ themeMode, recipientHint }) => {
  const policy = {
    schema_version: 1,
    project_id: "test-project",
    environment: "staging",
    reporter: { identity_verified: true, access_level: "user", role: "contributor" },
    ask_options: [],
    reporter_notifications: {
      available: true,
      recipient_hint: recipientHint,
      lifecycles: ["fixed"],
    },
  };
  root.render(
    <HandrailBugReporterProvider config={{
      apiBaseUrl: "https://example.invalid/api",
      projectId: "test-project",
      environment: "staging",
      reportToken: "test-public-token",
      applicationSessionTokenProvider: () => "test-session",
      fetch: async () => new Response(JSON.stringify(policy), {
        headers: { "content-type": "application/json" },
      }),
    }}>
      <HandrailBugReporterDialog
        open
        onClose={() => {}}
        showHistory={false}
        appearance={{
          themeMode,
          tokens: {
            accent: "#c83e08",
            text: themeMode === "dark" ? "#fafafa" : "#202020",
            mutedText: themeMode === "dark" ? "#bbbbbb" : "#666666",
            fontFamily: "Arial, sans-serif",
          },
        }}
      />
    </HandrailBugReporterProvider>,
  );
};
