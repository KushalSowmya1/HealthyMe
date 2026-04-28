// frontend/src/App.js
import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import Predict from './components/Predict';
import History from './components/History';
import Chat from './components/Chat';
import { loginUser, registerUser } from './services/api';
import './styles.css';

const registerSteps = [
  { id: 'account', label: 'Account' },
  { id: 'body', label: 'Body' },
  { id: 'lifestyle', label: 'Lifestyle' },
  { id: 'health', label: 'Health' },
];

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    age: '',
    gender: '',
    height: '',
    weight: '',
    goal: 'Lose Weight',
    activity_level: 'Moderately Active',
    daily_water_goal: '3',
    food_preference: 'Balanced',
    food_notes: '',
    conditions: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  const isRegister = mode === 'register';
  const currentStep = registerSteps[step];

  const stepFields = useMemo(
    () => ({
      account: ['name', 'email', 'password'],
      body: ['age', 'gender', 'height', 'weight'],
      lifestyle: ['goal', 'activity_level', 'daily_water_goal', 'food_preference'],
      health: ['food_notes'],
    }),
    []
  );

  const canAdvance = () => {
    const fields = stepFields[currentStep.id];
    return fields.every((field) => String(formData[field] ?? '').trim());
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleModeChange = (nextMode) => {
    setMode(nextMode);
    setStep(0);
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload =
        mode === 'register'
          ? await registerUser(formData)
          : await loginUser({ email: formData.email, password: formData.password });

      localStorage.setItem('token', payload.token);
      localStorage.setItem('user', JSON.stringify(payload.user));
      navigate('/dashboard', { replace: true });
    } catch (submitError) {
      setError(submitError.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const renderRegisterFields = () => {
    if (currentStep.id === 'account') {
      return (
        <>
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input id="name" name="name" value={formData.name} onChange={handleChange} placeholder="Enter your full name" required />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" value={formData.email} onChange={handleChange} placeholder="Enter your email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" value={formData.password} onChange={handleChange} placeholder="Create a password" required />
          </div>
        </>
      );
    }

    if (currentStep.id === 'body') {
      return (
        <>
          <div className="split-grid">
            <div className="field">
              <label htmlFor="age">Age</label>
              <input id="age" name="age" type="number" value={formData.age} onChange={handleChange} placeholder="22" required />
            </div>
            <div className="field">
              <label htmlFor="gender">Gender</label>
              <select id="gender" name="gender" value={formData.gender} onChange={handleChange}>
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          <div className="split-grid">
            <div className="field">
              <label htmlFor="height">Height (cm)</label>
              <input id="height" name="height" type="number" value={formData.height} onChange={handleChange} placeholder="170" required />
            </div>
            <div className="field">
              <label htmlFor="weight">Weight (kg)</label>
              <input id="weight" name="weight" type="number" value={formData.weight} onChange={handleChange} placeholder="68" required />
            </div>
          </div>
        </>
      );
    }

    if (currentStep.id === 'lifestyle') {
      return (
        <>
          <div className="field">
            <label htmlFor="goal">Primary goal</label>
            <select id="goal" name="goal" value={formData.goal} onChange={handleChange}>
              <option value="Lose Weight">Lose Weight</option>
              <option value="Gain Muscle">Gain Muscle</option>
              <option value="Stay Fit">Stay Fit</option>
              <option value="Improve Sleep">Improve Sleep</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="activity_level">Activity level</label>
            <select id="activity_level" name="activity_level" value={formData.activity_level} onChange={handleChange}>
              <option value="Sedentary">Sedentary</option>
              <option value="Lightly Active">Lightly Active</option>
              <option value="Moderately Active">Moderately Active</option>
              <option value="Very Active">Very Active</option>
            </select>
          </div>
          <div className="split-grid">
            <div className="field">
              <label htmlFor="daily_water_goal">Daily water goal (L)</label>
              <input id="daily_water_goal" name="daily_water_goal" type="number" step="0.1" value={formData.daily_water_goal} onChange={handleChange} placeholder="3" required />
            </div>
            <div className="field">
              <label htmlFor="food_preference">Food preference</label>
              <select id="food_preference" name="food_preference" value={formData.food_preference} onChange={handleChange}>
                <option value="Balanced">Balanced</option>
                <option value="High Protein">High Protein</option>
                <option value="Vegetarian">Vegetarian</option>
                <option value="South Indian">South Indian</option>
                <option value="North Indian">North Indian</option>
              </select>
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="field">
          <label htmlFor="food_notes">Typical food consumption</label>
          <textarea
            id="food_notes"
            name="food_notes"
            value={formData.food_notes}
            onChange={handleChange}
            placeholder="Example: dosa for breakfast, dal rice for lunch, roti curry for dinner"
            rows="4"
          />
        </div>
        <div className="field">
          <label htmlFor="conditions">Medical conditions or notes</label>
          <textarea
            id="conditions"
            name="conditions"
            value={formData.conditions}
            onChange={handleChange}
            placeholder="Optional: diabetes, asthma, low iron, etc."
            rows="3"
          />
        </div>
      </>
    );
  };

  return (
    <div className="auth-shell advanced-auth cleaner-auth">
      <div className="auth-hero minimal-hero">
        <div className="brand-chip">
          <span className="brand-badge">HM</span>
          <span>HealthyMe Pro</span>
        </div>

        <div className="hero-copy compact-copy">
          <h1>{isRegister ? 'Create your health profile' : 'Smarter health tracking'}</h1>
          <p>
            {isRegister
              ? 'Set up your profile once and unlock personalized meal cards, hydration tracking, and a better dashboard.'
              : 'Sign in to continue with predictions, history, hydration, food insights, and your health dashboard.'}
          </p>
        </div>

        <div className="hero-panel compact-hero-panel">
          <div className="hero-stat">
            <span>Hydration</span>
            <strong>{formData.daily_water_goal || '3'}L</strong>
          </div>
          <div className="hero-stat">
            <span>Food Type</span>
            <strong>{formData.food_preference || 'Balanced'}</strong>
          </div>
        </div>
      </div>

      <div className="auth-card advanced-card">
        <h1>{isRegister ? 'Create your profile' : 'Welcome back'}</h1>
        <p>
          {isRegister
            ? 'Answer a few questions so the dashboard feels personalized from the start.'
            : 'Sign in to continue with predictions, progress history, and health insights.'}
        </p>

        <div className="switcher">
          <button type="button" className={!isRegister ? 'active' : ''} onClick={() => handleModeChange('login')}>
            Login
          </button>
          <button type="button" className={isRegister ? 'active' : ''} onClick={() => handleModeChange('register')}>
            Register
          </button>
        </div>

        {isRegister ? (
          <div className="step-row">
            {registerSteps.map((stepItem, index) => (
              <div key={stepItem.id} className={`step-chip ${index === step ? 'active' : index < step ? 'done' : ''}`}>
                <span>{index + 1}</span>
                <strong>{stepItem.label}</strong>
              </div>
            ))}
          </div>
        ) : null}

        <form className="form-grid" onSubmit={handleSubmit}>
          {isRegister ? (
            renderRegisterFields()
          ) : (
            <>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" name="email" type="email" value={formData.email} onChange={handleChange} placeholder="Enter your email" required />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input id="password" name="password" type="password" value={formData.password} onChange={handleChange} placeholder="Enter your password" required />
              </div>
            </>
          )}

          <span className={`status-text ${error ? 'error-text' : ''}`}>{loading ? 'Loading...' : error || ' '}</span>

          {isRegister ? (
            <div className="wizard-actions">
              <button type="button" className="ghost-btn" disabled={step === 0 || loading} onClick={() => setStep((current) => Math.max(0, current - 1))}>
                Back
              </button>
              {step < registerSteps.length - 1 ? (
                <button type="button" className="primary-btn" disabled={!canAdvance() || loading} onClick={() => setStep((current) => Math.min(registerSteps.length - 1, current + 1))}>
                  Continue
                </button>
              ) : (
                <button className="primary-btn" type="submit" disabled={loading}>
                  {loading ? 'Creating account...' : 'Create Account'}
                </button>
              )}
            </div>
          ) : (
            <button className="primary-btn" type="submit" disabled={loading}>
              {loading ? 'Please wait...' : 'Sign In'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/predict" element={<ProtectedRoute><Predict /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
