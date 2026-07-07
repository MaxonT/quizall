(function () {
  var SUPPORTED = ["en", "zh-CN", "es", "fr", "ja", "ko", "ar", "pt", "hi"];

  function normalizeLocale(raw) {
    var value = String(raw || "").trim();
    if (!value) return "en";
    if (value === "zh" || value.toLowerCase().indexOf("zh-") === 0) return "zh-CN";
    if (SUPPORTED.indexOf(value) >= 0) return value;
    var shortCode = value.split("-")[0];
    if (SUPPORTED.indexOf(shortCode) >= 0) return shortCode;
    return "en";
  }

  function deepMerge(base, override) {
    var output = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (!override || typeof override !== "object") return output;
    Object.keys(override).forEach(function (key) {
      var incoming = override[key];
      var current = output[key];
      if (incoming && typeof incoming === "object" && !Array.isArray(incoming) && current && typeof current === "object" && !Array.isArray(current)) {
        output[key] = deepMerge(current, incoming);
      } else {
        output[key] = incoming;
      }
    });
    return output;
  }

  var EN = {
    pageTitle: "QuizAll Science | Research Foundation",
    brand: "QuizAll Science",
    navWorkspace: "App Workspace",
    navOpen: "Open QuizAll",
    railStage: "Current Stage",
    stepWord: "Step",
    kicker: "Research Foundation",
    heroTitle: "A 6-step learning pipeline grounded in the most replicated findings in cognitive science.",
    byline: "By Ming (Tiger) Yang",
    heroSummary:
      "QuizAll operationalizes peer-reviewed evidence from top journals into concrete learning actions: from schema activation and retrieval practice to transfer and spaced repetition.",
    preface:
      "Learning is not accumulation of information, but reconstruction of cognition. QuizAll's core logic is rooted in decades of empirical cognitive science. This article shows how six coordinated steps turn short-term memory into durable skill.",
    mindmapCaption: "Mindmap view: one cognitive loop, six coordinated learning stages.",
    mindmap: {
      title: "QuizAll Research Foundation",
      path: "First Principles -> Operational Details",
      mece: "MECE 6-Step Architecture",
      boundaries: {
        a: { title: "Input & Encoding Boundary", subtitle: "Structure -> Retrieval" },
        b: { title: "Optimization Boundary", subtitle: "Difficulty -> ZPD" },
        c: { title: "Consolidation Boundary", subtitle: "Spacing -> Feedback" }
      },
      nodes: {
        schema: { title: "Schema Activation", keywords: ["Prior Knowledge", "Cognitive Load"] },
        retrieval: { title: "Active Retrieval", keywords: ["Testing Effect", "Generation"] },
        difficulty: { title: "Desirable Difficulties", keywords: ["Effortful Recall", "Durable Memory"] },
        zpd: { title: "ZPD Calibration", keywords: ["Challenge-Skill Fit", "Flow Zone"] },
        spaced: { title: "Spaced Repetition", keywords: ["Forgetting Curve", "Timing Control"] },
        feedback: { title: "Feedback Loop", keywords: ["Error Signals", "Model Update"] }
      },
      why: {
        retrieveToSchema: "Why: retrieval errors refine schema",
        difficultyToZpd: "Why: productive difficulty calibrates challenge",
        feedbackToSpaced: "Why: feedback schedules next review"
      }
    },
    comparisonTitle: "Cramming vs QuizAll Science Method",
    comparisonIntro:
      "Traditional cramming decays fast after a short peak. QuizAll's six-step method repeatedly re-activates memory traces and flattens forgetting over time.",
    chartTime: "Time",
    chartRetention: "Retention",
    chartTag1: "Spaced Retrieval",
    chartTag2: "Adaptive Recall",
    chartTag3: "Transfer Review",
    chartLabelCramming: "Traditional Cramming",
    chartLabelMethod: "QuizAll Science Method",
    chartModeTheory: "Theoretical Prediction",
    chartModeActual: "Actual User Data",
    chartSeriesQuizall: "QuizAll Spaced Retrieval",
    chartSeriesCramming: "Traditional Cramming",
    chartCalloutStep06: "Step 06 intervention flattens the forgetting slope.",
    chartLogLabel: "log(t)",
    chartDeltaLabel: "ΔRetention",
    chartThresholdLabel: "i+1 threshold",
    chartHoverTime: "Time",
    chartHoverQuizall: "QuizAll",
    chartHoverCramming: "Cramming",
    chartTimeUnit: "d",
    citationsTitle: "Full Citation Index (33)",
    citationsIntro: "Peer-reviewed references from the QuizAll Research Foundation v2 source.",
    ctaTitle: "Use The Science In Your Next Session",
    ctaBody: "Return to QuizAll and activate the steps through your own project workflow.",
    ctaPrimary: "Open Workspace",
    ctaSecondary: "Back to Dashboard",
    stepLinkPrefix: "Link #",
    keyFindingsTitle: "Key Findings",
    citationsSectionTitle: "Citations",
    whyTitle: "The Why",
    whyFallback: "This stage raises durable retention by making the learner do effortful, structured cognitive work.",
    whySupportTemplate: "Operational cue: Step {{step}} applies \"{{tagline}}\" in the workflow, so this mechanism is trained through action.",
    whySignalLabel: "Workflow activation",
    deepDiveKicker: "Core takeaways shown above. Click to expand detailed paper abstracts.",
    expandCoreConclusion: "Expand Core Conclusion",
    refsTitle: "Refs",
    quoteSuffix: "notable quote",
    abstractTemplate:
      "This paper reinforces the {{title}} stage by emphasizing: {{core}} In QuizAll, this evidence is operationalized through the action pattern \"{{tagline}}\".",
    transitions: {
      step01: {
        text: "Once schema scaffolding is established, the next move is broad exposure to inject enough raw material for meaningful linking.",
        caption: "Cognitive state: scaffolding is ready; input can now attach efficiently."
      },
      step02: {
        text: "Exposure alone is not enough. Neural strengthening happens when knowledge is pulled out through effortful output.",
        caption: "Cognitive state: exposure turns into effortful retrieval."
      },
      step03: {
        text: "After retrieval surfaces memory traces, difficulty should be tuned to the learner's boundary where progress is challenging but achievable.",
        caption: "Cognitive state: retrieval loop enters adaptive boundary control."
      },
      step04: {
        text: "Once boundary training stabilizes, variability expands transfer. Multiple encodings prevent overfitting to one route.",
        caption: "Cognitive state: stable mastery expands into flexible transfer."
      },
      step05: {
        text: "Finally, what works once must become durable. Spaced retrieval over time repeatedly reshapes the forgetting curve.",
        caption: "Cognitive state: transfer is consolidated into durable retention."
      }
    },
    whyMap: {
      step01: "Why begin with structure? Without schema, <span class=\"concept\">Cognitive Load</span> overwhelms working memory and weakens later encoding.",
      step02: "Why do broad exposure first? Early contact creates recognizable traces that later retrieval can reactivate.",
      step03: "Why active retrieval? The <span class=\"concept\">Testing Effect</span> is triggered by effortful recall, not passive re-reading.",
      step04: "Why stay near the boundary? The overlap of <span class=\"concept\">ZPD</span> and <span class=\"concept\">Flow</span> gives the strongest learning gradient.",
      step05: "Why variability training? Single-format practice overfits; varied encoding improves transfer to new questions.",
      step06: "Why spaced repetition? Easy recall now can still fade quickly; interval retrieval repeatedly reforms memory strength."
    },
    stepOverrides: {}
  };

  var PACKS = {
    "zh-CN": {
      pageTitle: "QuizAll 科学依据 | 研究基础",
      navWorkspace: "学习工作台",
      navOpen: "打开 QuizAll",
      railStage: "当前阶段",
      stepWord: "步骤",
      kicker: "研究基础",
      heroTitle: "一个由认知科学高重复性证据支撑的 6 步学习管道。",
      heroSummary: "QuizAll 将顶级期刊中的同行评审证据转化为可执行学习动作：从图式激活、主动提取到迁移与间隔重复。",
      preface: "学习不是信息的堆积，而是认知的重构。QuizAll 的核心逻辑并非凭空而来，而是植根于认知心理学数十年的实证研究。本文将揭示这 6 个关键步骤如何协同工作，将瞬时记忆转化为永久技能。",
      mindmapCaption: "思维导图视角：一个认知闭环，六个协同阶段。",
      mindmap: {
        title: "QuizAll 研究基础",
        path: "第一性原理 -> 可执行细节",
        mece: "MECE 六步架构",
        boundaries: {
          a: { title: "输入与编码边界", subtitle: "结构 -> 提取" },
          b: { title: "优化边界", subtitle: "难度 -> ZPD" },
          c: { title: "固化边界", subtitle: "间隔 -> 反馈" }
        },
        nodes: {
          schema: { title: "Schema Activation", keywords: ["先验知识", "认知负荷"] },
          retrieval: { title: "Active Retrieval", keywords: ["测试效应", "生成效应"] },
          difficulty: { title: "Desirable Difficulties", keywords: ["努力提取", "长期保持"] },
          zpd: { title: "ZPD 校准", keywords: ["挑战-能力匹配", "心流区间"] },
          spaced: { title: "Spaced Repetition", keywords: ["遗忘曲线", "时间调度"] },
          feedback: { title: "Feedback Loop", keywords: ["错误信号", "策略更新"] }
        },
        why: {
          retrieveToSchema: "为什么：提取误差会修正图式",
          difficultyToZpd: "为什么：必要难度决定能力边界",
          feedbackToSpaced: "为什么：反馈决定下一次复习时机"
        }
      },
      comparisonTitle: "死记硬背 vs QuizAll 科学学习法",
      comparisonIntro: "传统突击记忆在短期峰值后快速衰减；QuizAll 通过 6 步循环持续激活记忆痕迹，显著减缓遗忘。",
      chartTime: "时间",
      chartRetention: "保持率",
      chartTag1: "间隔提取",
      chartTag2: "自适应回忆",
      chartTag3: "迁移复盘",
      chartLabelCramming: "传统突击",
      chartLabelMethod: "QuizAll 科学法",
      chartModeTheory: "理论预测值",
      chartModeActual: "实际用户数据",
      chartSeriesQuizall: "QuizAll 间隔提取曲线",
      chartSeriesCramming: "传统突击曲线",
      chartCalloutStep06: "Step 06 介入后，遗忘曲线斜率明显变缓。",
      chartLogLabel: "log(t)",
      chartDeltaLabel: "Δ保持率",
      chartThresholdLabel: "i+1 阈值",
      chartHoverTime: "时间",
      chartHoverQuizall: "QuizAll",
      chartHoverCramming: "传统突击",
      chartTimeUnit: "天",
      citationsTitle: "完整参考文献索引（33）",
      citationsIntro: "来源于 QuizAll Research Foundation v2 的同行评审参考文献。",
      ctaTitle: "在下一次学习中真正用上这套科学方法",
      ctaBody: "返回 QuizAll，在你的项目流程中逐步激活这 6 个科学阶段。",
      ctaPrimary: "打开考试备考工作台",
      ctaSecondary: "返回 Dashboard",
      stepLinkPrefix: "锚点 #",
      keyFindingsTitle: "关键发现",
      citationsSectionTitle: "参考文献",
      whyTitle: "为什么有效",
      whyFallback: "这一阶段通过高努力、结构化的认知加工来提升长期保持。",
      whySupportTemplate: "落地动作：步骤 {{step}} 通过「{{tagline}}」把该机制变成真实训练，而不是停留在概念层。",
      whySignalLabel: "流程已激活",
      deepDiveKicker: "上方为核心结论，点击可展开查看论文摘要级说明。",
      expandCoreConclusion: "展开核心结论",
      refsTitle: "引文",
      quoteSuffix: "关键引述",
      abstractTemplate: "这篇论文强化了「{{title}}」阶段，核心在于：{{core}} 在 QuizAll 中，这一证据被落实为「{{tagline}}」这一学习动作。",
      transitions: {
        step01: {
          text: "当大脑搭建好框架（Schema）后，下一步便是通过广度暴露注入“原材料”。",
          caption: "认知状态：脚手架已就位，输入开始高效挂接。"
        },
        step02: {
          text: "然而，仅仅看到信息是不够的。真正的神经连接发生在“输出”的瞬间，这便是主动提取的威力。",
          caption: "认知状态：暴露阶段转入高努力提取。"
        },
        step03: {
          text: "当提取把知识从记忆中拉出后，系统需要把难度推到能力边界；学习在“可达但不轻松”的区间内加速收敛。",
          caption: "认知状态：提取循环进入自适应边界调控。"
        },
        step04: {
          text: "边界训练稳定后，下一步是打破单一路径。通过多样化编码与交错练习，知识开始具备迁移能力。",
          caption: "认知状态：稳定掌握扩展为灵活迁移。"
        },
        step05: {
          text: "最终，知识要从“会做”变成“不会忘”，必须把提取分布到时间轴上，让遗忘曲线被反复重塑。",
          caption: "认知状态：迁移能力被固化为长期保持。"
        }
      },
      whyMap: {
        step01: "为什么先搭框架？因为没有结构就会超载。<span class=\"concept\">Cognitive Load</span> 会占满工作记忆，导致后续信息无处挂接。",
        step02: "为什么要先做广度暴露？因为大脑需要先建立可识别痕迹，后续提取才有可被激活的材料。",
        step03: "为什么要主动提取？因为 <span class=\"concept\">Testing Effect</span> 发生在“想起来”的过程，而不是“看见答案”的过程。",
        step04: "为什么要故意卡在边界？<span class=\"concept\">ZPD</span> 与 <span class=\"concept\">Flow</span> 的交集，才是高效学习梯度所在。",
        step05: "为什么要做变化训练？单一情境会过拟合；多样化编码才能在新问题中触发正确迁移。",
        step06: "为什么必须间隔复习？越容易想起的内容越可能快速遗忘，间隔提取才能不断重塑遗忘曲线。"
      },
      stepOverrides: {
        step01: {
          title: "预训练 / 图式激活",
          tagline: "先立结构，再填细节。",
          description: "预训练会把新信息锚定到已有认知框架，降低过载，使后续细节更容易记住与迁移。",
          keyFindings: [
            "先行组织者会先搭建脚手架，让新材料在记忆前就有可挂接的结构。",
            "工作记忆容量有限，先给结构能降低认知负荷，释放理解空间。",
            "图式建构（同化与顺应）是理解的基础设施，而不是可选项。",
            "在学习例题时进行自我解释，比被动阅读更能强化心智模型。"
          ]
        },
        step02: {
          title: "前向通读 / 广度暴露",
          tagline: "先广后深，先建立熟悉感。",
          description: "广度暴露会先形成初始记忆痕迹。此时目标不是立即完全回忆，而是为后续精炼建立可连接的材料。",
          keyFindings: [
            "当材料略高于当前能力（i+1）时，可理解输入效果最佳。",
            "概念通常需要在多种情境下反复接触，才能形成稳定长期记忆。",
            "初期浅层加工是合理第一层，它为后续深度加工创造条件。",
            "在大规模元分析证据中，分散练习持续优于集中练习。"
          ]
        },
        step03: {
          title: "反向强化 / 主动提取",
          tagline: "没有输出，就没有更新。",
          description: "测试、讲解与生成式输出会暴露错误并强化记忆通路。提取虽然更费力，但长期效果稳定优于被动复习。",
          keyFindings: [
            "测试效应表明：提取练习在延时保持上可超过重复学习。",
            "提取练习在最终学习结果上可优于概念图等常见精加工方法。",
            "主动生成答案比被动阅读同样信息产生更强记忆。",
            "“必要难度”在训练期更费力，却能带来更好的长期保持与迁移。"
          ]
        },
        step04: {
          title: "边界迭代 / 最近发展区",
          tagline: "在边界学习：不太易，也不过难。",
          description: "当挑战与能力匹配时，学习会加速。自适应难度让训练停留在高努力且可达成的增长区间。",
          keyFindings: [
            "ZPD 定义了最佳区间：学习者暂时无法独立完成，但在引导下可成功。",
            "当感知挑战与技能平衡时，Flow 状态更容易出现。",
            "自适应测评系统通过匹配题目难度来实现“边界学习”。",
            "任务太易会降低学习梯度，太难会降低收敛效率。"
          ]
        },
        step05: {
          title: "变式训练 / 迁移与泛化",
          tagline: "通过多样表征，避免过拟合。",
          description: "交错练习、情境变化和多模态表达会增强灵活提取路径，让知识超越单一练习场景。",
          keyFindings: [
            "交错练习通常主观更难，但延时表现优于分块练习。",
            "打乱题型顺序相比按块训练，后测成绩可显著提升。",
            "情境干扰会迫使再次提取，促进更深层加工。",
            "迁移适配加工表明：当学习过程匹配未来测试要求时，记忆表现更好。"
          ]
        },
        step06: {
          title: "间隔重复",
          tagline: "在递增间隔中复习，压平遗忘曲线。",
          description: "记忆会随时间衰减，但按节奏提取可重置并减缓衰减。间隔提取把时间与主动回忆结合，提升长期保持。",
          keyFindings: [
            "遗忘在早期最陡；及时提取可重置并减缓后续衰减。",
            "综合证据显示：在多种保持区间下，间隔练习显著优于突击学习。",
            "最优间隔取决于目标保持时长，并可进行定量估计。",
            "间隔提取（间隔测试）通常优于间隔重读。"
          ]
        }
      }
    },
    es: {
      pageTitle: "QuizAll Science | Base de Investigación",
      navWorkspace: "Espacio de estudio",
      navOpen: "Abrir QuizAll",
      railStage: "Etapa actual",
      stepWord: "Paso",
      kicker: "Base científica",
      heroTitle: "Una tubería de aprendizaje de 6 pasos basada en hallazgos sólidos de la ciencia cognitiva.",
      heroSummary: "QuizAll convierte evidencia revisada por pares en acciones concretas: activación de esquemas, recuperación activa, transferencia y repaso espaciado.",
      preface: "Aprender no es acumular información, sino reconstruir la cognición. La lógica de QuizAll nace de décadas de evidencia en psicología cognitiva.",
      mindmapCaption: "Vista del mapa mental: un ciclo cognitivo y seis etapas coordinadas.",
      mindmap: {
        title: "Fundación de Investigación QuizAll",
        path: "Primeros principios -> Detalles operativos",
        mece: "Arquitectura MECE de 6 pasos",
        boundaries: {
          a: { title: "Límite de entrada y codificación", subtitle: "Estructura -> Recuperación" },
          b: { title: "Límite de optimización", subtitle: "Dificultad -> ZDP" },
          c: { title: "Límite de consolidación", subtitle: "Espaciado -> Feedback" }
        },
        nodes: {
          schema: { title: "Activación de esquemas", keywords: ["Conocimiento previo", "Carga cognitiva"] },
          retrieval: { title: "Recuperación activa", keywords: ["Efecto de prueba", "Generación"] },
          difficulty: { title: "Dificultades deseables", keywords: ["Recuerdo esforzado", "Memoria durable"] },
          zpd: { title: "Calibración ZDP", keywords: ["Reto-habilidad", "Zona de flujo"] },
          spaced: { title: "Repetición espaciada", keywords: ["Curva del olvido", "Control temporal"] },
          feedback: { title: "Bucle de feedback", keywords: ["Señales de error", "Actualización"] }
        },
        why: {
          retrieveToSchema: "Por qué: los errores refinan el esquema",
          difficultyToZpd: "Por qué: la dificultad productiva calibra el límite",
          feedbackToSpaced: "Por qué: el feedback programa el siguiente repaso"
        }
      },
      comparisonTitle: "Cramming vs Método Científico QuizAll",
      comparisonIntro: "El estudio intensivo cae rápido; el método de 6 pasos reactiva huellas de memoria y ralentiza el olvido.",
      chartTime: "Tiempo",
      chartRetention: "Retención",
      chartLabelCramming: "Cramming tradicional",
      chartLabelMethod: "Método científico QuizAll",
      citationsTitle: "Índice completo de citas (33)",
      citationsIntro: "Referencias revisadas por pares de QuizAll Research Foundation v2.",
      ctaTitle: "Aplica la ciencia en tu próxima sesión",
      ctaBody: "Vuelve a QuizAll y activa cada etapa en tu flujo de estudio.",
      ctaPrimary: "Abrir espacio de preparación",
      ctaSecondary: "Volver al Dashboard",
      stepLinkPrefix: "Enlace #",
      keyFindingsTitle: "Hallazgos clave",
      citationsSectionTitle: "Citas",
      whyTitle: "El porqué",
      deepDiveKicker: "Arriba ves lo esencial. Haz clic para expandir conclusiones académicas.",
      expandCoreConclusion: "Expandir conclusión central",
      refsTitle: "Refs",
      quoteSuffix: "cita destacada",
      abstractTemplate: "Este artículo refuerza la etapa {{title}} y enfatiza: {{core}} En QuizAll, esto se aplica mediante \"{{tagline}}\".",
      stepOverrides: {
        step01: { title: "Preentrenamiento / Activación de esquemas", tagline: "Primero estructura, luego detalle.", description: "El preentrenamiento ancla información nueva en marcos existentes, reduce sobrecarga y mejora retención y transferencia." },
        step02: { title: "Pasada inicial / Exposición amplia", tagline: "Construye familiaridad con exposición rápida.", description: "La exposición amplia crea trazas iniciales; aún no busca recuerdo total, sino base para refinar con eficiencia." },
        step03: { title: "Retropropagación / Recuperación activa", tagline: "Sin salida, no hay actualización.", description: "Probar, explicar y generar respuestas revela errores y fortalece rutas de memoria para retención duradera." },
        step04: { title: "Iteración de frontera / ZDP", tagline: "Trabaja en el borde: ni fácil ni imposible.", description: "La dificultad adaptativa acelera el aprendizaje cuando el reto coincide con la habilidad." },
        step05: { title: "Entrenamiento de variabilidad / Transferencia", tagline: "Varía formatos para evitar sobreajuste.", description: "Intercalar y variar contexto fortalece rutas de recuperación flexibles y mejora transferencia." },
        step06: { title: "Repetición espaciada", tagline: "Repasa en intervalos crecientes.", description: "La recuperación programada reinicia la memoria y ralentiza el olvido a largo plazo." }
      }
    },
    fr: {
      pageTitle: "QuizAll Science | Fondation de Recherche",
      navWorkspace: "Espace d'étude",
      navOpen: "Ouvrir QuizAll",
      railStage: "Étape actuelle",
      stepWord: "Étape",
      kicker: "Fondation scientifique",
      heroTitle: "Un pipeline d'apprentissage en 6 étapes fondé sur les résultats les plus robustes de la science cognitive.",
      heroSummary: "QuizAll transforme des preuves évaluées par les pairs en actions concrètes: schéma, récupération active, transfert et répétition espacée.",
      preface: "Apprendre n'est pas accumuler l'information, mais reconstruire la cognition. QuizAll s'appuie sur des décennies de recherche empirique.",
      mindmapCaption: "Vue carte mentale : une boucle cognitive, six étapes coordonnées.",
      mindmap: {
        title: "Fondation de Recherche QuizAll",
        path: "Premiers principes -> Détails opérationnels",
        mece: "Architecture MECE en 6 étapes",
        boundaries: {
          a: { title: "Frontière entrée & encodage", subtitle: "Structure -> Récupération" },
          b: { title: "Frontière d'optimisation", subtitle: "Difficulté -> ZPD" },
          c: { title: "Frontière de consolidation", subtitle: "Espacement -> Feedback" }
        },
        nodes: {
          schema: { title: "Activation des schémas", keywords: ["Connaissances préalables", "Charge cognitive"] },
          retrieval: { title: "Récupération active", keywords: ["Effet test", "Génération"] },
          difficulty: { title: "Difficultés désirables", keywords: ["Rappel effortful", "Mémoire durable"] },
          zpd: { title: "Calibration ZPD", keywords: ["Défi-compétence", "Zone de flow"] },
          spaced: { title: "Répétition espacée", keywords: ["Courbe d'oubli", "Contrôle du timing"] },
          feedback: { title: "Boucle de feedback", keywords: ["Signaux d'erreur", "Mise à jour"] }
        },
        why: {
          retrieveToSchema: "Pourquoi: les erreurs de rappel corrigent le schéma",
          difficultyToZpd: "Pourquoi: la difficulté productive calibre la frontière",
          feedbackToSpaced: "Pourquoi: le feedback planifie la prochaine révision"
        }
      },
      comparisonTitle: "Bachotage vs Méthode scientifique QuizAll",
      comparisonIntro: "Le bachotage chute vite; la méthode QuizAll réactive les traces mnésiques et ralentit l'oubli.",
      chartTime: "Temps",
      chartRetention: "Rétention",
      chartLabelCramming: "Bachotage traditionnel",
      chartLabelMethod: "Méthode QuizAll",
      citationsTitle: "Index complet des citations (33)",
      citationsIntro: "Références évaluées par les pairs issues de QuizAll Research Foundation v2.",
      ctaTitle: "Appliquez la science à votre prochaine session",
      ctaBody: "Retournez dans QuizAll et activez les étapes dans votre projet.",
      ctaPrimary: "Ouvrir l'espace de préparation",
      ctaSecondary: "Retour au Dashboard",
      stepLinkPrefix: "Lien #",
      keyFindingsTitle: "Résultats clés",
      citationsSectionTitle: "Citations",
      whyTitle: "Le pourquoi",
      deepDiveKicker: "Les points essentiels sont ci-dessus. Cliquez pour développer les conclusions académiques.",
      expandCoreConclusion: "Développer la conclusion centrale",
      refsTitle: "Réfs",
      quoteSuffix: "citation marquante",
      abstractTemplate: "Cet article renforce l'étape {{title}} en soulignant: {{core}} Dans QuizAll, cela devient l'action \"{{tagline}}\".",
      stepOverrides: {
        step01: { title: "Pré-entraînement / Activation des schémas", tagline: "Structure d'abord, détails ensuite.", description: "Le pré-entraînement ancre l'information nouvelle dans les schémas existants et réduit la surcharge cognitive." },
        step02: { title: "Passage initial / Exposition large", tagline: "Créer une familiarité rapide et large.", description: "L'exposition large crée des traces initiales pour un raffinement plus profond ensuite." },
        step03: { title: "Rétropropagation / Récupération active", tagline: "Sans production, pas de mise à jour.", description: "Le test et la génération de réponses renforcent durablement les voies mnésiques." },
        step04: { title: "Itération de frontière / ZPD", tagline: "À la limite: ni trop facile ni trop dur.", description: "La difficulté adaptative maintient l'effort dans une zone de progression optimale." },
        step05: { title: "Variabilité / Transfert et généralisation", tagline: "Varier les représentations pour mieux transférer.", description: "L'entraînement intercalé et les contextes variés évitent le surapprentissage d'un seul format." },
        step06: { title: "Répétition espacée", tagline: "Réviser à intervalles croissants.", description: "La récupération espacée réactive la mémoire et aplatit la courbe d'oubli." }
      }
    },
    ja: {
      pageTitle: "QuizAll Science | 研究基盤",
      navWorkspace: "学習ワークスペース",
      navOpen: "QuizAll を開く",
      railStage: "現在の段階",
      stepWord: "ステップ",
      kicker: "研究基盤",
      heroTitle: "認知科学の再現性の高い知見に基づく 6 ステップ学習パイプライン。",
      heroSummary: "QuizAll は査読研究を実行可能な学習行動へ落とし込みます。",
      preface: "学習とは情報の蓄積ではなく、認知の再構築です。QuizAll の中核設計は長年の実証研究に基づいています。",
      mindmapCaption: "マインドマップ表示：1つの認知ループと6つの協調ステージ。",
      mindmap: {
        title: "QuizAll 研究基盤",
        path: "第一原理 -> 実行ディテール",
        mece: "MECE 6ステップ構造",
        boundaries: {
          a: { title: "入力・符号化境界", subtitle: "構造 -> 想起" },
          b: { title: "最適化境界", subtitle: "難度 -> ZPD" },
          c: { title: "定着境界", subtitle: "間隔 -> フィードバック" }
        },
        nodes: {
          schema: { title: "スキーマ活性化", keywords: ["既有知識", "認知負荷"] },
          retrieval: { title: "能動的想起", keywords: ["テスト効果", "生成効果"] },
          difficulty: { title: "望ましい困難", keywords: ["努力想起", "長期保持"] },
          zpd: { title: "ZPD 調整", keywords: ["課題-技能適合", "フロー領域"] },
          spaced: { title: "間隔反復", keywords: ["忘却曲線", "タイミング制御"] },
          feedback: { title: "フィードバックループ", keywords: ["誤差信号", "戦略更新"] }
        },
        why: {
          retrieveToSchema: "なぜ: 想起エラーがスキーマを修正する",
          difficultyToZpd: "なぜ: 生産的困難が境界を校正する",
          feedbackToSpaced: "なぜ: フィードバックが次回復習を決める"
        }
      },
      comparisonTitle: "詰め込み学習 vs QuizAll 科学的学習法",
      comparisonIntro: "詰め込みは急速に減衰し、QuizAll の 6 ステップは記憶痕跡を継続的に再活性化します。",
      chartTime: "時間",
      chartRetention: "保持率",
      chartLabelCramming: "従来の詰め込み",
      chartLabelMethod: "QuizAll 科学法",
      citationsTitle: "参考文献インデックス（33）",
      citationsIntro: "QuizAll Research Foundation v2 の査読文献。",
      ctaTitle: "次の学習で科学を実装する",
      ctaBody: "QuizAll に戻り、プロジェクト内で各ステップを有効化してください。",
      ctaPrimary: "試験対策ワークスペースを開く",
      ctaSecondary: "ダッシュボードへ戻る",
      stepLinkPrefix: "リンク #",
      keyFindingsTitle: "主要知見",
      citationsSectionTitle: "文献",
      whyTitle: "なぜ効くのか",
      deepDiveKicker: "上に要点があります。クリックで論文要旨レベルの説明を展開。",
      expandCoreConclusion: "コア結論を展開",
      refsTitle: "参照",
      quoteSuffix: "注目引用",
      abstractTemplate: "本論文は {{title}} 段階を支持し、次を強調します: {{core}} QuizAll ではこれを「{{tagline}}」として実装しています。",
      stepOverrides: {
        step01: { title: "事前学習 / スキーマ活性化", tagline: "先に構造、後で詳細。", description: "新情報を既存スキーマに結びつけ、認知負荷を下げます。" },
        step02: { title: "前向き通読 / 広域曝露", tagline: "広く速く触れて土台を作る。", description: "広域曝露は初期痕跡を形成し、後の深い処理を効率化します。" },
        step03: { title: "逆伝播 / 能動的想起", tagline: "出力なしに更新なし。", description: "テストと生成的出力が誤りを顕在化し、長期保持を強化します。" },
        step04: { title: "境界反復 / 発達の最近接領域", tagline: "易しすぎず難しすぎず。", description: "適応難易度により、成長境界での学習を維持します。" },
        step05: { title: "可変訓練 / 転移と一般化", tagline: "表現を変えて過学習を防ぐ。", description: "交互練習と文脈変化で柔軟な想起経路を作ります。" },
        step06: { title: "間隔反復", tagline: "間隔を広げながら復習。", description: "計画的想起が忘却を緩和し、保持を長期化します。" }
      }
    },
    ko: {
      pageTitle: "QuizAll Science | 연구 기반",
      navWorkspace: "학습 워크스페이스",
      navOpen: "QuizAll 열기",
      railStage: "현재 단계",
      stepWord: "단계",
      kicker: "연구 기반",
      heroTitle: "인지과학의 강력한 재현 연구에 기반한 6단계 학습 파이프라인.",
      heroSummary: "QuizAll은 동료심사 근거를 실제 학습 행동으로 전환합니다.",
      preface: "학습은 정보의 축적이 아니라 인지의 재구성입니다. QuizAll의 핵심 로직은 수십 년의 실증 연구에 기반합니다.",
      mindmapCaption: "마인드맵 보기: 하나의 인지 루프와 6개 협업 단계.",
      mindmap: {
        title: "QuizAll 연구 기반",
        path: "제1원리 -> 실행 디테일",
        mece: "MECE 6단계 구조",
        boundaries: {
          a: { title: "입력·인코딩 경계", subtitle: "구조 -> 회상" },
          b: { title: "최적화 경계", subtitle: "난이도 -> ZPD" },
          c: { title: "고착화 경계", subtitle: "간격 -> 피드백" }
        },
        nodes: {
          schema: { title: "스키마 활성화", keywords: ["사전지식", "인지부하"] },
          retrieval: { title: "능동 회상", keywords: ["테스팅 효과", "생성 효과"] },
          difficulty: { title: "바람직한 난이도", keywords: ["노력 회상", "장기 유지"] },
          zpd: { title: "ZPD 보정", keywords: ["도전-기술 균형", "몰입 구간"] },
          spaced: { title: "간격 반복", keywords: ["망각 곡선", "타이밍 제어"] },
          feedback: { title: "피드백 루프", keywords: ["오류 신호", "업데이트"] }
        },
        why: {
          retrieveToSchema: "왜: 회상 오류가 스키마를 수정한다",
          difficultyToZpd: "왜: 생산적 난이도가 경계를 보정한다",
          feedbackToSpaced: "왜: 피드백이 다음 복습 시점을 정한다"
        }
      },
      comparisonTitle: "벼락치기 vs QuizAll 과학 학습법",
      comparisonIntro: "벼락치기는 빠르게 감소하고, QuizAll 6단계는 기억 흔적을 반복적으로 재활성화합니다.",
      chartTime: "시간",
      chartRetention: "유지율",
      chartLabelCramming: "전통 벼락치기",
      chartLabelMethod: "QuizAll 과학법",
      citationsTitle: "전체 참고문헌 (33)",
      citationsIntro: "QuizAll Research Foundation v2의 동료심사 참고문헌입니다.",
      ctaTitle: "다음 학습 세션에서 과학을 적용하세요",
      ctaBody: "QuizAll로 돌아가 프로젝트 흐름에서 단계를 활성화하세요.",
      ctaPrimary: "시험 준비 워크스페이스 열기",
      ctaSecondary: "대시보드로 돌아가기",
      stepLinkPrefix: "링크 #",
      keyFindingsTitle: "핵심 발견",
      citationsSectionTitle: "인용",
      whyTitle: "왜 효과적인가",
      deepDiveKicker: "위에 핵심이 요약되어 있습니다. 클릭하면 학술 결론을 펼칠 수 있습니다.",
      expandCoreConclusion: "핵심 결론 펼치기",
      refsTitle: "참고",
      quoteSuffix: "핵심 인용",
      abstractTemplate: "이 논문은 {{title}} 단계를 강화하며 다음을 강조합니다: {{core}} QuizAll에서는 이를 \"{{tagline}}\"로 구현합니다.",
      stepOverrides: {
        step01: { title: "사전 학습 / 스키마 활성화", tagline: "먼저 구조, 그 다음 세부.", description: "새 정보를 기존 인지 프레임에 연결해 과부하를 줄이고 유지와 전이를 높입니다." },
        step02: { title: "포워드 패스 / 넓은 노출", tagline: "빠르고 넓게 익숙함을 만든다.", description: "넓은 노출은 초기 기억 흔적을 만들고 이후 정교화를 쉽게 합니다." },
        step03: { title: "역전파 / 능동 회상", tagline: "출력이 없으면 업데이트도 없다.", description: "테스트와 생성형 출력이 오류를 드러내고 장기 기억 경로를 강화합니다." },
        step04: { title: "경계 반복 / 근접발달영역", tagline: "너무 쉽지도 어렵지도 않게.", description: "적응 난이도가 성장 경계에서 학습 속도를 높입니다." },
        step05: { title: "변이 훈련 / 전이와 일반화", tagline: "표현을 바꿔 과적합 방지.", description: "교차 연습과 맥락 변형이 유연한 회상 경로를 만듭니다." },
        step06: { title: "간격 반복", tagline: "간격을 늘리며 복습.", description: "간격 회상이 망각 곡선을 완화하고 장기 유지력을 높입니다." }
      }
    },
    ar: {
      pageTitle: "QuizAll Science | الأساس البحثي",
      navWorkspace: "مساحة الدراسة",
      navOpen: "افتح QuizAll",
      railStage: "المرحلة الحالية",
      stepWord: "الخطوة",
      kicker: "الأساس البحثي",
      heroTitle: "مسار تعلم من 6 خطوات مبني على أكثر نتائج علم الإدراك تكرارًا.",
      heroSummary: "يحوّل QuizAll الأدلة المحكمة إلى أفعال تعلم عملية: من تفعيل المخطط إلى الاسترجاع النشط والتكرار المتباعد.",
      preface: "التعلم ليس تراكم معلومات بل إعادة بناء للإدراك. منطق QuizAll قائم على عقود من البحث التجريبي.",
      mindmapCaption: "عرض الخريطة الذهنية: حلقة معرفية واحدة وست مراحل منسقة.",
      mindmap: {
        title: "أساس QuizAll البحثي",
        path: "المبادئ الأولى -> التفاصيل التشغيلية",
        mece: "هيكل MECE من 6 خطوات",
        boundaries: {
          a: { title: "حد الإدخال والترميز", subtitle: "بنية -> استرجاع" },
          b: { title: "حد التحسين", subtitle: "صعوبة -> ZPD" },
          c: { title: "حد التثبيت", subtitle: "تباعد -> تغذية راجعة" }
        },
        nodes: {
          schema: { title: "تنشيط المخطط", keywords: ["معرفة سابقة", "حمل معرفي"] },
          retrieval: { title: "استرجاع نشط", keywords: ["أثر الاختبار", "التوليد"] },
          difficulty: { title: "صعوبات مرغوبة", keywords: ["استرجاع مجهد", "ذاكرة طويلة"] },
          zpd: { title: "معايرة ZPD", keywords: ["تحدي-مهارة", "منطقة التدفق"] },
          spaced: { title: "تكرار متباعد", keywords: ["منحنى النسيان", "ضبط التوقيت"] },
          feedback: { title: "حلقة تغذية راجعة", keywords: ["إشارات الخطأ", "تحديث"] }
        },
        why: {
          retrieveToSchema: "لماذا: أخطاء الاسترجاع تُصحّح المخطط",
          difficultyToZpd: "لماذا: الصعوبة المنتجة تضبط الحد",
          feedbackToSpaced: "لماذا: التغذية الراجعة تحدد المراجعة التالية"
        }
      },
      comparisonTitle: "الحفظ المكثف مقابل منهج QuizAll العلمي",
      comparisonIntro: "الحفظ المكثف يهبط بسرعة، بينما يعيد منهج QuizAll تنشيط آثار الذاكرة ويبطئ النسيان.",
      chartTime: "الوقت",
      chartRetention: "الاحتفاظ",
      chartLabelCramming: "الحفظ التقليدي المكثف",
      chartLabelMethod: "منهج QuizAll العلمي",
      citationsTitle: "فهرس المراجع الكامل (33)",
      citationsIntro: "مراجع محكمة من QuizAll Research Foundation v2.",
      ctaTitle: "استخدم العلم في جلستك القادمة",
      ctaBody: "ارجع إلى QuizAll وفعّل الخطوات داخل مسار مشروعك.",
      ctaPrimary: "فتح مساحة التحضير",
      ctaSecondary: "العودة إلى لوحة التحكم",
      stepLinkPrefix: "رابط #",
      keyFindingsTitle: "النتائج الرئيسية",
      citationsSectionTitle: "المراجع",
      whyTitle: "لماذا",
      deepDiveKicker: "الخلاصة الأساسية أعلاه. انقر لتوسيع الاستنتاجات الأكاديمية.",
      expandCoreConclusion: "توسيع الخلاصة الأساسية",
      refsTitle: "إحالات",
      quoteSuffix: "اقتباس بارز",
      abstractTemplate: "تعزز هذه الدراسة مرحلة {{title}} عبر التأكيد على: {{core}} وفي QuizAll يتحول ذلك إلى نمط العمل \"{{tagline}}\".",
      stepOverrides: {
        step01: { title: "التدريب المسبق / تفعيل المخطط", tagline: "ابدأ بالبنية قبل التفاصيل.", description: "يربط التدريب المسبق المعلومات الجديدة بالأطر المعرفية الموجودة ويقلل الحمل المعرفي." },
        step02: { title: "المرور الأول / التعرض الواسع", tagline: "ابنِ ألفة أولية بتعرض واسع.", description: "التعرض الواسع يخلق آثارًا أولية تسهّل المعالجة العميقة لاحقًا." },
        step03: { title: "الانتشار العكسي / الاسترجاع النشط", tagline: "لا تحديث بلا إخراج.", description: "الاختبار والتوليد يكشفان الأخطاء ويعززان المسارات الذاكرية طويلة المدى." },
        step04: { title: "تكرار الحد / منطقة النمو القريب", tagline: "على الحافة: ليس سهلًا جدًا ولا صعبًا جدًا.", description: "الصعوبة التكيفية تبقي التعلم في منطقة نمو فعالة." },
        step05: { title: "تدريب التباين / النقل والتعميم", tagline: "نوّع التمثيلات لمنع فرط التخصيص.", description: "التداخل وتغيير السياق يعززان النقل إلى مسائل جديدة." },
        step06: { title: "التكرار المتباعد", tagline: "راجِع على فترات متزايدة.", description: "الاسترجاع المجدول يعيد تنشيط الذاكرة ويبطئ منحنى النسيان." }
      }
    },
    pt: {
      pageTitle: "QuizAll Science | Base de Pesquisa",
      navWorkspace: "Espaço de estudo",
      navOpen: "Abrir QuizAll",
      railStage: "Estágio atual",
      stepWord: "Etapa",
      kicker: "Base científica",
      heroTitle: "Um pipeline de aprendizagem em 6 etapas fundamentado em evidências robustas da ciência cognitiva.",
      heroSummary: "O QuizAll transforma evidência revisada por pares em ações práticas de aprendizagem.",
      preface: "Aprender não é acumular informação, mas reconstruir a cognição. A lógica do QuizAll vem de décadas de pesquisa empírica.",
      mindmapCaption: "Visão do mapa mental: um ciclo cognitivo e seis etapas coordenadas.",
      mindmap: {
        title: "Fundação de Pesquisa QuizAll",
        path: "Primeiros princípios -> Detalhes operacionais",
        mece: "Arquitetura MECE de 6 etapas",
        boundaries: {
          a: { title: "Fronteira de entrada e codificação", subtitle: "Estrutura -> Recuperação" },
          b: { title: "Fronteira de otimização", subtitle: "Dificuldade -> ZDP" },
          c: { title: "Fronteira de consolidação", subtitle: "Espaçamento -> Feedback" }
        },
        nodes: {
          schema: { title: "Ativação de esquema", keywords: ["Conhecimento prévio", "Carga cognitiva"] },
          retrieval: { title: "Recuperação ativa", keywords: ["Efeito de teste", "Geração"] },
          difficulty: { title: "Dificuldades desejáveis", keywords: ["Recordação esforçada", "Memória durável"] },
          zpd: { title: "Calibração ZDP", keywords: ["Desafio-habilidade", "Zona de flow"] },
          spaced: { title: "Repetição espaçada", keywords: ["Curva do esquecimento", "Controle de tempo"] },
          feedback: { title: "Loop de feedback", keywords: ["Sinais de erro", "Atualização"] }
        },
        why: {
          retrieveToSchema: "Por quê: erros de recuperação refinam o esquema",
          difficultyToZpd: "Por quê: dificuldade produtiva calibra a fronteira",
          feedbackToSpaced: "Por quê: feedback agenda a próxima revisão"
        }
      },
      comparisonTitle: "Decorar de véspera vs Método Científico QuizAll",
      comparisonIntro: "A memorização de véspera cai rápido; o método do QuizAll reativa traços de memória e reduz o esquecimento.",
      chartTime: "Tempo",
      chartRetention: "Retenção",
      chartLabelCramming: "Estudo de véspera",
      chartLabelMethod: "Método QuizAll",
      citationsTitle: "Índice completo de citações (33)",
      citationsIntro: "Referências revisadas por pares do QuizAll Research Foundation v2.",
      ctaTitle: "Use a ciência na sua próxima sessão",
      ctaBody: "Volte ao QuizAll e ative as etapas no seu fluxo de estudo.",
      ctaPrimary: "Abrir espaço de preparação",
      ctaSecondary: "Voltar ao Dashboard",
      stepLinkPrefix: "Link #",
      keyFindingsTitle: "Principais achados",
      citationsSectionTitle: "Citações",
      whyTitle: "Por quê",
      deepDiveKicker: "Os pontos centrais estão acima. Clique para expandir as conclusões acadêmicas.",
      expandCoreConclusion: "Expandir conclusão central",
      refsTitle: "Refs",
      quoteSuffix: "citação de destaque",
      abstractTemplate: "Este artigo reforça a etapa {{title}} ao enfatizar: {{core}} No QuizAll, isso é aplicado no padrão \"{{tagline}}\".",
      stepOverrides: {
        step01: { title: "Pré-treinamento / Ativação de esquema", tagline: "Estrutura primeiro, detalhes depois.", description: "O pré-treinamento ancora novas informações em esquemas existentes e reduz sobrecarga cognitiva." },
        step02: { title: "Primeira passada / Exposição ampla", tagline: "Construa familiaridade com exposição rápida.", description: "A exposição ampla cria traços iniciais para refinamento profundo posterior." },
        step03: { title: "Retropropagação / Recuperação ativa", tagline: "Sem saída, sem atualização.", description: "Testar e gerar respostas fortalece caminhos de memória de longo prazo." },
        step04: { title: "Iteração de fronteira / ZDP", tagline: "No limite: nem fácil demais, nem difícil demais.", description: "Dificuldade adaptativa mantém o esforço na zona de crescimento." },
        step05: { title: "Treino de variabilidade / Transferência", tagline: "Varie representações para evitar sobreajuste.", description: "Intercalação e variação de contexto ampliam transferência e generalização." },
        step06: { title: "Repetição espaçada", tagline: "Revise em intervalos crescentes.", description: "A recuperação espaçada reduz o esquecimento e aumenta retenção duradoura." }
      }
    },
    hi: {
      pageTitle: "QuizAll Science | शोध आधार",
      navWorkspace: "स्टडी वर्कस्पेस",
      navOpen: "QuizAll खोलें",
      railStage: "वर्तमान चरण",
      stepWord: "चरण",
      kicker: "शोध आधार",
      heroTitle: "कॉग्निटिव साइंस के सबसे दोहराए गए निष्कर्षों पर आधारित 6-स्टेप लर्निंग पाइपलाइन।",
      heroSummary: "QuizAll सहकर्मी-समीक्षित शोध को वास्तविक सीखने की क्रियाओं में बदलता है।",
      preface: "सीखना सूचना जमा करना नहीं, बल्कि संज्ञान का पुनर्गठन है। QuizAll का मूल ढांचा दशकों के अनुभवजन्य शोध पर आधारित है।",
      mindmapCaption: "माइंडमैप दृश्य: एक संज्ञानात्मक लूप और छह समन्वित चरण।",
      mindmap: {
        title: "QuizAll शोध आधार",
        path: "प्रथम सिद्धांत -> कार्यान्वयन विवरण",
        mece: "MECE 6-चरण संरचना",
        boundaries: {
          a: { title: "इनपुट व एन्कोडिंग सीमा", subtitle: "संरचना -> रिकॉल" },
          b: { title: "ऑप्टिमाइज़ेशन सीमा", subtitle: "कठिनाई -> ZPD" },
          c: { title: "कंसॉलिडेशन सीमा", subtitle: "स्पेसिंग -> फीडबैक" }
        },
        nodes: {
          schema: { title: "स्कीमा सक्रियण", keywords: ["पूर्व ज्ञान", "संज्ञानात्मक भार"] },
          retrieval: { title: "सक्रिय रिकॉल", keywords: ["टेस्टिंग इफेक्ट", "जनरेशन"] },
          difficulty: { title: "Desirable Difficulties", keywords: ["प्रयासपूर्ण स्मरण", "दीर्घकालिक स्मृति"] },
          zpd: { title: "ZPD कैलिब्रेशन", keywords: ["चुनौती-कौशल संतुलन", "फ्लो ज़ोन"] },
          spaced: { title: "स्पेस्ड रिपीटिशन", keywords: ["भूलने की वक्र", "टाइमिंग नियंत्रण"] },
          feedback: { title: "फीडबैक लूप", keywords: ["त्रुटि संकेत", "रणनीति अपडेट"] }
        },
        why: {
          retrieveToSchema: "क्यों: रिकॉल त्रुटियाँ स्कीमा को सुधारती हैं",
          difficultyToZpd: "क्यों: उत्पादक कठिनाई सीमा को कैलिब्रेट करती है",
          feedbackToSpaced: "क्यों: फीडबैक अगला रिव्यू समय तय करता है"
        }
      },
      comparisonTitle: "रटकर पढ़ाई vs QuizAll वैज्ञानिक विधि",
      comparisonIntro: "रटने से याददाश्त जल्दी गिरती है; QuizAll की 6-स्टेप विधि स्मृति को बार-बार सक्रिय कर भूलने की गति घटाती है।",
      chartTime: "समय",
      chartRetention: "स्मृति धारण",
      chartLabelCramming: "पारंपरिक रटाई",
      chartLabelMethod: "QuizAll वैज्ञानिक विधि",
      citationsTitle: "पूर्ण संदर्भ सूची (33)",
      citationsIntro: "QuizAll Research Foundation v2 से सहकर्मी-समीक्षित संदर्भ।",
      ctaTitle: "अगले सत्र में विज्ञान को लागू करें",
      ctaBody: "QuizAll पर लौटें और अपने प्रोजेक्ट वर्कफ़्लो में चरण सक्रिय करें।",
      ctaPrimary: "एग्ज़ाम प्रेप वर्कस्पेस खोलें",
      ctaSecondary: "डैशबोर्ड पर वापस जाएँ",
      stepLinkPrefix: "लिंक #",
      keyFindingsTitle: "मुख्य निष्कर्ष",
      citationsSectionTitle: "संदर्भ",
      whyTitle: "क्यों काम करता है",
      deepDiveKicker: "ऊपर मुख्य निष्कर्ष हैं। विस्तृत अकादमिक निष्कर्ष खोलने के लिए क्लिक करें।",
      expandCoreConclusion: "मुख्य निष्कर्ष विस्तार करें",
      refsTitle: "रेफ़",
      quoteSuffix: "विशेष उद्धरण",
      abstractTemplate: "यह शोध {{title}} चरण को मजबूत करता है और बताता है: {{core}} QuizAll में इसे \"{{tagline}}\" क्रिया में लागू किया जाता है।",
      stepOverrides: {
        step01: { title: "प्री-ट्रेनिंग / स्कीमा सक्रियण", tagline: "पहले संरचना, फिर विवरण।", description: "प्री-ट्रेनिंग नई जानकारी को मौजूदा संज्ञानात्मक ढांचे से जोड़कर ओवरलोड घटाती है।" },
        step02: { title: "फॉरवर्ड पास / व्यापक एक्सपोज़र", tagline: "तेज़ और व्यापक संपर्क से परिचय बनाएं।", description: "व्यापक एक्सपोज़र शुरुआती मेमरी ट्रेस बनाता है जिससे बाद की गहरी प्रोसेसिंग आसान होती है।" },
        step03: { title: "बैकप्रोपेगेशन / सक्रिय रिकॉल", tagline: "आउटपुट नहीं, तो अपडेट नहीं।", description: "टेस्टिंग और उत्तर-निर्माण त्रुटियाँ दिखाते हैं और दीर्घकालिक स्मृति मार्ग मजबूत करते हैं।" },
        step04: { title: "बाउंड्री इटरेशन / ZPD", tagline: "सीमा पर सीखें: न बहुत आसान, न बहुत कठिन।", description: "एडैप्टिव कठिनाई सीखने को वृद्धि-क्षेत्र में बनाए रखती है।" },
        step05: { title: "वैरिएबिलिटी ट्रेनिंग / ट्रांसफर", tagline: "विभिन्न रूप अपनाकर ओवरफिटिंग रोकें।", description: "इंटरलीविंग और संदर्भ-परिवर्तन से ज्ञान नए प्रश्नों में ट्रांसफर होता है।" },
        step06: { title: "स्पेस्ड रिपीटिशन", tagline: "बढ़ते अंतराल पर पुनरावृत्ति करें।", description: "निर्धारित रिकॉल भूलने की रफ्तार घटाता है और दीर्घकालिक याददाश्त बढ़ाता है।" }
      }
    }
  };

  function resolveLocale(raw) {
    return normalizeLocale(raw || localStorage.getItem("locale") || (navigator.language || "en"));
  }

  function getCopy(locale) {
    var normalized = normalizeLocale(locale);
    return deepMerge(EN, PACKS[normalized] || {});
  }

  function localizeStep(step, locale) {
    var copy = getCopy(locale);
    var override = copy.stepOverrides && copy.stepOverrides[step.id] ? copy.stepOverrides[step.id] : null;
    if (!override) return Object.assign({}, step);
    return Object.assign({}, step, {
      title: override.title || step.title,
      tagline: override.tagline || step.tagline,
      description: override.description || step.description,
      keyFindings: Array.isArray(override.keyFindings) && override.keyFindings.length ? override.keyFindings.slice() : step.keyFindings,
      quote: override.quote || step.quote
    });
  }

  window.quizallScienceLocale = {
    supported: SUPPORTED.slice(),
    normalizeLocale: normalizeLocale,
    resolveLocale: resolveLocale,
    getCopy: getCopy,
    localizeStep: localizeStep
  };
})();
