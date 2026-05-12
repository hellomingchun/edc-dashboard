// custom-tables.js - Logic for Custom Tables and Exports

window.customTables = JSON.parse(localStorage.getItem('edc_custom_tables') || '[]');

document.addEventListener('DOMContentLoaded', () => {
    // Buttons in Raw Data View
    const btnSaveView = document.getElementById('btn-save-view');
    const btnExportCsv = document.getElementById('btn-export-csv');
    
    // Buttons in Custom Table View
    const btnExportCustom = document.getElementById('btn-export-custom');

    if (btnSaveView) {
        btnSaveView.addEventListener('click', () => {
            const domain = document.getElementById('domain-selector').value;
            const data = window.currentFilteredData;
            
            if (!data || data.length === 0) {
                alert('No data to save! Please clear some filters or select a different domain.');
                return;
            }

            const defaultName = `${domain.toUpperCase()} Custom Extract - ${new Date().toLocaleDateString()}`;
            const tableName = prompt('Enter a name for this custom table view:', defaultName);
            
            if (tableName) {
                const newTable = {
                    id: 'tbl_' + Date.now(),
                    name: tableName,
                    domain: domain,
                    dateSaved: new Date().toISOString(),
                    filters: Object.assign({}, window.activeFilters[domain]),
                    data: data // Save the static snapshot
                };
                
                window.customTables.push(newTable);
                saveTablesToStorage();
                
                // Navigate to Custom Tables view
                switchView('custom-table');
            }
        });
    }

    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', () => {
            const domain = document.getElementById('domain-selector').value;
            exportDataToCSV(window.currentFilteredData, `${domain}_export_${Date.now()}.csv`);
        });
    }

    if (btnExportCustom) {
        btnExportCustom.addEventListener('click', () => {
            if (window.currentPreviewTableId) {
                const table = window.customTables.find(t => t.id === window.currentPreviewTableId);
                if (table) {
                    exportDataToCSV(table.data, `${table.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`);
                }
            }
        });
    }
    
    // Intercept navigation to custom-table to trigger render
    const originalSwitchView = window.switchView;
    window.switchView = function(viewName) {
        originalSwitchView(viewName);
        if (viewName === 'custom-table') {
            renderCustomTablesLibrary();
        }
    };
});

function saveTablesToStorage() {
    try {
        localStorage.setItem('edc_custom_tables', JSON.stringify(window.customTables));
    } catch (e) {
        console.warn('LocalStorage limit reached. Custom tables will not persist after reload.');
    }
    renderCustomTablesLibrary();
}

function renderCustomTablesLibrary() {
    const libraryContainer = document.getElementById('custom-tables-library');
    const previewContainer = document.getElementById('custom-table-preview');
    
    if (!libraryContainer) return;

    if (window.customTables.length === 0) {
        libraryContainer.innerHTML = '<p style="color: var(--text-secondary); grid-column: 1 / -1;">No custom tables saved yet. Go to Raw Data, apply some filters, and click "Save View".</p>';
        previewContainer.style.display = 'none';
        return;
    }

    libraryContainer.innerHTML = window.customTables.map(tbl => {
        const filterKeys = Object.keys(tbl.filters).filter(k => tbl.filters[k] !== '');
        const filterStr = filterKeys.length > 0 ? filterKeys.map(k => `${k}: "${tbl.filters[k]}"`).join(', ') : 'No filters applied';
        const dateStr = new Date(tbl.dateSaved).toLocaleString();
        
        return `
            <div class="saved-table-card" onclick="previewCustomTable('${tbl.id}')">
                <h3>${tbl.name}</h3>
                <p><b>Domain:</b> ${tbl.domain.toUpperCase()}</p>
                <p><b>Records:</b> ${tbl.data.length}</p>
                <p style="font-size: 0.75rem;"><b>Filters:</b> ${filterStr}</p>
                <p style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 1.5rem;">Saved on ${dateStr}</p>
                <div class="saved-table-actions">
                    <button onclick="event.stopPropagation(); previewCustomTable('${tbl.id}')"><i data-lucide="eye" style="width: 14px; height: 14px;"></i> View</button>
                    <button class="btn-delete" onclick="event.stopPropagation(); deleteCustomTable('${tbl.id}')"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i> Delete</button>
                </div>
            </div>
        `;
    }).join('');
    
    if (window.lucide) {
        lucide.createIcons();
    }
}

window.previewCustomTable = function(id) {
    const table = window.customTables.find(t => t.id === id);
    if (!table) return;

    window.currentPreviewTableId = id;
    
    const previewContainer = document.getElementById('custom-table-preview');
    const thead = document.getElementById('custom-data-thead');
    const tbody = document.getElementById('custom-data-tbody');
    const title = document.getElementById('custom-table-preview-title');
    
    previewContainer.style.display = 'block';
    previewContainer.classList.add('animate-fade-in');
    title.textContent = `Preview: ${table.name}`;
    
    if (table.data.length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td style="text-align: center; padding: 2rem;">No data in this table.</td></tr>';
        return;
    }

    const cols = Object.keys(table.data[0]);
    thead.innerHTML = `<tr>${cols.map(c => `<th>${c.replace(/_/g, ' ')}</th>`).join('')}</tr>`;
    tbody.innerHTML = table.data.slice(0, 100).map(row => `
        <tr>${cols.map(c => `<td>${row[c] !== null && row[c] !== undefined ? row[c] : ''}</td>`).join('')}</tr>
    `).join('');
    
    // Smooth scroll to preview
    previewContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.deleteCustomTable = function(id) {
    if (confirm('Are you sure you want to delete this custom table?')) {
        window.customTables = window.customTables.filter(t => t.id !== id);
        saveTablesToStorage();
        const previewContainer = document.getElementById('custom-table-preview');
        if (window.currentPreviewTableId === id) {
            previewContainer.style.display = 'none';
            window.currentPreviewTableId = null;
        }
    }
};

function exportDataToCSV(dataArray, filename) {
    if (!dataArray || dataArray.length === 0) {
        alert("No data available to export.");
        return;
    }
    
    // Use PapaParse to generate CSV string
    const csvString = Papa.unparse(dataArray);
    
    // Create a Blob and trigger download
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
