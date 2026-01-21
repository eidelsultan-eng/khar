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
        csvContent += "م,المركز,الاسم,الرقم القومي,المهنة,رقم الهاتف,اسم الزوج/ة,الرقم القومي للزوج/ة,الأفراد,الوضع,نوع المساعدة,المبلغ,العنوان,ملاحظات\n";
        appData.cases.forEach((c, index) => {
            const row = [
                index + 1,
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

            case 'cases':
                pageTitle.innerText = 'إدارة الحالات والأسر';
                const filter = window.currentSearchFilter || '';
                const filteredCases = appData.cases.filter(c => {
                    if (c.hidden) return false;
                    const searchStr = `${c.name} ${c.nationalId} ${c.spouseName} ${c.spouseId}`.toLowerCase();
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
                                        <tr onclick="toggleFamilyMembers(${c.id})" style="cursor: pointer;">
                                            <td>${index + 1}</td>
                                            <td>${c.date || '-'}</td>
                                            <td>${c.center || '-'}</td>
                                            <td style="font-weight: 700; color: var(--primary-color);">${c.name}</td>
                                            <td>${c.nationalId || '-'}</td>
                                            <td>${c.job || '-'}</td>
                                            <td>${c.phone || '-'}</td>
                                            <td>${c.familyMembers || '-'}</td>
                                            <td>${c.socialStatus || '-'}</td>
                                            <td>${c.type || '-'}</td>
                                            <td>${c.source || '-'}</td>
                                            <td>${c.amount || '-'}</td>
                                            <td>${c.address || '-'}</td>
                                            <td>
                                                <div style="display: flex; gap: 12px; justify-content: center; align-items: center;">
                                                    <i class="fas fa-edit" title="تعديل" style="color: #0078d4; cursor: pointer;" onclick="event.stopPropagation(); prepareEditCase(${c.id})"></i>
                                                    <i class="fas fa-user-plus" title="إضافة فرد" style="color: #217346; cursor: pointer;" onclick="event.stopPropagation(); openMemberModal(${c.id}, '${c.name}')"></i>
                                                    <i class="fas fa-file-invoice" title="عرض الوثيقة" style="color: #8b5cf6; cursor: pointer;" onclick="event.stopPropagation(); openDetailsModal(${c.id})"></i>
                                                    <i class="fas fa-eye-slash" title="أرشفة (إخفاء)" style="color: #fa8c16; cursor: pointer;" onclick="event.stopPropagation(); hideCase(${c.id})"></i>
                                                    <i class="fas fa-chevron-down" id="icon-${c.id}" style="color: #666; cursor: pointer;"></i>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr id="members-of-${c.id}" style="display: none; background-color: #f9f9f9;">
                                            <td colspan="14" style="padding: 0;">
                                                <div style="display: flex; gap: 20px; padding: 20px; border-top: 1px solid #eee;">
                                                    <!-- Right Side: Tables -->
                                                    <div style="flex: 1;">
                                                        <h4 style="margin-bottom: 10px; color: #333;"><i class="fas fa-users"></i> أفراد الأسرة:</h4>
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
                                    ${filteredCases.length === 0 ? '<tr><td colspan="14" style="text-align: center; padding: 30px; color: #999;">لا توجد حالات مسجلة حالياً</td></tr>' : ''}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
                break;
            case 'donations':
                pageTitle.innerText = 'إدارة التبرعات';
                html = `
                    <div class="card">
                        <div class="card-header">
                            <h2>إضافة تبرع</h2>
                        </div>
                        <div class="form-grid" style="margin-bottom: 30px;">
                            <div class="input-group-office">
                                <label>التاريخ</label>
                                <input type="date" id="donation-date" class="office-input" value="${new Date().toISOString().split('T')[0]}">
                            </div>
                            <div class="input-group-office">
                                <label>اسم المتبرع</label>
                                <input type="text" id="donor-name" class="office-input">
                            </div>
                            <div class="input-group-office">
                                <label>المبلغ</label>
                                <input type="number" id="donation-amount" class="office-input">
                            </div>
                            <div class="input-group-office" style="grid-column: span 3; margin-top: 10px;">
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
                            <div class="input-group-office" style="grid-column: span 3; justify-content: flex-end; margin-top: 15px; display: flex; gap: 10px;">
                                <button id="save-donation-btn" class="btn-primary" onclick="addNewDonation()"><i class="fas fa-save"></i> تسجيل وتثبيت التبرع</button>
                                <button id="cancel-donation-edit" class="btn-secondary" style="display: none;" onclick="cancelDonationEdit()">إلغاء التعديل</button>
                            </div>
                        </div>
                        <table class="data-table">
                            <thead>
                                <tr><th>التاريخ</th><th>المتبرع</th><th>المبلغ</th><th>البيان</th><th>الإجراءات</th></tr>
                            </thead>
                            <tbody>
                                ${[...appData.donations].sort((a, b) => b.id - a.id).map(d => `
                                    <tr>
                                        <td>${d.date}</td>
                                        <td>${d.donor}</td>
                                        <td>${d.amount} ج.م</td>
                                        <td>${d.type}</td>
                                        <td>
                                            <div style="display: flex; gap: 10px; justify-content: center;">
                                                <i class="fas fa-edit" style="color: #217346; cursor: pointer;" onclick="prepareEditDonation(${d.id})"></i>
                                                <i class="fas fa-trash-alt" style="color: #d13438; cursor: pointer;" onclick="deleteDonation(${d.id})"></i>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
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
                            <div style="grid-column: span 1; background: #f0f7f2; padding: 15px; border-radius: 8px;">
                                <h4 style="color: #217346; margin-bottom: 15px; border-bottom: 2px solid #217346; display: inline-block;"><i class="fas fa-mars"></i> بيانات الزوج</h4>
                                <div class="input-group-office">
                                    <label>اسم الزوج</label>
                                    <input type="text" id="aff-husband-name" class="office-input" oninput="checkAffidavitDuplicates('name', this.value)">
                                    <div id="aff-husband-name-results" class="dropdown-results"></div>
                                </div>
                                <div class="input-group-office">
                                    <label>الرقم القومي للزوج</label>
                                    <input type="text" id="aff-husband-id" class="office-input" oninput="checkAffidavitDuplicates('nationalId', this.value)">
                                    <div id="aff-husband-id-results" class="dropdown-results"></div>
                                </div>
                                <div class="input-group-office">
                                    <label>هاتف الزوج</label>
                                    <input type="text" id="aff-husband-phone" class="office-input" oninput="checkAffidavitDuplicates('phone', this.value)">
                                    <div id="aff-husband-phone-results" class="dropdown-results"></div>
                                </div>
                            </div>
                            
                            <!-- Wife Info -->
                            <div style="grid-column: span 1; background: #fff1f0; padding: 15px; border-radius: 8px;">
                                <h4 style="color: #cf1322; margin-bottom: 15px; border-bottom: 2px solid #cf1322; display: inline-block;"><i class="fas fa-venus"></i> بيانات الزوجة</h4>
                                <div class="input-group-office">
                                    <label>اسم الزوجة</label>
                                    <input type="text" id="aff-wife-name" class="office-input" oninput="checkAffidavitDuplicates('spouseName', this.value)">
                                    <div id="aff-wife-name-results" class="dropdown-results"></div>
                                </div>
                                <div class="input-group-office">
                                    <label>الرقم القومي للزوجة</label>
                                    <input type="text" id="aff-wife-id" class="office-input" oninput="checkAffidavitDuplicates('spouseId', this.value)">
                                    <div id="aff-wife-id-results" class="dropdown-results"></div>
                                </div>
                                <div class="input-group-office">
                                    <label>هاتف الزوجة</label>
                                    <input type="text" id="aff-wife-phone" class="office-input" oninput="checkAffidavitDuplicates('spousePhone', this.value)">
                                    <div id="aff-wife-phone-results" class="dropdown-results"></div>
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
            if (editingCaseId) {
                const idx = appData.cases.findIndex(c => c.id === editingCaseId);
                if (idx !== -1) {
                    appData.cases[idx] = {
                        ...appData.cases[idx],
                        center, name, nationalId, job, phone, spouseName, spouseId, spousePhone,
                        familyMembers, socialStatus, type, amount, source, address, note,
                        docs: modalDocs,
                        date: dateInput || appData.cases[idx].date
                    };
                }
                editingCaseId = null;
            } else {
                const newCase = {
                    id: Date.now(),
                    center, name, nationalId, job, phone, spouseName, spouseId, spousePhone,
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
        if (confirm('هل أنت متأكد من حذف هذه الحالة؟')) {
            appData.cases = appData.cases.filter(c => c.id !== id);
            saveData();
            renderPage('cases');
        }
    };

    window.addNewDonation = () => {
        const donor = document.getElementById('donor-name').value;
        const amount = parseFloat(document.getElementById('donation-amount').value);
        const date = document.getElementById('donation-date').value || new Date().toISOString().split('T')[0];

        // Collect selected donation types
        const selectedTypes = [];
        const checks = document.querySelectorAll('#donation-types input[type="checkbox"]:checked');
        checks.forEach(c => selectedTypes.push(c.value));

        const otherType = document.getElementById('donation-type-other').value.trim();
        if (otherType) selectedTypes.push(otherType);

        if (donor && amount) {
            if (editingDonationId) {
                // For editing, we don't split again, we just update the specific record
                const idx = appData.donations.findIndex(d => d.id === editingDonationId);
                if (idx !== -1) {
                    appData.donations[idx].donor = donor;
                    appData.donations[idx].amount = amount;
                    appData.donations[idx].date = date;
                    appData.donations[idx].type = selectedTypes.join(' - ') || 'عام';
                }
                editingDonationId = null;
            } else {
                // If multiple types selected, split the amount equally
                if (selectedTypes.length > 1) {
                    const splitAmount = amount / selectedTypes.length;
                    selectedTypes.forEach(t => {
                        appData.donations.push({
                            id: Date.now() + Math.random(),
                            date,
                            donor,
                            amount: splitAmount,
                            type: t
                        });
                    });
                } else {
                    const type = selectedTypes[0] || 'عام';
                    appData.donations.push({
                        id: Date.now(),
                        date,
                        donor,
                        amount,
                        type
                    });
                }
            }
            saveData();
            renderPage('donations');
        } else {
            alert('يرجى إدخال اسم المتبرع والمبلغ');
        }
    };

    window.prepareEditDonation = (id) => {
        const d = appData.donations.find(item => item.id === id);
        if (!d) return;
        editingDonationId = id;

        document.getElementById('donor-name').value = d.donor;
        document.getElementById('donation-amount').value = d.amount;
        document.getElementById('donation-date').value = d.date;

        // Reset checkboxes
        const checks = document.querySelectorAll('#donation-types input[type="checkbox"]');
        checks.forEach(c => c.checked = false);
        document.getElementById('donation-type-other').value = '';

        const typeArr = (d.type || '').split(' - ');
        checks.forEach(c => {
            if (typeArr.includes(c.value)) c.checked = true;
        });

        document.getElementById('save-donation-btn').innerHTML = '<i class="fas fa-save"></i> حفظ التعديلات';
        document.getElementById('cancel-donation-edit').style.display = 'inline-block';
    };

    window.cancelDonationEdit = () => {
        editingDonationId = null;
        renderPage('donations');
    };

    window.deleteDonation = (id) => {
        if (confirm('هل أنت متأكد من حذف هذا التبرع؟')) {
            appData.donations = appData.donations.filter(d => d.id !== id);
            saveData();
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
            if (editingAidId) {
                const idx = appData.expenses.findIndex(e => e.id === editingAidId);
                if (idx !== -1) {
                    appData.expenses[idx] = {
                        ...appData.expenses[idx],
                        date, beneficiary, nationalId, amount, category, month, responsible, signature
                    };
                }
                editingAidId = null;
            } else {
                const newRecord = {
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
                appData.expenses.push(newRecord);

                // Synchronize with Case History
                const caseIndex = appData.cases.findIndex(c => c.name === beneficiary);
                if (caseIndex !== -1) {
                    if (!appData.cases[caseIndex].aidHistory) appData.cases[caseIndex].aidHistory = [];
                    appData.cases[caseIndex].aidHistory.push(newRecord);
                }
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
        if (!val || val.length < 2) {
            if (resultsDiv) resultsDiv.style.display = 'none';
            return;
        }

        const query = val.toLowerCase();
        // Cross-search for similar data to prevent duplicates
        const matches = appData.cases.filter(c => {
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
        }).slice(0, 10);

        if (matches.length > 0) {
            resultsDiv.innerHTML = `<div style="padding: 10px; background: #fff1f0; border-bottom: 1px solid #ffa39e; font-size: 0.8rem; color: #cf1322; font-weight: bold;">⚠️ تنبيه: بيانات مشابهة مسجلة في:</div>` +
                matches.map(c => `
                <div class="dropdown-item" style="border-right: 3px solid #f5222d;">
                    <strong>${c.name}</strong>
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
        if (confirm('هل أنت متأكد من حذف هذا المصروف؟')) {
            appData.expenses = appData.expenses.filter(e => e.id !== id);
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

    if (globalSearch) {
        globalSearch.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            window.currentSearchFilter = val;

            if (val === '') {
                renderPage('dashboard');
                return;
            }

            // Universal search across cases, donations, and expenses
            renderSearchPage(val);

            sidebarItems.forEach(i => i.classList.remove('active'));
        });
    }

    function renderSearchPage(query) {
        const q = query.toLowerCase();
        pageTitle.innerText = `نتائج البحث الشامل عن: "${query}"`;

        const ageMatch = window.calculateAgeFromID(query);
        const ageInfo = ageMatch !== null ? `<div class="status-badge" style="background: #fff1f0; color: #cf1322; font-weight: bold; font-size: 1rem; margin-bottom: 20px;">السن المقدر من الرقم القومي: ${ageMatch} سنة</div>` : '';

        // Filter Cases
        const matchesCases = appData.cases.filter(c =>
            c.name.toLowerCase().includes(q) ||
            (c.nationalId && c.nationalId.includes(q)) ||
            (c.phone && c.phone.includes(q))
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
                                    <td style="font-weight:700;">${c.name}</td>
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

        const dateFilterStr = (fromDate || toDate) ? `في الفترة من ${fromDate || 'البداية'} إلى ${toDate || 'النهاية'}` : 'لكامل السجل';

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
                    <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #217346; padding-bottom: 10px;">
                        <h2 style="color: #217346;">جمعية الخير لتنمية المجتمع بمسير</h2>
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
                    <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #217346; padding-bottom: 10px;">
                        <h2 style="color: #217346;">جمعية الخير لتنمية المجتمع بمسير</h2>
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
                <div style="font-family: 'Cairo', sans-serif; direction: rtl; padding: 10px; border: 1px solid #333; width: 100%;">
                    <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #217346; padding-bottom: 10px;">
                        <h2 style="color: #217346;">جمعية الخير لتنمية المجتمع بمسير</h2>
                        <h3>${title}</h3>
                    </div>
                    <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 0.8rem;">
                        <thead>
                            <tr style="background: #217346; color: white;">
                                <th style="padding: 5px; border: 1px solid #333;">م</th>
                                <th style="padding: 5px; border: 1px solid #333;">المركز</th>
                                <th style="padding: 5px; border: 1px solid #333;">الاسم</th>
                                <th style="padding: 5px; border: 1px solid #333;">الرقم القومي</th>
                                <th style="padding: 5px; border: 1px solid #333;">المهنة</th>
                                <th style="padding: 5px; border: 1px solid #333;">الهاتف</th>
                                <th style="padding: 5px; border: 1px solid #333;">الزوج/ة</th>
                                <th style="padding: 5px; border: 1px solid #333;">رقم قومي الزوج</th>
                                <th style="padding: 5px; border: 1px solid #333;">الأفراد</th>
                                <th style="padding: 5px; border: 1px solid #333;">الوضع</th>
                                <th style="padding: 5px; border: 1px solid #333;">التصنيف</th>
                                <th style="padding: 5px; border: 1px solid #333;">المبلغ</th>
                                <th style="padding: 5px; border: 1px solid #333;">العنوان</th>
                                <th style="padding: 5px; border: 1px solid #333;">ملاحظات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${dataSlice.map((c, idx) => `
                                <tr>
                                    <td style="padding: 4px; border: 1px solid #ccc;">${fromIdx + idx}</td>
                                    <td style="padding: 4px; border: 1px solid #ccc;">${c.center || '-'}</td>
                                    <td style="padding: 4px; border: 1px solid #ccc; font-weight: bold;">${c.name}</td>
                                    <td style="padding: 4px; border: 1px solid #ccc;">${c.nationalId || '-'}</td>
                                    <td style="padding: 4px; border: 1px solid #ccc;">${c.job || '-'}</td>
                                    <td style="padding: 4px; border: 1px solid #ccc;">${c.phone || '-'}</td>
                                    <td style="padding: 4px; border: 1px solid #ccc;">${c.spouseName || '-'}</td>
                                    <td style="padding: 4px; border: 1px solid #ccc;">${c.spouseId || '-'}</td>
                                    <td style="padding: 4px; border: 1px solid #ccc;">${c.familyMembers || '-'}</td>
                                    <td style="padding: 4px; border: 1px solid #ccc;">${c.socialStatus || '-'}</td>
                                    <td style="padding: 4px; border: 1px solid #ccc; font-size: 0.7rem;">${c.type || '-'}</td>
                                    <td style="padding: 4px; border: 1px solid #ccc; font-weight: bold; color: #217346;">${c.amount || 0}</td>
                                    <td style="padding: 4px; border: 1px solid #ccc;">${c.address || '-'}</td>
                                    <td style="padding: 4px; border: 1px solid #ccc; font-size: 0.7rem;">${c.note || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div style="margin-top: 30px; text-align: left; padding-left: 50px;">
                        <p>توقيع الموظف المختص / .....................</p>
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
            <div style="font-family: 'Cairo', sans-serif; color: #333; max-width: 800px; margin: 20px auto; border: 1px solid #ddd; padding: 50px; border-radius: 0; background: #fff; box-shadow: 0 0 30px rgba(0,0,0,0.15); min-height: 1000px; display: flex; flex-direction: column; position: relative;">
                
                <!-- Header with Logo and Title -->
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #217346; padding-bottom: 20px; margin-bottom: 30px;">
                    <div style="text-align: right;">
                        <h1 style="color: #217346; margin: 0; font-size: 1.8rem; font-weight: 800;">جمعية الخير لتنمية المجتمع بمسير</h1>
                    </div>
                    <div style="text-align: center;">
                        <div style="width: 80px; height: 80px; background: #217346; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white;">
                             <i class="fas fa-hand-holding-heart" style="font-size: 2.5rem;"></i>
                        </div>
                    </div>
                </div>

                <div style="text-align: center; margin-bottom: 30px;">
                    <h2 style="display: inline-block; background: #f0f7f2; color: #217346; padding: 10px 40px; border: 1.5px solid #217346; border-radius: 50px; font-size: 1.2rem; font-weight: 800;">استمارة بـحـث اجـتـمـاعـي</h2>
                </div>

                <!-- Main Data Grid -->
                <div style="display: flex; gap: 30px; margin-bottom: 30px;">
                    <div style="flex: 1;">
                        <table style="width: 100%; border-collapse: separate; border-spacing: 0 12px;">
                            <tr>
                                <td style="width: 130px; font-weight: 800; color: #217346;"><i class="fas fa-user-tag"></i> اسـم الـحـالـة:</td>
                                <td style="border-bottom: 1px dashed #bbb; padding-bottom: 5px; font-size: 1.1rem; font-weight: 700;">${c.name}</td>
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

                <!-- Family & Status -->
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

                <!-- Family Members Table -->
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

                <!-- Aid History -->
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
                ` : ''}


                <!-- Footer Signatures -->
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

                <!-- Stamp Area -->
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

    // --- UNIVERSAL GLOBAL SEARCH ---
    window.performGlobalSearch = (val) => {
        const resultsDiv = document.getElementById('global-search-results');
        if (!val || val.length < 1) {
            resultsDiv.style.display = 'none';
            return;
        }

        const query = window.normalizeArabic(val);
        const matches = [];

        // Search Cases
        appData.cases.forEach(c => {
            if (window.normalizeArabic(c.name).includes(query) ||
                (c.nationalId && c.nationalId.includes(query)) ||
                (c.phone && c.phone.includes(query)) ||
                (c.spouseName && window.normalizeArabic(c.spouseName).includes(query))) {
                matches.push({ type: 'حالة', name: c.name, sub: c.nationalId || c.phone, id: c.id, page: 'cases' });
            }
        });

        // Search Donations
        appData.donations.forEach(d => {
            if (window.normalizeArabic(d.donor).includes(query)) {
                matches.push({ type: 'تبرع', name: d.donor, sub: `${d.amount} ج.م - ${d.type}`, id: d.id, page: 'donations' });
            }
        });

        // Search Aid (Expenses)
        (appData.expenses || []).forEach(e => {
            if (window.normalizeArabic(e.beneficiary).includes(query)) {
                matches.push({ type: 'صرف مساعدات', name: e.beneficiary, sub: `${e.amount} - ${e.category}`, id: e.id, page: 'expenses' });
            }
        });

        // Search Affidavits
        (appData.affidavits || []).forEach(aff => {
            if (window.normalizeArabic(aff.husName).includes(query) || window.normalizeArabic(aff.wifeName).includes(query)) {
                matches.push({ type: 'إفادة مسجلة', name: `${aff.husName} / ${aff.wifeName}`, sub: `بتاريخ: ${aff.date}`, id: aff.id, page: 'affidavit' });
            }
        });

        if (matches.length > 0) {
            resultsDiv.innerHTML = matches.slice(0, 15).map(m => `
                <div class="dropdown-item" onclick="navigateToResult('${m.page}', ${m.id}, '${m.name}')">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong>${m.name}</strong>
                        <span class="status-badge" style="font-size: 0.65rem; background: #eef2f7;">${m.type}</span>
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

    window.navigateToResult = (page, id, name) => {
        document.getElementById('global-search-results').style.display = 'none';
        document.getElementById('global-search').value = '';

        // Use a filter to highlight the case in the cases page
        if (page === 'cases') {
            window.currentSearchFilter = name;
        }

        const item = document.querySelector(`.sidebar-nav li[data-page="${page}"]`);
        if (item) item.click();
    };

    // --- AFFIDAVIT DUPLICATE CHECK ---
    window.checkAffidavitDuplicates = (field, val) => {
        const resultsDivId = `aff-${field.startsWith('spouse') ? 'wife' : 'husband'}-${field.includes('name') ? 'name' : (field.includes('Id') ? 'id' : 'phone')}-results`;
        const resultsDiv = document.getElementById(resultsDivId);

        if (!val || val.length < 2) {
            if (resultsDiv) resultsDiv.style.display = 'none';
            return;
        }

        const query = window.normalizeArabic(val);
        const matches = [];

        // Search Cases
        appData.cases.forEach(c => {
            const husbandVal = field.startsWith('spouse') ? c.spouseName : c.name;
            const husbandId = field.startsWith('spouse') ? c.spouseId : c.nationalId;
            const husbandPhone = field.startsWith('spouse') ? c.spousePhone : c.phone;

            let matchFound = false;
            if (field.includes('name') && window.normalizeArabic(husbandVal || '').includes(query)) matchFound = true;
            if (field.includes('Id') && (husbandId || '').includes(query)) matchFound = true;
            if (field.includes('phone') && (husbandPhone || '').includes(query)) matchFound = true;

            if (matchFound) {
                matches.push({ type: 'حالة مسجلة', name: c.name, id: c.id, page: 'cases' });
            }
        });

        // Search Donations
        appData.donations.forEach(d => {
            if (field.includes('name') && window.normalizeArabic(d.donor || '').includes(query)) {
                matches.push({ type: 'متبرع', name: d.donor, id: d.id, page: 'donations' });
            }
        });

        // Search Aid (Expenses)
        (appData.expenses || []).forEach(e => {
            if (field.includes('name') && window.normalizeArabic(e.beneficiary || '').includes(query)) {
                matches.push({ type: 'مستفيد مساعدة', name: e.beneficiary, id: e.id, page: 'expenses' });
            }
        });

        if (matches.length > 0) {
            const uniqueMatches = [];
            const seen = new Set();
            matches.forEach(m => {
                const key = `${m.type}-${m.name}`;
                if (!seen.has(key)) {
                    uniqueMatches.push(m);
                    seen.add(key);
                }
            });

            resultsDiv.innerHTML = uniqueMatches.slice(0, 5).map(m => `
                <div class="dropdown-item" onclick="navigateToResult('${m.page}', ${m.id}, '${m.name}')">
                    <strong>${m.name}</strong>
                    <span style="font-size: 0.75rem; color: #d13438; font-weight: 700;">(${m.type}!)</span>
                </div>
            `).join('');
            resultsDiv.style.display = 'block';
        } else {
            if (resultsDiv) resultsDiv.style.display = 'none';
        }
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
                <div style="text-align: center; border-bottom: 3px solid #217346; padding-bottom: 20px; margin-bottom: 40px;">
                    <h1 style="color: #217346; margin: 0; font-size: 2rem; font-weight: 900;">جمعية الخير لتنمية المجتمع بمسير</h1>
                    <h3 style="margin-top: 10px; font-weight: 700;">وثيقة إفادة استعلام رسمية</h3>
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
        if (confirm('هل أنت متأكد من حذف هذا السجل من الأرشيف؟')) {
            appData.affidavits = appData.affidavits.filter(a => a.id !== id);
            saveData();
            renderPage('affidavit');
        }
    };
});
