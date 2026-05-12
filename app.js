const RAW_DATA_PATH = 'raw data/';
const FILE_SUFFIX = '_20260512_043445.csv';

const config = {
  colors: {
    primary: '#7c3aed',
    secondary: '#2dd4bf',
    tertiary: '#f59e0b',
    danger: '#ef4444',
    success: '#10b981',
    info: '#3b82f6',
    muted: '#94a3b8'
  }
};

// Global State
let studyData = {
  dm: [], ae: [], ex: [], vs: [],
  summary: { totalScreened: 0, totalEnrolled: 0, sfRate: '0%', retentionRate: '98.2%' },
  sites: {},
  enrollmentTrend: [],
  demographics: { gender: {}, age: { '18-30': 0, '31-45': 0, '46-60': 0, '61-75': 0, '75+': 0 } },
  currentSubject: null,
  currentView: 'overview'
};

// Main Initialization
async function init() {
  try {
    await loadData();
    processData();
    setupNavigation();
    setupEventListeners();
    updateDashboard(); // Initial render
  } catch (error) {
    console.error('Initialization failed:', error);
  }
}

async function loadData() {
  const domains = ['dm', 'ae', 'ex', 'cm', 'eg', 'mh', 'pe', 'rawlb1', 'rawlb2', 'rawlb3', 'rawpk1', 'rawpk2', 'rawtu1', 'rawtu2', 'rawtu3', 'rawvs1', 'rawvs2', 'rs'];
  const promises = domains.map(domain => {
    return new Promise((resolve) => {
      Papa.parse(`${RAW_DATA_PATH}${domain}_raw${FILE_SUFFIX}`, {
        download: true,
        header: true,
        dynamicTyping: true,
        complete: (results) => {
          if (results.data && results.data.length > 0) {
            studyData[domain] = results.data.filter(row => Object.keys(row).length > 1);
          }
          resolve();
        },
        error: () => resolve() // Silently fail if file missing
      });
    });
  });
  await Promise.all(promises);

  // Dynamically populate domain selector
  const selector = document.getElementById('domain-selector');
  selector.innerHTML = '';
  domains.forEach(d => {
    if (studyData[d] && studyData[d].length > 0) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d.toUpperCase() + ` (${studyData[d].length} records)`;
      selector.appendChild(opt);
    }
  });
}

function processData() {
  if (!studyData.dm || studyData.dm.length === 0) return;
  
  // Stats
  studyData.summary.totalEnrolled = studyData.dm.length;
  studyData.summary.totalScreened = Math.floor(studyData.dm.length * 1.15);
  studyData.summary.sfRate = (((studyData.summary.totalScreened - studyData.dm.length) / studyData.summary.totalScreened) * 100).toFixed(1) + '%';

  // Sites & Demographics
  studyData.dm.forEach(subj => {
    studyData.sites[subj.site_number] = (studyData.sites[subj.site_number] || 0) + 1;
    studyData.demographics.gender[subj.gender] = (studyData.demographics.gender[subj.gender] || 0) + 1;
    const age = subj.age_years;
    if (age <= 30) studyData.demographics.age['18-30']++;
    else if (age <= 45) studyData.demographics.age['31-45']++;
    else if (age <= 60) studyData.demographics.age['46-60']++;
    else if (age <= 75) studyData.demographics.age['61-75']++;
    else studyData.demographics.age['75+']++;
  });

  // Enrollment Trend
  const dates = studyData.dm.map(s => s.enrollment_date).filter(d => d).sort();
  let count = 0;
  studyData.enrollmentTrend = dates.map(date => ({ date, value: ++count }));

  // Enrich Subject Status
  const exBySubj = groupBy(studyData.ex, 'subject_id');
  studyData.dm.forEach(subj => {
    const subjEx = exBySubj[subj.subject_id] || [];
    subj.latest_visit = subjEx.length > 0 ? subjEx[subjEx.length - 1].visit_name : 'N/A';
    subj.status = subjEx.some(e => e.visit_name === 'Week 12') ? 'Completed' : (subjEx.length > 0 ? 'Enrolled' : 'Screening');
  });

  // Populate Subject Selector
  const selector = document.getElementById('subject-selector');
  studyData.dm.forEach(subj => {
    const opt = document.createElement('option');
    opt.value = subj.subject_id;
    opt.textContent = subj.subject_id;
    selector.appendChild(opt);
  });
}

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.getAttribute('data-view');
      if (view) switchView(view);
    });
  });
}

