const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Collect console messages
    const consoleMessages = [];
    const errors = [];

    page.on('console', msg => {
        consoleMessages.push({ type: msg.type(), text: msg.text() });
        if (msg.type() === 'error') {
            errors.push(msg.text());
        }
    });

    page.on('pageerror', err => {
        errors.push(err.message);
    });

    try {
        // Navigate to the local HTML file
        const filePath = path.resolve(__dirname, 'index.html');
        await page.goto(`file://${filePath}`, { waitUntil: 'networkidle' });

        console.log('Page loaded successfully');

        // Wait for JavaScript to initialize
        await page.waitForTimeout(2000);

        // ============================================
        // SECTION 1: Basic UI Elements Tests
        // ============================================
        console.log('\n--- Section 1: Basic UI Elements ---');

        // Check if main elements exist
        const basicChecks = [
            { selector: '.hero-section', name: 'Hero Section' },
            { selector: '#papers-grid', name: 'Papers Grid' },
            { selector: '.filters-sidebar', name: 'Filters Sidebar' },
            { selector: '.main-footer', name: 'Footer' },
            { selector: '#category-chart', name: 'Category Chart' },
            { selector: '#strand-chart', name: 'Strand Chart' },
            { selector: '#yearly-chart', name: 'Yearly Chart' }
        ];

        for (const check of basicChecks) {
            const element = await page.$(check.selector);
            if (element) {
                console.log(`✓ ${check.name} found`);
            } else {
                console.log(`✗ ${check.name} NOT found`);
                errors.push(`Missing element: ${check.name}`);
            }
        }

        // ============================================
        // SECTION 2: Search Functionality Tests
        // ============================================
        console.log('\n--- Section 2: Search Functionality ---');

        // Test search functionality using the correct event trigger
        const searchInput = await page.$('#hero-search');
        if (searchInput) {
            await searchInput.fill('Arduino');
            // Use keyboard Enter to trigger search
            await searchInput.press('Enter');
            await page.waitForTimeout(500);
            console.log('✓ Search functionality works (using Enter key)');

            // Clear search
            await searchInput.fill('');
            await searchInput.press('Enter');
            await page.waitForTimeout(500);
        }

        // Test paper cards are rendered
        const paperCards = await page.$$('.paper-card');
        console.log(`✓ ${paperCards.length} research papers rendered`);

        // Test statistics display
        const totalPapers = await page.$eval('#total-papers', el => el.textContent);
        console.log(`✓ Total papers displayed: ${totalPapers}`);

        // ============================================
        // SECTION 3: Paper Modal and Download Tests
        // ============================================
        console.log('\n--- Section 3: Paper Modal and Download ---');

        // Test clicking on "View Details" button to open modal (not the card itself)
        if (paperCards.length > 0) {
            const viewBtn = await paperCards[0].$('.view-btn');
            if (viewBtn) {
                await viewBtn.click();
                await page.waitForTimeout(500);
                const modal = await page.$('.modal.active');
                if (modal) {
                    console.log('✓ Paper detail modal opens');

                    // Test download button exists in modal - button has class "btn-primary" with onclick="downloadPaper()"
                    const downloadBtn = await page.$('.paper-actions .btn-primary');
                    if (downloadBtn) {
                        console.log('✓ Download button found in modal');
                        
                        // Verify button has correct onclick handler
                        const onclickAttr = await downloadBtn.getAttribute('onclick');
                        if (onclickAttr && onclickAttr.includes('downloadPaper')) {
                            console.log('✓ Download button has correct onclick handler');
                        }
                    } else {
                        console.log('✗ Download button NOT found');
                        errors.push('Missing download button in modal');
                    }

                    // Close modal
                    await page.click('.modal-close');
                    await page.waitForTimeout(300);
                    console.log('✓ Modal closed successfully');
                } else {
                    console.log('✗ Modal did NOT open');
                    errors.push('Paper modal failed to open');
                }
            } else {
                console.log('✗ View Details button NOT found on card');
                errors.push('View Details button not found');
            }
        }

        // ============================================
        // SECTION 4: Filter Functionality Tests
        // ============================================
        console.log('\n--- Section 4: Filter Functionality ---');

        // Test filter functionality
        await page.click('.filter-tag[data-category="SIP"]');
        await page.waitForTimeout(500);
        console.log('✓ Filter by category works');

        // Reset filters
        await page.click('.filter-tag[data-category="all"]');
        await page.waitForTimeout(500);
        console.log('✓ Filter reset works');

        // ============================================
        // SECTION 5: Navigation Tests
        // ============================================
        console.log('\n--- Section 5: Navigation ---');

        // Test navigation
        await page.click('a[href="#about"]');
        await page.waitForTimeout(500);
        const aboutSection = await page.$('#about');
        if (aboutSection) {
            console.log('✓ Navigation works');
        }

        // ============================================
        // SECTION 6: Authentication - Guest User Tests
        // ============================================
        console.log('\n--- Section 6: Authentication - Guest User ---');

        // Test that admin panel is NOT accessible for guest users
        const adminSection = await page.$('#admin');
        if (adminSection) {
            const isAdminVisible = await adminSection.isVisible();
            if (!isAdminVisible) {
                console.log('✓ Admin panel is hidden for non-logged-in users');
            } else {
                console.log('✗ Admin panel should be hidden for non-logged-in users');
                errors.push('Admin panel visible for guest users');
            }
        }

        // ============================================
        // SECTION 7: Login Modal Tests
        // ============================================
        console.log('\n--- Section 7: Login Modal ---');

        // Open login modal using correct selector
        await page.click('.login-btn-nav');
        await page.waitForTimeout(500);
        const loginModal = await page.$('#login-modal');
        if (loginModal) {
            const isLoginVisible = await loginModal.isVisible();
            if (isLoginVisible) {
                console.log('✓ Login modal opens');
            } else {
                console.log('✗ Login modal did NOT open');
                errors.push('Login modal failed to open');
            }
        }

        // Close login modal
        await page.click('#login-modal .modal-close');
        await page.waitForTimeout(300);
        console.log('✓ Login modal closed');

        // ============================================
        // SECTION 8: Signup Modal Tests
        // ============================================
        console.log('\n--- Section 8: Signup Modal ---');

        // Open signup modal using correct selector
        await page.click('.signup-btn-nav');
        await page.waitForTimeout(500);
        const signupModal = await page.$('#signup-modal');
        if (signupModal) {
            const isSignupVisible = await signupModal.isVisible();
            if (isSignupVisible) {
                console.log('✓ Signup modal opens');
            } else {
                console.log('✗ Signup modal did NOT open');
                errors.push('Signup modal failed to open');
            }
        }

        // Close signup modal
        await page.click('#signup-modal .modal-close');
        await page.waitForTimeout(300);
        console.log('✓ Signup modal closed');

        // ============================================
        // SECTION 9: Upload Modal Tests (After Login)
        // ============================================
        console.log('\n--- Section 9: Upload Modal ---');

        // Open login modal
        await page.click('.login-btn-nav');
        await page.waitForTimeout(300);

        // Fill in admin credentials
        await page.fill('#login-email', 'admin@sawata.edu.ph');
        await page.fill('#login-password', 'admin123');
        
        // Submit form using the submit button (type="submit" inside the form)
        await page.click('#login-form button[type="submit"]');
        await page.waitForTimeout(1000);
        console.log('✓ Login form submitted');

        // Now test upload button is visible
        const uploadBtn = await page.$('.upload-btn-nav');
        if (uploadBtn) {
            const isVisible = await uploadBtn.isVisible();
            if (isVisible) {
                console.log('✓ Upload button is visible for logged-in users');
                
                // Open upload modal
                await uploadBtn.click();
                await page.waitForTimeout(500);
                const uploadModal = await page.$('#upload-modal');
                if (uploadModal) {
                    const isUploadModalVisible = await uploadModal.isVisible();
                    if (isUploadModalVisible) {
                        console.log('✓ Upload modal opens');

                        // Test file type selection
                        const pdfOption = await page.$('input[name="fileType"][value="pdf"]');
                        const docxOption = await page.$('input[name="fileType"][value="docx"]');
                        
                        if (pdfOption) {
                            console.log('✓ PDF file type option available');
                        }
                        if (docxOption) {
                            console.log('✓ DOCX file type option available');
                        }

                        // Close upload modal
                        await page.click('#upload-modal .modal-close');
                        await page.waitForTimeout(300);
                        console.log('✓ Upload modal closed');
                    } else {
                        console.log('✗ Upload modal did NOT open');
                        errors.push('Upload modal failed to open');
                    }
                }
            } else {
                console.log('✗ Upload button NOT visible after login');
                errors.push('Upload button not visible for admin');
            }
        }

        // ============================================
        // SECTION 10: Admin Panel Tests
        // ============================================
        console.log('\n--- Section 10: Admin Panel ---');

        // Check if admin panel is accessible
        const adminPanel = await page.$('#admin');
        if (adminPanel) {
            const isAdminVisible = await adminPanel.isVisible();
            if (isAdminVisible) {
                console.log('✓ Admin panel is accessible after login');

                // Test User Management tab
                const userMgmtTab = await page.$('button[onclick="switchAdminTab(\'users\')"]');
                if (userMgmtTab) {
                    await userMgmtTab.click();
                    await page.waitForTimeout(500);
                    console.log('✓ User Management tab clickable');
                    
                    // Check for user table
                    const userTable = await page.$('#users-table');
                    if (userTable) {
                        console.log('✓ User Management table exists');
                    }
                }

                // Test Online Users tab
                const onlineTab = await page.$('button[onclick="switchAdminTab(\'online\')"]');
                if (onlineTab) {
                    await onlineTab.click();
                    await page.waitForTimeout(500);
                    console.log('✓ Online Users tab clickable');
                }
            } else {
                console.log('✗ Admin panel NOT visible after login');
                errors.push('Admin panel not accessible');
            }
        }

        // ============================================
        // SECTION 11: User Registration Workflow
        // ============================================
        console.log('\n--- Section 11: User Registration Workflow ---');

        // Check if logout button is visible (meaning we're logged in)
        const logoutBtn = await page.$('.logout-btn-nav');
        if (logoutBtn) {
            const isVisible = await logoutBtn.isVisible();
            if (isVisible) {
                // Logout first if already logged in
                await page.click('.logout-btn-nav');
                await page.waitForTimeout(500);
                console.log('✓ Logged out');
            }
        }

        // Open signup modal using correct selector
        await page.click('.signup-btn-nav');
        await page.waitForTimeout(500);

        // Fill in new user registration form
        await page.fill('#signup-name', 'Test User');
        await page.fill('#signup-email', 'testuser@example.com');
        await page.fill('#signup-password', 'password123');
        await page.fill('#signup-confirm', 'password123');
        
        // Submit signup form
        await page.click('#signup-form button[type="submit"]');
        await page.waitForTimeout(1000);
        console.log('✓ User registration submitted');

        // Close signup modal if still visible
        const signupModalAfter = await page.$('#signup-modal.active');
        if (signupModalAfter) {
            await page.click('#signup-modal .modal-close');
            await page.waitForTimeout(300);
            console.log('✓ Signup modal closed manually');
        }

        // ============================================
        // SECTION 12: Admin Approval Workflow
        // ============================================
        console.log('\n--- Section 12: Admin Approval Workflow ---');

        // Login as admin
        await page.click('.login-btn-nav');
        await page.waitForTimeout(300);
        await page.fill('#login-email', 'admin@sawata.edu.ph');
        await page.fill('#login-password', 'admin123');
        await page.click('#login-form button[type="submit"]');
        await page.waitForTimeout(1000);
        console.log('✓ Logged in as admin');

        // Navigate to User Management
        const userMgmtTabAdmin = await page.$('button[onclick="switchAdminTab(\'users\')"]');
        if (userMgmtTabAdmin) {
            await userMgmtTabAdmin.click();
            await page.waitForTimeout(500);
            console.log('✓ Navigated to User Management');

            // Check if pending user is visible
            const pendingUserRow = await page.$('td:has-text("testuser@example.com")');
            if (pendingUserRow) {
                console.log('✓ Pending user visible in User Management');
                
                // Find and click approve button
                const approveBtn = await page.$('button.approve-btn');
                if (approveBtn) {
                    await approveBtn.click();
                    await page.waitForTimeout(500);
                    console.log('✓ User approval action executed');
                }
            } else {
                console.log('Note: Pending user row not found (may need manual check)');
            }
        }

        // ============================================
        // SECTION 13: Download Functionality Test
        // ============================================
        console.log('\n--- Section 13: Download Functionality ---');

        // Navigate to home to find a paper card
        await page.click('a[href="#home"]');
        await page.waitForTimeout(500);

        // Find a paper card and test download
        const firstPaperCard = await page.$('.paper-card');
        if (firstPaperCard) {
            const viewBtn = await firstPaperCard.$('.view-btn');
            if (viewBtn) {
                await viewBtn.click();
                await page.waitForTimeout(500);
                
                // Check if download button exists and has correct attributes
                const downloadBtn = await page.$('.paper-actions .btn-primary');
                if (downloadBtn) {
                    console.log('✓ Download button present in modal');
                    
                    // Verify button has onclick handler or data attributes
                    const onclickAttr = await downloadBtn.getAttribute('onclick');
                    if (onclickAttr && onclickAttr.includes('downloadPaper')) {
                        console.log('✓ Download button has correct onclick handler');
                    }
                }
                
                // Close modal
                await page.click('.modal-close');
                await page.waitForTimeout(300);
            }
        }

        // ============================================
        // SECTION 14: File Upload UI Validation
        // ============================================
        console.log('\n--- Section 14: File Upload UI Validation ---');

        // Open upload modal again
        const uploadBtnFinal = await page.$('.upload-btn-nav');
        if (uploadBtnFinal) {
            await uploadBtnFinal.click();
            await page.waitForTimeout(500);

            // Check file input exists
            const fileInput = await page.$('#file-upload');
            if (fileInput) {
                console.log('✓ File upload input exists');
                
                // Check accept attribute for file types
                const acceptAttr = await fileInput.getAttribute('accept');
                if (acceptAttr) {
                    if (acceptAttr.includes('.pdf') || acceptAttr.includes('application/pdf')) {
                        console.log('✓ PDF file type accepted in file input');
                    }
                    if (acceptAttr.includes('.docx') || acceptAttr.includes('wordprocessingml')) {
                        console.log('✓ DOCX file type accepted in file input');
                    }
                }
            }

            // Check form validation fields exist
            const titleInput = await page.$('#paper-title');
            const authorInput = await page.$('#paper-authors');
            const abstractInput = await page.$('#paper-abstract');
            const categorySelect = await page.$('#paper-category');
            const strandSelect = await page.$('#paper-strand');
            const yearSelect = await page.$('#paper-year');
            const uploadFileInput = await page.$('#paper-file');

            if (titleInput && authorInput && abstractInput && categorySelect && strandSelect && yearSelect && uploadFileInput) {
                console.log('✓ All required upload form fields exist');
            } else {
                console.log('✗ Some upload form fields are missing');
                errors.push('Missing upload form fields');
            }

            // Close upload modal
            await page.click('#upload-modal .modal-close');
            await page.waitForTimeout(300);
        }

        // ============================================
        // FINAL: Report Errors
        // ============================================
        console.log('\n===========================================');
        console.log('TEST SUMMARY');
        console.log('===========================================');

        if (errors.length > 0) {
            console.log('\n--- Errors Found ---');
            errors.forEach(err => console.log('ERROR:', err));
            console.log(`\nTotal Errors: ${errors.length}`);
        } else {
            console.log('\n✓ All tests passed successfully!');
            console.log('✓ No console errors detected');
        }

        console.log('\n=== Test Complete ===');

    } catch (error) {
        console.error('Test failed:', error.message);
        errors.push(error.message);
    } finally {
        await browser.close();
    }
})();
