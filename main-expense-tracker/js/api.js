/**
 * api.js — thin wrapper around the Google Apps Script Web App.
 *
 * IMPORTANT: set API_URL to your deployed Apps Script Web App URL,
 * e.g. https://script.google.com/macros/s/AKfycb.../exec
 */
const API_URL = 'https://script.google.com/macros/s/AKfycbyvEl2WHRz8-CTbIBHXIDpSC5zyGYcFjO4SggfQWxPj7ldHK7QneBXrNKD2BB6wPNO0/exec';

const Api = (function () {
  function getToken() {
    return localStorage.getItem('sems_token');
  }

  async function get(action, params) {
    const url = new URL(API_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('token', getToken() || '');
    if (params) {
      Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
    }
    const res = await fetch(url.toString(), { method: 'GET' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  async function post(action, payload) {
    const body = Object.assign({ action: action, token: getToken() }, payload || {});
    // text/plain avoids a CORS preflight against the Apps Script endpoint.
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  return {
    login: (username, password) => post('login', { username, password }),
    logout: () => post('logout', {}),
    verifySession: () => get('verifySession'),
    getExpenses: () => get('getExpenses'),
    getDashboardStats: () => get('getDashboardStats'),
    getUsers: () => get('getUsers'),
    getSites: () => get('getSites'),
    getAuditLog: () => get('getAuditLog'),
    getProjectHealth: () => get('getProjectHealth'),
    submitExpense: (expense) => post('submitExpense', { expense }),
    addUser: (user) => post('addUser', { user }),
    addSite: (site) => post('addSite', { site }),
    addProject: (project) => post('addProject', { project })
  };
})();
