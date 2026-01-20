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
        expenses: []
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
        // Dynamically collect all categories from donations, case sources, and expenses
        const donationCats = appData.donations.map(d => d.type).flatMap(t => t.split(' - ')).filter(Boolean);
        const caseSources = appData.cases.map(c => c.source).filter(Boolean);
        const expenseCats = (appData.expenses || []).map(e => e.category).filter(Boolean);

        // Create a unique set of all categories
        const dynamicCategories = [...new Set([...donationCats, ...caseSources, ...expenseCats])];
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
                                    ${filteredCases.map((c, index) => {
                    const members = c.members || [];
                    return `
                                        <tr class="main-case-row" onclick="toggleFamilyMembers(${c.id})">
                                            <td>${index + 1}</td>
                                            <td style="font-size: 0.8rem;">${c.date || '-'}</td>
                                            <td>${c.center || '-'}</td>
                                            <td style="font-weight: 700; color: var(--accent-color); cursor: pointer;">
                                                <i class="fas fa-chevron-down" id="icon-${c.id}" style="font-size: 0.7rem; margin-left: 5px;"></i>
                                                ${c.name}
                                            </td>
                                            <td>${c.nationalId || '-'}</td>
                                            <td>${c.job || '-'}</td>
                                            <td>${c.phone || '-'}</td>
                                            <td>${c.familyMembers || '-'}</td>
                                            <td>${c.socialStatus || '-'}</td>
                                            <td style="font-size: 0.75rem;">${c.type || '-'}</td>
                                            <td style="font-weight: 700;">${c.source || '-'}</td>
                                            <td style="color: #217346; font-weight: 700;">${c.amount || 0} ج.م</td>
                                            <td style="font-size: 0.8rem;">${c.address || '-'}</td>
                                            <td onclick="event.stopPropagation()">
                                                <div style="display: flex; gap: 8px; justify-content: center; align-items: center;">
                                                    <button class="btn-primary" style="padding: 4px 10px; font-size: 0.75rem; background: #0078d4; border-radius: 4px;" 
                                                        onclick="openMemberModal(${c.id}, '${c.name}')">
                                                        <i class="fas fa-user-plus"></i> فرد
                                                    </button>
                                                    <button class="btn-primary" style="padding: 4px 10px; font-size: 0.75rem; background: #217346; border-radius: 4px;" 
                                                        onclick="showCaseDetails(${c.id})">
                                                        <i class="fas fa-file-alt"></i> عرض التفاصيل
                                                    </button>
                                                    <button class="btn-primary" style="padding: 4px 10px; font-size: 0.75rem; background: #666; border-radius: 4px;" 
                                                        onclick="hideCase(${c.id})">
                                                        <i class="fas fa-eye-slash"></i> تصدير للمخفية
                                                    </button>
                                                    <i class="fas fa-trash-alt" style="color: #d13438; cursor: pointer; padding: 5px; font-size: 1.1rem;" onclick="deleteCase(${c.id})" title="حذف الحالة"></i>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr id="members-of-${c.id}" class="family-members-row" style="display: ${expandedCaseId === c.id ? 'table-row' : 'none'};">
                                            <td colspan="15" style="padding: 15px; background: #fbfbfb;">
                                                <div style="display: flex; gap: 30px; align-items: stretch; flex-wrap: wrap;">
                                                    
                                                    <!-- Left: Photos Section -->
                                                    <div style="flex: 1; min-width: 320px; background: white; border: 1px solid #e1e1e1; border-radius: 12px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); display: flex; gap: 20px; justify-content: space-around;">
                                                        <div class="image-preview-box" style="text-align: center;">
                                                            <span style="font-size: 0.9rem; font-weight: 700; color: #444; display: block; margin-bottom: 12px; border-bottom: 2px solid #ddd; padding-bottom: 5px;">صورة الحالة</span>
                                                            <div id="photo-square-${c.id}" class="clickable-square">
                                                                ${c.photoUrl ? `
                                                                    <div class="img-container" style="width: 130px; height: 130px; position: relative;">
                                                                        <img src="${c.photoUrl}" alt="Photo" onclick="openImageViewer('${c.photoUrl}')" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; cursor: zoom-in;">
                                                                        <button class="mini-btn-remove" onclick="removeImage(${c.id}, 'photo')" style="position: absolute; top: -5px; left: -5px; background: #d13438; color: white; border: none; border-radius: 4px; padding: 2px 6px; cursor: pointer;"><i class="fas fa-times"></i></button>
                                                                    </div>
                                                                ` : `
                                                                    <div class="no-img" onclick="triggerUpload(${c.id}, 'photo')" style="width: 130px; height: 130px; border: 2px dashed #ccc; background: #f9f9f9; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; border-radius: 8px;">
                                                                        <i class="fas fa-camera fa-2x" style="color: #bbb;"></i>
                                                                        <span style="font-size: 0.7rem; color: #999; margin-top: 5px;">إضافة صورة</span>
                                                                    </div>
                                                                `}
                                                            </div>
                                                        </div>
                                                        <div class="image-preview-box" style="text-align: center;">
                                                            <span style="font-size: 0.9rem; font-weight: 700; color: #444; display: block; margin-bottom: 12px; border-bottom: 2px solid #ddd; padding-bottom: 5px;">صورة البطاقة</span>
                                                            <div id="idcard-square-${c.id}" class="clickable-square">
                                                                ${c.idCardUrl ? `
                                                                    <div class="img-container" style="width: 130px; height: 130px; position: relative;">
                                                                        <img src="${c.idCardUrl}" alt="ID Card" onclick="openImageViewer('${c.idCardUrl}')" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; cursor: zoom-in;">
                                                                        <button class="mini-btn-remove" onclick="removeImage(${c.id}, 'idCard')" style="position: absolute; top: -5px; left: -5px; background: #d13438; color: white; border: none; border-radius: 4px; padding: 2px 6px; cursor: pointer;"><i class="fas fa-times"></i></button>
                                                                    </div>
                                                                ` : `
                                                                    <div class="no-img" onclick="triggerUpload(${c.id}, 'idCard')" style="width: 130px; height: 130px; border: 2px dashed #ccc; background: #f9f9f9; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; border-radius: 8px;">
                                                                        <i class="fas fa-id-card fa-2x" style="color: #bbb;"></i>
                                                                        <span style="font-size: 0.7rem; color: #999; margin-top: 5px;">إضافة بطاقة</span>
                                                                    </div>
                                                                `}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <!-- Right: Family Members Table Section -->
                                                    <div style="flex: 2; min-width: 400px; background: white; border: 1px solid #e1e1e1; border-radius: 12px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                                                        <div style="border-bottom: 2px solid #217346; margin-bottom: 15px; display: inline-block;">
                                                            <h4 style="color: #333; font-size: 1.1rem; margin-bottom: 4px;">أفراد الأسرة المسجلين</h4>
                                                        </div>
                                                        ${members.length > 0 ? `
                                                            <table class="data-table" style="min-width: 100%; border: 1px solid #eee; background: white;">
                                                                <thead style="background: #fdfdfd;">
                                                                    <tr>
                                                                        <th>الاسم</th><th>الرقم القومي</th><th>الصلة</th><th>السن</th><th>المهنة / التعليم</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    ${members.map(m => `
                                                                        <tr>
                                                                            <td style="font-weight: 700; color: #333;">${m.name}</td>
                                                                            <td>${m.idNo || '-'}</td>
                                                                            <td><span class="status-badge" style="background: #eef2f7; color: #475569; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem;">${m.relation}</span></td>
                                                                            <td>${m.age} سنة</td>
                                                                            <td style="color: #666;">${m.job || '-'}</td>
                                                                        </tr>
                                                                    `).join('')}
                                                                </tbody>
                                                            </table>
                                                        ` : `
                                                            <div style="text-align: center; padding: 20px; color: #999; border: 1px dashed #ddd; border-radius: 8px;">
                                                                <i class="fas fa-users-slash fa-2x" style="margin-bottom: 10px;"></i>
                                                                <p>لا يوجد أفراد مسجلين لهذه الأسرة.</p>
                                                            </div>
                                                        `}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                        `;
                }).reverse().join('')}
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
                            <div class="input-group-office" style="grid-column: span 3; justify-content: flex-end; margin-top: 15px;">
                                <button class="btn-primary" onclick="addNewDonation()"><i class="fas fa-save"></i> تسجيل وتثبيت التبرع</button>
                            </div>
                        </div>
                        <table class="data-table">
                            <thead>
                                <tr><th>التاريخ</th><th>المتبرع</th><th>المبلغ</th><th>البيان</th></tr>
                            </thead>
                            <tbody>
                                ${appData.donations.map(d => `
                                    <tr>
                                        <td>${d.date}</td>
                                        <td>${d.donor}</td>
                                        <td>${d.amount} ج.م</td>
                                        <td>${d.type}</td>
                                    </tr>
                                `).reverse().join('')}
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
                            <div class="input-group-office" style="justify-content: flex-end; grid-column: span 1; align-self: end;">
                                <button class="btn-primary" onclick="addNewAidRecord()"><i class="fas fa-check-double"></i> تأكيد صرف المساعدة</button>
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
                                ${(appData.expenses || []).map(e => `
                                    <tr>
                                        <td>${e.date}</td>
                                        <td style="font-weight: 700; color: #333;">${e.beneficiary || '-'}</td>
                                        <td style="font-size: 0.8rem;">${e.nationalId || '-'}</td>
                                        <td style="color: #cf1322; font-weight: 700;">${e.amount}</td>
                                        <td><span class="status-badge" style="background: #eef2f7; color: #475569;">${e.category || '-'}</span></td>
                                        <td>${e.month || '-'}</td>
                                        <td>${e.responsible || '-'}</td>
                                        <td style="font-size: 0.8rem;">${e.signature || '-'}</td>
                                        <td><i class="fas fa-trash-alt" style="color: #d13438; cursor: pointer;" onclick="deleteExpense(${e.id})"></i></td>
                                    </tr>
                                `).reverse().join('')}
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
                                    ${hiddenCases.map((c, index) => `
                                        <tr>
                                            <td>${index + 1}</td>
                                            <td>${c.center || '-'}</td>
                                            <td style="font-weight: 700;">${c.name}</td>
                                            <td>${c.nationalId || '-'}</td>
                                            <td>${c.socialStatus || '-'}</td>
                                            <td>${c.type || '-'}</td>
                                            <td>
                                                <div style="display: flex; gap: 10px; justify-content: center;">
                                                    <button class="btn-primary" style="background: #217346; font-size: 0.8rem;" onclick="restoreCase(${c.id})">
                                                        <i class="fas fa-eye"></i> تصدير للإظهار
                                                    </button>
                                                    <i class="fas fa-trash-alt" style="color: #d13438; cursor: pointer; padding: 5px;" onclick="deleteCase(${c.id})"></i>
                                                </div>
                                            </td>
                                        </tr>
                                    `).reverse().join('')}
                                    ${hiddenCases.length === 0 ? '<tr><td colspan="7" style="text-align: center; padding: 30px; color: #999;">لا توجد حالات مخفية حالياً</td></tr>' : ''}
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
        }
        contentArea.innerHTML = html;
    }

    // --- CASE MODAL ACTIONS ---
    window.openCaseModal = () => {
        document.getElementById('case-modal').style.display = 'flex';
        // Auto-fill today's date
        document.getElementById('modal-case-date').value = new Date().toISOString().split('T')[0];
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
        const resultDivs = ['case-name-results', 'case-id-results', 'case-phone-results', 'case-spouse-name-results', 'case-spouse-id-results'];
        resultDivs.forEach(id => {
            const d = document.getElementById(id);
            if (d) d.style.display = 'none';
        });
    };

    window.addNewCaseFromModal = () => {
        const center = document.getElementById('modal-case-center').value;
        const name = document.getElementById('modal-case-name').value;
        const nationalId = document.getElementById('modal-case-national-id').value;
        const job = document.getElementById('modal-case-job').value;
        const phone = document.getElementById('modal-case-phone').value;
        const spouseName = document.getElementById('modal-case-spouse-name').value;
        const spouseId = document.getElementById('modal-case-spouse-id').value;
        const familyMembers = document.getElementById('modal-case-family').value;
        const socialStatus = document.getElementById('modal-case-social').value;

        // Collect selected types
        const selectedTypes = [];
        const checks = document.querySelectorAll('#modal-case-types input[type="checkbox"]:checked');
        checks.forEach(c => selectedTypes.push(c.value));
        const type = selectedTypes.join(' - ');

        const amount = document.getElementById('modal-case-amount').value;
        const source = document.getElementById('modal-case-source').value;
        const dateInput = document.getElementById('modal-case-date').value;
        const address = document.getElementById('modal-case-address').value;
        const note = document.getElementById('modal-case-note').value;

        if (name) {
            const newCase = {
                id: Date.now(),
                center,
                name,
                nationalId,
                job,
                phone,
                spouseName,
                spouseId,
                familyMembers,
                socialStatus,
                type,
                amount,
                source,
                address,
                note,
                status: 'قيد الدراسة',
                date: dateInput || new Date().toISOString().split('T')[0]
            };
            appData.cases.push(newCase);
            saveData();
            closeCaseModal();
            renderPage('cases');
        } else {
            alert('يرجى إدخال اسم الحالة على الأقل');
        }
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

        const type = selectedTypes.join(' - ') || 'عام';

        if (donor && amount) {
            const newDonation = {
                id: Date.now(),
                date,
                donor,
                amount,
                type
            };
            appData.donations.push(newDonation);
            saveData();
            renderPage('donations');
        } else {
            alert('يرجى إدخال اسم المتبرع والمبلغ');
        }
    };

    window.addNewAidRecord = () => {
        const date = document.getElementById('aid-date').value;
        const beneficiary = document.getElementById('aid-beneficiary').value;
        const nationalId = document.getElementById('aid-national-id').value;
        const amount = document.getElementById('aid-amount').value;
        const category = document.getElementById('aid-category').value;
        const month = document.getElementById('aid-month').value;
        const responsible = document.getElementById('aid-responsible').value;
        const signature = document.getElementById('aid-signature').value;

        if (beneficiary && amount) {
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

            saveData();
            renderPage('expenses');
        } else {
            alert('يرجى اختيار اسم المستفيد والمبلغ/الكمية');
        }
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
            'spouseId': 'case-spouse-id-results'
        };
        const resultsDiv = document.getElementById(fieldMap[field]);
        if (!val || val.length < 2) {
            if (resultsDiv) resultsDiv.style.display = 'none';
            return;
        }

        const query = val.toLowerCase();
        // For spouse name/id, we check if they exist in either the main or spouse fields of other records
        const matches = appData.cases.filter(c => {
            const valCheck = (c[field] && c[field].toString().toLowerCase().includes(query));
            // Cross-check for IDs and names if it belongs to a person
            if (field === 'name' || field === 'spouseName') {
                return (c.name && c.name.toLowerCase().includes(query)) || (c.spouseName && c.spouseName.toLowerCase().includes(query));
            }
            if (field === 'nationalId' || field === 'spouseId') {
                return (c.nationalId && c.nationalId.includes(query)) || (c.spouseId && c.spouseId.includes(query));
            }
            return valCheck;
        }).slice(0, 10);

        if (matches.length > 0) {
            resultsDiv.innerHTML = `<div style="padding: 10px; background: #fff1f0; border-bottom: 1px solid #ffa39e; font-size: 0.8rem; color: #cf1322; font-weight: bold;">⚠️ تنبيه: بيانات مشابهة مسجلة في:</div>` +
                matches.map(c => `
                <div class="dropdown-item" style="border-right: 3px solid #f5222d;">
                    <strong>${c.name}</strong>
                    <span style="font-size: 0.75rem; color: #666;">القومي: ${c.nationalId || '-'} | العنوان: ${c.address || '-'}</span>
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
                            ${matchesCases.map(c => {
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
                            ${matchesDonations.map(d => `
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
                            ${matchesAid.map(e => {
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
        const resultsContainer = document.getElementById('report-results-container');
        const reportArea = document.getElementById('printable-report-area');

        if (!fromDate || !toDate) {
            alert('يرجى تحديد الفترة الزمنية (من وإلى)');
            return;
        }

        let data = [];
        let title = "";
        let total = 0;

        if (type === 'donations') {
            title = `تقرير التبرعات الواردة في الفترة من ${fromDate} إلى ${toDate} `;
            data = appData.donations.filter(d => d.date >= fromDate && d.date <= toDate);
            total = data.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

            reportArea.innerHTML = `
                <div style="font-family: 'Cairo', sans-serif; direction: rtl; padding: 20px; border: 1px solid #333;">
                    <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #217346; padding-bottom: 10px;">
                        <h2 style="color: #217346;">جمعية الخير لتنمية المجتمع بمسير</h2>
                        <h3>${title}</h3>
                    </div>
                    <table style="width: 100%; border-collapse: collapse; text-align: center;">
                        <thead>
                            <tr style="background: #217346; color: white;">
                                <th style="padding: 10px; border: 1px solid #333;">التاريخ</th>
                                <th style="padding: 10px; border: 1px solid #333;">الاسم</th>
                                <th style="padding: 10px; border: 1px solid #333;">المبلغ</th>
                                <th style="padding: 10px; border: 1px solid #333;">البيان</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.map(d => `
                                <tr>
                                    <td style="padding: 8px; border: 1px solid #ccc;">${d.date}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc;">${d.donor}</td>
                                    <td style="padding: 8px; border: 1px solid #ccc; font-weight: bold;">${parseFloat(d.amount).toLocaleString()} ج.م</td>
                                    <td style="padding: 8px; border: 1px solid #ccc;">${d.type}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr style="background: #eee;">
                                <td colspan="2" style="padding: 10px; border: 1px solid #333; font-weight: bold;">الإجمالي الكلي</td>
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
            title = `تقرير المساعدات المنصرفة للحالات في الفترة من ${fromDate} إلى ${toDate}`;
            data = (appData.expenses || []).filter(e => e.date >= fromDate && e.date <= toDate);
            total = data.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

            reportArea.innerHTML = `
                <div style="font-family: 'Cairo', sans-serif; direction: rtl; padding: 20px; border: 1px solid #333;">
                    <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #217346; padding-bottom: 10px;">
                        <h2 style="color: #217346;">جمعية الخير لتنمية المجتمع بمسير</h2>
                        <h3>${title}</h3>
                    </div>
                    <table style="width: 100%; border-collapse: collapse; text-align: center;">
                        <thead>
                            <tr style="background: #217346; color: white;">
                                <th style="padding: 10px; border: 1px solid #333;">التاريخ</th>
                                <th style="padding: 10px; border: 1px solid #333;">المستفيد</th>
                                <th style="padding: 10px; border: 1px solid #333;">المبلغ/الكمية</th>
                                <th style="padding: 10px; border: 1px solid #333;">جهة التبرع</th>
                                <th style="padding: 10px; border: 1px solid #333;">المسؤول</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.map(e => `
                                <tr>
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
                                <td colspan="2" style="padding: 10px; border: 1px solid #333; font-weight: bold;">إجمالي المبالغ المنصرفة</td>
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
            title = `سجل الحالات المسجلة في الفترة من ${fromDate} إلى ${toDate}`;
            data = appData.cases.filter(c => c.date >= fromDate && c.date <= toDate && !c.hidden);

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
                            ${data.map((c, idx) => `
                                <tr>
                                    <td style="padding: 4px; border: 1px solid #ccc;">${idx + 1}</td>
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
        const printWindow = window.open('', '_blank');
        const type = document.getElementById('report-type').value;
        printWindow.document.write(`
            <html>
                <head>
                    <title>طباعة تقرير</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
                        body { direction: rtl; margin: 0; padding: 0; }
                        @media print {
                            @page { 
                                size: ${type === 'cases' ? 'A4 landscape' : 'A4 portrait'};
                                margin: 5mm;
                            }
                        }
                    </style>
                </head>
                <body onload="window.print(); window.close();">
                    <div style="width: 100%;">
                        ${content}
                    </div>
                </body>
            </html>
        `);
        printWindow.document.close();
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
    window.showCaseDetails = (id) => {
        const c = appData.cases.find(item => item.id === id);
        if (!c) return;

        const members = c.members || [];
        const content = `
            <div style="font-family: 'Cairo', sans-serif; color: #333; max-width: 800px; margin: auto; border: 2px solid #217346; padding: 20px; border-radius: 15px; background: #fff; position: relative; overflow: hidden; font-size: 0.9rem;">
                <!-- Watermark / Design -->
                <div style="position: absolute; top: -50px; left: -50px; width: 150px; height: 150px; background: #217346; opacity: 0.05; border-radius: 50%;"></div>
                
                <div style="text-align: center; border-bottom: 2px double #217346; padding-bottom: 10px; margin-bottom: 15px;">
                    <h1 style="color: #217346; margin: 0; font-size: 1.6rem;">جمعية الخير لتنمية المجتمع بمسير</h1>
                    <p style="margin: 2px 0; color: #666; font-weight: 700; font-size: 0.9rem;">استمارة بحث اجتماعي وتفاصيل الحالة</p>
                </div>

                <div style="display: flex; gap: 20px; margin-bottom: 15px; align-items: flex-start;">
                    <div style="flex: 1;">
                         <table style="width: 100%; border-collapse: collapse;">
                            <tr><td style="padding: 4px; font-weight: 800; color: #217346; width: 120px;">الاسم:</td><td style="padding: 4px; border-bottom: 1px solid #eee;">${c.name}</td></tr>
                            <tr><td style="padding: 4px; font-weight: 800; color: #217346;">الرقم القومي:</td><td style="padding: 4px; border-bottom: 1px solid #eee;">${c.nationalId || '-'}</td></tr>
                            <tr><td style="padding: 4px; font-weight: 800; color: #217346;">المركز:</td><td style="padding: 4px; border-bottom: 1px solid #eee;">${c.center || '-'}</td></tr>
                            <tr><td style="padding: 4px; font-weight: 800; color: #217346;">العنوان:</td><td style="padding: 4px; border-bottom: 1px solid #eee;">${c.address || '-'}</td></tr>
                            <tr><td style="padding: 4px; font-weight: 800; color: #217346;">المهنة:</td><td style="padding: 4px; border-bottom: 1px solid #eee;">${c.job || '-'}</td></tr>
                            <tr><td style="padding: 4px; font-weight: 800; color: #217346;">رقم الهاتف:</td><td style="padding: 4px; border-bottom: 1px solid #eee;">${c.phone || '-'}</td></tr>
                         </table>
                    </div>
                    <div style="width: 150px; text-align: center; display: flex; flex-direction: column; gap: 10px;">
                        <div>
                            <span style="display: block; font-size: 0.7rem; color: #999; margin-bottom: 2px;">صورة الحالة</span>
                            <img src="${c.photoUrl || 'https://via.placeholder.com/150'}" style="width: 100%; height: 150px; object-fit: cover; border: 2px solid #217346; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                        </div>
                        ${c.idCardUrl ? `
                        <div>
                            <span style="display: block; font-size: 0.7rem; color: #999; margin-bottom: 2px;">صورة البطاقة</span>
                            <img src="${c.idCardUrl}" style="width: 100%; height: 150px; object-fit: cover; border: 2px solid #217346; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                        </div>
                        ` : ''}
                    </div>
                </div>

                <div style="margin-bottom: 15px;">
                    <h3 style="background: #217346; color: white; padding: 5px 12px; border-radius: 5px; font-size: 0.9rem; margin-bottom: 8px;">البيانات الأسرية والاجتماعية</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 4px; font-weight: 800; color: #217346; width: 140px;">اسم الزوج/ة:</td><td style="padding: 4px; border-bottom: 1px solid #eee;">${c.spouseName || '-'}</td></tr>
                        <tr><td style="padding: 4px; font-weight: 800; color: #217346;">الرقم القومي للزوج/ة:</td><td style="padding: 4px; border-bottom: 1px solid #eee;">${c.spouseId || '-'}</td></tr>
                        <tr><td style="padding: 4px; font-weight: 800; color: #217346; width: 140px;">الوضع الاجتماعي:</td><td style="padding: 4px; border-bottom: 1px solid #eee;">${c.socialStatus || '-'}</td></tr>
                        <tr><td style="padding: 4px; font-weight: 800; color: #217346;">جهة التبرع:</td><td style="padding: 4px; border-bottom: 1px solid #eee;">${c.source || '-'}</td></tr>
                        <tr><td style="padding: 4px; font-weight: 800; color: #217346;">نوع المساعدة:</td><td style="padding: 4px; border-bottom: 1px solid #eee;">${c.type || '-'}</td></tr>
                        <tr><td style="padding: 4px; font-weight: 800; color: #217346;">قيمة المساعدة:</td><td style="padding: 4px; border-bottom: 1px solid #eee; font-weight: 700;">${c.amount || 0} ج.م</td></tr>
                    </table>
                </div>

                <div style="margin-bottom: 15px;">
                    <h3 style="background: #217346; color: white; padding: 5px 12px; border-radius: 5px; font-size: 0.9rem; margin-bottom: 8px;">أفراد الأسرة</h3>
                    ${members.length > 0 ? `
                        <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 0.85rem;">
                            <thead>
                                <tr style="background: #f8f9fa;">
                                    <th style="padding: 6px; border: 1px solid #eee;">الاسم</th>
                                    <th style="padding: 6px; border: 1px solid #eee;">الصلة</th>
                                    <th style="padding: 6px; border: 1px solid #eee;">السن</th>
                                    <th style="padding: 6px; border: 1px solid #eee;">المهنة / الدراسة</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${members.map(m => `
                                    <tr>
                                        <td style="padding: 5px; border: 1px solid #eee;">${m.name}</td>
                                        <td style="padding: 5px; border: 1px solid #eee;">${m.relation}</td>
                                        <td style="padding: 5px; border: 1px solid #eee;">${m.age} سنة</td>
                                        <td style="padding: 5px; border: 1px solid #eee;">${m.job || '-'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : '<p style="color: #999; text-align: center; font-size: 0.8rem; margin: 0;">لا يوجد أفراد مسجلين.</p>'}
                </div>

                <div style="margin-bottom: 15px;">
                    <h3 style="background: #217346; color: white; padding: 5px 12px; border-radius: 5px; font-size: 0.9rem; margin-bottom: 8px;">سجل المساعدات المصروفة</h3>
                    ${(c.aidHistory && c.aidHistory.length > 0) ? `
                        <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 0.85rem;">
                            <thead>
                                <tr style="background: #f8f9fa;">
                                    <th style="padding: 6px; border: 1px solid #eee;">التاريخ</th>
                                    <th style="padding: 6px; border: 1px solid #eee;">المبلغ/الكمية</th>
                                    <th style="padding: 6px; border: 1px solid #eee;">جهة التبرع</th>
                                    <th style="padding: 6px; border: 1px solid #eee;">الشهر</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${c.aidHistory.slice(-5).map(h => `
                                    <tr>
                                        <td style="padding: 5px; border: 1px solid #eee;">${h.date}</td>
                                        <td style="padding: 5px; border: 1px solid #eee; font-weight: 700;">${h.amount}</td>
                                        <td style="padding: 5px; border: 1px solid #eee;">${h.category}</td>
                                        <td style="padding: 5px; border: 1px solid #eee;">${h.month || '-'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : '<p style="color: #999; text-align: center; font-size: 0.8rem; margin: 0;">لا توجد مساعدات منصرفة مسجلة مسبقاً.</p>'}
                </div>

                <div style="margin-top: 20px; display: flex; justify-content: space-between; padding: 10px 20px; border-top: 1px solid #eee; font-size: 0.85rem; font-style: italic; color: #666;">
                    <span>توقيع الباحث: ...............................</span>
                    <span>يعتمد،، مدير الجمعية</span>
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
        const printContents = document.getElementById(divId).innerHTML;
        const originalContents = document.body.innerHTML;
        document.body.innerHTML = printContents;
        window.print();
        document.body.innerHTML = originalContents;
        window.location.reload(); // Reload to restore event listeners and app state
    };
});

