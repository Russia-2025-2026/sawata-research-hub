/**
 * REPOSITORY - Main Application JavaScript
 * Supabase Cloud Storage Integration
 */

// =====================================================
// FACTORY RESET - CLEAR ALL DATA
// =====================================================

function clearAllDataNow() {
    // Clear all localStorage data
    localStorage.clear();
    
    // Reset all global variables
    researchPapers = [];
    filteredPapers = [];
    currentPage = 1;
    currentPaperId = null;
    currentUser = null;
    isAdminLoggedIn = false;
    isUserLoggedIn = false;
    
    // Update UI
    renderPapersGrid();
    updateStatistics();
    updateAuthUI();
    
    console.log('All data has been cleared');
    showNotification('Data Cleared', 'All saved data has been deleted', 'success');
    
    return true;
}

// =====================================================
// SUPABASE CONFIGURATION
// REPLACE THE VALUES BELOW WITH YOUR SUPABASE CONFIG
// =====================================================

const supabaseConfig = {
    url: "https://pmeryfzgjjvtwohhgxxu.supabase.co",  // Your Supabase project URL
    anonKey: "sb_publishable_gEAJO_Ft4tqI4D_BXnslzA_NC1oiLpb",  // Your Supabase anon/public key
    bucketName: "research-papers",         // Storage bucket name
    userDataBucket: "user-credentials",    // User credentials storage bucket
    maxFileSize: 25 * 1024 * 1024          // 25MB max file size
};

// Initialize Supabase client
let supabaseClient = null;

function initializeSupabase() {
    if (supabaseConfig.url !== "YOUR_SUPABASE_PROJECT_URL" && 
        supabaseConfig.anonKey !== "YOUR_SUPABASE_ANON_KEY") {
        try {
            supabaseClient = window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);
            return true;
        } catch (error) {
            console.error('Failed to initialize Supabase:', error);
            return false;
        }
    }
    return false;
}

const supabaseConfigured = initializeSupabase();

// Global state - starts empty for fresh repository
let researchPapers = [];
let filteredPapers = [];
let currentPage = 1;
const papersPerPage = 9;
let currentPaperId = null;
let currentUser = null;
let isAdminLoggedIn = false;
let isUserLoggedIn = false;
let uploadedFileData = null;
let uploadedFileName = null;

