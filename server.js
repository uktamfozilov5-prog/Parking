const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('./db');

// Load environment variables (.env)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
}

const JWT_SECRET = process.env.JWT_SECRET || 'smart-parking-secret-key-2026';
const PORT = process.env.PORT || 3000;

const app = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files from 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Authentication Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация (токен не передан).' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Недействительный или истекший токен.' });
        }
        const user = db.getUserById(decoded.id);
        if (!user) {
            return res.status(401).json({ error: 'Пользователь не найден.' });
        }
        req.user = user;
        next();
    });
}

// Admin Role Middleware
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещен. Требуются права Администратора.' });
    }
    next();
}

// Прямой псевдоним middleware для админских маршрутов.
const isAdmin = requireAdmin;

// -------------------------------------------------------------
// AUTH ROUTES
// -------------------------------------------------------------

// POST /api/auth/register
app.post('/api/auth/register', (req, res) => {
    try {
        const { email, password, name, role, carPlate, carModel, carType } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, пароль и имя обязательны для заполнения.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Пароль должен содержать не менее 6 символов.' });
        }

        const newUser = db.createUser({
            email,
            password,
            name,
            role: role === 'admin' ? 'admin' : 'user',
            carPlate: carPlate || '',
            carModel: carModel || '',
            carType: carType === 'ev' ? 'ev' : 'standard'
        });

        const token = jwt.sign(
            { id: newUser.id, email: newUser.email, role: newUser.role, name: newUser.name },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            message: 'Регистрация прошла успешно',
            token,
            user: newUser
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Укажите Email и пароль.' });
        }

        const user = db.getUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Неверный email или пароль.' });
        }

        const inputHash = db.hashPassword(password);
        if (inputHash !== user.passwordHash) {
            return res.status(401).json({ error: 'Неверный email или пароль.' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, name: user.name },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        const { passwordHash, ...cleanUser } = user;
        res.json({
            message: 'Успешный вход в систему',
            token,
            user: cleanUser
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/auth/me
app.get('/api/auth/me', authenticateToken, (req, res) => {
    const { passwordHash, ...cleanUser } = req.user;
    res.json({ user: cleanUser });
});

// -------------------------------------------------------------
// PARKING SPOTS ROUTES
// -------------------------------------------------------------

// GET /api/spots - Get status of all 15 spots
app.get('/api/spots', (req, res) => {
    try {
        const spots = db.getSpots();
        const stats = db.getStats();
        res.json({ spots, stats });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/spots/:id
app.get('/api/spots/:id', (req, res) => {
    try {
        const spot = db.getSpotById(req.params.id);
        if (!spot) {
            return res.status(404).json({ error: 'Место не найдено.' });
        }
        res.json({ spot });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/spots/:id/park - Park a vehicle
app.post('/api/spots/:id/park', authenticateToken, (req, res) => {
    try {
        const spotId = req.params.id;
        const { carPlate, carModel, carType, customEntryTime } = req.body;

        const effectivePlate = (carPlate || req.user.carPlate || '').trim();
        const effectiveModel = (carModel || req.user.carModel || '').trim();
        const effectiveType = carType || req.user.carType || 'standard';

        if (!effectivePlate) {
            return res.status(400).json({ error: 'Пожалуйста, укажите государственный номер автомобиля.' });
        }

        const updatedSpot = db.parkVehicle(spotId, {
            userId: req.user.id,
            userName: req.user.name,
            carPlate: effectivePlate,
            carModel: effectiveModel,
            carType: effectiveType,
            customEntryTime
        });

        res.json({
            message: `Автомобиль ${effectivePlate} успешно припаркован на место #${spotId}.`,
            spot: updatedSpot
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// POST /api/spots/:id/unpark - Vacate spot and generate detailed receipt
app.post('/api/spots/:id/unpark', authenticateToken, (req, res) => {
    try {
        const spotId = req.params.id;
        const { simulatedExitMinutes } = req.body;

        const receipt = db.unparkVehicle(spotId, req.user, simulatedExitMinutes);
        res.json({
            message: `Место #${spotId} освобождено. Расчет стоимости завершен.`,
            receipt
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// GET /api/user/receipts - History of current user
app.get('/api/user/receipts', authenticateToken, (req, res) => {
    try {
        const receipts = db.getReceipts(req.user.id);
        res.json({ receipts });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// -------------------------------------------------------------
// ADMIN ROUTES
// -------------------------------------------------------------

// GET /api/admin/revenue - Revenue analytics for a selected period
app.get('/api/admin/revenue', authenticateToken, isAdmin, (req, res) => {
    try {
        const period = ['week', 'month', 'year'].includes(req.query.period)
            ? req.query.period
            : 'month';

        // TODO: Replace these mock datasets with SQL/MongoDB aggregation queries.
        // Example: aggregate completed receipts by period and calculate revenue, sessions,
        // occupancy and average check from your transactions table.
        const mockRevenue = {
            week: {
                totalRevenue: 286000,
                growthPercentage: 12.4,
                totalSessions: 54,
                occupancyRate: 68,
                averageCheck: 5296,
                chartData: {
                    labels: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
                    values: [28000, 35000, 42000, 39000, 51000, 47000, 44000]
                }
            },
            month: {
                totalRevenue: 1248000,
                growthPercentage: 18.7,
                totalSessions: 238,
                occupancyRate: 74,
                averageCheck: 5244,
                chartData: {
                    labels: ['1–5', '6–10', '11–15', '16–20', '21–25', '26–31'],
                    values: [138000, 192000, 176000, 228000, 254000, 260000]
                }
            },
            year: {
                totalRevenue: 14860000,
                growthPercentage: 24.2,
                totalSessions: 2864,
                occupancyRate: 71,
                averageCheck: 5189,
                chartData: {
                    labels: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
                    values: [920000, 980000, 1040000, 1120000, 1180000, 1240000, 1290000, 1330000, 1310000, 1450000, 1510000, 960000]
                }
            }
        };

        const now = Date.now();
        const demoTransactions = [
            { plateNumber: '01 A 777 AA', duration: '2 ч 15 мин', amount: 24000, status: 'Демо · Оплачено', createdAt: new Date(now - 5 * 60000).toISOString() },
            { plateNumber: '10 B 204 BB', duration: '1 ч 30 мин', amount: 10000, status: 'Демо · Оплачено', createdAt: new Date(now - 24 * 60000).toISOString() },
            { plateNumber: '90 C 315 CC', duration: '3 ч 05 мин', amount: 20000, status: 'Демо · Оплачено', createdAt: new Date(now - 48 * 60000).toISOString() },
            { plateNumber: '01 D 908 DD', duration: '45 мин', amount: 5000, status: 'Демо · Оплачено', createdAt: new Date(now - 92 * 60000).toISOString() },
            { plateNumber: '30 E 126 EE', duration: '2 ч 00 мин', amount: 16000, status: 'Демо · Возврат', createdAt: new Date(now - 145 * 60000).toISOString() }
        ];

        const receipts = db.getReceipts().map(receipt => ({
            plateNumber: receipt.carPlate || receipt.plateNumber,
            duration: receipt.durationFormatted || receipt.duration || '—',
            amount: receipt.totalAmount || receipt.amount || 0,
            status: 'Оплачено',
            createdAt: receipt.createdAt
        }));
        const recentTransactions = [...receipts, ...demoTransactions]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5);

        res.json({
            ...mockRevenue[period],
            recentTransactions
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /admin/dashboard - Protected revenue dashboard page
app.get('/admin/dashboard', authenticateToken, isAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

// GET /api/admin/stats - Overview statistics
app.get('/api/admin/stats', authenticateToken, requireAdmin, (req, res) => {
    try {
        const stats = db.getStats();
        res.json({ stats });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin/receipts - All receipts history
app.get('/api/admin/receipts', authenticateToken, requireAdmin, (req, res) => {
    try {
        const receipts = db.getReceipts();
        res.json({ receipts });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/admin/spots/:id/force-release - Admin force unpark stuck spot
app.post('/api/admin/spots/:id/force-release', authenticateToken, requireAdmin, (req, res) => {
    try {
        const spotId = req.params.id;
        const { simulatedExitMinutes } = req.body;
        const receipt = db.forceReleaseSpot(spotId, req.user, simulatedExitMinutes);
        res.json({
            message: `Место #${spotId} принудительно освобождено администратором.`,
            receipt
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// POST /api/admin/reset-all - Reset all spots (emergency release stuck spots)
app.post('/api/admin/reset-all', authenticateToken, requireAdmin, (req, res) => {
    try {
        const result = db.resetAllSpots(req.user);
        res.json({
            message: `Сброс выполнен. Освобождено мест: ${result.releasedCount}.`,
            ...result
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// SPA fallback for HTML pages
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`⚡ Смарт-Паркинг сервер запущен на порту: ${PORT}`);
    console.log(`🌐 Откройте в браузере: http://localhost:${PORT}`);
    console.log(`🔑 Тестовые аккаунты:`);
    console.log(`   - Админ:     admin@parking.uz     / admin123`);
    console.log(`   - EV Driver: driver.ev@parking.uz / driver123`);
    console.log(`   - ДВС Driver: driver.std@parking.uz/ driver123`);
    console.log(`====================================================`);
});