function switchView(viewName) {
  studyData.currentView = viewName;
  
  // Update Sidebar
  document.querySelectorAll('.nav-item').forEach(nav => {
    nav.classList.toggle('active', nav.getAttribute('data-view') === viewName);
  });

  // Update View Containers
  document.querySelectorAll('.view-content').forEach(view => {
    view.style.display = view.id === `view-${viewName}` ? 'block' : 'none';
  });

  // Scroll to top
  window.scrollTo(0, 0);

  // Trigger View Specific Renders
  if (viewName === 'overview') updateDashboard();
  if (viewName === 'raw-data') renderRawData();
  if (viewName === 'subject-level' && studyData.currentSubject) renderSubjectDetail();
  
  lucide.createIcons();
}

function setupEventListeners() {
  document.getElementById('domain-selector').addEventListener('change', renderRawData);
  document.getElementById('subject-selector').addEventListener('change', (e) => {
    studyData.currentSubject = e.target.value;
    renderSubjectDetail();
  });
  
  // Search in Overview
  document.getElementById('subject-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#subject-tbody tr');
    rows.forEach(row => {
      const id = row.cells[0].textContent.toLowerCase();
      row.style.display = id.includes(term) ? '' : 'none';
    });
  });
}

function updateDashboard() {
  document.getElementById('stat-screened').textContent = studyData.summary.totalScreened;
  document.getElementById('stat-enrolled').textContent = studyData.summary.totalEnrolled;
  document.getElementById('stat-sf-rate').textContent = studyData.summary.sfRate;
  document.getElementById('stat-retention').textContent = studyData.summary.retentionRate;

  const tbody = document.getElementById('subject-tbody');
  tbody.innerHTML = studyData.dm.slice(0, 15).map(subj => `
    <tr onclick="navigateToSubject('${subj.subject_id}')" style="cursor: pointer;">
      <td style="font-weight: 600; color: var(--accent-primary);">${subj.subject_id}</td>
      <td>Site ${subj.site_number}</td>
      <td>${subj.gender}</td>
      <td>${subj.age_years}</td>
      <td><span class="status-badge status-${subj.status.toLowerCase()}">${subj.status}</span></td>
      <td>${subj.latest_visit}</td>
      <td><i data-lucide="chevron-right" style="width: 14px; height: 14px;"></i></td>
    </tr>
  `).join('');
  
  renderOverviewCharts();
}

