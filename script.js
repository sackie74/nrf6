// Configuration
const SHEET_ID = "2PACX-1vR3lt7jBLAvAIohP7xUEaGQ1I7Lnj5Biqw63NlPXDlC3Qy9DDF7NoVQ-oE-Hh-zNXmFdY2VAtuoDOsn";
const SHEET_NAME = "Sheet1";
const PROXY_URL = "https://api.allorigins.win/raw?url=";
const SHEET_URL = PROXY_URL + encodeURIComponent(
    `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?output=csv&sheet=${SHEET_NAME}`
);

// Initialize map
const map = L.map('map').setView([6.4281, -9.4295], 7);

// Custom icons - reduced size by half
const icons = {
    "completed": L.icon({
        iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-green.png',
        iconSize: [12, 20],
        iconAnchor: [6, 20],
        popupAnchor: [1, -17]
    }),
    "75% complete": L.icon({
        iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-blue.png',
        iconSize: [12, 20],
        iconAnchor: [6, 20],
        popupAnchor: [1, -17]
    }),
    "in progress": L.icon({
        iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-orange.png',
        iconSize: [12, 20],
        iconAnchor: [6, 20],
        popupAnchor: [1, -17]
    }),
    "not started": L.icon({
        iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-red.png',
        iconSize: [12, 20],
        iconAnchor: [6, 20],
        popupAnchor: [1, -17]
    })
};

// Global variables
const markers = L.layerGroup();
let countyChart, statusPieChart;
let allProjects = [];
let filteredProjects = [];

// Main function to load data
async function initApp() {
    showLoading(true);
    try {
        allProjects = await loadData();
        if (allProjects.length > 0) {
            filteredProjects = [...allProjects];
            addMarkers(allProjects);
            setupEventListeners();
            setupFilters();
            
            // Add base layers
            const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);
            
            const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            });
            
            L.control.layers({
                "Street View": streetLayer,
                "Satellite View": satelliteLayer
            }, null, { position: 'topright' }).addTo(map);
            
            updateDashboard(allProjects);
        } else {
            showError("No valid project data found");
        }
    } catch (error) {
        console.error("Initialization error:", error);
        showError("Failed to initialize application");
    } finally {
        showLoading(false);
    }
}

