import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppShell from './AppShell';
import { predictHealthScore, getHistory } from '../services/api';

const modelFields = [
  { name: 'sleep', label: 'Sleep', placeholder: 'Hours slept', hint: 'Model feature 1' },
  { name: 'water', label: 'Water intake', placeholder: 'Liters of water', hint: 'Model feature 2' },
  { name: 'exercise', label: 'Exercise', placeholder: 'Minutes exercised', hint: 'Model feature 3' },
  { name: 'calories', label: 'Food consumption', placeholder: 'Calories consumed', hint: 'Model feature 4' },
];

function clampScore(value) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

function getCalorieTarget(goal) {
  if (goal === 'Gain Muscle') return 2600;
  if (goal === 'Lose Weight') return 1900;
  return 2200;
}

function calculateDisplayScore(inputs, goal) {
  const sleep = Number(inputs.sleep || 0);
  const water = Number(inputs.water || 0);
  const exercise = Number(inputs.exercise || 0);
  const calories = Number(inputs.calories || 0);
  const calorieTarget = getCalorieTarget(goal);

  const sleepScore = Math.max(0, 100 - Math.abs(sleep - 7.5) * 16);
  const waterScore = Math.max(0, 100 - Math.abs(water - 3) * 25);
  const exerciseScore = Math.max(0, Math.min(100, (exercise / 45) * 100));
  const calorieScore = Math.max(0, 100 - (Math.abs(calories - calorieTarget) / calorieTarget) * 135);

  return Math.round((sleepScore * 0.3 + waterScore * 0.2 + exerciseScore * 0.2 + calorieScore * 0.3) * 10) / 10;
}

function buildResearchSnapshot(inputs, goal) {
  const score = calculateDisplayScore(inputs, goal);

  if (score >= 80) {
    return {
      status: 'Excellent balance',
      insight: 'Your current routine shows strong recovery, hydration, and activity alignment.',
    };
  }
  if (score >= 60) {
    return {
      status: 'Moderate stability',
      insight: 'You are doing well overall, but one lifestyle factor is still limiting better performance.',
    };
  }
  if (score >= 40) {
    return {
      status: 'Needs intervention',
      insight: 'Your inputs suggest meaningful improvement is possible through sleep, food timing, and hydration.',
    };
  }
  return {
    status: 'High-risk pattern',
    insight: 'Your routine is far from the healthy target zone and needs stronger daily correction.',
  };
}

function toLocalDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function Predict() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const storedUser = localStorage.getItem('user');
  const user = storedUser ? JSON.parse(storedUser) : null;
  const goal = user?.profile?.goal || 'Stay Fit';
  const initialDate = searchParams.get('date') || toLocalDateInput(new Date());

  const [formData, setFormData] = useState({
    entry_date: initialDate,
    sleep: '',
    water: '',
    exercise: '',
    calories: '',
    meals: '',
    protein: '',
  });
  const [score, setScore] = useState(null);
  const [modelScore, setModelScore] = useState(null);
  const [loading, setLoading] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadExistingEntry = async () => {
      setPrefillLoading(true);
      try {
        const history = await getHistory();
        const existing = Array.isArray(history)
          ? history.find((item) => (item.ui_context?.entry_date || item.created_at.slice(0, 10)) === initialDate)
          : null;

        if (existing && isMounted) {
          setFormData({
            entry_date: initialDate,
            sleep: existing.input_data?.sleep ?? '',
            water: existing.input_data?.water ?? '',
            exercise: existing.input_data?.exercise ?? '',
            calories: existing.input_data?.calories ?? '',
            meals: existing.ui_context?.meal_notes || '',
            protein: existing.ui_context?.protein || '',
          });
          setModelScore(clampScore(existing.score));
          setScore(clampScore(existing.score) > 0 ? clampScore(existing.score) : calculateDisplayScore(existing.input_data, goal));
        }
      } catch {
      } finally {
        if (isMounted) {
          setPrefillLoading(false);
        }
      }
    };

    loadExistingEntry();
    return () => {
      isMounted = false;
    };
  }, [initialDate, goal]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        entry_date: formData.entry_date,
        sleep: Number(formData.sleep),
        water: Number(formData.water),
        exercise: Number(formData.exercise),
        calories: Number(formData.calories),
        meal_notes: formData.meals,
        protein: formData.protein,
      };

      const response = await predictHealthScore(payload);
      const backendScore = clampScore(response.score);
      const displayScore = backendScore > 0 ? backendScore : calculateDisplayScore(payload, goal);

      setModelScore(backendScore);
      setScore(displayScore);
      localStorage.setItem('healthyme_latest_food_notes', formData.meals || '');
      localStorage.setItem('healthyme_latest_protein', formData.protein || '');
      localStorage.setItem('healthyme_latest_inputs', JSON.stringify(payload));
      localStorage.setItem('healthyme_latest_display_score', String(displayScore));
      localStorage.setItem('healthyme_latest_goal', goal);
      setSuccess('Prediction completed successfully.');
    } catch (submitError) {
      if (submitError.message === 'Missing authentication token') {
        navigate('/login');
        return;
      }
      setError(submitError.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const scoreMeta = useMemo(() => {
    if (score === null) {
      return {
        status: 'No data available',
        insight: 'Submit daily lifestyle inputs to generate your score.',
      };
    }
    return buildResearchSnapshot(formData, goal);
  }, [score, formData, goal]);

  return (
    <AppShell
      title="Daily Health Check"
      subtitle="Capture hydration, sleep, exercise, food intake, and even missed previous-day entries while keeping the exact ML feature order."
      actions={<button type="button" className="ghost-btn" onClick={() => navigate('/dashboard')}>Back to Dashboard</button>}
    >
      <div className="predict-layout">
        <section className="panel-card">
          <div className="panel-head">
            <h3>Model Inputs</h3>
            <span className="top-pill">Strict ML order</span>
          </div>

          <form className="form-grid advanced-form" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="entry_date">Entry date</label>
              <input
                id="entry_date"
                type="date"
                name="entry_date"
                value={formData.entry_date}
                onChange={handleChange}
                max={toLocalDateInput(new Date())}
                required
              />
              <span className="hint">Choose today or a previous day if you forgot to enter it earlier.</span>
            </div>

            <div className="input-grid">
              {modelFields.map((field) => (
                <div className="field" key={field.name}>
                  <label htmlFor={field.name}>{field.label}</label>
                  <input
                    id={field.name}
                    type="number"
                    name={field.name}
                    step="any"
                    placeholder={field.placeholder}
                    value={formData[field.name]}
                    onChange={handleChange}
                    required
                  />
                  <span className="hint">{field.hint}</span>
                </div>
              ))}
            </div>

            <div className="input-grid">
              <div className="field">
                <label htmlFor="meals">Food notes for that day</label>
                <textarea
                  id="meals"
                  name="meals"
                  value={formData.meals}
                  onChange={handleChange}
                  placeholder="Example: idly for breakfast, dal rice for lunch, roti and chicken for dinner"
                  rows="4"
                />
              </div>

              <div className="field">
                <label htmlFor="protein">Protein intake estimate (g)</label>
                <input
                  id="protein"
                  name="protein"
                  type="number"
                  value={formData.protein}
                  onChange={handleChange}
                  placeholder="Optional"
                />
                <span className="hint">Used for richer UI insights, not passed to the ML model.</span>
              </div>
            </div>

            <span className={`status-text ${error ? 'error-text' : success ? 'success-text' : ''}`}>
              {prefillLoading ? 'Loading previous entry...' : error || success || 'No data available'}
            </span>

            <button className="primary-btn" type="submit" disabled={loading || prefillLoading}>
              {loading ? 'Generating...' : 'Generate Health Score'}
            </button>
          </form>
        </section>

        <aside className="stack">
          <section className="panel-card prediction-score-card">
            <span className="eyebrow">Displayed score</span>
            <div className="result-score">{score !== null ? clampScore(score).toFixed(2) : '--'}</div>
            <p className="stat-label">{scoreMeta.status}</p>
            <p className="hint">{scoreMeta.insight}</p>
            {modelScore !== null && modelScore === 0 ? <p className="hint">Research-mode display score is shown because the raw ML output was very low.</p> : null}
          </section>

          <section className="panel-card">
            <h3>Daily Snapshot</h3>
            <div className="metric-list">
              <div className="metric-item"><span>Sleep</span><strong>{formData.sleep || '--'} h</strong></div>
              <div className="metric-item"><span>Water</span><strong>{formData.water || '--'} L</strong></div>
              <div className="metric-item"><span>Exercise</span><strong>{formData.exercise || '--'} min</strong></div>
              <div className="metric-item"><span>Calories</span><strong>{formData.calories || '--'}</strong></div>
            </div>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
