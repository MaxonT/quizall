(function () {
  // Replace this dataset with your real research source-of-truth.
  // Keep the shape stable so science-page.template.js works without edits.
  window.scienceTemplateData = {
    meta: {
      title: "Science Template",
      kicker: "Research Foundation",
      heroTitle: "A 6-step learning pipeline grounded in cognitive science.",
      byline: "By Ming (Tiger) Yang",
      summary: "Adapt this summary to your app's research narrative.",
      preface:
        "\"Learning is not accumulation of information, but reconstruction of cognition.\""
    },
    journals: [
      "Science",
      "Psychological Science",
      "Psychological Bulletin"
    ],
    steps: [
      {
        id: "step01",
        number: 1,
        title: "Schema Activation",
        tagline: "Pre-training / structure before details",
        description: "Prime prior knowledge so new information has an anchor.",
        keyFindings: [
          "Prior schema reduces cognitive load during later encoding.",
          "Early structure improves transfer of complex concepts.",
          "Examples + self-explanation create stronger mental models."
        ],
        citations: [
          "Ausubel, D. P. (1960). The use of advance organizers in the learning and retention of meaningful verbal material.",
          "Sweller, J. (1988). Cognitive load during problem solving.",
          "Chi, M. T. H. et al. (1989). Self-explanations."
        ],
        quote: {
          text: "The most important single factor influencing learning is what the learner already knows.",
          author: "Ausubel"
        },
        why: {
          question: "Why start with structure?",
          answer: "Without schema, working memory is overloaded and later retrieval weakens.",
          operationalCue: "Step 01 aligns first-principles before details."
        },
        papers: [
          {
            title: "Advance Organizers and Meaningful Learning",
            abstract: "Shows that conceptual organizers improve downstream retention and comprehension.",
            citation: "Ausubel (1960)"
          }
        ]
      },
      {
        id: "step02",
        number: 2,
        title: "Broad Exposure",
        tagline: "Forward pass / wide concept coverage",
        description: "Build breadth first so later retrieval has richer pathways.",
        keyFindings: [
          "Initial broad pass improves later discriminative recall.",
          "Interleaved concept exposure improves classification.",
          "Coverage before drilling avoids local overfitting."
        ],
        citations: [
          "Rohrer, D., & Taylor, K. (2007). The shuffling of mathematics problems.",
          "Kornell, N., & Bjork, R. A. (2008). Learning concepts and categories."
        ],
        why: {
          question: "Why broad pass first?",
          answer: "Breadth seeds multiple retrieval routes before deep optimization.",
          operationalCue: "Use wide topic scan before heavy testing."
        },
        papers: []
      },
      {
        id: "step03",
        number: 3,
        title: "Active Retrieval",
        tagline: "Testing effect / generation effect",
        description: "Force output to reveal uncertainty and strengthen memory traces.",
        keyFindings: [
          "Retrieval practice outperforms re-reading for retention.",
          "Generating answers improves transfer more than passive review.",
          "Frequent low-stakes testing hardens recall."
        ],
        citations: [
          "Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning.",
          "Karpicke, J. D., & Blunt, J. R. (2011). Retrieval practice produces more learning than elaborative studying."
        ],
        quote: {
          text: "Retrieval practice is one of the most effective learning strategies known to cognitive science.",
          author: "Bjork school / retrieval-practice literature"
        },
        why: {
          question: "Why test so early?",
          answer: "Output reveals hidden gaps and creates durable retrieval routes.",
          operationalCue: "Default to active recall, not passive reading."
        },
        papers: []
      },
      {
        id: "step04",
        number: 4,
        title: "Error-Driven Calibration",
        tagline: "Desirable difficulties / ZPD fit",
        description: "Use difficulty boundaries to keep challenge in the productive zone.",
        keyFindings: [
          "Desirable difficulties improve long-term retention.",
          "Challenge-skill calibration supports flow and persistence.",
          "Error feedback refines strategy selection."
        ],
        citations: [
          "Bjork, R. A., & Bjork, E. L. (2011). Making things hard on yourself, but in a good way.",
          "Vygotsky, L. S. (1978). Mind in Society."
        ],
        why: {
          question: "Why not keep it easy?",
          answer: "Easy recall feels good but decays quickly; calibrated friction makes memory durable.",
          operationalCue: "Tune challenge based on observed error patterns."
        },
        papers: []
      },
      {
        id: "step05",
        number: 5,
        title: "Varied Encoding",
        tagline: "Multiple representations / transfer paths",
        description: "Encode ideas in multiple forms to improve generalization.",
        keyFindings: [
          "Representational variability improves transfer.",
          "Mindmaps increase relational understanding.",
          "Dual coding improves retention in complex domains."
        ],
        citations: [
          "Paivio, A. (1986). Mental representations: A dual coding approach.",
          "Ainsworth, S. (2006). DeFT framework for multiple representations."
        ],
        why: {
          question: "Why mindmap after retrieval?",
          answer: "Retrieval identifies weak links; mapping then re-encodes relationships.",
          operationalCue: "Switch representation to prevent single-format brittleness."
        },
        papers: []
      },
      {
        id: "step06",
        number: 6,
        title: "Spaced Repetition",
        tagline: "Forgetting-curve aware scheduling",
        description: "Re-activate memory at optimized intervals for long-term retention.",
        keyFindings: [
          "Spacing effect is robust across domains and age groups.",
          "Expanding intervals can improve retention efficiency.",
          "Review timing quality matters more than review volume."
        ],
        citations: [
          "Cepeda, N. J. et al. (2006). Distributed practice in verbal recall tasks.",
          "Vlach, H. A., & Sandhofer, C. M. (2012). Spacing effect in science concept learning."
        ],
        why: {
          question: "Why schedule, not cram?",
          answer: "Timed reactivation flattens forgetting and prevents rapid decay.",
          operationalCue: "Schedule next review from performance and delay."
        },
        papers: []
      }
    ],
    transitions: {
      step01: {
        text: "After the schema is formed, broad exposure injects raw material for later retrieval.",
        caption: "Step 01 -> Step 02 transition"
      },
      step02: {
        text: "Seeing information is not enough. Neural strengthening happens at output time.",
        caption: "Step 02 -> Step 03 transition"
      },
      step03: {
        text: "Retrieval reveals errors. Productive difficulty calibrates the learning boundary.",
        caption: "Step 03 -> Step 04 transition"
      },
      step04: {
        text: "Once challenge is calibrated, varied encoding improves transfer robustness.",
        caption: "Step 04 -> Step 05 transition"
      },
      step05: {
        text: "After multi-path encoding, spacing controls when traces should be re-activated.",
        caption: "Step 05 -> Step 06 transition"
      }
    },
    comparison: {
      title: "Cramming vs Science Method",
      intro: "Traditional cramming decays quickly. Structured retrieval + spacing stabilizes retention.",
      modeTheory: "Theoretical Prediction",
      modeActual: "Actual User Data",
      callout: "Step 06 intervention flattens the forgetting slope.",
      axisRetention: "Retention",
      axisTime: "Time",
      thresholdLabel: "Δ Retentivity",
      labelMethod: "Science Method",
      labelCramming: "Traditional Cramming",
      datasets: {
        theory: {
          times: [1, 3, 7, 14, 30, 60],
          quizall: [0.86, 0.74, 0.63, 0.60, 0.56, 0.53],
          cramming: [0.89, 0.70, 0.47, 0.34, 0.24, 0.18],
          band: [0.05, 0.045, 0.04, 0.04, 0.035, 0.03]
        },
        actual: {
          times: [1, 3, 7, 14, 30, 60],
          quizall: [0.84, 0.73, 0.66, 0.63, 0.59, 0.56],
          cramming: [0.87, 0.69, 0.52, 0.39, 0.30, 0.23],
          band: [0.055, 0.05, 0.045, 0.04, 0.04, 0.035]
        }
      }
    },
    cta: {
      title: "Use the science in your next session",
      body: "Return to your app and activate all six stages in workflow.",
      primaryLabel: "Open Workspace",
      primaryHref: "/create.html",
      secondaryLabel: "Back to Dashboard",
      secondaryHref: "/index.html"
    },
    fullCitations: [
      "Ausubel, D. P. (1960). Advance organizers and meaningful verbal learning.",
      "Sweller, J. (1988). Cognitive load during problem solving.",
      "Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning.",
      "Karpicke, J. D., & Blunt, J. R. (2011). Retrieval practice and durable transfer.",
      "Bjork, R. A., & Bjork, E. L. (2011). Desirable difficulties.",
      "Cepeda, N. J. et al. (2006). Distributed practice effect.",
      "Vlach, H. A., & Sandhofer, C. M. (2012). Spacing and science concept generalization."
    ]
  };
})();