// Upload step tracking
let currentUploadStep = 1;

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // Check if we need to perform a factory reset
    const shouldReset = localStorage.getItem('factoryReset');
    if (shouldReset === 'true') {
        performFactoryReset();
        return;
    }
    
    // Restore user session from localStorage first
    restoreUserSession();
    
    if (supabaseConfigured && supabaseClient) {
        // Initialize with Supabase
        document.getElementById('supabase-loading').style.display = 'flex';
        loadPapersFromSupabase();
    } else {
        // Initialize with local data
        document.getElementById('supabase-loading').style.display = 'none';
        initializeWithLocalData();
        showSupabaseSetupGuide();
    }
    
    // Add event listeners for quick filter buttons
    document.querySelectorAll('.filter-tag').forEach(button => {
        button.addEventListener('click', function() {
            const category = this.getAttribute('data-category');
            filterByCategory(category);
            
            // Update active state
            document.querySelectorAll('.filter-tag').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

// =====================================================
// FACTORY RESET FUNCTIONS
// =====================================================

function performFactoryReset() {
    // Clear all localStorage data
    localStorage.clear();
    
    // Reset global state variables
    researchPapers = [];
    filteredPapers = [];
    currentPage = 1;
    currentPaperId = null;
    currentUser = null;
    isAdminLoggedIn = false;
    isUserLoggedIn = false;
    uploadedFileData = null;
    uploadedFileName = null;
    currentUploadStep = 1;
    
    // Remove the factory reset flag
    localStorage.removeItem('factoryReset');
    
    // Reload the page to start fresh
    window.location.reload();
}

function factoryReset() {
    if (confirm('⚠️ FACTORY RESET WARNING ⚠️\n\nThis will permanently delete ALL data including:\n• All research papers\n• All user accounts\n• All statistics and counts\n• All saved sessions\n\nThis action CANNOT be undone!\n\nAre you sure you want to continue?')) {
        if (confirm('Type "DELETE" to confirm this factory reset:')) {
            // Set the factory reset flag
            localStorage.setItem('factoryReset', 'true');
            
            // Reload to trigger the reset
            window.location.reload();
        }
    }
}

// Session Persistence Functions
function restoreUserSession() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            const user = JSON.parse(savedUser);
            currentUser = user;
            isUserLoggedIn = true;
            isAdminLoggedIn = user.email === 'admin@sawata.edu.ph';
            updateAuthUI();
        } catch (e) {
            console.error('Error restoring session:', e);
        }
    }
}

function saveUserSession(user) {
    localStorage.setItem('currentUser', JSON.stringify(user));
}

function clearUserSession() {
    localStorage.removeItem('currentUser');
}

function initializeWithLocalData() {
    const localPapers = localStorage.getItem('researchPapers');
    if (localPapers) {
        researchPapers = JSON.parse(localPapers);
    } else {
        researchPapers = [];
        localStorage.setItem('researchPapers', JSON.stringify(researchPapers));
    }
    
    renderPapersGrid();
    updateStatistics();
    setupEventListeners();
    renderCharts();
    loadTopPapers();
}

// =====================================================
// SUPABASE FUNCTIONS
// =====================================================

// =====================================================
// HYBRID SERVER-BASED STATS TRACKING
// Uses Supabase Storage for shared stats across users
// Fallback to localStorage if server unavailable
// =====================================================

// Stats storage bucket name
const statsBucketName = 'RESEARCH-STATS';

// Session-based tracking to prevent spam
const SESSION_VIEW_KEY = 'sawata_session_views_';

// Check if user has already viewed this paper in current session
function hasViewedInSession(paperId) {
    const sessionKey = SESSION_VIEW_KEY + paperId;
    return sessionStorage.getItem(sessionKey) === 'true';
}

// Mark paper as viewed in current session
function markViewedInSession(paperId) {
    const sessionKey = SESSION_VIEW_KEY + paperId;
    sessionStorage.setItem(sessionKey, 'true');
}

// Load statistics from Supabase Storage
async function loadStatsFromSupabase() {
    if (!supabaseClient) {
        console.warn('Supabase not initialized, using local stats only');
        return {};
    }
    
    try {
        const { data: files, error } = await supabaseClient
            .storage
            .from(statsBucketName)
            .list('', { limit: 100 });
        
        if (error) {
            console.log('Stats bucket not found or error loading stats:', error.message);
            return {};
        }
        
        if (!files || files.length === 0) {
            return {};
        }
        
        const stats = {};
        
        for (const file of files) {
            if (file.name.endsWith('.json')) {
                try {
                    const { data, error } = await supabaseClient
                        .storage
                        .from(statsBucketName)
                        .download(file.name);
                    
                    if (!error && data) {
                        const text = await data.text();
                        const statData = JSON.parse(text);
                        stats[statData.paperId] = statData;
                    }
                } catch (e) {
                    console.warn('Error loading stat file:', file.name, e);
                }
            }
        }
        
        console.log('Loaded stats from Supabase:', Object.keys(stats).length, 'papers');
        return stats;
    } catch (error) {
        console.warn('Error loading stats:', error);
        return {};
    }
}

// Save paper statistics to Supabase Storage
async function saveStatsToSupabase(paperId, views, downloads) {
    if (!supabaseClient) {
        console.warn('Supabase not initialized, cannot save stats');
        return false;
    }
    
    try {
        const statsContent = {
            paperId: paperId,
            views: views || 0,
            downloads: downloads || 0,
            lastUpdated: new Date().toISOString()
        };
        
        const filename = `${paperId}.json`;
        
        const { error } = await supabaseClient
            .storage
            .from(statsBucketName)
            .upload(filename, JSON.stringify(statsContent), {
                cacheControl: '3600',
                upsert: true,
                contentType: 'application/json'
            });
        
        if (error) {
            console.warn('Error saving stats to Supabase:', error.message);
            return false;
        }
        
        console.log('Stats saved to server for:', paperId);
        return true;
    } catch (error) {
        console.warn('Error saving stats:', error);
        return false;
    }
}

// Increment view count for a paper (Hybrid Approach)
async function incrementViewCount(paperId) {
    const paper = researchPapers.find(p => p.id === paperId);
    if (!paper) return;
    
    // Check if already viewed in this session (prevent spam)
    if (hasViewedInSession(paperId)) {
        console.log('Already viewed in this session:', paperId);
        return;
    }
    
    // Increment local count
    paper.views = (paper.views || 0) + 1;
    
    // Save to localStorage
    localStorage.setItem('researchPapers', JSON.stringify(researchPapers));
    
    // Sync to Supabase (fire and forget, don't block UI)
    saveStatsToSupabase(paperId, paper.views, paper.downloads || 0)
        .then(success => {
            if (success) {
                console.log('View count synced to server:', paperId);
            }
        })
        .catch(err => {
            console.warn('Failed to sync view count:', err);
        });
    
    // Mark as viewed in this session
    markViewedInSession(paperId);
    
    // Update UI
    updateStatistics();
    renderPapersGrid();
}

// Increment download count for a paper (Hybrid Approach)
async function incrementDownloadCount(paperId) {
    const paper = researchPapers.find(p => p.id === paperId);
    if (!paper) return;
    
    // Increment local count
    paper.downloads = (paper.downloads || 0) + 1;
    
    // Save to localStorage
    localStorage.setItem('researchPapers', JSON.stringify(researchPapers));
    
    // Sync to Supabase (fire and forget, don't block UI)
    saveStatsToSupabase(paperId, paper.views || 0, paper.downloads)
        .then(success => {
            if (success) {
                console.log('Download count synced to server:', paperId);
            }
        })
        .catch(err => {
            console.warn('Failed to sync download count:', err);
        });
    
    // Update UI
    updateStatistics();
    renderPapersGrid();
}

// Initialize papers with server stats (Hybrid Approach)
async function initializePaperStats() {
    if (!supabaseClient) {
        console.log('Supabase not configured, using local stats only');
        return;
    }
    
    try {
        // Load stats from Supabase
        const serverStats = await loadStatsFromSupabase();
        
        if (Object.keys(serverStats).length === 0) {
            console.log('No server stats found, using local stats');
            return;
        }
        
        // Merge server stats with local papers
        let statsUpdated = false;
        
        researchPapers.forEach(paper => {
            if (serverStats[paper.id]) {
                const serverStat = serverStats[paper.id];
                // Use server stats as the authoritative source
                paper.views = serverStat.views || 0;
                paper.downloads = serverStat.downloads || 0;
                statsUpdated = true;
            }
        });
        
        if (statsUpdated) {
            // Save merged stats to localStorage
            localStorage.setItem('researchPapers', JSON.stringify(researchPapers));
            console.log('Paper stats initialized from server');
            console.log('Total papers with stats:', Object.keys(serverStats).length);
        }
    } catch (error) {
        console.warn('Error initializing paper stats:', error);
    }
}

async function loadPapersFromSupabase() {
    if (!supabaseClient) {
        console.error('Supabase client not initialized');
        researchPapers = [];
        finalizeInitialization();
        return;
    }
    
    try {
        // List files from the storage bucket
        const { data: files, error: listError } = await supabaseClient
            .storage
            .from(supabaseConfig.bucketName)
            .list('', {
                limit: 200,
                sortBy: { column: 'created_at', order: 'desc' }
            });
        
        if (listError) {
            console.error('Error listing files from Supabase:', listError);
            researchPapers = [];
        } else if (files && files.length > 0) {
            // Get public URL base
            const publicUrlBase = `${supabaseConfig.url}/storage/v1/object/public/${supabaseConfig.bucketName}`;
            
            // Separate document files from metadata JSON files
            const jsonFiles = {};
            const documentFiles = [];
            
            files.forEach(file => {
                if (file.name.endsWith('.json')) {
                    // Store JSON file with its name (without extension) as key
                    const baseName = file.name.replace('.json', '');
                    jsonFiles[baseName] = file;
                } else if (file.name.endsWith('.pdf') || file.name.endsWith('.docx')) {
                    documentFiles.push(file);
                }
            });
            
            // Process document files
            researchPapers = [];
            
            for (const file of documentFiles) {
                const baseName = file.name.replace(/\.[^/.]+$/, '');
                
                // Try to load metadata from JSON file first
                let metadata = null;
                let metadataSource = 'filename';
                
                if (jsonFiles[baseName]) {
                    try {
                        // Download and parse the JSON metadata file
                        const { data: jsonData, error: jsonError } = await supabaseClient
                            .storage
                            .from(supabaseConfig.bucketName)
                            .download(baseName + '.json');
                        
                        if (!jsonError && jsonData) {
                            const jsonText = await jsonData.text();
                            metadata = JSON.parse(jsonText);
                            metadataSource = 'json';
                        }
                    } catch (e) {
                        console.warn('Error loading JSON metadata for', file.name, e);
                    }
                }
                
                // Use metadata from JSON file or fall back to filename parsing
                let title, authors, abstract, category, strand, year, adviser, keywords, views, downloads;
                
                if (metadata) {
                    // Use metadata from JSON file
                    title = metadata.title || '';
                    authors = metadata.authors || [];
                    abstract = metadata.abstract || 'No abstract available';
                    category = metadata.category || 'Research';
                    strand = metadata.strand || 'General';
                    year = metadata.year || new Date().getFullYear().toString();
                    adviser = metadata.adviser || '';
                    keywords = metadata.keywords || [];
                    views = metadata.views || 0;
                    downloads = metadata.downloads || 0;
                } else {
                    // Fall back to filename parsing
                    const parsed = parseFilenameMetadata(file.name);
                    title = parsed.title || '';
                    authors = parsed.authors || [];
                    abstract = parsed.abstract || 'No abstract available';
                    category = parsed.category || 'Research';
                    strand = parsed.strand || 'General';
                    year = parsed.year || new Date().getFullYear().toString();
                    adviser = parsed.adviser || '';
                    keywords = parsed.keywords || [];
                    views = 0;
                    downloads = 0;
                }
                
                // Clean up title
                if (!title || title.trim() === '') {
                    title = file.name.replace(/^\d+_/, '').replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
                }
                
                // Clean up authors
                if (!authors || authors.length === 0 || (authors.length === 1 && !authors[0])) {
                    authors = ['Unknown Author'];
                }
                authors = authors.filter(a => a && a.trim() !== '' && a !== 'undefined');
                if (authors.length === 0) {
                    authors = ['Unknown Author'];
                }
                
                researchPapers.push({
                    id: file.id,
                    name: file.name,
                    title: title,
                    authors: authors,
                    abstract: abstract,
                    category: category,
                    strand: strand,
                    year: year,
                    views: views,
                    downloads: downloads,
                    status: 'approved',
                    adviser: adviser,
                    keywords: keywords,
                    fileUrl: `${publicUrlBase}/${file.name}`,
                    fileName: file.name,
                    format: file.name.split('.').pop(),
                    size: file.metadata?.size || 0,
                    createdAt: file.created_at,
                    metadataSource: metadataSource
                });
            }
            
            // Log for debugging
            console.log('Loaded papers from Supabase:', researchPapers.length);
        } else {
            // No files found in Supabase - clear localStorage and start fresh
            console.log('No files found in Supabase storage. Starting fresh.');
            researchPapers = [];
            localStorage.setItem('researchPapers', JSON.stringify(researchPapers));
        }
        
    } catch (error) {
        console.error('Error loading from Supabase:', error);
        researchPapers = [];
    } finally {
        finalizeInitialization();
    }
}

function parseFilenameMetadata(filename) {
    // Try to extract metadata from filename
    // Format: timestamp_title_authors_category_strand_year.format
    try {
        const baseName = filename.replace('.pdf', '').replace('.docx', '');
        const parts = baseName.split('_');
        
        if (parts.length >= 7) {
            return {
                title: parts.slice(2, -4).join(' '),
                authors: parts[parts.length - 4].split('-'),
                category: parts[parts.length - 3],
                strand: parts[parts.length - 2],
                year: parts[parts.length - 1]
            };
        }
    } catch (e) {
        // Return empty if parsing fails
    }
    return {};
}

function finalizeInitialization() {
    document.getElementById('supabase-loading').style.display = 'none';
    
    // Initialize paper stats from Supabase (async)
    initializePaperStats().then(() => {
        // Save data to localStorage
        localStorage.setItem('researchPapers', JSON.stringify(researchPapers));
        
        renderPapersGrid();
        updateStatistics();
        setupEventListeners();
        renderCharts();
        loadTopPapers();
    });
}

// =====================================================
// USER AUTHENTICATION WITH SUPABASE STORAGE
// =====================================================

// Save user to Supabase storage
async function saveUserToSupabase(userData) {
    if (!supabaseClient) {
        console.warn('Supabase not initialized, saving user locally only');
        return false;
    }
    
    try {
        const userJson = JSON.stringify(userData);
        const filename = `users/${userData.email}.json`;
        
        const { data, error } = await supabaseClient
            .storage
            .from(supabaseConfig.userDataBucket)
            .upload(filename, userJson, {
                cacheControl: '3600',
                upsert: true,
                contentType: 'application/json'
            });
        
        if (error) {
            console.error('Error saving user to Supabase:', error);
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Error saving user to Supabase:', error);
        return false;
    }
}

// Load users from Supabase storage
async function loadUsersFromSupabase() {
    if (!supabaseClient) {
        console.warn('Supabase not initialized');
        return [];
    }
    
    try {
        // List files from the users/ folder in the user-credentials bucket
        const { data: files, error } = await supabaseClient
            .storage
            .from(supabaseConfig.userDataBucket)
            .list('users/', {
                limit: 200
            });
        
        if (error) {
            console.error('Error loading users from Supabase:', error);
            return [];
        }
        
        if (!files || files.length === 0) {
            console.log('No user files found in users/ folder');
            return [];
        }
        
        console.log('Found user files:', files.length);
        
        // Load each user file
        const users = [];
        for (const file of files) {
            // Only process JSON files
            if (!file.name.endsWith('.json')) continue;
            
            try {
                const filePath = `users/${file.name}`;
                
                const { data, error } = await supabaseClient
                    .storage
                    .from(supabaseConfig.userDataBucket)
                    .download(filePath);
                
                if (!error && data) {
                    const text = await data.text();
                    try {
                        const user = JSON.parse(text);
                        console.log('Loaded user:', user.email, '- Status:', user.status);
                        users.push(user);
                    } catch (parseError) {
                        console.warn('Error parsing user file:', file.name, parseError);
                    }
                }
            } catch (downloadError) {
                console.warn('Error downloading user file:', file.name, downloadError);
            }
        }
        
        console.log('Total users loaded from Supabase:', users.length);
        return users;
    } catch (error) {
        console.error('Error loading users from Supabase:', error);
        return [];
    }
}

// Delete user from Supabase storage
async function deleteUserFromSupabase(email) {
    if (!supabaseClient) return false;
    
    try {
        const { error } = await supabaseClient
            .storage
            .from(supabaseConfig.userDataBucket)
            .remove([`users/${email}.json`]);
        
        if (error) {
            console.error('Error deleting user from Supabase:', error);
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Error deleting user from Supabase:', error);
        return false;
    }
}

// Authenticate user from Supabase
async function authenticateUser(email, password) {
    if (!supabaseClient) {
        // Fallback to local storage authentication
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const user = users.find(u => u.email === email && u.password === password);
        
        if (user && user.status === 'approved') {
            return { success: true, user };
        }
        return { success: false, message: 'Invalid credentials or account not approved' };
    }
    
    try {
        // Load users from Supabase
        const users = await loadUsersFromSupabase();
        
        // Find matching user
        const user = users.find(u => u.email === email && u.password === password);
        
        if (!user) {
            return { success: false, message: 'Invalid email or password' };
        }
        
        if (user.status !== 'approved') {
            return { success: false, message: 'Your account is still pending approval. Please contact the administrator.' };
        }
        
        // Save to localStorage for session
        localStorage.setItem('currentUser', JSON.stringify(user));
        localStorage.setItem('users', JSON.stringify(users));
        
        return { success: true, user };
    } catch (error) {
        console.error('Authentication error:', error);
        return { success: false, message: 'Authentication failed' };
    }
}

async function uploadToSupabase(file, metadata) {
    if (!supabaseClient) {
        throw new Error('Supabase client not initialized');
    }
    
    // Create filename with metadata embedded
    const sanitizedTitle = metadata.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
    const sanitizedAuthors = metadata.authors.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30);
    const timestamp = Date.now();
    const filename = `${timestamp}_${sanitizedTitle}_${sanitizedAuthors}_${metadata.category}_${metadata.strand}_${metadata.year}`;
    const fileExtension = file.name.split('.').pop();
    const finalFilename = `${filename}.${fileExtension}`;
    
    // Upload file
    const { data, error } = await supabaseClient
        .storage
        .from(supabaseConfig.bucketName)
        .upload(finalFilename, file, {
            cacheControl: '3600',
            upsert: false
        });
    
    if (error) {
        throw error;
    }
    
    // Also save metadata as JSON file
    const metadataFilename = `${filename}.json`;
    const metadataContent = {
        title: metadata.title,
        authors: metadata.authors.split(',').map(a => a.trim()),
        abstract: metadata.abstract,
        category: metadata.category,
        strand: metadata.strand,
        year: metadata.year,
        adviser: metadata.adviser,
        keywords: metadata.keywords.split(',').map(k => k.trim()),
        views: 0,
        downloads: 0,
        uploadedAt: new Date().toISOString()
    };
    
    const { error: metadataError } = await supabaseClient
        .storage
        .from(supabaseConfig.bucketName)
        .upload(metadataFilename, JSON.stringify(metadataContent), {
            cacheControl: '3600',
            upsert: false,
            contentType: 'application/json'
        });
    
    if (metadataError) {
        console.error('Error saving metadata:', metadataError);
    }
    
    // Get public URL
    const publicUrl = `${supabaseConfig.url}/storage/v1/object/public/${supabaseConfig.bucketName}/${finalFilename}`;
    
    return {
        ...data,
        fileName: finalFilename,
        fileUrl: publicUrl,
        metadataFilename: metadataFilename
    };
}

function updateUploadProgress(percent) {
    const progressBar = document.getElementById('upload-progress');
    const progressText = document.getElementById('progress-text');
    const progressContainer = document.getElementById('upload-progress-container');
    
    // Show progress container if hidden
    if (progressContainer) {
        progressContainer.classList.remove('hidden');
        progressContainer.style.display = 'flex';
    }
    
    if (progressBar) {
        progressBar.style.width = percent + '%';
        if (percent === 100) {
            progressBar.style.backgroundColor = '#28a745';
        }
    }
    
    if (progressText) {
        progressText.textContent = percent < 100 ? `Uploading... ${percent}%` : 'Processing...';
    }
}

function showSupabaseSetupGuide() {
    const guide = `
        <div class="cloudinary-setup-info" style="padding: 20px; background: #f8f9fa; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #0038A8;"><i class="fas fa-cloud-upload-alt"></i> Supabase Setup Required</h3>
            <p>To enable cloud storage for research papers, configure your Supabase account:</p>
            
            <div class="setup-steps">
                <h4>Step 1: Create Supabase Account</h4>
                <ol>
                    <li>Go to <a href="https://supabase.com" target="_blank">supabase.com</a></li>
                    <li>Sign up for a free account</li>
                    <li>Click "New Project" and fill in the details</li>
                    <li>Wait for the project to finish setting up</li>
                </ol>
                
                <h4>Step 2: Create Storage Bucket</h4>
                <ol>
                    <li>Go to <strong>Storage</strong> in the left sidebar</li>
                    <li>Click <strong>New Bucket</strong></li>
                    <li>Bucket name: <code>research-papers</code></li>
                    <li><strong>Make bucket public</strong>: Check this option</li>
                    <li>Click <strong>Create Bucket</strong></li>
                </ol>
                
                <h4>Step 3: Configure Security Policies</h4>
                <ol>
                    <li>Click on the <strong>research-papers</strong> bucket</li>
                    <li>Go to <strong>Policies</strong> tab</li>
                    <li>Click <strong>New Policy</strong></li>
                    <li>Choose <strong>"Custom Policy"</strong></li>
                    <li>Policy name: <code>Public Upload</code></li>
                    <li>Allowed operations: <strong>SELECT, INSERT</strong></li>
                    <li>Target roles: <strong>Leave empty</strong> (for public access)</li>
                    <li>Expression: <code>true</code></li>
                    <li>Click <strong>Save Policy</strong></li>
                </ol>
                
                <h4>Step 4: Get API Credentials</h4>
                <ol>
                    <li>Go to <strong>Project Settings</strong> (gear icon) → <strong>API</strong></li>
                    <li>Copy <strong>Project URL</strong></li>
                    <li>Copy <strong>anon public</strong> key</li>
                </ol>
                
                <h4>Step 5: Update Configuration</h4>
                <p>Edit <code>assets/js/app.js</code> and replace:</p>
                <pre style="background: #2d2d2d; color: #f8f8f2; padding: 15px; border-radius: 5px; overflow-x: auto;">
const supabaseConfig = {
    url: "YOUR_SUPABASE_PROJECT_URL",
    anonKey: "YOUR_SUPABASE_ANON_KEY"
};</pre>
                <p>with your actual Supabase URL and anon key.</p>
            </div>
        </div>
    `;
    
    const container = document.getElementById('cloudinary-setup-container');
    if (container) {
        container.innerHTML = guide;
        container.style.display = 'block';
    }
}

// =====================================================
// AUTHENTICATION
// =====================================================

function handleAuthStateChange(user) {
    const loginBtn = document.getElementById('login-nav-btn');
    const signupBtn = document.getElementById('signup-nav-btn');
    const logoutBtn = document.getElementById('logout-nav-btn');
    const adminNavLink = document.getElementById('admin-nav-link');

    if (user) {
        currentUser = user;
        isUserLoggedIn = true;
        isAdminLoggedIn = user.email === 'admin@sawata.edu.ph';
        
        loginBtn.classList.add('hidden');
        signupBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        
        if (isAdminLoggedIn) {
            adminNavLink.style.display = 'inline-block';
        }
    } else {
        currentUser = null;
        isUserLoggedIn = false;
        isAdminLoggedIn = false;
        
        loginBtn.classList.remove('hidden');
        signupBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
        adminNavLink.style.display = 'none';
        
        const adminSection = document.getElementById('admin');
        if (adminSection) adminSection.style.display = 'none';
    }
}

function handleLogin(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    if (email === 'admin@sawata.edu.ph' && password === 'admin123') {
        isAdminLoggedIn = true;
        isUserLoggedIn = true;
        currentUser = { email: email };
        
        // Save session to localStorage
        saveUserSession(currentUser);
        
        // Update UI elements directly
        const loginBtn = document.getElementById('login-nav-btn');
        const signupBtn = document.getElementById('signup-nav-btn');
        const logoutBtn = document.getElementById('logout-nav-btn');
        const adminNavLink = document.getElementById('admin-nav-link');
        const adminSection = document.getElementById('admin');
        
        if (loginBtn) loginBtn.style.display = 'none';
        if (signupBtn) signupBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
        if (adminNavLink) {
            adminNavLink.classList.add('visible');
        }
        if (adminSection) {
            adminSection.classList.add('active');
            adminSection.style.display = 'block';
        }
        
        closeLoginModal();
        
        // Load admin data
        loadAdminData();
        
        // Show notification with link to admin panel
        showNotification('Login Successful', 'Welcome, Administrator! The Admin Panel is now visible.', 'success');
        
        // Automatically scroll to admin panel
        setTimeout(() => {
            if (adminSection) {
                adminSection.scrollIntoView({ behavior: 'smooth' });
            }
        }, 1000);
    } else {
        // Use Supabase-backed authentication
        authenticateUser(email, password).then(result => {
            if (result.success) {
                isUserLoggedIn = true;
                isAdminLoggedIn = false;
                currentUser = result.user;
                
                // Save session to localStorage
                saveUserSession(currentUser);
                
                // Update UI elements
                const loginBtn = document.getElementById('login-nav-btn');
                const signupBtn = document.getElementById('signup-nav-btn');
                const logoutBtn = document.getElementById('logout-nav-btn');
                
                if (loginBtn) loginBtn.style.display = 'none';
                if (signupBtn) signupBtn.style.display = 'none';
                if (logoutBtn) logoutBtn.style.display = 'inline-block';
                
                closeLoginModal();
                showNotification('Login Successful', `Welcome, ${currentUser.name}!`, 'success');
            } else {
                showNotification('Login Failed', result.message, 'error');
            }
        });
    }
    
    return false;
}

function handleSignup(event) {
    event.preventDefault();
    
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const role = document.getElementById('signup-role').value;
    
    if (password !== document.getElementById('signup-confirm').value) {
        showNotification('Signup Failed', 'Passwords do not match', 'error');
        return;
    }
    
    // Create user object
    const user = {
        id: 'user_' + Date.now(),
        name,
        email,
        password,
        role,
        status: 'pending',
        createdAt: new Date().toISOString()
    };
    
    // Save to Supabase storage for secure authentication
    saveUserToSupabase(user).then(success => {
        if (success) {
            console.log('User saved to Supabase cloud storage');
        }
    });
    
    // Also save locally as backup
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    users.push(user);
    localStorage.setItem('users', JSON.stringify(users));
    
    closeSignupModal();
    showNotification('Registration Submitted', 'Your account is pending approval by the administrator.', 'success');
}

function handleLogout() {
    isAdminLoggedIn = false;
    isUserLoggedIn = false;
    currentUser = null;
    
    // Clear session from localStorage
    clearUserSession();
    
    // Reset UI elements
    const loginBtn = document.getElementById('login-nav-btn');
    const signupBtn = document.getElementById('signup-nav-btn');
    const logoutBtn = document.getElementById('logout-nav-btn');
    const adminNavLink = document.getElementById('admin-nav-link');
    const adminSection = document.getElementById('admin');
    
    if (loginBtn) loginBtn.style.display = 'inline-block';
    if (signupBtn) signupBtn.style.display = 'inline-block';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (adminNavLink) {
        adminNavLink.classList.remove('visible');
    }
    if (adminSection) {
        adminSection.classList.remove('active');
        adminSection.style.display = 'none';
    }
    
    updateAuthUI();
    showNotification('Logged Out', 'You have been logged out', 'info');
}

function updateAuthUI() {
    const loginBtn = document.getElementById('login-nav-btn');
    const signupBtn = document.getElementById('signup-nav-btn');
    const logoutBtn = document.getElementById('logout-nav-btn');
    const adminNavLink = document.getElementById('admin-nav-link');
    
    if (isUserLoggedIn) {
        if (loginBtn) loginBtn.style.display = 'none';
        if (signupBtn) signupBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
        
        if (isAdminLoggedIn && adminNavLink) {
            adminNavLink.classList.add('visible');
        }
    } else {
        if (loginBtn) loginBtn.style.display = 'inline-block';
        if (signupBtn) signupBtn.style.display = 'inline-block';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (adminNavLink) {
            adminNavLink.classList.remove('visible');
        }
    }
}

// =====================================================
// PAPER RENDERING
// =====================================================

function renderPapersGrid() {
    const grid = document.getElementById('papers-grid');
    const resultsCount = document.getElementById('results-count');
    if (!grid) return;
    
    // Show all papers (no approval filtering needed)
    const visiblePapers = researchPapers;
    
    const start = (currentPage - 1) * papersPerPage;
    
    // Check if filters are active (filteredPapers has been set, not just empty array)
    // We use a flag to track if filtering was actually attempted
    const isFilteringActive = window.isFilteringActive === true;
    
    const papersToShow = (filteredPapers.length > 0 || isFilteringActive) ? filteredPapers : visiblePapers;
    const currentPapers = papersToShow.slice(start, start + papersPerPage);
    
    // Update results count text
    if (papersToShow.length === 0) {
        if (resultsCount) {
            if (visiblePapers.length === 0) {
                resultsCount.textContent = 'No research papers yet';
            } else {
                resultsCount.textContent = 'No papers match your search';
            }
        }
    } else if (filteredPapers.length > 0) {
        if (resultsCount) {
            resultsCount.textContent = `Found ${papersToShow.length} paper${papersToShow.length !== 1 ? 's' : ''} matching your search`;
        }
    } else {
        if (resultsCount) {
            resultsCount.textContent = `Showing ${visiblePapers.length} research paper${visiblePapers.length !== 1 ? 's' : ''}`;
        }
    }
    
    if (currentPapers.length === 0) {
        grid.innerHTML = `
            <div class="no-results">
                <i class="fas fa-book"></i>
                <h3>No Research Papers Found</h3>
                <p>${visiblePapers.length === 0 ? 'Start by uploading your first research paper!' : 'No papers match your search criteria.'}</p>
                ${visiblePapers.length === 0 ? `<button class="btn-primary" onclick="openUploadModal()" style="margin-top: 20px;">
                    <i class="fas fa-upload"></i> Upload Paper
                </button>` : ''}
            </div>
        `;
        return;
    }
    
    grid.innerHTML = currentPapers.map(paper => `
        <div class="paper-card" data-id="${paper.id}">
            <div class="paper-card-header">
                <div class="paper-badges">
                    <span class="badge ${getBadgeClass(paper.category)}">${paper.category}</span>
                    <span class="badge secondary">${paper.strand}</span>
                </div>
                <span class="paper-year">${paper.year}</span>
            </div>
            <h3 class="paper-card-title">${paper.title}</h3>
            <p class="paper-card-authors">By: ${paper.authors.join(', ')}</p>
            <p class="paper-card-abstract">${paper.abstract ? paper.abstract.substring(0, 150) + '...' : ''}</p>
            <div class="paper-card-footer">
                <div class="paper-stats-mini">
                    <span class="stat-mini"><i class="fas fa-eye"></i> ${paper.views || 0}</span>
                    <span class="stat-mini"><i class="fas fa-download"></i> ${paper.downloads || 0}</span>
                </div>
                <button class="view-btn" onclick="viewPaper('${paper.id}')">View Details</button>
            </div>
        </div>
    `).join('');
    
    renderPagination(papersToShow.length);
}

function renderPagination(totalPapers) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    
    const totalPages = Math.ceil(totalPapers / papersPerPage);
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = `
        <button class="page-btn" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i>
        </button>
    `;
    
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
    }
    
    html += `
        <button class="page-btn" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
            <i class="fas fa-chevron-right"></i>
        </button>
    `;
    
    pagination.innerHTML = html;
}

