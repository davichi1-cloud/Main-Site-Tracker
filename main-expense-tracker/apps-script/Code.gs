/**
 * SITE EXPENSE MANAGEMENT SYSTEM — Backend (Google Apps Script)
 * ----------------------------------------------------------------
 * Deploy as a Web App:
 *   Deploy > New deployment > Type: Web app
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * This script is the ONLY thing that ever touches the Spreadsheet.
 * The frontend never sees the Sheet directly — every read/write goes
 * through doGet / doPost below, gated by a session token.
 */

// ====================== CONFIG ======================
const SHEET_USERS = 'Users';
const SHEET_EXPENSES = 'Expenses';
const SHEET_AUDIT = 'AuditLog';
const SHEET_SITES = 'Sites';
const SHEET_PROJECTS = 'Projects';
const SESSION_DURATION_SECONDS = 6 * 60 * 60; // 6 hours

// Budget-health thresholds — tweak these two numbers to change sensitivity.
const HEALTH_OVER_BUDGET_PCT = 100;   // spend / budget >= this  -> Over Budget
const HEALTH_AT_RISK_MARGIN = 15;     // spend% ahead of time% by this many points -> At Risk
const HEALTH_AT_RISK_SPEND_PCT = 85;  // spend / budget >= this (even on schedule) -> At Risk

// ====================== ENTRY POINTS ======================

