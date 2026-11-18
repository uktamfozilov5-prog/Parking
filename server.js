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