function changePage(page) {
    currentPage = page;
    renderPapersGrid();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getBadgeClass(category) {
    const classes = { 'SIP': 'badge-primary', 'Capstone': 'badge-success', 'Action Research': 'badge-warning' };
    return classes[category] || 'badge-primary';
}

// =====================================================
// PAPER VIEW & DETAILS
// =====================================================

function viewPaper(paperId) {
    const paper = researchPapers.find(p => p.id === paperId);
    if (!paper) return;
    
    currentPaperId = paperId;
    
    document.getElementById('modal-title').textContent = paper.title;
    document.getElementById('modal-category').textContent = paper.category;
    document.getElementById('modal-strand').textContent = paper.strand;
    document.getElementById('modal-year').textContent = paper.year;
    
    // Handle abstract display - fix for missing/empty abstract
    const abstractEl = document.getElementById('modal-abstract');
    const abstractSection = abstractEl.parentElement;
    if (paper.abstract && paper.abstract !== 'No abstract available' && paper.abstract.trim() !== '') {
        abstractEl.textContent = paper.abstract;
        abstractEl.classList.remove('text-muted', 'italic');
        abstractSection.classList.remove('data-missing');
    } else {
        abstractEl.textContent = 'No abstract provided for this research paper.';
        abstractEl.classList.add('text-muted', 'italic');
        abstractSection.classList.add('data-missing');
    }
    
    // Handle authors display - fix for missing/empty authors
    const authorsEl = document.getElementById('modal-authors');
    const authorsSection = authorsEl.parentElement;
    const authors = paper.authors || [];
    if (authors.length > 0 && !authors.includes('Unknown Author') && authors[0] !== '') {
        authorsEl.textContent = authors.join(', ');
        authorsEl.classList.remove('text-muted', 'italic');
        authorsSection.classList.remove('data-missing');
    } else {
        authorsEl.textContent = 'Author not listed';
        authorsEl.classList.add('text-muted', 'italic');
        authorsSection.classList.add('data-missing');
    }
    
    document.getElementById('modal-views').textContent = paper.views || 0;
    document.getElementById('modal-downloads').textContent = paper.downloads || 0;
    
    const adviserSection = document.getElementById('adviser-section');
    if (paper.adviser) {
        document.getElementById('modal-adviser').textContent = paper.adviser;
        adviserSection.style.display = 'block';
    } else {
        adviserSection.style.display = 'none';
    }
    
    const keywordsContainer = document.getElementById('modal-keywords');
    const keywordsSection = document.getElementById('keywords-section');
    if (paper.keywords && paper.keywords.length > 0) {
        keywordsContainer.innerHTML = paper.keywords.map(kw => `<span class="keyword-tag">${kw}</span>`).join('');
        keywordsSection.style.display = 'block';
    } else {
        keywordsSection.style.display = 'none';
    }
    
    const downloadBtn = document.querySelector('.paper-actions .btn-primary');
    if (downloadBtn) {
        if (paper.fileUrl && paper.fileUrl !== '#') {
            downloadBtn.onclick = () => downloadPaper();
            downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download';
        } else {
            downloadBtn.onclick = () => downloadPaper();
            downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download';
        }
    }
    
    // Update document preview based on file type
    // Removed PDF preview section per user request
    
    document.getElementById('paper-modal').classList.add('active');
    
    // Increment view count and sync to server
    incrementViewCount(paperId);
    
    // Re-render the papers grid to show updated view count
    renderPapersGrid();
}

function openPaperInNewTab(url) {
    if (url && url !== '#') {
        window.open(url, '_blank');
        incrementDownloadCount(currentPaperId);
        showNotification('Opening Paper', 'The research paper is opening in a new tab', 'info');
    } else {
        showNotification('Paper Unavailable', 'This paper does not have a file attached', 'warning');
    }
}

function downloadPaper() {
    if (!currentPaperId) return;
    
    const paper = researchPapers.find(p => p.id === currentPaperId);
    if (!paper) return;
    
    if (paper.fileUrl && paper.fileUrl !== '#') {
        window.open(paper.fileUrl, '_blank');
        incrementDownloadCount(currentPaperId);
    } else {
        showNotification('Download Unavailable', 'This paper does not have a downloadable file', 'warning');
    }
}

function updateDocumentPreview(paper) {
    const previewContainer = document.getElementById('pdf-preview-container');
    const previewTitle = document.getElementById('preview-title');
    const previewPages = document.getElementById('pdf-pages');
    
    if (!previewContainer) return;
    
    if (paper.fileUrl && paper.fileUrl !== '#') {
        const fileExtension = paper.format || paper.fileName?.split('.').pop()?.toLowerCase() || '';
        const fileName = paper.title || 'Research Document';
        
        // Update title
        if (previewTitle) {
            previewTitle.textContent = fileName;
        }
        
        if (fileExtension === 'pdf') {
            // PDF Preview using iframe
            previewContainer.innerHTML = `
                <iframe src="${paper.fileUrl}#toolbar=0&navpanes=0&scrollbar=0" 
                        width="100%" 
                        height="500px" 
                        style="border: none;"
                        title="PDF Preview">
                </iframe>
                <div class="preview-info">
                    <p><i class="fas fa-info-circle"></i> Use the controls above to navigate the PDF document</p>
                </div>
            `;
        } else if (fileExtension === 'docx') {
            // DOCX Preview using Google Docs Viewer
            const googleDocsUrl = `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(paper.fileUrl)}`;
            previewContainer.innerHTML = `
                <iframe src="${googleDocsUrl}" 
                        width="100%" 
                        height="500px" 
                        style="border: none;"
                        title="DOCX Preview">
                </iframe>
                <div class="preview-info">
                    <p><i class="fas fa-info-circle"></i> Document preview powered by Google Docs Viewer</p>
                </div>
            `;
        } else {
            // Unsupported format
            previewContainer.innerHTML = `
                <div class="pdf-placeholder">
                    <i class="fas fa-file-${fileExtension}"></i>
                    <h3>${fileName}</h3>
                    <p>File format (.${fileExtension}) cannot be previewed online</p>
                    <p>Click "Download" to view the complete document</p>
                </div>
            `;
        }
    } else {
        // No file attached
        previewContainer.innerHTML = `
            <div class="pdf-placeholder">
                <i class="fas fa-file-pdf"></i>
                <h3>No Document Available</h3>
                <p>This research paper does not have a file attached</p>
            </div>
        `;
    }
}

function closeModal() {
    document.getElementById('paper-modal').classList.remove('active');
    currentPaperId = null;
}

// =====================================================
// SEARCH & FILTER
// =====================================================

function performSearch() {
    const searchTerm = document.getElementById('hero-search').value.toLowerCase().trim();
    
    if (!searchTerm) {
        filteredPapers = [];
        window.isFilteringActive = false;
        renderPapersGrid();
        return;
    }
    
    window.isFilteringActive = true;
    
    filteredPapers = researchPapers.filter(paper => {
        const searchableText = [
            paper.title,
            paper.abstract || '',
            ...(paper.authors || []),
            paper.category,
            paper.strand,
            ...(paper.keywords || [])
        ].join(' ').toLowerCase();
        
        return searchableText.includes(searchTerm);
    });
    
    currentPage = 1;
    renderPapersGrid();
    showNotification('Search Results', `Found ${filteredPapers.length} papers matching "${searchTerm}"`, 'info');
}

function filterByCategory(category) {
    window.isFilteringActive = true;
    if (category === 'all') {
        filteredPapers = [];
        window.isFilteringActive = false;
    } else {
        filteredPapers = researchPapers.filter(paper => {
            const paperCategory = (paper.category || '').toLowerCase().trim();
            return paperCategory === category.toLowerCase().trim();
        });
    }
    currentPage = 1;
    renderPapersGrid();
}

function filterByStrand(strand) {
    window.isFilteringActive = true;
    if (!strand || strand === 'all') {
        filteredPapers = [];
        window.isFilteringActive = false;
    } else {
        filteredPapers = researchPapers.filter(paper => {
            const paperStrand = (paper.strand || '').toLowerCase().trim();
            return paperStrand === strand.toLowerCase().trim();
        });
    }
    currentPage = 1;
    renderPapersGrid();
}

function filterByYear(year) {
    window.isFilteringActive = true;
    if (!year || year === 'all') {
        filteredPapers = [];
        window.isFilteringActive = false;
    } else {
        filteredPapers = researchPapers.filter(paper => {
            const paperYear = (paper.year || '').toString().trim();
            return paperYear === year;
        });
    }
    currentPage = 1;
    renderPapersGrid();
}

function resetFilters() {
    filteredPapers = [];
    window.isFilteringActive = false;
    currentPage = 1;
    renderPapersGrid();
    
    // Reset all filter checkboxes
    document.querySelectorAll('input[name="category"]').forEach(cb => {
        if (cb.value === 'all') cb.checked = true;
        else cb.checked = false;
    });
    
    document.querySelectorAll('input[name="strand"]').forEach(cb => {
        if (cb.value === 'all') cb.checked = true;
        else cb.checked = false;
    });
    
    // Reset year filter
    const yearFilter = document.getElementById('year-filter');
    if (yearFilter) {
        yearFilter.value = 'all';
    }
}

// =====================================================
// APPLY FILTERS FUNCTIONALITY
// =====================================================

function applyFilters() {
    // Get selected categories
    const selectedCategories = Array.from(document.querySelectorAll('input[name="category"]:checked'))
        .map(cb => cb.value)
        .filter(val => val !== 'all');
    
    // Get selected strands
    const selectedStrands = Array.from(document.querySelectorAll('input[name="strand"]:checked'))
        .map(cb => cb.value);
    
    // Get selected year
    const selectedYear = document.getElementById('year-filter')?.value;
    
    console.log('Applying filters - Categories:', selectedCategories, 'Strands:', selectedStrands, 'Year:', selectedYear);
    console.log('Total papers available:', researchPapers.length);
    
    // Filter papers based on selections
    filteredPapers = researchPapers.filter(paper => {
        // Category filter - case insensitive
        if (selectedCategories.length > 0) {
            const paperCategory = (paper.category || '').toLowerCase().trim();
            const matchesCategory = selectedCategories.some(cat => cat.toLowerCase().trim() === paperCategory);
            if (!matchesCategory) {
                return false;
            }
        }
        
        // Strand filter - case insensitive
        if (selectedStrands.length > 0) {
            const paperStrand = (paper.strand || '').toLowerCase().trim();
            const matchesStrand = selectedStrands.some(strand => strand.toLowerCase().trim() === paperStrand);
            if (!matchesStrand) {
                return false;
            }
        }
        
        // Year filter
        if (selectedYear && selectedYear !== 'all') {
            const paperYear = (paper.year || '').toString().trim();
            if (paperYear !== selectedYear) {
                return false;
            }
        }
        
        return true;
    });
    
    console.log('Filtered papers count:', filteredPapers.length);
    console.log('Sample paper data:', filteredPapers.length > 0 ? filteredPapers[0] : 'No papers');
    
    // Mark that filtering is active
    window.isFilteringActive = true;
    
    currentPage = 1;
    renderPapersGrid();
    
    const count = filteredPapers.length;
    showNotification('Filter Applied', `Showing ${count} paper${count !== 1 ? 's' : ''} matching your criteria`, 'info');
}

// =====================================================
// UPLOAD FUNCTIONALITY
// =====================================================

function openUploadModal() {
    if (!isUserLoggedIn && !isAdminLoggedIn) {
        showNotification('Login Required', 'Please login to upload research papers', 'warning');
        openLoginModal();
        return;
    }
    
    // Show setup guide if Supabase not configured
    if (!supabaseConfigured) {
        showSupabaseSetupGuide();
    }
    
    document.getElementById('upload-modal').classList.add('active');
    resetUploadForm();
    resetUploadSteps();
}

function closeUploadModal() {
    document.getElementById('upload-modal').classList.remove('active');
    const setupContainer = document.getElementById('cloudinary-setup-container');
    if (setupContainer) setupContainer.style.display = 'none';
    resetUploadForm();
    resetUploadSteps();
}

function resetUploadSteps() {
    currentUploadStep = 1;
    document.querySelectorAll('.upload-step').forEach(step => step.classList.remove('active'));
    document.getElementById('upload-step-1').classList.add('active');
    
    document.getElementById('step-1-indicator').classList.add('active');
    document.getElementById('step-2-indicator').classList.remove('active');
    document.getElementById('step-3-indicator').classList.remove('active');
}

function resetUploadForm() {
    // Reset form fields
    const fields = ['upload-title', 'upload-authors', 'upload-abstract', 'upload-category', 
                    'upload-strand', 'upload-year', 'upload-adviser', 'upload-keywords'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    uploadedFileData = null;
    uploadedFileName = null;
    
    const fileInput = document.getElementById('upload-file');
    if (fileInput) fileInput.value = '';
    
    const progressContainer = document.getElementById('upload-progress-container');
    if (progressContainer) {
        progressContainer.classList.add('hidden');
        progressContainer.style.display = 'none';
    }
    
    const progressFill = document.getElementById('upload-progress');
    if (progressFill) {
        progressFill.style.width = '0%';
        progressFill.style.backgroundColor = '#0038A8';
    }
    
    const progressText = document.getElementById('progress-text');
    if (progressText) progressText.textContent = 'Uploading... 0%';
    
    const reviewBtn = document.getElementById('btn-review-submit');
    if (reviewBtn) {
        reviewBtn.disabled = true;
        reviewBtn.innerHTML = 'Next: Review <i class="fas fa-arrow-right"></i>';
    }
    
    const consent = document.getElementById('upload-consent');
    if (consent) consent.checked = false;
    
    const setupContainer = document.getElementById('cloudinary-setup-container');
    if (setupContainer) setupContainer.style.display = 'none';
}

function nextUploadStep() {
    if (currentUploadStep === 1) {
        const title = document.getElementById('upload-title').value;
        const authors = document.getElementById('upload-authors').value;
        const abstract = document.getElementById('upload-abstract').value;
        const category = document.getElementById('upload-category').value;
        const strand = document.getElementById('upload-strand').value;
        const year = document.getElementById('upload-year').value;
        
        if (!title || !authors || !abstract || !category || !strand || !year) {
            showNotification('Missing Information', 'Please fill in all required fields', 'warning');
            return;
        }
        
        currentUploadStep = 2;
        document.querySelectorAll('.upload-step').forEach(step => step.classList.remove('active'));
        document.getElementById('upload-step-2').classList.add('active');
        
        document.getElementById('step-1-indicator').classList.remove('active');
        document.getElementById('step-2-indicator').classList.add('active');
        
    } else if (currentUploadStep === 2) {
        if (!uploadedFileData) {
            showNotification('No File Selected', 'Please select a research paper file', 'warning');
            return;
        }
        
        const consent = document.getElementById('upload-consent');
        if (!consent || !consent.checked) {
            showNotification('Consent Required', 'Please confirm the declaration to proceed', 'warning');
            return;
        }
        
        // Populate review
        document.getElementById('review-title').textContent = document.getElementById('upload-title').value;
        document.getElementById('review-authors').textContent = document.getElementById('upload-authors').value;
        document.getElementById('review-category').textContent = document.getElementById('upload-category').value;
        document.getElementById('review-strand').textContent = document.getElementById('upload-strand').value;
        document.getElementById('review-year').textContent = document.getElementById('upload-year').value;
        document.getElementById('review-adviser').textContent = document.getElementById('upload-adviser').value || '-';
        document.getElementById('review-keywords').textContent = document.getElementById('upload-keywords').value || '-';
        document.getElementById('review-abstract').textContent = document.getElementById('upload-abstract').value;
        document.getElementById('review-file').textContent = uploadedFileName;
        
        currentUploadStep = 3;
        document.querySelectorAll('.upload-step').forEach(step => step.classList.remove('active'));
        document.getElementById('upload-step-3').classList.add('active');
        
        document.getElementById('step-2-indicator').classList.remove('active');
        document.getElementById('step-3-indicator').classList.add('active');
    }
}

function prevUploadStep() {
    if (currentUploadStep === 3) {
        currentUploadStep = 2;
        document.querySelectorAll('.upload-step').forEach(step => step.classList.remove('active'));
        document.getElementById('upload-step-2').classList.add('active');
        
        document.getElementById('step-3-indicator').classList.remove('active');
        document.getElementById('step-2-indicator').classList.add('active');
        
    } else if (currentUploadStep === 2) {
        currentUploadStep = 1;
        document.querySelectorAll('.upload-step').forEach(step => step.classList.remove('active'));
        document.getElementById('upload-step-1').classList.add('active');
        
        document.getElementById('step-2-indicator').classList.remove('active');
        document.getElementById('step-1-indicator').classList.add('active');
    }
}

async function handleFileSelect(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const file = event.target.files[0];
    if (!file) return;
    
    const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (!allowedTypes.includes(file.type)) {
        showNotification('Invalid File Type', 'Please select a PDF or DOCX file', 'error');
        event.target.value = '';
        return;
    }
    
    if (file.size > supabaseConfig.maxFileSize) {
        showNotification('File Too Large', `Maximum file size is ${supabaseConfig.maxFileSize / (1024 * 1024)}MB`, 'error');
        event.target.value = '';
        return;
    }
    
    uploadedFileName = file.name;
    uploadedFileData = file;
    
    const fileNameEl = document.getElementById('selected-file-name');
    const fileSizeEl = document.getElementById('selected-file-size');
    const progressContainer = document.getElementById('upload-progress-container');
    
    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileSizeEl) fileSizeEl.textContent = formatFileSize(file.size);
    if (progressContainer) {
        progressContainer.classList.remove('hidden');
        progressContainer.style.display = 'flex';
    }
    
    const reviewBtn = document.getElementById('btn-review-submit');
    if (reviewBtn) {
        reviewBtn.disabled = false;
        reviewBtn.innerHTML = 'Next: Review <i class="fas fa-arrow-right"></i>';
    }
    
    showNotification('File Selected', `${file.name} (${formatFileSize(file.size)})`, 'success');
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function clearSelectedFile() {
    uploadedFileData = null;
    uploadedFileName = null;
    
    const fileInput = document.getElementById('upload-file');
    if (fileInput) fileInput.value = '';
    
    const progressContainer = document.getElementById('upload-progress-container');
    if (progressContainer) {
        progressContainer.classList.add('hidden');
        progressContainer.style.display = 'none';
    }
    
    const reviewBtn = document.getElementById('btn-review-submit');
    if (reviewBtn) {
        reviewBtn.disabled = true;
        reviewBtn.innerHTML = 'Next: Review <i class="fas fa-arrow-right"></i>';
    }
}

// Main submit function - called from HTML
async function submitResearchPaper(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    if (!isUserLoggedIn && !isAdminLoggedIn) {
        showNotification('Login Required', 'Please login to upload research papers', 'warning');
        closeUploadModal();
        openLoginModal();
        return false;
    }
    
    if (!uploadedFileData) {
        showNotification('No File Selected', 'Please select a research paper file', 'warning');
        return false;
    }
    
    const title = document.getElementById('upload-title').value;
    const authors = document.getElementById('upload-authors').value;
    const abstract = document.getElementById('upload-abstract').value;
    const category = document.getElementById('upload-category').value;
    const strand = document.getElementById('upload-strand').value;
    const year = document.getElementById('upload-year').value;
    const adviser = document.getElementById('upload-adviser').value;
    const keywords = document.getElementById('upload-keywords').value;
    
    if (!title || !authors || !abstract || !category || !strand || !year) {
        showNotification('Missing Information', 'Please fill in all required fields', 'warning');
        return false;
    }
    
    const submitBtn = document.querySelector('#upload-step-3 .btn-primary');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    }
    
    const progressContainer = document.getElementById('upload-progress-container');
    const progressFill = document.getElementById('upload-progress');
    const progressText = document.getElementById('progress-text');
    
    if (progressContainer) {
        progressContainer.classList.remove('hidden');
        progressContainer.style.display = 'flex';
    }
    if (progressFill) {
        progressFill.style.width = '0%';
        progressFill.style.backgroundColor = '#0038A8';
    }
    if (progressText) {
        progressText.textContent = 'Preparing upload...';
    }
    
    // Simulate progress
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += 10;
        if (progress <= 80) {
            updateUploadProgress(progress);
        }
    }, 200);
    
    try {
        if (!supabaseConfigured) {
            // Save locally if Supabase not configured
            clearInterval(progressInterval);
            updateUploadProgress(100);
            
            const paperData = {
                title: title,
                authors: authors.split(',').map(a => a.trim()),
                abstract: abstract,
                category: category,
                strand: strand,
                year: year,
                adviser: adviser,
                keywords: keywords.split(',').map(k => k.trim()),
                views: 0,
                downloads: 0,
                fileUrl: '#',
                fileName: uploadedFileName,
                status: 'approved',  // Papers are published immediately
                uploadDate: new Date().toISOString()
            };
            
            const newPaper = {
                id: 'paper_' + Date.now(),
                ...paperData
            };
            
            researchPapers.unshift(newPaper);
            localStorage.setItem('researchPapers', JSON.stringify(researchPapers));
            
            renderPapersGrid();
            updateStatistics();
            
            // Refresh admin dashboard if admin is logged in
            if (isAdminLoggedIn) {
                loadAdminData();
            }
            
            showNotification('Upload Successful', 'Paper saved locally', 'success');
            showUploadSuccess(newPaper);
            
            return false;
        }
        
        // Upload to Supabase
        const metadata = {
            title: title,
            authors: authors,
            abstract: abstract,
            category: category,
            strand: strand,
            year: year,
            adviser: adviser,
            keywords: keywords
        };
        
        if (progressText) progressText.textContent = 'Uploading to cloud...';
        
        const result = await uploadToSupabase(uploadedFileData, metadata);
        
        clearInterval(progressInterval);
        updateUploadProgress(100);
        
        // Add new paper to list
        const newPaper = {
            id: result.id || 'paper_' + Date.now(),
            title: metadata.title,
            authors: [metadata.authors],
            abstract: metadata.abstract,
            category: metadata.category,
            strand: metadata.strand,
            year: metadata.year,
            adviser: metadata.adviser,
            keywords: metadata.keywords.split(',').map(k => k.trim()),
            views: 0,
            downloads: 0,
            fileUrl: result.fileUrl,
            fileName: result.fileName,
            format: result.fileName.split('.').pop(),
            status: 'approved',  // Papers are published immediately
            createdAt: new Date().toISOString()
        };
        
        researchPapers.unshift(newPaper);
        
        // Save to localStorage for backup
        localStorage.setItem('researchPapers', JSON.stringify(researchPapers));
        
        renderPapersGrid();
        updateStatistics();
        
        // Refresh admin dashboard if admin is logged in
        if (isAdminLoggedIn) {
            loadAdminData();
        }
        
        showNotification('Upload Successful', 'Your paper is now available in the cloud!', 'success');
        showUploadSuccess(newPaper);
        
    } catch (error) {
        clearInterval(progressInterval);
        console.error('Upload error:', error);
        showNotification('Upload Failed', error.message || 'An error occurred during upload. Please try again.', 'error');
        
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Research';
        }
    }
    
    return false;
}