function doGet(e) {
  try {
    const action = e.parameter.action;
    const token = e.parameter.token;

    switch (action) {
      case 'ping':
        return jsonOut({ ok: true, message: 'Site Expense API is live' });

      case 'verifySession':
        return jsonOut(verifySession(token));

      case 'getExpenses':
        return jsonOut(getExpenses(requireSession(token)));

      case 'getDashboardStats':
        return jsonOut(getDashboardStats(requireSession(token)));

      case 'getUsers':
        return jsonOut(getUsers(requireSession(token)));

      case 'getSites':
        return jsonOut(getSites(requireSession(token)));

      case 'getAuditLog':
        return jsonOut(getAuditLog(requireSession(token)));

      case 'getProjectHealth':
        return jsonOut(getProjectHealth(requireSession(token)));

      default:
        return jsonOut({ error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const action = body.action;

    switch (action) {
      case 'login':
        return jsonOut(login(body.username, body.password));

      case 'logout':
        return jsonOut(logout(body.token));

      case 'submitExpense':
        return jsonOut(submitExpense(requireSession(body.token), body.expense));

      case 'addUser':
        return jsonOut(addUser(requireSession(body.token), body.user));

      case 'addSite':
        return jsonOut(addSite(requireSession(body.token), body.site));

      case 'addProject':
        return jsonOut(addProject(requireSession(body.token), body.project));

      default:
        return jsonOut({ error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

// ====================== AUTH ======================

function login(username, password) {
  if (!username || !password) throw new Error('Username and password required');

  const sheet = getSheet(SHEET_USERS);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rUser = String(row[headers.indexOf('Username')]).trim();
    const rPass = String(row[headers.indexOf('Password')]).trim();

    if (rUser.toLowerCase() === String(username).trim().toLowerCase() && rPass === String(password)) {
      const role = row[headers.indexOf('Role')];
      const site = row[headers.indexOf('Site')];

      const token = Utilities.getUuid();
      const session = { username: rUser, role: role, site: site };
      CacheService.getScriptCache().put(token, JSON.stringify(session), SESSION_DURATION_SECONDS);

      logAudit(rUser, 'LOGIN', 'User logged in');

      return { success: true, token: token, username: rUser, role: role, site: site };
    }
  }
  logAudit(username, 'LOGIN_FAILED', 'Invalid credentials attempt');
  throw new Error('Invalid username or password');
}

function logout(token) {
  const session = getSession(token);
  if (session) {
    CacheService.getScriptCache().remove(token);
    logAudit(session.username, 'LOGOUT', 'User logged out');
  }
  return { success: true };
}

function getSession(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get(token);
  return raw ? JSON.parse(raw) : null;
}

function requireSession(token) {
  const session = getSession(token);
  if (!session) throw new Error('Session expired. Please log in again.');
  return session;
}

function verifySession(token) {
  const session = getSession(token);
  if (!session) return { valid: false };
  return { valid: true, username: session.username, role: session.role, site: session.site };
}

// ====================== EXPENSES ======================

function submitExpense(session, expense) {
  if (session.role !== 'Site Manager' && session.role !== 'Admin') {
    throw new Error('Only Site Managers can submit expenses');
  }
  if (!expense || !expense.category || !expense.amount) {
    throw new Error('Missing required expense fields');
  }

  const sheet = getSheet(SHEET_EXPENSES);
  const expenseId = 'EXP-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd-HHmmss');
  const timestamp = new Date();
  const site = session.role === 'Admin' ? (expense.site || 'ALL') : session.site;

  sheet.appendRow([
    expenseId,
    expense.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    site,
    expense.category,
    expense.description || '',
    expense.quantity || '',
    expense.unit || '',
    expense.amount,
    expense.vendor || '',
    expense.paymentMethod || '',
    expense.receiptUrl || '',
    session.username,
    timestamp,
    expense.remarks || ''
  ]);

  logAudit(session.username, 'EXPENSE_SUBMITTED', 'Submitted ' + expenseId + ' (' + expense.amount + ')');

  return { success: true, expenseId: expenseId };
}

function getExpenses(session) {
  const sheet = getSheet(SHEET_EXPENSES);
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return { expenses: [] };

  const headers = rows[0];
  let data = rows.slice(1).map(r => rowToObject(headers, r));

  // Site Managers only ever see their own site's records.
  if (session.role === 'Site Manager') {
    data = data.filter(r => r.Site === session.site);
  }

  data.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
  return { expenses: data };
}

// ====================== DASHBOARD STATS ======================

function getDashboardStats(session) {
  const sheet = getSheet(SHEET_EXPENSES);
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) {
    return { todayTotal: 0, monthTotal: 0, totalTransactions: 0, totalSites: 0, byCategory: {}, byMonth: {} };
  }

  const headers = rows[0];
  let data = rows.slice(1).map(r => rowToObject(headers, r));

  if (session.role === 'Site Manager') {
    data = data.filter(r => r.Site === session.site);
  }

  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const thisMonth = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');

  let todayTotal = 0, monthTotal = 0;
  const byCategory = {};
  const byMonth = {};
  const sites = new Set();

  data.forEach(r => {
    const amt = Number(r.Amount) || 0;
    const dateStr = formatCellDate(r.Date);
    sites.add(r.Site);

    if (dateStr === today) todayTotal += amt;
    if (dateStr.indexOf(thisMonth) === 0) monthTotal += amt;

    byCategory[r.Category] = (byCategory[r.Category] || 0) + amt;

    const monthKey = dateStr.substring(0, 7);
    byMonth[monthKey] = (byMonth[monthKey] || 0) + amt;
  });

  return {
    todayTotal: todayTotal,
    monthTotal: monthTotal,
    totalTransactions: data.length,
    totalSites: sites.size,
    byCategory: byCategory,
    byMonth: byMonth
  };
}

// ====================== USERS (Admin only) ======================

function getUsers(session) {
  if (session.role !== 'Admin') throw new Error('Access denied');
  const sheet = getSheet(SHEET_USERS);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  // Never send passwords back to the client.
  const users = rows.slice(1).map(r => {
    const obj = rowToObject(headers, r);
    delete obj.Password;
    return obj;
  });
  return { users: users };
}

function addUser(session, user) {
  if (session.role !== 'Admin') throw new Error('Access denied');
  if (!user || !user.username || !user.password || !user.role) {
    throw new Error('Missing required user fields');
  }
  const sheet = getSheet(SHEET_USERS);
  sheet.appendRow([user.username, user.password, user.role, user.site || 'ALL']);
  logAudit(session.username, 'USER_CREATED', 'Created user ' + user.username + ' (' + user.role + ')');
  return { success: true };
}

// ====================== SITES ======================

function getSites(session) {
  const sheet = getSheet(SHEET_SITES);
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return { sites: [] };
  const headers = rows[0];
  const sites = rows.slice(1).map(r => rowToObject(headers, r));
  return { sites: sites };
}

function addSite(session, site) {
  if (session.role !== 'Admin') throw new Error('Access denied');
  if (!site || !site.name) throw new Error('Site name required');
  const sheet = getSheet(SHEET_SITES);
  sheet.appendRow([site.name, site.location || '', site.status || 'Active']);
  logAudit(session.username, 'SITE_CREATED', 'Created site ' + site.name);
  return { success: true };
}

// ====================== PROJECTS & BUDGET HEALTH ======================
//
// A "project" is a budget attached to a Site. Health is worked out from
// two things compared side by side:
//   spend%  = money spent so far / budget
//   time%   = days elapsed so far / total project duration
// If you're spending noticeably faster than time is passing, that project
// is trending toward a blowout even if it hasn't gone over yet — that's
// "At Risk". Already past the budget is always "Over Budget" regardless
// of schedule. Everything else is "Healthy".

function addProject(session, project) {
  if (session.role !== 'Admin') throw new Error('Access denied');
  if (!project || !project.name || !project.site || !project.budget) {
    throw new Error('Project name, site, and budget are required');
  }
  const sheet = getSheet(SHEET_PROJECTS);
  const projectId = 'PRJ-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd-HHmmss');
  sheet.appendRow([
    projectId,
    project.name,
    project.site,
    Number(project.budget) || 0,
    project.startDate || '',
    project.endDate || '',
    project.status || 'Active',
    project.notes || ''
  ]);
  logAudit(session.username, 'PROJECT_CREATED', 'Created project ' + project.name + ' (budget ' + project.budget + ')');
  return { success: true, projectId: projectId };
}

function getProjectHealth(session) {
  if (session.role !== 'Admin' && session.role !== 'Boss') throw new Error('Access denied');

  const projSheet = getSheet(SHEET_PROJECTS);
  const projRows = projSheet.getDataRange().getValues();
  if (projRows.length < 2) return { projects: [], summary: emptyHealthSummary() };

  const projHeaders = projRows[0];
  let projects = projRows.slice(1).map(r => rowToObject(projHeaders, r));

  const expSheet = getSheet(SHEET_EXPENSES);
  const expRows = expSheet.getDataRange().getValues();
  const spendBySite = {};
  if (expRows.length > 1) {
    const expHeaders = expRows[0];
    expRows.slice(1).forEach(r => {
      const obj = rowToObject(expHeaders, r);
      const amt = Number(obj.Amount) || 0;
      spendBySite[obj.Site] = (spendBySite[obj.Site] || 0) + amt;
    });
  }

  const now = new Date();
  const results = projects.map(p => {
    const budget = Number(p.Budget) || 0;
    const spend = spendBySite[p.Site] || 0;
    const spentPct = budget > 0 ? (spend / budget * 100) : null;

    let timePct = null;
    const start = p['Start Date'] ? new Date(p['Start Date']) : null;
    const end = p['End Date'] ? new Date(p['End Date']) : null;
    if (start && end && !isNaN(start) && !isNaN(end) && end > start) {
      const totalDays = (end - start) / 86400000;
      const elapsedDays = Math.min(Math.max((now - start) / 86400000, 0), totalDays);
      timePct = elapsedDays / totalDays * 100;
    }

    const status = computeHealthStatus(budget, spentPct, timePct);

    return {
      'Project ID': p['Project ID'],
      'Project Name': p['Project Name'],
      Site: p.Site,
      Budget: budget,
      Spend: spend,
      Remaining: budget - spend,
      SpentPct: spentPct,
      TimePct: timePct,
      Status: status,
      'Start Date': p['Start Date'] || '',
      'End Date': p['End Date'] || '',
      Notes: p.Notes || ''
    };
  });

  return { projects: results, summary: summarizeHealth(results) };
}

function computeHealthStatus(budget, spentPct, timePct) {
  if (!budget) return 'No Budget Set';
  if (spentPct >= HEALTH_OVER_BUDGET_PCT) return 'Over Budget';
  if (timePct !== null && (spentPct - timePct) > HEALTH_AT_RISK_MARGIN) return 'At Risk';
  if (spentPct >= HEALTH_AT_RISK_SPEND_PCT) return 'At Risk';
  return 'Healthy';
}

function summarizeHealth(results) {
  const summary = emptyHealthSummary();
  results.forEach(r => {
    summary.totalBudget += r.Budget;
    summary.totalSpend += r.Spend;
    if (r.Status === 'Healthy') summary.healthy++;
    else if (r.Status === 'At Risk') summary.atRisk++;
    else if (r.Status === 'Over Budget') summary.overBudget++;
    else summary.noBudget++;
  });
  summary.overallPct = summary.totalBudget > 0 ? (summary.totalSpend / summary.totalBudget * 100) : 0;
  return summary;
}

function emptyHealthSummary() {
  return { totalBudget: 0, totalSpend: 0, overallPct: 0, healthy: 0, atRisk: 0, overBudget: 0, noBudget: 0 };
}



function logAudit(username, action, details) {
  const sheet = getSheet(SHEET_AUDIT);
  sheet.appendRow([new Date(), username, action, details]);
}

function getAuditLog(session) {
  if (session.role !== 'Admin') throw new Error('Access denied');
  const sheet = getSheet(SHEET_AUDIT);
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return { logs: [] };
  const headers = rows[0];
  let logs = rows.slice(1).map(r => rowToObject(headers, r));
  logs.reverse();
  return { logs: logs.slice(0, 500) };
}

// ====================== HELPERS ======================

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name + '. Run setupSheets() first.');
  return sheet;
}

function rowToObject(headers, row) {
  const obj = {};
  headers.forEach((h, i) => { obj[h] = row[i]; });
  return obj;
}

function formatCellDate(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(val);
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ====================== ONE-TIME SETUP ======================
// Run this once from the Apps Script editor (select setupSheets, click Run)
// to create all sheets with correct headers and a starter admin user.

// One-off migration for spreadsheets that were set up before the Projects
// feature existed — adds just the Projects sheet without touching your
// existing Users/Expenses/Sites data. Safe to run any time; it does
// nothing if the sheet already exists.
function addProjectsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(SHEET_PROJECTS)) {
    Logger.log('Projects sheet already exists — nothing to do.');
    return;
  }
  const projectsSheet = ss.insertSheet(SHEET_PROJECTS);
  projectsSheet.appendRow(['Project ID', 'Project Name', 'Site', 'Budget', 'Start Date', 'End Date', 'Status', 'Notes']);
  projectsSheet.setFrozenRows(1);
  Logger.log('Projects sheet created.');
}

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const usersSheet = ss.getSheetByName(SHEET_USERS) || ss.insertSheet(SHEET_USERS);
  usersSheet.clear();
  usersSheet.appendRow(['Username', 'Password', 'Role', 'Site']);
  usersSheet.appendRow(['king', 'ChangeMe123!', 'Admin', 'ALL']);
  usersSheet.appendRow(['boss', 'ChangeMe123!', 'Boss', 'ALL']);
  usersSheet.appendRow(['john', 'ChangeMe123!', 'Site Manager', 'Lekki']);
  usersSheet.setFrozenRows(1);

  const expensesSheet = ss.getSheetByName(SHEET_EXPENSES) || ss.insertSheet(SHEET_EXPENSES);
  expensesSheet.clear();
  expensesSheet.appendRow(['Expense ID', 'Date', 'Site', 'Category', 'Description', 'Quantity', 'Unit', 'Amount', 'Vendor', 'Payment Method', 'Receipt', 'Submitted By', 'Timestamp', 'Remarks']);
  expensesSheet.setFrozenRows(1);

  const auditSheet = ss.getSheetByName(SHEET_AUDIT) || ss.insertSheet(SHEET_AUDIT);
  auditSheet.clear();
  auditSheet.appendRow(['Timestamp', 'Username', 'Action', 'Details']);
  auditSheet.setFrozenRows(1);

  const sitesSheet = ss.getSheetByName(SHEET_SITES) || ss.insertSheet(SHEET_SITES);
  sitesSheet.clear();
  sitesSheet.appendRow(['Site Name', 'Location', 'Status']);
  sitesSheet.appendRow(['Lekki', 'Lagos', 'Active']);
  sitesSheet.setFrozenRows(1);

  const projectsSheet = ss.getSheetByName(SHEET_PROJECTS) || ss.insertSheet(SHEET_PROJECTS);
  projectsSheet.clear();
  projectsSheet.appendRow(['Project ID', 'Project Name', 'Site', 'Budget', 'Start Date', 'End Date', 'Status', 'Notes']);
  projectsSheet.setFrozenRows(1);

  Logger.log('Setup complete. Default logins (CHANGE THESE PASSWORDS): king / boss / john, password: ChangeMe123!');
}
