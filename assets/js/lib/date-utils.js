/**
 * date-utils.js — Shared date formatting utilities for AutoNage pages.
 *
 * Consolidates detectDateFormat, updateDateParserNote, handleDateFormatChange,
 * applyDateFormat, parseExcelSerialDate, parseDate, buildValidatedDate,
 * and formatDateDisplay — previously duplicated across pages.
 *
 * Load this BEFORE any page-specific script. All functions use `var` and
 * are intentionally global.
 *
 * Usage:
 *   // Set date order before using parseDate
 *   dateParseOrder = 'DMY'; // or 'MDY'
 *
 *   // Auto-detect from date strings
 *   dateParseOrder = detectDateFormat(dateStrings);
 *
 *   // Parse a date value
 *   var date = parseDate('01/04/2025');
 *
 *   // Wire up UI: call handleDateFormatChange() from <select onchange>
 *   // Call updateDateParserNote() after setting dateParseOrder
 */
(function () {
  'use strict';

  // ── DETECT DATE FORMAT ─────────────────────────────────────────────────
  // Samples up to 250 date strings and returns 'DMY' or 'MDY' based on
  // which interpretation is valid. Defaults to 'DMY'.
  window.detectDateFormat = function (dateStrings) {
    var sampleLimit = Math.min(dateStrings.length, 250);
    for (var i = 0; i < sampleLimit; i++) {
      var s = String(dateStrings[i] || '').trim();
      var m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
      if (!m) continue;
      var a = parseInt(m[1], 10);
      var b = parseInt(m[2], 10);
      if (a > 12 && b <= 12) return 'DMY';
      if (b > 12 && a <= 12) return 'MDY';
    }
    return 'DMY'; // default
  };

  // ── UPDATE DATE PARSER NOTE ─────────────────────────────────────────────
  // Updates the UI note element (id="dateParserNote") with the current
  // format and mode (Auto/Manual). Reads from global dateParseOrder.
  window.updateDateParserNote = function () {
    var sel = document.getElementById('dateFormatSelect');
    var note = document.getElementById('dateParserNote');
    if (!sel || !note) return;
    var mode = sel.value === 'auto' ? 'Auto' : 'Manual';
    var label = window.dateParseOrder === 'MDY' ? 'MM/DD/YYYY' : 'DD/MM/YYYY';
    note.textContent = 'Format: ' + label + ' (' + mode + ')';
  };

  // ── HANDLE DATE FORMAT CHANGE ───────────────────────────────────────────
  // Reads the <select id="dateFormatSelect"> and updates the global
  // dateParseOrder. Calls the provided onFormatChange callback if data
  // is loaded.
  window.handleDateFormatChange = function (onFormatChange) {
    var sel = document.getElementById('dateFormatSelect');
    if (!sel) return;
    if (sel.value === 'auto') {
      window.dateParseOrder = 'DMY';
    } else {
      window.dateParseOrder = sel.value;
    }
    window.updateDateParserNote();
    if (typeof onFormatChange === 'function') {
      onFormatChange();
    }
  };

  // ── APPLY DATE FORMAT ───────────────────────────────────────────────────
  // Reads the <select id="dateFormatSelect"> and auto-detects or sets
  // the global dateParseOrder. Takes a getDateStrings callback that
  // returns an array of date strings for auto-detection.
  window.applyDateFormat = function (getDateStrings) {
    var sel = document.getElementById('dateFormatSelect');
    if (!sel) return;
    if (sel.value === 'auto') {
      var dates = typeof getDateStrings === 'function' ? getDateStrings() : [];
      window.dateParseOrder = window.detectDateFormat(dates);
      sel.dataset.detected = window.dateParseOrder;
    } else {
      window.dateParseOrder = sel.value;
      delete sel.dataset.detected;
    }
    window.updateDateParserNote();
  };

  // ── PARSE EXCEL SERIAL DATE ─────────────────────────────────────────────
  // Converts an Excel serial number (e.g., 45000) to a JavaScript Date.
  // Returns null if the value is not a valid serial number.
  window.parseExcelSerialDate = function (value) {
    var num = Number(value);
    if (!Number.isFinite(num) || num < 20000 || num > 80000) return null;
    var epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + num * 86400000);
  };

  // ── BUILD VALIDATED DATE ────────────────────────────────────────────────
  // Creates a Date and validates that all components match (handles
  // Date auto-correction, e.g., month 13 → next year).
  window.buildValidatedDate = function (year, month, day, hour, minute, second) {
    hour = hour || 0;
    minute = minute || 0;
    second = second || 0;
    var date = new Date(year, month - 1, day, hour, minute, second);
    if (
      date.getFullYear() !== year ||
      date.getMonth() + 1 !== month ||
      date.getDate() !== day ||
      date.getHours() !== hour ||
      date.getMinutes() !== minute ||
      date.getSeconds() !== second
    ) {
      return null;
    }
    return date;
  };

  // ── PARSE DATE ──────────────────────────────────────────────────────────
  // Parses a date value (string, number, or Date) using the global
  // dateParseOrder ('DMY' or 'MDY'). Handles Excel serial numbers,
  // ISO dates, slash-separated dates, and named months.
  // Uses dateParseOrder for ambiguous slash-separated dates.
  window.parseDate = function (value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'number') return window.parseExcelSerialDate(value);

    var raw = String(value).trim();
    if (!raw) return null;

    var serial = window.parseExcelSerialDate(raw);
    if (serial) return serial;

    var order = window.dateParseOrder || 'DMY';

    // DD/MM/YYYY or MM/DD/YYYY with optional time
    var dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i);
    if (dmy) {
      var first = parseInt(dmy[1], 10);
      var secondPart = parseInt(dmy[2], 10);
      var year = parseInt(dmy[3], 10);
      var hour = parseInt(dmy[4] || '0', 10);
      var minute = parseInt(dmy[5] || '0', 10);
      var sec = parseInt(dmy[6] || '0', 10);
      var ampm = String(dmy[7] || '').toLowerCase();
      if (year < 100) year += 2000;
      if (ampm === 'pm' && hour !== 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;

      if (order === 'MDY') {
        // Parse as MM/DD/YYYY
        var mdy = window.buildValidatedDate(year, first, secondPart, hour, minute, sec);
        if (mdy) return mdy;
        // Fallback: try DD/MM if MM/DD is impossible
        if (first > 12 && secondPart <= 12) return null;
        return window.buildValidatedDate(year, secondPart, first, hour, minute, sec);
      }
      // Default: DMY — parse as DD/MM/YYYY
      var ddmmyyyy = window.buildValidatedDate(year, secondPart, first, hour, minute, sec);
      if (ddmmyyyy) return ddmmyyyy;
      // Fallback: try MM/DD only when DD/MM is impossible
      if (first > 12 && secondPart <= 12) return null;
      return window.buildValidatedDate(year, first, secondPart, hour, minute, sec);
    }

    // ISO date
    var iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (iso) {
      return window.buildValidatedDate(
        parseInt(iso[1], 10), parseInt(iso[2], 10), parseInt(iso[3], 10),
        parseInt(iso[4] || '0', 10), parseInt(iso[5] || '0', 10), parseInt(iso[6] || '0', 10)
      );
    }

    // Named months: "1st January 2025"
    var named = raw.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
    if (named) {
      var months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
      return window.buildValidatedDate(parseInt(named[3], 10), months[named[2].toLowerCase().slice(0, 3)], parseInt(named[1], 10));
    }

    return null;
  };

  // ── FORMAT DATE DISPLAY ────────────────────────────────────────────────
  // Formats a Date as DD/MM/YYYY string. Returns empty string if null.
  window.formatDateDisplay = function (date) {
    if (!date) return '';
    var dd = String(date.getDate()).padStart(2, '0');
    var mm = String(date.getMonth() + 1).padStart(2, '0');
    return dd + '/' + mm + '/' + date.getFullYear();
  };

  // ── FORMAT DATE TOKEN ───────────────────────────────────────────────────
  // Formats a Date as "1Jan" style token (for file naming, display).
  window.formatDateToken = function (date) {
    if (!date) return '';
    var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return date.getDate() + MONTH_SHORT[date.getMonth()];
  };

  // ── MONTH NAMES ─────────────────────────────────────────────────────────
  window.MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  // ── SERIAL DATE TO STRING ───────────────────────────────────────────────
  // Converts an Excel serial number directly to DD/MM/YYYY string.
  window.formatSerialDate = function (val) {
    var num = Number(val);
    if (!Number.isFinite(num) || num < 20000 || num > 80000) return String(val ?? '');
    var d = new Date(Date.UTC(1899, 11, 30) + num * 86400000);
    return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
  };

})();
