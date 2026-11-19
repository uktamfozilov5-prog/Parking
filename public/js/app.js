/**
 * SmartPark Pro - Main Application Logic
 */

let currentUser = null;
let currentSpots = [];
let currentStats = null;
let selectedSpotForPark = null;
let liveTimerInterval = null;
let autoRefreshInterval = null;

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
    initRequestForm();
    initTelegramTheme();
    const footerYear = document.getElementById('footer-year');
    if (footerYear) footerYear.textContent = new Date().getFullYear();
    initApp();
});

function initTelegramTheme() {
    if (!window.Telegram || !window.Telegram.WebApp) return;
    const themeParams = window.Telegram.WebApp.themeParams || {};
    if (themeParams.bg_color) document.documentElement.style.setProperty('--telegram-bg', themeParams.bg_color);
    if (themeParams.text_color) document.documentElement.style.setProperty('--telegram-text', themeParams.text_color);
    document.documentElement.classList.toggle('telegram-light', window.Telegram.WebApp.colorScheme === 'light');
}

function initRequestForm() {
    const form = document.getElementById('request-form');
    if (!form) return;

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const submitButton = document.getElementById('request-submit');
        const status = document.getElementById('request-status');
        const formData = new FormData(form);
        const payload = {
            name: String(formData.get('name') || '').trim(),
            phone: String(formData.get('phone') || '').trim(),
            car: String(formData.get('car') || '').trim(),
            comment: String(formData.get('comment') || '').trim(),
            website: String(formData.get('website') || '')
        };

        if (!payload.name || !payload.phone || !payload.car) {
            status.textContent = 'Заполните имя, телефон и номер автомобиля.';
            status.className = 'request-status request-status-error';
            return;
        }
        if (payload.name.length > 100 || payload.phone.length > 30 || payload.car.length > 30 || payload.comment.length > 1000) {
            status.textContent = 'Ошибка: проверьте длину заполненных полей.';
            status.className = 'request-status request-status-error';
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'Отправка...';
        status.textContent = '';
        status.className = 'request-status';

        try {
            const response = await fetch('/.netlify/functions/send-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Ошибка отправки');

            status.textContent = 'Заявка отправлена';
            status.className = 'request-status request-status-success';
            form.reset();
        } catch (error) {
            status.textContent = 'Ошибка, попробуйте ещё раз';
            status.className = 'request-status request-status-error';
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Отправить';
        }
    });
}

async function initApp() {
    await checkAuth();
    await fetchSpots();
    startLiveTimers();
    startAutoPolling();
}

// -------------------------------------------------------------
// AUTHENTICATION & USER MANAGEMENT
// -------------------------------------------------------------

async function checkAuth() {
    try {
        if (api.getToken()) {
            const res = await api.getMe();
            currentUser = res.user;
        } else {
            currentUser = null;
        }
    } catch (e) {
        console.warn('Auth check failed or token expired:', e.message);
        api.logout();
        currentUser = null;
    }
    renderNavAuth();
}

function renderNavAuth() {
    const container = document.getElementById('nav-auth-container');
    const adminNavBtn = document.getElementById('nav-admin');

    if (currentUser) {
        const isEvUser = currentUser.carType === 'ev';
        const roleLabel = currentUser.role === 'admin' ? 'Администратор' : (isEvUser ? 'Водитель (EV ⚡)' : 'Водитель (ДВС 🚗)');

        if (currentUser.role === 'admin') {
            adminNavBtn.classList.remove('hidden');
        } else {
            adminNavBtn.classList.add('hidden');
        }

        container.innerHTML = `
            <div class="user-chip">
                <div class="user-avatar">${currentUser.name.charAt(0).toUpperCase()}</div>
                <div class="user-info-text">
                    <span class="user-name">${currentUser.name}</span>
                    <span class="user-role-tag">${roleLabel}</span>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="handleLogout()" title="Выйти из аккаунта">
                    Выход
                </button>
            </div>
        `;
    } else {
        adminNavBtn.classList.add('hidden');
        container.innerHTML = `
            <button class="btn btn-secondary btn-sm" onclick="openAuthModal('login')">Вход</button>
            <button class="btn btn-primary btn-sm" onclick="openAuthModal('register')">Регистрация</button>
        `;
    }
}

function handleLogout() {
    api.logout();
    currentUser = null;
    renderNavAuth();
    navigateTo('parking');
    fetchSpots();
    showToast('Вы вышли из учетной записи.');
}

