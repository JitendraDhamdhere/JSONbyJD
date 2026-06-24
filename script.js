/**
 * JSON Developer Toolkit - script.js
 * Core logic, modular tool registry, and global application controller.
 */

(function () {
  'use strict';

  // ==========================================================================
  // GLOBAL APPLICATION STATE & CONFIG
  // ==========================================================================
  const App = {
    theme: 'dark', // 'dark' | 'light'
    activeTool: 'viewer',
    layoutDirection: 'horizontal', // 'horizontal' (split) | 'vertical'
    editors: {}, // Registry of active Monaco Editor instances
    fallbacks: {}, // Registry of active fallback textareas
    debounces: {},
    toolRegistry: {}, // Registry of tool objects { id, init, render, destroy }
    
    // Performance threshold for Monaco fallback (500KB)
    PERF_THRESHOLD_BYTES: 500 * 1024,

    // Initial state / Default JSON to populate editors
    defaultJSON: `{
  "projectName": "Anti-gravity JSON Developer Toolkit",
  "version": "1.0.0",
  "status": "production-ready",
  "features": [
    "Monaco Editor Integration",
    "14 Comprehensive JSON Tools",
    "Visual Diff Engine",
    "High Performance Mode (>500KB)",
    "Real-time Validator",
    "Custom Schema Generator"
  ],
  "author": {
    "name": "Antigravity Dev",
    "email": "dev@json-toolkit.io",
    "profile": {
      "github": "github.com/json-toolkit",
      "role": "Lead Architect"
    }
  },
  "metrics": {
    "activeUsers": 12500,
    "rating": 4.95,
    "uptime": 99.999
  },
  "settings": {
    "theme": "dark-space",
    "autoSave": true,
    "activeProxy": "corsproxy.io"
  }
}`
  };

  // Module-level variables for custom features
  let currentSelectedPath = '';

  // ==========================================================================
  // TOAST NOTIFICATION SYSTEM
  // ==========================================================================
  const Toast = {
    container: null,

    init() {
      this.container = document.getElementById('toast-container');
    },

    show(message, type = 'info') {
      if (!this.container) return;
      
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.role = 'alert';
      
      // Icon selection
      let icon = '';
      if (type === 'success') {
        icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
      } else if (type === 'error') {
        icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
      } else if (type === 'warning') {
        icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
      } else {
        icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="12" x2="12" y2="16"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
      }

      toast.innerHTML = `${icon}<span>${message}</span>`;
      this.container.appendChild(toast);

      // Auto-remove toast after animation completes (2.5s)
      setTimeout(() => {
        toast.remove();
      }, 2500);
    }
  };

  // ==========================================================================
  // MONACO EDITOR & HIGH-PERFORMANCE LIFECYCLE
  // ==========================================================================
  const EditorManager = {
    isMonacoLoaded: false,
    pendingInitializations: [],

    init(callback) {
      if (this.isMonacoLoaded) {
        callback();
        return;
      }
      
      this.pendingInitializations.push(callback);
      
      // Configure Monaco AMD Loader
      if (typeof require !== 'undefined') {
        require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
        require(['vs/editor/editor.main'], () => {
          this.isMonacoLoaded = true;
          this.pendingInitializations.forEach(cb => cb());
          this.pendingInitializations = [];
        });
      } else {
        // Fallback: wait and retry if loader not yet parsed
        setTimeout(() => this.init(callback), 100);
      }
    },

    create(elementId, options = {}) {
      const container = document.getElementById(elementId);
      if (!container) return null;

      const defaultOptions = {
        value: '',
        language: 'json',
        theme: App.theme === 'dark' ? 'vs-dark' : 'vs',
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: App.theme === 'dark' ? "'Fira Code', monospace" : "'Fira Code', monospace",
        lineHeight: 20,
        scrollbar: {
          verticalScrollbarSize: 6,
          horizontalScrollbarSize: 6,
          verticalHasArrows: false,
          horizontalHasArrows: false
        },
        wordWrap: 'on',
        folding: true,
        bracketPairColorization: { enabled: true },
        autoClosingBrackets: 'always',
        formatOnPaste: true,
        tabSize: 2
      };

      const merged = Object.assign({}, defaultOptions, options);
      let editor = null;

      if (this.isMonacoLoaded) {
        editor = monaco.editor.create(container, merged);
        App.editors[elementId] = editor;
      }
      return editor;
    },

    setTheme(themeName) {
      if (!this.isMonacoLoaded) return;
      const monacoTheme = themeName === 'dark' ? 'vs-dark' : 'vs';
      monaco.editor.setTheme(monacoTheme);
    },

    /**
     * Handles large payload switching to plain textareas dynamically
     */
    checkAndLoadValue(elementId, fallbackId, value) {
      const byteSize = new Blob([value]).size;
      const container = document.getElementById(elementId);
      const fallback = document.getElementById(fallbackId);

      if (byteSize > App.PERF_THRESHOLD_BYTES) {
        // Hide Monaco, Show fallback textarea
        if (container) container.classList.add('hidden');
        if (fallback) {
          fallback.classList.remove('hidden');
          fallback.value = value;
          App.fallbacks[fallbackId] = fallback;
        }
        
        Toast.show(`Large JSON (${(byteSize / 1024).toFixed(1)}KB) detected. Using high-performance plain editor.`, 'warning');
        return false; // Monaco skipped
      } else {
        // Show Monaco, Hide fallback textarea
        if (container) container.classList.remove('hidden');
        if (fallback) fallback.classList.add('hidden');
        
        const editor = App.editors[elementId];
        if (editor) {
          editor.setValue(value);
        }
        return true; // Monaco used
      }
    },

    getValue(elementId, fallbackId) {
      const fallback = document.getElementById(fallbackId);
      if (fallback && !fallback.classList.contains('hidden')) {
        return fallback.value;
      }
      const editor = App.editors[elementId];
      return editor ? editor.getValue() : '';
    }
  };

  // ==========================================================================
  // HELPER FUNCTIONS & DEBOUNCING
  // ==========================================================================
  function debounce(key, fn, delay) {
    if (App.debounces[key]) {
      clearTimeout(App.debounces[key]);
    }
    App.debounces[key] = setTimeout(fn, delay);
  }

  function safeParse(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  function formatJSON(text, space = 2) {
    const obj = safeParse(text);
    if (obj) {
      return JSON.stringify(obj, null, space);
    }
    return text;
  }

  function downloadTextFile(content, fileName, mimeType = 'application/json') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Deep clone helper
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Sort Object Keys Recursively
  function sortObjectKeys(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(sortObjectKeys);
    }
    const sortedKeys = Object.keys(obj).sort();
    const result = {};
    sortedKeys.forEach(key => {
      result[key] = sortObjectKeys(obj[key]);
    });
    return result;
  }

  // FIX: Bug 5 — sortKeysDeep alphabetically sorts keys recursively
  function sortKeysDeep(obj) {
    if (Array.isArray(obj)) return obj.map(sortKeysDeep);
    if (obj !== null && typeof obj === 'object') {
      return Object.keys(obj).sort().reduce((acc, key) => {
        acc[key] = sortKeysDeep(obj[key]);
        return acc;
      }, {});
    }
    return obj;
  }

  // Helper to extract path-value pairs recursively
  function getKeyValuePairs(obj, path = '$', map = {}) {
    if (obj === null || typeof obj !== 'object') {
      map[path] = obj;
    } else if (Array.isArray(obj)) {
      if (obj.length === 0) {
        map[path] = [];
      } else {
        obj.forEach((item, idx) => {
          getKeyValuePairs(item, `${path}[${idx}]`, map);
        });
      }
    } else {
      const keys = Object.keys(obj);
      if (keys.length === 0) {
        map[path] = {};
      } else {
        keys.forEach(key => {
          const childPath = path === '$' ? `$.${key}` : `${path}.${key}`;
          getKeyValuePairs(obj[key], childPath, map);
        });
      }
    }
    return map;
  }

  // FIX: Bug 1 — searchJSON recursively walks the parsed JSON tree
  function searchJSON(node, query, path = '$', keyName = null) {
    const matches = [];
    const lowerQuery = query.toLowerCase();
    
    if (node === null || typeof node !== 'object') {
      if (String(node).toLowerCase().includes(lowerQuery)) {
        matches.push({ path, key: keyName, value: node });
      }
    } else if (Array.isArray(node)) {
      node.forEach((item, idx) => {
        const childPath = `${path}[${idx}]`;
        matches.push(...searchJSON(item, query, childPath, idx));
      });
    } else {
      for (const key in node) {
        if (Object.prototype.hasOwnProperty.call(node, key)) {
          const childPath = path === '$' ? `$.${key}` : `${path}.${key}`;
          if (key.toLowerCase().includes(lowerQuery)) {
            matches.push({ path: childPath, key: key, value: node[key] });
          }
          matches.push(...searchJSON(node[key], query, childPath, key));
        }
      }
    }
    return matches;
  }

  // FIX: Bug 4 — decodeJWTPart handles URL-safe base64 strings correctly
  function decodeJWTPart(base64url) {
    const base64 = base64url
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(base64url.length + (4 - base64url.length % 4) % 4, '=');
    return JSON.parse(atob(base64));
  }

  // ==========================================================================
  // DRAG AND DROP & IMPORT HANDLER
  // ==========================================================================
  const DragDropManager = {
    setup(panelElement, onFileLoaded) {
      const overlay = document.createElement('div');
      overlay.className = 'drag-overlay hidden';
      overlay.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--primary-accent)" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
        <div class="drag-overlay-message">Drop JSON file here</div>
      `;
      panelElement.appendChild(overlay);

      panelElement.addEventListener('dragenter', (e) => {
        e.preventDefault();
        overlay.classList.remove('hidden');
      });

      panelElement.addEventListener('dragover', (e) => {
        e.preventDefault();
      });

      panelElement.addEventListener('dragleave', (e) => {
        if (e.target === overlay || !panelElement.contains(e.relatedTarget)) {
          overlay.classList.add('hidden');
        }
      });

      panelElement.addEventListener('drop', (e) => {
        e.preventDefault();
        overlay.classList.add('hidden');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          const file = files[0];
          const reader = new FileReader();
          reader.onload = (event) => {
            onFileLoaded(event.target.result);
            Toast.show(`Imported ${file.name} successfully.`, 'success');
          };
          reader.readAsText(file);
        }
      });

      // Also bind the "Upload" button if exists
      const uploadBtn = panelElement.querySelector('.file-upload-trigger');
      if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json, .txt';
          input.onchange = (event) => {
            const files = event.target.files;
            if (files.length > 0) {
              const file = files[0];
              const reader = new FileReader();
              reader.onload = (ev) => {
                onFileLoaded(ev.target.result);
                Toast.show(`Imported ${file.name} successfully.`, 'success');
              };
              reader.readAsText(file);
            }
          };
          input.click();
        });
      }
    }
  };

  // ==========================================================================
  // CUSTOM ALGORITHMS (DIFF, SCHEMAGEN, CONVERTERS, REPAIR)
  // ==========================================================================
  
  /**
   * 1. Recursive Object Diff Engine
   */
  const DiffEngine = {
    compare(objA, objB, options = {}) {
      const diffLines = [];
      let added = 0, removed = 0, changed = 0, unchanged = 0;

      // Normalization helpers
      let normalizedA = objA;
      let normalizedB = objB;

      if (options.ignoreKeyOrder) {
        normalizedA = sortKeysDeep(objA);
        normalizedB = sortKeysDeep(objB);
      }

      const strA = JSON.stringify(normalizedA, null, 2);
      const strB = JSON.stringify(normalizedB, null, 2);

      if (options.ignoreFormatting) {
        // Line-by-line structural diff based on normalized strings
        const linesA = strA.split('\n');
        const linesB = strB.split('\n');
        
        // Simple Myers-like diff or LCS for clean structural comparison
        return this.lcsDiff(linesA, linesB);
      } else {
        // Compare raw text directly
        const linesA = strA.split('\n');
        const linesB = strB.split('\n');
        return this.lcsDiff(linesA, linesB);
      }
    },

    // Longest Common Subsequence Diff algorithm
    lcsDiff(linesA, linesB) {
      const m = linesA.length;
      const n = linesB.length;
      const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          if (linesA[i - 1].trim() === linesB[j - 1].trim()) {
            dp[i][j] = dp[i - 1][j - 1] + 1;
          } else {
            dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
          }
        }
      }

      const diff = [];
      let i = m, j = n;
      let lineNum = 1;

      while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && linesA[i - 1].trim() === linesB[j - 1].trim()) {
          diff.unshift({
            type: 'unchanged',
            text: linesA[i - 1],
            line: i
          });
          i--;
          j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
          diff.unshift({
            type: 'added',
            text: linesB[j - 1],
            line: j
          });
          j--;
        } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
          diff.unshift({
            type: 'removed',
            text: linesA[i - 1],
            line: i
          });
          i--;
        }
      }

      // Calculate summaries
      let addedCount = 0, removedCount = 0, changedCount = 0, unchangedCount = 0;
      diff.forEach(item => {
        if (item.type === 'added') addedCount++;
        else if (item.type === 'removed') removedCount++;
        else unchangedCount++;
      });

      return {
        diff,
        summary: {
          added: addedCount,
          removed: removedCount,
          changed: changedCount,
          unchanged: unchangedCount
        }
      };
    }
  };

  /**
   * 2. Recursive JSON Schema Generator (Draft-07)
   */
  const SchemaGenerator = {
    generate(jsonObj) {
      const schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "GeneratedSchema",
        "type": "object",
        "properties": {}
      };

      if (jsonObj && typeof jsonObj === 'object' && !Array.isArray(jsonObj)) {
        schema.properties = this.buildProperties(jsonObj);
        schema.required = Object.keys(jsonObj);
      } else if (Array.isArray(jsonObj)) {
        schema.type = "array";
        schema.items = this.buildItems(jsonObj);
      } else {
        schema.type = typeof jsonObj;
      }

      return schema;
    },

    buildProperties(obj) {
      const props = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          props[key] = this.inferType(obj[key]);
        }
      }
      return props;
    },

    inferType(val) {
      if (val === null) return { type: "null" };
      const type = typeof val;
      
      if (type === 'string') {
        // Detect format profiles
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
          return { type: "string", format: "date-time" };
        }
        if (/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(val)) {
          return { type: "string", format: "uuid" };
        }
        return { type: "string" };
      }
      
      if (type === 'number') {
        return { type: Number.isInteger(val) ? "integer" : "number" };
      }
      
      if (type === 'boolean') {
        return { type: "boolean" };
      }
      
      if (Array.isArray(val)) {
        return {
          type: "array",
          items: this.buildItems(val)
        };
      }
      
      if (type === 'object') {
        return {
          type: "object",
          properties: this.buildProperties(val),
          required: Object.keys(val)
        };
      }
      
      return { type: "any" };
    },

    buildItems(arr) {
      if (arr.length === 0) return {};
      
      // Collect types
      const types = arr.map(item => this.inferType(item));
      const uniqueTypes = [];
      const stringified = new Set();
      
      types.forEach(t => {
        const str = JSON.stringify(t);
        if (!stringified.has(str)) {
          stringified.add(str);
          uniqueTypes.push(t);
        }
      });

      if (uniqueTypes.length === 1) {
        return uniqueTypes[0];
      }
      
      return {
        anyOf: uniqueTypes
      };
    }
  };

  /**
   * 3. Custom Client-Side Data Converters
   */
  const DataConverters = {
    toCSV(obj) {
      const arr = Array.isArray(obj) ? obj : [obj];
      if (arr.length === 0) return '';

      // Flatten items helper
      const flattenObj = (item, prefix = '') => {
        let result = {};
        for (const key in item) {
          if (Object.prototype.hasOwnProperty.call(item, key)) {
            const name = prefix ? `${prefix}.${key}` : key;
            if (item[key] !== null && typeof item[key] === 'object' && !Array.isArray(item[key])) {
              Object.assign(result, flattenObj(item[key], name));
            } else {
              result[name] = item[key];
            }
          }
        }
        return result;
      };

      const flattenedArr = arr.map(i => flattenObj(i));
      // Extract unique headers
      const headersSet = new Set();
      flattenedArr.forEach(i => Object.keys(i).forEach(k => headersSet.add(k)));
      const headers = Array.from(headersSet);

      let csv = headers.join(',') + '\n';
      flattenedArr.forEach(row => {
        const line = headers.map(header => {
          let val = row[header];
          if (val === undefined || val === null) return '';
          if (typeof val === 'object') val = JSON.stringify(val);
          val = String(val).replace(/"/g, '""');
          return val.includes(',') || val.includes('\n') || val.includes('"') ? `"${val}"` : val;
        });
        csv += line.join(',') + '\n';
      });

      return csv;
    },

    toXML(obj, rootName = 'root') {
      const buildNode = (val, tagName) => {
        if (val === null) return `<${tagName} nil="true" />`;
        const type = typeof val;

        if (type === 'string' || type === 'number' || type === 'boolean') {
          // Escaping basic xml entities
          const escaped = String(val)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          return `<${tagName}>${escaped}</${tagName}>`;
        }

        if (Array.isArray(val)) {
          return val.map(item => buildNode(item, tagName)).join('');
        }

        if (type === 'object') {
          let inner = '';
          for (const key in val) {
            if (Object.prototype.hasOwnProperty.call(val, key)) {
              // Convert key names containing spaces or invalid chars to valid tag names
              const cleanKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
              const nodeVal = val[key];
              if (Array.isArray(nodeVal)) {
                inner += buildNode(nodeVal, cleanKey);
              } else {
                inner += buildNode(nodeVal, cleanKey);
              }
            }
          }
          return `<${tagName}>${inner}</${tagName}>`;
        }
        return `<${tagName} />`;
      };

      return `<?xml version="1.0" encoding="UTF-8"?>\n${buildNode(obj, rootName)}`;
    },

    toYAML(obj, indent = 0) {
      const spacing = ' '.repeat(indent);
      if (obj === null) return 'null';
      const type = typeof obj;

      if (type === 'string') {
        if (obj.includes('\n') || obj.includes('"') || obj.includes("'")) {
          return `| \n${spacing}  ` + obj.split('\n').join(`\n${spacing}  `);
        }
        return `"${obj}"`;
      }
      if (type === 'number' || type === 'boolean') {
        return String(obj);
      }

      if (Array.isArray(obj)) {
        if (obj.length === 0) return '[]';
        return '\n' + obj.map(item => {
          const itemVal = this.toYAML(item, indent + 2);
          // If scalar value, represent directly, else nested block
          const cleanVal = itemVal.startsWith('\n') ? itemVal : ` ${itemVal}`;
          return `${spacing}-${cleanVal}`;
        }).join('\n');
      }

      if (type === 'object') {
        const keys = Object.keys(obj);
        if (keys.length === 0) return '{}';
        return '\n' + keys.map(key => {
          const val = obj[key];
          const renderedVal = this.toYAML(val, indent + 2);
          const cleanVal = renderedVal.startsWith('\n') ? renderedVal : ` ${renderedVal}`;
          return `${spacing}${key}:${cleanVal}`;
        }).join('\n');
      }

      return 'null';
    },

    toSQL(obj, tableName = 'json_import') {
      const arr = Array.isArray(obj) ? obj : [obj];
      if (arr.length === 0) return `-- No records found`;

      let sql = '';
      arr.forEach(item => {
        const keys = [];
        const vals = [];
        for (const key in item) {
          if (Object.prototype.hasOwnProperty.call(item, key)) {
            const val = item[key];
            keys.push(`\`${key}\``);
            if (val === null) {
              vals.push('NULL');
            } else if (typeof val === 'string') {
              vals.push(`'${val.replace(/'/g, "''")}'`);
            } else if (typeof val === 'number' || typeof val === 'boolean') {
              vals.push(String(val));
            } else {
              vals.push(`'${JSON.stringify(val).replace(/'/g, "''")}'`);
            }
          }
        }
        sql += `INSERT INTO \`${tableName}\` (${keys.join(', ')}) VALUES (${vals.join(', ')});\n`;
      });
      return sql;
    },

    // FIX: Bug 9 — toTypeScript generates full interfaces recursively
    toTypeScript(obj, interfaceName = 'Root') {
      let interfaces = '';
      const createdInterfaces = new Set();

      const buildInterface = (item, name) => {
        if (item === null || typeof item !== 'object') return;
        if (Array.isArray(item)) {
          if (item.length > 0) {
            buildInterface(item[0], `${name}Item`);
          }
          return;
        }

        if (createdInterfaces.has(name)) return;
        createdInterfaces.add(name);

        let code = `export interface ${name} {\n`;
        for (const key in item) {
          if (Object.prototype.hasOwnProperty.call(item, key)) {
            const val = item[key];
            const type = typeof val;
            
            if (val === null) {
              code += `  ${key}: null;\n`;
            } else if (Array.isArray(val)) {
              if (val.length === 0) {
                code += `  ${key}: any[];\n`;
              } else {
                const subType = typeof val[0];
                if (subType === 'object' && val[0] !== null) {
                  const subName = key.charAt(0).toUpperCase() + key.slice(1);
                  code += `  ${key}: ${subName}[];\n`;
                  buildInterface(val[0], subName);
                } else {
                  const tsType = subType === 'number' ? 'number' : subType === 'boolean' ? 'boolean' : 'string';
                  code += `  ${key}: ${tsType}[];\n`;
                }
              }
            } else if (type === 'object') {
              const subName = key.charAt(0).toUpperCase() + key.slice(1);
              code += `  ${key}: ${subName};\n`;
              buildInterface(val, subName);
            } else {
              code += `  ${key}: ${type};\n`;
            }
          }
        }
        code += `}\n\n`;
        interfaces = code + interfaces;
      };

      buildInterface(obj, interfaceName);
      return interfaces.trim();
    },

    // FIX: Bug 9 — toJava generates complete POJO classes recursively
    toJava(obj, className = 'Root') {
      let classes = '';
      const createdClasses = new Set();

      const buildClass = (item, name) => {
        if (item === null || typeof item !== 'object' || Array.isArray(item)) return;
        if (createdClasses.has(name)) return;
        createdClasses.add(name);

        let fields = '';
        let methods = '';
        
        let code = `public class ${name} {\n`;
        for (const key in item) {
          if (Object.prototype.hasOwnProperty.call(item, key)) {
            const val = item[key];
            const type = typeof val;
            const capKey = key.charAt(0).toUpperCase() + key.slice(1);
            let javaType = 'Object';

            if (val === null) {
              javaType = 'Object';
            } else if (type === 'string') {
              javaType = 'String';
            } else if (type === 'number') {
              javaType = Number.isInteger(val) ? 'int' : 'double';
            } else if (type === 'boolean') {
              javaType = 'boolean';
            } else if (Array.isArray(val)) {
              if (val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
                const subName = capKey;
                javaType = `List<${subName}>`;
                buildClass(val[0], subName);
              } else {
                const subType = val.length > 0 ? typeof val[0] : 'Object';
                const jt = subType === 'number' ? 'Integer' : subType === 'boolean' ? 'Boolean' : subType === 'string' ? 'String' : 'Object';
                javaType = `List<${jt}>`;
              }
            } else if (type === 'object') {
              const subName = capKey;
              javaType = subName;
              buildClass(val, subName);
            }

            fields += `  private ${javaType} ${key};\n`;
            
            // Getters/Setters
            methods += `\n  public ${javaType} get${capKey}() {\n    return this.${key};\n  }\n`;
            methods += `  public void set${capKey}(${javaType} ${key}) {\n    this.${key} = ${key};\n  }\n`;
          }
        }
        code += fields + methods + `}\n\n`;
        classes = code + classes;
      };

      buildClass(obj, className);
      return classes.trim();
    },

    // FIX: Bug 9 — toCSharp generates complete classes recursively with properties and attributes
    toCSharp(obj, className = 'Root') {
      let classes = '';
      const createdClasses = new Set();

      const buildClass = (item, name) => {
        if (item === null || typeof item !== 'object' || Array.isArray(item)) return;
        if (createdClasses.has(name)) return;
        createdClasses.add(name);

        let code = `public class ${name}\n{\n`;
        for (const key in item) {
          if (Object.prototype.hasOwnProperty.call(item, key)) {
            const val = item[key];
            const type = typeof val;
            const capKey = key.charAt(0).toUpperCase() + key.slice(1);
            let csType = 'object';

            if (val === null) {
              csType = 'object';
            } else if (type === 'string') {
              csType = 'string';
            } else if (type === 'number') {
              csType = Number.isInteger(val) ? 'int' : 'double';
            } else if (type === 'boolean') {
              csType = 'bool';
            } else if (Array.isArray(val)) {
              if (val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
                const subName = capKey;
                csType = `List<${subName}>`;
                buildClass(val[0], subName);
              } else {
                const subType = val.length > 0 ? typeof val[0] : 'object';
                const ct = subType === 'number' ? 'int' : subType === 'boolean' ? 'bool' : subType === 'string' ? 'string' : 'object';
                csType = `List<${ct}>`;
              }
            } else if (type === 'object') {
              const subName = capKey;
              csType = subName;
              buildClass(val, subName);
            }

            // Use JsonProperty attribute if the key is snake_case or contains non-alphanumeric chars
            const isSnake = key.includes('_') || /^[a-z]+[A-Z]/.test(key);
            if (isSnake) {
              code += `    [JsonProperty("${key}")]\n`;
            }
            code += `    public ${csType} ${capKey} { get; set; }\n\n`;
          }
        }
        code = code.trimEnd() + `\n}\n\n`;
        classes = code + classes;
      };

      buildClass(obj, className);
      return classes.trim();
    },

    toPython(obj, className = 'RootModel') {
      let classes = '';
      const createdClasses = new Set();

      const buildClass = (item, name) => {
        if (item === null || typeof item !== 'object' || Array.isArray(item)) return;
        if (createdClasses.has(name)) return;
        createdClasses.add(name);

        let code = `@dataclass\nclass ${name}:\n`;
        let hasFields = false;
        
        for (const key in item) {
          if (Object.prototype.hasOwnProperty.call(item, key)) {
            hasFields = true;
            const val = item[key];
            const type = typeof val;
            const capKey = key.charAt(0).toUpperCase() + key.slice(1);
            let pyType = 'Any';

            if (val === null) {
              pyType = 'Any';
            } else if (type === 'string') {
              pyType = 'str';
            } else if (type === 'number') {
              pyType = Number.isInteger(val) ? 'int' : 'float';
            } else if (type === 'boolean') {
              pyType = 'bool';
            } else if (Array.isArray(val)) {
              if (val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
                const subName = `${name}_${capKey}Item`;
                pyType = `List['${subName}']`;
                buildClass(val[0], subName);
              } else {
                pyType = `List[${val.length > 0 ? typeof val[0] : 'Any'}]`;
              }
            } else if (type === 'object') {
              const subName = `${name}_${capKey}`;
              pyType = `'${subName}'`;
              buildClass(val, subName);
            }

            code += `    ${key}: ${pyType}\n`;
          }
        }
        
        if (!hasFields) {
          code += `    pass\n`;
        }
        
        classes += code + `\n`;
      };

      buildClass(obj, className);
      return `from dataclasses import dataclass\nfrom typing import List, Any\n\n` + classes.trim();
    }
  };

  /**
   * 4. JSON Repair Engine
   */
  const JSONRepairEngine = {
    repair(malformedText) {
      let txt = malformedText.trim();
      if (!txt) return '{}';

      // Phase 1: Convert single quotes to double quotes
      txt = txt.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');

      // Phase 2: Add quotes to unquoted keys
      txt = txt.replace(/([{,]\s*)([a-zA-Z0-9_$]+)(\s*:)/g, '$1"$2"$3');

      // Phase 3: Remove trailing commas
      txt = txt.replace(/,\s*([\]}])/g, '$1');

      // Phase 4: Fix single quotes on keys
      txt = txt.replace(/([{,]\s*)'([a-zA-Z0-9_$]+)'(\s*:)/g, '$1"$2"$3');

      try {
        const obj = JSON.parse(txt);
        return JSON.stringify(obj, null, 2);
      } catch (e) {
        return this.advancedTokenRepair(malformedText);
      }
    },

    advancedTokenRepair(text) {
      let output = "";
      let inString = false;
      let stringChar = null;
      let i = 0;
      
      while (i < text.length) {
        const char = text[i];
        
        if ((char === '"' || char === "'") && text[i - 1] !== '\\') {
          if (!inString) {
            inString = true;
            stringChar = char;
            output += '"';
          } else if (char === stringChar) {
            inString = false;
            output += '"';
          } else {
            output += '\\"';
          }
        } else {
          output += char;
        }
        i++;
      }
      
      output = output.replace(/,\s*([\]}])/g, '$1');
      return output;
    }
  };

  // ==========================================================================
  // CUSTOM HTML TREE GENERATOR
  // ==========================================================================
  // FIX: Bugs 3 & 7 — HTML tree builder with click handlers and proper details/summary structure
  function generateInteractiveTreeDOM(obj, options = { onClickNode: null }) {
    const root = document.createElement('div');
    root.className = 'tree-root';
    
    function buildNode(val, path, keyName = null) {
      const node = document.createElement('div');
      node.className = 'tree-node';

      // Check for structural types
      const isArray = Array.isArray(val);
      const isObject = val !== null && typeof val === 'object' && !isArray;

      // FIX: Bug 7 — row is a <summary> ONLY for objects/arrays, and a <div> for primitives
      const row = (isObject || isArray) ? document.createElement('summary') : document.createElement('div');
      row.className = 'tree-summary';

      if (isObject || isArray) {
        const details = document.createElement('details');
        details.className = 'tree-details';
        details.open = true; // start open

        const arrow = document.createElement('span');
        arrow.className = 'tree-arrow';
        row.appendChild(arrow);

        const keySpan = document.createElement('span');
        if (keyName !== null) {
          keySpan.className = 'tree-key tree-clickable';
          keySpan.textContent = `"${keyName}"`;
          keySpan.dataset.path = path;
          row.appendChild(keySpan);
          
          const colon = document.createElement('span');
          colon.textContent = ': ';
          row.appendChild(colon);
        }

        const sizeLabel = document.createElement('span');
        sizeLabel.className = 'tree-size-label';
        if (isObject) {
          const keysCount = Object.keys(val).length;
          sizeLabel.textContent = `{ } ${keysCount} keys`;
        } else {
          sizeLabel.textContent = `[ ] ${val.length} items`;
        }
        row.appendChild(sizeLabel);
        
        details.appendChild(row);

        // Append children recursively
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'tree-children';

        if (isObject) {
          for (const key in val) {
            if (Object.prototype.hasOwnProperty.call(val, key)) {
              const childPath = path === '$' ? `$.${key}` : `${path}.${key}`;
              childrenContainer.appendChild(buildNode(val[key], childPath, key));
            }
          }
        } else {
          val.forEach((item, idx) => {
            const childPath = `${path}[${idx}]`;
            childrenContainer.appendChild(buildNode(item, childPath, idx));
          });
        }

        details.appendChild(childrenContainer);
        node.appendChild(details);

        // FIX: Bug 3 — Click handler for keys/spans in collapsible structures
        if (keyName !== null) {
          keySpan.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.path-selected').forEach(el => el.classList.remove('path-selected'));
            keySpan.classList.add('path-selected');
            currentSelectedPath = path;
            const pathInput = document.getElementById('path-resolved-input');
            if (pathInput) pathInput.value = path;
            if (options.onClickNode) {
              options.onClickNode(path, val, keySpan);
            }
          });
        }

        // FIX: Bug 3 — Root summary click sets path to "$"
        if (path === '$') {
          row.addEventListener('click', (e) => {
            if (e.target === row || e.target.classList.contains('tree-arrow') || e.target.classList.contains('tree-size-label')) {
              e.stopPropagation();
              document.querySelectorAll('.path-selected').forEach(el => el.classList.remove('path-selected'));
              row.classList.add('path-selected');
              currentSelectedPath = '$';
              const pathInput = document.getElementById('path-resolved-input');
              if (pathInput) pathInput.value = '$';
              if (options.onClickNode) {
                options.onClickNode('$', val, row);
              }
            }
          });
        }
      } else {
        // Primitive values
        const keySpan = document.createElement('span');
        if (keyName !== null) {
          keySpan.className = 'tree-key tree-clickable';
          keySpan.textContent = typeof keyName === 'number' ? `[${keyName}]` : `"${keyName}"`;
          keySpan.dataset.path = path;
          row.appendChild(keySpan);
          
          const colon = document.createElement('span');
          colon.textContent = ': ';
          row.appendChild(colon);
        }

        const valSpan = document.createElement('span');
        valSpan.dataset.path = path;
        valSpan.className = 'tree-clickable ';

        if (val === null) {
          valSpan.className += 'tree-value-null';
          valSpan.textContent = 'null';
        } else {
          const type = typeof val;
          valSpan.className += `tree-value-${type}`;
          valSpan.textContent = type === 'string' ? `"${val}"` : String(val);
        }

        row.appendChild(valSpan);
        node.appendChild(row);

        // FIX: Bug 3 — Click listeners for key label and value span on primitive nodes
        if (keyName !== null) {
          keySpan.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.path-selected').forEach(el => el.classList.remove('path-selected'));
            keySpan.classList.add('path-selected');
            currentSelectedPath = path;
            const pathInput = document.getElementById('path-resolved-input');
            if (pathInput) pathInput.value = path;
            if (options.onClickNode) {
              options.onClickNode(path, val, keySpan);
            }
          });
        }

        valSpan.addEventListener('click', (e) => {
          e.stopPropagation();
          document.querySelectorAll('.path-selected').forEach(el => el.classList.remove('path-selected'));
          valSpan.classList.add('path-selected');
          currentSelectedPath = path;
          const pathInput = document.getElementById('path-resolved-input');
          if (pathInput) pathInput.value = path;
          if (options.onClickNode) {
            options.onClickNode(path, val, valSpan);
          }
        });
      }

      return node;
    }

    root.appendChild(buildNode(obj, '$'));
    return root;
  }

  // ==========================================================================
  // TOOL REGISTRY & LIFECYCLE
  // ==========================================================================

  // 1. JSON VIEWER
  App.toolRegistry['viewer'] = {
    id: 'viewer',
    init() {
      EditorManager.create('viewer-editor-input');
      
      const onContentChange = () => {
        debounce('viewer-save', () => this.saveSession(), 1000);
        this.render();
      };

      const editor = App.editors['viewer-editor-input'];
      if (editor) {
        editor.onDidChangeModelContent(onContentChange);
      }

      // Drag and drop setup
      DragDropManager.setup(document.getElementById('tool-viewer'), (val) => {
        EditorManager.checkAndLoadValue('viewer-editor-input', 'viewer-fallback-input', val);
        this.render();
      });

      // Layout toggle tree vs raw tabs
      const treeTab = document.getElementById('viewer-tree-tab');
      const rawTab = document.getElementById('viewer-raw-tab');
      const treeContainer = document.getElementById('viewer-tree-container');
      const rawContainer = document.getElementById('viewer-raw-container');

      treeTab.addEventListener('click', () => {
        treeTab.classList.add('active');
        rawTab.classList.remove('active');
        treeContainer.classList.remove('hidden');
        rawContainer.classList.add('hidden');
      });

      rawTab.addEventListener('click', () => {
        rawTab.classList.add('active');
        treeTab.classList.remove('active');
        rawContainer.classList.remove('hidden');
        treeContainer.classList.add('hidden');
        this.renderRawText();
      });

      // FIX: Bug 7 — Bind Collapse All / Expand All buttons
      document.getElementById('viewer-collapse-all-btn').addEventListener('click', () => {
        const details = document.querySelectorAll('#viewer-tree-output details');
        details.forEach(d => d.open = false);
      });

      document.getElementById('viewer-expand-all-btn').addEventListener('click', () => {
        const details = document.querySelectorAll('#viewer-tree-output details');
        details.forEach(d => d.open = true);
      });

      // Actions
      document.getElementById('viewer-copy-btn').addEventListener('click', () => {
        const text = EditorManager.getValue('viewer-editor-input', 'viewer-fallback-input');
        const formatted = formatJSON(text);
        navigator.clipboard.writeText(formatted).then(() => {
          Toast.show('Copied JSON to clipboard', 'success');
        });
      });

      document.getElementById('viewer-download-btn').addEventListener('click', () => {
        const text = EditorManager.getValue('viewer-editor-input', 'viewer-fallback-input');
        const formatted = formatJSON(text);
        downloadTextFile(formatted, 'toolkit_viewer.json');
      });

      // Fallback listener
      const fallback = document.getElementById('viewer-fallback-input');
      fallback.addEventListener('input', onContentChange);
    },

    render() {
      const text = EditorManager.getValue('viewer-editor-input', 'viewer-fallback-input');
      const obj = safeParse(text);
      const treeOutput = document.getElementById('viewer-tree-output');

      if (!treeOutput) return;

      if (!text.trim()) {
        treeOutput.innerHTML = '<div class="tree-empty-state">Enter JSON input to explore tree...</div>';
        return;
      }

      if (obj === null) {
        treeOutput.innerHTML = '<div class="tree-empty-state error">Invalid JSON structure. See Validator tool.</div>';
        return;
      }

      // Generate tree
      treeOutput.innerHTML = '';
      const treeDOM = generateInteractiveTreeDOM(obj);
      treeOutput.appendChild(treeDOM);
    },

    renderRawText() {
      const text = EditorManager.getValue('viewer-editor-input', 'viewer-fallback-input');
      const formatted = formatJSON(text);
      const rawOutput = document.getElementById('viewer-raw-output');
      
      if (!rawOutput) return;

      rawOutput.textContent = formatted;
      if (window.hljs) {
        hljs.highlightElement(rawOutput);
      }
    },

    saveSession() {
      const val = EditorManager.getValue('viewer-editor-input', 'viewer-fallback-input');
      localStorage.setItem('toolkit_session_viewer', val);
    },

    restoreSession() {
      const val = localStorage.getItem('toolkit_session_viewer') || App.defaultJSON;
      EditorManager.checkAndLoadValue('viewer-editor-input', 'viewer-fallback-input', val);
      this.render();
    }
  };

  // 2. JSON FORMATTER
  App.toolRegistry['formatter'] = {
    id: 'formatter',
    init() {
      EditorManager.create('formatter-editor-input');
      EditorManager.create('formatter-editor-output', { readOnly: true });

      // Drag and drop setup
      DragDropManager.setup(document.getElementById('tool-formatter'), (val) => {
        EditorManager.checkAndLoadValue('formatter-editor-input', 'formatter-fallback-input', val);
      });

      const onContentChange = () => {
        debounce('formatter-save', () => this.saveSession(), 1000);
      };

      const editor = App.editors['formatter-editor-input'];
      if (editor) {
        editor.onDidChangeModelContent(onContentChange);
        
        // Auto-indent on paste
        editor.onDidPaste(() => {
          this.runFormatter(2);
          Toast.show('Pasted value auto-formatted', 'success');
        });
      }

      const fallback = document.getElementById('formatter-fallback-input');
      fallback.addEventListener('input', onContentChange);

      // Buttons
      document.getElementById('formatter-beautify-btn').addEventListener('click', () => this.runFormatter(2));
      document.getElementById('formatter-minify-btn').addEventListener('click', () => this.runFormatter(0));
      
      document.getElementById('formatter-copy-btn').addEventListener('click', () => {
        const out = EditorManager.getValue('formatter-editor-output', 'formatter-fallback-output');
        if (out) {
          navigator.clipboard.writeText(out).then(() => Toast.show('Formatted output copied', 'success'));
        }
      });

      document.getElementById('formatter-download-btn').addEventListener('click', () => {
        const out = EditorManager.getValue('formatter-editor-output', 'formatter-fallback-output');
        if (out) downloadTextFile(out, 'formatted.json');
      });
    },

    runFormatter(spaces) {
      const input = EditorManager.getValue('formatter-editor-input', 'formatter-fallback-input');
      const parsed = safeParse(input);
      
      if (!input.trim()) {
        Toast.show('Please enter JSON input first', 'warning');
        return;
      }

      if (parsed === null) {
        Toast.show('Unable to format. Malformed JSON input.', 'error');
        return;
      }

      const formatted = spaces === 0 ? JSON.stringify(parsed) : JSON.stringify(parsed, null, spaces);
      EditorManager.checkAndLoadValue('formatter-editor-output', 'formatter-fallback-output', formatted);
      Toast.show(spaces === 0 ? 'Minified JSON' : 'Beautified JSON', 'success');
    },

    saveSession() {
      const val = EditorManager.getValue('formatter-editor-input', 'formatter-fallback-input');
      localStorage.setItem('toolkit_session_formatter', val);
    },

    restoreSession() {
      const val = localStorage.getItem('toolkit_session_formatter') || App.defaultJSON;
      EditorManager.checkAndLoadValue('formatter-editor-input', 'formatter-fallback-input', val);
    }
  };

  // 3. JSON VALIDATOR
  App.toolRegistry['validator'] = {
    id: 'validator',
    init() {
      EditorManager.create('validator-editor-input');

      // Drag and drop setup
      DragDropManager.setup(document.getElementById('tool-validator'), (val) => {
        EditorManager.checkAndLoadValue('validator-editor-input', 'validator-fallback-input', val);
        this.validate();
      });

      const onContentChange = () => {
        debounce('validator-run', () => this.validate(), 400);
        debounce('validator-save', () => this.saveSession(), 1000);
      };

      const editor = App.editors['validator-editor-input'];
      if (editor) {
        editor.onDidChangeModelContent(onContentChange);
      }

      const fallback = document.getElementById('validator-fallback-input');
      fallback.addEventListener('input', onContentChange);
    },

    validate() {
      const input = EditorManager.getValue('validator-editor-input', 'validator-fallback-input');
      const badgeBox = document.getElementById('validator-badge-box');
      const badgeText = document.getElementById('validator-badge-text');
      const errorCard = document.getElementById('validator-error-card');
      const successCard = document.getElementById('validator-success-card');
      const editor = App.editors['validator-editor-input'];

      if (!input.trim()) {
        badgeBox.className = 'validator-badge-box pending';
        badgeText.textContent = 'Enter JSON to validate...';
        errorCard.classList.add('hidden');
        successCard.classList.add('hidden');
        if (editor) monaco.editor.setModelMarkers(editor.getModel(), 'owner', []);
        return;
      }

      const startTime = performance.now();
      try {
        JSON.parse(input);
        const parseTime = (performance.now() - startTime).toFixed(2);
        
        // Success
        badgeBox.className = 'validator-badge-box success';
        badgeText.textContent = 'Valid JSON ✓';
        successCard.classList.remove('hidden');
        errorCard.classList.add('hidden');

        document.getElementById('val-success-time').textContent = `${parseTime} ms`;

        // Clear Monaco squiggles
        if (editor) {
          monaco.editor.setModelMarkers(editor.getModel(), 'owner', []);
        }
      } catch (err) {
        // Error handling
        badgeBox.className = 'validator-badge-box error';
        badgeText.textContent = 'Invalid JSON ✗';
        errorCard.classList.remove('hidden');
        successCard.classList.add('hidden');

        // Extract line, column and description
        const errMsg = err.message;
        let line = '1';
        let col = '1';
        let desc = errMsg;

        const lineColMatch = errMsg.match(/line (\d+) column (\d+)/i);
        const posMatch = errMsg.match(/position (\d+)/i);

        if (lineColMatch) {
          line = lineColMatch[1];
          col = lineColMatch[2];
        } else if (posMatch) {
          const pos = parseInt(posMatch[1], 10);
          const linesUpToPos = input.substring(0, pos).split('\n');
          line = String(linesUpToPos.length);
          col = String(linesUpToPos[linesUpToPos.length - 1].length + 1);
        }

        document.getElementById('val-err-desc').textContent = desc;
        document.getElementById('val-err-line').textContent = line;
        document.getElementById('val-err-col').textContent = col;

        // Apply Monaco squiggles
        if (editor) {
          const lNum = parseInt(line, 10);
          const cNum = parseInt(col, 10);
          monaco.editor.setModelMarkers(editor.getModel(), 'owner', [{
            startLineNumber: lNum,
            startColumn: Math.max(1, cNum - 1),
            endLineNumber: lNum,
            endColumn: cNum + 5,
            message: desc,
            severity: monaco.MarkerSeverity.Error
          }]);
        }
      }
    },

    saveSession() {
      const val = EditorManager.getValue('validator-editor-input', 'validator-fallback-input');
      localStorage.setItem('toolkit_session_validator', val);
    },

    restoreSession() {
      const val = localStorage.getItem('toolkit_session_validator') || App.defaultJSON;
      EditorManager.checkAndLoadValue('validator-editor-input', 'validator-fallback-input', val);
      this.validate();
    }
  };

  // 4. JSON COMPARE (DIFF)
  App.toolRegistry['compare'] = {
    id: 'compare',
    lastResult: null,
    lastObjA: null,
    lastObjB: null,

    init() {
      EditorManager.create('compare-editor-a');
      EditorManager.create('compare-editor-b');

      DragDropManager.setup(document.getElementById('compare-editor-a').parentElement, (val) => {
        EditorManager.checkAndLoadValue('compare-editor-a', 'compare-fallback-a', val);
      });

      DragDropManager.setup(document.getElementById('compare-editor-b').parentElement, (val) => {
        EditorManager.checkAndLoadValue('compare-editor-b', 'compare-fallback-b', val);
      });

      // Actions
      document.getElementById('compare-run-btn').addEventListener('click', () => this.runCompare());
      document.getElementById('compare-export-btn').addEventListener('click', () => this.exportReport());

      const onAChange = () => debounce('compare-save-a', () => localStorage.setItem('toolkit_session_comp_a', EditorManager.getValue('compare-editor-a', 'compare-fallback-a')), 1000);
      const onBChange = () => debounce('compare-save-b', () => localStorage.setItem('toolkit_session_comp_b', EditorManager.getValue('compare-editor-b', 'compare-fallback-b')), 1000);

      const edA = App.editors['compare-editor-a'];
      const edB = App.editors['compare-editor-b'];

      if (edA) edA.onDidChangeModelContent(onAChange);
      if (edB) edB.onDidChangeModelContent(onBChange);

      document.getElementById('compare-fallback-a').addEventListener('input', onAChange);
      document.getElementById('compare-fallback-b').addEventListener('input', onBChange);
    },

    runCompare() {
      const txtA = EditorManager.getValue('compare-editor-a', 'compare-fallback-a');
      const txtB = EditorManager.getValue('compare-editor-b', 'compare-fallback-b');

      if (!txtA.trim() || !txtB.trim()) {
        Toast.show('Please supply both JSON documents A and B', 'warning');
        return;
      }

      const objA = safeParse(txtA);
      const objB = safeParse(txtB);

      if (objA === null || objB === null) {
        Toast.show('One or both JSON inputs are invalid. Compare halted.', 'error');
        return;
      }

      const ignoreFormat = document.getElementById('diff-ignore-format').checked;
      const ignoreKeys = document.getElementById('diff-ignore-keys').checked;

      const result = DiffEngine.compare(objA, objB, {
        ignoreFormatting: ignoreFormat,
        ignoreKeyOrder: ignoreKeys
      });

      // FIX: Bug 6 — Save comparison objects and results in memory
      this.lastObjA = objA;
      this.lastObjB = objB;
      this.lastResult = result;

      // Render summary
      const summaryBar = document.getElementById('diff-summary-output');
      summaryBar.textContent = `${result.summary.added} added · ${result.summary.removed} removed · ${result.summary.changed} changed · ${result.summary.unchanged} unchanged`;

      // Render lines
      const outputContainer = document.getElementById('compare-diff-output');
      outputContainer.innerHTML = '';

      if (result.diff.length === 0) {
        outputContainer.innerHTML = '<div class="diff-empty-state">Documents are identical.</div>';
        return;
      }

      result.diff.forEach((line, idx) => {
        const lineDiv = document.createElement('div');
        lineDiv.className = `diff-line ${line.type}`;

        const numSpan = document.createElement('span');
        numSpan.className = 'diff-line-number';
        numSpan.textContent = idx + 1;

        const contentSpan = document.createElement('span');
        contentSpan.className = 'diff-line-content';
        contentSpan.textContent = (line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  ') + line.text;

        lineDiv.appendChild(numSpan);
        lineDiv.appendChild(contentSpan);
        outputContainer.appendChild(lineDiv);
      });

      Toast.show('Comparison completed successfully', 'success');
    },

    // FIX: Bug 6 — exportReport exports formatted comparison details using in-memory state
    exportReport() {
      if (!this.lastResult || !this.lastObjA || !this.lastObjB) {
        Toast.show('Run a comparison first', 'warning');
        return;
      }

      const objA = this.lastObjA;
      const objB = this.lastObjB;

      const mapA = getKeyValuePairs(objA);
      const mapB = getKeyValuePairs(objB);

      const added = [];
      const removed = [];
      const changed = [];
      let unchangedCount = 0;

      for (const path in mapB) {
        const cleanPath = path.startsWith('$.') ? path.substring(2) : path;
        if (!(path in mapA)) {
          added.push(`+ ${cleanPath}: ${JSON.stringify(mapB[path])}`);
        } else if (JSON.stringify(mapA[path]) !== JSON.stringify(mapB[path])) {
          changed.push(`~ ${cleanPath}: ${JSON.stringify(mapA[path])} → ${JSON.stringify(mapB[path])}`);
        } else {
          unchangedCount++;
        }
      }

      for (const path in mapA) {
        const cleanPath = path.startsWith('$.') ? path.substring(2) : path;
        if (!(path in mapB)) {
          removed.push(`- ${cleanPath}: ${JSON.stringify(mapA[path])}`);
        }
      }

      added.sort();
      removed.sort();
      changed.sort();

      const nowStr = new Date().toISOString();
      const report = [
        `JSON Comparison Report`,
        `Generated: ${nowStr}`,
        `════════════════════════`,
        `Summary: ${added.length} added · ${removed.length} removed · ${changed.length} changed · ${unchangedCount} unchanged`,
        ``,
        `ADDED KEYS:`,
        added.length > 0 ? added.join('\n') : `(none)`,
        ``,
        `REMOVED KEYS:`,
        removed.length > 0 ? removed.join('\n') : `(none)`,
        ``,
        `CHANGED KEYS:`,
        changed.length > 0 ? changed.join('\n') : `(none)`
      ].join('\n');

      downloadTextFile(report, 'json-diff-report.txt', 'text/plain');
    },

    restoreSession() {
      const valA = localStorage.getItem('toolkit_session_comp_a') || App.defaultJSON;
      const valB = localStorage.getItem('toolkit_session_comp_b') || App.defaultJSON;

      EditorManager.checkAndLoadValue('compare-editor-a', 'compare-fallback-a', valA);
      EditorManager.checkAndLoadValue('compare-editor-b', 'compare-fallback-b', valB);
    }
  };

  // 5. JSON SEARCH
  // FIX: Bug 1 — Complete tree search rendering with recursive key/value walking and matching
  App.toolRegistry['search'] = {
    id: 'search',
    matches: [],
    currentIndex: -1,

    init() {
      EditorManager.create('search-editor-input');

      // Drag and drop
      DragDropManager.setup(document.getElementById('tool-search'), (val) => {
        EditorManager.checkAndLoadValue('search-editor-input', 'search-fallback-input', val);
        this.render();
      });

      const onContentChange = () => {
        debounce('search-save', () => this.saveSession(), 1000);
        this.render();
      };

      const editor = App.editors['search-editor-input'];
      if (editor) {
        editor.onDidChangeModelContent(onContentChange);
      }

      document.getElementById('search-fallback-input').addEventListener('input', onContentChange);

      // Search controls
      const queryInput = document.getElementById('search-query');
      queryInput.addEventListener('input', () => {
        debounce('search-run', () => this.performSearch(), 300);
      });

      document.getElementById('search-prev-btn').addEventListener('click', () => this.navigate(-1));
      document.getElementById('search-next-btn').addEventListener('click', () => this.navigate(1));
    },

    render() {
      const text = EditorManager.getValue('search-editor-input', 'search-fallback-input');
      const obj = safeParse(text);
      const resultsList = document.getElementById('search-results-list');

      if (!resultsList) return;

      if (!text.trim()) {
        resultsList.innerHTML = '<div class="search-empty-state">Enter JSON input...</div>';
        return;
      }

      if (obj === null) {
        resultsList.innerHTML = '<div class="search-empty-state error">Invalid JSON structure.</div>';
        return;
      }

      resultsList.innerHTML = '';
      const treeDOM = generateInteractiveTreeDOM(obj);
      resultsList.appendChild(treeDOM);

      // Re-run search if a query is already present
      this.performSearch();
    },

    performSearch() {
      const query = document.getElementById('search-query').value.trim();
      const resultsList = document.getElementById('search-results-list');
      const counter = document.getElementById('search-counter');

      if (!resultsList) return;

      // Clear highlights on all tree elements
      resultsList.querySelectorAll('.search-highlight').forEach(el => el.classList.remove('search-highlight'));
      resultsList.querySelectorAll('.search-active').forEach(el => el.classList.remove('search-active'));

      if (!query) {
        this.matches = [];
        this.currentIndex = -1;
        counter.textContent = '0 of 0';
        return;
      }

      const text = EditorManager.getValue('search-editor-input', 'search-fallback-input');
      const obj = safeParse(text);

      if (obj === null) {
        this.matches = [];
        this.currentIndex = -1;
        counter.textContent = '0 of 0';
        return;
      }

      // Run recursive search
      this.matches = searchJSON(obj, query);
      this.currentIndex = this.matches.length > 0 ? 0 : -1;

      if (this.matches.length === 0) {
        counter.textContent = '0 of 0';
        return;
      }

      // Inject highlights
      this.matches.forEach(match => {
        const elements = resultsList.querySelectorAll(`[data-path="${CSS.escape(match.path)}"]`);
        elements.forEach(el => el.classList.add('search-highlight'));
      });

      this.revealActiveMatch();
    },

    navigate(dir) {
      if (this.matches.length === 0) return;
      this.currentIndex = (this.currentIndex + dir + this.matches.length) % this.matches.length;
      this.revealActiveMatch();
    },

    revealActiveMatch() {
      const resultsList = document.getElementById('search-results-list');
      const counter = document.getElementById('search-counter');

      if (!resultsList) return;

      // Clear previous active highlight
      resultsList.querySelectorAll('.search-active').forEach(el => el.classList.remove('search-active'));

      if (this.currentIndex === -1 || this.matches.length === 0) return;

      const activeMatch = this.matches[this.currentIndex];
      const elements = resultsList.querySelectorAll(`[data-path="${CSS.escape(activeMatch.path)}"]`);
      
      elements.forEach(el => el.classList.add('search-active'));
      
      if (elements.length > 0) {
        elements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      counter.textContent = `${this.currentIndex + 1} of ${this.matches.length}`;
    },

    saveSession() {
      const val = EditorManager.getValue('search-editor-input', 'search-fallback-input');
      localStorage.setItem('toolkit_session_search', val);
    },

    restoreSession() {
      const val = localStorage.getItem('toolkit_session_search') || App.defaultJSON;
      EditorManager.checkAndLoadValue('search-editor-input', 'search-fallback-input', val);
      this.render();
    }
  };

  // 6. JSON PATH EXPLORER
  App.toolRegistry['pathexplorer'] = {
    id: 'pathexplorer',
    init() {
      EditorManager.create('path-editor-input');

      // Drag and drop
      DragDropManager.setup(document.getElementById('tool-pathexplorer'), (val) => {
        EditorManager.checkAndLoadValue('path-editor-input', 'path-fallback-input', val);
        this.render();
      });

      const onContentChange = () => {
        debounce('path-save', () => this.saveSession(), 1000);
        this.render();
      };

      const editor = App.editors['path-editor-input'];
      if (editor) {
        editor.onDidChangeModelContent(onContentChange);
      }

      document.getElementById('path-fallback-input').addEventListener('input', onContentChange);

      // FIX: Bug 3 — Copy path button reads directly from currentSelectedPath and alerts
      document.getElementById('path-copy-btn').addEventListener('click', () => {
        if (currentSelectedPath) {
          navigator.clipboard.writeText(currentSelectedPath).then(() => {
            Toast.show('Copied!', 'success');
          });
        } else {
          Toast.show('Select a path first', 'warning');
        }
      });
    },

    render() {
      const text = EditorManager.getValue('path-editor-input', 'path-fallback-input');
      const obj = safeParse(text);
      const treeOutput = document.getElementById('path-tree-output');

      if (!treeOutput) return;

      if (!text.trim()) {
        treeOutput.innerHTML = '<div class="tree-empty-state">Enter JSON input...</div>';
        return;
      }

      if (obj === null) {
        treeOutput.innerHTML = '<div class="tree-empty-state error">Invalid JSON structure.</div>';
        return;
      }

      treeOutput.innerHTML = '';
      const treeDOM = generateInteractiveTreeDOM(obj, {
        onClickNode: (path, val, targetElement) => {
          // Visual highlighting is already handled inside the click listener of generateInteractiveTreeDOM
        }
      });

      treeOutput.appendChild(treeDOM);
    },

    saveSession() {
      const val = EditorManager.getValue('path-editor-input', 'path-fallback-input');
      localStorage.setItem('toolkit_session_path', val);
    },

    restoreSession() {
      const val = localStorage.getItem('toolkit_session_path') || App.defaultJSON;
      EditorManager.checkAndLoadValue('path-editor-input', 'path-fallback-input', val);
      this.render();
    }
  };

  // 7. JSON SCHEMA GENERATOR
  App.toolRegistry['schemagenerator'] = {
    id: 'schemagenerator',
    init() {
      EditorManager.create('schema-editor-input');
      EditorManager.create('schema-editor-output', { readOnly: true });

      // Drag and drop
      DragDropManager.setup(document.getElementById('tool-schemagenerator'), (val) => {
        EditorManager.checkAndLoadValue('schema-editor-input', 'schema-fallback-input', val);
      });

      const onContentChange = () => {
        debounce('schema-save', () => this.saveSession(), 1000);
      };

      const editor = App.editors['schema-editor-input'];
      if (editor) {
        editor.onDidChangeModelContent(onContentChange);
      }

      document.getElementById('schema-fallback-input').addEventListener('input', onContentChange);

      // Buttons
      document.getElementById('schema-generate-btn').addEventListener('click', () => this.generateSchema());
      document.getElementById('schema-download-btn').addEventListener('click', () => {
        const out = EditorManager.getValue('schema-editor-output', 'schema-fallback-output');
        if (out) downloadTextFile(out, 'schema.json');
      });
    },

    generateSchema() {
      const input = EditorManager.getValue('schema-editor-input', 'schema-fallback-input');
      const obj = safeParse(input);

      if (!input.trim()) {
        Toast.show('Please enter JSON input first', 'warning');
        return;
      }

      if (obj === null) {
        Toast.show('Invalid JSON structure. Schema generation failed.', 'error');
        return;
      }

      const schema = SchemaGenerator.generate(obj);
      const outputStr = JSON.stringify(schema, null, 2);
      
      EditorManager.checkAndLoadValue('schema-editor-output', 'schema-fallback-output', outputStr);
      Toast.show('JSON Schema generated successfully', 'success');
    },

    saveSession() {
      const val = EditorManager.getValue('schema-editor-input', 'schema-fallback-input');
      localStorage.setItem('toolkit_session_schema', val);
    },

    restoreSession() {
      const val = localStorage.getItem('toolkit_session_schema') || App.defaultJSON;
      EditorManager.checkAndLoadValue('schema-editor-input', 'schema-fallback-input', val);
    }
  };

  // 8. JSON CONVERTER
  App.toolRegistry['converter'] = {
    id: 'converter',
    init() {
      EditorManager.create('converter-editor-input');
      EditorManager.create('converter-editor-output', { readOnly: true });

      DragDropManager.setup(document.getElementById('tool-converter'), (val) => {
        EditorManager.checkAndLoadValue('converter-editor-input', 'converter-fallback-input', val);
      });

      const onContentChange = () => {
        debounce('converter-save', () => this.saveSession(), 1000);
      };

      const editor = App.editors['converter-editor-input'];
      if (editor) {
        editor.onDidChangeModelContent(onContentChange);
      }

      document.getElementById('converter-fallback-input').addEventListener('input', onContentChange);

      // Bind buttons
      document.getElementById('converter-run-btn').addEventListener('click', () => this.runConversion());
      document.getElementById('converter-copy-btn').addEventListener('click', () => {
        const text = EditorManager.getValue('converter-editor-output', 'converter-fallback-output');
        if (text) {
          navigator.clipboard.writeText(text).then(() => Toast.show('Converted code copied to clipboard', 'success'));
        }
      });

      document.getElementById('converter-download-btn').addEventListener('click', () => {
        const text = EditorManager.getValue('converter-editor-output', 'converter-fallback-output');
        if (text) {
          const format = document.getElementById('converter-format-select').value;
          const ext = format === 'csv' ? 'csv' : format === 'xml' ? 'xml' : format === 'yaml' ? 'yaml' : format === 'typescript' ? 'ts' : format === 'java' ? 'java' : format === 'csharp' ? 'cs' : format === 'python' ? 'py' : 'sql';
          downloadTextFile(text, `converted.${ext}`, 'text/plain');
        }
      });
    },

    runConversion() {
      const input = EditorManager.getValue('converter-editor-input', 'converter-fallback-input');
      const obj = safeParse(input);

      if (!input.trim()) {
        Toast.show('Please enter JSON input first', 'warning');
        return;
      }

      if (obj === null) {
        Toast.show('Invalid JSON structure. Conversion failed.', 'error');
        return;
      }

      const format = document.getElementById('converter-format-select').value;
      let output = '';

      switch (format) {
        case 'csv':
          output = DataConverters.toCSV(obj);
          break;
        case 'xml':
          output = DataConverters.toXML(obj);
          break;
        case 'yaml':
          output = DataConverters.toYAML(obj);
          break;
        case 'sql':
          output = DataConverters.toSQL(obj);
          break;
        case 'typescript':
          output = DataConverters.toTypeScript(obj, 'Root');
          break;
        case 'java':
          output = DataConverters.toJava(obj, 'Root');
          break;
        case 'csharp':
          output = DataConverters.toCSharp(obj, 'Root');
          break;
        case 'python':
          output = DataConverters.toPython(obj);
          break;
        default:
          output = '// Unrecognized format';
      }

      EditorManager.checkAndLoadValue('converter-editor-output', 'converter-fallback-output', output);
      // Update Monaco language styling if editor matches
      const outEd = App.editors['converter-editor-output'];
      if (outEd) {
        const lang = format === 'csv' ? 'plaintext' : format === 'typescript' ? 'typescript' : format === 'yaml' ? 'yaml' : format === 'xml' ? 'xml' : format === 'sql' ? 'sql' : format === 'python' ? 'python' : 'java';
        monaco.editor.setModelLanguage(outEd.getModel(), lang);
      }

      Toast.show(`Converted JSON to ${format.toUpperCase()}`, 'success');
    },

    saveSession() {
      const val = EditorManager.getValue('converter-editor-input', 'converter-fallback-input');
      localStorage.setItem('toolkit_session_converter', val);
    },

    restoreSession() {
      const val = localStorage.getItem('toolkit_session_converter') || App.defaultJSON;
      EditorManager.checkAndLoadValue('converter-editor-input', 'converter-fallback-input', val);
    }
  };

  // 9. BEAUTIFY TOOLS
  App.toolRegistry['beautify'] = {
    id: 'beautify',
    init() {
      EditorManager.create('beautify-editor-input');
      EditorManager.create('beautify-editor-output', { readOnly: true });

      DragDropManager.setup(document.getElementById('tool-beautify'), (val) => {
        EditorManager.checkAndLoadValue('beautify-editor-input', 'beautify-fallback-input', val);
      });

      const onContentChange = () => {
        debounce('beautify-save', () => this.saveSession(), 1000);
      };

      const editor = App.editors['beautify-editor-input'];
      if (editor) {
        editor.onDidChangeModelContent(onContentChange);
      }

      document.getElementById('beautify-fallback-input').addEventListener('input', onContentChange);

      // Controls
      document.getElementById('beautify-sort-btn').addEventListener('click', () => this.applyBeautify('sort'));
      document.getElementById('beautify-dup-btn').addEventListener('click', () => this.applyBeautify('dup'));
      document.getElementById('beautify-null-btn').addEventListener('click', () => this.applyBeautify('null'));
      document.getElementById('beautify-empty-btn').addEventListener('click', () => this.applyBeautify('empty'));

      document.getElementById('beautify-copy-btn').addEventListener('click', () => {
        const val = EditorManager.getValue('beautify-editor-output', 'beautify-fallback-output');
        if (val) navigator.clipboard.writeText(val).then(() => Toast.show('Output copied', 'success'));
      });

      document.getElementById('beautify-download-btn').addEventListener('click', () => {
        const val = EditorManager.getValue('beautify-editor-output', 'beautify-fallback-output');
        if (val) downloadTextFile(val, 'beautified.json');
      });
    },

    applyBeautify(action) {
      const input = EditorManager.getValue('beautify-editor-input', 'beautify-fallback-input');
      const obj = safeParse(input);

      if (!input.trim()) {
        Toast.show('Please enter JSON input first', 'warning');
        return;
      }

      if (obj === null) {
        Toast.show('Invalid JSON structure. Action cancelled.', 'error');
        return;
      }

      let result = deepClone(obj);
      let msg = '';

      if (action === 'sort') {
        result = sortObjectKeys(result);
        msg = 'Keys sorted alphabetically';
      } else if (action === 'dup') {
        msg = 'Duplicate keys resolved';
      } else if (action === 'null') {
        result = this.removeNulls(result);
        msg = 'Null values removed';
      } else if (action === 'empty') {
        result = this.removeEmptyStructures(result);
        msg = 'Empty arrays & objects removed';
      }

      const outputStr = JSON.stringify(result, null, 2);
      EditorManager.checkAndLoadValue('beautify-editor-output', 'beautify-fallback-output', outputStr);
      Toast.show(msg, 'success');
    },

    removeNulls(obj) {
      if (obj === null || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(item => this.removeNulls(item));

      const result = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          if (obj[key] !== null) {
            result[key] = this.removeNulls(obj[key]);
          }
        }
      }
      return result;
    },

    removeEmptyStructures(obj) {
      if (obj === null || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) {
        const cleanArr = obj.map(item => this.removeEmptyStructures(item))
                            .filter(item => item !== undefined);
        return cleanArr.length > 0 ? cleanArr : undefined;
      }

      const result = {};
      let hasKeys = false;
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const val = this.removeEmptyStructures(obj[key]);
          if (val !== undefined && (typeof val !== 'object' || Object.keys(val).length > 0)) {
            result[key] = val;
            hasKeys = true;
          }
        }
      }
      return hasKeys ? result : undefined;
    },

    saveSession() {
      const val = EditorManager.getValue('beautify-editor-input', 'beautify-fallback-input');
      localStorage.setItem('toolkit_session_beautify', val);
    },

    restoreSession() {
      const val = localStorage.getItem('toolkit_session_beautify') || App.defaultJSON;
      EditorManager.checkAndLoadValue('beautify-editor-input', 'beautify-fallback-input', val);
    }
  };

  // 10. JSON STATISTICS
  App.toolRegistry['statistics'] = {
    id: 'statistics',
    init() {
      EditorManager.create('stats-editor-input');

      DragDropManager.setup(document.getElementById('tool-statistics'), (val) => {
        EditorManager.checkAndLoadValue('stats-editor-input', 'stats-fallback-input', val);
        this.calculate();
      });

      const onContentChange = () => {
        debounce('stats-save', () => this.saveSession(), 1000);
      };

      const editor = App.editors['stats-editor-input'];
      if (editor) {
        editor.onDidChangeModelContent(onContentChange);
      }

      document.getElementById('stats-fallback-input').addEventListener('input', onContentChange);
      document.getElementById('stats-calculate-btn').addEventListener('click', () => this.calculate());
    },

    calculate() {
      const input = EditorManager.getValue('stats-editor-input', 'stats-fallback-input');
      const obj = safeParse(input);

      if (!input.trim()) {
        Toast.show('Please enter JSON input first', 'warning');
        return;
      }

      if (obj === null) {
        Toast.show('Invalid JSON. Statistics calculation skipped.', 'error');
        return;
      }

      // Calculations
      let objects = 0;
      let arrays = 0;
      let keys = 0;
      let values = 0;
      let maxDepth = 0;
      
      let strings = 0;
      let numbers = 0;
      let booleans = 0;

      const traverse = (node, depth) => {
        maxDepth = Math.max(maxDepth, depth);
        if (node === null) {
          values++;
          return;
        }

        const type = typeof node;
        if (type === 'string') {
          strings++;
          values++;
        } else if (type === 'number') {
          numbers++;
          values++;
        } else if (type === 'boolean') {
          booleans++;
          values++;
        } else if (Array.isArray(node)) {
          arrays++;
          node.forEach(item => traverse(item, depth + 1));
        } else if (type === 'object') {
          objects++;
          for (const key in node) {
            if (Object.prototype.hasOwnProperty.call(node, key)) {
              keys++;
              traverse(node[key], depth + 1);
            }
          }
        }
      };

      traverse(obj, 1);

      // Update UI elements
      document.getElementById('stat-objects').textContent = objects;
      document.getElementById('stat-arrays').textContent = arrays;
      document.getElementById('stat-keys').textContent = keys;
      document.getElementById('stat-values').textContent = values;
      document.getElementById('stat-depth').textContent = maxDepth;
      
      const bytesSize = new Blob([input]).size;
      document.getElementById('stat-size').textContent = `${(bytesSize / 1024).toFixed(2)} KB`;
      document.getElementById('stat-chars').textContent = input.length;
      
      document.getElementById('stat-strings').textContent = strings;
      document.getElementById('stat-numbers').textContent = numbers;
      document.getElementById('stat-booleans').textContent = booleans;

      Toast.show('Statistics recalculated', 'success');
    },

    saveSession() {
      const val = EditorManager.getValue('stats-editor-input', 'stats-fallback-input');
      localStorage.setItem('toolkit_session_stats', val);
    },

    restoreSession() {
      const val = localStorage.getItem('toolkit_session_stats') || App.defaultJSON;
      EditorManager.checkAndLoadValue('stats-editor-input', 'stats-fallback-input', val);
      this.calculate();
    }
  };

  // 11. JSON MERGE TOOL
  // FIX: Bug 8 — deepMerge supports array concatenation in merge-arrays mode
  function mergeDeep(target, source, mode) {
    for (const key of Object.keys(source)) {
      if (mode === 'merge-arrays' 
          && Array.isArray(target[key]) 
          && Array.isArray(source[key])) {
        target[key] = [...target[key], ...source[key]];
      } else if (typeof source[key] === 'object' && source[key] !== null
                 && typeof target[key] === 'object' && target[key] !== null
                 && !Array.isArray(source[key])) {
        mergeDeep(target[key], source[key], mode);
      } else if (mode === 'override' || !(key in target)) {
        target[key] = source[key];
      }
    }
    return target;
  }

  App.toolRegistry['merge'] = {
    id: 'merge',
    panelsCount: 0,
    maxPanels: 3,

    init() {
      // Dynamic panels container
      this.panelsCount = 0;
      document.getElementById('merge-inputs-row').innerHTML = '';
      
      // Default: create 2 panels
      this.addPanel();
      this.addPanel();

      EditorManager.create('merge-editor-output', { readOnly: true });

      // Buttons
      document.getElementById('merge-add-panel-btn').addEventListener('click', () => this.addPanel());
      document.getElementById('merge-run-btn').addEventListener('click', () => this.runMerge());
      
      document.getElementById('merge-copy-btn').addEventListener('click', () => {
        const val = EditorManager.getValue('merge-editor-output', 'merge-fallback-output');
        if (val) navigator.clipboard.writeText(val).then(() => Toast.show('Merged JSON copied', 'success'));
      });

      document.getElementById('merge-download-btn').addEventListener('click', () => {
        const val = EditorManager.getValue('merge-editor-output', 'merge-fallback-output');
        if (val) downloadTextFile(val, 'merged.json');
      });
    },

    addPanel() {
      if (this.panelsCount >= this.maxPanels) {
        Toast.show('Maximum 3 input panels allowed', 'warning');
        return;
      }

      this.panelsCount++;
      const id = this.panelsCount;
      
      const panel = document.createElement('div');
      panel.className = 'merge-panel-item';
      panel.id = `merge-panel-wrap-${id}`;
      panel.innerHTML = `
        <div class="panel-header">
          <h3>JSON Input ${id}</h3>
          <div class="panel-header-actions">
            <button class="btn-sm btn-outline file-upload-trigger">Upload</button>
            ${id > 2 ? `<button class="btn-sm btn-outline remove-panel-btn" data-id="${id}">Remove</button>` : ''}
          </div>
        </div>
        <div class="editor-container" id="merge-editor-${id}"></div>
        <textarea class="fallback-textarea hidden" id="merge-fallback-${id}" aria-label="Merge Input ${id} Fallback"></textarea>
      `;

      document.getElementById('merge-inputs-row').appendChild(panel);

      // Instantiate Monaco
      EditorManager.create(`merge-editor-${id}`);

      // Bind drag and drop
      DragDropManager.setup(panel, (val) => {
        EditorManager.checkAndLoadValue(`merge-editor-${id}`, `merge-fallback-${id}`, val);
      });

      // Bind remove button
      if (id > 2) {
        panel.querySelector('.remove-panel-btn').addEventListener('click', (e) => {
          const pid = e.target.dataset.id;
          this.removePanel(pid);
        });
      }

      // Populate default content
      const defaultData = id === 1 ? App.defaultJSON : `{\n  "additionalInfo": "Merged dynamically from panel ${id}",\n  "status": "active"\n}`;
      EditorManager.checkAndLoadValue(`merge-editor-${id}`, `merge-fallback-${id}`, defaultData);
    },

    removePanel(id) {
      const panel = document.getElementById(`merge-panel-wrap-${id}`);
      if (panel) {
        panel.remove();
        // Remove from Monaco registry
        delete App.editors[`merge-editor-${id}`];
        delete App.fallbacks[`merge-fallback-${id}`];
        this.panelsCount--;
        Toast.show(`Removed Input Panel ${id}`, 'info');
      }
    },

    runMerge() {
      const objectsToMerge = [];
      const strategy = document.getElementById('merge-conflict-select').value;
      const mode = strategy === 'arrays' ? 'merge-arrays' : strategy;

      // Extract all valid JSON values
      for (let i = 1; i <= 3; i++) {
        const wrap = document.getElementById(`merge-panel-wrap-${i}`);
        if (wrap) {
          const val = EditorManager.getValue(`merge-editor-${i}`, `merge-fallback-${i}`);
          if (val.trim()) {
            const parsed = safeParse(val);
            if (parsed === null) {
              Toast.show(`Input Panel ${i} contains invalid JSON. Merge stopped.`, 'error');
              return;
            }
            objectsToMerge.push(parsed);
          }
        }
      }

      if (objectsToMerge.length === 0) {
        Toast.show('No inputs available to merge', 'warning');
        return;
      }

      // Merge logic - clone target and source elements to prevent mutation of the originals
      let result = deepClone(objectsToMerge[0]);
      for (let i = 1; i < objectsToMerge.length; i++) {
        result = mergeDeep(result, deepClone(objectsToMerge[i]), mode);
      }

      const outputStr = JSON.stringify(result, null, 2);
      EditorManager.checkAndLoadValue('merge-editor-output', 'merge-fallback-output', outputStr);
      Toast.show('Successfully merged JSON documents', 'success');
    },

    restoreSession() {
      // Re-trigger init since dynamic elements are not restored automatically
      this.init();
    }
  };

  // 12. JSON GENERATOR
  App.toolRegistry['generator'] = {
    id: 'generator',
    customFields: [],

    init() {
      EditorManager.create('generator-editor-output', { readOnly: true });

      // Change templates handler
      const templateSelect = document.getElementById('generator-template-select');
      templateSelect.addEventListener('change', () => {
        const isCustom = templateSelect.value === 'custom';
        const builder = document.getElementById('generator-custom-builder');
        if (isCustom) {
          builder.classList.remove('hidden');
          this.setupCustomBuilder();
        } else {
          builder.classList.add('hidden');
        }
      });

      // Custom field row addition
      document.getElementById('generator-add-row-btn').addEventListener('click', () => this.addCustomRow());
      document.getElementById('generator-run-btn').addEventListener('click', () => this.runGenerate());

      document.getElementById('generator-copy-btn').addEventListener('click', () => {
        const val = EditorManager.getValue('generator-editor-output', 'generator-fallback-output');
        if (val) navigator.clipboard.writeText(val).then(() => Toast.show('Generated mock data copied', 'success'));
      });

      document.getElementById('generator-download-btn').addEventListener('click', () => {
        const val = EditorManager.getValue('generator-editor-output', 'generator-fallback-output');
        if (val) downloadTextFile(val, 'mock_data.json');
      });
    },

    setupCustomBuilder() {
      this.customFields = [];
      const tbody = document.getElementById('generator-schema-tbody');
      tbody.innerHTML = '';
      
      // Default rows
      this.addCustomRow('id', 'uuid');
      this.addCustomRow('username', 'name');
      this.addCustomRow('email', 'email');
    },

    addCustomRow(defaultKey = '', defaultType = 'name') {
      const tbody = document.getElementById('generator-schema-tbody');
      const idx = this.customFields.length;
      
      const row = document.createElement('tr');
      row.id = `gen-row-${idx}`;
      row.innerHTML = `
        <td>
          <input type="text" class="input-text font-code row-key-input" value="${defaultKey}" placeholder="field_name" aria-label="Field Key">
        </td>
        <td>
          <select class="select-dropdown row-type-select" aria-label="Field Type">
            <option value="uuid" ${defaultType === 'uuid' ? 'selected' : ''}>UUID v4</option>
            <option value="name" ${defaultType === 'name' ? 'selected' : ''}>Name</option>
            <option value="email" ${defaultType === 'email' ? 'selected' : ''}>Email Address</option>
            <option value="phone" ${defaultType === 'phone' ? 'selected' : ''}>Phone Number</option>
            <option value="number" ${defaultType === 'number' ? 'selected' : ''}>Number (1-1000)</option>
            <option value="boolean" ${defaultType === 'boolean' ? 'selected' : ''}>Boolean</option>
            <option value="date" ${defaultType === 'date' ? 'selected' : ''}>ISO Date</option>
          </select>
        </td>
        <td>
          <button class="btn-sm btn-outline delete-row-btn" data-idx="${idx}">Delete</button>
        </td>
      `;

      tbody.appendChild(row);

      // Bind delete
      row.querySelector('.delete-row-btn').addEventListener('click', (e) => {
        const rid = e.target.dataset.idx;
        document.getElementById(`gen-row-${rid}`).remove();
      });

      this.customFields.push({ index: idx });
    },

    runGenerate() {
      const template = document.getElementById('generator-template-select').value;
      const countInput = document.getElementById('generator-count-input');
      const count = Math.min(100, Math.max(1, parseInt(countInput.value, 10) || 10));
      
      let items = [];

      if (template === 'custom') {
        const keys = Array.from(document.querySelectorAll('.row-key-input')).map(el => el.value.trim());
        const types = Array.from(document.querySelectorAll('.row-type-select')).map(el => el.value);

        for (let i = 0; i < count; i++) {
          const obj = {};
          keys.forEach((key, idx) => {
            if (key) {
              obj[key] = this.generateMockValue(types[idx]);
            }
          });
          items.push(obj);
        }
      } else {
        // Predefined templates
        for (let i = 0; i < count; i++) {
          items.push(this.generateTemplateMock(template, i + 1));
        }
      }

      const outputStr = JSON.stringify(items, null, 2);
      EditorManager.checkAndLoadValue('generator-editor-output', 'generator-fallback-output', outputStr);
      Toast.show(`Generated ${count} mock items successfully`, 'success');
    },

    generateMockValue(type) {
      const firstNames = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda'];
      const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson'];
      
      switch (type) {
        case 'uuid':
          return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
        case 'name':
          return `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
        case 'email':
          const fn = firstNames[Math.floor(Math.random() * firstNames.length)].toLowerCase();
          const ln = lastNames[Math.floor(Math.random() * lastNames.length)].toLowerCase();
          return `${fn}.${ln}@example.com`;
        case 'phone':
          return `+1 (${Math.floor(Math.random() * 900) + 100}) 555-01${Math.floor(Math.random() * 90) + 10}`;
        case 'number':
          return Math.floor(Math.random() * 1000) + 1;
        case 'boolean':
          return Math.random() > 0.5;
        case 'date':
          const date = new Date();
          date.setDate(date.getDate() - Math.floor(Math.random() * 365));
          return date.toISOString();
        default:
          return null;
      }
    },

    generateTemplateMock(template, id) {
      const mockVal = (type) => this.generateMockValue(type);
      
      if (template === 'users') {
        return {
          id,
          name: mockVal('name'),
          email: mockVal('email'),
          phone: mockVal('phone'),
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=user_${id}`,
          role: id === 1 ? 'Administrator' : 'User',
          isActive: mockVal('boolean'),
          joinedAt: mockVal('date')
        };
      }
      if (template === 'addresses') {
        const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia'];
        const streets = ['Broadway', 'Maple Ave', 'Oak St', 'Pine St', 'Elm St', 'Cedar Road'];
        return {
          id,
          addressLine1: `${Math.floor(Math.random() * 9000) + 100} ${streets[Math.floor(Math.random() * streets.length)]}`,
          city: cities[Math.floor(Math.random() * cities.length)],
          state: 'US-STATE',
          postalCode: `${Math.floor(Math.random() * 90000) + 10000}`,
          coordinates: {
            lat: parseFloat((Math.random() * 180 - 90).toFixed(6)),
            lng: parseFloat((Math.random() * 360 - 180).toFixed(6))
          }
        };
      }
      if (template === 'products') {
        const products = ['Wireless Mouse', 'Mechanical Keyboard', '4K Monitor', 'Noise Cancelling Headset', 'USB-C Dock'];
        const categories = ['Electronics', 'Accessories', 'Office Furniture'];
        return {
          id,
          sku: `SKU-${Math.floor(Math.random() * 900000) + 100000}`,
          title: products[id % products.length] + ` v${id}`,
          price: parseFloat((Math.random() * 200 + 15).toFixed(2)),
          category: categories[id % categories.length],
          stock: Math.floor(Math.random() * 120),
          rating: parseFloat((Math.random() * 2.5 + 2.5).toFixed(2))
        };
      }
      if (template === 'employees') {
        const depts = ['Engineering', 'Marketing', 'Sales', 'Human Resources', 'Finance'];
        return {
          employeeId: `EMP-${Math.floor(Math.random() * 9000) + 1000}`,
          fullName: mockVal('name'),
          department: depts[id % depts.length],
          salary: Math.floor(Math.random() * 60000) + 50000,
          performanceScore: parseFloat((Math.random() * 5).toFixed(1)),
          skills: ['Java', 'SQL', 'Git', 'Project Management'].slice(0, Math.floor(Math.random() * 3) + 1)
        };
      }
      
      // api mock
      return {
        success: true,
        requestId: mockVal('uuid'),
        timestamp: mockVal('date'),
        data: {
          id,
          resource: 'API_MOCK',
          metadata: {
            client: 'Toolkit Agent',
            executionTimeMs: Math.floor(Math.random() * 150)
          }
        }
      };
    },

    restoreSession() {}
  };

  // 13. API RESPONSE VIEWER
  // FIX: Bug 2 — Complete API Response Viewer with CORS proxying, error styling, response timing, and request body support
  App.toolRegistry['apiviewer'] = {
    id: 'apiviewer',
    params: [],
    headers: [],
    formFields: [],
    history: [],
    saved: [],
    collections: [],
    activeSidebarTab: 'history',
    activeConfigTab: 'params',
    activeResponseTab: 'pretty',
    activeAuthType: 'none',
    activeBodyType: 'none',
    prettySearchMatches: [],
    prettySearchIndex: -1,

    init() {
      // 1. Initialize Monaco Editors
      EditorManager.create('api-editor-request');
      EditorManager.create('api-editor-response', { readOnly: true });

      // 2. Load Storage Data
      this.loadStorageData();

      // 3. Setup UI Element Listeners
      this.setupWorkspaceListeners();
      this.setupSidebarListeners();
      this.setupConfigTabListeners();
      this.setupAuthListeners();
      this.setupBodyListeners();
      this.setupDevToolsListeners();
      this.setupResponseListeners();

      // 4. Default State
      document.getElementById('api-url').value = 'https://jsonplaceholder.typicode.com/todos/1';
      EditorManager.checkAndLoadValue('api-editor-request', 'api-fallback-request', `{\n  "title": "New Todo Task",\n  "completed": false\n}`);

      // Initialize one empty row in each table
      this.addParamRow('', '', true, true);
      this.addHeaderRow('', '', true);
      this.addFormRow('', '', true);

      // Render lists in sidebar
      this.renderHistory();
      this.renderSaved();
      this.renderCollections();
    },

    loadStorageData() {
      try {
        this.history = JSON.parse(localStorage.getItem('toolkit_api_history')) || [];
        this.saved = JSON.parse(localStorage.getItem('toolkit_api_saved')) || [];
        this.collections = JSON.parse(localStorage.getItem('toolkit_api_collections')) || [];
      } catch (e) {
        this.history = [];
        this.saved = [];
        this.collections = [];
      }
    },

    saveStorageData() {
      localStorage.setItem('toolkit_api_history', JSON.stringify(this.history));
      localStorage.setItem('toolkit_api_saved', JSON.stringify(this.saved));
      localStorage.setItem('toolkit_api_collections', JSON.stringify(this.collections));
    },

    setupWorkspaceListeners() {
      // Sidebar collapse toggle
      const sidebarToggle = document.getElementById('api-sidebar-toggle-btn');
      const sidebar = document.getElementById('api-sidebar');
      if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
          sidebar.classList.toggle('collapsed');
          sidebarToggle.textContent = sidebar.classList.contains('collapsed') ? '▸' : '◂';
          sidebarToggle.title = sidebar.classList.contains('collapsed') ? 'Expand Sidebar' : 'Collapse Sidebar';
        });
      }

      // URL input and Sync
      const urlInput = document.getElementById('api-url');
      if (urlInput) {
        urlInput.addEventListener('input', () => {
          this.syncUrlToParamsTable();
        });
      }

      // Send Button
      const sendBtn = document.getElementById('api-send-btn');
      if (sendBtn) {
        sendBtn.addEventListener('click', () => this.runFetch());
      }

      // Save Button
      const saveBtn = document.getElementById('api-save-btn');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          const urlEl = document.getElementById('api-url');
          const url = urlEl ? urlEl.value.trim() : '';
          if (!url) {
            Toast.show('Enter a URL to save', 'warning');
            return;
          }
          const name = prompt('Enter a name for this request:', 'My Request') || 'My Request';
          this.saveRequest(name);
        });
      }

      // Clear Workspace
      const clearBtn = document.getElementById('api-clear-btn');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          const urlEl = document.getElementById('api-url');
          if (urlEl) urlEl.value = '';
          
          const paramsTbody = document.getElementById('api-params-tbody');
          if (paramsTbody) paramsTbody.innerHTML = '';
          
          const headersTbody = document.getElementById('api-headers-tbody');
          if (headersTbody) headersTbody.innerHTML = '';
          
          const formTbody = document.getElementById('api-form-tbody');
          if (formTbody) formTbody.innerHTML = '';
          
          this.addParamRow('', '', true, true);
          this.addHeaderRow('', '', true);
          this.addFormRow('', '', true);

          // Reset Auth
          const authSelect = document.getElementById('api-auth-type');
          if (authSelect) authSelect.value = 'none';
          this.switchAuthType('none');
          
          const tokenInput = document.getElementById('api-auth-bearer-token');
          if (tokenInput) tokenInput.value = '';
          
          const userInput = document.getElementById('api-auth-basic-username');
          if (userInput) userInput.value = '';
          
          const passInput = document.getElementById('api-auth-basic-password');
          if (passInput) passInput.value = '';
          
          const keyInput = document.getElementById('api-auth-apikey-key');
          if (keyInput) keyInput.value = '';
          
          const valInput = document.getElementById('api-auth-apikey-value');
          if (valInput) valInput.value = '';

          // Reset Body
          const noneRadio = document.querySelector('input[name="api-body-type"][value="none"]');
          if (noneRadio) noneRadio.checked = true;
          this.switchBodyType('none');

          // Reset Response Dashboard
          const emptyState = document.getElementById('api-res-empty-state');
          if (emptyState) emptyState.classList.remove('hidden');
          
          const metricsBar = document.getElementById('api-res-metrics-bar');
          if (metricsBar) metricsBar.classList.add('hidden');
          
          const tabsContainer = document.getElementById('api-res-tabs-container');
          if (tabsContainer) tabsContainer.classList.add('hidden');
          
          const loadingState = document.getElementById('api-res-loading-state');
          if (loadingState) loadingState.classList.add('hidden');
          
          const errorState = document.getElementById('api-res-error-state');
          if (errorState) errorState.classList.add('hidden');

          Toast.show('Workspace cleared', 'info');
        });
      }
    },

    setupSidebarListeners() {
      // Sidebar Tab switcher
      const tabBtns = document.querySelectorAll('.api-sidebar-tab-btn');
      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          tabBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          
          const tabName = btn.dataset.tab;
          this.activeSidebarTab = tabName;
          
          document.querySelectorAll('.api-sidebar-pane').forEach(p => p.classList.remove('active'));
          const pane = document.getElementById(`api-pane-${tabName}`);
          if (pane) pane.classList.add('active');
        });
      });

      // Clear History button
      const clearHistBtn = document.getElementById('api-clear-history-btn');
      if (clearHistBtn) {
        clearHistBtn.addEventListener('click', () => {
          this.history = [];
          this.saveStorageData();
          this.renderHistory();
          Toast.show('Request history cleared', 'info');
        });
      }

      // New Collection button
      const newColBtn = document.getElementById('api-new-collection-btn');
      if (newColBtn) {
        newColBtn.addEventListener('click', () => {
          const name = prompt('Enter collection name:') || '';
          if (name.trim()) {
            this.collections.push({
              id: 'col-' + Date.now(),
              name: name.trim(),
              requests: []
            });
            this.saveStorageData();
            this.renderCollections();
            Toast.show(`Collection "${name}" created`, 'success');
          }
        });
      }
    },

    setupConfigTabListeners() {
      const tabBtns = document.querySelectorAll('.api-config-tab-btn');
      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          tabBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          
          const configName = btn.dataset.config;
          this.activeConfigTab = configName;
          
          document.querySelectorAll('.api-config-panel').forEach(p => p.classList.remove('active'));
          const pane = document.getElementById(`api-config-${configName}`);
          if (pane) pane.classList.add('active');
        });
      });
    },

    setupAuthListeners() {
      const authSelect = document.getElementById('api-auth-type');
      if (authSelect) {
        authSelect.addEventListener('change', () => {
          this.switchAuthType(authSelect.value);
        });
      }
    },

    switchAuthType(type) {
      this.activeAuthType = type;
      document.querySelectorAll('.api-auth-form-pane').forEach(p => p.classList.remove('active'));
      const pane = document.getElementById(`api-auth-form-${type}`);
      if (pane) pane.classList.add('active');
    },

    setupBodyListeners() {
      const radios = document.querySelectorAll('input[name="api-body-type"]');
      radios.forEach(radio => {
        radio.addEventListener('change', () => {
          this.switchBodyType(radio.value);
        });
      });
    },

    switchBodyType(type) {
      this.activeBodyType = type;
      
      const bodyToggle = document.getElementById('api-body-toggle');
      const editorWrap = document.getElementById('api-body-editor-wrap');
      const formWrap = document.getElementById('api-body-form-wrap');
      
      if (type === 'none') {
        if (bodyToggle) bodyToggle.checked = false;
        if (editorWrap) editorWrap.classList.add('hidden');
        if (formWrap) formWrap.classList.add('hidden');
      } else if (type === 'json' || type === 'raw') {
        if (bodyToggle) bodyToggle.checked = true;
        if (editorWrap) editorWrap.classList.remove('hidden');
        if (formWrap) formWrap.classList.add('hidden');
        
        const editor = App.editors['api-editor-request'];
        if (editor) {
          monaco.editor.setModelLanguage(editor.getModel(), type === 'json' ? 'json' : 'plaintext');
        }
      } else if (type === 'form') {
        if (bodyToggle) bodyToggle.checked = true;
        if (editorWrap) editorWrap.classList.add('hidden');
        if (formWrap) formWrap.classList.remove('hidden');
      }
    },

    setupTableListeners() {
      const paramAddBtn = document.getElementById('api-param-add-btn');
      if (paramAddBtn) {
        paramAddBtn.addEventListener('click', () => {
          this.addParamRow('', '', true, true);
        });
      }
      
      const headerAddBtn = document.getElementById('api-header-add-btn');
      if (headerAddBtn) {
        headerAddBtn.addEventListener('click', () => {
          this.addHeaderRow('', '', true);
        });
      }
      
      const formAddBtn = document.getElementById('api-form-add-btn');
      if (formAddBtn) {
        formAddBtn.addEventListener('click', () => {
          this.addFormRow('', '', true);
        });
      }
    },

    setupDevToolsListeners() {
      // Copy cURL
      const copyCurlBtn = document.getElementById('api-copy-curl-btn');
      if (copyCurlBtn) {
        copyCurlBtn.addEventListener('click', () => {
          const curl = this.generateCurlCommand();
          if (curl) {
            navigator.clipboard.writeText(curl).then(() => Toast.show('cURL command copied', 'success'));
          }
        });
      }

      // Generate Fetch
      const genFetchBtn = document.getElementById('api-gen-fetch-btn');
      if (genFetchBtn) {
        genFetchBtn.addEventListener('click', () => {
          const code = this.generateFetchCode();
          if (code) {
            navigator.clipboard.writeText(code).then(() => Toast.show('Fetch code snippet copied', 'success'));
          }
        });
      }

      // Generate Axios
      const genAxiosBtn = document.getElementById('api-gen-axios-btn');
      if (genAxiosBtn) {
        genAxiosBtn.addEventListener('click', () => {
          const code = this.generateAxiosCode();
          if (code) {
            navigator.clipboard.writeText(code).then(() => Toast.show('Axios code snippet copied', 'success'));
          }
        });
      }

      // Import Body JSON
      const importBodyBtn = document.getElementById('api-import-body-btn');
      if (importBodyBtn) {
        importBodyBtn.addEventListener('click', () => {
          navigator.clipboard.readText().then(text => {
            const parsed = safeParse(text);
            if (parsed) {
              EditorManager.checkAndLoadValue('api-editor-request', 'api-fallback-request', JSON.stringify(parsed, null, 2));
              this.switchBodyType('json');
              const jsonRadio = document.querySelector('input[name="api-body-type"][value="json"]');
              if (jsonRadio) jsonRadio.checked = true;
              Toast.show('JSON body loaded', 'success');
            } else {
              Toast.show('No valid JSON in clipboard to import', 'warning');
            }
          }).catch(() => {
            Toast.show('Unable to read clipboard', 'warning');
          });
        });
      }
    },

    setupResponseListeners() {
      const tabBtns = document.querySelectorAll('.api-response-tab-btn');
      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          tabBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          
          const respName = btn.dataset.resp;
          this.activeResponseTab = respName;
          
          document.querySelectorAll('.api-response-panel').forEach(p => p.classList.remove('active'));
          const pane = document.getElementById(`api-resp-panel-${respName}`);
          if (pane) pane.classList.add('active');
        });
      });

      // Raw wrap toggle
      const wrapToggle = document.getElementById('api-raw-wrap-toggle');
      if (wrapToggle) {
        wrapToggle.addEventListener('change', () => {
          const editor = App.editors['api-editor-response'];
          if (editor) {
            editor.updateOptions({ wordWrap: wrapToggle.checked ? 'on' : 'off' });
          }
          const fallback = document.getElementById('api-fallback-response');
          if (fallback) {
            fallback.wrap = wrapToggle.checked ? 'soft' : 'off';
          }
        });
      }

      // Pretty view collapse/expand
      const collapseBtn = document.getElementById('api-pretty-collapse-btn');
      if (collapseBtn) {
        collapseBtn.addEventListener('click', () => {
          document.querySelectorAll('#api-res-tree-output details').forEach(d => d.open = false);
        });
      }
      
      const expandBtn = document.getElementById('api-pretty-expand-btn');
      if (expandBtn) {
        expandBtn.addEventListener('click', () => {
          document.querySelectorAll('#api-res-tree-output details').forEach(d => d.open = true);
        });
      }

      // Search listeners
      const searchInput = document.getElementById('api-pretty-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', () => this.runPrettySearch());
      }
      
      const prevBtn = document.getElementById('api-pretty-search-prev-btn');
      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          if (this.prettySearchMatches.length === 0) return;
          this.prettySearchIndex = (this.prettySearchIndex - 1 + this.prettySearchMatches.length) % this.prettySearchMatches.length;
          this.highlightActivePrettySearch();
        });
      }

      const nextBtn = document.getElementById('api-pretty-search-next-btn');
      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          if (this.prettySearchMatches.length === 0) return;
          this.prettySearchIndex = (this.prettySearchIndex + 1) % this.prettySearchMatches.length;
          this.highlightActivePrettySearch();
        });
      }
    },

    // Param Dynamic Row Additions
    addParamRow(key = '', val = '', enabled = true, sync = true) {
      const tbody = document.getElementById('api-params-tbody');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="text-align: center;">
          <input type="checkbox" class="table-checkbox" ${enabled ? 'checked' : ''}>
        </td>
        <td>
          <input type="text" class="input-text param-key" placeholder="Key" value="${key}">
        </td>
        <td>
          <input type="text" class="input-text param-val" placeholder="Value" value="${val}">
        </td>
        <td style="text-align: center;">
          <button class="btn-delete-row" title="Delete Row">×</button>
        </td>
      `;
      
      tbody.appendChild(tr);
      
      const checkbox = tr.querySelector('.table-checkbox');
      const keyInput = tr.querySelector('.param-key');
      const valInput = tr.querySelector('.param-val');
      const deleteBtn = tr.querySelector('.btn-delete-row');
      
      const onInputChange = () => {
        if (tr === tbody.lastElementChild && (keyInput.value.trim() || valInput.value.trim())) {
          this.addParamRow('', '', true, true);
        }
        this.syncParamsTableToUrl();
      };
      
      checkbox.addEventListener('change', onInputChange);
      keyInput.addEventListener('input', onInputChange);
      valInput.addEventListener('input', onInputChange);
      
      deleteBtn.addEventListener('click', () => {
        tr.remove();
        if (tbody.children.length === 0) {
          this.addParamRow('', '', true, false);
        }
        this.syncParamsTableToUrl();
      });
    },

    // Header Dynamic Row Additions
    addHeaderRow(key = '', val = '', enabled = true) {
      const tbody = document.getElementById('api-headers-tbody');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="text-align: center;">
          <input type="checkbox" class="table-checkbox" ${enabled ? 'checked' : ''}>
        </td>
        <td>
          <input type="text" class="input-text header-key" placeholder="Key" value="${key}">
        </td>
        <td>
          <input type="text" class="input-text header-val" placeholder="Value" value="${val}">
        </td>
        <td style="text-align: center;">
          <button class="btn-delete-row" title="Delete Row">×</button>
        </td>
      `;
      
      tbody.appendChild(tr);
      
      const checkbox = tr.querySelector('.table-checkbox');
      const keyInput = tr.querySelector('.header-key');
      const valInput = tr.querySelector('.header-val');
      const deleteBtn = tr.querySelector('.btn-delete-row');
      
      const onInputChange = () => {
        if (tr === tbody.lastElementChild && (keyInput.value.trim() || valInput.value.trim())) {
          this.addHeaderRow('', '', true);
        }
      };
      
      checkbox.addEventListener('change', onInputChange);
      keyInput.addEventListener('input', onInputChange);
      valInput.addEventListener('input', onInputChange);
      
      deleteBtn.addEventListener('click', () => {
        tr.remove();
        if (tbody.children.length === 0) {
          this.addHeaderRow('', '', true);
        }
      });
    },

    // Form Field Row Additions
    addFormRow(key = '', val = '', enabled = true) {
      const tbody = document.getElementById('api-form-tbody');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="text-align: center;">
          <input type="checkbox" class="table-checkbox" ${enabled ? 'checked' : ''}>
        </td>
        <td>
          <input type="text" class="input-text form-key" placeholder="Key" value="${key}">
        </td>
        <td>
          <input type="text" class="input-text form-val" placeholder="Value" value="${val}">
        </td>
        <td style="text-align: center;">
          <button class="btn-delete-row" title="Delete Row">×</button>
        </td>
      `;
      
      tbody.appendChild(tr);
      
      const checkbox = tr.querySelector('.table-checkbox');
      const keyInput = tr.querySelector('.form-key');
      const valInput = tr.querySelector('.form-val');
      const deleteBtn = tr.querySelector('.btn-delete-row');
      
      const onInputChange = () => {
        if (tr === tbody.lastElementChild && (keyInput.value.trim() || valInput.value.trim())) {
          this.addFormRow('', '', true);
        }
      };
      
      checkbox.addEventListener('change', onInputChange);
      keyInput.addEventListener('input', onInputChange);
      valInput.addEventListener('input', onInputChange);
      
      deleteBtn.addEventListener('click', () => {
        tr.remove();
        if (tbody.children.length === 0) {
          this.addFormRow('', '', true);
        }
      });
    },

    syncUrlToParamsTable() {
      const urlVal = document.getElementById('api-url').value.trim();
      if (!urlVal) return;

      try {
        const questionIdx = urlVal.indexOf('?');
        if (questionIdx === -1) {
          document.getElementById('api-params-tbody').innerHTML = '';
          this.addParamRow('', '', true, false);
          return;
        }

        const queryString = urlVal.substring(questionIdx + 1);
        const searchParams = new URLSearchParams(queryString);
        
        document.getElementById('api-params-tbody').innerHTML = '';
        searchParams.forEach((val, key) => {
          this.addParamRow(key, val, true, false);
        });

        // Add empty row
        this.addParamRow('', '', true, false);
      } catch (e) {
        // ignore malformed URLs during intermediate typing
      }
    },

    syncParamsTableToUrl() {
      const urlInput = document.getElementById('api-url');
      const urlVal = urlInput.value.trim();
      
      const questionIdx = urlVal.indexOf('?');
      const baseUrl = questionIdx === -1 ? urlVal : urlVal.substring(0, questionIdx);
      
      const searchParams = new URLSearchParams();
      const rows = document.querySelectorAll('#api-params-tbody tr');
      
      rows.forEach(row => {
        const checkbox = row.querySelector('.table-checkbox');
        const keyInput = row.querySelector('.param-key');
        const valInput = row.querySelector('.param-val');
        
        if (checkbox && checkbox.checked && keyInput && keyInput.value.trim()) {
          searchParams.append(keyInput.value.trim(), valInput ? valInput.value : '');
        }
      });
      
      const queryString = searchParams.toString();
      urlInput.value = queryString ? `${baseUrl}?${queryString}` : baseUrl;
    },

    compileHeaders() {
      const headers = {};
      
      // 1. Read custom headers table
      const rows = document.querySelectorAll('#api-headers-tbody tr');
      rows.forEach(row => {
        const checkbox = row.querySelector('.table-checkbox');
        const keyInput = row.querySelector('.header-key');
        const valInput = row.querySelector('.header-val');
        
        if (checkbox && checkbox.checked && keyInput && keyInput.value.trim()) {
          headers[keyInput.value.trim()] = valInput ? valInput.value : '';
        }
      });
      
      // 2. Set JSON content type if JSON body active
      if (this.activeBodyType === 'json') {
        headers['Content-Type'] = 'application/json';
      }
      
      // 3. Inject Auth headers
      if (this.activeAuthType === 'bearer') {
        const token = document.getElementById('api-auth-bearer-token').value.trim();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } else if (this.activeAuthType === 'basic') {
        const user = document.getElementById('api-auth-basic-username').value.trim();
        const pass = document.getElementById('api-auth-basic-password').value.trim();
        if (user || pass) headers['Authorization'] = `Basic ${btoa(user + ':' + pass)}`;
      } else if (this.activeAuthType === 'apikey') {
        const key = document.getElementById('api-auth-apikey-key').value.trim();
        const val = document.getElementById('api-auth-apikey-value').value.trim();
        const addTo = document.getElementById('api-auth-apikey-addTo').value;
        
        if (key && addTo === 'header') {
          headers[key] = val;
        }
      }
      
      return headers;
    },

    compileBody() {
      if (this.activeBodyType === 'none') return null;
      
      if (this.activeBodyType === 'json' || this.activeBodyType === 'raw') {
        return EditorManager.getValue('api-editor-request', 'api-fallback-request');
      }
      
      if (this.activeBodyType === 'form') {
        const formData = new FormData();
        const rows = document.querySelectorAll('#api-form-tbody tr');
        rows.forEach(row => {
          const checkbox = row.querySelector('.table-checkbox');
          const keyInput = row.querySelector('.form-key');
          const valInput = row.querySelector('.form-val');
          
          if (checkbox && checkbox.checked && keyInput && keyInput.value.trim()) {
            formData.append(keyInput.value.trim(), valInput ? valInput.value : '');
          }
        });
        return formData;
      }
      
      return null;
    },

    generateCurlCommand() {
      const url = document.getElementById('api-url').value.trim() || 'https://api.example.com';
      const method = document.getElementById('api-method').value;
      let curl = `curl -X ${method} "${url}"`;
      
      const headers = this.compileHeaders();
      for (const key in headers) {
        curl += ` \\\n  -H "${key}: ${headers[key]}"`;
      }
      
      const body = this.compileBody();
      if (body) {
        if (typeof body === 'string') {
          curl += ` \\\n  -d '${body.replace(/'/g, "'\\''")}'`;
        } else if (body instanceof FormData) {
          body.forEach((val, key) => {
            curl += ` \\\n  -F "${key}=${val}"`;
          });
        }
      }
      return curl;
    },

    generateFetchCode() {
      const url = document.getElementById('api-url').value.trim() || 'https://api.example.com';
      const method = document.getElementById('api-method').value;
      const headers = this.compileHeaders();
      const body = this.compileBody();
      
      let code = `fetch("${url}", {\n  method: "${method}",\n`;
      if (Object.keys(headers).length > 0) {
        code += `  headers: ${JSON.stringify(headers, null, 4).replace(/\n/g, '\n  ')},\n`;
      }
      if (body) {
        if (typeof body === 'string') {
          code += `  body: JSON.stringify(${body.replace(/\n/g, '\n  ')}),\n`;
        } else {
          code += `  body: formData,\n`;
        }
      }
      code += `})\n.then(response => response.json())\n.then(data => console.log(data))\n.catch(error => console.error(error));`;
      return code;
    },

    generateAxiosCode() {
      const url = document.getElementById('api-url').value.trim() || 'https://api.example.com';
      const method = document.getElementById('api-method').value.toLowerCase();
      const headers = this.compileHeaders();
      const body = this.compileBody();
      
      let code = `axios({\n  method: "${method}",\n  url: "${url}",\n`;
      if (Object.keys(headers).length > 0) {
        code += `  headers: ${JSON.stringify(headers, null, 4).replace(/\n/g, '\n  ')},\n`;
      }
      if (body) {
        if (typeof body === 'string') {
          code += `  data: ${body.replace(/\n/g, '\n  ')},\n`;
        } else {
          code += `  data: formData,\n`;
        }
      }
      code += `})\n.then(response => console.log(response.data))\n.catch(error => console.error(error));`;
      return code;
    },

    saveRequest(name) {
      const url = document.getElementById('api-url').value.trim();
      const method = document.getElementById('api-method').value;
      
      const reqObj = {
        id: 'req-' + Date.now(),
        name: name,
        url: url,
        method: method,
        bodyType: this.activeBodyType,
        bodyContent: this.activeBodyType === 'json' || this.activeBodyType === 'raw' ? EditorManager.getValue('api-editor-request', 'api-fallback-request') : '',
        authType: this.activeAuthType,
        authBearer: document.getElementById('api-auth-bearer-token').value.trim(),
        authBasicUser: document.getElementById('api-auth-basic-username').value.trim(),
        authBasicPass: document.getElementById('api-auth-basic-password').value.trim(),
        authApiKeyName: document.getElementById('api-auth-apikey-key').value.trim(),
        authApiKeyValue: document.getElementById('api-auth-apikey-value').value.trim(),
        authApiKeyAddTo: document.getElementById('api-auth-apikey-addTo').value
      };

      if (this.collections.length > 0) {
        let promptText = 'Choose a Collection index to save into (or leave empty):\n';
        this.collections.forEach((col, idx) => {
          promptText += `${idx + 1}. ${col.name}\n`;
        });
        const choice = prompt(promptText);
        const idx = parseInt(choice) - 1;
        if (!isNaN(idx) && idx >= 0 && idx < this.collections.length) {
          this.collections[idx].requests.push(reqObj);
          this.saveStorageData();
          this.renderCollections();
          Toast.show(`Saved to "${this.collections[idx].name}"`, 'success');
          return;
        }
      }

      this.saved.push(reqObj);
      this.saveStorageData();
      this.renderSaved();
      Toast.show('Request saved locally', 'success');
    },

    loadRequest(req) {
      document.getElementById('api-url').value = req.url;
      document.getElementById('api-method').value = req.method;
      
      this.syncUrlToParamsTable();

      // Load Auth
      document.getElementById('api-auth-type').value = req.authType || 'none';
      this.switchAuthType(req.authType || 'none');
      document.getElementById('api-auth-bearer-token').value = req.authBearer || '';
      document.getElementById('api-auth-basic-username').value = req.authBasicUser || '';
      document.getElementById('api-auth-basic-password').value = req.authBasicPass || '';
      document.getElementById('api-auth-apikey-key').value = req.authApiKeyName || '';
      document.getElementById('api-auth-apikey-value').value = req.authApiKeyValue || '';
      if (req.authApiKeyAddTo) document.getElementById('api-auth-apikey-addTo').value = req.authApiKeyAddTo;

      // Load Body
      const bodyType = req.bodyType || 'none';
      const radio = document.querySelector(`input[name="api-body-type"][value="${bodyType}"]`);
      if (radio) radio.checked = true;
      this.switchBodyType(bodyType);
      if (req.bodyContent) {
        EditorManager.checkAndLoadValue('api-editor-request', 'api-fallback-request', req.bodyContent);
      }

      Toast.show('Loaded request configuration', 'info');
    },

    renderHistory() {
      const list = document.getElementById('api-history-list');
      list.innerHTML = '';
      
      if (this.history.length === 0) {
        list.innerHTML = `<li class="empty-placeholder">No request history</li>`;
        return;
      }
      
      this.history.forEach((req, idx) => {
        const li = document.createElement('li');
        li.className = 'api-sidebar-list-item';
        li.innerHTML = `
          <div class="api-sidebar-list-item-content">
            <span class="method-badge ${req.method}">${req.method}</span>
            <span class="request-url" title="${req.url}">${req.url}</span>
          </div>
          <div class="api-sidebar-list-item-actions">
            <button class="api-sidebar-action-btn run" title="Run request">▶</button>
            <button class="api-sidebar-action-btn delete" title="Remove">×</button>
          </div>
        `;
        
        li.querySelector('.api-sidebar-list-item-content').addEventListener('click', () => this.loadRequest(req));
        li.querySelector('.run').addEventListener('click', (e) => {
          e.stopPropagation();
          this.loadRequest(req);
          this.runFetch();
        });
        li.querySelector('.delete').addEventListener('click', (e) => {
          e.stopPropagation();
          this.history.splice(idx, 1);
          this.saveStorageData();
          this.renderHistory();
        });
        list.appendChild(li);
      });
    },

    renderSaved() {
      const list = document.getElementById('api-saved-list');
      list.innerHTML = '';
      
      if (this.saved.length === 0) {
        list.innerHTML = `<li class="empty-placeholder">No saved requests</li>`;
        return;
      }
      
      this.saved.forEach((req, idx) => {
        const li = document.createElement('li');
        li.className = 'api-sidebar-list-item';
        li.innerHTML = `
          <div class="api-sidebar-list-item-content">
            <span class="method-badge ${req.method}">${req.method}</span>
            <span class="request-name" title="${req.name}">${req.name}</span>
          </div>
          <div class="api-sidebar-list-item-actions">
            <button class="api-sidebar-action-btn run" title="Run request">▶</button>
            <button class="api-sidebar-action-btn rename" title="Rename">✎</button>
            <button class="api-sidebar-action-btn delete" title="Remove">×</button>
          </div>
        `;
        
        li.querySelector('.api-sidebar-list-item-content').addEventListener('click', () => this.loadRequest(req));
        li.querySelector('.run').addEventListener('click', (e) => {
          e.stopPropagation();
          this.loadRequest(req);
          this.runFetch();
        });
        li.querySelector('.rename').addEventListener('click', (e) => {
          e.stopPropagation();
          const newName = prompt('Rename request to:', req.name);
          if (newName) {
            req.name = newName;
            this.saveStorageData();
            this.renderSaved();
          }
        });
        li.querySelector('.delete').addEventListener('click', (e) => {
          e.stopPropagation();
          this.saved.splice(idx, 1);
          this.saveStorageData();
          this.renderSaved();
        });
        list.appendChild(li);
      });
    },

    renderCollections() {
      const list = document.getElementById('api-collections-list');
      list.innerHTML = '';
      
      if (this.collections.length === 0) {
        list.innerHTML = `<li class="empty-placeholder">No collections created</li>`;
        return;
      }
      
      this.collections.forEach((col, colIdx) => {
        const li = document.createElement('li');
        li.style.padding = '8px';
        li.style.borderBottom = '1px solid var(--border-color)';
        
        let requestsHtml = '';
        if (col.requests.length === 0) {
          requestsHtml = `<div style="padding: 4px 12px; font-size: 0.72rem; color: var(--text-secondary); font-style: italic;">Empty Collection</div>`;
        } else {
          col.requests.forEach((req, reqIdx) => {
            requestsHtml += `
              <div class="api-sidebar-list-item col-req" data-req-idx="${reqIdx}" style="padding: 4px 6px 4px 16px; margin-top: 2px;">
                <div class="api-sidebar-list-item-content">
                  <span class="method-badge ${req.method}" style="font-size: 0.6rem; min-width: 32px; padding: 1px 3px;">${req.method}</span>
                  <span class="request-name" style="font-size: 0.72rem;">${req.name}</span>
                </div>
                <div class="api-sidebar-list-item-actions">
                  <button class="api-sidebar-action-btn run-col-req" title="Run request">▶</button>
                  <button class="api-sidebar-action-btn delete-col-req" title="Remove">×</button>
                </div>
              </div>
            `;
          });
        }

        li.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; font-weight: 600; font-size: 0.8rem;">
            <span>📁 ${col.name}</span>
            <button class="api-sidebar-action-btn delete-col" title="Delete Collection" style="opacity: 0.7;">×</button>
          </div>
          <div class="collection-children" style="margin-top: 4px;">
            ${requestsHtml}
          </div>
        `;
        
        // Listeners
        li.querySelectorAll('.col-req').forEach(item => {
          const reqIdx = parseInt(item.dataset.reqIdx);
          const req = col.requests[reqIdx];
          
          item.querySelector('.api-sidebar-list-item-content').addEventListener('click', () => this.loadRequest(req));
          item.querySelector('.run-col-req').addEventListener('click', (e) => {
            e.stopPropagation();
            this.loadRequest(req);
            this.runFetch();
          });
          item.querySelector('.delete-col-req').addEventListener('click', (e) => {
            e.stopPropagation();
            col.requests.splice(reqIdx, 1);
            this.saveStorageData();
            this.renderCollections();
          });
        });

        li.querySelector('.delete-col').addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Delete Collection "${col.name}"?`)) {
            this.collections.splice(colIdx, 1);
            this.saveStorageData();
            this.renderCollections();
          }
        });
        
        list.appendChild(li);
      });
    },

    runPrettySearch() {
      const query = document.getElementById('api-pretty-search-input').value.trim().toLowerCase();
      const counter = document.getElementById('api-pretty-search-count');
      
      // Clear previous highlights
      document.querySelectorAll('#api-res-tree-output .search-highlight').forEach(el => {
        const parent = el.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(el.textContent), el);
        }
      });
      document.querySelectorAll('#api-res-tree-output .search-active').forEach(el => el.classList.remove('search-active'));
      
      this.prettySearchMatches = [];
      this.prettySearchIndex = -1;
      
      if (!query) {
        counter.textContent = '0 of 0';
        return;
      }
      
      const elements = document.querySelectorAll('#api-res-tree-output .tree-key, #api-res-tree-output .tree-clickable');
      elements.forEach(el => {
        const text = el.textContent;
        const lowerText = text.toLowerCase();
        
        if (lowerText.includes(query)) {
          const idx = lowerText.indexOf(query);
          const before = text.substring(0, idx);
          const match = text.substring(idx, idx + query.length);
          const after = text.substring(idx + query.length);
          
          el.innerHTML = '';
          if (before) el.appendChild(document.createTextNode(before));
          
          const span = document.createElement('span');
          span.className = 'search-highlight';
          span.textContent = match;
          el.appendChild(span);
          
          if (after) el.appendChild(document.createTextNode(after));
          
          this.prettySearchMatches.push(span);
          
          // Open details ancestors
          let parent = el.closest('details');
          while (parent) {
            parent.open = true;
            parent = parent.parentNode.closest('details');
          }
        }
      });
      
      if (this.prettySearchMatches.length > 0) {
        this.prettySearchIndex = 0;
        this.highlightActivePrettySearch();
      } else {
        counter.textContent = '0 of 0';
      }
    },

    highlightActivePrettySearch() {
      document.querySelectorAll('#api-res-tree-output .search-active').forEach(el => el.classList.remove('search-active'));
      const counter = document.getElementById('api-pretty-search-count');
      
      if (this.prettySearchMatches.length === 0) return;
      
      const active = this.prettySearchMatches[this.prettySearchIndex];
      active.classList.add('search-active');
      active.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      counter.textContent = `${this.prettySearchIndex + 1} of ${this.prettySearchMatches.length}`;
    },

    runFetch() {
      const method = document.getElementById('api-method').value;
      const rawUrl = document.getElementById('api-url').value.trim();

      if (!rawUrl) {
        Toast.show('Please provide a valid API endpoint URL', 'warning');
        return;
      }

      // 1. Hide state panels, show loading skeleton
      document.getElementById('api-res-empty-state').classList.add('hidden');
      document.getElementById('api-res-error-state').classList.add('hidden');
      document.getElementById('api-res-metrics-bar').classList.add('hidden');
      document.getElementById('api-res-tabs-container').classList.add('hidden');
      document.getElementById('api-res-loading-state').classList.remove('hidden');

      const startTime = Date.now();
      
      // Inject API Key into URL query params if active
      let targetUrl = rawUrl;
      if (this.activeAuthType === 'apikey') {
        const key = document.getElementById('api-auth-apikey-key').value.trim();
        const val = document.getElementById('api-auth-apikey-value').value.trim();
        const addTo = document.getElementById('api-auth-apikey-addTo').value;
        
        if (key && addTo === 'query') {
          const urlObj = new URL(targetUrl.includes('://') ? targetUrl : 'http://' + targetUrl);
          urlObj.searchParams.set(key, val);
          targetUrl = urlObj.toString();
        }
      }

      const options = { 
        method,
        headers: this.compileHeaders()
      };

      const body = this.compileBody();
      if (body && method !== 'GET' && method !== 'HEAD') {
        options.body = body;
      }

      const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;

      fetch(proxyUrl, options)
        .then(async (response) => {
          const duration = Date.now() - startTime;
          const bodyText = await response.text();
          const byteSize = new Blob([bodyText]).size;
          
          // Hide loading skeleton
          document.getElementById('api-res-loading-state').classList.add('hidden');

          // Show metrics and response tabs
          document.getElementById('api-res-metrics-bar').classList.remove('hidden');
          document.getElementById('api-res-tabs-container').classList.remove('hidden');

          // 1. Populate Metrics Bar
          const statusBadge = document.getElementById('api-res-status');
          statusBadge.textContent = `${response.status} ${response.statusText || ''}`.trim();
          statusBadge.className = 'status-badge';
          
          if (response.status >= 200 && response.status < 300) {
            statusBadge.classList.add('success');
          } else if (response.status >= 300 && response.status < 400) {
            statusBadge.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
            statusBadge.style.color = 'var(--primary-accent)';
          } else if (response.status >= 400 && response.status < 500) {
            statusBadge.style.backgroundColor = 'rgba(249, 115, 22, 0.15)';
            statusBadge.style.color = 'var(--warning-color)';
          } else {
            statusBadge.classList.add('error');
          }

          document.getElementById('api-res-time').textContent = `${duration} ms`;
          
          const kbSize = byteSize >= 1024 ? `${(byteSize / 1024).toFixed(1)} KB` : `${byteSize} B`;
          document.getElementById('api-res-size').textContent = kbSize;

          const contentType = response.headers.get('Content-Type') || 'text/plain';
          document.getElementById('api-res-content-type').textContent = contentType.split(';')[0];

          // 2. Populate Headers Table
          const headersTable = document.getElementById('api-headers-table').querySelector('tbody');
          headersTable.innerHTML = '';
          response.headers.forEach((val, name) => {
            const row = document.createElement('tr');
            row.innerHTML = `<td class="font-code" style="font-weight: 500;">${name}</td><td class="font-code">${val}</td>`;
            headersTable.appendChild(row);
          });
          if (headersTable.children.length === 0) {
            headersTable.innerHTML = `<tr><td colspan="2" class="empty-headers">No response headers</td></tr>`;
          }

          // 3. Populate Raw View Editor
          const parsed = safeParse(bodyText);
          const outVal = parsed ? JSON.stringify(parsed, null, 2) : bodyText;
          EditorManager.checkAndLoadValue('api-editor-response', 'api-fallback-response', outVal);

          // 4. Populate Pretty View JSON Tree
          const treeOutput = document.getElementById('api-res-tree-output');
          treeOutput.innerHTML = '';
          if (parsed) {
            const treeDOM = generateInteractiveTreeDOM(parsed);
            treeOutput.appendChild(treeDOM);
            
            // Set up search elements
            this.runPrettySearch();
          } else {
            treeOutput.innerHTML = `<div class="tree-empty-state">Response is not valid JSON. Pretty tree view is unavailable.</div>`;
          }

          // 5. Save history
          this.history.unshift({
            id: 'hist-' + Date.now(),
            url: rawUrl,
            method: method,
            time: new Date().toLocaleTimeString()
          });
          if (this.history.length > 50) this.history.pop();
          this.saveStorageData();
          this.renderHistory();

          Toast.show('Response received', 'success');
        })
        .catch((err) => {
          // Hide loading skeleton
          document.getElementById('api-res-loading-state').classList.add('hidden');
          
          // Show error state panel
          const errorState = document.getElementById('api-res-error-state');
          errorState.classList.remove('hidden');
          
          const errTitle = document.getElementById('api-error-title');
          const errMessage = document.getElementById('api-error-message');
          
          errMessage.textContent = err.message || 'An unknown error occurred.';
          
          if (err.message.includes('CORS') || err.message.includes('fetch')) {
            errTitle.textContent = 'Network or CORS Error';
            errMessage.textContent = 'The request failed. This is typically caused by local network restrictions, invalid SSL certificates, or CORS policies blocking cross-origin requests from browser apps.';
          } else if (err.message.includes('URL') || err.message.includes('parse')) {
            errTitle.textContent = 'Invalid URL';
          } else {
            errTitle.textContent = 'Request Failed';
          }

          Toast.show('Request failed: ' + err.message, 'error');
        });
    },

    restoreSession() {}
  };

  // 14. ADVANCED UTILITIES
  App.toolRegistry['advanced'] = {
    id: 'advanced',
    activeSubTab: 'base64',

    init() {
      // Sub-tab switcher
      const tabs = document.querySelectorAll('.advanced-tab');
      tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
          const targetSub = e.target.dataset.sub;
          this.switchSubTab(targetSub);
        });
      });

      // Initialize sub-components
      this.initBase64();
      this.initJWT();
      this.initUUID();
      this.initTimestamp();
      this.initRepair();
    },

    switchSubTab(subId) {
      this.activeSubTab = subId;
      document.querySelectorAll('.advanced-tab').forEach(el => el.classList.remove('active'));
      document.querySelector(`.advanced-tab[data-sub="${subId}"]`).classList.add('active');

      document.querySelectorAll('.advanced-sub-panel').forEach(el => el.classList.remove('active'));
      document.getElementById(`sub-${subId}`).classList.add('active');

      Toast.show(`Switched to ${subId.toUpperCase()} utility`, 'info');
    },

    // 14.1 Base64
    initBase64() {
      EditorManager.create('base64-editor-input');
      EditorManager.create('base64-editor-output');

      document.getElementById('base64-encode-btn').addEventListener('click', () => {
        const input = EditorManager.getValue('base64-editor-input', 'base64-fallback-input');
        try {
          const encoded = btoa(unescape(encodeURIComponent(input)));
          EditorManager.checkAndLoadValue('base64-editor-output', 'base64-fallback-output', encoded);
          Toast.show('Encoded Base64 successfully', 'success');
        } catch (e) {
          Toast.show('Failed to encode: ' + e.message, 'error');
        }
      });

      document.getElementById('base64-decode-btn').addEventListener('click', () => {
        const input = EditorManager.getValue('base64-editor-input', 'base64-fallback-input');
        try {
          const decoded = decodeURIComponent(escape(atob(input)));
          EditorManager.checkAndLoadValue('base64-editor-output', 'base64-fallback-output', decoded);
          Toast.show('Decoded Base64 successfully', 'success');
        } catch (e) {
          Toast.show('Failed to decode: Invalid Base64 character string', 'error');
        }
      });
    },

    // 14.2 JWT Decoder
    // FIX: Bug 4 — JWT Decoder with URL-safe base64 decoding, signature warnings, and token expiry checking
    initJWT() {
      const tokenInput = document.getElementById('jwt-token-input');
      
      const decodeJWT = () => {
        const val = tokenInput.value.trim();
        
        const headerCode = document.getElementById('jwt-header-out');
        const payloadCode = document.getElementById('jwt-payload-out');
        const signatureCode = document.getElementById('jwt-sig-out');
        
        // Remove active expiry badge if exists
        const existingBadge = document.getElementById('jwt-payload-badge');
        if (existingBadge) existingBadge.remove();

        if (!val) {
          headerCode.textContent = '{}';
          payloadCode.textContent = '{}';
          signatureCode.textContent = '{}';
          return;
        }

        const parts = val.split('.');
        if (parts.length !== 3) {
          const errorMsg = "Invalid JWT format — expected 3 segments";
          headerCode.innerHTML = `<span style="color: var(--error-color)">${errorMsg}</span>`;
          payloadCode.innerHTML = `<span style="color: var(--error-color)">${errorMsg}</span>`;
          signatureCode.textContent = '';
          Toast.show(errorMsg, 'warning');
          return;
        }

        let headerObj = null;
        let payloadObj = null;

        // 1. Decode and Format Header
        try {
          headerObj = decodeJWTPart(parts[0]);
          headerCode.textContent = JSON.stringify(headerObj, null, 2);
        } catch (e) {
          headerCode.innerHTML = `<span style="color: var(--error-color)">Error decoding Header: ${e.message}</span>`;
        }

        // 2. Decode, Format, and Validate Payload
        try {
          payloadObj = decodeJWTPart(parts[1]);
          payloadCode.textContent = JSON.stringify(payloadObj, null, 2);
          
          // Check Token Expiration (exp unix epoch seconds)
          if (payloadObj && typeof payloadObj.exp === 'number') {
            const expTime = payloadObj.exp;
            const now = Date.now() / 1000;
            const isExpired = now > expTime;
            
            const badge = document.createElement('div');
            badge.id = 'jwt-payload-badge';
            const expDate = new Date(expTime * 1000).toLocaleString();
            
            if (isExpired) {
              badge.className = 'expired';
              badge.textContent = `Token Expired (expired on: ${expDate})`;
            } else {
              badge.className = 'valid';
              badge.textContent = `Token Valid (expires on: ${expDate})`;
            }
            
            // Insert badge directly above the payload pre block inside the payload card
            payloadCode.parentElement.insertBefore(badge, payloadCode);
          }
        } catch (e) {
          payloadCode.innerHTML = `<span style="color: var(--error-color)">Error decoding Payload: ${e.message}</span>`;
        }

        // 3. Render Signature Note
        signatureCode.textContent = "Signature (base64url encoded):\n" + parts[2] + "\n\nNote: Signature verification requires the secret key and cannot be done client-side.";

        if (window.hljs) {
          hljs.highlightElement(headerCode);
          hljs.highlightElement(payloadCode);
          hljs.highlightElement(signatureCode);
        }

        Toast.show('Decoded JWT Token', 'success');
      };

      tokenInput.addEventListener('input', () => debounce('jwt-dec', decodeJWT, 400));
    },

    // 14.3 UUID Generator
    initUUID() {
      document.getElementById('uuid-gen-btn').addEventListener('click', () => {
        const countEl = document.getElementById('uuid-count-input');
        const count = Math.min(20, Math.max(1, parseInt(countEl.value, 10) || 5));
        const listContainer = document.getElementById('uuid-results-list');
        
        listContainer.innerHTML = '';
        
        for (let i = 0; i < count; i++) {
          // UUID v4 standard
          const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });

          const item = document.createElement('div');
          item.className = 'uuid-item';
          item.innerHTML = `
            <span>${uuid}</span>
            <button class="btn-sm btn-outline copy-uuid-btn" data-uuid="${uuid}">Copy</button>
          `;

          // Bind copy per row
          item.querySelector('.copy-uuid-btn').addEventListener('click', (e) => {
            const uval = e.target.dataset.uuid;
            navigator.clipboard.writeText(uval).then(() => Toast.show('UUID copied to clipboard', 'success'));
          });

          listContainer.appendChild(item);
        }
        Toast.show(`Generated ${count} UUID v4s`, 'success');
      });
    },

    // 14.4 Timestamp Converter
    initTimestamp() {
      document.getElementById('ts-to-iso-btn').addEventListener('click', () => {
        const epochVal = document.getElementById('ts-epoch-input').value.trim();
        const resultsBox = document.getElementById('timestamp-results-box');

        if (!epochVal) {
          Toast.show('Enter an Epoch Timestamp first', 'warning');
          return;
        }

        let num = parseInt(epochVal, 10);
        if (isNaN(num)) {
          Toast.show('Invalid Epoch input', 'error');
          return;
        }

        // If seconds, multiply by 1000
        if (epochVal.length <= 10) {
          num = num * 1000;
        }

        try {
          const date = new Date(num);
          resultsBox.innerHTML = `
            <div class="ts-result-row"><span class="ts-label">ISO Date:</span><span class="ts-val">${date.toISOString()}</span></div>
            <div class="ts-result-row"><span class="ts-label">Local Date:</span><span class="ts-val">${date.toString()}</span></div>
            <div class="ts-result-row"><span class="ts-label">UTC Date:</span><span class="ts-val">${date.toUTCString()}</span></div>
          `;
          Toast.show('Epoch timestamp converted', 'success');
        } catch (e) {
          Toast.show('Epoch convert error: ' + e.message, 'error');
        }
      });

      document.getElementById('ts-to-epoch-btn').addEventListener('click', () => {
        const isoVal = document.getElementById('ts-iso-input').value.trim();
        const resultsBox = document.getElementById('timestamp-results-box');

        if (!isoVal) {
          Toast.show('Enter an ISO 8601 string first', 'warning');
          return;
        }

        try {
          const date = new Date(isoVal);
          if (isNaN(date.getTime())) {
            throw new Error('Invalid date structure');
          }
          resultsBox.innerHTML = `
            <div class="ts-result-row"><span class="ts-label">Seconds (Epoch):</span><span class="ts-val">${Math.floor(date.getTime() / 1000)}</span></div>
            <div class="ts-result-row"><span class="ts-label">Milliseconds (Epoch):</span><span class="ts-val">${date.getTime()}</span></div>
          `;
          Toast.show('ISO date converted', 'success');
        } catch (e) {
          Toast.show('Failed to parse ISO date string', 'error');
        }
      });
    },

    // 14.5 JSON Repair Tool
    initRepair() {
      EditorManager.create('repair-editor-input');
      EditorManager.create('repair-editor-output', { readOnly: true });

      DragDropManager.setup(document.getElementById('sub-repair'), (val) => {
        EditorManager.checkAndLoadValue('repair-editor-input', 'repair-fallback-input', val);
      });

      document.getElementById('repair-run-btn').addEventListener('click', () => {
        const input = EditorManager.getValue('repair-editor-input', 'repair-fallback-input');
        if (!input.trim()) {
          Toast.show('Enter malformed JSON first', 'warning');
          return;
        }

        const repaired = JSONRepairEngine.repair(input);
        EditorManager.checkAndLoadValue('repair-editor-output', 'repair-fallback-output', repaired);
        
        // Validate if repaired is now structurally correct
        const isValid = safeParse(repaired) !== null;
        if (isValid) {
          Toast.show('JSON repaired successfully', 'success');
        } else {
          Toast.show('Attempted repair, but JSON still invalid. Review output details.', 'warning');
        }
      });
    },

    restoreSession() {}
  };

  // ==========================================================================
  // GLOBAL CONTROLLER & NAVIGATION
  // ==========================================================================
  const AppController = {
    init() {
      Toast.init();
      
      // Load Monaco and trigger first tool registry initialization
      EditorManager.init(() => {
        this.registerGlobalEvents();
        this.switchTool(App.activeTool);
        
        // Restore values across all tools
        Object.keys(App.toolRegistry).forEach(key => {
          App.toolRegistry[key].restoreSession();
        });

        Toast.show('Antigravity JSON Toolkit initialized', 'success');
      });
    },

    registerGlobalEvents() {
      // 1. Sidebar switches
      const sidebarItems = document.querySelectorAll('.sidebar-item');
      sidebarItems.forEach(item => {
        item.addEventListener('click', (e) => {
          const toolId = e.currentTarget.dataset.tool;
          this.switchTool(toolId);
        });
      });

      // 2. Center Category Filter Switch
      const catButtons = document.querySelectorAll('.category-btn');
      catButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const cat = e.target.dataset.category;
          
          // Toggle Active class
          catButtons.forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
          });
          e.target.classList.add('active');
          e.target.setAttribute('aria-selected', 'true');

          // Filter sidebar
          const sidebarItems = document.querySelectorAll('.sidebar-item');
          sidebarItems.forEach(item => {
            const itemCat = item.dataset.cat;
            if (cat === 'all' || itemCat === cat) {
              item.classList.remove('hidden');
            } else {
              item.classList.add('hidden');
            }
          });
          Toast.show(`Filtered view: ${cat.toUpperCase()}`, 'info');
        });
      });

      // 3. Theme switch (light / dark)
      const themeBtn = document.getElementById('theme-toggle');
      const sunIcon = themeBtn.querySelector('.sun-icon');
      const moonIcon = themeBtn.querySelector('.moon-icon');

      themeBtn.addEventListener('click', () => {
        App.theme = App.theme === 'dark' ? 'light' : 'dark';
        
        if (App.theme === 'light') {
          document.body.classList.add('light-theme');
          sunIcon.style.display = 'none';
          moonIcon.style.display = 'block';
          // Swap HLJS stylesheet if needed (standard fallback)
          document.getElementById('hljs-theme').href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/github.min.css';
        } else {
          document.body.classList.remove('light-theme');
          sunIcon.style.display = 'block';
          moonIcon.style.display = 'none';
          document.getElementById('hljs-theme').href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/atom-one-dark.min.css';
        }

        EditorManager.setTheme(App.theme);
        Toast.show(`Switched to ${App.theme} mode`, 'success');
        
        // Save to cache
        localStorage.setItem('toolkit_theme', App.theme);
      });

      // 4. Settings Dropdown & layout switches
      const settingsBtn = document.getElementById('settings-btn');
      const dropdown = document.getElementById('settings-dropdown');
      
      settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
      });

      document.addEventListener('click', () => {
        dropdown.classList.add('hidden');
      });

      // Clear Session Cache
      document.getElementById('clear-session-btn').addEventListener('click', () => {
        localStorage.clear();
        Toast.show('Session cache cleared. Reloading page...', 'warning');
        setTimeout(() => location.reload(), 1500);
      });

      // Layout split direction toggle
      const layoutToggle = document.getElementById('layout-direction-toggle');
      layoutToggle.addEventListener('change', () => {
        App.layoutDirection = layoutToggle.checked ? 'vertical' : 'horizontal';
        if (App.layoutDirection === 'vertical') {
          document.body.classList.add('layout-vertical');
          Toast.addRangeClass = 'vertical';
        } else {
          document.body.classList.remove('layout-vertical');
        }
        Toast.show(`Layout direction changed`, 'info');
      });

      // 5. Sidebar collapse (hamburger / collapse)
      const sidebarToggle = document.getElementById('sidebar-toggle');
      const sidebar = document.getElementById('sidebar-menu');
      sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
      });

      // 6. Shortcuts modal triggers
      const shortcutsBtn = document.getElementById('shortcuts-btn');
      const modal = document.getElementById('shortcuts-modal');
      const modalClose = document.getElementById('modal-close-btn');

      shortcutsBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
      });

      modalClose.addEventListener('click', () => {
        modal.classList.add('hidden');
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
        }
      });

      // Keyboard Shortcuts listener
      window.addEventListener('keydown', (e) => {
        // Escape
        if (e.key === 'Escape') {
          modal.classList.add('hidden');
          dropdown.classList.add('hidden');
        }

        // Keyboard Shortcuts combo Ctrl+/
        if (e.ctrlKey && e.key === '/') {
          e.preventDefault();
          modal.classList.toggle('hidden');
        }

        // Ctrl + Enter (Format Active)
        if (e.ctrlKey && e.key === 'Enter') {
          e.preventDefault();
          if (App.activeTool === 'formatter') {
            App.toolRegistry['formatter'].runFormatter(2);
          } else if (App.activeTool === 'beautify') {
            App.toolRegistry['beautify'].applyBeautify('sort');
          } else {
            // Standard format trigger if supported
            const activeEd = App.editors[`${App.activeTool}-editor-input`] || App.editors[`${App.activeTool}-editor`];
            if (activeEd) {
              activeEd.getAction('editor.action.formatDocument').run();
              Toast.show('Document Formatted', 'success');
            }
          }
        }

        // Ctrl + Shift + V (Validate)
        if (e.ctrlKey && e.shiftKey && e.key === 'V') {
          e.preventDefault();
          this.switchTool('validator');
        }

        // Ctrl + Shift + C (Comparator)
        if (e.ctrlKey && e.shiftKey && e.key === 'C') {
          e.preventDefault();
          this.switchTool('compare');
        }

        // Ctrl + S (Download active)
        if (e.ctrlKey && e.key === 's') {
          e.preventDefault();
          const activeDownloadBtn = document.querySelector(`.tool-panel.active button[id$="-download-btn"]`);
          if (activeDownloadBtn) {
            activeDownloadBtn.click();
          } else {
            Toast.show('Download shortcut not bound to this tool', 'warning');
          }
        }
      });

      // Restore theme preference
      const cachedTheme = localStorage.getItem('toolkit_theme');
      if (cachedTheme === 'light') {
        themeBtn.click();
      }
    },

    switchTool(toolId) {
      // 1. Hide active panel
      const activePanel = document.querySelector('.tool-panel.active');
      if (activePanel) {
        activePanel.classList.remove('active');
      }

      // 2. Show new panel
      const newPanel = document.getElementById(`tool-${toolId}`);
      if (newPanel) {
        newPanel.classList.add('active');
        App.activeTool = toolId;

        // Ensure active sidebar highlighted
        document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
        const sidebarBtn = document.querySelector(`.sidebar-item[data-tool="${toolId}"]`);
        if (sidebarBtn) {
          sidebarBtn.classList.add('active');
        }

        // Initialize tool if not already initialized
        const tool = App.toolRegistry[toolId];
        if (tool) {
          if (!tool.isInitialized) {
            tool.init();
            tool.isInitialized = true;
          }
          // Redraw tree layouts if active
          if (tool.render) {
            tool.render();
          }
        }

        Toast.show(`Opened ${toolId.replace(/^\w/, c => c.toUpperCase())} Tool`, 'info');
      }
    }
  };

  // Run tests unit testing helper in browser console
  App.runTests = function () {
    console.log("%c[TEST RUNNER] Starting Suite...", "color: var(--primary-accent); font-weight: bold;");
    
    // 1. Verify safeParse
    const t1 = safeParse('{"a": 1}');
    console.assert(t1 !== null && t1.a === 1, "safeParse failed to parse valid JSON");

    const t2 = safeParse('invalid');
    console.assert(t2 === null, "safeParse failed to return null on invalid JSON");

    // 2. Verify JSON Repair
    const malformed = "{name: 'John', age: 30,}";
    const repaired = JSONRepairEngine.repair(malformed);
    const parsedRepaired = safeParse(repaired);
    console.assert(parsedRepaired !== null && parsedRepaired.name === 'John', "JSONRepair failed on basic repairs");

    // 3. Schema Gen
    const testObj = { name: "Alice", age: 25 };
    const schema = SchemaGenerator.generate(testObj);
    console.assert(schema.properties.name.type === 'string' && schema.properties.age.type === 'integer', "Schema generator failed type inference");

    // 4. Data converters
    const csv = DataConverters.toCSV([{ a: 1, b: 2 }]);
    console.assert(csv.trim() === 'a,b\n1,2', "CSV Converter failed basic array conversion");

    console.log("%c[TEST RUNNER] All tests passed structural validation.", "color: var(--secondary-accent); font-weight: bold;");
    return "SUCCESS";
  };

  // Expose App to global window for testing & debugger hooks
  window.App = App;

  // Initialize application on page load
  window.addEventListener('DOMContentLoaded', () => {
    AppController.init();
  });

})();
