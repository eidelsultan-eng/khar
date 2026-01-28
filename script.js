document.addEventListener('DOMContentLoaded', () => {
    const sidebarItems = document.querySelectorAll('.sidebar-nav li');
    const contentArea = document.getElementById('content-area');
    const pageTitle = document.getElementById('page-title');
    const toggleSidebar = document.getElementById('toggle-sidebar');
    const sidebar = document.getElementById('sidebar');
    const statCount = document.getElementById('stat-count');

    // --- DATA MANAGEMENT ---
    let appData = {
        cases: [],
        donations: [],
        expenses: [],
        volunteers: [],
        affidavits: []
    };

    window.normalizeArabic = (str) => {
        if (!str) return "";
        return str.toString()
            .replace(/[أإآ]/g, "ا")
            .replace(/ة/g, "ه")
            .replace(/ى/g, "ي")
            .trim()
            .toLowerCase();
    };

    // Load from localStorage for quick access
    const savedData = localStorage.getItem('ofice_app_data');
    if (savedData) appData = JSON.parse(savedData);

    // --- AUTOMATIC FILE SYSTEM SYNC (For USB Portability) ---
    let directoryHandle = null;
    let expandedCaseId = null; // Track which case is expanded
    const syncStatus = document.getElementById('sync-status');
    const syncIndicator = document.getElementById('sync-indicator');
    const linkFolderBtn = document.getElementById('link-folder-btn');

    let editingCaseId = null;
    let editingDonationId = null;
    let editingAidId = null;
    let modalDocs = []; // Array of Base64 strings for additional images
    let selectedSponsorCases = []; // Track cases selected for sponsorship in donation page

    async function updateDataInFile() {
        if (!directoryHandle) return;
        try {
            const fileHandle = await directoryHandle.getFileHandle('alkhair_data.json', { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(appData, null, 2));
            await writable.close();
            if (syncStatus) syncStatus.innerText = 'متصل - تم الحفظ تلقائياً';
            if (syncIndicator) syncIndicator.style.background = '#217346';
        } catch (err) {
            console.error('Auto-save failed', err);
            if (syncStatus) syncStatus.innerText = 'خطأ في الحفظ!';
            if (syncIndicator) syncIndicator.style.background = '#d13438';
        }
    }

    async function loadDataFromFile() {
        if (!directoryHandle) return;
        try {
            const fileHandle = await directoryHandle.getFileHandle('alkhair_data.json');
            const file = await fileHandle.getFile();
            const contents = await file.text();
            if (contents) {
                appData = JSON.parse(contents);
                // Ensure hidden existence
                appData.cases.forEach(c => { if (c.hidden === undefined) c.hidden = false; });
                saveData(false);
                renderPage('dashboard');
                if (syncStatus) syncStatus.innerText = 'متصل بالمجلد - تم تحميل البيانات';
                if (syncIndicator) syncIndicator.style.background = '#217346';
                if (linkFolderBtn) {
                    linkFolderBtn.style.background = '#217346';
                    linkFolderBtn.querySelector('span').innerText = 'المجلد مربوط';
                }
            }
        } catch (err) {
            console.log('No existing data file found.');
        }
    }

    linkFolderBtn.addEventListener('click', async () => {
        try {
            directoryHandle = await window.showDirectoryPicker();
            await loadDataFromFile();
        } catch (err) {
            console.error('Folder selection cancelled', err);
        }
    });

    function updateStatusBar() {
        if (statCount) statCount.innerText = `الحالات: ${appData.cases.length}`;
    }

    updateStatusBar();

    function saveData(writeToFile = true) {
        localStorage.setItem('ofice_app_data', JSON.stringify(appData));
        updateStatusBar();
        if (writeToFile) updateDataInFile();
    }

    // --- ZOOM LOGIC ---
    let currentZoom = parseFloat(localStorage.getItem('appZoom')) || 1.0;

    window.applyZoom = () => {
        document.body.style.zoom = currentZoom;
        const zoomLevelText = document.getElementById('zoom-level');
        if (zoomLevelText) zoomLevelText.innerText = Math.round(currentZoom * 100) + '%';
        localStorage.setItem('appZoom', currentZoom);
    };

    window.changeZoom = (delta) => {
        currentZoom = Math.min(Math.max(0.5, currentZoom + delta), 2.0);
        window.applyZoom();
    };

    window.resetZoom = () => {
        currentZoom = 1.0;
        window.applyZoom();
    };

    // Initial apply
    setTimeout(window.applyZoom, 100);


    window.exportToExcel = () => {
        let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
        csvContent += "م,رقم البحث,المركز,الاسم,الرقم القومي,المهنة,رقم الهاتف,اسم الزوج/ة,الرقم القومي للزوج/ة,الأفراد,الوضع,نوع المساعدة,المبلغ,العنوان,ملاحظات\n";
        appData.cases.forEach((c, index) => {
            const row = [
                index + 1,
                c.searchNumber || '',
                c.center || '',
                c.name || '',
                `'${c.nationalId || ''}`,
                c.job || '',
                c.phone || '',
                c.spouseName || '',
                `'${c.spouseId || ''}`,
                c.familyMembers || '',
                c.socialStatus || '',
                c.type || '',
                c.amount || '',
                c.address || '',
                c.note || ''
            ].join(",");
            csvContent += row + "\n";
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "سجل_الجمعية_إكسيل.csv");
        document.body.appendChild(link);
        link.click();
    };

    // --- NAVIGATION ---
    toggleSidebar.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });

    sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            const page = item.getAttribute('data-page');

            // Password protection for Expenses section
            if (page === 'expenses' && !window.expensesUnlocked) {
                const pass = prompt('يرجى إدخال كلمة المرور للوصول إلى سجل المساعدات والمصروفات:');
                if (pass === '5441') {
                    window.expensesUnlocked = true;
                } else {
                    if (pass !== null) alert('كلمة مرور خاطئة! لا يمكنك الدخول.');
                    return;
                }
            }

            sidebarItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            renderPage(page);
            if (window.innerWidth <= 1024) sidebar.classList.remove('active');
        });
    });

    function renderPage(page) {
        const donationCats = appData.donations.map(d => d.type).flatMap(t => t.split(' - ')).filter(Boolean);
        const caseSources = appData.cases.map(c => c.source).filter(Boolean);
        const caseTypes = appData.cases.map(c => c.type).flatMap(t => (t || '').split(' - ')).filter(Boolean);
        const expenseCats = (appData.expenses || []).map(e => e.category).filter(Boolean);

        // Create a unique set of all categories
        const dynamicCategories = [...new Set([...donationCats, ...caseSources, ...caseTypes, ...expenseCats])];
        if (dynamicCategories.length === 0) {
            dynamicCategories.push('الصدقات', 'زكاة مال', 'مستفيدي كرتونة', 'لحوم صكوك');
        }

        let html = '';
        switch (page) {
            case 'dashboard':
                pageTitle.innerText = 'لوحة التحكم - ملخص عام';
                const catStats = {};
                dynamicCategories.forEach(cat => {
                    const donated = appData.donations
                        .filter(d => d.type && d.type.includes(cat))
                        .reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

                    const disbursed = (appData.expenses || [])
                        .filter(e => e.category === cat)
                        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

                    catStats[cat] = {
                        donated,
                        disbursed,
                        balance: donated - disbursed
                    };
                });

                // Recalculate global totals
                const totalDonations = appData.donations.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
                const actualAidDisbursed = (appData.expenses || []).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
                const scheduledMonthlyAid = appData.cases.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
                const totalBalance = totalDonations - actualAidDisbursed; // Net Cash in vault from donations only


                html = `
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-icon icon-emerald"><i class="fas fa-hand-holding-usd"></i></div>
                            <div class="stat-info">
                                <h3>إجمالي التبرعات (وارد)</h3>
                                <p>${totalDonations.toLocaleString()} ج.م</p>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon icon-blue"><i class="fas fa-users"></i></div>
                            <div class="stat-info">
                                <h3>الحالات المسجلة</h3>
                                <p>${appData.cases.length} حالة</p>
                                <small style="color: #666;">(مقرر شهرياً: ${scheduledMonthlyAid.toLocaleString()} ج.م)</small>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon icon-orange" style="background: #fff7e6; color: #fa8c16;"><i class="fas fa-hand-holding-heart"></i></div>
                            <div class="stat-info">
                                <h3>إجمالي المنصرف (مساعدات)</h3>
                                <p>${actualAidDisbursed.toLocaleString()} ج.م</p>
                            </div>
                        </div>
                        <div class="stat-card" style="background: #e6fffa; border: 2px solid #217346;">
                            <div class="stat-icon" style="background: #217346; color: white;"><i class="fas fa-vault"></i></div>
                            <div class="stat-info">
                                <h3 style="color: #1a5c38;">رصيد الخزينة المتاح</h3>
                                <p style="font-size: 1.5rem; font-weight: 800; color: #217346;">${totalBalance.toLocaleString()} ج.م</p>
                            </div>
                        </div>
                    </div>

                    <div class="card" style="margin-top: 20px;">
                        <div class="card-header">
                            <h2>تحليل التبرعات حسب الجهة</h2>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 15px; padding: 10px;">
                            ${dynamicCategories.map(cat => {
                    const s = catStats[cat];
                    if (s.donated === 0 && s.disbursed === 0) return ''; // Skip empty ones if any
                    return `
                                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border-right: 4px solid var(--primary-color); box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                                    <h4 style="margin-bottom: 10px; color: var(--primary-color); border-bottom: 1px solid #eee; padding-bottom: 5px;">${cat}</h4>
                                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 4px;">
                                        <span style="color: #666;">إجمالي التبرع:</span>
                                        <span style="font-weight: 700; color: #217346;">${s.donated.toLocaleString()} ج.م</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 4px;">
                                        <span style="color: #666;">إجمالي المنصرف:</span>
                                        <span style="font-weight: 700; color: #cf1322;">${s.disbursed.toLocaleString()} ج.م</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; font-size: 0.95rem; margin-top: 8px; border-top: 1px dashed #ccc; padding-top: 5px;">
                                        <span style="font-weight: 700;">المتبقي في العهدة:</span>
                                        <span style="font-weight: 800; color: ${s.balance >= 0 ? '#217346' : '#d13438'};">${s.balance.toLocaleString()} ج.م</span>
                                    </div>
                                </div>
                                `;
                }).join('')}
                        </div>
                    </div>
                `;
                break;

            case 'statistics':
                pageTitle.innerText = 'مركز الإحصائيات المتقدمة (احترافي)';
                const totalDonationsStats = appData.donations.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
                const totalAidStats = (appData.expenses || []).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
                const netBalance = totalDonationsStats - totalAidStats;

                // Group by Classification
                const typeCounts = {};
                appData.cases.forEach(c => {
                    const types = (c.type || 'غير مصنف').split(' - ');
                    types.forEach(t => {
                        typeCounts[t] = (typeCounts[t] || 0) + 1;
                    });
                });

                html = `
                    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">
                        <div class="card">
                            <div class="card-header"><h2>نظرة فاحصة على الميزانية</h2></div>
                            <div style="padding: 20px;">
                                <div style="margin-bottom: 25px;">
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                        <span>التبرعات الواصلة</span>
                                        <span style="font-weight: bold; color: #217346;">${totalDonationsStats.toLocaleString()} ج.م</span>
                                    </div>
                                    <div style="height: 12px; background: #eee; border-radius: 6px; overflow: hidden;">
                                        <div style="width: 100%; height: 100%; background: #217346;"></div>
                                    </div>
                                </div>
                                <div style="margin-bottom: 25px;">
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                        <span>المساعدات المنصرفة</span>
                                        <span style="font-weight: bold; color: #d13438;">${totalAidStats.toLocaleString()} ج.م</span>
                                    </div>
                                    <div style="height: 12px; background: #eee; border-radius: 6px; overflow: hidden;">
                                        <div style="width: ${(totalAidStats / totalDonationsStats * 100) || 0}%; height: 100%; background: #d13438;"></div>
                                    </div>
                                    <small style="color: #666;">ما تم صرفه يمثل ${((totalAidStats / totalDonationsStats * 100) || 0).toFixed(1)}% من إجمالي الإيرادات</small>
                                </div>
                                <div style="padding: 20px; background: #f0f7f2; border-radius: 8px; text-align: center;">
                                    <h3 style="color: #217346; margin-bottom: 5px;">الفائض النقدي المتاح</h3>
                                    <p style="font-size: 2.2rem; font-weight: 800; color: #217346;">${netBalance.toLocaleString()} <small>ج.م</small></p>
                                </div>
                            </div>
                        </div>
                        
                        <div class="card">
                            <div class="card-header"><h2>توزيع الحالات</h2></div>
                            <div style="padding: 10px;">
                                ${Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => `
                                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px; padding: 8px; background: #fafafa; border-radius: 4px;">
                                        <div style="width: 40px; height: 40px; background: #eef2f7; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: var(--primary-color);">
                                            ${count}
                                        </div>
                                        <div style="flex: 1;">
                                            <div style="font-weight: 600; font-size: 0.9rem;">${type}</div>
                                            <div style="height: 4px; background: #eee; border-radius: 2px; margin-top: 4px;">
                                                <div style="width: ${(count / appData.cases.length * 100)}%; height: 100%; background: var(--primary-color);"></div>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <div class="card" style="margin-top: 20px;">
                        <div class="card-header"><h2>تقارير سريعة</h2></div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; padding: 20px;">
                            <button class="btn-primary" style="background: #0078d4; height: 120px; flex-direction: column; gap: 10px;" onclick="renderPage('reports')">
                                <i class="fas fa-file-pdf" style="font-size: 2rem;"></i>
                                <span>تقارير قابلة للطباعة</span>
                            </button>
                            <button class="btn-primary" style="background: #217346; height: 120px; flex-direction: column; gap: 10px;" onclick="exportToExcel()">
                                <i class="fas fa-file-excel" style="font-size: 2rem;"></i>
                                <span>تصدير البيانات لإكسيل</span>
                            </button>
                            <button class="btn-primary" style="background: #8b5cf6; height: 120px; flex-direction: column; gap: 10px;" onclick="renderPage('expenses')">
                                <i class="fas fa-history" style="font-size: 2rem;"></i>
                                <span>سجل الحركة المالية</span>
                            </button>
                        </div>
                    </div>
                `;
                break;

            case 'cases':
                pageTitle.innerText = 'إدارة الحالات والأسر';
                const filter = window.currentSearchFilter || '';
                const filteredCases = appData.cases.filter(c => {
                    if (c.hidden) return false;
                    const searchStr = `${c.name} ${c.nationalId} ${c.spouseName} ${c.spouseId} ${c.searchNumber || ''}`.toLowerCase();
                    return searchStr.includes(filter.toLowerCase());
                });

                html = `
                    <div class="card">
                        <div class="card-header">
                            <h2>${filter ? `نتائج البحث عن: "${filter}"` : 'سجل الحالات الكامل'}</h2>
                            <div style="display: flex; gap: 10px;">
                                ${filter ? `<button class="btn-secondary" onclick="clearSearch()"><i class="fas fa-times"></i> إلغاء البحث</button>` : ''}
                                <button class="btn-primary" onclick="openCaseModal()"><i class="fas fa-plus"></i> إضافة حالة</button>
                            </div>
                        </div>
                        <div class="table-container">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>م</th>
                                        <th>رقم البحث</th>
                                        <th>التاريخ</th>
                                        <th>المركز</th>
                                        <th>الاسم</th>
                                        <th>الرقم القومي</th>
                                        <th>المهنة</th>
                                        <th>الهاتف</th>
                                        <th>الأفراد</th>
                                        <th>الوضع</th>
                                        <th>التصنيف</th>
                                        <th>جهة التبرع</th>
                                        <th>المبلغ</th>
                                        <th>العنوان</th>
                                        <th>الإجراءات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${filteredCases.sort((a, b) => {
                    const nameA = window.normalizeArabic(a.name);
                    const nameB = window.normalizeArabic(b.name);
                    return nameA.localeCompare(nameB, 'ar');
                }).map((c, index) => `
                                        <tr onclick="toggleFamilyMembers(${c.id})" class="main-case-row">
                                            <td style="background: rgba(0,0,0,0.03); font-weight: bold; text-align: center;">${index + 1}</td>
                                            <td style="font-weight: 800; color: #d13438; text-align: center; background: rgba(209, 52, 56, 0.05);">${c.searchNumber || '-'}</td>
                                            <td style="color: #64748b; font-size: 0.8rem;">${c.date || '-'}</td>
                                            <td style="color: #059669; font-weight: 600; background: rgba(5, 150, 105, 0.03);">${c.center || '-'}</td>
                                            <td style="font-weight: 800; color: #4f46e5; white-space: nowrap; background: rgba(79, 70, 229, 0.03); font-size: 1rem;">${c.name}</td>
                                            <td style="color: #2563eb; font-family: monospace;">${c.nationalId || '-'}</td>
                                            <td style="color: #7c3aed;">${c.job || '-'}</td>
                                            <td style="color: #db2777; font-weight: 700;">${c.phone || '-'}</td>
                                            <td style="text-align: center; color: #ea580c; font-weight: 800; background: rgba(234, 88, 12, 0.05);">${c.familyMembers || '-'}</td>
                                            <td style="color: #0891b2; font-weight: 600;">${c.socialStatus || '-'}</td>
                                            <td style="color: #be185d;"><span class="status-badge" style="background: rgba(190, 24, 93, 0.1); color: #be185d;">${c.type || '-'}</span></td>
                                            <td style="color: #15803d; font-size: 0.85rem;">${c.source || '-'}</td>
                                            <td style="color: #c2410c; font-weight: 800;">${c.amount || '-'}</td>
                                            <td style="color: #4338ca; font-size: 0.8rem;">${c.address || '-'}</td>
                                            <td>
                                                <div style="display: flex; gap: 12px; justify-content: center; align-items: center;">
                                                    <i class="fas fa-edit" title="تعديل" style="color: #0078d4; cursor: pointer;" onclick="event.stopPropagation(); prepareEditCase(${c.id})"></i>
                                                    <i class="fas fa-user-plus" title="إضافة فرد" style="color: #217346; cursor: pointer;" onclick="event.stopPropagation(); openMemberModal(${c.id}, '${c.name}')"></i>
                                                    <i class="fas fa-file-invoice" title="عرض الوثيقة" style="color: #8b5cf6; cursor: pointer;" onclick="event.stopPropagation(); openDetailsModal(${c.id})"></i>
                                                    <i class="fas fa-eye-slash" title="أرشفة (إخفاء)" style="color: #fa8c16; cursor: pointer;" onclick="event.stopPropagation(); hideCase(${c.id})"></i>
                                                    <i class="fas fa-trash-alt" title="حذف نهائي" style="color: #d13438; cursor: pointer;" onclick="event.stopPropagation(); deleteCase(${c.id})"></i>
                                                    <i class="fas fa-chevron-down" id="icon-${c.id}" style="color: #666; cursor: pointer;"></i>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr id="members-of-${c.id}" style="display: none; background: linear-gradient(to left, #f8fafc, #eff6ff);">
                                            <td colspan="15" style="padding: 0; border: none;">
                                                <div style="display: flex; gap: 25px; padding: 25px; border-top: 4px solid #4f46e5; box-shadow: inset 0 4px 12px rgba(0,0,0,0.05);">
                                                    <!-- Right Side: Tables -->
                                                    <div style="flex: 1;">
                                                        <h4 style="margin-bottom: 15px; color: #4f46e5; border-right: 4px solid #4f46e5; padding-right: 10px; font-weight: 800;"><i class="fas fa-users"></i> أفراد الأسرة:</h4>
                                                        ${(c.members && c.members.length > 0) ? `
                                                            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                                                                <thead>
                                                                    <tr style="background-color: #eef2f7;">
                                                                        <th style="padding: 5px; border: 1px solid #ddd; text-align: right;">الاسم</th>
                                                                        <th style="padding: 5px; border: 1px solid #ddd; text-align: right;">الرقم القومي</th>
                                                                        <th style="padding: 5px; border: 1px solid #ddd; text-align: right;">الصلة</th>
                                                                        <th style="padding: 5px; border: 1px solid #ddd; text-align: right;">السن</th>
                                                                        <th style="padding: 5px; border: 1px solid #ddd; text-align: right;">المهنة</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    ${c.members.map(m => `
                                                                        <tr>
                                                                            <td style="padding: 5px; border: 1px solid #ddd;">${m.name || '-'}</td>
                                                                            <td style="padding: 5px; border: 1px solid #ddd;">${m.idNo || '-'}</td>
                                                                            <td style="padding: 5px; border: 1px solid #ddd;">${m.relation || '-'}</td>
                                                                            <td style="padding: 5px; border: 1px solid #ddd;">${m.age || '-'}</td>
                                                                            <td style="padding: 5px; border: 1px solid #ddd;">${m.job || '-'}</td>
                                                                        </tr>
                                                                    `).join('')}
                                                                </tbody>
                                                            </table>
                                                        ` : '<p style="color: #999; margin-bottom: 20px;">لا يوجد أفراد أسرة مسجلين.</p>'}

                                                        <h4 style="margin-bottom: 10px; color: #333;"><i class="fas fa-hand-holding-usd"></i> سجل المساعدات:</h4>
                                                        ${(c.aidHistory && c.aidHistory.length > 0) ? `
                                                            <table style="width: 100%; border-collapse: collapse;">
                                                                <thead>
                                                                    <tr style="background-color: #eef2f7;">
                                                                        <th style="padding: 5px; border: 1px solid #ddd; text-align: right;">التاريخ</th>
                                                                        <th style="padding: 5px; border: 1px solid #ddd; text-align: right;">المبلغ</th>
                                                                        <th style="padding: 5px; border: 1px solid #ddd; text-align: right;">الجهة</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    ${c.aidHistory.map(aid => `
                                                                        <tr>
                                                                            <td style="padding: 5px; border: 1px solid #ddd;">${aid.date || '-'}</td>
                                                                            <td style="padding: 5px; border: 1px solid #ddd;">${aid.amount || '-'}</td>
                                                                            <td style="padding: 5px; border: 1px solid #ddd;">${aid.category || '-'}</td>
                                                                        </tr>
                                                                    `).join('')}
                                                                </tbody>
                                                            </table>
                                                        ` : '<p style="color: #999;">لا يوجد سجل مساعدات.</p>'}
                                                    </div>

                                                    <!-- Left Side: Photos -->
                                                    <div style="width: 180px; display: flex; flex-direction: column; gap: 15px; border-right: 1px solid #eee; padding-right: 15px;">
                                                        <h4 style="margin-bottom: 10px; color: #333;"><i class="fas fa-images"></i> الوثائق:</h4>
                                                        <div style="text-align: center; border: 1px solid #eee; padding: 10px; border-radius: 8px; background: white;">
                                                            ${c.photoUrl ? `
                                                                <img src="${c.photoUrl}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd; cursor: pointer;" onclick="event.stopPropagation(); openImageViewer('${c.photoUrl}')">
                                                                <div style="display: flex; gap: 5px; margin-top: 5px; justify-content: center;">
                                                                    <i class="fas fa-trash-alt" style="color: #d13438; cursor: pointer; font-size: 0.8rem;" onclick="event.stopPropagation(); removeImage(${c.id}, 'photo')"></i>
                                                                    <i class="fas fa-upload" style="color: #217346; cursor: pointer; font-size: 0.8rem;" onclick="event.stopPropagation(); triggerUpload(${c.id}, 'photo')"></i>
                                                                </div>
                                                            ` : `
                                                                <div style="height: 100px; background: #fdfdfd; border: 1px dashed #ccc; display: flex; align-items: center; justify-content: center; cursor: pointer;" onclick="event.stopPropagation(); triggerUpload(${c.id}, 'photo')">
                                                                    <i class="fas fa-camera" style="color: #ccc; font-size: 1.5rem;"></i>
                                                                </div>
                                                                <span style="font-size: 0.7rem; color: #666; display: block; margin-top: 5px;">صورة الحالة</span>
                                                            `}
                                                        </div>

                                                        <div style="text-align: center; border: 1px solid #eee; padding: 10px; border-radius: 8px; background: white;">
                                                            ${c.idCardUrl ? `
                                                                <img src="${c.idCardUrl}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd; cursor: pointer;" onclick="event.stopPropagation(); openImageViewer('${c.idCardUrl}')">
                                                                <div style="display: flex; gap: 5px; margin-top: 5px; justify-content: center;">
                                                                    <i class="fas fa-trash-alt" style="color: #d13438; cursor: pointer; font-size: 0.8rem;" onclick="event.stopPropagation(); removeImage(${c.id}, 'idCard')"></i>
                                                                    <i class="fas fa-upload" style="color: #217346; cursor: pointer; font-size: 0.8rem;" onclick="event.stopPropagation(); triggerUpload(${c.id}, 'idCard')"></i>
                                                                </div>
                                                            ` : `
                                                                <div style="height: 100px; background: #fdfdfd; border: 1px dashed #ccc; display: flex; align-items: center; justify-content: center; cursor: pointer;" onclick="event.stopPropagation(); triggerUpload(${c.id}, 'idCard')">
                                                                    <i class="fas fa-id-card" style="color: #ccc; font-size: 1.5rem;"></i>
                                                                </div>
                                                                <span style="font-size: 0.75rem; color: #666; display: block; margin-top: 5px;">صورة البطاقة</span>
                                                            `}
                                                        </div>

                                                        ${(c.docs && c.docs.length > 0) ? `
                                                            <div style="margin-top: 10px; border-top: 1px solid #eee; padding-top: 10px;">
                                                                <span style="display: block; font-size: 0.8rem; font-weight: 700; margin-bottom: 5px; color: #666;">مرفقات إضافية:</span>
                                                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                                                                    ${c.docs.map((doc, dIdx) => `
                                                                        <div style="position: relative;">
                                                                            <img src="${doc}" style="width: 100%; height: 50px; object-fit: cover; border-radius: 4px; border: 1px solid #eee; cursor: pointer;" onclick="event.stopPropagation(); openImageViewer('${doc}')">
                                                                            <i class="fas fa-times-circle" style="position: absolute; top: -5px; right: -5px; color: #d13438; cursor: pointer; background: white; border-radius: 50%; font-size: 0.8rem;" onclick="event.stopPropagation(); removeCaseDoc(${c.id}, ${dIdx})"></i>
                                                                        </div>
                                                                    `).join('')}
                                                                </div>
                                                            </div>
                                                        ` : ''}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    `).join('')}
                                    ${filteredCases.length === 0 ? '<tr><td colspan="15" style="text-align: center; padding: 30px; color: #999;">لا توجد حالات مسجلة حالياً</td></tr>' : ''}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
                break;
            case 'donations':
                pageTitle.innerText = 'إدارة التبرعات';
                selectedSponsorCases = []; // Reset when page is loaded
                html = `
                    <div class="card">
                        <div class="card-header">
                            <h2>تسجيل تبرع جديد</h2>
                        </div>
                        <div class="form-grid" style="margin-bottom: 30px;">
                            <div class="input-group-office">
                                <label>التاريخ</label>
                                <input type="date" id="donation-date" class="office-input" value="${new Date().toISOString().split('T')[0]}">
                            </div>
                            <div class="input-group-office">
                                <label>اسم المتبرع</label>
                                <div class="dropdown-container">
                                    <input type="text" id="donor-name" class="office-input" 
                                        oninput="filterDonors(this.value)" 
                                        onfocus="filterDonors(this.value)"
                                        autocomplete="off">
                                    <div id="donor-dropdown-results" class="dropdown-results"></div>
                                </div>
                            </div>
                            <div class="input-group-office">
                                <label>رقم الهاتف</label>
                                <input type="text" id="donor-phone" class="office-input">
                            </div>
                            <div class="input-group-office">
                                <label>المبلغ</label>
                                <input type="number" id="donation-amount" class="office-input">
                            </div>

                            <div class="input-group-office" style="grid-column: span 3; margin-top: 10px; display: flex; gap: 20px; align-items: center; background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
                                <label style="font-weight: 700;">نوع التبرع:</label>
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 600; color: #475569;">
                                    <input type="radio" name="donation-mode" value="auto" checked onchange="toggleDonationMode()"> تبرع تلقائي (جهات خيرية)
                                </label>
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 600; color: #475569;">
                                    <input type="radio" name="donation-mode" value="sponsor" onchange="toggleDonationMode()"> تبرع كفيل (حالات محددة)
                                </label>
                            </div>

                            <!-- Automatic Donation Section -->
                            <div id="auto-donation-section" class="input-group-office" style="grid-column: span 3; margin-top: 10px;">
                                <label>بيان التبرع (اختر جهة التبرع أو أكثر)</label>
                                <div class="classification-grid" id="donation-types" style="max-height: 180px;">
                                    <label class="check-item"><input type="checkbox" value="الصدقات"> الصدقات</label>
                                    <label class="check-item"><input type="checkbox" value="زكاة مال"> زكاة مال</label>
                                    <label class="check-item"><input type="checkbox" value="مستفيدي كرتونة"> م/كرتونة</label>
                                    <label class="check-item"><input type="checkbox" value="مستفيدي رمضان"> م/رمضان</label>
                                    <label class="check-item"><input type="checkbox" value="الغارمين"> الغارمين</label>
                                    <label class="check-item"><input type="checkbox" value="المرضى"> المرضى</label>
                                    <label class="check-item"><input type="checkbox" value="أيتام"> أيتام</label>
                                    <label class="check-item"><input type="checkbox" value="زواج متعسر"> زواج</label>
                                    <label class="check-item"><input type="checkbox" value="لحوم صكوك"> صكوك</label>
                                    <label class="check-item"><input type="checkbox" value="ملابس"> ملابس</label>
                                    <div style="grid-column: span 2; display: flex; align-items: center; gap: 5px; margin-top: 5px; border-top: 1px solid #eee; padding-top: 5px;">
                                        <label style="font-size: 0.8rem; white-space: nowrap;">أخرى:</label>
                                        <input type="text" id="donation-type-other" class="office-input" style="height: 25px; padding: 2px 8px; font-size: 0.8rem;" placeholder="اكتب جهة أخرى...">
                                    </div>
                                </div>
                            </div>

                            <!-- Sponsor Donation Section -->
                            <div id="sponsor-donation-section" class="input-group-office" style="grid-column: span 3; margin-top: 10px; display: none;">
                                <label>كفالة حالات (ابحث بالاسم أو رقم البحث واختر حالة أو أكثر)</label>
                                <div class="dropdown-container">
                                    <input type="text" id="sponsor-case-search" class="office-input" placeholder="ابحث باسم الحالة أو رقم البحث (مثلاً: احمد أو 101)..." oninput="filterSponsorCases(this.value)" autocomplete="off">
                                    <div id="sponsor-case-results" class="dropdown-results"></div>
                                </div>
                                <div id="selected-sponsor-cases" style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 15px; padding: 10px; background: #fff; border: 1px dashed #cbd5e1; border-radius: 8px; min-height: 50px;">
                                    <p style="color: #94a3b8; font-size: 0.85rem; width: 100%; text-align: center;">لم يتم اختيار حالات بعد</p>
                                </div>
                            </div>

                            <div class="input-group-office" style="grid-column: span 3; justify-content: flex-end; margin-top: 15px; display: flex; gap: 10px;">
                                <button id="save-donation-btn" class="btn-primary" onclick="addNewDonation()"><i class="fas fa-save"></i> تسجيل وتثبيت التبرع</button>
                                <button id="cancel-donation-edit" class="btn-secondary" style="display: none;" onclick="cancelDonationEdit()">إلغاء التعديل</button>
                            </div>
                        </div>

                        <div id="donor-summary-stats" style="display: flex; gap: 20px; margin-bottom: 20px;">
                            <div class="stat-mini-card" style="background: #f0f7f2; padding: 10px 20px; border-radius: 8px; border-right: 4px solid #217346;">
                                <span style="font-size: 0.8rem; color: #666;">إجمالي التبرعات</span>
                                <div style="font-size: 1.2rem; font-weight: bold; color: #217346;">${appData.donations.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0).toLocaleString()} ج.م</div>
                            </div>
                            <div class="stat-mini-card" style="background: #eef2f7; padding: 10px 20px; border-radius: 8px; border-right: 4px solid #4f46e5;">
                                <span style="font-size: 0.8rem; color: #666;">عدد المتبرعين</span>
                                <div style="font-size: 1.2rem; font-weight: bold; color: #4f46e5;">${new Set(appData.donations.map(d => d.donor)).size}</div>
                            </div>
                        </div>

                        <table class="data-table">
                            <thead>
                                <tr><th>المتبرع</th><th>رقم الهاتف</th><th>إجمالي التبرعات</th><th>عدد المرات</th><th>آخر تاريخ</th><th>الإجراءات</th></tr>
                            </thead>
                            <tbody>
                                ${(() => {
                        const grouped = {};
                        appData.donations.forEach(d => {
                            const key = d.donor;
                            if (!grouped[key]) {
                                grouped[key] = { name: d.donor, phone: d.phone || '', total: 0, count: 0, lastDate: d.date };
                            }
                            grouped[key].total += (parseFloat(d.amount) || 0);
                            grouped[key].count += 1;
                            if (d.date > grouped[key].lastDate) grouped[key].lastDate = d.date;
                        });
                        const list = Object.values(grouped).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
                        return list.map(don => `
                                        <tr>
                                            <td style="font-weight: bold; color: #4f46e5; cursor: pointer; font-size: 1.1rem;" 
                                                onclick="viewDonorHistory(this.getAttribute('data-name'), this.getAttribute('data-phone'))"
                                                data-name="${don.name.replace(/"/g, '&quot;')}" data-phone="${don.phone}">
                                                <i class="fas fa-user-circle"></i> ${don.name}
                                            </td>
                                            <td>${don.phone}</td>
                                            <td style="font-weight: bold; color: #217346;">${don.total.toLocaleString()} ج.م</td>
                                            <td><span class="status-badge" style="background:#eef2f7; color:#4f46e5;">${don.count}</span></td>
                                            <td>${don.lastDate}</td>
                                            <td>
                                                <button class="btn-primary" style="font-size:0.7rem; padding:4px 8px;" 
                                                    onclick="viewDonorHistory(this.getAttribute('data-name'), this.getAttribute('data-phone'))"
                                                    data-name="${don.name.replace(/"/g, '&quot;')}" data-phone="${don.phone}">عرض السجل</button>
                                            </td>
                                        </tr>
                                    `).join('');
                    })()}
                                ${appData.donations.length === 0 ? '<tr><td colspan="6" style="text-align:center; color:#999;">لا توجد تبرعات مسجلة</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                `;
                break;

            case 'expenses':
                pageTitle.innerText = 'سجل صرف وتسليم المساعدات';
                html = `
                    <div class="card">
                        <div class="card-header">
                            <h2>تسجيل عملية تسليم مساعدة</h2>
                        </div>
                        <div class="form-grid" style="margin-bottom: 30px;">
                            <div class="input-group-office">
                                <label>تاريخ التسليم</label>
                                <input type="date" id="aid-date" class="office-input" value="${new Date().toISOString().split('T')[0]}">
                            </div>
                            <div class="input-group-office">
                                <label>اسم المستفيد (من الحالات)</label>
                                <div class="dropdown-container">
                                    <input type="text" id="aid-beneficiary-search" class="office-input" placeholder="ابحث بالاسم أو الرقم القومي..." 
                                        oninput="filterAidBeneficiaries(this.value)" 
                                        onfocus="filterAidBeneficiaries(this.value)"
                                        autocomplete="off">
                                    <input type="hidden" id="aid-beneficiary">
                                    <div id="aid-dropdown-results" class="dropdown-results"></div>
                                </div>
                            </div>
                            <div class="input-group-office">
                                <label>الرقم القومي</label>
                                <input type="text" id="aid-national-id" class="office-input" placeholder="سيتم التعبئة تلقائياً">
                            </div>
                            <div class="input-group-office">
                                <label>المبلغ / الكمية</label>
                                <input type="text" id="aid-amount" class="office-input" placeholder="مثلاً: 500 ج.م أو 2 كرتونة">
                            </div>
                            <div class="input-group-office">
                                <label>جهة التبرع / الصرف</label>
                                <input type="text" id="aid-category" class="office-input" list="dynamic-cats-list" placeholder="اكتب أو اختر الجهة (مثلاً: الأورمان)...">
                                <datalist id="dynamic-cats-list">
                                    ${dynamicCategories.map(cat => `<option value="${cat}">`).join('')}
                                </datalist>
                            </div>
                            <div class="input-group-office">
                                <label>شهر التبرع</label>
                                <input type="text" id="aid-month" class="office-input" placeholder="يناير 2024">
                            </div>
                            <div class="input-group-office">
                                <label>المسؤول عن التسليم</label>
                                <input type="text" id="aid-responsible" class="office-input">
                            </div>
                            <div class="input-group-office">
                                <label>توقيع المستفيد / ملاحظات</label>
                                <input type="text" id="aid-signature" class="office-input">
                            </div>
                            <div class="input-group-office" style="justify-content: flex-end; grid-column: span 1; align-self: end; display: flex; gap: 10px;">
                                <button id="save-aid-btn" class="btn-primary" onclick="addNewAidRecord()"><i class="fas fa-check-double"></i> تأكيد صرف المساعدة</button>
                                <button id="cancel-aid-edit" class="btn-secondary" style="display: none;" onclick="cancelAidEdit()">إلغاء</button>
                            </div>
                        </div>
                        <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>التاريخ</th>
                                    <th>المستفيد</th>
                                    <th>الرقم القومي</th>
                                    <th>المبلغ/الكمية</th>
                                    <th>جهة التبرع</th>
                                    <th>الشهر</th>
                                    <th>المسؤول</th>
                                    <th>توقيع/ملاحظات</th>
                                    <th>الإجراءات</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${[...(appData.expenses || [])].sort((a, b) => window.normalizeArabic(a.beneficiary).localeCompare(window.normalizeArabic(b.beneficiary), 'ar')).map(e => `
                                    <tr>
                                        <td>${e.date}</td>
                                        <td style="font-weight: 700; color: #333;">${e.beneficiary || '-'}</td>
                                        <td style="font-size: 0.8rem;">${e.nationalId || '-'}</td>
                                        <td style="color: #cf1322; font-weight: 700;">${e.amount}</td>
                                        <td><span class="status-badge" style="background: #eef2f7; color: #475569;">${e.category || '-'}</span></td>
                                        <td>${e.month || '-'}</td>
                                        <td>${e.responsible || '-'}</td>
                                        <td style="font-size: 0.8rem;">${e.signature || '-'}</td>
                                        <td>
                                            <div style="display: flex; gap: 10px; justify-content: center;">
                                                <i class="fas fa-edit" style="color: #217346; cursor: pointer;" onclick="prepareEditAid(${e.id})"></i>
                                                <i class="fas fa-trash-alt" style="color: #d13438; cursor: pointer;" onclick="deleteExpense(${e.id})"></i>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        </div>
                    </div>
                `;
                break;

            case 'hidden':
                pageTitle.innerText = 'الحالات المخفية (الأرشيف)';
                const hiddenCases = appData.cases.filter(c => c.hidden);

                html = `
                    <div class="card">
                        <div class="card-header">
                            <h2>سجل الحالات المخفية</h2>
                        </div>
                        <div class="table-container">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>م</th>
                                        <th>المركز</th>
                                        <th>الاسم</th>
                                        <th>الرقم القومي</th>
                                        <th>الوضع</th>
                                        <th>التصنيف</th>
                                        <th>الإجراءات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${[...hiddenCases].sort((a, b) => window.normalizeArabic(a.name).localeCompare(window.normalizeArabic(b.name), 'ar')).map((c, index) => `
                                        <tr>
                                            <td>${index + 1}</td>
                                            <td>${c.center || '-'}</td>
                                            <td style="font-weight: 700;">${c.name}</td>
                                            <td>${c.nationalId || '-'}</td>
                                            <td>${c.socialStatus || '-'}</td>
                                            <td>${c.type || '-'}</td>
                                            <td>
                                                <div style="display: flex; gap: 12px; justify-content: center; align-items: center;">
                                                    <i class="fas fa-file-invoice" title="عرض الوثيقة" style="color: #8b5cf6; cursor: pointer;" onclick="event.stopPropagation(); openDetailsModal(${c.id})"></i>
                                                    <i class="fas fa-eye" title="إلغاء الأرشفة" style="color: #217346; cursor: pointer;" onclick="event.stopPropagation(); restoreCase(${c.id})"></i>
                                                    <i class="fas fa-trash-alt" title="حذف نهائي" style="color: #d13438; cursor: pointer;" onclick="event.stopPropagation(); deleteCase(${c.id})"></i>
                                                </div>
                                            </td>
                                        </tr>
                                    `).join('')}
                                    ${hiddenCases.length === 0 ? '<tr><td colspan="7" style="text-align: center; padding: 30px; color: #999;">لا توجد حالات مخفية حالياً</td></tr>' : ''}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
                break;

            case 'volunteers':
                pageTitle.innerText = 'إدارة سجل المتطوعين';
                html = `
                    <div class="card">
                        <div class="card-header">
                            <h2>إضافة متطوع جديد</h2>
                        </div>
                        <div class="form-grid" style="margin-bottom: 30px;">
                            <div class="input-group-office">
                                <label>الاسم الكامل</label>
                                <input type="text" id="volunteer-name" class="office-input">
                            </div>
                            <div class="input-group-office">
                                <label>رقم الهاتف</label>
                                <input type="text" id="volunteer-phone" class="office-input">
                            </div>
                            <div class="input-group-office">
                                <label>العنوان</label>
                                <input type="text" id="volunteer-address" class="office-input">
                            </div>
                            <div class="input-group-office">
                                <label>ملاحظات / تخصص التطوع</label>
                                <input type="text" id="volunteer-note" class="office-input" placeholder="مثلاً: توزيع، أبحاث، طبيب...">
                            </div>
                            <div class="input-group-office" style="justify-content: flex-end; align-self: end;">
                                <button class="btn-primary" onclick="addNewVolunteer()"><i class="fas fa-user-plus"></i> إضافة للسجل</button>
                            </div>
                        </div>
                        <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>م</th>
                                    <th>الاسم</th>
                                    <th>الهاتف</th>
                                    <th>العنوان</th>
                                    <th>ملاحظات</th>
                                    <th>الإجراءات</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(appData.volunteers || []).sort((a, b) => window.normalizeArabic(a.name).localeCompare(window.normalizeArabic(b.name), 'ar')).map((v, idx) => `
                                    <tr>
                                        <td>${idx + 1}</td>
                                        <td style="font-weight: 700; color: #333;">${v.name}</td>
                                        <td>${v.phone || '-'}</td>
                                        <td>${v.address || '-'}</td>
                                        <td>${v.note || '-'}</td>
                                        <td><i class="fas fa-trash-alt" style="color: #d13438; cursor: pointer;" onclick="deleteVolunteer(${v.id})"></i></td>
                                    </tr>
                                `).join('')}
                                ${(appData.volunteers || []).length === 0 ? '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #999;">لا يوجد متطوعين مسجلين بعد</td></tr>' : ''}
                            </tbody>
                        </table>
                        </div>
                    </div>
                `;
                break;

            case 'reports':
                pageTitle.innerText = 'نظام استخراج التقارير الشاملة';
                html = `
                    <div class="card">
                        <div class="card-header">
                            <h2>استخراج تقرير تفصيلي</h2>
                        </div>
                        <div class="form-grid" style="margin-bottom: 30px; border-bottom: 1px dashed #eee; padding-bottom: 20px;">
                            <div class="input-group-office">
                                <label>نوع التقرير</label>
                                <select id="report-type" class="office-input">
                                    <option value="donations">تقرير التبرعات (الوارد)</option>
                                    <option value="aid">تقرير المساعدات (المنصرف)</option>
                                    <option value="cases">تقرير الحالات والأسر السنوي/الدوري</option>
                                </select>
                            </div>
                            <div class="input-group-office">
                                <label>من تاريخ</label>
                                <input type="date" id="report-from" class="office-input">
                            </div>
                             <div class="input-group-office">
                                <label>إلى تاريخ</label>
                                <input type="date" id="report-to" class="office-input">
                            </div>
                            <div class="input-group-office">
                                <label>من مسلسل (رقم)</label>
                                <input type="number" id="report-from-idx" class="office-input" placeholder="1">
                            </div>
                            <div class="input-group-office">
                                <label>إلى مسلسل (رقم)</label>
                                <input type="number" id="report-to-idx" class="office-input" placeholder="50">
                            </div>
                            <div class="input-group-office" style="justify-content: flex-end; align-self: end;">
                                <button class="btn-primary" onclick="generateReport()"><i class="fas fa-file-contract"></i> عرض التقرير</button>
                            </div>
                        </div>
                        
                        <div id="report-results-container" style="display: none;">
                            <div id="printable-report-area">
                                <!-- Generated report content will go here -->
                            </div>
                            <div style="text-align: center; margin-top: 20px; padding: 20px; background: #f8f9fa; border-radius: 8px;">
                                <button class="btn-primary" onclick="printReport()" style="background: #0078d4; padding: 10px 40px; font-size: 1.1rem;">
                                    <i class="fas fa-print"></i> طباعة هذا التقرير
                                </button>
                            </div>
                        </div>
                        </div>
                    </div>
                `;
                break;

            case 'affidavit':
                pageTitle.innerText = 'نظام الإفادة والتحقق من البيانات';
                html = `
                    <div class="card">
                        <div class="card-header">
                            <h2>إصدار إفادة / استعلام شامل</h2>
                            <p style="font-size: 0.85rem; color: #666; margin-top: 5px;">أدخل بيانات الزوج أو الزوجة للتحقق من وجودهم مسبقاً في السجلات (حالات، تبرعات، مساعدات)</p>
                        </div>
                        <div class="form-grid" style="padding: 20px;">
                            <!-- Husband Info -->
                            <div style="grid-column: span 1; background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); padding: 25px; border-radius: 20px; border: 2px solid #10b981; box-shadow: var(--shadow-soft);">
                                <h4 style="color: #059669; margin-bottom: 20px; border-right: 5px solid #059669; padding-right: 15px; font-weight: 800; font-size: 1.2rem;"><i class="fas fa-mars"></i> بيانات الزوج</h4>
                                <div class="input-group-office">
                                    <label style="color: #065f46;">اسم الزوج</label>
                                    <div class="dropdown-container">
                                        <input type="text" id="aff-husband-name" class="office-input" style="border-right: 4px solid #059669;" oninput="checkAffidavitDuplicates('name', this.value)">
                                        <div id="aff-husband-name-results" class="dropdown-results"></div>
                                    </div>
                                </div>
                                <div class="input-group-office">
                                    <label style="color: #065f46;">الرقم القومي للزوج</label>
                                    <div class="dropdown-container">
                                        <input type="text" id="aff-husband-id" class="office-input" style="border-right: 4px solid #059669;" oninput="checkAffidavitDuplicates('nationalId', this.value)">
                                        <div id="aff-husband-id-results" class="dropdown-results"></div>
                                    </div>
                                </div>
                                <div class="input-group-office">
                                    <label style="color: #065f46;">هاتف الزوج</label>
                                    <div class="dropdown-container">
                                        <input type="text" id="aff-husband-phone" class="office-input" style="border-right: 4px solid #059669;" oninput="checkAffidavitDuplicates('phone', this.value)">
                                        <div id="aff-husband-phone-results" class="dropdown-results"></div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Wife Info -->
                            <div style="grid-column: span 1; background: linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%); padding: 25px; border-radius: 20px; border: 2px solid #f43f5e; box-shadow: var(--shadow-soft);">
                                <h4 style="color: #e11d48; margin-bottom: 20px; border-right: 5px solid #e11d48; padding-right: 15px; font-weight: 800; font-size: 1.2rem;"><i class="fas fa-venus"></i> بيانات الزوجة</h4>
                                <div class="input-group-office">
                                    <label style="color: #9d174d;">اسم الزوجة</label>
                                    <div class="dropdown-container">
                                        <input type="text" id="aff-wife-name" class="office-input" style="border-right: 4px solid #f43f5e;" oninput="checkAffidavitDuplicates('spouseName', this.value)">
                                        <div id="aff-wife-name-results" class="dropdown-results"></div>
                                    </div>
                                </div>
                                <div class="input-group-office">
                                    <label style="color: #9d174d;">الرقم القومي للزوجة</label>
                                    <div class="dropdown-container">
                                        <input type="text" id="aff-wife-id" class="office-input" style="border-right: 4px solid #f43f5e;" oninput="checkAffidavitDuplicates('spouseId', this.value)">
                                        <div id="aff-wife-id-results" class="dropdown-results"></div>
                                    </div>
                                </div>
                                <div class="input-group-office">
                                    <label style="color: #9d174d;">هاتف الزوجة</label>
                                    <div class="dropdown-container">
                                        <input type="text" id="aff-wife-phone" class="office-input" style="border-right: 4px solid #f43f5e;" oninput="checkAffidavitDuplicates('spousePhone', this.value)">
                                        <div id="aff-wife-phone-results" class="dropdown-results"></div>
                                    </div>
                                </div>
                            </div>

                            <div style="grid-column: span 2; text-align: center; margin-top: 20px; display: flex; gap: 15px; justify-content: center;">
                                <button class="btn-primary" style="background: #217346; padding: 12px 25px;" onclick="saveAffidavitOnly()">
                                    <i class="fas fa-save"></i> إضافة الإفادة للسجل
                                </button>
                                <button class="btn-primary" style="background: #0078d4; padding: 12px 25px;" onclick="generateAffidavit()">
                                    <i class="fas fa-print"></i> حفظ وطباعة الإفادة
                                </button>
                                <button class="btn-secondary" style="padding: 12px 25px;" onclick="renderPage('affidavit')">
                                    <i class="fas fa-eraser"></i> تفريغ الخانات
                                </button>
                            </div>
                        </div>
                    </div>

                    <div id="aff-results-panel" style="margin-top: 20px;">
                        <!-- Comprehensive match results will be displayed here -->
                    </div>

                    <div class="card" style="margin-top: 30px;">
                        <div class="card-header">
                            <h2>سجل الإفادات الصادرة مسبقاً</h2>
                        </div>
                        <div class="table-container">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>التاريخ</th>
                                        <th>الزوج</th>
                                        <th>الزوجة</th>
                                        <th>الإجراءات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${(appData.affidavits || []).sort((a, b) => b.id - a.id).map(aff => `
                                        <tr>
                                            <td>${aff.date}</td>
                                            <td><strong>${aff.husName}</strong><br><small>${aff.husId || '-'}</small></td>
                                            <td><strong>${aff.wifeName}</strong><br><small>${aff.wifeId || '-'}</small></td>
                                            <td>
                                                <div style="display: flex; gap: 10px; justify-content: center;">
                                                    <i class="fas fa-print" style="color: #0078d4; cursor: pointer;" title="طباعة" onclick="printSavedAffidavit(${aff.id})"></i>
                                                    <i class="fas fa-trash-alt" style="color: #d13438; cursor: pointer;" title="حذف" onclick="deleteAffidvait(${aff.id})"></i>
                                                </div>
                                            </td>
                                        </tr>
                                    `).join('')}
                                    ${(appData.affidavits || []).length === 0 ? '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #999;">لا توجد إفادات مسجلة</td></tr>' : ''}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
                break;
        }
        contentArea.innerHTML = html;
    }

    // --- CASE MODAL ACTIONS ---
    window.openCaseModal = () => {
        document.getElementById('case-modal').style.display = 'flex';
        if (!editingCaseId) {
            document.getElementById('modal-case-title').innerText = 'إضافة حالة جديدة';
            document.getElementById('modal-case-save-btn').innerText = 'حفظ البيانات';
            // Auto-fill today's date
            document.getElementById('modal-case-date').value = new Date().toISOString().split('T')[0];
        }
    };

    window.closeCaseModal = () => {
        document.getElementById('case-modal').style.display = 'none';
        // Clear inputs
        const inputs = document.querySelectorAll('#case-modal .office-input');
        inputs.forEach(input => input.value = '');
        // Clear checkboxes
        const checks = document.querySelectorAll('#modal-case-types input[type="checkbox"]');
        checks.forEach(c => c.checked = false);
        // Clear search results
        const resultDivs = ['case-name-results', 'case-id-results', 'case-phone-results', 'case-spouse-name-results', 'case-spouse-id-results', 'case-spouse-phone-results'];
        resultDivs.forEach(id => {
            const d = document.getElementById(id);
            if (d) {
                d.style.display = 'none';
                d.innerHTML = '';
            }
        });
        // Clear Other field
        document.getElementById('modal-case-type-other').value = '';
        // Clear Docs
        modalDocs = [];
        updateModalDocsPreview();
    };

    window.triggerModalDocsUpload = () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                modalDocs.push(event.target.result);
                updateModalDocsPreview();
                saveData(); // Save to localStorage even during editing
            };
            reader.readAsDataURL(file);
        };
        fileInput.click();
    };

    window.updateModalDocsPreview = () => {
        const previewDiv = document.getElementById('modal-docs-preview');
        if (!previewDiv) return;
        previewDiv.innerHTML = modalDocs.map((url, index) => `
            <div style="position: relative; width: 100px; height: 100px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; background: white;">
                <img src="${url}" style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;" onclick="openImageViewer('${url}')">
                <i class="fas fa-times-circle" style="position: absolute; top: 2px; right: 2px; color: #d13438; cursor: pointer; background: white; border-radius: 50%; font-size: 1.1rem;" onclick="removeModalDoc(${index})"></i>
            </div>
        `).join('');
    };

    window.removeModalDoc = (index) => {
        modalDocs.splice(index, 1);
        updateModalDocsPreview();
    };


    window.addNewCaseFromModal = () => {
        const searchNumber = document.getElementById('modal-case-search-number').value;
        const center = document.getElementById('modal-case-center').value;
        const name = document.getElementById('modal-case-name').value;
        const nationalId = document.getElementById('modal-case-national-id').value;
        const job = document.getElementById('modal-case-job').value;
        const phone = document.getElementById('modal-case-phone').value;
        const spouseName = document.getElementById('modal-case-spouse-name').value;
        const spouseId = document.getElementById('modal-case-spouse-id').value;
        const spousePhone = document.getElementById('modal-case-spouse-phone').value;
        const familyMembers = document.getElementById('modal-case-family').value;
        const socialStatus = document.getElementById('modal-case-social').value;

        // Collect selected types
        const selectedTypes = [];
        const checks = document.querySelectorAll('#modal-case-types input[type="checkbox"]:checked');
        checks.forEach(c => selectedTypes.push(c.value));
        const otherVal = document.getElementById('modal-case-type-other').value.trim();
        if (otherVal) selectedTypes.push(otherVal);
        const type = selectedTypes.join(' - ');

        const amount = document.getElementById('modal-case-amount').value;
        const source = document.getElementById('modal-case-source').value;
        const dateInput = document.getElementById('modal-case-date').value;
        const address = document.getElementById('modal-case-address').value;
        const note = document.getElementById('modal-case-note').value;

        if (name) {
            // Check if exists in Affidavits (Efada system) - only if creating new case
            if (!editingCaseId) {
                const inAffidavits = (appData.affidavits || []).some(aff =>
                    window.normalizeArabic(aff.husName) === window.normalizeArabic(name) ||
                    (nationalId && aff.husId === nationalId) ||
                    window.normalizeArabic(aff.wifeName) === window.normalizeArabic(name) ||
                    (nationalId && aff.wifeId === nationalId) ||
                    (spouseName && window.normalizeArabic(aff.husName) === window.normalizeArabic(spouseName)) ||
                    (spouseId && aff.husId === spouseId) ||
                    (spouseName && window.normalizeArabic(aff.wifeName) === window.normalizeArabic(spouseName)) ||
                    (spouseId && aff.wifeId === spouseId)
                );

                if (inAffidavits) {
                    alert('هذا الاسم أو الرقم القومي (أو بيانات الزوج/ة) مسجل مسبقاً في نظام الإفادة. لا يمكن تسجيله كحالة جديدة.');
                    return;
                }
            }

            if (editingCaseId) {
                const idx = appData.cases.findIndex(c => c.id === editingCaseId);
                if (idx !== -1) {
                    appData.cases[idx] = {
                        ...appData.cases[idx],
                        searchNumber, center, name, nationalId, job, phone, spouseName, spouseId, spousePhone,
                        familyMembers, socialStatus, type, amount, source, address, note,
                        docs: modalDocs,
                        date: dateInput || appData.cases[idx].date
                    };
                }
                editingCaseId = null;
            } else {
                const newCase = {
                    id: Date.now(),
                    searchNumber, center, name, nationalId, job, phone, spouseName, spouseId, spousePhone,
                    familyMembers, socialStatus, type, amount, source, address, note,
                    docs: modalDocs,
                    status: 'قيد الدراسة',
                    date: dateInput || new Date().toISOString().split('T')[0],
                    members: [],
                    aidHistory: []
                };
                appData.cases.push(newCase);
            }
            saveData();
            closeCaseModal();
            renderPage('cases');
        } else {
            alert('يرجى إدخال اسم الحالة على الأقل');
        }
    };

    window.prepareEditCase = (id) => {
        const c = appData.cases.find(item => item.id === id);
        if (!c) return;
        editingCaseId = id;
        openCaseModal();

        document.getElementById('modal-case-search-number').value = c.searchNumber || '';
        document.getElementById('modal-case-center').value = c.center || '';
        document.getElementById('modal-case-name').value = c.name || '';
        document.getElementById('modal-case-national-id').value = c.nationalId || '';
        document.getElementById('modal-case-job').value = c.job || '';
        document.getElementById('modal-case-phone').value = c.phone || '';
        document.getElementById('modal-case-spouse-name').value = c.spouseName || '';
        document.getElementById('modal-case-spouse-id').value = c.spouseId || '';
        document.getElementById('modal-case-spouse-phone').value = c.spousePhone || '';
        document.getElementById('modal-case-family').value = c.familyMembers || '';
        document.getElementById('modal-case-social').value = c.socialStatus || '';
        document.getElementById('modal-case-amount').value = c.amount || '';
        document.getElementById('modal-case-source').value = c.source || '';
        document.getElementById('modal-case-date').value = c.date || '';
        document.getElementById('modal-case-address').value = c.address || '';
        document.getElementById('modal-case-note').value = c.note || '';

        modalDocs = c.docs || [];
        updateModalDocsPreview();

        const typeArr = (c.type || '').split(' - ');
        const checks = document.querySelectorAll('#modal-case-types input[type="checkbox"]');
        const predefinedTypes = [];
        checks.forEach(chk => {
            chk.checked = typeArr.includes(chk.value);
            predefinedTypes.push(chk.value);
        });

        // Handle "Other" type
        const others = typeArr.filter(t => !predefinedTypes.includes(t));
        document.getElementById('modal-case-type-other').value = others.join(' - ');

        document.getElementById('modal-case-title').innerText = 'تعديل بيانات الحالة';
        document.getElementById('modal-case-save-btn').innerText = 'حفظ التعديلات';
    };

    // --- OTHER ACTIONS ---
    window.deleteCase = (id) => {
        const pass = prompt('يرجى إدخال كلمة سر الحذف:');
        if (pass !== '1111') {
            if (pass !== null) alert('كلمة السر خاطئة!');
            return;
        }
        if (confirm('هل أنت متأكد من حذف هذه الحالة؟')) {
            appData.cases = appData.cases.filter(c => c.id !== id);
            saveData();
            const activePage = document.querySelector('.sidebar-nav li.active').getAttribute('data-page');
            renderPage(activePage);
        }
    };

    window.addNewDonation = () => {
        const donor = document.getElementById('donor-name').value;
        const phone = document.getElementById('donor-phone').value;
        const amount = parseFloat(document.getElementById('donation-amount').value);
        const date = document.getElementById('donation-date').value || new Date().toISOString().split('T')[0];
        const modeInput = document.querySelector('input[name="donation-mode"]:checked');
        const mode = modeInput ? modeInput.value : 'auto';

        if (!donor || !amount) {
            alert('يرجى إدخال اسم المتبرع والمبلغ');
            return;
        }

        if (mode === 'auto') {
            // Collect selected donation types
            const selectedTypes = [];
            const checks = document.querySelectorAll('#donation-types input[type="checkbox"]:checked');
            checks.forEach(c => selectedTypes.push(c.value));

            const otherType = document.getElementById('donation-type-other').value.trim();
            if (otherType) selectedTypes.push(otherType);

            if (selectedTypes.length === 0) {
                alert('يرجى اختيار جهة تبرع واحدة على الأقل');
                return;
            }

            if (editingDonationId) {
                const idx = appData.donations.findIndex(d => d.id === editingDonationId);
                if (idx !== -1) {
                    appData.donations[idx].donor = donor;
                    appData.donations[idx].phone = phone;
                    appData.donations[idx].amount = amount;
                    appData.donations[idx].date = date;
                    appData.donations[idx].type = selectedTypes.join(' - ') || 'عام';
                }
                editingDonationId = null;
            } else {
                if (selectedTypes.length > 1) {
                    const splitAmount = amount / selectedTypes.length;
                    selectedTypes.forEach(t => {
                        appData.donations.push({
                            id: Date.now() + Math.random(),
                            date,
                            donor,
                            phone,
                            amount: splitAmount,
                            type: t
                        });
                    });
                } else {
                    appData.donations.push({
                        id: Date.now(),
                        date,
                        donor,
                        phone,
                        amount,
                        type: selectedTypes[0]
                    });
                }
            }
        } else {
            // Sponsor Mode
            if (selectedSponsorCases.length === 0) {
                alert('يرجى اختيار حالة واحدة على الأقل للكفالة');
                return;
            }

            const splitAmount = amount / selectedSponsorCases.length;
            const donationType = `كفالة: ${selectedSponsorCases.map(c => c.name).join(' - ')}`;

            // 1. Add to Donations
            appData.donations.push({
                id: Date.now(),
                date,
                donor,
                phone,
                amount,
                type: donationType
            });

            // 2. Add to Expenses and Case History for each case
            selectedSponsorCases.forEach(caseRef => {
                const caseRecord = appData.cases.find(c => c.id === caseRef.id);
                if (caseRecord) {
                    const expenseRecord = {
                        id: Date.now() + Math.random(),
                        date,
                        beneficiary: caseRecord.name,
                        nationalId: caseRecord.nationalId || '',
                        amount: splitAmount.toString(),
                        category: `كفالة من ${donor}`,
                        month: new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(new Date(date)),
                        responsible: 'نظام الكفالة',
                        signature: `تبرع كفالة من المتبرع: ${donor}`
                    };

                    if (!appData.expenses) appData.expenses = [];
                    appData.expenses.push(expenseRecord);

                    if (!caseRecord.aidHistory) caseRecord.aidHistory = [];
                    caseRecord.aidHistory.push(expenseRecord);

                    // Update main case fields to reflect newest sponsorship
                    caseRecord.amount = splitAmount.toString();
                    caseRecord.source = `كفالة: ${donor}`;
                    caseRecord.date = date; // Update date to show last activity
                }
            });
            selectedSponsorCases = []; // Reset after saving
        }

        saveData();
        renderPage('donations');
    };

    window.prepareEditDonation = (id) => {
        const d = appData.donations.find(item => item.id === id);
        if (!d) return;
        editingDonationId = id;

        document.getElementById('donor-name').value = d.donor;
        document.getElementById('donor-phone').value = d.phone || '';
        document.getElementById('donation-amount').value = d.amount;
        document.getElementById('donation-date').value = d.date;

        if (d.type && d.type.includes('كفالة:')) {
            document.querySelector('input[name="donation-mode"][value="sponsor"]').checked = true;
            toggleDonationMode();
            // Note: Re-linking selectedSponsorCases by parsing name is difficult,
            // so we let the user re-select if they want to change the sponsorship.
        } else {
            document.querySelector('input[name="donation-mode"][value="auto"]').checked = true;
            toggleDonationMode();
            const types = (d.type || '').split(' - ');
            const checks = document.querySelectorAll('#donation-types input[type="checkbox"]');
            checks.forEach(c => {
                c.checked = types.includes(c.value);
            });
            const predefined = Array.from(checks).map(c => c.value);
            const others = types.filter(t => t && !predefined.includes(t));
            document.getElementById('donation-type-other').value = others.join(' - ');
        }

        document.getElementById('save-donation-btn').innerHTML = '<i class="fas fa-edit"></i> تحديث بيانات التبرع';
        document.getElementById('cancel-donation-edit').style.display = 'inline-flex';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.cancelDonationEdit = () => {
        editingDonationId = null;
        renderPage('donations');
    };

    window.deleteDonation = (id) => {
        const pass = prompt('يرجى إدخال كلمة سر الحذف:');
        if (pass !== '1111') {
            if (pass !== null) alert('كلمة السر خاطئة!');
            return;
        }
        if (confirm('هل أنت متأكد من حذف هذا التبرع؟')) {
            appData.donations = appData.donations.filter(d => d.id !== id);
            saveData();
            // If the modal is open, we need to refresh the history view
            const modal = document.getElementById('details-modal');
            if (modal.style.display === 'flex') {
                const name = document.getElementById('donor-history-name')?.innerText;
                const phone = document.getElementById('donor-history-phone')?.innerText.replace(/[()]/g, '').replace('الهاتف: ', '');
                if (name) viewDonorHistory(name, phone);
            }
            renderPage('donations');
        }
    };

    window.addNewAidRecord = () => {
        const date = document.getElementById('aid-date').value;
        let beneficiary = document.getElementById('aid-beneficiary').value;
        // Fallback to the search box text if no hidden ID/name was set by the dropdown
        if (!beneficiary) {
            beneficiary = document.getElementById('aid-beneficiary-search').value.trim();
        }
        const nationalId = document.getElementById('aid-national-id').value;
        const amount = document.getElementById('aid-amount').value;
        const category = document.getElementById('aid-category').value;
        const month = document.getElementById('aid-month').value;
        const responsible = document.getElementById('aid-responsible').value;
        const signature = document.getElementById('aid-signature').value;

        if (beneficiary && amount) {
            let record;
            if (editingAidId) {
                const idx = appData.expenses.findIndex(e => e.id === editingAidId);
                if (idx !== -1) {
                    appData.expenses[idx] = {
                        ...appData.expenses[idx],
                        date, beneficiary, nationalId, amount, category, month, responsible, signature
                    };
                    record = appData.expenses[idx];
                }
                editingAidId = null;
            } else {
                record = {
                    id: Date.now(),
                    date,
                    beneficiary,
                    nationalId,
                    amount,
                    category,
                    month,
                    responsible,
                    signature
                };

                if (!appData.expenses) appData.expenses = [];
                appData.expenses.push(record);
            }

            // --- Synchronization with Case (Case Management) ---
            // Find the case by National ID (most reliable) or Name (normalized)
            const caseIndex = appData.cases.findIndex(c =>
                (nationalId && c.nationalId === nationalId) ||
                (window.normalizeArabic(c.name) === window.normalizeArabic(beneficiary))
            );

            if (caseIndex !== -1) {
                const targetCase = appData.cases[caseIndex];
                if (!targetCase.aidHistory) targetCase.aidHistory = [];

                // Update the specific record within the case's aidHistory
                const historyIdx = targetCase.aidHistory.findIndex(h => h.id === record.id);
                if (historyIdx !== -1) {
                    targetCase.aidHistory[historyIdx] = { ...record };
                } else {
                    targetCase.aidHistory.push({ ...record });
                }

                // Automatically update main case fields to reflect the newest disbursement
                targetCase.amount = amount;
                targetCase.source = category;
                // Optional: update date to reflect newest aid date?
                // targetCase.date = date;
            }

            saveData();
            renderPage('expenses');
        } else {
            alert('يرجى اختيار اسم المستفيد والمبلغ/الكمية');
        }
    };

    window.prepareEditAid = (id) => {
        const e = appData.expenses.find(item => item.id === id);
        if (!e) return;
        editingAidId = id;

        document.getElementById('aid-date').value = e.date || '';
        document.getElementById('aid-beneficiary-search').value = e.beneficiary || '';
        document.getElementById('aid-beneficiary').value = e.beneficiary || '';
        document.getElementById('aid-national-id').value = e.nationalId || '';
        document.getElementById('aid-amount').value = e.amount || '';
        document.getElementById('aid-category').value = e.category || '';
        document.getElementById('aid-month').value = e.month || '';
        document.getElementById('aid-responsible').value = e.responsible || '';
        document.getElementById('aid-signature').value = e.signature || '';

        document.getElementById('save-aid-btn').innerHTML = '<i class="fas fa-save"></i> حفظ التعديل';
        document.getElementById('cancel-aid-edit').style.display = 'inline-block';
    };

    window.cancelAidEdit = () => {
        editingAidId = null;
        renderPage('expenses');
    };

    window.autoFillNationalId = (name) => {
        const foundCase = appData.cases.find(c => c.name === name);
        const idInput = document.getElementById('aid-national-id');
        if (foundCase && idInput) {
            idInput.value = foundCase.nationalId || '';
        } else if (idInput) {
            idInput.value = '';
        }
    };

    window.filterAidBeneficiaries = (val) => {
        const resultsDiv = document.getElementById('aid-dropdown-results');
        const query = val.toLowerCase();
        const matches = appData.cases.filter(c =>
            c.name.toLowerCase().includes(query) ||
            (c.nationalId && c.nationalId.includes(query))
        ).slice(0, 50); // Limit to top 50 for performance

        if (matches.length > 0) {
            resultsDiv.innerHTML = matches.map(c => `
                <div class="dropdown-item" onclick="selectAidBeneficiary('${c.name}', '${c.nationalId || ''}')">
                    <strong>${c.name}</strong>
                    <span>الرقم القومي: ${c.nationalId || '-'}</span>
                </div>
            `).join('');
            resultsDiv.style.display = 'block';
        } else {
            resultsDiv.style.display = 'none';
        }
    };

    window.selectAidBeneficiary = (name, nationalId) => {
        document.getElementById('aid-beneficiary-search').value = name;
        document.getElementById('aid-beneficiary').value = name;
        document.getElementById('aid-national-id').value = nationalId;
        document.getElementById('aid-dropdown-results').style.display = 'none';
    };

    window.toggleDonationMode = () => {
        const mode = document.querySelector('input[name="donation-mode"]:checked').value;
        const autoSection = document.getElementById('auto-donation-section');
        const sponsorSection = document.getElementById('sponsor-donation-section');

        if (mode === 'auto') {
            autoSection.style.display = 'block';
            sponsorSection.style.display = 'none';
        } else {
            autoSection.style.display = 'none';
            sponsorSection.style.display = 'block';
        }
    };

    window.filterSponsorCases = (val) => {
        const resultsDiv = document.getElementById('sponsor-case-results');
        const query = val.toLowerCase();
        if (!query) {
            resultsDiv.style.display = 'none';
            return;
        }
        const matches = appData.cases.filter(c =>
            !c.hidden && (
                c.name.toLowerCase().includes(query) ||
                (c.searchNumber && c.searchNumber.toString().includes(query)) ||
                (c.nationalId && c.nationalId.includes(query))
            )
        ).slice(0, 10);

        if (matches.length > 0) {
            resultsDiv.innerHTML = matches.map(c => `
                <div class="dropdown-item" onclick="selectSponsorCase(${c.id}, '${c.name.replace(/'/g, "\\'")}')">
                    <strong>${c.name}</strong>
                    <span>رقم البحث: ${c.searchNumber || '-'} | الرقم القومي: ${c.nationalId || '-'}</span>
                </div>
            `).join('');
            resultsDiv.style.display = 'block';
        } else {
            resultsDiv.style.display = 'none';
        }
    };

    window.selectSponsorCase = (id, name) => {
        if (!selectedSponsorCases.find(c => c.id === id)) {
            selectedSponsorCases.push({ id, name });
            updateSelectedSponsorCasesUI();
        }
        document.getElementById('sponsor-case-search').value = '';
        document.getElementById('sponsor-case-results').style.display = 'none';
    };

    window.removeSponsorCase = (id) => {
        selectedSponsorCases = selectedSponsorCases.filter(c => c.id !== id);
        updateSelectedSponsorCasesUI();
    };

    window.updateSelectedSponsorCasesUI = () => {
        const container = document.getElementById('selected-sponsor-cases');
        if (!container) return;
        if (selectedSponsorCases.length === 0) {
            container.innerHTML = '<p style="color: #94a3b8; font-size: 0.85rem; width: 100%; text-align: center;">لم يتم اختيار حالات بعد</p>';
            return;
        }
        container.innerHTML = selectedSponsorCases.map(c => `
            <div style="background: #eff6ff; color: #1e40af; padding: 5px 12px; border-radius: 20px; border: 1px solid #bfdbfe; display: flex; align-items: center; gap: 8px; font-size: 0.9rem; font-weight: 600;">
                <span>${c.name}</span>
                <i class="fas fa-times-circle" style="cursor: pointer; color: #ef4444;" onclick="removeSponsorCase(${c.id})"></i>
            </div>
        `).join('');
    };

    window.searchExistingCases = (field, val) => {
        const fieldMap = {
            'name': 'case-name-results',
            'nationalId': 'case-id-results',
            'phone': 'case-phone-results',
            'spouseName': 'case-spouse-name-results',
            'spouseId': 'case-spouse-id-results',
            'spousePhone': 'case-spouse-phone-results'
        };
        const resultsDiv = document.getElementById(fieldMap[field]);
        if (!val || val.length < 1) {
            if (resultsDiv) resultsDiv.style.display = 'none';
            return;
        }

        const query = val.toLowerCase();
        const queryNormalized = window.normalizeArabic(val);

        // Cross-search for similar data to prevent duplicates
        let matches = appData.cases.filter(c => {
            // Check current field
            const valCheck = (c[field] && c[field].toString().toLowerCase().includes(query));

            // Name/Spouse Name Cross-Check
            if (field === 'name' || field === 'spouseName') {
                return (c.name && c.name.toLowerCase().includes(query)) || (c.spouseName && c.spouseName.toLowerCase().includes(query));
            }

            // ID/Spouse ID Cross-Check
            if (field === 'nationalId' || field === 'spouseId') {
                return (c.nationalId && c.nationalId.includes(query)) || (c.spouseId && c.spouseId.includes(query));
            }

            // Phone/Spouse Phone Cross-Check (Requested: show all results for any phone field)
            if (field === 'phone' || field === 'spousePhone') {
                return (c.phone && c.phone.includes(query)) || (c.spousePhone && c.spousePhone.includes(query));
            }

            return valCheck;
        }).map(c => ({ ...c, matchType: 'حالة مسجلة' }));

        // Search in Affidavits too
        const affMatches = (appData.affidavits || []).filter(aff => {
            const husbandVal = aff.husName || '';
            const husbandId = aff.husId || '';
            const husbandPhone = aff.husPhone || '';
            const wifeVal = aff.wifeName || '';
            const wifeId = aff.wifeId || '';
            const wifePhone = aff.wifePhone || '';

            if (field === 'name' || field === 'spouseName') {
                return window.normalizeArabic(husbandVal).includes(queryNormalized) || window.normalizeArabic(wifeVal).includes(queryNormalized);
            }
            if (field === 'nationalId' || field === 'spouseId') {
                return husbandId.includes(query) || wifeId.includes(query);
            }
            if (field === 'phone' || field === 'spousePhone') {
                return husbandPhone.includes(query) || wifePhone.includes(query);
            }
            return false;
        }).map(aff => ({
            name: `${aff.husName} / ${aff.wifeName}`,
            nationalId: aff.husId || aff.wifeId,
            address: 'سجل الإفادات',
            phone: aff.husPhone || aff.wifePhone,
            matchType: 'إفادة سابقة'
        }));

        const allMatches = [...matches, ...affMatches].slice(0, 10);

        if (allMatches.length > 0) {
            resultsDiv.innerHTML = `<div style="padding: 10px; background: #fff1f0; border-bottom: 1px solid #ffa39e; font-size: 0.8rem; color: #cf1322; font-weight: bold;">⚠️ تنبيه: بيانات مشابهة مسجلة في:</div>` +
                allMatches.map(c => `
                <div class="dropdown-item" style="border-right: 3px solid ${c.matchType === 'إفادة سابقة' ? '#faad14' : '#f5222d'};">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong>${c.name}</strong>
                        <span style="font-size: 0.7rem; background: ${c.matchType === 'إفادة سابقة' ? '#fff7e6' : '#fff1f0'}; color: ${c.matchType === 'إفادة سابقة' ? '#d46b08' : '#cf1322'}; padding: 2px 5px; border-radius: 4px;">${c.matchType}</span>
                    </div>
                    <span style="font-size: 0.75rem; color: #666;">القومي: ${c.nationalId || '-'} | العنوان: ${c.address || '-'} | الهاتف: ${c.phone || '-'}</span>
                </div>
            `).join('');
            resultsDiv.style.display = 'block';
        } else {
            resultsDiv.style.display = 'none';
        }
    };

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const aidDrop = document.getElementById('aid-dropdown-results');
        const nameDrop = document.getElementById('case-name-results');
        const idDrop = document.getElementById('case-id-results');

        if (aidDrop && !aidDrop.contains(e.target) && e.target.id !== 'aid-beneficiary-search') aidDrop.style.display = 'none';
        const donorDrop = document.getElementById('donor-dropdown-results');
        if (donorDrop && !donorDrop.contains(e.target) && e.target.id !== 'donor-name') donorDrop.style.display = 'none';
        if (nameDrop && !nameDrop.contains(e.target) && e.target.id !== 'modal-case-name') nameDrop.style.display = 'none';
        if (idDrop && !idDrop.contains(e.target) && e.target.id !== 'modal-case-national-id') idDrop.style.display = 'none';
    });

    window.addNewExpense = () => { // Keep for backward compatibility if needed, but the UI calls addNewAidRecord
        const type = document.getElementById('expense-type') ? document.getElementById('expense-type').value : '';
        const amount = document.getElementById('expense-amount') ? parseFloat(document.getElementById('expense-amount').value) : 0;
        const date = document.getElementById('expense-date') ? document.getElementById('expense-date').value : new Date().toISOString().split('T')[0];

        if (type && amount) {
            if (!appData.expenses) appData.expenses = [];
            appData.expenses.push({
                id: Date.now(),
                date,
                type,
                amount,
                beneficiary: type // Map old 'type' to 'beneficiary' text
            });
            saveData();
            renderPage('expenses');
        }
    };

    window.deleteExpense = (id) => {
        const pass = prompt('يرجى إدخال كلمة سر الحذف:');
        if (pass !== '1111') {
            if (pass !== null) alert('كلمة السر خاطئة!');
            return;
        }
        if (confirm('هل أنت متأكد من حذف هذا المصروف؟')) {
            // Remove from global expenses
            appData.expenses = appData.expenses.filter(e => e.id !== id);

            // Also clean up from any case's aidHistory
            appData.cases.forEach(c => {
                if (c.aidHistory) {
                    c.aidHistory = c.aidHistory.filter(h => h.id !== id);
                }
            });

            saveData();
            renderPage('expenses');
        }
    };

    window.addNewVolunteer = () => {
        const name = document.getElementById('volunteer-name').value.trim();
        const phone = document.getElementById('volunteer-phone').value.trim();
        const address = document.getElementById('volunteer-address').value.trim();
        const note = document.getElementById('volunteer-note').value.trim();

        if (name) {
            if (!appData.volunteers) appData.volunteers = [];
            appData.volunteers.push({
                id: Date.now(),
                name,
                phone,
                address,
                note
            });
            saveData();
            renderPage('volunteers');
        } else {
            alert('يرجى إدخال اسم المتطوع');
        }
    };

    window.deleteVolunteer = (id) => {
        const pass = prompt('يرجى إدخال كلمة سر الحذف:');
        if (pass !== '1111') {
            if (pass !== null) alert('كلمة السر خاطئة!');
            return;
        }
        if (confirm('هل أنت متأكد من حذف هذا المتطوع؟')) {
            appData.volunteers = appData.volunteers.filter(v => v.id !== id);
            saveData();
            renderPage('volunteers');
        }
    };

    // Initial Render
    renderPage('dashboard');

    // --- LOGIN LOGIC ---
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    const loginBtn = document.getElementById('login-btn');
    const passwordInput = document.getElementById('password-input');
    const loginError = document.getElementById('login-error');
    const APP_PASSWORD = '010qwe';

    function attemptLogin() {
        if (passwordInput.value === APP_PASSWORD) {
            loginScreen.style.display = 'none';
            mainApp.style.display = 'flex';
            renderPage('dashboard');
        } else {
            loginError.style.display = 'block';
            passwordInput.style.borderColor = '#d13438';
            passwordInput.value = '';
        }
    }

    if (loginBtn) loginBtn.addEventListener('click', attemptLogin);
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') attemptLogin();
        });
    }

    // --- MEMBER MODAL ACTIONS ---
    window.openMemberModal = (id, name) => {
        document.getElementById('target-case-id').value = id;
        document.getElementById('target-case-name').innerText = name;
        document.getElementById('member-modal').style.display = 'flex';
    };

    window.closeMemberModal = () => {
        document.getElementById('member-modal').style.display = 'none';
        const modal = document.getElementById('member-modal');
        modal.querySelectorAll('input').forEach(i => i.value = '');
    };

    window.saveMemberToCase = () => {
        const caseId = parseInt(document.getElementById('target-case-id').value);
        const name = document.getElementById('modal-member-name').value;
        const idNo = document.getElementById('modal-member-id').value;
        const relation = document.getElementById('modal-member-relation').value;
        const age = document.getElementById('modal-member-age').value;
        const job = document.getElementById('modal-member-job').value;

        if (name) {
            const caseIndex = appData.cases.findIndex(c => c.id === caseId);
            if (caseIndex !== -1) {
                if (!appData.cases[caseIndex].members) appData.cases[caseIndex].members = [];
                appData.cases[caseIndex].members.push({
                    name, idNo, relation, age, job
                });
                saveData();
                closeMemberModal();
                renderPage('cases');
            }
        } else {
            alert('يرجى إدخال اسم الفرد');
        }
    };

    window.toggleFamilyMembers = (id) => {
        const row = document.getElementById(`members-of-${id}`);
        const icon = document.getElementById(`icon-${id}`);
        if (row && row.style.display === 'none') {
            row.style.display = 'table-row';
            expandedCaseId = id;
            if (icon) icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
        } else if (row) {
            row.style.display = 'none';
            expandedCaseId = null;
            if (icon) icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
        }
    };

    window.openImageViewer = (url) => {
        const viewer = document.getElementById('image-viewer');
        const img = document.getElementById('full-image');
        img.src = url;
        viewer.style.display = 'flex';
    };

    window.closeImageViewer = () => {
        document.getElementById('image-viewer').style.display = 'none';
    };

    window.manualImagePath = (id, type) => {
        const path = prompt('أدخل اسم الصورة الموجودة في المجلد (مثلاً: case1.jpg):');
        if (path) {
            const index = appData.cases.findIndex(c => c.id === id);
            if (index !== -1) {
                if (type === 'photo') appData.cases[index].photoUrl = path;
                else appData.cases[index].idCardUrl = path;
                saveData();
                renderPage('cases');
            }
        }
    };

    window.removeImage = (caseId, type) => {
        if (event) event.stopPropagation();
        if (confirm('هل أنت متأكد من مسح ارتباط هذه الصورة؟')) {
            const index = appData.cases.findIndex(c => c.id === caseId);
            if (index !== -1) {
                if (type === 'photo') delete appData.cases[index].photoUrl;
                else delete appData.cases[index].idCardUrl;
                saveData();
                renderPage('cases');
            }
        }
    };


    window.removeCaseDoc = (caseId, docIndex) => {
        if (event) event.stopPropagation();
        if (confirm('هل أنت متأكد من حذف هذه الوثيقة؟')) {
            const index = appData.cases.findIndex(c => c.id === caseId);
            if (index !== -1 && appData.cases[index].docs) {
                appData.cases[index].docs.splice(docIndex, 1);
                saveData();
                renderPage('cases');
            }
        }
    };

    // --- UPLOAD LOGIC ---
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    let currentUploadCaseId = null;
    let currentUploadType = null;

    window.triggerUpload = (id, type) => {
        currentUploadCaseId = id;
        currentUploadType = type;
        fileInput.click();
    };

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file || !currentUploadCaseId) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target.result;
            const caseIndex = appData.cases.findIndex(c => c.id === currentUploadCaseId);
            if (caseIndex !== -1) {
                if (currentUploadType === 'photo') appData.cases[caseIndex].photoUrl = dataUrl;
                else appData.cases[caseIndex].idCardUrl = dataUrl;

                saveData();
                renderPage('cases');
            }
        };
        reader.readAsDataURL(file);
        fileInput.value = '';
    });

    // --- AGE CALCULATION LOGIC (Egyptian National ID) ---
    window.calculateAgeFromID = (nationalId) => {
        if (!nationalId || nationalId.length < 7) return null;

        try {
            const centuryDigit = parseInt(nationalId.substring(0, 1));
            const yearPart = nationalId.substring(1, 3);
            const monthPart = parseInt(nationalId.substring(3, 5));
            const dayPart = parseInt(nationalId.substring(5, 7));

            let yearPrefix = "19";
            if (centuryDigit === 3) yearPrefix = "20";
            else if (centuryDigit === 2) yearPrefix = "19";

            const birthYear = parseInt(yearPrefix + yearPart);
            const birthMonth = monthPart - 1; // JS months are 0-11
            const birthDay = dayPart;

            const birthDate = new Date(birthYear, birthMonth, birthDay);
            const today = new Date(2026, 0, 20); // Jan 20, 2026

            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            return age >= 0 ? age : null;
        } catch (e) {
            return null;
        }
    };

    // --- GLOBAL SEARCH LOGIC ---
    window.currentSearchFilter = '';
    const globalSearch = document.getElementById('global-search');
    const AVAILABLE_CATEGORIES = [
        "المرضى", "زواج متعسر", "الغارمين", "الأيتام", "مستفيدي صك الخير",
        "مستفيدي خدمات", "مستفيدي المشاريع", "مستفيدي رمضان", "مستفيدي مدارس",
        "مستفيدي زكاة المال", "مستفيدي ملابس الأعياد", "مستفيدي الصدقات"
    ];

    if (globalSearch) {
        globalSearch.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            window.currentSearchFilter = val;

            if (val === '') {
                document.getElementById('global-search-results').style.display = 'none';
                renderPage('dashboard');
                return;
            }

            // Show matching results in dropdown
            window.performGlobalSearch(val);

            // Also render search page if user hits enter or as they type (depending on preference)
            // For now, keep the dropdown as the primary interaction for 'Show Patients'
        });

        globalSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const val = e.target.value.trim();
                if (val) {
                    renderSearchPage(val);
                    document.getElementById('global-search-results').style.display = 'none';
                    sidebarItems.forEach(i => i.classList.remove('active'));
                }
            }
        });
    }

    function renderSearchPage(query) {
        const q = query.toLowerCase();
        pageTitle.innerText = `نتائج البحث الشامل عن: "${query}"`;

        const ageMatch = window.calculateAgeFromID(query);
        const ageInfo = ageMatch !== null ? `<div class="status-badge" style="background: #fff1f0; color: #cf1322; font-weight: bold; font-size: 1rem; margin-bottom: 20px;">السن المقدر من الرقم القومي: ${ageMatch} سنة</div>` : '';

        window.searchByResearchNumber = (val) => {
            if (!val) return;
            // Removed auto-trigger on input to allow multi-digit IDs
        };

        const searchNumInput = document.getElementById('search-number-input');
        if (searchNumInput) {
            searchNumInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const val = e.target.value.trim();
                    const c = appData.cases.find(item => item.searchNumber && item.searchNumber.toString() === val);
                    if (c) {
                        window.openDetailsModal(c.id);
                        e.target.value = '';
                    } else {
                        alert('لم يتم العثور على حالة بهذا الرقم');
                    }
                }
            });
        }

        window.showCaseDetails = (id) => window.openDetailsModal(id);

        // Filter Cases
        const matchesCases = appData.cases.filter(c =>
            c.name.toLowerCase().includes(q) ||
            (c.nationalId && c.nationalId.includes(q)) ||
            (c.phone && c.phone.includes(q)) ||
            (c.searchNumber && c.searchNumber.toString().includes(q)) ||
            (c.type && c.type.toLowerCase().includes(q))
        );

        // Filter Donations
        const matchesDonations = appData.donations.filter(d =>
            d.donor.toLowerCase().includes(q) ||
            d.type.toLowerCase().includes(q)
        );

        // Filter Aid/Expenses
        const matchesAid = (appData.expenses || []).filter(e =>
            e.beneficiary.toLowerCase().includes(q) ||
            (e.nationalId && e.nationalId.includes(q)) ||
            (e.category && e.category.toLowerCase().includes(q))
        );

        // Filter Affidavits
        const matchesAffidavits = (appData.affidavits || []).filter(aff =>
            (aff.husName && aff.husName.toLowerCase().includes(q)) ||
            (aff.husId && aff.husId.includes(q)) ||
            (aff.husPhone && aff.husPhone.includes(q)) ||
            (aff.wifeName && aff.wifeName.toLowerCase().includes(q)) ||
            (aff.wifeId && aff.wifeId.includes(q)) ||
            (aff.wifePhone && aff.wifePhone.includes(q))
        );

        let html = `
            <div class="card">
                ${ageInfo}
                <div class="card-header">
                    <h2><i class="fas fa-users"></i> الحالات المطابقة (${matchesCases.length})</h2>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr><th>الاسم</th><th>الرقم القومي</th><th>العمر التقديري</th><th>الحالة</th><th>الإجراءات</th></tr>
                        </thead>
                        <tbody>
                            ${[...matchesCases].sort((a, b) => window.normalizeArabic(a.name).localeCompare(window.normalizeArabic(b.name), 'ar')).map(c => {
            const age = window.calculateAgeFromID(c.nationalId);
            return `
                                <tr>
                                    <td style="font-weight:700; white-space: nowrap;">${c.name}</td>
                                    <td>${c.nationalId || '-'}</td>
                                    <td style="color:#217346; font-weight:bold;">${age !== null ? age + ' سنة' : '-'}</td>
                                    <td>${c.socialStatus || '-'}</td>
                                    <td><button class="btn-primary" style="font-size:0.7rem; padding:5px 10px;" onclick="showCaseDetails(${c.id})">عرض</button></td>
                                </tr>`;
        }).join('')}
                            ${matchesCases.length === 0 ? '<tr><td colspan="5" style="text-align:center; color:#999;">لا توجد حالات مطابقة</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card" style="margin-top: 20px;">
                <div class="card-header">
                    <h2><i class="fas fa-donate"></i> التبرعات المطابقة (${matchesDonations.length})</h2>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr><th>التاريخ</th><th>المتبرع</th><th>المبلغ</th><th>البيان</th></tr>
                        </thead>
                        <tbody>
                            ${[...matchesDonations].sort((a, b) => window.normalizeArabic(a.donor).localeCompare(window.normalizeArabic(b.donor), 'ar')).map(d => `
                                <tr>
                                    <td>${d.date}</td>
                                    <td style="font-weight:bold;">${d.donor}</td>
                                    <td style="color:#217346; font-weight:bold;">${d.amount} ج.م</td>
                                    <td>${d.type}</td>
                                </tr>
                            `).join('')}
                            ${matchesDonations.length === 0 ? '<tr><td colspan="4" style="text-align:center; color:#999;">لا توجد تبرعات مطابقة</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card" style="margin-top: 20px;">
                <div class="card-header">
                    <h2><i class="fas fa-hand-holding-heart"></i> المساعدات المطابقة (${matchesAid.length})</h2>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr><th>التاريخ</th><th>المستفيد</th><th>المبلغ</th><th>الجهة</th><th>العمر التقديري</th></tr>
                        </thead>
                        <tbody>
                            ${[...matchesAid].sort((a, b) => window.normalizeArabic(a.beneficiary).localeCompare(window.normalizeArabic(b.beneficiary), 'ar')).map(e => {
            const age = window.calculateAgeFromID(e.nationalId);
            return `
                                <tr>
                                    <td>${e.date}</td>
                                    <td style="font-weight:bold;">${e.beneficiary}</td>
                                    <td style="color:#cf1322; font-weight:bold;">${e.amount}</td>
                                    <td>${e.category}</td>
                                    <td style="color:#217346; font-weight:bold;">${age !== null ? age + ' سنة' : '-'}</td>
                                </tr>`;
        }).join('')}
                            ${matchesAid.length === 0 ? '<tr><td colspan="5" style="text-align:center; color:#999;">لا توجد سجلات مساعدة مطابقة</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card" style="margin-top: 20px;">
                <div class="card-header">
                    <h2><i class="fas fa-file-invoice"></i> الإفادات المطابقة (${matchesAffidavits.length})</h2>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr><th>التاريخ</th><th>اسم الزوج</th><th>اسم الزوجة</th><th>الإجراءات</th></tr>
                        </thead>
                        <tbody>
                            ${[...matchesAffidavits].sort((a, b) => b.id - a.id).map(aff => `
                                <tr>
                                    <td>${aff.date}</td>
                                    <td style="font-weight:bold;">${aff.husName}</td>
                                    <td style="font-weight:bold;">${aff.wifeName}</td>
                                    <td><button class="btn-primary" style="font-size:0.7rem; padding:5px 10px;" onclick="printSavedAffidavit(${aff.id})">عرض وطباعة</button></td>
                                </tr>
                            `).join('')}
                            ${matchesAffidavits.length === 0 ? '<tr><td colspan="4" style="text-align:center; color:#999;">لا توجد إفادات مطابقة</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        contentArea.innerHTML = html;
    }

    window.generateReport = () => {
        const type = document.getElementById('report-type').value;
        const fromDate = document.getElementById('report-from').value;
        const toDate = document.getElementById('report-to').value;
        const fromIdxInput = document.getElementById('report-from-idx').value;
        const toIdxInput = document.getElementById('report-to-idx').value;

        const fromIdx = parseInt(fromIdxInput) || 1;
        const toIdx = parseInt(toIdxInput) || 999999;

        const resultsContainer = document.getElementById('report-results-container');
        const reportArea = document.getElementById('printable-report-area');

        // Validation: Require either indices or dates
        if (!fromDate && !toDate && !fromIdxInput && !toIdxInput) {
            alert('يرجى تحديد الفترة الزمنية أو نطاق المسلسل (م) لاستخراج التقرير');
            return;
        }

        const dateFilterStr = (fromDate || toDate) ? `في الفترة من ${fromDate || 'البداية'} إلى ${toDate || 'النهاية'} ` : 'لكامل السجل';

        let rawData = [];
        let title = "";
        let total = 0;

        if (type === 'donations') {
            title = `تقرير التبرعات الواردة ${dateFilterStr} (من م ${fromIdx} إلى ${toIdx})`;
            rawData = [...appData.donations]
                .sort((a, b) => window.normalizeArabic(a.donor).localeCompare(window.normalizeArabic(b.donor), 'ar'))
                .filter(d => {
                    if (fromDate && toDate) return d.date >= fromDate && d.date <= toDate;
                    if (fromDate) return d.date >= fromDate;
                    if (toDate) return d.date <= toDate;
                    return true;
                });

            const dataSlice = rawData.slice(fromIdx - 1, toIdx);
            total = dataSlice.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

            reportArea.innerHTML = `
                <div style="font-family: 'Cairo', sans-serif; direction: rtl; padding: 20px; border: 1px solid #333;">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #217346; padding-bottom: 15px; margin-bottom: 20px;">
                        <div style="text-align: right;">
                            <h2 style="color: #217346; margin: 0;">جمعية الخير لتنمية المجتمع بمسير</h2>
                            <p style="margin: 0; font-size: 0.85rem; font-weight: 600;">مشهرة برقم 1899 لسنة 2012</p>
                        </div>
                        <img src="logo.png" style="height: 60px;">
                    </div>
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h3>${title}</h3>
                    </div>
                    <table style="width: 100%; border-collapse: collapse; text-align: center;">
                        <thead>
                            <tr style="background: #217346; color: white;">
                                <th style="padding: 10px; border: 1px solid #333;">م</th>
                                <th style="padding: 10px; border: 1px solid #333;">التاريخ</th>
                                <th style="padding: 10px; border: 1px solid #333;">الاسم</th>
                                <th style="padding: 10px; border: 1px solid #333;">المبلغ</th>
                                <th style="padding: 10px; border: 1px solid #333;">البيان</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${dataSlice.map((d, i) => `
                                <tr>
                                    <td style="padding: 8px; border: 1px solid #ccc;">${fromIdx + i}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc;">${d.date}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc;">${d.donor}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc; font-weight: bold;">${parseFloat(d.amount).toLocaleString()} ج.م</td>
                                    <td style="padding: 8px; border: 1px solid #ccc;">${d.type}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr style="background: #eee;">
                                <td colspan="3" style="padding: 10px; border: 1px solid #333; font-weight: bold;">الإجمالي للعدد المختار</td>
                                <td colspan="2" style="padding: 10px; border: 1px solid #333; font-weight: bold; color: #d13438; font-size: 1.2rem;">${total.toLocaleString()} ج.م</td>
                            </tr>
                        </tfoot>
                    </table>
                    <div style="margin-top: 30px; display: flex; justify-content: space-between;">
                        <p>توقيع مسؤول العهدة / .....................</p>
                        <p>توقيع رئيس الجمعية / .....................</p>
                    </div>
                </div>
            `;
        } else if (type === 'aid') {
            title = `تقرير المساعدات المنصرفة ${dateFilterStr} (من م ${fromIdx} إلى ${toIdx})`;
            rawData = [...(appData.expenses || [])]
                .sort((a, b) => window.normalizeArabic(a.beneficiary).localeCompare(window.normalizeArabic(b.beneficiary), 'ar'))
                .filter(e => {
                    if (fromDate && toDate) return e.date >= fromDate && e.date <= toDate;
                    if (fromDate) return e.date >= fromDate;
                    if (toDate) return e.date <= toDate;
                    return true;
                });

            const dataSlice = rawData.slice(fromIdx - 1, toIdx);
            total = dataSlice.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

            reportArea.innerHTML = `
                <div style="font-family: 'Cairo', sans-serif; direction: rtl; padding: 20px; border: 1px solid #333;">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #217346; padding-bottom: 15px; margin-bottom: 20px;">
                        <div style="text-align: right;">
                            <h2 style="color: #217346; margin: 0;">جمعية الخير لتنمية المجتمع بمسير</h2>
                            <p style="margin: 0; font-size: 0.85rem; font-weight: 600;">مشهرة برقم 1899 لسنة 2012</p>
                        </div>
                        <img src="logo.png" style="height: 60px;">
                    </div>
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h3>${title}</h3>
                    </div>
                    <table style="width: 100%; border-collapse: collapse; text-align: center;">
                        <thead>
                            <tr style="background: #217346; color: white;">
                                <th style="padding: 10px; border: 1px solid #333;">م</th>
                                <th style="padding: 10px; border: 1px solid #333;">التاريخ</th>
                                <th style="padding: 10px; border: 1px solid #333;">المستفيد</th>
                                <th style="padding: 10px; border: 1px solid #333;">المبلغ/الكمية</th>
                                <th style="padding: 10px; border: 1px solid #333;">جهة التبرع</th>
                                <th style="padding: 10px; border: 1px solid #333;">المسؤول</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${dataSlice.map((e, i) => `
                                <tr>
                                    <td style="padding: 8px; border: 1px solid #ccc;">${fromIdx + i}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc;">${e.date}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc;">${e.beneficiary}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc; font-weight: bold;">${e.amount}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc;">${e.category}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc;">${e.responsible || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr style="background: #eee;">
                                <td colspan="3" style="padding: 10px; border: 1px solid #333; font-weight: bold;">إجمالي المبالغ المنصرفة المحددة</td>
                                <td colspan="3" style="padding: 10px; border: 1px solid #333; font-weight: bold; color: #d13438; font-size: 1.2rem;">${total.toLocaleString()} ج.م</td>
                            </tr>
                        </tfoot>
                    </table>
                    <div style="margin-top: 30px; display: flex; justify-content: space-between;">
                        <p>توقيع المسؤول / .....................</p>
                        <p>توقيع رئيس الجمعية / .....................</p>
                    </div>
                </div>
            `;
        } else if (type === 'cases') {
            title = `سجل الحالات المخطط لها ${dateFilterStr} (من م ${fromIdx} إلى ${toIdx})`;
            rawData = appData.cases
                .filter(c => {
                    let match = !c.hidden;
                    if (match && fromDate && toDate) match = c.date >= fromDate && c.date <= toDate;
                    else if (match && fromDate) match = c.date >= fromDate;
                    else if (match && toDate) match = c.date <= toDate;
                    return match;
                })
                .sort((a, b) => window.normalizeArabic(a.name).localeCompare(window.normalizeArabic(b.name), 'ar'));

            const dataSlice = rawData.slice(fromIdx - 1, toIdx);

            reportArea.innerHTML = `
    <div dir = "rtl" style = "font-family: 'Cairo', sans-serif; padding: 5mm; color: #000; width: 100%; box-sizing: border-box;" >
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 10px; height: 10vh;">
                        <div style="text-align: right; flex: 2; display: flex; align-items: center; gap: 15px;">
                            <img src="logo.png" style="height: 50px;">
                            <div>
                                <h2 style="margin: 0; font-size: 1.2rem; font-weight: 800;">جمعية الخير لتنمية المجتمع بمسير</h2>
                                <p style="margin: 0; font-size: 0.8rem; font-weight: 600;">مشهرة برقم 1899 لسنة 2012</p>
                                <p style="margin: 0; font-size: 0.8rem;">سجل رسمي - ${title}</p>
                            </div>
                        </div>
                        <div style="text-align: left; flex: 1;">
                            <p style="margin: 0; font-size: 0.8rem; font-weight: bold;">بتاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
                        </div>
                    </div>
                    <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 0.8rem; border: 1.5px solid #000;">
                        <thead>
                            <tr style="background: #f2f2f2; height: 35px;">
                                <th style="padding: 4px; border: 1px solid #000;">م</th>
                                <th style="padding: 4px; border: 1px solid #000;">المركز</th>
                                <th style="padding: 4px; border: 1px solid #000; width: 150px;">الاسم</th>
                                <th style="padding: 4px; border: 1px solid #000; width: 120px;">الرقم القومي</th>
                                <th style="padding: 4px; border: 1px solid #000;">المهنة</th>
                                <th style="padding: 4px; border: 1px solid #000;">الهاتف</th>
                                <th style="padding: 4px; border: 1px solid #000;">الزوج/ة</th>
                                <th style="padding: 4px; border: 1px solid #000;">الأفراد</th>
                                <th style="padding: 4px; border: 1px solid #000;">الوضع</th>
                                <th style="padding: 4px; border: 1px solid #000;">المبلغ</th>
                                <th style="padding: 4px; border: 1px solid #000;">العنوان</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${dataSlice.map((c, idx) => `
                                <tr style="height: 38px;">
                                    <td style="padding: 2px; border: 1px solid #000;">${fromIdx + idx}</td>
                                    <td style="padding: 2px; border: 1px solid #000;">${c.center || '-'}</td>
                                    <td style="padding: 2px 5px; border: 1px solid #000; text-align: right; font-weight: bold;">${c.name}</td>
                                    <td style="padding: 2px; border: 1px solid #000;">${c.nationalId || '-'}</td>
                                    <td style="padding: 2px; border: 1px solid #000;">${c.job || '-'}</td>
                                    <td style="padding: 2px; border: 1px solid #000;">${c.phone || '-'}</td>
                                    <td style="padding: 2px; border: 1px solid #000; font-size: 0.75rem;">${c.spouseName || '-'}</td>
                                    <td style="padding: 2px; border: 1px solid #000;">${c.familyMembers || '-'}</td>
                                    <td style="padding: 2px; border: 1px solid #000;">${c.socialStatus || '-'}</td>
                                    <td style="padding: 2px; border: 1px solid #000; font-weight: bold;">${c.amount || 0}</td>
                                    <td style="padding: 2px; border: 1px solid #000; font-size: 0.75rem;">${c.address || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div style="margin-top: 20px; display: flex; justify-content: space-between; font-weight: bold; font-size: 0.9rem;">
                        <p>توقيع الموظف المختص: .....................</p>
                        <p>يعتمد: رئيس الجمعية</p>
                    </div>
                </div>
    `;
        }

        resultsContainer.style.display = 'block';
    };

    window.printReport = () => {
        const content = document.getElementById('printable-report-area').innerHTML;
        const type = document.getElementById('report-type').value;
        const orientation = (type === 'cases') ? 'landscape' : 'portrait';

        localStorage.setItem('printPayload', content);
        localStorage.setItem('printType', orientation);

        window.open('print.html', '_blank');
    };

    window.clearSearch = () => {
        window.currentSearchFilter = '';
        if (globalSearch) globalSearch.value = '';
        renderPage('cases');
    };

    window.renderPage = renderPage;

    // --- ARCHIVE / HIDE LOGIC ---
    window.hideCase = (id) => {
        const index = appData.cases.findIndex(c => c.id === id);
        if (index !== -1) {
            appData.cases[index].hidden = true;
            saveData();
            renderPage('cases');
        }
    };

    window.restoreCase = (id) => {
        const index = appData.cases.findIndex(c => c.id === id);
        if (index !== -1) {
            appData.cases[index].hidden = false;
            saveData();
            renderPage('hidden');
        }
    };

    // --- CASE DETAILS & PRINT LOGIC ---
    window.openDetailsModal = (id) => {
        const c = appData.cases.find(item => item.id === id);
        if (!c) return;

        const members = c.members || [];
        const content = `
    <div dir = "rtl" style = "font-family: 'Cairo', sans-serif; color: #333; max-width: 900px; margin: 0 auto; padding: 10mm; background: #fff; min-height: 290mm; display: flex; flex-direction: column; box-sizing: border-box;" >
                
                <!--Compact Header-->
                <div style="display: flex; justify-content: space-between; align-items: start; border-bottom: 2.5px solid #217346; padding-bottom: 10px; margin-bottom: 20px; height: 10vh;">
                    <div style="text-align: right; flex: 2;">
                        <h1 style="color: #217346; margin: 0; font-size: 1.4rem; font-weight: 800;">جمعية الخير لتنمية المجتمع بمسير</h1>
                        <p style="margin: 0; font-size: 0.85rem; font-weight: 600;">مشهرة برقم 1899 لسنة 2012</p>
                    </div>
                    <div style="flex: 1; text-align: center;">
                         <img src="logo.png" style="height: 70px;">
                    </div>
                    <div style="flex: 1; text-align: left;">
                         <div style="border: 1px solid #000; padding: 10px; font-weight: bold; font-size: 0.75rem; text-align: center; border-radius: 4px;">ختم الجمعية</div>
                    </div>
                </div>

                <div style="text-align: center; margin-bottom: 20px; position: relative;">
                    <h2 style="display: inline-block; background: #f0f7f2; color: #217346; padding: 5px 30px; border: 2px solid #217346; border-radius: 5px; font-size: 1.1rem; font-weight: 800;">استمارة بـحـث اجـتـمـاعـي</h2>
                    <div style="position: absolute; left: 0; top: 0; border: 2px solid #d13438; padding: 5px 15px; color: #d13438; font-weight: 800; border-radius: 4px;">رقم البحث: ${c.searchNumber || '-'}</div>
                </div>

                <!--Main Data Grid-->
                <div style="display: flex; gap: 30px; margin-bottom: 30px;">
                    <div style="flex: 1;">
                        <table style="width: 100%; border-collapse: separate; border-spacing: 0 12px;">
                            <tr>
                                <td style="width: 130px; font-weight: 800; color: #217346;"><i class="fas fa-user-tag"></i> اسـم الـحـالـة:</td>
                                <td style="border-bottom: 1px dashed #bbb; padding-bottom: 5px; font-size: 1.1rem; font-weight: 700; white-space: nowrap;">${c.name}</td>
                            </tr>
                            <tr>
                                <td style="font-weight: 800; color: #217346;"><i class="fas fa-id-card"></i> الرقم القومي:</td>
                                <td style="border-bottom: 1px dashed #bbb; padding-bottom: 5px;">${c.nationalId || '............................'}</td>
                            </tr>
                            <tr>
                                <td style="font-weight: 800; color: #217346;"><i class="fas fa-map-marker-alt"></i> الـعـنـــــوان:</td>
                                <td style="border-bottom: 1px dashed #bbb; padding-bottom: 5px;">${c.address || '............................'}</td>
                            </tr>
                            <tr>
                                <td style="font-weight: 800; color: #217346;"><i class="fas fa-phone-alt"></i> رقـم الهاتف:</td>
                                <td style="border-bottom: 1px dashed #bbb; padding-bottom: 5px;">${c.phone || '............................'}</td>
                            </tr>
                            <tr>
                                <td style="font-weight: 800; color: #217346;"><i class="fas fa-briefcase"></i> الـمـهـنـــــة:</td>
                                <td style="border-bottom: 1px dashed #bbb; padding-bottom: 5px;">${c.job || '............................'}</td>
                            </tr>
                        </table>
                    </div>
                    
                    <!-- Photos in Document -->
                    <div style="width: 160px; display: flex; flex-direction: column; gap: 20px;">
                        <div style="text-align: center;">
                            <div style="width: 140px; height: 160px; border: 2px solid #217346; border-radius: 8px; overflow: hidden; background: #f9f9f9; display: flex; align-items: center; justify-content: center; margin: auto;">
                                ${c.photoUrl ? `<img src="${c.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` : `<i class="fas fa-camera" style="font-size: 2.5rem; color: #eee;"></i>`}
                            </div>
                            <span style="font-size: 0.75rem; color: #666; margin-top: 5px; display: block;">صورة الحالة</span>
                        </div>
                    </div>
                </div>

                <!--Family & Status-->
                <div style="margin-bottom: 30px; background: #fcfcfc; padding: 20px; border-radius: 12px; border: 1px solid #eee;">
                    <h3 style="color: #217346; border-bottom: 2px solid #217346; display: inline-block; margin-bottom: 15px; font-size: 1rem;"><i class="fas fa-info-circle"></i> الحالة الاجتماعية والبيانات الزوجية</h3>
                    <table style="width: 100%; border-collapse: separate; border-spacing: 0 10px;">
                        <tr>
                            <td style="width: 140px; font-weight: 800;">اسم الزوج/ة:</td>
                            <td style="border-bottom: 1px solid #eee;">${c.spouseName || '............................'}</td>
                            <td style="width: 140px; font-weight: 800;">رقم قومي الزوج/ة:</td>
                            <td style="border-bottom: 1px solid #eee;">${c.spouseId || '............................'}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: 800;">الوضع الاجتماعي:</td>
                            <td style="border-bottom: 1px solid #eee;">${c.socialStatus || '............................'}</td>
                            <td style="font-weight: 800;">جهة التبرع:</td>
                            <td style="border-bottom: 1px solid #eee;">${c.source || '............................'}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: 800;">نوع المساعدة:</td>
                            <td style="border-bottom: 1px solid #eee;">${c.type || '............................'}</td>
                            <td style="font-weight: 800;">قيمة المساعدة:</td>
                            <td style="border-bottom: 1px solid #eee; font-weight: 800; color: #217346;">${c.amount || '0'} ج.م</td>
                        </tr>
                    </table>
                </div>

                <!--Family Members Table-->
                <div style="margin-bottom: 30px;">
                    <h3 style="color: #217346; margin-bottom: 10px; font-size: 1rem;"><i class="fas fa-users-cog"></i> بيان أفراد الأسرة</h3>
                    <table style="width: 100%; border-collapse: collapse; text-align: center; border: 1.5px solid #217346;">
                        <thead style="background: #217346; color: white;">
                            <tr>
                                <th style="padding: 10px; border: 1px solid #fff;">الاسم الكامل</th>
                                <th style="padding: 10px; border: 1px solid #fff;">درجة القرابة</th>
                                <th style="padding: 10px; border: 1px solid #fff;">السن</th>
                                <th style="padding: 10px; border: 1px solid #fff;">المهنة / الدراسة</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${members.length > 0 ? members.map(m => `
                                <tr>
                                    <td style="padding: 8px; border: 1px solid #217346;">${m.name}</td>
                                    <td style="padding: 8px; border: 1px solid #217346;">${m.relation}</td>
                                    <td style="padding: 8px; border: 1px solid #217346;">${m.age} سنة</td>
                                    <td style="padding: 8px; border: 1px solid #217346;">${m.job || '-'}</td>
                                </tr>
                            `).join('') : `
                                <tr><td colspan="4" style="padding: 20px; border: 1px solid #217346; color: #999;">لا يوجد أفراد مسجلين</td></tr>
                            `}
                        </tbody>
                    </table>
                </div>

                <!--Aid History-->
    <div style="margin-bottom: 40px;">
        <h3 style="color: #217346; margin-bottom: 10px; font-size: 1rem;"><i class="fas fa-history"></i> سجل آخر المساعدات المستلمة</h3>
        <table style="width: 100%; border-collapse: collapse; text-align: center; border: 1px solid #ccc;">
            <thead style="background: #f4f4f4;">
                <tr>
                    <th style="padding: 8px; border: 1px solid #ccc;">التاريخ</th>
                    <th style="padding: 8px; border: 1px solid #ccc;">البيان / النوع</th>
                    <th style="padding: 8px; border: 1px solid #ccc;">القيمة / الكمية</th>
                    <th style="padding: 8px; border: 1px solid #ccc;">التوقيع</th>
                </tr>
            </thead>
            <tbody>
                ${(c.aidHistory || []).slice(-4).map(h => `
                                <tr>
                                    <td style="padding: 8px; border: 1px solid #ccc;">${h.date}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc;">${h.category}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc; font-weight: 800;">${h.amount}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc; color: #eee; font-size: 0.6rem;">بصمة المستلم</td>
                                </tr>
                            `).join('')}
                ${!(c.aidHistory && c.aidHistory.length > 0) ? `<tr><td colspan="4" style="padding: 15px; border: 1px solid #ccc; color: #999;">لا يوجد سجل مصروفات لهذه الحالة</td></tr>` : ''}
            </tbody>
        </table>
    </div>

                ${(c.docs && c.docs.length > 0) ? `
                <!-- Additional Documents Section -->
                <div style="margin-top: 30px; border-top: 2px solid #217346; padding-top: 15px;">
                    <h3 style="color: #217346; font-size: 1rem; font-weight: 800; margin-bottom: 20px;"><i class="fas fa-images"></i> مرفقات ووثائق إضافية</h3>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                        ${c.docs.map(doc => `
                            <div style="border: 1px solid #eee; padding: 10px; border-radius: 8px; text-align: center;">
                                <img src="${doc}" style="width: 100%; max-height: 300px; object-fit: contain; border-radius: 4px;">
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''
            }


                <!--Footer Signatures-->
                <div style="margin-top: auto; display: flex; justify-content: space-between; padding: 20px 40px; border-top: 2px dashed #217346;">
                    <div style="text-align: center;">
                        <p style="font-weight: 800; margin-bottom: 50px;">توقيع الباحث الاجتماعي</p>
                        <p>...............................</p>
                    </div>
                    <div style="text-align: center;">
                        <p style="font-weight: 800; margin-bottom: 50px;">يعتمد،، مدير الجمعية</p>
                        <p>...............................</p>
                    </div>
                </div>

                <!--Stamp Area-->
    <div style="position: absolute; bottom: 80px; left: 45%; transform: translateX(-50%); width: 100px; height: 100px; border: 3px double rgba(33, 115, 70, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: rgba(33, 115, 70, 0.2); font-weight: 800; transform: rotate(-15deg);">
        خـتـم الـجـمـعـيـة
    </div>

            </div>
    `;
        document.getElementById('details-content').innerHTML = content;
        document.getElementById('details-modal').style.display = 'flex';
    };

    window.closeDetailsModal = () => {
        document.getElementById('details-modal').style.display = 'none';
    };

    window.printDiv = (divId) => {
        const content = document.getElementById(divId).innerHTML;

        localStorage.setItem('printPayload', content);
        localStorage.setItem('printType', 'portrait'); // Default for case details

        window.open('print.html', '_blank');
    };

    window.printCurrentView = () => {
        const contentArea = document.getElementById('content-area');
        if (!contentArea) return;

        const content = contentArea.innerHTML;
        const activeItem = document.querySelector('.sidebar-nav li.active');
        const isCasesPage = activeItem ? activeItem.getAttribute('data-page') === 'cases' : false;

        localStorage.setItem('printType', isCasesPage ? 'landscape' : 'portrait');
        localStorage.setItem('printPayload', content);
        window.open('print.html', '_blank');
    };

    // --- NEW: DONATION & LIST PRINT MODAL LOGIC ---
    window.openDonationPrintModal = (donationId = null) => {
        document.getElementById('print-target-donation-id').value = donationId || '';
        document.getElementById('donation-print-modal').style.display = 'flex'; // Changed to flex for consistency

        // Default dates to today
        const today = new Date().toISOString().split('T')[0];
        if (document.getElementById('print-from-date')) document.getElementById('print-from-date').value = today;
        if (document.getElementById('print-to-date')) document.getElementById('print-to-date').value = today;
        if (document.getElementById('report-print-date')) document.getElementById('report-print-date').value = today;

        window.togglePrintFields();
    };

    window.openClassificationPrintModal = () => {
        document.getElementById('print-selection-mode').value = 'classification';
        window.openDonationPrintModal();
    };

    window.closeDonationPrintModal = () => {
        document.getElementById('donation-print-modal').style.display = 'none';
    };

    window.togglePrintFields = () => {
        const template = document.getElementById('print-template-select').value;
        const mode = document.getElementById('print-selection-mode').value;
        const dateFields = document.getElementById('date-range-fields');
        const serialFields = document.getElementById('serial-range-fields');
        const manualFields = document.getElementById('manual-selection-fields');
        const classificationFields = document.getElementById('classification-selection-fields');
        const dynamicFields = document.getElementById('dynamic-print-fields');

        // Hide all initially
        dateFields.style.display = 'none';
        serialFields.style.display = 'none';
        manualFields.style.display = 'none';
        if (classificationFields) classificationFields.style.display = 'none';
        if (dynamicFields) dynamicFields.style.display = 'none';

        // Show dynamic fields for specific templates
        if (template === 'rawabit-list' || template === 'new-institution') {
            dynamicFields.style.display = 'block';
            const instInput = document.getElementById('print-institution-name');
            const instGroup = document.getElementById('institution-name-group');

            if (template === 'rawabit-list') {
                instInput.value = 'بوابتك للخير';
                instGroup.style.display = 'block';
            } else {
                instInput.value = '';
                instGroup.style.display = 'block';
            }
        }

        if (mode === 'date' || mode === 'reg-date') {
            dateFields.style.display = 'block';
        } else if (mode === 'serial' || mode === 'research-range') {
            serialFields.style.display = 'block';
            const labelFrom = document.getElementById('label-from-idx');
            const labelTo = document.getElementById('label-to-idx');
            if (mode === 'research-range') {
                labelFrom.innerText = 'من رقم بحث';
                labelTo.innerText = 'إلى رقم بحث';
            } else {
                labelFrom.innerText = 'من مسلسل (م)';
                labelTo.innerText = 'إلى مسلسل (م)';
            }
        } else if (mode === 'classification') {
            if (classificationFields) {
                classificationFields.style.display = 'block';
                renderClassificationSelection();
            }
        } else if (mode === 'manual') {
            manualFields.style.display = 'block';
            renderManualSelectionList();
        }
    };

    function renderClassificationSelection() {
        const select = document.getElementById('print-case-classification');
        if (!select) return;

        // Get all unique classifications from cases
        const allTypes = appData.cases.flatMap(c => (c.type || '').split(' - ')).filter(Boolean);
        const uniqueTypes = [...new Set(allTypes)].sort((a, b) => a.localeCompare(b, 'ar'));

        select.innerHTML = uniqueTypes.map(t => `<option value="${t}">${t}</option>`).join('');
    }

    function renderManualSelectionList() {
        const container = document.getElementById('manual-cases-list');
        if (!container) return;

        const sortedCases = [...appData.cases].sort((a, b) => window.normalizeArabic(a.name).localeCompare(window.normalizeArabic(b.name), 'ar'));
        container.innerHTML = sortedCases.map(c => `
    <div class="manual-case-item" style = "display: flex; align-items: center; padding: 5px; border-bottom: 1px solid #eee; font-size: 0.9rem;" >
        <input type="checkbox" class="manual-print-checkbox" value="${c.id}" onchange="updateSelectedCount()" style="margin-left: 10px;">
            <span class="case-number" style="width: 50px; color: #d13438; font-weight: bold; font-size: 0.75rem;">#${c.searchNumber || '-'}</span>
            <span class="case-name" style="flex: 1; text-align: right;">${c.name}</span>
            <span class="case-id" style="color: #666; font-size: 0.75rem;">${c.nationalId || '-'}</span>
        </div>
`).join('');
    }

    window.filterManualSelectionList = () => {
        const query = (document.getElementById('manual-search-input').value || '').toLowerCase();
        const items = document.querySelectorAll('.manual-case-item');
        items.forEach(item => {
            const name = item.querySelector('.case-name').innerText.toLowerCase();
            const id = item.querySelector('.case-id').innerText.toLowerCase();
            const num = item.querySelector('.case-number').innerText.toLowerCase();
            item.style.display = (name.includes(query) || id.includes(query) || num.includes(query)) ? 'flex' : 'none';
        });
    };

    window.updateSelectedCount = () => {
        const count = document.querySelectorAll('.manual-print-checkbox:checked').length;
        document.getElementById('selected-count').innerText = count;
    };

    window.proceedToPrintDonation = () => {
        const template = document.getElementById('print-template-select').value;
        const mode = document.getElementById('print-selection-mode').value;
        const donationId = document.getElementById('print-target-donation-id').value;

        let targetCases = [];

        if (mode === 'serial') {
            const fromIdx = parseInt(document.getElementById('print-from-idx').value) || 1;
            const toIdx = parseInt(document.getElementById('print-to-idx').value) || 99999;
            const sorted = [...appData.cases].sort((a, b) => window.normalizeArabic(a.name).localeCompare(window.normalizeArabic(b.name), 'ar'));
            targetCases = sorted.slice(fromIdx - 1, toIdx);
        } else if (mode === 'research-range') {
            const fromNum = parseInt(document.getElementById('print-from-idx').value);
            const toNum = parseInt(document.getElementById('print-to-idx').value);
            targetCases = appData.cases.filter(c => {
                const num = parseInt(c.searchNumber);
                if (isNaN(num)) return false;
                if (!isNaN(fromNum) && num < fromNum) return false;
                if (!isNaN(toNum) && num > toNum) return false;
                return true;
            }).sort((a, b) => (parseInt(a.searchNumber) || 0) - (parseInt(b.searchNumber) || 0));
        } else if (mode === 'date') {
            const fromDate = document.getElementById('print-from-date').value;
            const toDate = document.getElementById('print-to-date').value;
            // Filter cases who received aid in this range
            const recents = (appData.expenses || []).filter(e => {
                if (fromDate && toDate) return e.date >= fromDate && e.date <= toDate;
                if (fromDate) return e.date >= fromDate;
                if (toDate) return e.date <= toDate;
                return true;
            });
            const uniqueNames = [...new Set(recents.map(r => r.beneficiary))];
            targetCases = appData.cases.filter(c => uniqueNames.includes(c.name));
        } else if (mode === 'reg-date') {
            const fromDate = document.getElementById('print-from-date').value;
            const toDate = document.getElementById('print-to-date').value;
            targetCases = appData.cases.filter(c => {
                if (fromDate && toDate) return c.date >= fromDate && c.date <= toDate;
                if (fromDate) return c.date >= fromDate;
                if (toDate) return c.date <= toDate;
                return true;
            }).sort((a, b) => a.date.localeCompare(b.date));
        } else if (mode === 'classification') {
            const selectedClass = document.getElementById('print-case-classification').value;
            targetCases = appData.cases.filter(c => (c.type || '').includes(selectedClass));
        } else if (mode === 'manual') {
            const selectedIds = Array.from(document.querySelectorAll('.manual-print-checkbox:checked')).map(cb => cb.value);
            targetCases = appData.cases.filter(c => selectedIds.includes(String(c.id)));
        }

        if (targetCases.length === 0 && template !== 'receipt-classic') {
            alert('يرجى تحديد حالات للطباعة');
            return;
        }

        let content = '';
        let orientation = 'portrait';

        // Custom call to generators using targetCases
        const institutionName = document.getElementById('print-institution-name').value || 'بوابتك للخير';
        const benefitType = document.getElementById('print-benefit-type').value || 'بطاطين الشتاء';

        if (template === 'misr-elkheir') {
            orientation = 'landscape';
            content = buildMisrElKheirHTML(targetCases);
        } else if (template === 'association-list') {
            orientation = 'landscape';
            content = buildAssociationOfficialHTML(targetCases);
        } else if (template === 'rawabit-list' || template === 'new-institution') {
            orientation = 'landscape';
            content = buildRawabitHTML(targetCases, institutionName, benefitType);
        } else if (template === 'orman-list') {
            orientation = 'portrait';
            content = buildOrmanHTML(targetCases);
        } else if (template === 'donation-list') {
            orientation = 'portrait';
            content = buildDonationListHTML();
        } else if (template === 'receipt-classic') {
            const d = appData.donations.find(item => item.id == donationId);
            if (!d) { alert('يرجى اختيار تبرع محدد'); return; }
            content = generateDonationReceipt(d, template);
        }

        if (content) {
            localStorage.setItem('printPayload', content);
            localStorage.setItem('printType', orientation);
            window.open('print.html', 'PrintWindow', 'width=1200,height=800,scrollbars=yes,resizable=yes');
            window.closeDonationPrintModal();
        }
    };

    function generateTemplateWithCases(cases, type) {
        // Shared logic: this will call the specific generators but with a pre-filtered list
        // I will map templates to the functions we already built but updated to accept 'cases' array
        if (type === 'misr-elkheir') return buildMisrElKheirHTML(cases);
        if (type === 'association-list') return buildAssociationOfficialHTML(cases);
        if (type === 'rawabit-list') return buildRawabitHTML(cases);
        if (type === 'orman-list') return buildOrmanHTML(cases);
        return '';
    }

    function buildOrmanHTML(cases) {
        if (cases.length === 0) return '';
        const rowsHtml = cases.map((c, i) => `
            <tr style="height: 48px;">
                <td style="padding: 5px; border: 1.5px solid #000; text-align: center; font-weight: bold;">${i + 1}</td>
                <td style="padding: 5px 10px; border: 1.5px solid #000; text-align: right; font-weight: bold; font-size: 1.1rem; white-space: nowrap;">${c.name}</td>
                <td style="padding: 5px; border: 1.5px solid #000; text-align: center;">${c.socialStatus || '-'}</td>
                <td style="padding: 5px; border: 1.5px solid #000; height: 35px;"></td>
                <td style="padding: 5px; border: 1.5px solid #000;"></td>
            </tr>
        `).join('');

        return `
            <div dir="rtl" style="font-family: 'Cairo', sans-serif; padding: 10mm; color: #000; width: 100%; box-sizing: border-box;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; height: 12vh; border-bottom: 2px solid #000; padding-bottom: 15px;">
                    <div style="text-align: right; flex: 1; font-size: 0.9rem;">
                        <p style="margin:0; font-weight:800; font-size:1.1rem;">جمعية الخير لتنمية المجتمع بمسير</p>
                        <p style="margin:0">كفر الشيخ - مسير</p>
                        <p style="margin:0">التاريخ: ${document.getElementById('report-print-date')?.value || new Date().toLocaleDateString('ar-EG')}</p>
                    </div>
                    <div style="text-align: center; flex: 1;">
                         <img src="logo.png" style="height: 70px; margin-bottom: 5px;">
                         <h2 style="margin: 0; font-size: 1.4rem; color:#217346;">جمعية الأورمان</h2>
                    </div>
                    <div style="text-align: left; flex: 1;">
                         <p style="margin:0; font-weight:800;">التحالف الوطني</p>
                         <p style="font-size: 0.75rem;">للعمل الأهلي التنموي</p>
                    </div>
                </div>
                <div style="text-align: center; margin-bottom: 30px;">
                    <h3 style="margin: 5px 0; font-weight: 800; text-decoration: underline;">كشف توزيع مساعدات بالمجان</h3>
                    <h4 style="margin: 5px 0;">مقدمة من جمعية الأورمان بالتعاون مع جمعية الخير بمسير</h4>
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 1.1rem; border: 2.5px solid #000;">
                    <thead>
                        <tr style="background-color: #f2f2f2;">
                            <th style="padding: 12px; border: 2px solid #000; width: 50px;">م</th>
                            <th style="padding: 12px; border: 2px solid #000;">اسم الحالة</th>
                            <th style="padding: 12px; border: 2px solid #000; width: 150px;">وصف الحالة</th>
                            <th style="padding: 12px; border: 2px solid #000; width: 140px;">التوقيع</th>
                            <th style="padding: 12px; border: 2px solid #000; width: 120px;">البصمة</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
                <div style="margin-top: 40px; display: flex; justify-content: space-around; font-weight: bold;">
                    <div>يعتمد رئيس الجمعية</div>
                    <div>لجنة الإشراف</div>
                </div>
            </div>
        `;
    }

    function buildRawabitHTML(cases, institutionName, benefitType) {
        if (cases.length === 0) return '';
        const rowsHtml = cases.map((c, i) => `
            <tr style="height: 48px;">
                <td style="padding: 5px; border: 1.5px solid #000; text-align: center; font-weight: bold;">${i + 1}</td>
                <td style="padding: 5px 10px; border: 1.5px solid #000; text-align: right; font-weight: bold; font-size: 1.05rem; white-space: nowrap;">${c.name}</td>
                <td style="padding: 5px; border: 1.5px solid #000; text-align: center; font-size: 0.95rem;">${c.nationalId || '-'}</td>
                <td style="padding: 5px; border: 1.5px solid #000; text-align: center; font-size: 0.9rem;">${c.socialStatus || '-'}</td>
                <td style="padding: 5px; border: 1.5px solid #000; text-align: center; font-size: 0.9rem;">${c.address || 'مسير'}</td>
                <td style="padding: 5px; border: 1.5px solid #000; text-align: center; font-size: 0.9rem;">${c.phone || '-'}</td>
                <td style="padding: 5px; border: 1.5px solid #000; height: 35px;"></td>
                <td style="padding: 5px; border: 1.5px solid #000;"></td>
            </tr>
        `).join('');

        return `
            <div dir="rtl" style="font-family: 'Cairo', sans-serif; padding: 5mm; color: #000; border: 2px solid #000; min-height: 98vh; width: 100%; box-sizing: border-box;">
                <div style="display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; height: 12vh;">
                    <div style="text-align: right; flex: 1.5; display: flex; align-items: center; gap: 15px;">
                         <img src="logo.png" style="height: 60px;">
                         <div>
                            <div style="font-weight: 900; font-size: 1.25rem; color: #217346;">${institutionName || 'بوابتك للخير'}</div>
                            <div style="font-size: 0.9rem; font-weight: 800; margin-top: 5px;">جمعية الخير لتنمية المجتمع بمسير</div>
                         </div>
                    </div>
                    <div style="text-align: center; flex: 2;">
                        <h2 style="margin: 0; font-size: 1.4rem; font-weight: 800; text-decoration: underline;">كشف المستفيدين (${benefitType || 'بطاطين الشتاء'})</h2>
                        <h3 style="margin: 5px 0; font-size: 1rem; font-weight: 700;">محافظة كفر الشيخ - مركز كفر الشيخ - قرية مسير</h3>
                    </div>
                    <div style="text-align: left; flex: 1; font-weight: bold; font-size: 0.9rem; padding-top: 10px;">
                         <p style="margin: 0;">تحريراً في: ${document.getElementById('report-print-date')?.value || new Date().toLocaleDateString('ar-EG')}</p>
                    </div>
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 1rem; border: 2.5px solid #000;">
                    <thead>
                        <tr style="background-color: #f5f5f5;">
                            <th style="padding: 12px; border: 2.5px solid #000; width: 40px;">م</th>
                            <th style="padding: 12px; border: 2.5px solid #000; width: 230px;">الاسم</th>
                            <th style="padding: 12px; border: 2.5px solid #000; width: 150px;">الرقم القومي</th>
                            <th style="padding: 12px; border: 2.5px solid #000; width: 100px;">الحالة</th>
                            <th style="padding: 12px; border: 2.5px solid #000;">العنــوان</th>
                            <th style="padding: 12px; border: 2.5px solid #000; width: 120px;">التليفون</th>
                            <th style="padding: 12px; border: 2.5px solid #000; width: 120px;">التوقيع</th>
                            <th style="padding: 12px; border: 2.5px solid #000; width: 90px;">البصمة</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
                <div style="margin-top: 30px; display: flex; justify-content: space-around; font-weight: 800;">
                    <div>يعتمد رئيس الجمعية</div>
                    <div>مسؤول اللجنة الاستلام والتوزيع</div>
                </div>
            </div>
        `;
    }

    function buildAssociationOfficialHTML(cases) {
        if (cases.length === 0) return '';
        const rowsHtml = cases.map((c, i) => `
            <tr style="height: 42px;">
                <td style="padding: 4px; border: 1px solid #000; text-align: center; font-weight: bold; font-size: 0.95rem;">${i + 1}</td>
                <td style="padding: 4px 8px; border: 1px solid #000; text-align: right; font-weight: bold; font-size: 1rem; white-space: nowrap;">${c.name}</td>
                <td style="padding: 4px; border: 1px solid #000; text-align: center; font-size: 0.9rem;">${c.nationalId || '-'}</td>
                <td style="padding: 4px 8px; border: 1px solid #000; text-align: right; font-size: 0.9rem; white-space: nowrap;">${c.spouseName || '-'}</td>
                <td style="padding: 4px; border: 1px solid #000; text-align: center; font-size: 0.85rem;">${c.spouseId || '-'}</td>
                <td style="padding: 4px; border: 1px solid #000; text-align: center; font-size: 0.9rem;">${c.familyMembers || '-'}</td>
                <td style="padding: 4px; border: 1px solid #000; text-align: center; font-weight: bold; font-size: 1rem;">${c.amount || '-'}</td>
                <td style="padding: 4px; border: 1px solid #000; text-align: center; font-size: 0.85rem;">${c.address || '-'}</td>
                <td style="padding: 4px; border: 1px solid #000; height: 35px;"></td>
            </tr>
        `).join('');

        return `
            <div dir="rtl" style="font-family: 'Cairo', sans-serif; padding: 5mm; color: #000; width: 100%; box-sizing: border-box;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2.5px solid #000; padding-bottom: 10px; margin-bottom: 20px; height: 12vh;">
                    <div style="flex: 2; display: flex; align-items: center; gap: 15px;">
                        <img src="logo.png" style="height: 65px;">
                        <div>
                            <h2 style="margin: 0; font-size: 1.4rem; font-weight: 800;">جمعية الخير لتنمية المجتمع بمسير</h2>
                            <p style="margin: 0; font-size: 0.95rem; font-weight: 600;">مشهرة برقم 1899 لسنة 2012</p>
                            <p style="margin: 0; font-size: 0.85rem; font-weight: bold;">تحريراً في: ${document.getElementById('report-print-date')?.value || new Date().toLocaleDateString('ar-EG')}</p>
                        </div>
                    </div>
                    <div style="flex: 1.2; text-align: center;">
                         <h3 style="margin: 0; border: 2px solid #000; display: inline-block; padding: 5px 25px; font-size: 1.15rem; border-radius: 5px; background: #f9f9f9;">كشف صرف مساعدات</h3>
                    </div>
                    <div style="flex: 1; text-align: left;">
                         <div style="border: 2px solid #000; padding: 5px; font-weight: bold; text-align: center; font-size: 0.85rem; height: 60px; width: 100px; margin-left: auto; display: flex; align-items: center; justify-content: center; border-radius: 8px;">
                            ختم الجمعية
                         </div>
                    </div>
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; border: 2px solid #000;">
                    <thead>
                        <tr style="background-color: #f2f2f2; height: 35px;">
                            <th style="padding: 5px; border: 1.5px solid #000; width: 30px;">م</th>
                            <th style="padding: 5px; border: 1.5px solid #000; width: 220px;">الاسم</th>
                            <th style="padding: 5px; border: 1.5px solid #000; width: 130px;">الرقم القومي</th>
                            <th style="padding: 5px; border: 1.5px solid #000; width: 180px;">الزوج / الزوجة</th>
                            <th style="padding: 5px; border: 1.5px solid #000; width: 130px;">الرقم القومي</th>
                            <th style="padding: 5px; border: 1.5px solid #000; width: 50px;">أفراد</th>
                            <th style="padding: 5px; border: 1.5px solid #000; width: 70px;">المبلغ</th>
                            <th style="padding: 5px; border: 1.5px solid #000;">العنوان</th>
                            <th style="padding: 5px; border: 1.5px solid #000; width: 110px;">التوقيع</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
                <div style="margin-top: 20px; display: flex; justify-content: space-between; font-weight: bold; font-size: 1rem;">
                    <div>لجنة الصرف: ................................................</div>
                    <div>يعتمد رئيس مجلس الإدارة</div>
                </div>
            </div>
        `;
    }

    function buildMisrElKheirHTML(cases) {
        if (cases.length === 0) return '';

        // Chunk cases into groups of 10
        const chunkSize = 10;
        const pages = [];
        for (let i = 0; i < cases.length; i += chunkSize) {
            pages.push(cases.slice(i, i + chunkSize));
        }

        const dateVal = document.getElementById('report-print-date')?.value || new Date().toLocaleDateString('ar-EG');

        return pages.map((pageCases, pageIdx) => {
            const rowsHtml = pageCases.map((c, i) => `
                <tr style="height: 40px;">
                    <td style="padding: 4px; border: 1px solid #000; text-align: center; font-size: 0.85rem;">${(pageIdx * chunkSize) + i + 1}</td>
                    <td style="padding: 4px; border: 1px solid #000; text-align: center; font-size: 0.8rem;">كفر الشيخ</td>
                    <td style="padding: 4px; border: 1px solid #000; text-align: center; font-size: 0.8rem;">كفر الشيخ</td>
                    <td style="padding: 4px; border: 1px solid #000; text-align: center; font-size: 0.8rem;">مسير</td>
                    <td style="padding: 4px 8px; border: 1px solid #000; text-align: right; font-weight: bold; font-size: 0.95rem; white-space: nowrap;">${c.name}</td>
                    <td style="padding: 4px; border: 1px solid #000; text-align: center; font-size: 0.85rem;">${c.nationalId || '-'}</td>
                    <td style="padding: 4px; border: 1px solid #000; text-align: center; font-size: 0.85rem;">${c.phone || '-'}</td>
                    <td style="padding: 4px; border: 1px solid #000; width: 60px;"></td>
                    <td style="padding: 4px; border: 1px solid #000; width: 100px;"></td>
                </tr>
            `).join('');

            return `
                <div dir="rtl" style="font-family: 'Cairo', sans-serif; padding: 5mm; color: #000; width: 100%; box-sizing: border-box; ${pageIdx < pages.length - 1 ? 'page-break-after: always;' : ''}">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px;">
                        <div style="flex: 1.5; text-align: right;">
                            <h4 style="margin: 0; font-size: 1.1rem; color: #217346;">مؤسسة مصر الخير</h4>
                            <p style="margin: 0; font-size: 0.8rem; font-weight: bold;">تاريخ الكشف: ${dateVal}</p>
                        </div>
                        <div style="flex: 2; text-align: center;">
                            <h3 style="margin: 0; font-size: 1.3rem; font-weight: 800; border-bottom: 2px solid #000; display: inline-block; padding-bottom: 5px;">كشف توزيع المساعدات الغذائية</h3>
                            <p style="margin: 5px 0 0 0; font-size: 0.8rem; font-weight: bold;">صفحة ${pageIdx + 1} من ${pages.length}</p>
                        </div>
                        <div style="flex: 1.5; text-align: left; display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
                            <div style="text-align: center;">
                                <div style="font-weight: 900; font-size: 0.95rem;">جمعية الخير لتنمية المجتمع بمسير</div>
                                <div style="font-size: 0.75rem; font-weight: 700;">مشهرة برقم 1899 لسنة 2012</div>
                            </div>
                            <img src="logo.png" style="height: 55px;">
                        </div>
                    </div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; border: 2.5px solid #000; text-align: center;">
                        <thead style="background: #f8fafc;">
                            <tr style="height: 40px;">
                                <th style="padding: 5px; border: 1.5px solid #000; width: 35px;">م</th>
                                <th style="padding: 5px; border: 1.5px solid #000; width: 90px;">المحافظة</th>
                                <th style="padding: 5px; border: 1.5px solid #000; width: 90px;">المركز</th>
                                <th style="padding: 5px; border: 1.5px solid #000; width: 90px;">القرية</th>
                                <th style="padding: 5px; border: 1.5px solid #000;">اسم المستفيد</th>
                                <th style="padding: 5px; border: 1.5px solid #000; width: 140px;">الرقم القومي</th>
                                <th style="padding: 5px; border: 1.5px solid #000; width: 110px;">رقم الهاتف</th>
                                <th style="padding: 5px; border: 1.5px solid #000; width: 90px;">التوقيع</th>
                                <th style="padding: 5px; border: 1.5px solid #000; width: 100px;">ملاحظات</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            `;
        }).join('');
    }

    function buildDonationListHTML() {
        const fromDate = document.getElementById('print-from-date').value;
        const toDate = document.getElementById('print-to-date').value;
        const filtered = appData.donations.filter(d => {
            if (fromDate && toDate) return d.date >= fromDate && d.date <= toDate;
            if (fromDate) return d.date >= fromDate;
            if (toDate) return d.date <= toDate;
            return true;
        });

        const rowsHtml = filtered.map((d, i) => `
            <tr style="height: 38px;">
                <td style="padding: 4px; border: 1px solid #000; text-align: center;">${i + 1}</td>
                <td style="padding: 4px; border: 1px solid #000; text-align: center;">${d.date}</td>
                <td style="padding: 4px 10px; border: 1px solid #000; text-align: right; font-weight: bold;">${d.donor}</td>
                <td style="padding: 4px; border: 1px solid #000; text-align: center; font-weight: bold;">${parseFloat(d.amount).toLocaleString()} ج.م</td>
                <td style="padding: 4px; border: 1px solid #000; text-align: center;">${d.type}</td>
            </tr>
        `).join('');

        const total = filtered.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);

        return `
            <div dir="rtl" style="font-family: 'Cairo', sans-serif; padding: 5mm; color: #000; width: 100%; box-sizing: border-box;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px;">
                    <div style="text-align: right; flex: 2; display: flex; align-items: center; gap: 15px;">
                        <img src="logo.png" style="height: 60px;">
                        <div>
                            <h2 style="margin: 0; font-size: 1.25rem; font-weight: 800;">جمعية الخير بمسير</h2>
                            <p style="margin: 0; font-size: 0.85rem; font-weight: 600;">سجل المقبوضات (التبرعات)</p>
                        </div>
                    </div>
                    <div style="text-align: left; flex: 1;">
                        <p style="margin: 0; font-size: 0.85rem; font-weight: bold;">تحريراً في: ${new Date().toLocaleDateString('ar-EG')}</p>
                    </div>
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 0.95rem; border: 2px solid #000;">
                    <thead>
                        <tr style="background: #f2f2f2; height: 35px;">
                            <th style="padding: 5px; border: 1.5px solid #000; width: 40px;">م</th>
                            <th style="padding: 5px; border: 1.5px solid #000; width: 120px;">التاريخ</th>
                            <th style="padding: 5px; border: 1.5px solid #000;">اسم المتبرع</th>
                            <th style="padding: 5px; border: 1.5px solid #000; width: 120px;">المبلغ</th>
                            <th style="padding: 5px; border: 1.5px solid #000; width: 150px;">نوع التبرع</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                    <tfoot>
                        <tr style="background: #eee; font-weight: 800;">
                            <td colspan="3" style="padding: 8px; border: 1.5px solid #000; text-align: center;">الإجمالي</td>
                            <td colspan="2" style="padding: 8px; border: 1.5px solid #000; text-align: center; color: #d13438; font-size: 1.1rem;">${total.toLocaleString()} ج.م</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
    }

    function generateDonationReceipt(d, template) {
        const color = '#000';
        return `
            <div dir="rtl" style="font-family: 'Cairo', sans-serif; padding: 40px; border: 5px double ${color}; max-width: 600px; margin: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid ${color}; padding-bottom: 15px;">
                    <div style="text-align: right;">
                        <h2 style="color: ${color}; margin: 0;">جمعية الخير بمسير</h2>
                        <p style="margin: 0; font-size: 0.85rem; font-weight: 600;">المشهرة برقم 1899 لسنة 2012</p>
                        <p style="margin: 5px 0; font-weight: bold;">إيصال استلام تبرع رقم: ${d.id}</p>
                    </div>
                    <img src="logo.png" style="height: 60px;">
                </div>
                <hr style="border: 1px solid ${color};">
                <div style="margin: 30px 0; line-height: 2;">
                    <p>استلمنا من السيد/ة: <span style="font-weight: bold; border-bottom: 1px dashed #000; padding: 0 10px;">${d.donor}</span></p>
                    <p>مبلغ وقدره: <span style="font-weight: bold; border-bottom: 1px dashed #000; padding: 0 10px;">${parseFloat(d.amount).toLocaleString()} ج.م</span></p>
                    <p>وذلك بغرض: <span style="font-weight: bold; border-bottom: 1px dashed #000; padding: 0 10px;">${d.type}</span></p>
                    <p>بتاريخ: <span style="font-weight: bold;">${d.date}</span></p>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 50px;">
                    <p>توقيع المستلم: .....................</p>
                    <p>ختم الجمعية: [ ]</p>
                </div>
                <p style="text-align: center; font-size: 0.8rem; margin-top: 40px; color: #666;">جزاكم الله خيراً - البرنامج من تطوير م/ مصطفى لبان</p>
            </div>
        `;
    }


    window.performGlobalSearch = (val) => {
        const resultsDiv = document.getElementById('global-search-results');
        if (!val || val.length < 1) {
            resultsDiv.style.display = 'none';
            return;
        }

        const query = window.normalizeArabic(val);
        const matches = [];

        // Check for Category Match (Smart Suggestion)
        AVAILABLE_CATEGORIES.forEach(cat => {
            const normalizedCat = window.normalizeArabic(cat);
            if (normalizedCat.includes(query) || query.includes(normalizedCat)) {
                matches.push({
                    type: 'تصنيف رئيسي',
                    name: `عرض ملف ${cat}`,
                    sub: `عرض كافة الحالات المسجلة تحت تصنيف "${cat}"`,
                    id: 0,
                    page: 'category-view',
                    category: cat
                });
            }
        });

        // Search Cases (Deep Search)
        appData.cases.forEach(c => {
            const caseData = [
                c.name,
                c.nationalId,
                c.phone,
                c.spouseName,
                c.spouseId,
                c.address,
                c.note,
                c.type, // Classifications (أيتام، أرامل، إلخ)
                ...(c.members || []).map(m => m.name) // Search family members
            ].map(v => v ? window.normalizeArabic(v) : '').join(' ');

            if (caseData.includes(query)) {
                matches.push({ type: 'حالة', name: c.name, sub: `${c.type || ''} - ${c.address || ''} `, id: c.id, page: 'cases' });
            }
        });

        // Search Donations
        appData.donations.forEach(d => {
            const donationData = [
                d.donor,
                d.amount,
                d.type, // Donation type/purpose
                d.date
            ].map(v => v ? window.normalizeArabic(String(v)) : '').join(' ');

            if (donationData.includes(query)) {
                matches.push({ type: 'تبرع', name: d.donor, sub: `${d.amount} ج.م - ${d.type} `, id: d.id, page: 'donations' });
            }
        });

        // Search Aid (Expenses)
        (appData.expenses || []).forEach(e => {
            const expenseData = [
                e.beneficiary,
                e.amount,
                e.category, // Aid type
                e.date,
                e.note
            ].map(v => v ? window.normalizeArabic(String(v)) : '').join(' ');

            if (expenseData.includes(query)) {
                matches.push({ type: 'صرف مساعدات', name: e.beneficiary, sub: `${e.amount} - ${e.category} `, id: e.id, page: 'expenses' });
            }
        });

        // Search Affidavits
        (appData.affidavits || []).forEach(aff => {
            const affData = [
                aff.husName,
                aff.wifeName,
                aff.husId,
                aff.wifeId,
                aff.date
            ].map(v => v ? window.normalizeArabic(v) : '').join(' ');

            if (affData.includes(query)) {
                matches.push({
                    type: 'إفادة مسجلة', name: `${aff.husName} / ${aff.wifeName}`, sub: `بتاريخ: ${aff.date}`, id: aff.id, page: 'affidavit'
                });
            }
        });

        if (matches.length > 0) {
            resultsDiv.innerHTML = matches.slice(0, 15).map(m => `
                <div class="dropdown-item" onclick="navigateToResult('${m.page}', ${m.id}, '${m.name.replace(/'/g, "\\'")}', '${m.category || ''}')">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong style="${m.type === 'تصنيف رئيسي' ? 'color: #217346; font-size: 1.05rem;' : ''}">${m.name}</strong>
                        <span class="status-badge" style="font-size: 0.65rem; background: ${m.type === 'تصنيف رئيسي' ? '#e6fffa' : '#eef2f7'}; color: ${m.type === 'تصنيف رئيسي' ? '#217346' : 'inherit'};">
                            ${m.type === 'تصنيف رئيسي' ? '<i class="fas fa-folder-open"></i> ' + m.type : m.type}
                        </span>
                    </div>
                    <span style="font-size: 0.75rem; color: #666;">${m.sub}</span>
                </div>
            `).join('');
            resultsDiv.style.display = 'block';
        } else {
            resultsDiv.innerHTML = '<div class="dropdown-item" style="color: #999; text-align: center;">لا توجد نتائج</div>';
            resultsDiv.style.display = 'block';
        }
    };

    window.navigateToResult = (page, id, name, category = '') => {
        document.getElementById('global-search-results').style.display = 'none';
        document.getElementById('global-search').value = '';

        if (page === 'category-view') {
            renderCategoryRegister(category);
            return;
        }

        // Use a filter to highlight the case in the cases page
        if (page === 'cases') {
            window.currentSearchFilter = name;
        }

        const item = document.querySelector(`.sidebar-nav li[data-page="${page}"]`);
        if (item) item.click();
    };

    // --- AFFIDAVIT DUPLICATE CHECK ---
    window.affMatchResults = [];
    window.checkAffidavitDuplicates = (field, val) => {
        const resultsDivId = `aff-${field.startsWith('spouse') ? 'wife' : 'husband'}-${field.includes('name') ? 'name' : (field.includes('Id') ? 'id' : 'phone')}-results`;
        const resultsDiv = document.getElementById(resultsDivId);

        if (!val || val.length < 1) {
            if (resultsDiv) resultsDiv.style.display = 'none';
            return;
        }

        const query = window.normalizeArabic(val);
        const matches = [];

        // Search Cases (Universal for both fields)
        appData.cases.forEach(c => {
            let matchFound = false;
            if (field.includes('name')) {
                if (window.normalizeArabic(c.name || '').includes(query) || window.normalizeArabic(c.spouseName || '').includes(query)) matchFound = true;
            } else if (field.includes('Id')) {
                if ((c.nationalId || '').includes(query) || (c.spouseId || '').includes(query)) matchFound = true;
            } else if (field.includes('phone')) {
                if ((c.phone || '').includes(query) || (c.spousePhone || '').includes(query)) matchFound = true;
            }

            if (matchFound) {
                matches.push({
                    type: 'حالة مسجلة',
                    displayName: `${c.name} / ${c.spouseName || 'بدون'}`,
                    id: c.id,
                    page: 'cases',
                    data: {
                        husName: c.name, husId: c.nationalId, husPhone: c.phone,
                        wifeName: c.spouseName, wifeId: c.spouseId, wifePhone: c.spousePhone
                    }
                });
            }
        });

        // Search Donations
        appData.donations.forEach(d => {
            if (field.includes('name') && window.normalizeArabic(d.donor || '').includes(query)) {
                matches.push({
                    type: 'متبرع',
                    displayName: d.donor,
                    id: d.id,
                    page: 'donations',
                    data: { husName: d.donor, husPhone: d.phone }
                });
            }
        });

        // Search Aid (Expenses)
        (appData.expenses || []).forEach(e => {
            if (field.includes('name') && window.normalizeArabic(e.beneficiary || '').includes(query)) {
                matches.push({
                    type: 'مستفيد مساعدة',
                    displayName: e.beneficiary,
                    id: e.id,
                    page: 'expenses',
                    data: { husName: e.beneficiary, husId: e.nationalId }
                });
            }
        });

        // Search Previous Affidavits
        (appData.affidavits || []).forEach(aff => {
            let matchFound = false;
            if (field.includes('name')) {
                if (window.normalizeArabic(aff.husName || '').includes(query) || window.normalizeArabic(aff.wifeName || '').includes(query)) matchFound = true;
            } else if (field.includes('Id')) {
                if ((aff.husId || '').includes(query) || (aff.wifeId || '').includes(query)) matchFound = true;
            } else if (field.includes('phone')) {
                if ((aff.husPhone || '').includes(query) || (aff.wifePhone || '').includes(query)) matchFound = true;
            }

            if (matchFound) {
                matches.push({
                    type: 'إفادة مسجلة',
                    displayName: `${aff.husName} / ${aff.wifeName}`,
                    id: aff.id,
                    page: 'affidavit',
                    data: { ...aff }
                });
            }
        });

        if (matches.length > 0) {
            const uniqueMatches = [];
            const seen = new Set();
            matches.forEach(m => {
                const key = `${m.type}-${m.displayName}`;
                if (!seen.has(key)) {
                    uniqueMatches.push(m);
                    seen.add(key);
                }
            });

            window.affMatchResults = uniqueMatches;

            resultsDiv.innerHTML = uniqueMatches.slice(0, 5).map((m, idx) => `
                <div class="dropdown-item" style="display: flex; flex-direction: column; gap: 5px; text-align: right;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong style="font-size: 0.9rem;">${m.displayName}</strong>
                        <span style="font-size: 0.6rem; background: #fff1f0; color: #cf1322; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${m.type}</span>
                    </div>
                    <div style="display: flex; gap: 10px; margin-top: 5px;">
                        <button class="btn-primary" style="font-size: 0.75rem; padding: 4px 10px; background: #059669; border: none; border-radius: 4px; cursor: pointer; color: white;" onclick="fillAffidavitData(${idx})">
                            <i class="fas fa-magic"></i> تعبئة
                        </button>
                        <button class="btn-secondary" style="font-size: 0.75rem; padding: 4px 10px; border: 1px solid #ddd; background: #f8fafc; border-radius: 4px; cursor: pointer;" onclick="navigateToResult('${m.page}', ${m.id}, '')">
                            <i class="fas fa-external-link-alt"></i> عرض
                        </button>
                    </div>
                </div>
            `).join('');
            resultsDiv.style.display = 'block';
        } else {
            resultsDiv.innerHTML = '<div class="dropdown-item" style="color: #999; text-align: center; font-size: 0.8rem;">لا يوجد تكرار لهذه البيانات</div>';
            resultsDiv.style.display = 'block';
            setTimeout(() => {
                if (resultsDiv.innerHTML.includes('لا يوجد تكرار')) resultsDiv.style.display = 'none';
            }, 2000);
        }
    };

    window.fillAffidavitData = (idx) => {
        const m = window.affMatchResults[idx];
        if (!m || !m.data) return;
        const data = m.data;

        const husName = document.getElementById('aff-husband-name');
        const husId = document.getElementById('aff-husband-id');
        const husPhone = document.getElementById('aff-husband-phone');
        const wifeName = document.getElementById('aff-wife-name');
        const wifeId = document.getElementById('aff-wife-id');
        const wifePhone = document.getElementById('aff-wife-phone');

        if (data.husName && husName) husName.value = data.husName;
        if (data.husId && husId) husId.value = data.husId;
        if (data.husPhone && husPhone) husPhone.value = data.husPhone;

        if (data.wifeName && wifeName) wifeName.value = data.wifeName;
        if (data.wifeId && wifeId) wifeId.value = data.wifeId;
        if (data.wifePhone && wifePhone) wifePhone.value = data.wifePhone;

        const results = document.querySelectorAll('.dropdown-results');
        results.forEach(div => div.style.display = 'none');
    };

    window.viewCaseFromAffidavit = (id) => {
        const c = appData.cases.find(item => item.id === id);
        if (c) navigateToResult('cases', id, c.name);
    };

    window.saveAffidavitOnly = () => {
        const husName = document.getElementById('aff-husband-name').value;
        const husId = document.getElementById('aff-husband-id').value;
        const husPhone = document.getElementById('aff-husband-phone').value;
        const wifeName = document.getElementById('aff-wife-name').value;
        const wifeId = document.getElementById('aff-wife-id').value;
        const wifePhone = document.getElementById('aff-wife-phone').value;

        if (!husName || !wifeName) {
            alert('يرجى إدخال اسم الزوج والزوجة على الأقل');
            return;
        }

        // Check if exists in Cases Management
        const husInCases = appData.cases.some(c =>
            window.normalizeArabic(c.name) === window.normalizeArabic(husName) ||
            (husId && c.nationalId === husId) ||
            window.normalizeArabic(c.spouseName) === window.normalizeArabic(husName) ||
            (husId && c.spouseId === husId)
        );

        const wifeInCases = appData.cases.some(c =>
            window.normalizeArabic(c.name) === window.normalizeArabic(wifeName) ||
            (wifeId && c.nationalId === wifeId) ||
            window.normalizeArabic(c.spouseName) === window.normalizeArabic(wifeName) ||
            (wifeId && c.spouseId === wifeId)
        );

        if (husInCases || wifeInCases) {
            alert('بيانات الزوج أو الزوجة مسجلة بالفعل في إدارة الحالات. لا يمكن إضافة إفادة لهما.');
            return;
        }

        const newAff = {
            id: Date.now(),
            date: new Date().toISOString().split('T')[0],
            husName, husId, husPhone,
            wifeName, wifeId, wifePhone
        };

        if (!appData.affidavits) appData.affidavits = [];
        appData.affidavits.push(newAff);
        saveData();
        renderPage('affidavit');
        // Show a brief success toast/alert
        alert('تم حفظ الإفادة في السجل بنجاح');
    };

    window.generateAffidavit = () => {
        const husName = document.getElementById('aff-husband-name').value;
        const husId = document.getElementById('aff-husband-id').value;
        const husPhone = document.getElementById('aff-husband-phone').value;
        const wifeName = document.getElementById('aff-wife-name').value;
        const wifeId = document.getElementById('aff-wife-id').value;
        const wifePhone = document.getElementById('aff-wife-phone').value;

        if (!husName || !wifeName) {
            alert('يرجى إدخال اسم الزوج والزوجة على الأقل');
            return;
        }

        // Check if exists in Cases Management
        const husInCases = appData.cases.some(c =>
            window.normalizeArabic(c.name) === window.normalizeArabic(husName) ||
            (husId && c.nationalId === husId) ||
            window.normalizeArabic(c.spouseName) === window.normalizeArabic(husName) ||
            (husId && c.spouseId === husId)
        );

        const wifeInCases = appData.cases.some(c =>
            window.normalizeArabic(c.name) === window.normalizeArabic(wifeName) ||
            (wifeId && c.nationalId === wifeId) ||
            window.normalizeArabic(c.spouseName) === window.normalizeArabic(wifeName) ||
            (wifeId && c.spouseId === wifeId)
        );

        if (husInCases || wifeInCases) {
            alert('بيانات الزوج أو الزوجة مسجلة بالفعل في إدارة الحالات. لا يمكن إصدار إفادة لهما.');
            return;
        }

        const newAff = {
            id: Date.now(),
            date: new Date().toISOString().split('T')[0],
            husName, husId, husPhone,
            wifeName, wifeId, wifePhone
        };

        if (!appData.affidavits) appData.affidavits = [];
        appData.affidavits.push(newAff);
        saveData();
        renderPage('affidavit');

        window.printAffidavitDoc(newAff);
    };

    window.printSavedAffidavit = (id) => {
        const aff = appData.affidavits.find(a => a.id === id);
        if (aff) window.printAffidavitDoc(aff);
    };

    window.printAffidavitDoc = (aff) => {
        const content = `
            <div style="font-family: 'Cairo', sans-serif; padding: 60px; border: 1px solid #ccc; max-width: 800px; margin: auto; background: white; min-height: 1000px; display: flex; flex-direction: column; position: relative;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #217346; padding-bottom: 15px; margin-bottom: 30px;">
                    <div style="text-align: right;">
                        <h1 style="color: #217346; margin: 0; font-size: 2rem; font-weight: 900;">جمعية الخير لتنمية المجتمع بمسير</h1>
                        <p style="margin: 0; font-size: 1rem; font-weight: 700;">مشهرة برقم 1899 لسنة 2012</p>
                    </div>
                    <img src="logo.png" style="height: 80px;">
                </div>
                <div style="text-align: center; margin-bottom: 30px;">
                    <h3 style="margin: 0; font-weight: 700;">وثيقة إفادة استعلام رسمية</h3>
                </div>
                
                <div style="flex: 1;">
                    <p style="font-size: 1.3rem; line-height: 2.2; text-align: right; margin-bottom: 30px;">
                        تشهد جمعية الخير لتنمية المجتمع بمسير بأنه تم الاستعلام في سجلات الجمعية عن:
                        <br>
                        <strong>السيد / ${aff.husName}</strong> (الرقم القومي: ${aff.husId || '....................'})
                        <br>
                        <strong>والسيدة / ${aff.wifeName}</strong> (الرقم القومي: ${aff.wifeId || '....................'})
                        <br><br>
                        <span style="font-weight: 800; text-decoration: underline; background: #f9f9f9; padding: 5px;">وهذا بيان منا بأنهم لا يتقاضون أي مبالغ أو مساعدات عينية من جمعية الخير لتنمية المجتمع بمسير حتى تاريخه.</span>
                    </p>
                    
                    <p style="text-align: right; color: #666; font-size: 0.95rem; margin-top: 50px;">
                        تحريراً في: ${aff.date}
                    </p>
                </div>

                <div style="margin-top: 100px; display: flex; justify-content: space-between; align-items: flex-end;">
                    <div style="text-align: center; width: 220px;">
                        <p style="font-weight: 800; margin-bottom: 60px;">توقيع المختص</p>
                        <p>...............................</p>
                    </div>
                    <div style="text-align: center; width: 280px;">
                        <p style="font-weight: 800; margin-bottom: 5px;">يعتمد،،</p>
                        <p style="font-weight: 800; margin-bottom: 50px;">رئيس مجلس الإدارة</p>
                        <p style="font-size: 1.25rem; font-weight: 900; color: #1a5c38;">أ/ هيثم إبراهيم شمس</p>
                    </div>
                </div>
                
                <div style="position: absolute; bottom: 150px; left: 45%; border: 3px double rgba(33, 115, 70, 0.15); width: 140px; height: 140px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: rgba(33, 115, 70, 0.15); font-weight: 900; transform: rotate(-15deg); font-size: 0.8rem;">
                     خـتـم الـجـمـعـيـة
                </div>
            </div>
        `;

        localStorage.setItem('printPayload', content);
        localStorage.setItem('printType', 'portrait');
        window.open('print.html', '_blank');
    };

    window.deleteAffidvait = (id) => {
        const pass = prompt('يرجى إدخال كلمة سر الحذف:');
        if (pass !== '1111') {
            if (pass !== null) alert('كلمة السر خاطئة!');
            return;
        }
        if (confirm('هل أنت متأكد من حذف هذا السجل من الأرشيف؟')) {
            appData.affidavits = appData.affidavits.filter(a => a.id !== id);
            saveData();
            renderPage('affidavit');
        }
    };

    // --- KEYBOARD NAVIGATION FOR MODALS ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const target = e.target;
            const modalCard = target.closest('.modal-card');
            if (modalCard && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) {
                if (target.tagName === 'TEXTAREA') return;

                e.preventDefault();
                const focusable = Array.from(modalCard.querySelectorAll('input:not([type="hidden"]), select, textarea, button.btn-primary, button#modal-case-save-btn'));
                const index = focusable.indexOf(target);

                if (index > -1 && index < focusable.length - 1) {
                    focusable[index + 1].focus();
                    if (focusable[index + 1].tagName === 'INPUT') focusable[index + 1].select();
                }
            }
        }
    });

    // --- GLOBAL CLICK HANDLER TO CLOSE DROPDOWNS ---
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown-container')) {
            const results = document.querySelectorAll('.dropdown-results');
            results.forEach(div => div.style.display = 'none');
        }
    });

    window.viewDonorHistory = (name, phone) => {
        // Determine the matches based on name or a valid phone number
        const donations = appData.donations.filter(d => {
            const nameMatch = name && d.donor === name;
            const validPhone = phone && phone !== '' && phone !== '-';
            const phoneMatch = validPhone && d.phone === phone;
            return nameMatch || phoneMatch;
        }).sort((a, b) => b.id - a.id);

        const total = donations.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

        const content = `
        <div dir="rtl" style="font-family: 'Cairo', sans-serif; padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #4f46e5; padding-bottom: 15px; margin-bottom: 20px;">
                <div>
                    <h2 style="color: #4f46e5; margin: 0;">سجل تبرعات المتبرع</h2>
                    <h3 style="margin: 5px 0 0 0;"><span id="donor-history-name">${name}</span> <small id="donor-history-phone" style="color: #666; font-weight: normal;">(الهاتف: ${phone || '-'})</small></h3>
                </div>
                <div style="text-align: left;">
                    <span style="font-size: 0.9rem; color: #666;">إجمالي التبرعات:</span>
                    <div style="font-size: 1.5rem; font-weight: 800; color: #217346;">${total.toLocaleString()} ج.م</div>
                </div>
            </div>

            <table border="1" style="width: 100%; border-collapse: collapse; text-align: center;">
                <thead style="background: #f8fafc;">
                    <tr>
                        <th style="padding: 10px; border: 1px solid #ddd;">التاريخ</th>
                        <th style="padding: 10px; border: 1px solid #ddd;">المبلغ</th>
                        <th style="padding: 10px; border: 1px solid #ddd;">البيان / الجهة</th>
                        <th style="padding: 10px; border: 1px solid #ddd;">الإجراءات</th>
                    </tr>
                </thead>
                <tbody>
                    ${donations.map(d => `
                        <tr>
                            <td style="padding: 10px; border: 1px solid #ddd;">${d.date}</td>
                            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; color: #217346;">${parseFloat(d.amount).toLocaleString()} ج.م</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${d.type}</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">
                                <div style="display: flex; gap: 10px; justify-content: center;">
                                    <i class="fas fa-print" title="طباعة وصل" style="color: #0078d4; cursor: pointer;" onclick="openDonationPrintModal(${d.id})"></i>
                                    <i class="fas fa-edit" title="تعديل" style="color: #217346; cursor: pointer;" onclick="prepareEditDonation(${d.id}); closeDetailsModal();"></i>
                                    <i class="fas fa-trash-alt" title="حذف" style="color: #d13438; cursor: pointer;" onclick="deleteDonation(${d.id})"></i>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                    ${donations.length === 0 ? '<tr><td colspan="4" style="padding: 20px; color: #999;">لا توجد تبرعات مسجلة</td></tr>' : ''}
                </tbody>
            </table>
            
            <div style="margin-top: 25px; text-align: center;">
                <button class="btn-primary" onclick="printDonorHistory()" style="background: #0078d4;">
                    <i class="fas fa-print"></i> طباعة كشف المتبرع
                </button>
            </div>
        </div>
    `;

        document.getElementById('details-content').innerHTML = content;
        document.getElementById('details-modal').style.display = 'flex';
    };

    window.printDonorHistory = () => {
        const content = document.getElementById('details-content').innerHTML;
        localStorage.setItem('printPayload', content);
        localStorage.setItem('printType', 'portrait');
        window.open('print.html', '_blank');
    };

    window.filterDonors = (val) => {
        const resultsDiv = document.getElementById('donor-dropdown-results');
        if (!resultsDiv) return;

        if (!val || val.length < 1) {
            resultsDiv.style.display = 'none';
            return;
        }

        const query = window.normalizeArabic(val);
        const results = [];
        const seen = new Set();

        // Search in existing donations
        appData.donations.forEach(d => {
            const normalizedName = window.normalizeArabic(d.donor);
            if (normalizedName.includes(query) && !seen.has(normalizedName)) {
                results.push({ name: d.donor, phone: d.phone || '' });
                seen.add(normalizedName);
            }
        });

        // Search in cases (beneficiaries might also be donors or just in the system)
        appData.cases.forEach(c => {
            const normalizedName = window.normalizeArabic(c.name);
            if (normalizedName.includes(query) && !seen.has(normalizedName)) {
                results.push({ name: c.name, phone: c.phone || '' });
                seen.add(normalizedName);
            }
        });

        if (results.length > 0) {
            resultsDiv.innerHTML = results.slice(0, 10).map(d => `
            <div class="dropdown-item" 
                 onclick="selectDonor(this.getAttribute('data-name'), this.getAttribute('data-phone'))" 
                 data-name="${d.name.replace(/"/g, '&quot;')}" 
                 data-phone="${d.phone}">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong>${d.name}</strong>
                    <span style="font-size: 0.75rem; color: #666;">${d.phone || '-'}</span>
                </div>
            </div>
        `).join('');
            resultsDiv.style.display = 'block';
        } else {
            resultsDiv.style.display = 'none';
        }
    };

    window.selectDonor = (name, phone) => {
        const nameInput = document.getElementById('donor-name');
        const phoneInput = document.getElementById('donor-phone');
        if (nameInput) nameInput.value = name;
        if (phoneInput) phoneInput.value = phone;

        document.getElementById('donor-dropdown-results').style.display = 'none';
        // Show history automatically
        viewDonorHistory(name, phone);
    };

    window.renderCategoryRegister = (category) => {
        const contentArea = document.getElementById('content-area');
        const pageTitle = document.getElementById('page-title');
        pageTitle.innerText = `ملف سجل الحالات: ${category}`;

        const normCategory = window.normalizeArabic(category);
        const normCategoryNoAl = window.normalizeArabic(category.replace(/^ال/, ''));

        const cases = appData.cases.filter(c => {
            if (!c.type) return false;
            const normType = window.normalizeArabic(c.type);
            // Match if: exact match, or category is inside type, or type is inside category (to handle Al- prefix variations)
            return normType.includes(normCategory) ||
                normType.includes(normCategoryNoAl) ||
                normCategory.includes(normType) ||
                normCategoryNoAl.includes(normType);
        });

        const html = `
            <div class="card" style="border: 2px solid #217346; border-radius: 15px; box-shadow: var(--shadow-strong); position: relative; overflow: hidden;">
                <!-- Decorative file folder tab -->
                <div style="position: absolute; top: 0; right: 40px; background: #217346; color: white; padding: 10px 30px; border-radius: 0 0 15px 15px; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <i class="fas fa-folder"></i> ملف ${category}
                </div>

                <div class="card-header" style="padding: 50px 30px 20px; border-bottom: 2px solid #eee;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; width: 100%;">
                        <div>
                            <h2 style="color: #217346; font-size: 1.8rem; margin-bottom: 5px;">سجل الحالات المندرجة تحت تصنيف: ${category}</h2>
                            <p style="color: #666;">إجمالي عدد المسجلين في هذا الملف: <strong>${cases.length} حالة</strong></p>
                        </div>
                        <div style="display: flex; gap: 10px;">
                            <button class="btn-primary" style="background: #217346;" onclick="printDiv('category-register-print')">
                                <i class="fas fa-print"></i> طباعة الملف بالكامل
                            </button>
                            <button class="btn-secondary" onclick="renderPage('dashboard')">العودة للرئيسية</button>
                        </div>
                    </div>
                </div>

                <div id="category-register-print" style="padding: 30px; background: white;">
                    <!-- Print Header -->
                    <div class="print-only" style="display: none; border-bottom: 3px double #217346; padding-bottom: 20px; margin-bottom: 30px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="text-align: right;">
                                <h1 style="color: #217346; margin: 0; font-size: 2rem;">جمعية الخير لتنمية المجتمع بمسير</h1>
                                <p style="margin: 5px 0 0; font-weight: 600;">كشف حالات تصنيف: ${category}</p>
                            </div>
                            <img src="logo.png" style="height: 80px;">
                        </div>
                    </div>

                    <div class="table-container">
                        <table class="data-table" style="width: 100%; border-collapse: collapse; font-size: 0.95rem;">
                            <thead>
                                <tr>
                                    <th style="width: 40px;">م</th>
                                    <th style="width: 80px;">رقم البحث</th>
                                    <th>الاسم</th>
                                    <th>الرقم القومي</th>
                                    <th>الهاتف</th>
                                    <th>العنوان</th>
                                    <th>الوضع الاجتماعي</th>
                                    <th>قيمة المساعدة</th>
                                    <th class="no-print">الإجراءات</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${cases.sort((a, b) => window.normalizeArabic(a.name).localeCompare(window.normalizeArabic(b.name), 'ar')).map((c, i) => `
                                    <tr style="border-bottom: 1px solid #eee;">
                                        <td style="text-align: center; font-weight: bold; color: #666;">${i + 1}</td>
                                        <td style="text-align: center; font-weight: 800; color: #d13438;">${c.searchNumber || '-'}</td>
                                        <td style="font-weight: 700; color: #1e293b;">${c.name}</td>
                                        <td style="font-family: monospace; color: #475569;">${c.nationalId || '-'}</td>
                                        <td style="color: #2563eb;">${c.phone || '-'}</td>
                                        <td style="font-size: 0.85rem;">${c.address || '-'}</td>
                                        <td>${c.socialStatus || '-'}</td>
                                        <td style="font-weight: 800; color: #217346;">${c.amount || '-'}</td>
                                        <td class="no-print">
                                            <button class="btn-primary" style="font-size: 0.7rem; padding: 4px 8px; background: #4f46e5;" onclick="openDetailsModal(${c.id})">الملف التفصيلي</button>
                                        </td>
                                    </tr>
                                `).join('')}
                                ${cases.length === 0 ? '<tr><td colspan="9" style="text-align: center; padding: 50px; color: #999;">لا توجد حالات مسجلة في هذا التصنيف حالياً</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="print-only" style="display: none; margin-top: 50px; justify-content: space-between;">
                        <div style="text-align: center;">
                            <p style="font-weight: bold;">مدير الجمعية</p>
                            <p>.......................</p>
                        </div>
                        <div style="text-align: center;">
                            <p style="font-weight: bold;">الختم</p>
                            <br><br>
                            <p>( ....................... )</p>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                @media print {
                    .no-print { display: none !important; }
                    .print-only { display: block !important; }
                    body { background: white !important; }
                    .card { border: none !important; box-shadow: none !important; }
                    .data-table th { background: #eee !important; color: black !important; border: 1px solid #333 !important; }
                    .data-table td { border: 1px solid #333 !important; }
                }
            </style>
        `;
        contentArea.innerHTML = html;
        window.scrollTo(0, 0);
    };
});