function showUploadSuccess(paper) {
    document.querySelectorAll('.upload-step').forEach(step => step.classList.remove('active'));
    
    const successTitle = document.getElementById('success-title');
    const successCategory = document.getElementById('success-category');
    const successDate = document.getElementById('success-date');
    
    if (successTitle) successTitle.textContent = paper.title;
    if (successCategory) successCategory.textContent = paper.category;
    if (successDate) successDate.textContent = new Date().toLocaleDateString();
    
    const successView = document.getElementById('upload-success');
    if (successView) successView.classList.add('active');
    
    resetUploadForm();
    resetUploadSteps();
}

function viewUploadedPaper() {
    closeUploadModal();
    
    if (researchPapers.length > 0) {
        viewPaper(researchPapers[0].id);
    }
}

function uploadAnotherPaper() {
    resetUploadForm();
    resetUploadSteps();
}

// =====================================================
// ADMIN FUNCTIONS
// =====================================================

function scrollToAdmin(event) {
    if (!isAdminLoggedIn) {
        event.preventDefault();
        showNotification('Access Denied', 'Admin access required', 'error');
        return;
    }
    
    const adminSection = document.getElementById('admin');
    if (adminSection) {
        adminSection.classList.add('active');
        adminSection.style.display = 'block';
        adminSection.scrollIntoView({ behavior: 'smooth' });
    }
}

