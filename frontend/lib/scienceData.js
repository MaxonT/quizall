(function () {
  const steps = [
    {
      id: "step01",
      number: "01",
      title: "Pre-Training / Schema Activation",
      tagline: "Start with first principles and structure before details.",
      description:
        "Pre-training anchors new information to existing cognitive frameworks, reducing overload and making later details easier to retain and transfer.",
      keyFindings: [
        "Advance organizers create scaffolding so new material has a structure to attach to before memorization begins.",
        "Working memory is limited, so front-loading structure lowers cognitive load and frees capacity for understanding.",
        "Schema construction (assimilation and accommodation) is the infrastructure of comprehension, not an optional extra.",
        "Self-explanation while studying examples strengthens mental models more than passive reading."
      ],
      citations: [
        "Ausubel, D. P. (1960). The use of advance organizers in the learning and retention of meaningful verbal material. Journal of Educational Psychology, 51, 267–272.",
        "Ausubel, D. P. (1968). Educational Psychology: A Cognitive View. Holt, Rinehart & Winston.",
        "Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. Cognitive Science, 12(2), 257–285.",
        "Piaget, J. (1952). The Origins of Intelligence in Children. International Universities Press.",
        "Bartlett, F. C. (1932). Remembering: A Study in Experimental and Social Psychology. Cambridge University Press.",
        "Chi, M. T. H., Bassok, M., Lewis, M. W., Reimann, P., & Glaser, R. (1989). Self-explanations: How students study and use examples in learning to solve problems. Cognitive Science, 13, 145–182."
      ],
      quote:
        "The most important single factor influencing learning is what the learner already knows. Ascertain this and teach accordingly.",
      color: {
        accent: "#0f766e",
        tint: "#e6f6f3",
        darkTint: "rgba(15,118,110,0.14)"
      }
    },
    {
      id: "step02",
      number: "02",
      title: "Forward Pass / Broad Exposure",
      tagline: "Build rough familiarity through wide, fast exposure.",
      description:
        "Broad exposure creates the initial traces that deeper processing later strengthens. The goal is not full recall yet, but building enough contact for efficient refinement.",
      keyFindings: [
        "Comprehensible input works best when material is slightly above current ability (i+1).",
        "Concepts typically require repeated encounters across contexts before durable long-term retention forms.",
        "Shallow initial processing is a legitimate first layer that enables later deep processing.",
        "Distributed practice consistently outperforms massed practice across large meta-analytic evidence."
      ],
      citations: [
        "Krashen, S. (1985). The Input Hypothesis: Issues and Implications. Longman.",
        "Nation, I. S. P. (2001). Learning Vocabulary in Another Language. Cambridge University Press.",
        "Craik, F. I. M., & Lockhart, R. S. (1972). Levels of processing: A framework for memory research. Journal of Verbal Learning and Verbal Behavior, 11(6), 671–684.",
        "Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. Psychological Bulletin, 132(3), 354–380.",
        "Kintsch, W. (1988). The role of knowledge in discourse comprehension: A construction-integration model. Psychological Review, 95(2), 163–182."
      ],
      color: {
        accent: "#1d4ed8",
        tint: "#e9f0ff",
        darkTint: "rgba(29,78,216,0.16)"
      }
    },
    {
      id: "step03",
      number: "03",
      title: "Backpropagation / Active Retrieval",
      tagline: "No output, no update: retrieval drives durable learning.",
      description:
        "Testing, teaching, and generative output expose errors and strengthen memory paths. Retrieval is effortful, but it reliably outperforms passive review for long-term retention.",
      keyFindings: [
        "Testing effects show retrieval practice can outperform repeated studying for delayed retention.",
        "Retrieval practice can beat popular elaborative techniques, including concept mapping, on final learning outcomes.",
        "Generating answers produces stronger memory than passively reading the same information.",
        "Desirable difficulties feel harder during training but produce better long-term retention and transfer."
      ],
      citations: [
        "Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. Psychological Science, 17(3), 249–255.",
        "Karpicke, J. D., & Blunt, J. R. (2011). Retrieval practice produces more learning than elaborative studying with concept mapping. Science, 331(6018), 772–775.",
        "Roediger, H. L., Putnam, A. L., & Smith, M. A. (2011). Ten benefits of testing and their applications to educational practice. Psychology of Learning and Motivation, 55, 1–36.",
        "Slamecka, N. J., & Graf, P. (1978). The generation effect: Delineation of a phenomenon. Journal of Experimental Psychology: Human Learning and Memory, 4(6), 592–604.",
        "Bjork, R. A. (1994). Memory and metamemory considerations in the training of human beings. In J. Metcalfe & A. Shimamura (Eds.), Metacognition: Knowing about Knowing (pp. 185–205). MIT Press.",
        "Bjork, R. A., & Bjork, E. L. (2011). Making things hard on yourself, but in a good way. In Psychology and the Real World (pp. 56–64). Worth Publishers."
      ],
      quote:
        "Retrieval practice is one of the most effective learning strategies known to cognitive science.",
      color: {
        accent: "#b91c1c",
        tint: "#fdecec",
        darkTint: "rgba(185,28,28,0.16)"
      }
    },
    {
      id: "step04",
      number: "04",
      title: "Boundary Iteration / Zone of Proximal Development",
      tagline: "Operate at the edge: not too easy, not too hard.",
      description:
        "Learning accelerates when challenge matches ability. Adaptive difficulty keeps work in the growth zone where effort is high but success remains achievable.",
      keyFindings: [
        "ZPD defines the optimal range where learners cannot yet perform alone but can succeed with guidance.",
        "Flow states emerge when perceived challenge and skill are balanced.",
        "Adaptive testing systems operationalize boundary learning by targeting item difficulty to current ability.",
        "Too-easy tasks reduce gradient; too-hard tasks reduce convergence."
      ],
      citations: [
        "Vygotsky, L. S. (1978). Mind in Society: The Development of Higher Psychological Processes. Harvard University Press, p. 86.",
        "Csikszentmihalyi, M. (1990). Flow: The Psychology of Optimal Experience. Harper & Row.",
        "Wainer, H. (Ed.) (2000). Computerized Adaptive Testing: A Primer (2nd ed.). Lawrence Erlbaum.",
        "Lord, F. M. (1980). Applications of Item Response Theory to Practical Testing Problems. Lawrence Erlbaum.",
        "Embretson, S. E., & Reise, S. P. (2000). Item Response Theory for Psychologists. Lawrence Erlbaum."
      ],
      color: {
        accent: "#7c3aed",
        tint: "#f2ecff",
        darkTint: "rgba(124,58,237,0.18)"
      }
    },
    {
      id: "step05",
      number: "05",
      title: "Variability Training / Transfer & Generalization",
      tagline: "Vary representations to prevent overfitting and improve transfer.",
      description:
        "Interleaving, contextual variation, and multiple formats strengthen flexible retrieval routes so knowledge transfers beyond the exact practice context.",
      keyFindings: [
        "Interleaved practice often feels harder but improves delayed performance versus blocked practice.",
        "Shuffled problem formats can dramatically improve later test results compared with blocked sets.",
        "Contextual interference forces re-retrieval and supports deeper processing.",
        "Transfer-appropriate processing shows memory improves when learning processes match future test demands."
      ],
      citations: [
        "Kornell, N., & Bjork, R. A. (2008). Learning concepts and categories: Is spacing the “enemy of induction”? Psychological Science, 19(6), 585–592.",
        "Rohrer, D., & Taylor, K. (2007). The shuffling of mathematics problems improves learning. Instructional Science, 35(6), 481–498.",
        "Schmidt, R. A., & Bjork, R. A. (1992). New conceptualizations of practice: Common principles in three paradigms suggest new concepts for training. Psychological Science, 3(4), 207–217.",
        "Morris, C. D., Bransford, J. D., & Franks, J. J. (1977). Levels of processing versus transfer appropriate processing. Journal of Verbal Learning and Verbal Behavior, 16(5), 519–533.",
        "Vlach, H. A., & Sandhofer, C. M. (2012). Distributing learning over time: The spacing effect in children’s acquisition and generalization of science concepts. Child Development, 83(4), 1137–1144."
      ],
      color: {
        accent: "#b45309",
        tint: "#fff3e8",
        darkTint: "rgba(180,83,9,0.16)"
      }
    },
    {
      id: "step06",
      number: "06",
      title: "Spaced Repetition",
      tagline: "Review at expanding intervals to beat forgetting.",
      description:
        "Memory decays after learning, but scheduled retrieval resets and flattens that decay. Spaced retrieval combines timing and active recall for maximal long-term retention.",
      keyFindings: [
        "Forgetting is steep early; timely retrieval resets and slows subsequent decay.",
        "Large syntheses show spaced practice strongly outperforms cramming across retention intervals.",
        "Optimal spacing depends on target retention horizon and can be estimated quantitatively.",
        "Spaced retrieval (testing at intervals) outperforms spaced restudy."
      ],
      citations: [
        "Ebbinghaus, H. (1885/1913). Über das Gedächtnis (Memory: A Contribution to Experimental Psychology). Teachers College, Columbia University.",
        "Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. Psychological Bulletin, 132(3), 354–380.",
        "Cepeda, N. J., Vul, E., Rohrer, D., Wixted, J. T., & Pashler, H. (2008). Spacing effects in learning: A temporal ridgeline of optimal retention. Psychological Science, 19(11), 1095–1102.",
        "Bahrick, H. P., Bahrick, L. E., Bahrick, A. S., & Bahrick, P. O. (1993). Maintenance of foreign language vocabulary and the spacing effect. Psychological Science, 4(5), 316–321.",
        "Wozniak, P. A., & Gorzelańczyk, E. J. (1994). Optimization of repetition spacing in the practice of learning. Acta Neurobiologiae Experimentalis, 54, 59–68.",
        "Karpicke, J. D., & Bauernschmidt, A. (2011). Spaced retrieval: Absolute spacing enhances learning regardless of relative spacing. Journal of Experimental Psychology: Learning, Memory, and Cognition, 37(5), 1250–1257."
      ],
      color: {
        accent: "#047857",
        tint: "#e8f8f1",
        darkTint: "rgba(4,120,87,0.16)"
      }
    }
  ];

  const fullCitations = [
    "Ausubel, D. P. (1960). The use of advance organizers in the learning and retention of meaningful verbal material. Journal of Educational Psychology, 51, 267–272.",
    "Ausubel, D. P. (1968). Educational Psychology: A Cognitive View. Holt, Rinehart & Winston.",
    "Bahrick, H. P., Bahrick, L. E., Bahrick, A. S., & Bahrick, P. O. (1993). Maintenance of foreign language vocabulary and the spacing effect. Psychological Science, 4(5), 316–321.",
    "Bartlett, F. C. (1932). Remembering: A Study in Experimental and Social Psychology. Cambridge University Press.",
    "Bjork, R. A. (1994). Memory and metamemory considerations in the training of human beings. In Metacognition: Knowing about Knowing (pp. 185–205). MIT Press.",
    "Bjork, R. A., & Bjork, E. L. (2011). Making things hard on yourself, but in a good way. In Psychology and the Real World (pp. 56–64). Worth Publishers.",
    "Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks. Psychological Bulletin, 132(3), 354–380.",
    "Cepeda, N. J., Vul, E., Rohrer, D., Wixted, J. T., & Pashler, H. (2008). Spacing effects in learning: A temporal ridgeline of optimal retention. Psychological Science, 19(11), 1095–1102.",
    "Chi, M. T. H., et al. (1989). Self-explanations: How students study and use examples in learning to solve problems. Cognitive Science, 13, 145–182.",
    "Craik, F. I. M., & Lockhart, R. S. (1972). Levels of processing. Journal of Verbal Learning and Verbal Behavior, 11(6), 671–684.",
    "Csikszentmihalyi, M. (1990). Flow: The Psychology of Optimal Experience. Harper & Row.",
    "Dempster, F. N. (1988). The spacing effect: A case study in the failure to apply the results of psychological research. American Psychologist, 43(8), 627–634.",
    "Ebbinghaus, H. (1885/1913). Memory: A Contribution to Experimental Psychology. Teachers College, Columbia University.",
    "Embretson, S. E., & Reise, S. P. (2000). Item Response Theory for Psychologists. Lawrence Erlbaum.",
    "Karpicke, J. D., & Bauernschmidt, A. (2011). Spaced retrieval. JEPLMC, 37(5), 1250–1257.",
    "Karpicke, J. D., & Blunt, J. R. (2011). Retrieval practice produces more learning than concept mapping. Science, 331(6018), 772–775.",
    "Kintsch, W. (1988). The role of knowledge in discourse comprehension. Psychological Review, 95(2), 163–182.",
    "Kornell, N., & Bjork, R. A. (2008). Learning concepts and categories: Is spacing the “enemy of induction”? Psychological Science, 19(6), 585–592.",
    "Krashen, S. (1985). The Input Hypothesis: Issues and Implications. Longman.",
    "Lord, F. M. (1980). Applications of Item Response Theory to Practical Testing Problems. Lawrence Erlbaum.",
    "Morris, C. D., Bransford, J. D., & Franks, J. J. (1977). Transfer appropriate processing. JVLVB, 16(5), 519–533.",
    "Nation, I. S. P. (2001). Learning Vocabulary in Another Language. Cambridge University Press.",
    "Piaget, J. (1952). The Origins of Intelligence in Children. International Universities Press.",
    "Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning. Psychological Science, 17(3), 249–255.",
    "Roediger, H. L., Putnam, A. L., & Smith, M. A. (2011). Ten benefits of testing. Psychology of Learning and Motivation, 55, 1–36.",
    "Rohrer, D., & Taylor, K. (2007). The shuffling of mathematics problems improves learning. Instructional Science, 35(6), 481–498.",
    "Schmidt, R. A., & Bjork, R. A. (1992). New conceptualizations of practice. Psychological Science, 3(4), 207–217.",
    "Slamecka, N. J., & Graf, P. (1978). The generation effect. JEPLHM, 4(6), 592–604.",
    "Sweller, J. (1988). Cognitive load during problem solving. Cognitive Science, 12(2), 257–285.",
    "Vlach, H. A., & Sandhofer, C. M. (2012). Spacing effect in children’s generalization of science concepts. Child Development, 83(4), 1137–1144.",
    "Vygotsky, L. S. (1978). Mind in Society. Harvard University Press.",
    "Wainer, H. (Ed.) (2000). Computerized Adaptive Testing: A Primer (2nd ed.). Lawrence Erlbaum.",
    "Wozniak, P. A., & Gorzelańczyk, E. J. (1994). Optimization of repetition spacing. Acta Neurobiologiae Experimentalis, 54, 59–68."
  ];

  const journals = [
    "Science",
    "Psychological Science",
    "Psychological Bulletin",
    "Psychological Review",
    "Cognitive Science",
    "Journal of Experimental Psychology"
  ];

  function getStepById(stepId) {
    return steps.find(function (step) {
      return step.id === stepId;
    }) || null;
  }

  function getStepByNumber(stepNumber) {
    const normalized = String(stepNumber).replace(/[^0-9]/g, "").padStart(2, "0");
    return steps.find(function (step) {
      return step.number === normalized;
    }) || null;
  }

  window.quizallScienceData = {
    version: "research-foundation-v2",
    steps: steps,
    fullCitations: fullCitations,
    journals: journals,
    getStepById: getStepById,
    getStepByNumber: getStepByNumber
  };
})();