// Load data from Google Sheets
async function loadData() {
    try {
        const response = await fetch(SHEET_URL);
        if (!response.ok) throw new Error("Network response was not ok");
        
        const csvData = await response.text();
        const workbook = XLSX.read(csvData, { type: 'string' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawProjects = XLSX.utils.sheet_to_json(sheet);
        
        return rawProjects.map(project => {
            const lat = parseFloat(project.Latitude);
            const lng = parseFloat(project.Longitude);
            const percent = parseFloat(project["Percent completed"]) || 0;
            const startDate = project["Start date"] ? new Date(project["Start date"]) : null;
            const endDate = project["End date"] ? new Date(project["End date"]) : null;
            
            return {
                lat: isNaN(lat) ? null : lat,
                lng: isNaN(lng) ? null : lng,
                county: project.County || "Unknown",
                community: project.Community || "",
                description: project.Description || "Unnamed Project",
                status: determineStatus(project, percent),
                percent: percent,
                startDate: startDate,
                endDate: endDate
            };
        }).filter(project => project.lat && project.lng);
    } catch (error) {
        console.error("Error loading data:", error);
        throw error;
    }
}

// Determine project status
function determineStatus(project, percent) {
    if (percent >= 100) return "completed";
    if (percent >= 75) return "75% complete";
    if (percent > 0) return "in progress";
    if (project.Statuses) return project.Statuses.toLowerCase();
    return "not started";
}

// Add markers to map
function addMarkers(projects) {
    markers.clearLayers();
    
    projects.forEach(project => {
        const marker = L.marker([project.lat, project.lng], { 
            icon: icons[project.status],
            riseOnHover: true
        }).bindPopup(`
            <b>${project.description}</b><br>
            <b>County:</b> ${project.county}<br>
            <b>Community:</b> ${project.community}<br>
            <b>Status:</b> ${project.status}<br>
            <b>Progress:</b> ${project.percent}% complete<br>
            <b>Start Date:</b> ${project.startDate ? project.startDate.toLocaleDateString() : 'N/A'}<br>
            <b>End Date:</b> ${project.endDate ? project.endDate.toLocaleDateString() : 'N/A'}
        `, {
            maxWidth: 300,
            minWidth: 200
        });
        
        // Prevent map zoom on click
        marker.on('click', function(e) {
            e.originalEvent.preventDefault();
            e.originalEvent.stopPropagation();
        });
        
        markers.addLayer(marker);
    });
    
    map.addLayer(markers);
    
    // Zoom to show all markers if there are any
    if (projects.length > 0) {
        const markerGroup = new L.featureGroup(projects.map(p => L.marker([p.lat, p.lng])));
        map.fitBounds(markerGroup.getBounds(), {
            padding: [50, 50],
            maxZoom: 12
        });
    }
}

// Update dashboard with data
function updateDashboard(projects) {
    const countyStats = {};
    const statusStats = {
        "completed": 0,
        "75% complete": 0,
        "in progress": 0,
        "not started": 0
    };
    
    projects.forEach(project => {
        if (!countyStats[project.county]) {
            countyStats[project.county] = {
                planned: 0,
                completed: 0,
                "75% complete": 0,
                "in progress": 0,
                "not started": 0
            };
        }
        countyStats[project.county].planned++;
        countyStats[project.county][project.status]++;
        
        statusStats[project.status]++;
    });

    updateTable(projects);
    updateCountyChart(countyStats, statusStats);
    updateStatusPieChart(statusStats);
}

// Update table with project details
function updateTable(projects) {
    const tableBody = document.querySelector('#project-table tbody');
    tableBody.innerHTML = '';
    
    projects.forEach(project => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${project.county}</td>
            <td>${project.community}</td>
            <td>${project.description}</td>
            <td><span class="status-badge ${project.status.replace('%', '').replace(' ', '-')}">${project.status}</span></td>
            <td>${project.percent}%</td>
            <td>${project.startDate ? project.startDate.toLocaleDateString() : 'N/A'}</td>
            <td>${project.endDate ? project.endDate.toLocaleDateString() : 'N/A'}</td>
        `;
        tableBody.appendChild(row);
    });
}

// Update county chart with statistics
function updateCountyChart(countyStats, statusStats) {
    const ctx = document.getElementById('countyChart').getContext('2d');
    const counties = Object.keys(countyStats);
    
    if (countyChart) countyChart.destroy();
    
    countyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: counties,
            datasets: [
                { 
                    label: `Completed (${statusStats["completed"]})`, 
                    data: counties.map(c => countyStats[c].completed), 
                    backgroundColor: '#28a745',
                    borderColor: '#218838',
                    borderWidth: 1
                },
                { 
                    label: `75% Complete (${statusStats["75% complete"]})`, 
                    data: counties.map(c => countyStats[c]["75% complete"]), 
                    backgroundColor: '#17a2b8',
                    borderColor: '#138496',
                    borderWidth: 1
                },
                { 
                    label: `In Progress (${statusStats["in progress"]})`, 
                    data: counties.map(c => countyStats[c]["in progress"]), 
                    backgroundColor: '#ffc107',
                    borderColor: '#e0a800',
                    borderWidth: 1
                },
                { 
                    label: `Not Started (${statusStats["not started"]})`, 
                    data: counties.map(c => countyStats[c]["not started"]), 
                    backgroundColor: '#dc3545',
                    borderColor: '#c82333',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { 
                x: { 
                    stacked: true,
                    grid: {
                        display: false
                    }
                }, 
                y: { 
                    stacked: true, 
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                } 
            },
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        afterBody: function(context) {
                            const county = context[0].label;
                            const total = countyStats[county].planned;
                            return `Total Projects: ${total}`;
                        }
                    }
                }
            }
        }
    });
}

// Update status pie chart
function updateStatusPieChart(statusStats) {
    const ctx = document.getElementById('statusPieChart').getContext('2d');
    const statuses = Object.keys(statusStats);
    const total = Object.values(statusStats).reduce((a, b) => a + b, 0);
    
    if (statusPieChart) statusPieChart.destroy();
    
    statusPieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: statuses.map(s => `${s} (${statusStats[s]})`),
            datasets: [{
                data: statuses.map(s => statusStats[s]),
                backgroundColor: [
                    '#28a745', // Completed
                    '#17a2b8', // 75% complete
                    '#ffc107', // In progress
                    '#dc3545'  // Not started
                ],
                borderColor: '#fff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const percentage = Math.round((value / total) * 100);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                },
                title: {
                    display: true,
                    text: `Total Projects: ${total}`,
                    position: 'bottom'
                }
            }
        }
    });
}

// Set up event listeners
function setupEventListeners() {
    // Dashboard toggle
    document.getElementById('dashboard-btn').addEventListener('click', function() {
        document.getElementById('dashboard').style.display = 'block';
        document.getElementById('map').style.display = 'none';
        this.style.display = 'none';
    });
    
    document.getElementById('hide-dashboard-btn').addEventListener('click', function() {
        document.getElementById('dashboard').style.display = 'none';
        document.getElementById('map').style.display = 'block';
        document.getElementById('dashboard-btn').style.display = 'inline-block';
    });
    
    // Add project modal
    const modal = document.getElementById('project-modal');
    const addBtn = document.getElementById('add-project-btn');
    const span = document.getElementsByClassName('close')[0];
    
    addBtn.onclick = function() {
        modal.style.display = "block";
    }
    
    span.onclick = function() {
        modal.style.display = "none";
    }
    
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }
    
    // Export buttons
    document.getElementById('export-csv').addEventListener('click', exportToCSV);
    document.getElementById('export-pdf').addEventListener('click', exportToPDF);
}

// Set up filters
function setupFilters() {
    // County filter
    const countySelect = document.getElementById('county-filter');
    const counties = [...new Set(allProjects.map(p => p.county))].sort();
    
    counties.forEach(county => {
        const option = document.createElement('option');
        option.value = county;
        option.textContent = county;
        countySelect.appendChild(option);
    });
    
    // Status filter
    const statusSelect = document.getElementById('status-filter');
    
    // Search box
    const searchBox = document.getElementById('search-box');
    
    // Add event listeners for filters
    countySelect.addEventListener('change', applyFilters);
    statusSelect.addEventListener('change', applyFilters);
    searchBox.addEventListener('input', applyFilters);
}

// Apply all filters
function applyFilters() {
    const countyFilter = document.getElementById('county-filter').value;
    const statusFilter = document.getElementById('status-filter').value;
    const searchTerm = document.getElementById('search-box').value.toLowerCase();
    
    filteredProjects = allProjects.filter(project => {
        const matchesCounty = !countyFilter || project.county === countyFilter;
        const matchesStatus = !statusFilter || project.status === statusFilter;
        const matchesSearch = !searchTerm || 
            project.description.toLowerCase().includes(searchTerm) || 
            project.community.toLowerCase().includes(searchTerm) ||
            project.county.toLowerCase().includes(searchTerm);
        
        return matchesCounty && matchesStatus && matchesSearch;
    });
    
    addMarkers(filteredProjects);
    updateDashboard(filteredProjects);
}

// Export to CSV
function exportToCSV() {
    const headers = ["County", "Community", "Description", "Status", "Progress", "Start Date", "End Date"];
    const data = filteredProjects.map(project => [
        project.county,
        project.community,
        project.description,
        project.status,
        `${project.percent}%`,
        project.startDate ? project.startDate.toLocaleDateString() : 'N/A',
        project.endDate ? project.endDate.toLocaleDateString() : 'N/A'
    ]);
    
    const csvContent = [headers, ...data].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `liberia_projects_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Export to PDF
function exportToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(18);
    doc.text('Liberia Project Tracking System Report', 105, 15, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`Generated on ${new Date().toLocaleDateString()}`, 105, 22, { align: 'center' });
    
    // Summary
    doc.setFontSize(14);
    doc.text('Project Summary', 14, 30);
    
    const totalProjects = filteredProjects.length;
    const completed = filteredProjects.filter(p => p.status === 'completed').length;
    const seventyFive = filteredProjects.filter(p => p.status === '75% complete').length;
    const inProgress = filteredProjects.filter(p => p.status === 'in progress').length;
    const notStarted = filteredProjects.filter(p => p.status === 'not started').length;
    
    doc.setFontSize(12);
    doc.text(`Total Projects: ${totalProjects}`, 14, 40);
    doc.text(`Completed: ${completed} (${Math.round((completed/totalProjects)*100)}%)`, 14, 46);
    doc.text(`75% Complete: ${seventyFive} (${Math.round((seventyFive/totalProjects)*100)}%)`, 14, 52);
    doc.text(`In Progress: ${inProgress} (${Math.round((inProgress/totalProjects)*100)}%)`, 14, 58);
    doc.text(`Not Started: ${notStarted} (${Math.round((notStarted/totalProjects)*100)}%)`, 14, 64);
    
    // Table
    doc.setFontSize(14);
    doc.text('Project Details', 14, 74);
    
    const tableData = filteredProjects.map(project => [
        project.county,
        project.community,
        project.description,
        project.status,
        `${project.percent}%`,
        project.startDate ? project.startDate.toLocaleDateString() : 'N/A',
        project.endDate ? project.endDate.toLocaleDateString() : 'N/A'
    ]);
    
    doc.autoTable({
        head: [['County', 'Community', 'Description', 'Status', 'Progress', 'Start Date', 'End Date']],
        body: tableData,
        startY: 80,
        styles: {
            fontSize: 8,
            cellPadding: 2,
            overflow: 'linebreak'
        },
        headStyles: {
            fillColor: [52, 152, 219],
            textColor: 255
        },
        alternateRowStyles: {
            fillColor: [240, 240, 240]
        }
    });
    
    doc.save(`liberia_projects_${new Date().toISOString().slice(0,10)}.pdf`);
}

// Show loading spinner
function showLoading(show) {
    const spinner = document.getElementById('loading-spinner');
    spinner.style.display = show ? 'block' : 'none';
}

// Show error message
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initApp);