function openAdminPanel() {
    if (!isAdminLoggedIn) {
        showNotification('Access Denied', 'Admin access required', 'error');
        return;
    }
    
    const adminSection = document.getElementById('admin');
    if (adminSection) {
        adminSection.classList.add('active');
        adminSection.style.display = 'block';
        adminSection.scrollIntoView({ behavior: 'smooth' });
    }
    loadAdminData();
}

function loadAdminData() {
    // Load users from Supabase cloud storage
    loadUsersFromSupabase().then(supabaseUsers => {
        // Also get users from localStorage
        const localUsers = JSON.parse(localStorage.getItem('users') || '[]');
        
        // Merge users from both sources, avoiding duplicates by email
        const usersMap = new Map();
        
        // Add Supabase users first (they take priority as they're from cloud)
        supabaseUsers.forEach(user => {
            usersMap.set(user.email, user);
        });
        
        // Add local users
        localUsers.forEach(user => {
            if (!usersMap.has(user.email)) {
                usersMap.set(user.email, user);
            }
        });
        
        const users = Array.from(usersMap.values());
        
        // Save merged users back to localStorage for consistency
        localStorage.setItem('users', JSON.stringify(users));
        
        const pendingUsers = users.filter(u => u.status === 'pending');
        
        // Update dashboard stats
        const pendingApprovalsEl = document.getElementById('pending-approvals');
        const totalPapersAdminEl = document.getElementById('total-papers-admin');
        const totalUsersEl = document.getElementById('total-users');
        const pendingUsersCountEl = document.getElementById('pending-users-count');
        
        if (pendingApprovalsEl) pendingApprovalsEl.textContent = pendingUsers.length;
        if (totalPapersAdminEl) totalPapersAdminEl.textContent = researchPapers.length;
        if (totalUsersEl) totalUsersEl.textContent = users.length;
        if (pendingUsersCountEl) {
            pendingUsersCountEl.textContent = pendingUsers.length;
            pendingUsersCountEl.style.display = pendingUsers.length > 0 ? 'inline-flex' : 'none';
        }
        
        // Show pending user approvals
        const pendingContainer = document.getElementById('pending-approvals-list');
        if (pendingContainer) {
            pendingContainer.innerHTML = pendingUsers.length > 0 ? pendingUsers.map(user => `
                <div class="admin-paper-item">
                    <div class="admin-paper-info">
                        <h4>${user.name}</h4>
                        <p>${user.email} • ${user.role}</p>
                        <span class="badge badge-warning">Pending User</span>
                    </div>
                    <div class="admin-paper-actions">
                        <button class="btn-approve" onclick="approveUser('${user.id}')">
                            <i class="fas fa-check"></i> Approve
                        </button>
                        <button class="btn-reject" onclick="deleteUser('${user.id}')">
                            <i class="fas fa-times"></i> Reject
                        </button>
                    </div>
                </div>
            `).join('') : '<p class="empty-message">No pending user registrations</p>';
        }
        
        const usersTable = document.getElementById('users-table');
        if (usersTable) {
            usersTable.innerHTML = users.length > 0 ? users.map(user => `
                <tr>
                    <td>${user.name}</td>
                    <td>${user.email}</td>
                    <td><span class="badge ${user.status === 'approved' ? 'badge-success' : 'badge-warning'}">${user.status}</span></td>
                    <td class="action-buttons">
                        ${user.status === 'pending' ? `<button class="btn-approve-small" onclick="approveUser('${user.id}')">Approve</button>` : ''}
                        <button class="btn-delete-small" onclick="deleteUser('${user.id}')">Delete</button>
                    </td>
                </tr>
            `).join('') : '<tr><td colspan="4">No users registered</td></tr>';
        }
        
        // Load all papers in admin table
        loadAdminPapersTable();
    });
}

