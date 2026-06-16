/**
 * data-pipeline.js — Shared data pipeline utilities for all AutoNage pages.
 *
 * Consolidates functions that were previously duplicated across multiple
 * page scripts: cellToString, normalizePhone, readFileAsArrayBuffer,
 * parseSheet, esc, escapeHtml, clean, canonicalHeader, normalizeHeader,
 * findCol, and phoneKey.
 *
 * Load this BEFORE any page-specific script that calls these functions.
 * All functions use `var` and are intentionally global.
 */
(function () {
  'use strict';

  // ── CELL TO STRING ─────────────────────────────────────────────────────
  // Safely converts any spreadsheet cell value to a trimmed string.
  // Handles scientific notation for large numbers.
  window.cellToString = function (val) {
    if (val === undefined || val === null || val === '') return '';
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'number') {
      if (Number.isInteger(val)) return String(val);
      if (val > 999999 && Math.abs(val - Math.round(val)) < 0.01) return String(Math.round(val));
      return String(val);
    }
    var s = String(val).trim();
    if (/^\d[\d.]*[eE][+\-]?\d+$/.test(s)) {
      var n = parseFloat(s);
      if (Number.isFinite(n) && n > 999999) return String(Math.round(n));
    }
    return s;
  };

  // ── PHONE NORMALIZATION ─────────────────────────────────────────────────
  // Strips formatting, handles 91/0 prefixes, returns 10-digit Indian mobile.
  window.normalizePhone = function (raw) {
    if (!raw) return null;
    var s = String(raw).trim();
    if (/^\d[\d.]*[eE][+\-]?\d+$/.test(s)) {
      s = String(Math.round(parseFloat(s)));
    }
    var digits = s.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('91') && digits.length === 12) return digits.slice(2);
    if (digits.startsWith('0') && digits.length === 11) return digits.slice(1);
    if (digits.length === 10) return digits;
    if (digits.startsWith('91') && digits.length >= 12) return digits.slice(digits.length - 10);
    if (digits.length > 10) return digits.slice(-10);
    return null;
  };

  // ── READ FILE AS ARRAY BUFFER ───────────────────────────────────────────
  window.readFileAsArrayBuffer = function (file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) { resolve(e.target.result); };
      reader.onerror = function () { reject(new Error('Failed to read file')); };
      reader.readAsArrayBuffer(file);
    });
  };

  // ── PARSE SHEET ─────────────────────────────────────────────────────────
  // Reads the first worksheet from an ArrayBuffer and returns an array of
  // row objects keyed by lowercased, underscore-joined headers.
  // Each object also has __raw (array of cell strings) and __rowIndex.
  window.parseSheet = function (ab) {
    var wb = XLSX.read(ab, { type: 'array', raw: true, cellText: false, cellDates: false });
    var ws = wb.Sheets[wb.SheetNames[0]];
    var rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    if (rows.length < 2) return [];
    var headers = rows[0].map(function (h) {
      return String(h).trim().toLowerCase().replace(/\s+/g, '_');
    });
    var result = [];
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      if (!row || row.every(function (c) { return window.cellToString(c) === ''; })) continue;
      var obj = { __rowIndex: i, __raw: [] };
      headers.forEach(function (h, j) {
        if (h && !DANGEROUS_KEYS[h]) obj[h] = window.cellToString(row[j]);
        obj.__raw.push(window.cellToString(row[j]));
      });
      result.push(obj);
    }
    return result;
  };

  // ── ESCAPE HTML ─────────────────────────────────────────────────────────
  // Escapes HTML special characters for safe DOM insertion.
  window.esc = function (value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  window.escapeHtml = window.esc; // alias

  // Property names that must not be used as object keys from spreadsheet headers
  var DANGEROUS_KEYS = { '__proto__': 1, 'constructor': 1, 'prototype': 1, 'toString': 1, 'valueOf': 1, 'hasOwnProperty': 1 };

  // ── CLEAN / LOWER ───────────────────────────────────────────────────────
  window.clean = function (value) {
    return String(value == null ? '' : value).trim();
  };

  window.lower = function (value) {
    return window.clean(value).toLowerCase();
  };

  // ── HEADER NORMALIZATION ────────────────────────────────────────────────
  // Canonicalizes a header string: lowercase, strip non-alphanumeric,
  // collapse underscores.
  window.canonicalHeader = function (h) {
    return String(h ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  };
  window.normalizeHeader = window.canonicalHeader; // alias

  // ── FIND COLUMN ─────────────────────────────────────────────────────────
  // Returns the first non-empty value from a row for the given candidate keys.
  window.findCol = function (row, candidates) {
    if (!row) return '';
    for (var i = 0; i < candidates.length; i++) {
      var val = row[candidates[i]];
      if (val !== undefined && val !== null && window.clean(val) !== '') return window.clean(val);
    }
    return '';
  };

  // ── PHONE KEY ───────────────────────────────────────────────────────────
  // Returns last 10 digits for grouping/dedup.
  window.phoneKey = function (value) {
    var digits = window.clean(value).replace(/\D/g, '');
    if (!digits) return '';
    return digits.length > 10 ? digits.slice(-10) : digits;
  };

  // ── IS PHONE LIKE ───────────────────────────────────────────────────────
  window.isPhoneLike = function (val) {
    return /^\+?[\d\s\-()]{10,15}$/.test(String(val).trim());
  };

  // ── EXCEL-SAFE CSV/TSV ──────────────────────────────────────────────────
  // Re-exports from excel-safe.js for convenience.
  window.excelSafe = window.excelSafe || function (v) {
    var s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) return "'" + s;
    return s;
  };

  window.excelSafeCsvCell = window.excelSafeCsvCell || function (v) {
    var s = window.excelSafe(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  window.excelSafeTsvCell = window.excelSafeTsvCell || function (v) {
    return window.excelSafe(String(v ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' '));
  };

  // ── TSV UTILITY ─────────────────────────────────────────────────────────
  // Converts rows of data to tab-separated text.
  window.rowsToTsv = function (rows, keys) {
    return rows.map(function (r) {
      return keys.map(function (k) { return window.excelSafeTsvCell(r[k]); }).join('\t');
    }).join('\n');
  };

})();
