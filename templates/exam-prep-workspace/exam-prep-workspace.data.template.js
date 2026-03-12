(function () {
  window.examPrepTemplateData = {
    hero: {
      title: "Project-based exam prep with editable mindmap + contextual science loop.",
      body: "Upload once, map topics, run retrieval sessions, and close the loop with analytics and stage activation."
    },
    emailTemplate: [
      "Subject: Quick question about exam focus topics",
      "",
      "Hi Professor [Last Name],",
      "I am preparing for the upcoming exam and want to focus on the highest-priority topics.",
      "Could you share the key chapters/concepts we should prioritize?",
      "",
      "Thank you for your time!",
      "[Your Name]"
    ].join("\n"),
    types: [
      { value: "free_response", label: "FRQ (Priority)", active: true },
      { value: "multiple_choice", label: "MCQ", active: true },
      { value: "true_false", label: "True / False", active: true },
      { value: "fill_in_the_blank", label: "Fill in the Blank", active: false }
    ],
    questionCounts: [5, 8, 10, 15],
    defaultQuestionCount: 10,
    scienceSteps: [
      { id: "step01", number: 1, title: "Schema Activation", unlockHint: "Upload materials to unlock." },
      { id: "step02", number: 2, title: "Broad Exposure", unlockHint: "Upload materials to unlock." },
      { id: "step03", number: 3, title: "Active Retrieval", unlockHint: "Complete one quiz session." },
      { id: "step04", number: 4, title: "Error Calibration", unlockHint: "Complete one quiz session." },
      { id: "step05", number: 5, title: "Varied Encoding", unlockHint: "Generate a mindmap." },
      { id: "step06", number: 6, title: "Spaced Repetition", unlockHint: "Open analytics tab." }
    ],
    analytics: {
      title: "Retention Trend",
      axisRetention: "Retention",
      axisTime: "Time",
      thresholdLabel: "Δ Retentivity",
      labelMethod: "Science Method",
      labelCramming: "Traditional Cramming",
      callout: "Step 06 intervention flattens the forgetting slope.",
      datasets: {
        theory: {
          times: [1, 3, 7, 14, 30, 60],
          method: [0.86, 0.74, 0.63, 0.60, 0.56, 0.53],
          cramming: [0.89, 0.70, 0.47, 0.34, 0.24, 0.18],
          band: [0.05, 0.045, 0.04, 0.04, 0.035, 0.03]
        },
        actual: {
          times: [1, 3, 7, 14, 30, 60],
          method: [0.84, 0.73, 0.66, 0.63, 0.59, 0.56],
          cramming: [0.87, 0.69, 0.52, 0.39, 0.30, 0.23],
          band: [0.055, 0.05, 0.045, 0.04, 0.04, 0.035]
        }
      }
    }
  };
})();