function loadAdminPapersTable() {
    const adminTableBody = document.getElementById('admin-table-body');
    if (!adminTableBody) return;
    
    if (researchPapers.length === 0) {
        adminTableBody.innerHTML = '<tr><td colspan="7">No papers found</td></tr>';
        return;
    }
    
    adminTableBody.innerHTML = researchPapers.map(paper => `
        <tr>
            <td><input type="checkbox" class="paper-checkbox" data-id="${paper.id}"></td>
            <td>
                <div class="paper-title-cell">
                    <span class="paper-title-text">${paper.title}</span>
                    <span class="paper-authors-small">${paper.authors.join(', ')}</span>
                </div>
            </td>
            <td><span class="badge ${getBadgeClass(paper.category)}">${paper.category}</span></td>
            <td>${paper.year}</td>
            <td>${paper.views || 0}</td>
            <td>${paper.downloads || 0}</td>
            <td class="action-buttons">
                <button class="btn-view-small" onclick="viewAdminPaper('${paper.id}')" title="View">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn-delete-small" onclick="openDeleteModal('${paper.id}')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function getBadgeClass(category) {
    const classes = { 'SIP': 'badge-primary', 'Capstone': 'badge-success', 'Action Research': 'badge-warning' };
    return classes[category] || 'badge-primary';
}

function viewAdminPaper(paperId) {
    viewPaper(paperId);
}

function quickApprovePaper(paperId) {
    const paper = researchPapers.find(p => p.id === paperId);
    if (paper) {
        paper.status = 'approved';
        localStorage.setItem('researchPapers', JSON.stringify(researchPapers));
        loadAdminPapersTable();
        loadAdminData();
        renderPapersGrid();
        updateStatistics();
        showNotification('Paper Approved', 'The paper status has been updated to published', 'success');
    }
}

// Add paper from admin panel
async function addPaperFromAdmin(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    const title = document.getElementById('admin-title').value;
    const authors = document.getElementById('admin-authors').value;
    const abstract = document.getElementById('admin-abstract').value;
    const category = document.getElementById('admin-category').value;
    const strand = document.getElementById('admin-strand').value;
    const year = document.getElementById('admin-year').value;
    const adviser = document.getElementById('admin-adviser').value;
    const keywords = document.getElementById('admin-keywords').value;
    
    if (!title || !authors || !abstract || !category || !strand || !year) {
        showNotification('Missing Information', 'Please fill in all required fields', 'warning');
        return false;
    }
    
    // Create paper object
    const paperId = 'paper_' + Date.now();
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
    const sanitizedAuthors = authors.split(',')[0].trim().replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30);
    const timestamp = Date.now();
    const filename = `${timestamp}_${sanitizedTitle}_${sanitizedAuthors}_${category}_${strand}_${year}`;
    
    const newPaper = {
        id: paperId,
        name: filename + '.pdf',
        title: title,
        authors: authors.split(',').map(a => a.trim()),
        abstract: abstract,
        category: category,
        strand: strand,
        year: year,
        views: 0,
        downloads: 0,
        status: 'approved',
        adviser: adviser,
        keywords: keywords.split(',').map(k => k.trim()),
        fileUrl: '#',
        fileName: filename + '.pdf',
        format: 'pdf',
        createdAt: new Date().toISOString()
    };
    
    // Save metadata as JSON file to Supabase
    if (supabaseConfigured && supabaseClient) {
        try {
            const metadataContent = {
                title: title,
                authors: authors.split(',').map(a => a.trim()),
                abstract: abstract,
                category: category,
                strand: strand,
                year: year,
                adviser: adviser,
                keywords: keywords.split(',').map(k => k.trim()),
                uploadedAt: new Date().toISOString()
            };
            
            const metadataFilename = filename + '.json';
            const { error: metadataError } = await supabaseClient
                .storage
                .from(supabaseConfig.bucketName)
                .upload(metadataFilename, JSON.stringify(metadataContent), {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: 'application/json'
                });
            
            if (metadataError) {
                console.error('Error saving metadata:', metadataError);
            }
        } catch (e) {
            console.error('Error saving metadata to Supabase:', e);
        }
    }
    
    // Add to local array
    researchPapers.unshift(newPaper);
    localStorage.setItem('researchPapers', JSON.stringify(researchPapers));
    
    // Update UI
    renderPapersGrid();
    updateStatistics();
    loadAdminPapersTable();
    loadAdminData();
    
    // Clear form
    document.getElementById('admin-add-form').reset();
    
    showNotification('Paper Added', 'Research paper has been added successfully', 'success');
    
    // Switch to manage tab
    switchAdminTab('manage');
    
    return false;
}

// Delete Modal Functions
let paperToDelete = null;

function openDeleteModal(paperId) {
    const paper = researchPapers.find(p => p.id === paperId);
    if (!paper) return;
    
    paperToDelete = paperId;
    
    const deleteInfo = document.getElementById('delete-paper-info');
    if (deleteInfo) {
        deleteInfo.innerHTML = `
            <h4>${paper.title}</h4>
            <p><strong>Authors:</strong> ${paper.authors.join(', ')}</p>
            <p><strong>Category:</strong> ${paper.category} | <strong>Year:</strong> ${paper.year}</p>
            <p><strong>Views:</strong> ${paper.views || 0} | <strong>Downloads:</strong> ${paper.downloads || 0}</p>
        `;
    }
    
    document.getElementById('delete-modal').classList.add('active');
}

function closeDeleteModal() {
    document.getElementById('delete-modal').classList.remove('active');
    paperToDelete = null;
}

function confirmDeletePaper() {
    if (!paperToDelete) return;
    
    const paper = researchPapers.find(p => p.id === paperToDelete);
    const paperTitle = paper ? paper.title : 'Unknown Paper';
    
    // Remove paper from array
    researchPapers = researchPapers.filter(p => p.id !== paperToDelete);
    
    // Save to localStorage
    localStorage.setItem('researchPapers', JSON.stringify(researchPapers));
    
    // Update UI
    loadAdminPapersTable();
    loadAdminData();
    renderPapersGrid();
    updateStatistics();
    
    // Show notification
    showNotification('Paper Deleted', `"${paperTitle}" has been permanently removed`, 'success');
    
    // Close modal
    closeDeleteModal();
}

// Reset all statistics to 0
function resetAllStatistics() {
    researchPapers = researchPapers.map(paper => ({
        ...paper,
        views: 0,
        downloads: 0
    }));
    
    // Save to localStorage
    localStorage.setItem('researchPapers', JSON.stringify(researchPapers));
    
    // Update UI
    renderPapersGrid();
    updateStatistics();
    loadAdminPapersTable();
    
    showNotification('Statistics Reset', 'All view and download counts have been reset to 0', 'success');
}

// Confirm reset statistics
function confirmResetStatistics() {
    if (confirm('Are you sure you want to reset ALL statistics to 0? This action cannot be undone.')) {
        resetAllStatistics();
    }
}

function approvePaper(paperId) {
    const paper = researchPapers.find(p => p.id === paperId);
    if (paper) {
        paper.status = 'approved';
        localStorage.setItem('researchPapers', JSON.stringify(researchPapers));
        loadAdminDataLocal();
        renderPapersGrid();
        showNotification('Paper Approved', 'The paper is now visible to everyone', 'success');
    }
}

function rejectPaper(paperId) {
    researchPapers = researchPapers.filter(p => p.id !== paperId);
    localStorage.setItem('researchPapers', JSON.stringify(researchPapers));
    loadAdminDataLocal();
    showNotification('Paper Rejected', 'The paper has been removed', 'info');
}

function approveUser(userId) {
    // Load users from Supabase or local storage
    loadUsersFromSupabase().then(users => {
        const user = users.find(u => u.id === userId);
        if (user) {
            user.status = 'approved';
            
            // Update in Supabase
            saveUserToSupabase(user);
            
            // Update local storage
            localStorage.setItem('users', JSON.stringify(users));
            
            loadAdminData();
            showNotification('User Approved', `${user.name} can now login`, 'success');
        }
    });
}

function deleteUser(userId) {
    // Load users from Supabase or local storage
    loadUsersFromSupabase().then(users => {
        const user = users.find(u => u.id === userId);
        const userName = user ? user.name : 'User';
        
        // Filter out the deleted user
        users = users.filter(u => u.id !== userId);
        
        // Delete from Supabase
        if (user) {
            deleteUserFromSupabase(user.email);
        }
        
        // Update local storage
        localStorage.setItem('users', JSON.stringify(users));
        
        loadAdminData();
        showNotification('User Deleted', `${userName} has been removed`, 'info');
    });
}

function loadAdminDataLocal() {
    loadAdminData();
}

function switchAdminTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    document.querySelectorAll('.admin-tab-content').forEach(content => content.style.display = 'none');
    const tabContent = document.getElementById(`${tab}-tab`);
    if (tabContent) tabContent.style.display = 'block';
}

// =====================================================
// STATISTICS & CHARTS
// =====================================================

function updateStatistics() {
    // All papers are now visible (no approval required)
    const approvedPapers = researchPapers;
    const totalPapers = approvedPapers.length;
    const totalViews = approvedPapers.reduce((sum, p) => sum + (p.views || 0), 0);
    const totalDownloads = approvedPapers.reduce((sum, p) => sum + (p.downloads || 0), 0);
    const totalStudents = new Set(approvedPapers.flatMap(p => p.authors || [])).size;
    
    const totalPapersEl = document.getElementById('total-papers');
    const totalViewsEl = document.getElementById('total-views');
    const totalDownloadsEl = document.getElementById('total-downloads');
    const totalStudentsEl = document.getElementById('total-students');
    const statsPapersCardEl = document.getElementById('stats-papers-card');
    
    if (totalPapersEl) totalPapersEl.textContent = totalPapers;
    if (totalViewsEl) totalViewsEl.textContent = formatNumber(totalViews);
    if (totalDownloadsEl) totalDownloadsEl.textContent = formatNumber(totalDownloads);
    if (totalStudentsEl) totalStudentsEl.textContent = formatNumber(totalStudents);
    if (statsPapersCardEl) statsPapersCardEl.textContent = totalPapers;
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function renderCharts() {
    const categoryCtx = document.getElementById('category-chart');
    if (categoryCtx && typeof Chart !== 'undefined') {
        const categories = {};
        researchPapers.forEach(paper => {
            categories[paper.category] = (categories[paper.category] || 0) + 1;
        });
        
        new Chart(categoryCtx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(categories),
                datasets: [{
                    data: Object.values(categories),
                    backgroundColor: ['#0038A8', '#CE1126', '#F5A623', '#28a745']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }
    
    const strandCtx = document.getElementById('strand-chart');
    if (strandCtx && typeof Chart !== 'undefined') {
        const strands = {};
        researchPapers.forEach(paper => {
            strands[paper.strand] = (strands[paper.strand] || 0) + 1;
        });
        
        new Chart(strandCtx, {
            type: 'pie',
            data: {
                labels: Object.keys(strands),
                datasets: [{
                    data: Object.values(strands),
                    backgroundColor: ['#0038A8', '#CE1126', '#F5A623', '#28a745', '#6f42c1']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }
    
    const yearlyCtx = document.getElementById('yearly-chart');
    if (yearlyCtx && typeof Chart !== 'undefined') {
        const years = {};
        researchPapers.forEach(paper => {
            years[paper.year] = (years[paper.year] || 0) + 1;
        });
        
        const sortedYears = Object.keys(years).sort();
        
        new Chart(yearlyCtx, {
            type: 'bar',
            data: {
                labels: sortedYears,
                datasets: [{
                    label: 'Research Papers',
                    data: sortedYears.map(y => years[y]),
                    backgroundColor: '#0038A8'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }
}

function loadTopPapers() {
    const container = document.getElementById('top-papers-list');
    if (!container) return;
    
    // All papers are visible
    const approvedPapers = researchPapers;
    const topPapers = [...approvedPapers].sort((a, b) => b.views - a.views).slice(0, 5);
    
    if (topPapers.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 40px 20px; color: #6c757d;">
                <i class="fas fa-book" style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;"></i>
                <h4 style="margin-bottom: 10px;">No Papers Yet</h4>
                <p style="font-size: 14px;">Upload research papers to see them here.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = topPapers.map((paper, index) => `
        <div class="top-paper-item" onclick="viewPaper('${paper.id}')">
            <div class="top-paper-info">
                <div class="top-paper-title">${paper.title}</div>
                <div class="top-paper-meta">${paper.authors[0]} et al. • ${paper.year}</div>
            </div>
            <div class="top-paper-views"><i class="fas fa-eye"></i> ${formatNumber(paper.views)}</div>
        </div>
    `).join('');
}

// =====================================================
// MODAL FUNCTIONS
// =====================================================

function openLoginModal() {
    document.getElementById('login-modal').classList.add('active');
}

function closeLoginModal() {
    document.getElementById('login-modal').classList.remove('active');
}

function openSignupModal() {
    document.getElementById('signup-modal').classList.add('active');
}

function closeSignupModal() {
    document.getElementById('signup-modal').classList.remove('active');
}

function switchToSignup() {
    closeLoginModal();
    openSignupModal();
}

function switchToLogin() {
    closeSignupModal();
    openLoginModal();
}

// =====================================================
// NOTIFICATIONS
// =====================================================

function showNotification(title, message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-icon"><i class="fas fa-${getNotificationIcon(type)}"></i></div>
        <div class="notification-content"><h4>${title}</h4><p>${message}</p></div>
        <button class="notification-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
    `;
    
    container.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

function getNotificationIcon(type) {
    const icons = { success: 'check-circle', error: 'exclamation-circle', warning: 'exclamation-triangle', info: 'info-circle' };
    return icons[type] || 'info-circle';
}

// =====================================================
// CITATION & SHARE
// =====================================================

let currentCitationFormat = 'apa';

function citePaper() {
    if (!currentPaperId) return;
    const paper = researchPapers.find(p => p.id === currentPaperId);
    if (!paper) return;
    
    // Set default format and show modal
    currentCitationFormat = 'apa';
    selectCitationFormat('apa');
    
    document.getElementById('citation-modal').classList.add('active');
}

function selectCitationFormat(format) {
    if (!currentPaperId) return;
    const paper = researchPapers.find(p => p.id === currentPaperId);
    if (!paper) return;
    
    currentCitationFormat = format;
    
    // Update active tab
    document.querySelectorAll('.format-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.format === format) {
            tab.classList.add('active');
        }
    });
    
    // Generate citation based on format
    const citation = generateCitation(paper, format);
    document.getElementById('citation-result').textContent = citation;
}

