/**
 * QuizAllDataAggregator - Smart Data Collection System
 * 
 * Collects data from all 3 layers of the QuizAll UI:
 * - Layer 1 (Magic Mode): Task description, model selection, context
 * - Layer 2 (Blueprint sync): Instructions, examples, constraints
 * - Layer 3 (Expert lab): Dataset snippets, schema templates, optimization knobs
 * 
 * Features:
 * - Validates required fields
 * - Only includes Layer 2/3 data if panels are open and filled
 * - Provides user-facing summary of what data is being sent
 * - Parses YAML-like expert settings from Layer 3
 * - Adds metadata tracking for debugging
 */

class QuizAllDataAggregator {
  constructor() {
    this.data = {
      layer1: {},
      layer2: {},
      layer3: {},
      _meta: {
        layer2Used: false,
        layer3Used: false,
        timestamp: null,
        version: '0.6.8.3'
      }
    };
  }

  /**
   * Collect data from all layers
   * @returns {Object} The collected data
   */
  collect() {
    this._collectLayer1();
    this._collectLayer2();
    this._collectLayer3();
    this.data._meta.timestamp = new Date().toISOString();
    return this.data;
  }

  /**
   * Collect Layer 1 (Magic Mode) data
   */
  _collectLayer1() {
    // Task description
    const taskEl = document.getElementById('task');
    this.data.layer1.task = taskEl?.value?.trim() || '';

    // Model selection - check for model-select__name element first
    const modelNameEl = document.querySelector('.model-select__name');
    let model = 'fast'; // Default

    if (modelNameEl) {
      // Direct reading from data attribute would be safer, but current UI structure 
      // puts the value in sessionStorage or state.
      // We'll trust the sessionStorage as primary source of truth for the 'slug'
    }

    // Also check sessionStorage for model selection
    const storedModel = sessionStorage.getItem('quizall:model-selection');
    if (storedModel) {
      model = storedModel;
    }

    this.data.layer1.model = model;

    // Context/examples (optional)
    const examplesEl = document.getElementById('examples');
    this.data.layer1.examples = examplesEl?.value?.trim() || '';
  }

  /**
   * Collect Layer 2 (Blueprint sync) data
   */
  _collectLayer2() {
    const advancedPanel = document.getElementById('advancedPanel');
    const isPanelOpen = advancedPanel?.classList.contains('layer-panel--open');

    // Check if panel is open and has any content
    const instructionsEl = document.getElementById('blueprintInstructions');
    const examplesEl = document.getElementById('blueprintExamples');
    const constraintsEl = document.getElementById('blueprintConstraints');

    const instructions = instructionsEl?.value?.trim() || '';
    const examples = examplesEl?.value?.trim() || '';
    const constraints = constraintsEl?.value?.trim() || '';

    const hasContent = instructions || examples || constraints;

    if (isPanelOpen && hasContent) {
      this.data.layer2 = {
        instructions,
        examples,
        constraints
      };
      this.data._meta.layer2Used = true;
    } else {
      this.data.layer2 = {};
      this.data._meta.layer2Used = false;
    }
  }

  /**
   * Collect Layer 3 (Expert lab) data
   */
  _collectLayer3() {
    const expertPanel = document.getElementById('expertPanel');
    const isPanelOpen = expertPanel?.classList.contains('layer-panel--open');

    // Get all textareas in the expert panel
    const textareas = expertPanel?.querySelectorAll('textarea') || [];
    let datasetSnippets = '';
    let schemaTemplate = '';
    let optimizationKnobs = '';

    // Extract content from each textarea based on their parent details
    textareas.forEach((textarea) => {
      const parentDetails = textarea.closest('details');
      const summary = parentDetails?.querySelector('summary')?.textContent?.toLowerCase() || '';
      const content = textarea.value?.trim() || '';

      if (summary.includes('dataset') || summary.includes('pos') || summary.includes('neg')) {
        datasetSnippets = content;
      } else if (summary.includes('schema') || summary.includes('template')) {
        schemaTemplate = content;
      } else if (summary.includes('optimization') || summary.includes('knobs')) {
        optimizationKnobs = content;
      }
    });

    const hasContent = datasetSnippets || schemaTemplate || optimizationKnobs;

    if (isPanelOpen && hasContent) {
      this.data.layer3 = {
        datasetSnippets,
        schemaTemplate,
        optimizationKnobs: this._parseYamlLikeSettings(optimizationKnobs)
      };
      this.data._meta.layer3Used = true;
    } else {
      this.data.layer3 = {};
      this.data._meta.layer3Used = false;
    }
  }

  /**
   * Parse YAML-like settings from Layer 3 optimization knobs
   * @param {string} text - YAML-like text to parse
   * @returns {Object} Parsed settings object
   */
  _parseYamlLikeSettings(text) {
    if (!text) return {};

    const result = {};
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) continue;

