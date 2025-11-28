import axios from 'axios';

const BASE_URL = 'http://rust-service:8800'; // Direct backend access in Docker

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

        // 3. Try create task with datetime-local format (no seconds, no Z)
        const localDate = "2025-11-28T12:30";
        try {
            console.log(`Testing datetime-local format: "${localDate}"...`);
            await axios.post(`${BASE_URL}/projects/${project.id}/tasks`, {
                title: 'Test Local Date Format',
                status: 'pending',
                due_date: localDate
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('Success: local date format');
        } catch (e: any) {
            console.log('Failed: local date format', e.response?.data || e.message);
        }

        // 4. Try create task with full ISO format
        const isoDate = new Date(localDate).toISOString();
        try {
            console.log(`Testing ISO format: "${isoDate}"...`);
            await axios.post(`${BASE_URL}/projects/${project.id}/tasks`, {
                title: 'Test ISO Date Format',
                status: 'pending',
                due_date: isoDate
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('Success: ISO date format');
        } catch (e: any) {
            console.log('Failed: ISO date format', e.response?.data || e.message);
        }

    } catch (e: any) {
        console.error('Setup failed:', e.message);
    }
}

run();
