/**
 * Shared batch-export logic for AutoEngage upload batching.
 * Each tool creates its own instance with a unique prefix,
 * so localStorage keys never collide across tools.
 *
 * Usage:
 *   const exporter = new BatchExporter('reattempt');
 *   const fp = exporter.createFingerprint(file, inputRowCount);
 *   exporter.getSavedProgress(fp, templateId, inputRowCount);
 *   exporter.saveProgress(fp, templateId, inputRowCount, nextLeadIndex);
 *   exporter.clearProgressForFingerprint(fp);
 */
(function () {
  'use strict';

  // Legacy shared key used before each tool had its own prefix.
  // We migrate (clear) it on first run since data can't be cleanly split.
  var _oldSharedKey = 'jejo-ae-batch-export-v1';
  function _migrateOldSharedKey() {
    try {
      if (localStorage.getItem(_oldSharedKey)) {
        localStorage.removeItem(_oldSharedKey);
      }
    } catch(e) { /* ignore */ }
  }

  class BatchExporter {
    constructor(prefix) {
      // One-time migration from old shared key
      _migrateOldSharedKey();

      this.prefix = prefix;
      this.storageKey = 'jejo-ae-batch-export-' + prefix;
      this.LEADS_PER_BATCH = 100;
    }

    createFingerprint(file, inputRowCount) {
      if (!file) return '';
      return [
        file.name || '',
        String(file.size || 0),
        String(file.lastModified || 0),
        String(inputRowCount || 0),
      ].join('|');
    }

    readStore() {
      try {
        return JSON.parse(localStorage.getItem(this.storageKey) || '{}');
      } catch (e) {
        console.warn('BatchExporter: JSON.parse failed, returning empty:', e);
        return {};
      }
    }

    writeStore(store) {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(store));
      } catch (e) {
        console.warn('BatchExporter: localStorage quota or private mode:', e);
      }
    }

    getSavedProgress(fp, templateId, inputRowCount) {
      const store = this.readStore();
      const rec = store[fp];
      if (!rec || rec.templateId !== templateId || Number(rec.inputRowCount) !== Number(inputRowCount)) return null;
      return { nextLeadIndex: Number(rec.nextLeadIndex) || 1 };
    }

    saveProgress(fp, templateId, inputRowCount, nextLeadIndex) {
      const store = this.readStore();
      store[fp] = { templateId, inputRowCount, nextLeadIndex };
      this.writeStore(store);
    }

    clearProgressForFingerprint(fp) {
      const store = this.readStore();
      delete store[fp];
      this.writeStore(store);
    }
  }

  window.BatchExporter = BatchExporter;
})();
