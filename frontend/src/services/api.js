const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function getToken() {
  return localStorage.getItem('token');
}

function buildHeaders(includeAuth = false) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (includeAuth) {
    const token = getToken();
    if (!token) {
      throw new Error('Missing authentication token');
    }
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function handleResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    throw new Error(payload.error || payload.message || 'Request failed');
  }

  return payload;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  return handleResponse(response);
}

export async function registerUser(data) {
  return request('/register', {
    method: 'POST',
    headers: buildHeaders(false),
    body: JSON.stringify(data),
  });
}

export async function loginUser(data) {
  return request('/login', {
    method: 'POST',
    headers: buildHeaders(false),
    body: JSON.stringify(data),
  });
}

export async function predictHealthScore(data) {
  return request('/predict', {
    method: 'POST',
    headers: buildHeaders(true),
    body: JSON.stringify(data),
  });
}

export async function getHistory() {
  return request('/history', {
    method: 'GET',
    headers: buildHeaders(true),
  });
}

export async function sendChatMessage(message) {
  return request('/chat', {
    method: 'POST',
    headers: buildHeaders(true),
    body: JSON.stringify({ message }),
  });
}