function openAuthModal(mode = 'login') {
    switchAuthTab(mode);
    openModal('modal-auth');
}

function switchAuthTab(tab) {
    const loginBtn = document.getElementById('tab-login-btn');
    const regBtn = document.getElementById('tab-register-btn');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');

    if (tab === 'login') {
        loginBtn.classList.add('active');
        regBtn.classList.remove('active');
        formLogin.classList.remove('hidden');
        formRegister.classList.add('hidden');
    } else {
        regBtn.classList.add('active');
        loginBtn.classList.remove('active');
        formRegister.classList.remove('hidden');
        formLogin.classList.add('hidden');
    }
}

async function handleLoginSubmit(event) {
    event.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        const res = await api.login(email, password);
        currentUser = res.user;
        renderNavAuth();
        closeModal('modal-auth');
        showToast(`Успешный вход! Здравствуйте, ${currentUser.name}.`);
        await fetchSpots();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleRegisterSubmit(event) {
    event.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const role = document.getElementById('reg-role').value;
    const carType = document.getElementById('reg-cartype').value;
    const carPlate = document.getElementById('reg-plate').value;
    const carModel = document.getElementById('reg-model').value;

    try {
        const res = await api.register({
            name,
            email,
            password,
            role,
            carType,
            carPlate,
            carModel
        });
        currentUser = res.user;
        renderNavAuth();
        closeModal('modal-auth');
        showToast(`Регистрация завершена! Добро пожаловать, ${currentUser.name}.`);
        await fetchSpots();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// -------------------------------------------------------------
// NAVIGATION & VIEWS
// -------------------------------------------------------------

function navigateTo(viewName) {
    if (viewName === 'admin' && (!currentUser || currentUser.role !== 'admin')) {
        showToast('Для доступа к панели администратора необходимо войти как Администратор!', 'error');
        openAuthModal('login');
        return;
    }
    if (viewName === 'history' && !currentUser) {
        showToast('Пожалуйста, войдите в систему для просмотра истории ваших чеков.', 'error');
        openAuthModal('login');
        return;
    }

    document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    const targetView = document.getElementById(`view-${viewName}`);
    const targetNav = document.getElementById(`nav-${viewName}`);

    if (targetView) targetView.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    if (viewName === 'admin') {
        loadAdminStats();
    } else if (viewName === 'history') {
        loadUserHistory();
    } else if (viewName === 'parking') {
        fetchSpots();
    }
}

// -------------------------------------------------------------
// PARKING SPOTS & REAL-TIME GRID
// -------------------------------------------------------------

async function fetchSpots(isManualRefresh = false) {
    try {
        const res = await api.getSpots();
        currentSpots = res.spots;
        currentStats = res.stats;
        renderParkingGrid();
        renderTopStats();
        if (isManualRefresh) {
            showToast('Статусы мест успешно обновлены!');
        }
    } catch (err) {
        console.error('Failed to fetch spots:', err);
        if (isManualRefresh) {
            showToast(`Не удалось обновить парковочные места: ${err.message}`, 'error');
        }
    }
}

function renderTopStats() {
    if (!currentStats) return;
    document.getElementById('stat-free-count').textContent = currentStats.freeCount;
    document.getElementById('stat-occupied-count').textContent = currentStats.occupiedCount;
    document.getElementById('stat-occupancy-rate').textContent = `${currentStats.occupancyRate}%`;
}

function renderParkingGrid() {
    const gridEv = document.getElementById('grid-ev');
    const gridStd = document.getElementById('grid-standard');

    if (!gridEv || !gridStd) return;

    gridEv.innerHTML = '';
    gridStd.innerHTML = '';

    currentSpots.forEach(spot => {
        const cardHtml = createSpotCardHtml(spot);
        if (spot.type === 'ev') {
            gridEv.insertAdjacentHTML('beforeend', cardHtml);
        } else {
            gridStd.insertAdjacentHTML('beforeend', cardHtml);
        }
    });
}

function createSpotCardHtml(spot) {
    const isOccupied = spot.status === 'occupied';
    const isEv = spot.type === 'ev';
    const spotTypeClass = isEv ? 'ev' : 'standard';
    const spotTypeLabel = isEv ? '⚡ EV Charging' : '🚗 Стандарт';
    const rateFormatted = `${formatMoney(spot.ratePerHour)} сум/ч`;

    let bodyHtml = '';
    let actionBtnHtml = '';

    if (!isOccupied) {
        // FREE SPOT
        bodyHtml = `
            <div class="spot-body-free">
                <div class="spot-free-icon">${isEv ? '⚡' : '🅿️'}</div>
                <div class="spot-free-status">Свободно</div>
                <div class="spot-free-tariff">Тариф: <strong>${rateFormatted}</strong></div>
            </div>
        `;
        actionBtnHtml = `
            <button class="spot-action-btn btn-park-now" onclick="openParkModal(${spot.id})">
                Занять место
            </button>
        `;
    } else {
        // OCCUPIED SPOT
        const session = spot.currentSession || {};
        const isOwner = currentUser && session.userId === currentUser.id;
        const isAdmin = currentUser && currentUser.role === 'admin';
        const canUnpark = isOwner || isAdmin;

        const plateFormatted = session.carPlate || '01 A 000 AA';
        const modelFormatted = session.carModel || (session.carType === 'ev' ? 'Электромобиль' : 'Автомобиль');
        const driverFormatted = session.userName || 'Водитель';
        const elapsedText = session.elapsedFormatted || 'Только что';
        const currentBill = formatMoney(session.currentAccrued || spot.ratePerHour);

        bodyHtml = `
            <div class="spot-body-occ">
                <div class="uz-plate">
                    <div class="uz-flag-strip">
                        <span class="uz-flag-icon">🇺🇿</span>
                        <span>UZ</span>
                    </div>
                    <span>${plateFormatted}</span>
                </div>
                <div class="car-meta-info">
                    <span class="car-model-name" title="${modelFormatted}">${modelFormatted}</span>
                    <span class="car-driver-name">Водитель: ${driverFormatted}</span>
                </div>
                <div class="session-live-stats">
                    <div class="live-time-ticker">
                        <span class="ticker-label">На парковке:</span>
                        <span class="ticker-val" id="ticker-spot-${spot.id}">${elapsedText}</span>
                    </div>
                    <div class="live-cost-badge">
                        <span class="cost-label">К оплате:</span>
                        <span class="cost-val" id="cost-spot-${spot.id}">${currentBill} сум</span>
                    </div>
                </div>
            </div>
        `;

        if (canUnpark) {
            const btnLabel = isAdmin && !isOwner ? '⚡ Выезд (Админ)' : '💳 Выезд и чек';
            actionBtnHtml = `
                <button class="spot-action-btn btn-unpark-now" onclick="handleCheckout(${spot.id})">
                    ${btnLabel}
                </button>
            `;
        } else {
            actionBtnHtml = `
                <button class="spot-action-btn btn-locked" disabled title="Занято другим водителем">
                    🔒 Занято
                </button>
            `;
        }
    }

    return `
        <div class="spot-card ${isOccupied ? 'spot-occupied' : 'spot-free'}" id="spot-card-${spot.id}">
            <div class="spot-top">
                <span class="spot-number-badge">#${String(spot.number).padStart(2, '0')}</span>
                <span class="spot-type-tag ${spotTypeClass}">${spotTypeLabel}</span>
            </div>
            ${bodyHtml}
            ${actionBtnHtml}
        </div>
    `;
}

// -------------------------------------------------------------
// PARK VEHICLE MODAL & VALIDATION
// -------------------------------------------------------------

function openParkModal(spotId) {
    if (!currentUser) {
        showToast('Для бронирования места необходимо войти в аккаунт!', 'error');
        openAuthModal('login');
        return;
    }

    const spot = currentSpots.find(s => s.id === spotId);
    if (!spot) return;

    selectedSpotForPark = spot;
    document.getElementById('park-spot-id').value = spot.id;
    document.getElementById('modal-park-spot-id').textContent = `#${String(spot.number).padStart(2, '0')}`;

    const isEv = spot.type === 'ev';
    const tagEl = document.getElementById('modal-park-spot-type-tag');
    tagEl.className = `spot-type-pill ${isEv ? 'ev-pill' : 'std-pill'}`;
    tagEl.textContent = isEv ? '⚡ EV Charging (Места 1–5)' : '🚗 Стандартное место (6–15)';

    const alertEl = document.getElementById('modal-park-rule-alert');
    if (isEv) {
        alertEl.classList.remove('hidden');
    } else {
        alertEl.classList.add('hidden');
    }

    // Set rate preview
    document.getElementById('modal-park-rate-preview').textContent = `${formatMoney(spot.ratePerHour)} сум / час`;

    // Prefill vehicle details from user profile if available
    document.getElementById('park-plate').value = currentUser.carPlate || '';
    document.getElementById('park-model').value = currentUser.carModel || '';

    // Select car type
    const carType = currentUser.carType || (isEv ? 'ev' : 'standard');
    const radioEv = document.querySelector('input[name="park-cartype"][value="ev"]');
    const radioStd = document.querySelector('input[name="park-cartype"][value="standard"]');

    if (carType === 'ev') {
        radioEv.checked = true;
    } else {
        radioStd.checked = true;
    }

    // Reset simulation tool
    setSimulatedEntryOffset(0);

    // Validate type match
    validateSpotCarTypeMatch();

    openModal('modal-park');
}

function validateSpotCarTypeMatch() {
    if (!selectedSpotForPark) return;

    const selectedCarType = document.querySelector('input[name="park-cartype"]:checked')?.value;
    const mismatchWarning = document.getElementById('cartype-mismatch-warning');
    const submitBtn = document.getElementById('btn-submit-park');

    // CRITICAL BUSINESS RULE: Standard vehicle cannot park in EV spot (1-5)
    if (selectedSpotForPark.type === 'ev' && selectedCarType !== 'ev') {
        mismatchWarning.classList.remove('hidden');
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.style.cursor = 'not-allowed';
    } else {
        mismatchWarning.classList.add('hidden');
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
    }
}

function setSimulatedEntryOffset(hoursAgo) {
    const input = document.getElementById('park-custom-entry-time');
    const statusLabel = document.getElementById('park-sim-status');

    if (hoursAgo === 0) {
        input.value = '';
        statusLabel.textContent = 'Въезд: прямо сейчас';
        statusLabel.style.color = 'var(--emerald-free)';
    } else {
        const simulatedTime = new Date(Date.now() - hoursAgo * 3600 * 1000);
        const pad = value => String(value).padStart(2, '0');
        input.value = `${simulatedTime.getFullYear()}-${pad(simulatedTime.getMonth() + 1)}-${pad(simulatedTime.getDate())}T${pad(simulatedTime.getHours())}:${pad(simulatedTime.getMinutes())}`;
        statusLabel.textContent = `Въезд: ${hoursAgo} ч назад (${simulatedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
        statusLabel.style.color = 'var(--purple-light)';
    }
}

async function handleParkSubmit(event) {
    event.preventDefault();
    const spotId = document.getElementById('park-spot-id').value;
    const carType = document.querySelector('input[name="park-cartype"]:checked')?.value;
    const carPlate = document.getElementById('park-plate').value.trim();
    const carModel = document.getElementById('park-model').value.trim();
    const customEntryTime = document.getElementById('park-custom-entry-time').value || null;

    try {
        const res = await api.parkSpot(spotId, {
            carPlate,
            carModel,
            carType,
            customEntryTime
        });

        closeModal('modal-park');
        showToast(res.message);
        await fetchSpots();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// -------------------------------------------------------------
// CHECKOUT & RECEIPT GENERATION
// -------------------------------------------------------------

async function handleCheckout(spotId) {
    const spot = currentSpots.find(s => s.id === spotId);
    if (!spot || !spot.currentSession) return;

    const carPlate = spot.currentSession.carPlate;
    const confirmMessage = `Завершить парковку для автомобиля ${carPlate} на месте #${spotId} и сформировать итоговый счет?`;

    if (!confirm(confirmMessage)) {
        return;
    }

    try {
        let res;
        // If current user is admin and not the owner of the vehicle, use admin force release endpoint
        if (currentUser.role === 'admin' && spot.currentSession.userId !== currentUser.id) {
            res = await api.adminForceRelease(spotId);
        } else {
            res = await api.unparkSpot(spotId);
        }

        showToast(res.message);
        await fetchSpots();

        if (res.receipt) {
            renderAndShowReceipt(res.receipt);
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderAndShowReceipt(receipt) {
    document.getElementById('rec-number').textContent = receipt.receiptNumber;
    document.getElementById('rec-date').textContent = formatDate(receipt.exitTime);

    const isEv = receipt.spotType === 'ev';
    document.getElementById('rec-spot').textContent = `Место #${String(receipt.spotId).padStart(2, '0')} (${receipt.spotTypeName})`;
    document.getElementById('rec-plate').textContent = receipt.carPlate;
    document.getElementById('rec-model').textContent = `${receipt.carModel} (${isEv ? '⚡ EV' : '🚗 ДВС'})`;
    document.getElementById('rec-driver').textContent = receipt.userName;

    document.getElementById('rec-entry').textContent = formatDateTime(receipt.entryTime);
    document.getElementById('rec-exit').textContent = formatDateTime(receipt.exitTime);
    document.getElementById('rec-duration').textContent = receipt.durationFormatted;
    document.getElementById('rec-billed-hours').textContent = `${receipt.billedHours} ч (округление по часам)`;
    document.getElementById('rec-rate').textContent = `${formatMoney(receipt.ratePerHour)} сум / час`;

    document.getElementById('rec-total').textContent = `${formatMoney(receipt.totalAmount)} сум`;
    document.getElementById('rec-released-by').textContent = `Освободил: ${receipt.releasedBy}`;

    openModal('modal-receipt');
}

function printReceipt() {
    window.print();
}

// -------------------------------------------------------------
// ADMIN PANEL LOGIC
// -------------------------------------------------------------

async function loadAdminStats() {
    try {
        const statsRes = await api.getAdminStats();
        const stats = statsRes.stats;

        document.getElementById('kpi-total-revenue').textContent = `${formatMoney(stats.totalRevenue)} сум`;
        document.getElementById('kpi-active-accrued').textContent = `${formatMoney(stats.activeAccruedRevenue)} сум`;
        document.getElementById('kpi-occupancy').textContent = `${stats.occupancyRate}%`;
        document.getElementById('kpi-spots-split').textContent = `Свободно: ${stats.freeCount} / Занято: ${stats.occupiedCount} (EV: ${stats.evOccupied}/5, Обыч: ${stats.standardOccupied}/10)`;
        document.getElementById('kpi-total-sessions').textContent = stats.totalSessions;

        // Render Active Sessions Table
        renderAdminActiveSessions();

        // Render History Sessions Table
        const historyRes = await api.getAdminReceipts();
        renderAdminHistorySessions(historyRes.receipts);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderAdminActiveSessions() {
    const tbody = document.getElementById('active-sessions-tbody');
    const badge = document.getElementById('active-sessions-count');
    const occupiedSpots = currentSpots.filter(s => s.status === 'occupied');

    badge.textContent = `${occupiedSpots.length} авто`;

    if (occupiedSpots.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; color:var(--text-muted); padding:20px;">На парковке нет активных автомобилей.</td></tr>`;
        return;
    }

    tbody.innerHTML = occupiedSpots.map(spot => {
        const sess = spot.currentSession;
        const isEv = spot.type === 'ev';
        return `
            <tr>
                <td><strong>#${String(spot.number).padStart(2, '0')}</strong></td>
                <td><span class="spot-type-pill ${isEv ? 'ev-pill' : 'std-pill'}">${isEv ? '⚡ EV' : '🚗 Стандарт'}</span></td>
                <td><span class="font-plate">${sess.carPlate}</span></td>
                <td>${sess.carModel}</td>
                <td>${sess.carType === 'ev' ? '⚡ Электро' : '🚗 ДВС'}</td>
                <td>${sess.userName}</td>
                <td>${formatTime(sess.entryTime)}</td>
                <td><strong class="text-rose">${sess.elapsedFormatted || '0 мин'}</strong></td>
                <td>${formatMoney(spot.ratePerHour)} сум/ч</td>
                <td><strong class="text-accent">${formatMoney(sess.currentAccrued || spot.ratePerHour)} сум</strong></td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="adminForceReleaseAction(${spot.id})">
                        ⚠️ Выселить
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderAdminHistorySessions(receipts) {
    const tbody = document.getElementById('history-sessions-tbody');
    if (!receipts || receipts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; color:var(--text-muted); padding:20px;">История парковок пуста.</td></tr>`;
        return;
    }

    tbody.innerHTML = receipts.map(r => `
        <tr>
            <td><strong class="font-plate text-accent">${r.receiptNumber}</strong></td>
            <td>#${String(r.spotId).padStart(2, '0')}</td>
            <td><span class="font-plate">${r.carPlate}</span></td>
            <td>${r.userName}</td>
            <td>${formatDateTime(r.entryTime)}</td>
            <td>${formatDateTime(r.exitTime)}</td>
            <td>${r.durationFormatted}</td>
            <td>${r.billedHours} ч</td>
            <td>${formatMoney(r.ratePerHour)} сум</td>
            <td><strong class="text-emerald">${formatMoney(r.totalAmount)} сум</strong></td>
            <td><span class="text-muted" style="font-size:11px;">${r.releasedBy}</span></td>
        </tr>
    `).join('');
}

async function adminForceReleaseAction(spotId) {
    if (!confirm(`Вы действительно хотите принудительно освободить место #${spotId}?`)) {
        return;
    }
    try {
        const res = await api.adminForceRelease(spotId);
        showToast(res.message);
        await fetchSpots();
        await loadAdminStats();
        if (res.receipt) {
            renderAndShowReceipt(res.receipt);
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function resetAllSpotsModal() {
    const code = prompt('ВНИМАНИЕ! Вы собираетесь сбросить все 15 мест парковки и завершить все активные сессии.\nДля подтверждения введите слово "СБРОС":');
    if (code !== 'СБРОС') {
        if (code !== null) showToast('Действие отменено: неверное подтверждение.', 'error');
        return;
    }

    try {
        const res = await api.adminResetAll();
        showToast(res.message);
        await fetchSpots();
        await loadAdminStats();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// -------------------------------------------------------------
// USER HISTORY VIEW
// -------------------------------------------------------------

async function loadUserHistory() {
    try {
        const res = await api.getUserReceipts();
        const tbody = document.getElementById('user-receipts-tbody');
        const receipts = res.receipts || [];

        if (receipts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:30px;">У вас пока нет завершенных парковочных сессий.</td></tr>`;
            return;
        }

        tbody.innerHTML = receipts.map(r => `
            <tr>
                <td><strong class="font-plate text-accent">${r.receiptNumber}</strong></td>
                <td>#${String(r.spotId).padStart(2, '0')} (${r.spotType === 'ev' ? '⚡ EV' : '🚗 Стандарт'})</td>
                <td><span class="font-plate">${r.carPlate}</span></td>
                <td>${formatDateTime(r.entryTime)}</td>
                <td>${formatDateTime(r.exitTime)}</td>
                <td>${r.durationFormatted}</td>
                <td>${r.billedHours} ч</td>
                <td>${formatMoney(r.ratePerHour)} сум</td>
                <td><strong class="text-emerald">${formatMoney(r.totalAmount)} сум</strong></td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick='viewSavedReceipt(${JSON.stringify(r).replace(/'/g, "&#39;")})'>
                        👁️ Чек
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function viewSavedReceipt(receipt) {
    renderAndShowReceipt(receipt);
}

// -------------------------------------------------------------
// LIVE TIMERS & AUTO-POLLING
// -------------------------------------------------------------

function startLiveTimers() {
    if (liveTimerInterval) clearInterval(liveTimerInterval);
    // Update live elapsed duration on cards every 15 seconds
    liveTimerInterval = setInterval(() => {
        const now = Date.now();
        currentSpots.forEach(spot => {
            if (spot.status === 'occupied' && spot.currentSession) {
                const entry = new Date(spot.currentSession.entryTime).getTime();
                const diffMs = Math.max(0, now - entry);
                const minutes = Math.floor(diffMs / (1000 * 60));
                const hours = Math.floor(minutes / 60);
                const remMinutes = minutes % 60;
                const billedHours = Math.max(1, Math.ceil(minutes / 60));
                const currentAccrued = billedHours * spot.ratePerHour;

                const tickerEl = document.getElementById(`ticker-spot-${spot.id}`);
                const costEl = document.getElementById(`cost-spot-${spot.id}`);

                if (tickerEl) {
                    tickerEl.textContent = `${hours} ч ${remMinutes} мин`;
                }
                if (costEl) {
                    costEl.textContent = `${formatMoney(currentAccrued)} сум`;
                }
            }
        });
    }, 15000);
}

function startAutoPolling() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    // Poll the backend every 20 seconds to keep tabs synchronized
    autoRefreshInterval = setInterval(() => {
        fetchSpots();
    }, 20000);
}

// -------------------------------------------------------------
// MODALS & TOAST HELPERS
// -------------------------------------------------------------

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

// Close modals when clicking overlay backdrop
window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-overlay')) {
        event.target.classList.remove('active');
    }
});

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✅' : '❌';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-text">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// -------------------------------------------------------------
// FORMATTING HELPERS
// -------------------------------------------------------------

function formatMoney(amount) {
    return Number(amount || 0).toLocaleString('ru-RU');
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU');
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
}