function generateCitation(paper, format) {
    const authors = paper.authors && paper.authors.length > 0 && !paper.authors.includes('Unknown Author') 
        ? paper.authors 
        : [];
    const year = paper.year || 'n.d.';
    const title = paper.title || 'Untitled';
    const source = 'Sawata Research Hub, Sawata National High School';
    const url = paper.fileUrl || window.location.href;
    
    switch (format) {
        case 'apa':
            return generateAPACitation(authors, year, title, source, url);
        case 'mla':
            return generateMLACitation(authors, year, title, source, url);
        case 'chicago':
            return generateChicagoCitation(authors, year, title, source, url);
        case 'bibtex':
            return generateBibTeXCitation(paper, authors, year, title, source);
        default:
            return generateAPACitation(authors, year, title, source, url);
    }
}

function generateAPACitation(authors, year, title, source, url) {
    let citation = '';
    
    if (authors.length > 0) {
        // Format authors for APA
        if (authors.length === 1) {
            const parts = authors[0].split(' ');
            const lastName = parts[parts.length - 1];
            const initials = parts.slice(0, -1).map(n => n[0] + '.').join(' ');
            citation += `${lastName}, ${initials}`;
        } else if (authors.length === 2) {
            const author1 = formatAuthorAPA(authors[0]);
            const author2 = formatAuthorAPA(authors[1]);
            citation += `${author1} & ${author2}`;
        } else if (authors.length > 2) {
            const author1 = formatAuthorAPA(authors[0]);
            citation += `${author1} et al.`;
        }
    } else {
        citation += 'Anonymous';
    }
    
    citation += ` (${year}). ${title}. ${source}. ${url}`;
    return citation;
}

