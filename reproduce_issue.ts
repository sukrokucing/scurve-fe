import axios from 'axios';

const BASE_URL = 'http://rust-service:8800'; // Backend service name in Docker network
// Actually the frontend runs on 3001, backend usually on 3000 or 8080.
// I need to check where the backend is running.
// The frontend proxy config or .env might tell me.
// But I can try hitting the frontend proxy /api if it exists, or the backend directly.
// Let's assume backend is at http://localhost:8080 based on common setups or check vite.config.ts

async function run() {
    try {
        // 1. Login
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'jimmy@dwp.co.id',
            password: 'password123'
        });
        const token = loginRes.data.token;
        console.log('Login successful');

        // 2. Get a project
        const projectsRes = await axios.get(`${BASE_URL}/projects`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const project = projectsRes.data[0];
        if (!project) {
            console.log('No projects found');
            return;
        }
        console.log('Using project:', project.id);

        // 3. Try create task with NO due_date
        try {
            console.log('Testing NO due_date...');
            await axios.post(`${BASE_URL}/projects/${project.id}/tasks`, {
                title: 'Test No Date',
                status: 'pending'
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('Success: NO due_date');
        } catch (e: any) {
            console.log('Failed: NO due_date', e.response?.data || e.message);
        }

        // 4. Try create task with empty string due_date
        try {
            console.log('Testing EMPTY string due_date...');
            await axios.post(`${BASE_URL}/projects/${project.id}/tasks`, {
                title: 'Test Empty Date',
                status: 'pending',
                due_date: ''
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('Success: EMPTY string due_date');
        } catch (e: any) {
            console.log('Failed: EMPTY string due_date', e.response?.data || e.message);
        }

        // 5. Try create task with NULL due_date
        try {
            console.log('Testing NULL due_date...');
            await axios.post(`${BASE_URL}/projects/${project.id}/tasks`, {
                title: 'Test Null Date',
                status: 'pending',
                due_date: null
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('Success: NULL due_date');
        } catch (e: any) {
            console.log('Failed: NULL due_date', e.response?.data || e.message);
        }

    } catch (e: any) {
        console.error('Setup failed:', e.message);
    }
}

run();
