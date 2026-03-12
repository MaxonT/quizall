(function () {
  // API adapter template.
  // Set useMock=false and implement real endpoints for production migration.
  var useMock = true;

  var mockDB = {
    projects: [
      {
        id: "p_demo_001",
        name: "BIO 201 Midterm",
        examName: "BIO 201 Midterm",
        examDate: "2026-04-18",
        description: "Cell respiration, ATP, metabolic regulation",
        files: [
          { id: "f1", fileName: "lecture-03.pdf", contentLength: 182340, isOutlineCandidate: true },
          { id: "f2", fileName: "review-sheet.docx", contentLength: 53210, isOutlineCandidate: false }
        ],
        analytics: {
          trend: [
            { date: "2026-03-01", accuracy: 58 },
            { date: "2026-03-04", accuracy: 66 },
            { date: "2026-03-08", accuracy: 72 },
            { date: "2026-03-11", accuracy: 78 }
          ]
        },
        examPrep: {
          examTopics: "Cell respiration, glycolysis, oxidative phosphorylation, ATP synthase",
          selectedFileId: "f1",
          mindmap: {
            title: "BIO 201 ExamTopics Mindmap",
            generatedAt: new Date().toISOString(),
            message: "Editable mindmap generated from selected topics.",
            nodes: [
              {
                id: "n_root_1",
                text: "Cell Respiration",
                status: "green",
                children: [
                  { id: "n_1_1", text: "Glycolysis", status: "yellow", children: [] },
                  { id: "n_1_2", text: "TCA Cycle", status: "gray", children: [] }
                ]
              },
              {
                id: "n_root_2",
                text: "Oxidative Phosphorylation",
                status: "yellow",
                children: [
                  { id: "n_2_1", text: "ETC Complexes", status: "gray", children: [] },
                  { id: "n_2_2", text: "ATP Synthase", status: "green", children: [] }
                ]
              }
            ]
          }
        }
      }
    ]
  };

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function findProject(projectId) {
    return mockDB.projects.find(function (project) { return project.id === projectId; }) || null;
  }

  async function listProjects() {
    if (!useMock) {
      throw new Error("Implement listProjects() with real backend endpoint.");
    }
    await delay(120);
    return mockDB.projects.map(function (project) {
      return {
        id: project.id,
        name: project.name,
        examName: project.examName,
        examDate: project.examDate,
        description: project.description
      };
    });
  }

  async function createProject(payload) {
    if (!useMock) {
      throw new Error("Implement createProject() with real backend endpoint.");
    }
    await delay(120);
    var id = "p_" + Date.now();
    var created = {
      id: id,
      name: payload.name,
      examName: payload.examName || payload.name,
      examDate: payload.examDate || null,
      description: payload.description || "",
      files: [],
      analytics: { trend: [] },
      examPrep: { examTopics: "", selectedFileId: null, mindmap: null }
    };
    mockDB.projects.unshift(created);
    return clone(created);
  }

  async function getProjectDetail(projectId) {
    if (!useMock) {
      throw new Error("Implement getProjectDetail() with real backend endpoint.");
    }
    await delay(140);
    var project = findProject(projectId);
    if (!project) throw new Error("Project not found");
    return clone(project);
  }

  async function saveFiles(projectId, files) {
    if (!useMock) {
      throw new Error("Implement saveFiles() with real backend endpoint.");
    }
    await delay(180);
    var project = findProject(projectId);
    if (!project) throw new Error("Project not found");
    files.forEach(function (file, index) {
      project.files.push({
        id: "f_" + Date.now() + "_" + index,
        fileName: file.name,
        contentLength: Number(file.contentLength || 0),
        isOutlineCandidate: /outline|syllabus|review|考纲/i.test(file.name || "")
      });
    });
    return clone(project.files);
  }

  async function scanOutlineCandidates(projectId) {
    if (!useMock) {
      throw new Error("Implement scanOutlineCandidates() with real backend endpoint.");
    }
    await delay(130);
    var project = findProject(projectId);
    if (!project) throw new Error("Project not found");
    var candidates = project.files
      .filter(function (file) { return file.isOutlineCandidate; })
      .map(function (file, idx) {
        return {
          id: file.id,
          fileName: file.fileName,
          score: 90 - idx * 8,
          preview: "Potentially contains exam scope and topic hierarchy."
        };
      });
    return clone({
      candidates: candidates,
      recommendedFileId: candidates.length ? candidates[0].id : null
    });
  }

  async function generateMindmap(projectId, payload) {
    if (!useMock) {
      throw new Error("Implement generateMindmap() with real backend endpoint.");
    }
    await delay(220);
    var project = findProject(projectId);
    if (!project) throw new Error("Project not found");
    var topicsRaw = String(payload.topicsInput || project.examPrep.examTopics || "").trim();
    var topics = topicsRaw
      .split(/[,;\n]/)
      .map(function (item) { return item.trim(); })
      .filter(Boolean);
    if (!topics.length) topics = ["Core Topic A", "Core Topic B", "Core Topic C"];

    var mindmap = {
      title: (project.examName || project.name) + " Mindmap",
      generatedAt: new Date().toISOString(),
      message: "Generated from provided topics and project materials.",
      nodes: topics.slice(0, 6).map(function (topic, idx) {
        return {
          id: "n_" + Date.now() + "_" + idx,
          text: topic,
          status: idx % 3 === 0 ? "green" : (idx % 3 === 1 ? "yellow" : "gray"),
          children: []
        };
      })
    };

    project.examPrep.examTopics = topics.join(", ");
    project.examPrep.selectedFileId = payload.selectedFileId || null;
    project.examPrep.mindmap = mindmap;
    return clone({
      examTopics: project.examPrep.examTopics,
      mindmap: project.examPrep.mindmap
    });
  }

  async function saveMindmap(projectId, payload) {
    if (!useMock) {
      throw new Error("Implement saveMindmap() with real backend endpoint.");
    }
    await delay(120);
    var project = findProject(projectId);
    if (!project) throw new Error("Project not found");
    project.examPrep.examTopics = String(payload.examTopics || "").trim();
    project.examPrep.mindmap = clone(payload.mindmap);
    return clone(project.examPrep);
  }

  async function generateQuiz(projectId, payload) {
    if (!useMock) {
      throw new Error("Implement generateQuiz() with real backend endpoint.");
    }
    await delay(220);
    var project = findProject(projectId);
    if (!project) throw new Error("Project not found");

    var sampleQuestions = [
      { id: "q1", type: "free_response", prompt: "Explain ATP synthase coupling mechanism." },
      { id: "q2", type: "multiple_choice", prompt: "Which stage yields NADH most directly?" }
    ];

    // Mock adds analytics point to simulate loop closure.
    project.analytics.trend.push({
      date: new Date().toISOString().slice(0, 10),
      accuracy: Math.round(62 + Math.random() * 26)
    });

    return clone({
      project: { id: project.id, name: project.name, examName: project.examName, examDate: project.examDate },
      analysis: {
        subject: project.examName || project.name,
        topics: (payload.examTopics || project.examPrep.examTopics || "").split(/[,;\n]/).map(function (x) { return x.trim(); }).filter(Boolean)
      },
      quiz: sampleQuestions
    });
  }

  window.examPrepTemplateApi = {
    useMock: useMock,
    listProjects: listProjects,
    createProject: createProject,
    getProjectDetail: getProjectDetail,
    saveFiles: saveFiles,
    scanOutlineCandidates: scanOutlineCandidates,
    generateMindmap: generateMindmap,
    saveMindmap: saveMindmap,
    generateQuiz: generateQuiz
  };
})();

