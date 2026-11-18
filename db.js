const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

const DATA_DIR = process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join(os.tmpdir(), 'smart-parking-data')
    : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'parking-store.json');

// Password hashing helper
function hashPassword(password) {
    return crypto.createHash('sha256').update(password + '_salt_smartpark_2026').digest('hex');
}

// Generate unique receipt number
function generateReceiptNumber() {
    const random = Math.floor(1000 + Math.random() * 9000);
    return `REC-${new Date().getFullYear()}-${random}`;
}

// Initial state generator
function createInitialData() {
    const now = Date.now();
    
    // Exactly 15 spots:
    // 1-5: EV-charging (8000 UZS/h)
    // 6-15: Standard (5000 UZS/h)
    const spots = [];
    for (let i = 1; i <= 15; i++) {
        const isEv = i <= 5;
        spots.push({
            id: i,
            number: i,
            type: isEv ? 'ev' : 'standard',
            typeName: isEv ? 'Электромобиль (EV Charging)' : 'Обычный автомобиль',
            ratePerHour: isEv ? 8000 : 5000,
            hasCharger: isEv,
            status: 'free',
            currentSession: null
        });
    }

    // Default Pre-seeded Users
    const users = [
        {
            id: 'usr_admin',
            email: 'admin@parking.uz',
            passwordHash: hashPassword('admin123'),
            name: 'Администратор Парковки',
            role: 'admin',
            carPlate: '01 001 ADM',
            carModel: 'Audi e-tron GT',
            carType: 'ev',
            createdAt: new Date(now - 86400000 * 10).toISOString()
        },
        {
            id: 'usr_ev',
            email: 'driver.ev@parking.uz',
            passwordHash: hashPassword('driver123'),
            name: 'Алишер Каримов',
            role: 'user',
            carPlate: '01 A 777 AA',
            carModel: 'Tesla Model 3',
            carType: 'ev',
            createdAt: new Date(now - 86400000 * 5).toISOString()
        },
        {
            id: 'usr_std',
            email: 'driver.std@parking.uz',
            passwordHash: hashPassword('driver123'),
            name: 'Бобир Саидов',
            role: 'user',
            carPlate: '01 B 123 BB',
            carModel: 'Chevrolet Onix',
            carType: 'standard',
            createdAt: new Date(now - 86400000 * 3).toISOString()
        }
    ];

    // Seed 2 active spots so the app looks live immediately!
    // Spot 2 (EV): Occupied 1 hour 45 minutes ago by Alisher (Tesla)
    const evEntryTime = new Date(now - (1 * 3600 * 1000 + 45 * 60 * 1000)).toISOString();
    spots[1].status = 'occupied';
    spots[1].currentSession = {
        sessionId: 'sess_seed_ev',
        userId: 'usr_ev',
        userName: 'Алишер Каримов',
        carPlate: '01 A 777 AA',
        carModel: 'Tesla Model 3',
        carType: 'ev',
        entryTime: evEntryTime,
        ratePerHour: 8000
    };

    // Spot 8 (Standard): Occupied 2 hours 15 minutes ago by Bobir (Chevrolet)
    const stdEntryTime = new Date(now - (2 * 3600 * 1000 + 15 * 60 * 1000)).toISOString();
    spots[7].status = 'occupied';
    spots[7].currentSession = {
        sessionId: 'sess_seed_std',
        userId: 'usr_std',
        userName: 'Бобир Саидов',
        carPlate: '01 B 123 BB',
        carModel: 'Chevrolet Onix',
        carType: 'standard',
        entryTime: stdEntryTime,
        ratePerHour: 5000
    };

    // Pre-seeded completed receipts for statistics & history
    const receipts = [
        {
            receiptNumber: 'REC-2026-1024',
            spotId: 4,
            spotType: 'ev',
            spotTypeName: 'Электромобиль (EV Charging)',
            ratePerHour: 8000,
            carPlate: '01 E 999 EE',
            carModel: 'BYD Song Plus EV',
            carType: 'ev',
            userName: 'Сардор Рахимов',
            userId: 'usr_seed_1',
            entryTime: new Date(now - 5 * 3600 * 1000).toISOString(),
            exitTime: new Date(now - 2 * 3600 * 1000).toISOString(),
            durationMinutes: 180,
            billedHours: 3,
            totalAmount: 24000,
            currency: 'сум',
            releasedBy: 'User (Сардор Рахимов)',
            createdAt: new Date(now - 2 * 3600 * 1000).toISOString()
        },
        {
            receiptNumber: 'REC-2026-1025',
            spotId: 11,
            spotType: 'standard',
            spotTypeName: 'Обычный автомобиль',
            ratePerHour: 5000,
            carPlate: '01 M 404 MM',
            carModel: 'Kia K5',
            carType: 'standard',
            userName: 'Малик Темиров',
            userId: 'usr_seed_2',
            entryTime: new Date(now - 4 * 3600 * 1000).toISOString(),
            exitTime: new Date(now - 1 * 3600 * 1000).toISOString(),
            durationMinutes: 180,
            billedHours: 3,
            totalAmount: 15000,
            currency: 'сум',
            releasedBy: 'User (Малик Темиров)',
            createdAt: new Date(now - 1 * 3600 * 1000).toISOString()
        }
    ];

    return { spots, users, receipts };
}

