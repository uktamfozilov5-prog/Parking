/**
 * SmartPark Pro - API Client
 */

const API_BASE = '/api';

class ApiClient {
    constructor() {
        this.token = localStorage.getItem('smartpark_token') || null;
    }

    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('smartpark_token', token);
        } else {
            localStorage.removeItem('smartpark_token');
        }
    }

    getToken() {
        return this.token;
    }

    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(`${API_BASE}${endpoint}`, {
                ...options,
                headers
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                const errorMessage = data.error || data.message || `Ошибка сервера (${response.status})`;
                throw new Error(errorMessage);
            }

            return data;
        } catch (error) {
            console.error(`API Error on [${options.method || 'GET'} ${endpoint}]:`, error);
            throw error;
        }
    }

    // Auth
    async login(email, password) {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        this.setToken(data.token);
        return data;
    }

    async register(userData) {
        const data = await this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
        this.setToken(data.token);
        return data;
    }

    async getMe() {
        if (!this.token) return null;
        return await this.request('/auth/me');
    }

    logout() {
        this.setToken(null);
    }

    // Parking spots
    async getSpots() {
        return await this.request('/spots');
    }

    async getSpot(id) {
        return await this.request(`/spots/${id}`);
    }

    async parkSpot(id, payload) {
        return await this.request(`/spots/${id}/park`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    async unparkSpot(id, simulatedExitMinutes = null) {
        return await this.request(`/spots/${id}/unpark`, {
            method: 'POST',
            body: JSON.stringify({ simulatedExitMinutes })
        });
    }

    // User history
    async getUserReceipts() {
        return await this.request('/user/receipts');
    }

    // Admin
    async getAdminStats() {
        return await this.request('/admin/stats');
    }

    async getAdminReceipts() {
        return await this.request('/admin/receipts');
    }

    async adminForceRelease(id, simulatedExitMinutes = null) {
        return await this.request(`/admin/spots/${id}/force-release`, {
            method: 'POST',
            body: JSON.stringify({ simulatedExitMinutes })
        });
    }

    async adminResetAll() {
        return await this.request('/admin/reset-all', {
            method: 'POST'
        });
    }
}

const api = new ApiClient();