function formatAuthorAPA(name) {
    const parts = name.trim().split(' ');
    if (parts.length === 0) return name;
    const lastName = parts[parts.length - 1];
    const initials = parts.slice(0, -1).map(n => n[0] + '.').join(' ');
    return `${lastName}, ${initials}`;
}

function generateMLACitation(authors, year, title, source, url) {
    let citation = '';
    
    if (authors.length > 0) {
        if (authors.length === 1) {
            citation += authors[0] + '.';
        } else if (authors.length === 2) {
            citation += `${authors[0]}, and ${authors[1]}.`;
        } else if (authors.length > 2) {
            citation += `${authors[0]}, et al.`;
        }
    } else {
        citation += 'Anonymous.';
    }
    
    citation += ` "${title}." ${source}, ${year}. ${url}`;
    return citation;
}

function generateChicagoCitation(authors, year, title, source, url) {
    let citation = '';
    
    if (authors.length > 0) {
        citation += authors.join(', ');
    } else {
        citation += 'Anonymous';
    }
    
    citation += `. "${title}." ${source}, ${year}. ${url}`;
    return citation;
}

function generateBibTeXCitation(paper, authors, year, title, source) {
    // Create a unique citation key
    const firstAuthor = authors.length > 0 ? authors[0].split(' ').pop() : 'Anonymous';
    const citationKey = `${firstAuthor}${year}`.replace(/\s+/g, '');
    
    let bibtex = `@article{${citationKey},\n`;
    bibtex += `  author = {${authors.join(' and ')}},\n`;
    bibtex += `  title = {${title}},\n`;
    bibtex += `  year = {${year}},\n`;
    bibtex += `  publisher = {${source}},\n`;
    if (paper.abstract) {
        bibtex += `  abstract = {${paper.abstract.replace(/\n/g, ' ')}},\n`;
    }
    bibtex += `  url = {${paper.fileUrl || url}}\n`;
    bibtex += `}`;
    
    return bibtex;
}

function copySelectedCitation() {
    const citationText = document.getElementById('citation-result').textContent;
    
    navigator.clipboard.writeText(citationText).then(() => {
        showNotification('Citation Copied', 'Formatted citation copied to clipboard', 'success');
    });
}

function closeCitationModal() {
    document.getElementById('citation-modal').classList.remove('active');
}

function sharePaper() {
    if (!currentPaperId) return;
    const paper = researchPapers.find(p => p.id === currentPaperId);
    if (!paper) return;
    
    if (navigator.share) {
        navigator.share({ title: paper.title, text: `Check out this research paper: ${paper.title}`, url: window.location.href });
    } else {
        navigator.clipboard.writeText(window.location.href).then(() => {
            showNotification('Link Copied', 'Share link copied to clipboard', 'success');
        });
    }
}

// =====================================================
// EVENT LISTENERS
// =====================================================

function setupEventListeners() {
    const searchInput = document.getElementById('hero-search');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
        });
    }
    
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) target.scrollIntoView({ behavior: 'smooth' });
        });
    });
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
    
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navList = document.querySelector('.nav-list');
    if (mobileMenuBtn && navList) {
        mobileMenuBtn.addEventListener('click', () => navList.classList.toggle('active'));
    }
    
    document.querySelectorAll('input[name="category"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const checked = Array.from(document.querySelectorAll('input[name="category"]:checked')).map(c => c.value);
            filterByCategory(checked.includes('all') || checked.length === 0 ? 'all' : checked[0]);
        });
    });
}

// =====================================================
// MOBILE MENU FUNCTIONS
// =====================================================

function toggleMobileMenu() {
    const navList = document.querySelector('.nav-list');
    if (navList) {
        navList.classList.toggle('active');
    }
}

function closeMobileMenu() {
    const navList = document.querySelector('.nav-list');
    if (navList) {
        navList.classList.remove('active');
    }
}

// =====================================================
// PAPERS SEARCH AND SORT FUNCTIONS
// =====================================================

function searchPapers(query) {
    if (!query || query.trim() === '') {
        // If search is empty, show all filtered papers
        filteredPapers = [...researchPapers];
    } else {
        const searchTerm = query.toLowerCase().trim();
        filteredPapers = researchPapers.filter(paper => {
            return (
                (paper.title && paper.title.toLowerCase().includes(searchTerm)) ||
                (paper.authors && paper.authors.some(author => author.toLowerCase().includes(searchTerm))) ||
                (paper.abstract && paper.abstract.toLowerCase().includes(searchTerm)) ||
                (paper.keywords && paper.keywords.some(kw => kw.toLowerCase().includes(searchTerm))) ||
                (paper.category && paper.category.toLowerCase().includes(searchTerm)) ||
                (paper.strand && paper.strand.toLowerCase().includes(searchTerm))
            );
        });
    }

    // Apply current sort
    const sortSelect = document.getElementById('sort-by');
    if (sortSelect) {
        sortPapers();
    } else {
        currentPage = 1;
        renderPapersGrid();
    }
}

function sortPapers() {
    const sortSelect = document.getElementById('sort-by');
    if (!sortSelect) return;

    const sortValue = sortSelect.value;

    // If filteredPapers is empty, copy researchPapers to it first
    if (filteredPapers.length === 0 && researchPapers.length > 0) {
        filteredPapers = [...researchPapers];
    }

    // If still empty, nothing to sort
    if (filteredPapers.length === 0) {
        return;
    }

    switch (sortValue) {
        case 'newest':
            filteredPapers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            break;
        case 'oldest':
            filteredPapers.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            break;
        case 'title':
            filteredPapers.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
            break;
        case 'views':
            filteredPapers.sort((a, b) => (b.views || 0) - (a.views || 0));
            break;
        case 'downloads':
            filteredPapers.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
            break;
    }

    currentPage = 1;
    renderPapersGrid();
}