// File I/O
function loadDb() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
        const initial = createInitialData();
        fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf-8');
        return initial;
    }
    try {
        const content = fs.readFileSync(DATA_FILE, 'utf-8');
        return JSON.parse(content);
    } catch (e) {
        console.error('Error reading parking-store.json, recreating initial data:', e);
        const initial = createInitialData();
        fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf-8');
        return initial;
    }
}

function saveDb(data) {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Database helper functions
const db = {
    hashPassword,

    // Spots with real-time dynamic duration calculation
    getSpots() {
        const data = loadDb();
        const now = Date.now();

        return data.spots.map(spot => {
            if (spot.status === 'occupied' && spot.currentSession) {
                const entry = new Date(spot.currentSession.entryTime).getTime();
                const diffMs = Math.max(0, now - entry);
                const minutes = Math.floor(diffMs / (1000 * 60));
                const hours = Math.floor(minutes / 60);
                const remMinutes = minutes % 60;
                const billedHours = Math.max(1, Math.ceil(minutes / 60));
                const currentAccrued = billedHours * spot.ratePerHour;

                return {
                    ...spot,
                    currentSession: {
                        ...spot.currentSession,
                        elapsedMinutes: minutes,
                        elapsedFormatted: `${hours} ч ${remMinutes} мин`,
                        billedHours,
                        currentAccrued
                    }
                };
            }
            return spot;
        });
    },

    getSpotById(id) {
        const spots = this.getSpots();
        return spots.find(s => s.id === Number(id));
    },

    parkVehicle(spotId, { userId, userName, carPlate, carModel, carType, customEntryTime }) {
        const data = loadDb();
        const spot = data.spots.find(s => s.id === Number(spotId));

        if (!spot) {
            throw new Error(`Парковочное место #${spotId} не найдено.`);
        }
        if (spot.status === 'occupied') {
            throw new Error(`Место #${spotId} уже занято.`);
        }

        // Business Rule: Standard car cannot occupy EV spot (1-5)
        if (spot.type === 'ev' && carType !== 'ev') {
            throw new Error('Обычный автомобиль с ДВС не может занять место для электрокаров (EV-charging)! Пожалуйста, выберите места с 6 по 15.');
        }

        const entryTime = customEntryTime ? new Date(customEntryTime).toISOString() : new Date().toISOString();
        const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        spot.status = 'occupied';
        spot.currentSession = {
            sessionId,
            userId,
            userName: userName || 'Водитель',
            carPlate: carPlate.trim().toUpperCase(),
            carModel: carModel.trim() || (carType === 'ev' ? 'Электромобиль' : 'Автомобиль'),
            carType,
            entryTime,
            ratePerHour: spot.ratePerHour
        };

        saveDb(data);
        return spot;
    },

    unparkVehicle(spotId, actor, simulatedExitMinutes = null) {
        const data = loadDb();
        const spot = data.spots.find(s => s.id === Number(spotId));

        if (!spot) {
            throw new Error(`Место #${spotId} не найдено.`);
        }
        if (spot.status !== 'occupied' || !spot.currentSession) {
            throw new Error(`Место #${spotId} уже свободно.`);
        }

        // Check ownership if not admin
        if (actor.role !== 'admin' && spot.currentSession.userId !== actor.id) {
            throw new Error('Вы можете освободить только свой собственный автомобиль.');
        }

        const session = spot.currentSession;
        const entryDate = new Date(session.entryTime);
        let exitDate = new Date();

        // Optional demo simulation parameter to test billing with custom minutes
        if (typeof simulatedExitMinutes === 'number' && simulatedExitMinutes > 0) {
            exitDate = new Date(entryDate.getTime() + simulatedExitMinutes * 60 * 1000);
        }

        const durationMs = Math.max(60000, exitDate.getTime() - entryDate.getTime());
        const totalMinutes = Math.max(1, Math.round(durationMs / (1000 * 60)));
        const hours = Math.floor(totalMinutes / 60);
        const remMinutes = totalMinutes % 60;
        const durationFormatted = `${hours > 0 ? `${hours} ч ` : ''}${remMinutes} мин`;

        // Billing: minimum 1 hour, ceil to next hour
        const billedHours = Math.max(1, Math.ceil(totalMinutes / 60));
        const ratePerHour = spot.ratePerHour;
        const totalAmount = billedHours * ratePerHour;

        const receipt = {
            receiptNumber: generateReceiptNumber(),
            spotId: spot.id,
            spotType: spot.type,
            spotTypeName: spot.typeName,
            ratePerHour: spot.ratePerHour,
            carPlate: session.carPlate,
            carModel: session.carModel,
            carType: session.carType,
            userName: session.userName,
            userId: session.userId,
            entryTime: session.entryTime,
            exitTime: exitDate.toISOString(),
            durationMinutes: totalMinutes,
            durationFormatted,
            billedHours,
            totalAmount,
            currency: 'сум',
            releasedBy: actor.role === 'admin' ? `Администратор (${actor.name})` : `Водитель (${actor.name})`,
            createdAt: new Date().toISOString()
        };

        // Reset spot to free
        spot.status = 'free';
        spot.currentSession = null;

        // Save receipt to history
        data.receipts.unshift(receipt);
        saveDb(data);

        return receipt;
    },

    forceReleaseSpot(spotId, adminUser) {
        return this.unparkVehicle(spotId, adminUser);
    },

    resetAllSpots(adminUser) {
        const data = loadDb();
        const releasedReceipts = [];

        data.spots.forEach(spot => {
            if (spot.status === 'occupied' && spot.currentSession) {
                const session = spot.currentSession;
                const now = new Date();
                const entryDate = new Date(session.entryTime);
                const durationMs = Math.max(60000, now.getTime() - entryDate.getTime());
                const totalMinutes = Math.max(1, Math.round(durationMs / (1000 * 60)));
                const billedHours = Math.max(1, Math.ceil(totalMinutes / 60));
                const totalAmount = billedHours * spot.ratePerHour;

                releasedReceipts.push({
                    receiptNumber: generateReceiptNumber(),
                    spotId: spot.id,
                    spotType: spot.type,
                    spotTypeName: spot.typeName,
                    ratePerHour: spot.ratePerHour,
                    carPlate: session.carPlate,
                    carModel: session.carModel,
                    carType: session.carType,
                    userName: session.userName,
                    userId: session.userId,
                    entryTime: session.entryTime,
                    exitTime: now.toISOString(),
                    durationMinutes: totalMinutes,
                    durationFormatted: `${Math.floor(totalMinutes / 60)} ч ${totalMinutes % 60} мин`,
                    billedHours,
                    totalAmount,
                    currency: 'сум',
                    releasedBy: `Сброс админом (${adminUser.name})`,
                    createdAt: now.toISOString()
                });

                spot.status = 'free';
                spot.currentSession = null;
            }
        });

        data.receipts.unshift(...releasedReceipts);
        saveDb(data);
        return { releasedCount: releasedReceipts.length, releasedReceipts };
    },

    getStats() {
        const data = loadDb();
        const totalSpots = 15;
        const occupiedCount = data.spots.filter(s => s.status === 'occupied').length;
        const freeCount = totalSpots - occupiedCount;

        const evTotal = 5;
        const evOccupied = data.spots.filter(s => s.type === 'ev' && s.status === 'occupied').length;
        const evFree = evTotal - evOccupied;

        const standardTotal = 10;
        const standardOccupied = data.spots.filter(s => s.type === 'standard' && s.status === 'occupied').length;
        const standardFree = standardTotal - standardOccupied;

        const totalRevenue = data.receipts.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
        const totalSessions = data.receipts.length;

        // Current accrued revenue from active sessions
        const now = Date.now();
        let activeAccruedRevenue = 0;
        data.spots.forEach(spot => {
            if (spot.status === 'occupied' && spot.currentSession) {
                const entry = new Date(spot.currentSession.entryTime).getTime();
                const minutes = Math.max(1, Math.floor((now - entry) / (1000 * 60)));
                const billedHours = Math.max(1, Math.ceil(minutes / 60));
                activeAccruedRevenue += billedHours * spot.ratePerHour;
            }
        });

        return {
            totalSpots,
            occupiedCount,
            freeCount,
            evTotal,
            evOccupied,
            evFree,
            standardTotal,
            standardOccupied,
            standardFree,
            occupancyRate: Math.round((occupiedCount / totalSpots) * 100),
            totalRevenue,
            activeAccruedRevenue,
            totalSessions
        };
    },

    getReceipts(userId = null) {
        const data = loadDb();
        if (userId) {
            return data.receipts.filter(r => r.userId === userId);
        }
        return data.receipts;
    },

    // User management
    getUserByEmail(email) {
        const data = loadDb();
        return data.users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
    },

    getUserById(id) {
        const data = loadDb();
        return data.users.find(u => u.id === id);
    },

    createUser({ email, password, name, role = 'user', carPlate = '', carModel = '', carType = 'standard' }) {
        const data = loadDb();
        const existing = data.users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
        if (existing) {
            throw new Error('Пользователь с таким Email уже зарегистрирован.');
        }

        const newUser = {
            id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            email: email.toLowerCase().trim(),
            passwordHash: hashPassword(password),
            name: name.trim(),
            role: role === 'admin' ? 'admin' : 'user',
            carPlate: carPlate.trim().toUpperCase(),
            carModel: carModel.trim(),
            carType: carType === 'ev' ? 'ev' : 'standard',
            createdAt: new Date().toISOString()
        };

        data.users.push(newUser);
        saveDb(data);

        // Return user without passwordHash
        const { passwordHash, ...userClean } = newUser;
        return userClean;
    }
};

module.exports = db;
