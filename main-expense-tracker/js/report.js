/**
 * report.js — powers report.html (Boss read-only view, also linked from Admin)
 */
(function () {
  let currentUser = null;
  let allExpenses = [];
  let filtered = [];
  let monthChart, categoryChart;

  const PALETTE = ['#1656F5', '#12B76A', '#DD9827', '#E0402A', '#7C5CFC', '#0EA5E9', '#F472B6', '#84CC16'];

  function showToast(msg, type) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' ' + type : '');
    setTimeout(() => t.classList.remove('show'), 3200);
  }

  function money(n) {
    return '₦' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function fmtDate(v) {
    const d = new Date(v);
    if (isNaN(d)) return String(v || '—');
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function isoDate(v) {
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return d.toISOString().slice(0, 10);
  }

  async function init() {
    currentUser = await Auth.requireRole(['Boss', 'Admin']);
    if (!currentUser) return;

    Layout.build('report.html', currentUser);
    Layout.mainMount().innerHTML = document.getElementById('pageContent').innerHTML;
    document.getElementById('menuBtn')?.addEventListener('click', Layout.toggleSidebar);

    populateCategorySelect(document.getElementById('categoryFilter'), true);

    await Promise.all([loadStats(), loadExpenses(), loadSiteFilter()]);
    wireFilters();
    wireExport();
  }

  async function loadStats() {
    try {
      const stats = await Api.getDashboardStats();
      document.getElementById('statToday').textContent = money(stats.todayTotal);
      document.getElementById('statMonth').textContent = money(stats.monthTotal);
      document.getElementById('statSites').textContent = stats.totalSites;
      document.getElementById('statCount').textContent = stats.totalTransactions;
      renderMonthChart(stats.byMonth);
      renderCategoryChart(stats.byCategory);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function renderMonthChart(byMonth) {
    const labels = Object.keys(byMonth).sort();
    const values = labels.map(l => byMonth[l]);
    const el = document.getElementById('monthChart');
    if (typeof Chart === 'undefined') { chartUnavailable(el); return; }
    const ctx = el.getContext('2d');
    if (monthChart) monthChart.destroy();
    monthChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Total Spend', data: values, backgroundColor: '#1656F5', borderRadius: 6, maxBarThickness: 38 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => '₦' + v.toLocaleString() } } }
      }
    });
  }

  function chartUnavailable(canvasEl) {
    const wrap = canvasEl?.closest('.card');
    if (!wrap) return;
    if (wrap.querySelector('.chart-offline-note')) return;
    const note = document.createElement('div');
    note.className = 'chart-offline-note';
    note.style.cssText = 'padding:24px;text-align:center;color:var(--color-ink-muted);font-size:13px;';
    note.textContent = 'Charts need an internet connection to load (they come from a CDN). Everything else on this page still works offline.';
    canvasEl.style.display = 'none';
    wrap.appendChild(note);
  }

  function renderCategoryChart(byCategory) {
    const labels = Object.keys(byCategory);
    const values = labels.map(l => byCategory[l]);
    const colors = labels.map((_, i) => PALETTE[i % PALETTE.length]);
    const el = document.getElementById('categoryChart');
    if (typeof Chart === 'undefined') { chartUnavailable(el); renderCategoryLegend(labels, values, colors, byCategory); return; }
    const ctx = el.getContext('2d');
    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(ctx, {
      type: 'pie',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
    renderCategoryLegend(labels, values, colors, byCategory);
  }

  function renderCategoryLegend(labels, values, colors, byCategory) {
    const total = values.reduce((a, b) => a + b, 0) || 1;
    document.getElementById('categoryLegend').innerHTML = labels.map((l, i) => `
      <div class="legend-row">
        <span class="dot" style="background:${colors[i]}"></span>
        <span>${l}</span>
        <span class="amt">${money(byCategory[l])} · ${Math.round(byCategory[l] / total * 100)}%</span>
      </div>
    `).join('');
  }

  async function loadSiteFilter() {
    try {
      const data = await Api.getSites();
      const names = (data.sites || []).map(s => s['Site Name']).filter(Boolean).sort();
      const siteFilter = document.getElementById('siteFilter');
      names.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = s;
        siteFilter.appendChild(opt);
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function loadExpenses() {
    try {
      const data = await Api.getExpenses();
      allExpenses = data.expenses || [];
      filtered = allExpenses;
      render(allExpenses);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function render(list) {
    const rows = document.getElementById('expenseRows');
    const empty = document.getElementById('emptyState');
    rows.innerHTML = '';
    if (!list.length) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    list.forEach(e => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="badge gray">${e['Expense ID']}</span></td>
        <td>${fmtDate(e.Date)}</td>
        <td>${e.Site || ''}</td>
        <td><span class="badge">${e.Category}</span></td>
        <td>${e.Description || ''}</td>
        <td><strong>${money(e.Amount)}</strong></td>
        <td>${e.Vendor || '—'}</td>
        <td>${e['Payment Method'] || '—'}</td>
        <td>${e['Submitted By'] || ''}</td>
      `;
      rows.appendChild(tr);
    });
  }

  function applyFilters() {
    const q = (document.getElementById('searchBox').value || '').toLowerCase();
    const site = document.getElementById('siteFilter').value;
    const cat = document.getElementById('categoryFilter').value;
    const from = document.getElementById('fromDate').value;
    const to = document.getElementById('toDate').value;

    filtered = allExpenses.filter(e => {
      if (q) {
        const hay = [e.Description, e.Vendor, e.Category, e['Expense ID']].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      if (site && e.Site !== site) return false;
      if (cat && e.Category !== cat) return false;
      const d = isoDate(e.Date);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
    render(filtered);
  }

  function wireFilters() {
    document.getElementById('searchBox').addEventListener('input', applyFilters);
    ['siteFilter', 'categoryFilter', 'fromDate', 'toDate'].forEach(id => {
      document.getElementById(id).addEventListener('input', applyFilters);
      document.getElementById(id).addEventListener('change', applyFilters);
    });
  }

  function wireExport() {
    document.getElementById('exportExcelBtn').addEventListener('click', () => {
      const rows = filtered.map(e => ({
        'Expense ID': e['Expense ID'], Date: fmtDate(e.Date), Site: e.Site, Category: e.Category,
        Description: e.Description, Amount: e.Amount, Vendor: e.Vendor,
        'Payment Method': e['Payment Method'], 'Submitted By': e['Submitted By']
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
      XLSX.writeFile(wb, 'site-expenses-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    });

    document.getElementById('exportPdfBtn').addEventListener('click', () => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(14);
      doc.text('Site Expense Report', 14, 16);
      doc.setFontSize(9);
      doc.text('Generated ' + new Date().toLocaleString(), 14, 22);
      doc.autoTable({
        startY: 28,
        head: [['ID', 'Date', 'Site', 'Category', 'Description', 'Amount', 'Vendor', 'Payment', 'By']],
        body: filtered.map(e => [
          e['Expense ID'], fmtDate(e.Date), e.Site, e.Category, e.Description,
          money(e.Amount), e.Vendor || '—', e['Payment Method'] || '—', e['Submitted By'] || ''
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [22, 86, 245] }
      });
      doc.save('site-expenses-' + new Date().toISOString().slice(0, 10) + '.pdf');
    });
  }

  init();
})();
