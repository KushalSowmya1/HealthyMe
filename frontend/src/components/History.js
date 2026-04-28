import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from './AppShell';
import { getHistory } from '../services/api';

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
  const sleep = Number(inputs?.sleep || 0);
  const water = Number(inputs?.water || 0);
  const exercise = Number(inputs?.exercise || 0);
  const calories = Number(inputs?.calories || 0);
  const calorieTarget = getCalorieTarget(goal);

  const sleepScore = Math.max(0, 100 - Math.abs(sleep - 7.5) * 16);
  const waterScore = Math.max(0, 100 - Math.abs(water - 3) * 25);
  const exerciseScore = Math.max(0, Math.min(100, (exercise / 45) * 100));
  const calorieScore = Math.max(0, 100 - (Math.abs(calories - calorieTarget) / calorieTarget) * 135);

  return Math.round((sleepScore * 0.3 + waterScore * 0.2 + exerciseScore * 0.2 + calorieScore * 0.3) * 10) / 10;
}

export default function History() {
  const navigate = useNavigate();
  const storedUser = localStorage.getItem('user');
  const user = storedUser ? JSON.parse(storedUser) : null;
  const goal = user?.profile?.goal || 'Stay Fit';

  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const fetchHistory = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await getHistory();
        if (isMounted) {
          setHistory(Array.isArray(response) ? response : []);
        }
      } catch (fetchError) {
        if (fetchError.message === 'Missing authentication token') {
          navigate('/login');
          return;
        }
        if (isMounted) {
          setError(fetchError.message || 'Failed to fetch data');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchHistory();
    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const processedHistory = useMemo(() => {
    return history.map((item) => {
      const raw = clampScore(item.score);
      const displayScore = raw > 0 ? raw : calculateDisplayScore(item.input_data, goal);
      return {
        ...item,
        displayScore,
        entryDate: item.ui_context?.entry_date || item.created_at.slice(0, 10),
      };
    });
  }, [history, goal]);

  return (
    <AppShell
      title="Prediction History"
      subtitle="All previous health score predictions saved for this account."
      actions={<button type="button" className="ghost-btn" onClick={() => navigate('/predict')}>New Prediction</button>}
    >
      {loading ? <div className="empty-state">Loading...</div> : null}
      {!loading && error ? <div className="empty-state">{error || 'Failed to fetch data'}</div> : null}
      {!loading && !error && processedHistory.length === 0 ? <div className="empty-state">No data available</div> : null}

      {!loading && !error && processedHistory.length > 0 ? (
        <div className="history-grid">
          {processedHistory.map((item) => (
            <article className="history-card" key={item.id}>
              <div className="history-meta">
                <span className="score-pill">{item.displayScore.toFixed(2)}</span>
                <span className="hint">{item.entryDate}</span>
              </div>
              <h3>Health snapshot</h3>
              <p>{item.ui_context?.meal_notes || 'Saved prediction using the four model inputs from your form.'}</p>
              <div className="mini-grid">
                <div className="mini-card"><span className="hint">Sleep</span><strong>{item.input_data.sleep}</strong></div>
                <div className="mini-card"><span className="hint">Water</span><strong>{item.input_data.water}</strong></div>
                <div className="mini-card"><span className="hint">Exercise</span><strong>{item.input_data.exercise}</strong></div>
                <div className="mini-card"><span className="hint">Calories</span><strong>{item.input_data.calories}</strong></div>
              </div>
              <div className="button-row history-actions">
                <button type="button" className="ghost-btn compact" onClick={() => navigate(`/predict?date=${item.entryDate}`)}>
                  Edit this day
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </AppShell>
  );
}