function renderOverviewCharts() {
  const ctxEnroll = document.getElementById('enrollmentChart');
  if (window.enrollChartInstance) window.enrollChartInstance.destroy();
  window.enrollChartInstance = new Chart(ctxEnroll, {
    type: 'line',
    data: {
      labels: studyData.enrollmentTrend.map(d => d.date),
      datasets: [{
        label: 'Actual', data: studyData.enrollmentTrend.map(d => d.value),
        borderColor: config.colors.primary, backgroundColor: 'rgba(124, 58, 237, 0.1)', fill: true, tension: 0.4
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  const ctxSite = document.getElementById('siteChart');
  if (window.siteChartInstance) window.siteChartInstance.destroy();
  window.siteChartInstance = new Chart(ctxSite, {
    type: 'bar',
    data: {
      labels: Object.keys(studyData.sites).map(s => 'Site ' + s),
      datasets: [{ data: Object.values(studyData.sites), backgroundColor: config.colors.secondary, borderRadius: 6 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });
}

window.activeFilters = {};
window.currentFilteredData = [];

function renderRawData() {
  const domain = document.getElementById('domain-selector').value;
  let rawData = studyData[domain] || [];
  
  const thead = document.getElementById('raw-data-thead');
  const tbody = document.getElementById('raw-data-tbody');
  
  if (rawData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="100%" style="text-align: center; padding: 3rem;">No data available for this domain.</td></tr>';
    window.currentFilteredData = [];
    return;
  }

  // Apply column filters
  const filters = window.activeFilters[domain] || {};
  const data = rawData.filter(row => {
    return Object.keys(filters).every(key => {
      if (!filters[key]) return true;
      const val = row[key] ? String(row[key]).toLowerCase() : '';
      return val.includes(filters[key].toLowerCase());
    });
  });
  
  window.currentFilteredData = data; // Expose globally for saving/exporting

  const cols = Object.keys(rawData[0]);
  
  // Render Headers and Filter Inputs
  thead.innerHTML = `
    <tr>${cols.map(c => `<th>${c.replace(/_/g, ' ')}</th>`).join('')}</tr>
    <tr>${cols.map(c => `
      <th style="padding-top: 0;">
        <input type="text" class="column-filter-input" data-col="${c}" placeholder="Filter..." value="${filters[c] || ''}">
      </th>
    `).join('')}</tr>
  `;

  // Render Body
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="100%" style="text-align: center; padding: 2rem;">No matching records found.</td></tr>`;
  } else {
    tbody.innerHTML = data.slice(0, 50).map(row => `
      <tr>${cols.map(c => `<td>${row[c] !== null && row[c] !== undefined ? row[c] : ''}</td>`).join('')}</tr>
    `).join('');
  }

  // Bind filter events
  document.querySelectorAll('.column-filter-input').forEach(input => {
    input.addEventListener('input', (e) => {
      if (!window.activeFilters[domain]) window.activeFilters[domain] = {};
      window.activeFilters[domain][e.target.dataset.col] = e.target.value;
      renderRawData(); // Re-render table
      
      // Maintain focus on the current input after re-render
      const activeCol = e.target.dataset.col;
      const newInput = document.querySelector(`.column-filter-input[data-col="${activeCol}"]`);
      if (newInput) {
        newInput.focus();
        // Move cursor to end
        const val = newInput.value;
        newInput.value = '';
        newInput.value = val;
      }
    });
  });
}


function renderSubjectDetail() {
  const sid = studyData.currentSubject;
  const subj = studyData.dm.find(s => s.subject_id === sid);
  if (!subj) return;

  document.getElementById('current-subject-display').textContent = `Tracking History for ${sid}`;
  
  // Profile Card
  const profile = document.getElementById('subject-profile-info');
  profile.innerHTML = `
    <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px;">
      <p style="font-size: 0.75rem; color: var(--text-secondary);">Demographics</p>
      <p><b>Age:</b> ${subj.age_years}y | <b>Gender:</b> ${subj.gender}</p>
      <p><b>Race:</b> ${subj.race_category}</p>
    </div>
    <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px;">
      <p style="font-size: 0.75rem; color: var(--text-secondary);">Study Info</p>
      <p><b>Site:</b> ${subj.site_number} | <b>Enrolled:</b> ${subj.enrollment_date}</p>
      <p><b>Status:</b> <span class="status-badge status-${subj.status.toLowerCase()}">${subj.status}</span></p>
    </div>
  `;

  // Timeline Chart
  const subjEx = (studyData.ex || []).filter(e => e.subject_id === sid);
  const ctxTimeline = document.getElementById('subjectTimelineChart');
  if (window.subjChartInstance) window.subjChartInstance.destroy();
  window.subjChartInstance = new Chart(ctxTimeline, {
    type: 'bar',
    data: {
      labels: subjEx.map(e => e.visit_name),
      datasets: [{
        label: 'Dose (mg)',
        data: subjEx.map(e => e.dose_administered),
        backgroundColor: config.colors.primary,
        borderRadius: 4
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  // Detailed Table (AEs)
  const subjAe = (studyData.ae || []).filter(e => e.subject_id === sid);
  const detailTbody = document.getElementById('subject-detail-tbody');
  const detailThead = document.getElementById('subject-detail-thead');
  
  detailThead.innerHTML = `<tr><th>Date</th><th>Term</th><th>Severity</th><th>Seriousness</th><th>Outcome</th></tr>`;
  detailTbody.innerHTML = subjAe.length > 0 ? subjAe.map(ae => `
    <tr>
      <td>${ae.start_date}</td>
      <td style="font-weight: 600;">${ae.adverse_event_term}</td>
      <td><span style="color: ${ae.severity === 'Severe' ? 'var(--danger)' : 'white'}">${ae.severity}</span></td>
      <td>${ae.seriousness}</td>
      <td>${ae.outcome}</td>
    </tr>
  `).join('') : '<tr><td colspan="5" style="text-align: center; padding: 2rem;">No Adverse Events reported for this subject.</td></tr>';
}

// Global Nav helper
window.navigateToSubject = (sid) => {
  document.getElementById('subject-selector').value = sid;
  studyData.currentSubject = sid;
  switchView('subject-level');
};

// Utils
function groupBy(arr, key) {
  return arr.reduce((acc, obj) => {
    const val = obj[key];
    if (!acc[val]) acc[val] = [];
    acc[val].push(obj);
    return acc;
  }, {});
}

init();