      const key = trimmed.slice(0, colonIndex).trim();
      let value = trimmed.slice(colonIndex + 1).trim();

      // Parse value types
      if (value.startsWith('[') && value.endsWith(']')) {
        // Array
        try {
          value = JSON.parse(value.replace(/'/g, '"'));
        } catch {
          value = value.slice(1, -1).split(',').map(v => v.trim().replace(/['"]/g, ''));
        }
      } else if (value === 'true') {
        value = true;
      } else if (value === 'false') {
        value = false;
      } else if (value !== '' && !isNaN(parseFloat(value)) && isFinite(Number(value))) {
        // Robust numeric check: not empty, parseable as float, and finite
        value = Number(value);
      }

      result[key] = value;
    }

    return result;
  }

  /**
   * Validate the collected data
   * @returns {Object} Validation result with isValid and errors
   */
  validate() {
    const errors = [];

    // Required: Layer 1 task
    if (!this.data.layer1.task) {
      errors.push('Layer 1: Task description is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Transform collected data to API payload format
   * @returns {Object} API-ready payload
   */
  toAPI() {
    const payload = {
      task: this.data.layer1.task,
      model: this.data.layer1.model,
      n: 4, // Default number of candidates
      _meta: this.data._meta
    };

    // Include Layer 1 examples if provided
    if (this.data.layer1.examples) {
      payload.examples = this.data.layer1.examples;
    }

    // Include Layer 2 data if used
    if (this.data._meta.layer2Used) {
      if (this.data.layer2.instructions) {
        payload.input = this.data.layer2.instructions;
      }
      if (this.data.layer2.examples) {
        payload.style = this.data.layer2.examples;
      }
      if (this.data.layer2.constraints) {
        payload.constraints = this.data.layer2.constraints;
      }
    }

    // Include Layer 3 data if used
    if (this.data._meta.layer3Used) {
      if (this.data.layer3.datasetSnippets) {
        payload.dataset = this.data.layer3.datasetSnippets;
      }
      if (this.data.layer3.schemaTemplate) {
        payload.schema = this.data.layer3.schemaTemplate;
      }
      if (this.data.layer3.optimizationKnobs) {
        // Merge optimization knobs into payload
        const knobs = this.data.layer3.optimizationKnobs;
        if (knobs.candidates) payload.n = knobs.candidates;
        if (knobs.tests) payload.tests = { from: knobs.tests };
        if (knobs.temperature) payload.temperature = knobs.temperature;
      }
    }

    return payload;
  }

  /**
   * Get a user-friendly summary of collected data
   * @returns {Object} Summary with counts and descriptions
   */
  getSummary() {
    const summary = {
      layer1: {
        hasTask: !!this.data.layer1.task,
        taskLength: this.data.layer1.task?.length || 0,
        model: this.data.layer1.model,
        hasExamples: !!this.data.layer1.examples
      },
      layer2: {
        used: this.data._meta.layer2Used,
        hasInstructions: !!this.data.layer2?.instructions,
        hasExamples: !!this.data.layer2?.examples,
        hasConstraints: !!this.data.layer2?.constraints
      },
      layer3: {
        used: this.data._meta.layer3Used,
        hasDataset: !!this.data.layer3?.datasetSnippets,
        hasSchema: !!this.data.layer3?.schemaTemplate,
        hasKnobs: Object.keys(this.data.layer3?.optimizationKnobs || {}).length > 0
      }
    };

    // Generate human-readable description
    const parts = [];
    parts.push(`Task: ${summary.layer1.taskLength} chars`);
    parts.push(`Model: ${summary.layer1.model}`);

    if (summary.layer2.used) {
      const layer2Parts = [];
      if (summary.layer2.hasInstructions) layer2Parts.push('instructions');
      if (summary.layer2.hasExamples) layer2Parts.push('examples');
      if (summary.layer2.hasConstraints) layer2Parts.push('constraints');
      parts.push(`Blueprint: ${layer2Parts.join(', ')}`);
    }

    if (summary.layer3.used) {
      const layer3Parts = [];
      if (summary.layer3.hasDataset) layer3Parts.push('dataset');
      if (summary.layer3.hasSchema) layer3Parts.push('schema');
      if (summary.layer3.hasKnobs) layer3Parts.push('knobs');
      parts.push(`Expert: ${layer3Parts.join(', ')}`);
    }

    summary.description = parts.join(' | ');
    return summary;
  }
}

// Export for both module and global use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { QuizAllDataAggregator };
}
if (typeof window !== 'undefined') {
  window.QuizAllDataAggregator = QuizAllDataAggregator;
}
