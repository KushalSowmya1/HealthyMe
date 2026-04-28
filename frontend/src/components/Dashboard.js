import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from './AppShell';
import { getHistory } from '../services/api';

const DAILY_WATER_INCREMENT = 0.25;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

function getDateKey(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString().slice(0, 10);
}

function getEntryDateKey(item) {
  return item.ui_context?.entry_date || item.created_at.slice(0, 10);
}

function getActiveDateSet(history) {
  return new Set(history.map((item) => getEntryDateKey(item)));
}

function getCurrentStreak(activeDates) {
  let streak = 0;
  const cursor = new Date();

  while (activeDates.has(getDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function getMonthStats(history, monthDate) {
  const month = monthDate.getMonth();
  const year = monthDate.getFullYear();
  const items = history.filter((item) => {
    const date = new Date(getEntryDateKey(item));
    return date.getMonth() === month && date.getFullYear() === year;
  });

  const activeDays = new Set(items.map((item) => getEntryDateKey(item))).size;
  return { count: items.length, activeDays };
}

function getCalendarCells(monthDate, activeDates) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();
  const cells = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({ type: 'empty', key: `empty-start-${index}` });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const key = getDateKey(date);
    cells.push({
      type: 'day',
      key,
      day,
      active: activeDates.has(key),
      isToday: key === getDateKey(new Date()),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ type: 'empty', key: `empty-end-${cells.length}` });
  }

  return cells;
}

function extractMealParts(foodNotes) {
  const text = String(foodNotes || '').trim();
  if (!text) {
    return {
      breakfast: 'Not specified',
      lunch: 'Not specified',
      dinner: 'Not specified',
    };
  }

  const lower = text.toLowerCase();
  const breakfastIndex = lower.indexOf('breakfast');
  const lunchIndex = lower.indexOf('lunch');
  const dinnerIndex = lower.indexOf('dinner');

  const sliceBetween = (startIndex, endIndex, label) => {
    if (startIndex === -1) return '';
    const labelEnd = startIndex + label.length;
    const sliced = text.slice(labelEnd, endIndex === -1 ? text.length : endIndex);
    return sliced.replace(/^\s*[:\-]?\s*/,'').replace(/\s+/g,' ').trim().replace(/,$/, '');
  };

  const breakfast = sliceBetween(breakfastIndex, lunchIndex !== -1 ? lunchIndex : dinnerIndex, 'breakfast');
  const lunch = sliceBetween(lunchIndex, dinnerIndex, 'lunch');
  const dinner = sliceBetween(dinnerIndex, -1, 'dinner');

  if (breakfast || lunch || dinner) {
    return {
      breakfast: breakfast || 'Not specified',
      lunch: lunch || 'Not specified',
      dinner: dinner || 'Not specified',
    };
  }

  const parts = text.split(/,|\band\b/i).map((part) => part.trim()).filter(Boolean);
  return {
    breakfast: parts[0] || 'Not specified',
    lunch: parts[1] || 'Not specified',
    dinner: parts[2] || 'Not specified',
  };
}

function buildResearchInsights(entry, goal) {
  const inputs = entry?.input_data || {};
  const sleep = Number(inputs.sleep || 0);
  const water = Number(inputs.water || 0);
  const exercise = Number(inputs.exercise || 0);
  const calories = Number(inputs.calories || 0);
  const calorieTarget = getCalorieTarget(goal);

  return [
    {
      title: 'Sleep Quality',
      value: sleep ? `${sleep}h` : '--',
      note: sleep >= 7 && sleep <= 8 ? 'Within recovery zone.' : 'Outside the ideal recovery range.',
    },
    {
      title: 'Hydration Status',
      value: water ? `${water}L` : '--',
      note: water >= 2.5 ? 'Hydration is reasonably aligned.' : 'Hydration may be limiting recovery.',
    },
    {
      title: 'Exercise Load',
      value: exercise ? `${exercise} min` : '--',
      note: exercise >= 30 ? 'Meets the minimum active threshold.' : 'Daily movement is below target.',
    },
    {
      title: 'Calorie Alignment',
      value: calories ? `${calories}` : '--',
      note: calories ? `Target benchmark is ${calorieTarget}.` : 'No calorie record available.',
    },
  ];
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [todayWater, setTodayWater] = useState(() => Number(localStorage.getItem('healthyme_today_water') || 0));
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDateKey, setSelectedDateKey] = useState(() => getDateKey(new Date()));

  const storedUser = localStorage.getItem('user');
  const user = storedUser ? JSON.parse(storedUser) : null;
  const profile = user?.profile || {};

  useEffect(() => {
    localStorage.setItem('healthyme_today_water', String(todayWater));
  }, [todayWater]);

  useEffect(() => {
    let isMounted = true;

    const fetchHistory = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await getHistory();
        if (isMounted) {
          const data = Array.isArray(response) ? response : [];
          setHistory(data);
          if (data.length > 0 && !data.some((item) => getEntryDateKey(item) === selectedDateKey)) {
            setSelectedDateKey(getEntryDateKey(data[0]));
          }
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

  const activeDates = useMemo(() => getActiveDateSet(history), [history]);
  const streakCount = useMemo(() => getCurrentStreak(activeDates), [activeDates]);
  const monthStats = useMemo(() => getMonthStats(history, calendarMonth), [history, calendarMonth]);
  const calendarCells = useMemo(() => getCalendarCells(calendarMonth, activeDates), [calendarMonth, activeDates]);
  const selectedEntry = useMemo(() => history.find((item) => getEntryDateKey(item) === selectedDateKey) || null, [history, selectedDateKey]);

  const summary = useMemo(() => {
    const latest = history[0];
    const average = (key) =>
      history.length
        ? history.reduce((sum, item) => sum + Number(item.input_data?.[key] || 0), 0) / history.length
        : 0;

    const weeklyEntries = history.filter((item) => {
      const created = new Date(getEntryDateKey(item));
      const now = new Date();
      return (now - created) / (1000 * 60 * 60 * 24) <= 7;
    });

    const rawHistoryScore = latest ? clampScore(latest.score) : null;
    const fallbackHistoryScore = latest ? calculateDisplayScore(latest.input_data, profile.goal) : 0;
    const preferredScore = rawHistoryScore && rawHistoryScore > 0 ? rawHistoryScore : fallbackHistoryScore;
    const waterGoal = Number(profile.daily_water_goal || 3);
    const averageCalories = average('calories');

    return {
      latestScore: preferredScore,
      latestScoreLabel: preferredScore ? preferredScore.toFixed(1) : '--',
      averageSleepLabel: average('sleep') ? `${average('sleep').toFixed(1)}h` : '0h',
      averageWaterLabel: average('water') ? `${average('water').toFixed(1)}L` : '0L',
      averageCaloriesLabel: averageCalories ? `${Math.round(averageCalories)}` : '0',
      averageCalories,
      weeklyPredictionCount: weeklyEntries.length,
      waterGoal,
      calorieGoal: getCalorieTarget(profile.goal),
    };
  }, [history, profile.daily_water_goal, profile.goal]);

  const weeklyChart = useMemo(() => {
    const recent = [...history]
      .slice(0, 7)
      .reverse()
      .map((item) => {
        const raw = clampScore(item.score);
        const fallback = calculateDisplayScore(item.input_data, profile.goal);
        return {
          day: new Date(getEntryDateKey(item)).toLocaleDateString('en-US', { weekday: 'short' }),
          score: raw > 0 ? raw : fallback,
        };
      });

    return recent.length === 0 ? DAY_LABELS.map((day) => ({ day, score: 0 })) : recent;
  }, [history, profile.goal]);

  const selectedMealLog = useMemo(() => extractMealParts(selectedEntry?.ui_context?.meal_notes || ''), [selectedEntry]);
  const researchInsights = useMemo(() => buildResearchInsights(selectedEntry || history[0], profile.goal), [selectedEntry, history, profile.goal]);

  const scoreMessage = useMemo(() => {
    if (!summary.latestScore) return 'Run your first prediction to unlock insights and daily tracking.';
    if (summary.latestScore >= 80) return 'Excellent momentum. Your routine is near the healthy target range.';
    if (summary.latestScore >= 60) return 'Good baseline. One or two lifestyle variables are still limiting peak performance.';
    if (summary.latestScore >= 40) return 'Moderate-risk pattern. Daily correction in food, hydration, or recovery is needed.';
    return 'High-risk pattern. Your routine needs stronger lifestyle correction today.';
  }, [summary.latestScore]);

  const waterProgress = Math.min(100, Math.round((todayWater / (summary.waterGoal || 1)) * 100));
  const calorieProgress = Math.min(100, Math.round((summary.averageCalories / (summary.calorieGoal || 1)) * 100));
  const gaugeValue = summary.latestScore ? Math.round(summary.latestScore) : 0;

  const addWater = () => {
    setTodayWater((current) => Number((current + DAILY_WATER_INCREMENT).toFixed(2)));
  };

  const resetWater = () => {
    setTodayWater(0);
  };

  const openPreviousMonth = () => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
  };

  const openNextMonth = () => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
  };

  const openDateEditor = (dateKey) => {
    setSelectedDateKey(dateKey);
    navigate(`/predict?date=${dateKey}`);
  };

  return (
    <AppShell
      title={`Welcome back, ${user?.name || 'User'}`}
      subtitle="Research-oriented wellness dashboard with one real daily meal log, monthly adherence tracking, and stronger score interpretation."
      actions={<button type="button" className="ghost-btn" onClick={() => navigate('/predict')}>New prediction</button>}
    >
      {loading ? <div className="empty-state">Loading...</div> : null}
      {!loading && error ? <div className="empty-state">{error || 'Failed to fetch data'}</div> : null}

      {!loading && !error ? (
        <>
          <section className="dashboard-hero premium-dark expanded-hero">
            <div className="hero-score-panel premium-dark-panel">
              <span className="floating-blob blob-one" />
              <span className="floating-blob blob-two" />
              <div className="hero-illustration">AI</div>

              <div className="eyebrow">Health score</div>
              <div className="hero-score-row">
                <div>
                  <h2>{summary.latestScoreLabel}</h2>
                  <p>{scoreMessage}</p>
                </div>
                <div className="hero-badge-stack">
                  <span className="hero-badge">Goal: {profile.goal || 'Stay Fit'}</span>
                  <span className="hero-badge soft">Live streak: {streakCount} days</span>
                </div>
              </div>

              <div className="hero-score-footer">
                <span>{summary.weeklyPredictionCount} predictions this week</span>
                <div className="button-row">
                  <button type="button" className="ghost-btn ghost-invert compact" onClick={() => navigate('/history')}>
                    Open history
                  </button>
                  <button type="button" className="ghost-btn ghost-invert compact" onClick={() => navigate('/chat')}>
                    Ask coach
                  </button>
                </div>
              </div>
            </div>

            <div className="hero-side-grid expanded-side-grid">
              <div className="spotlight-card water glass-panel">
                <span className="eyebrow">Hydration target</span>
                <strong>{summary.waterGoal}L</strong>
                <p>{profile.food_preference || 'Balanced'} nutrition plan</p>
              </div>

              <div className="spotlight-card food glass-panel">
                <span className="eyebrow">Selected day</span>
                <strong>{selectedDateKey}</strong>
                <p>{selectedEntry?.ui_context?.meal_notes || 'Choose a day and add its meal notes from Predict.'}</p>
              </div>

              <div className="spotlight-card glass-panel monthly-spotlight">
                <span className="eyebrow">Monthly adherence</span>
                <strong>{monthStats.activeDays} active days</strong>
                <p>{monthStats.count} predictions in {calendarMonth.toLocaleDateString('en-US', { month: 'long' })}.</p>
              </div>
            </div>
          </section>

          <section className="wellness-grid expanded-wellness-grid">
            <div className="progress-card glass-panel">
              <div className="progress-ring" style={{ '--progress': `${waterProgress}%`, '--ring-color': '#20b8a6' }}>
                <div>
                  <strong>{waterProgress}%</strong>
                  <span>Water</span>
                </div>
              </div>
              <div className="progress-copy">
                <h3>Water intake tracker</h3>
                <p>{todayWater.toFixed(2)}L logged today out of your {summary.waterGoal}L hydration goal.</p>
                <div className="button-row">
                  <button type="button" className="primary-btn compact" onClick={addWater}>+ 250ml</button>
                  <button type="button" className="ghost-btn compact" onClick={resetWater}>Reset</button>
                </div>
              </div>
            </div>

            <div className="progress-card glass-panel">
              <div className="progress-ring" style={{ '--progress': `${calorieProgress}%`, '--ring-color': '#ff9533' }}>
                <div>
                  <strong>{calorieProgress}%</strong>
                  <span>Calories</span>
                </div>
              </div>
              <div className="progress-copy">
                <h3>Energy balance trend</h3>
                <p>Average calories: {summary.averageCaloriesLabel} / {summary.calorieGoal}. Goal tuned for {profile.goal || 'general fitness'}.</p>
                <span className="hint">This is useful for research-style trend interpretation over time.</span>
              </div>
            </div>

            <div className="progress-card glass-panel habit-card">
              <div className="habit-badge">HM</div>
              <div className="progress-copy">
                <h3>Behavioral adherence</h3>
                <p>{streakCount > 0 ? `You have logged ${streakCount} days in a row.` : 'Log today to start a new daily adherence streak.'}</p>
                <div className="button-row">
                  <button type="button" className="ghost-btn compact" onClick={() => navigate(`/predict?date=${selectedDateKey}`)}>Edit selected day</button>
                  <button type="button" className="ghost-btn compact" onClick={() => setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>This month</button>
                </div>
              </div>
            </div>
          </section>

          <section className="dashboard-grid luxury expanded-dashboard-grid">
            <div className="panel-card glass-panel gauge-panel">
              <div className="panel-head">
                <h3>Circular Score Gauge</h3>
                <span className="top-pill">Research display score</span>
              </div>
              <div className="gauge-layout">
                <div className="score-gauge" style={{ '--score-progress': gaugeValue }}>
                  <div className="score-gauge-inner">
                    <strong>{summary.latestScoreLabel}</strong>
                    <span>Health score</span>
                  </div>
                </div>
                <div className="gauge-copy">
                  <strong>
                    {gaugeValue >= 80 ? 'Excellent' : gaugeValue >= 60 ? 'Strong' : gaugeValue >= 40 ? 'Average' : 'Needs care'}
                  </strong>
                  <p>This displayed score uses your latest inputs when the raw ML score becomes too flat or too low for useful interpretation.</p>
                </div>
              </div>
            </div>

            <div className="panel-card glass-panel">
              <div className="panel-head">
                <h3>Weekly Score Trend</h3>
                <span className="top-pill">Last 7 predictions</span>
              </div>
              <div className="weekly-chart">
                {weeklyChart.map((item, index) => (
                  <div className="chart-col" key={`${item.day}-${index}`}>
                    <div className="chart-track">
                      <div className="chart-bar" style={{ height: `${Math.max(item.score, 6)}%` }} />
                    </div>
                    <strong>{Math.round(item.score)}</strong>
                    <span>{item.day}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="panel-card glass-panel meal-section">
            <div className="panel-head">
              <h3>Meal Log For Selected Day</h3>
              <span className="top-pill">Based on saved food notes</span>
            </div>
            <div className="meal-grid expanded-meal-grid">
              <article className="meal-card orange">
                <span className="meal-label">Breakfast</span>
                <strong>{selectedMealLog.breakfast}</strong>
                <p>Saved from the selected day's entry.</p>
                <button type="button" className="ghost-btn compact meal-btn" onClick={() => navigate(`/predict?date=${selectedDateKey}`)}>
                  Edit this day
                </button>
              </article>
              <article className="meal-card teal">
                <span className="meal-label">Lunch</span>
                <strong>{selectedMealLog.lunch}</strong>
                <p>Saved from the selected day's entry.</p>
                <button type="button" className="ghost-btn compact meal-btn" onClick={() => navigate(`/predict?date=${selectedDateKey}`)}>
                  Edit this day
                </button>
              </article>
              <article className="meal-card purple">
                <span className="meal-label">Dinner</span>
                <strong>{selectedMealLog.dinner}</strong>
                <p>Saved from the selected day's entry.</p>
                <button type="button" className="ghost-btn compact meal-btn" onClick={() => navigate(`/predict?date=${selectedDateKey}`)}>
                  Edit this day
                </button>
              </article>
            </div>
          </section>

          <section className="panel-card glass-panel adaptive-plan-section">
            <div className="panel-head">
              <h3>Research Insights</h3>
              <span className="top-pill">Lifestyle factor analysis</span>
            </div>
            <div className="adaptive-plan-grid">
              {researchInsights.map((item) => (
                <article key={item.title} className="adaptive-plan-card blue">
                  <span className="meal-label">{item.title}</span>
                  <strong>{item.value}</strong>
                  <p>{item.note}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="dashboard-grid luxury expanded-dashboard-grid">
            <div className="panel-card feature-panel glass-panel">
              <div className="panel-head">
                <h3>Quick Actions</h3>
                <span className="top-pill">Personalized control center</span>
              </div>
              <div className="action-grid advanced">
                <button type="button" className="action-card premium" onClick={() => navigate('/predict')}>
                  <div className="card-icon icon-teal">PR</div>
                  <h3>Predict Score</h3>
                  <p>Run a fresh ML prediction from your sleep, water, exercise, and calories.</p>
                  <span className="card-arrow">Open</span>
                </button>
                <button type="button" className="action-card premium" onClick={() => navigate('/history')}>
                  <div className="card-icon icon-purple">HI</div>
                  <h3>View History</h3>
                  <p>See previous snapshots and compare patterns across your health routine.</p>
                  <span className="card-arrow">Open</span>
                </button>
                <button type="button" className="action-card premium" onClick={() => navigate('/chat')}>
                  <div className="card-icon icon-orange">AI</div>
                  <h3>Coach Chat</h3>
                  <p>Ask for daily advice about hydration, food, exercise, and better recovery.</p>
                  <span className="card-arrow">Open</span>
                </button>
              </div>
            </div>

            <div className="stack">
              <div className="panel-card insights-panel glass-panel">
                <div className="panel-head">
                  <h3>Daily Focus</h3>
                  <span className="top-pill">Smart suggestions</span>
                </div>
                <div className="insight-list">
                  <div className="insight-item">
                    <strong>Hydration</strong>
                    <span>{waterProgress < 100 ? 'Drink one more glass before evening.' : 'Great job hitting your water target.'}</span>
                  </div>
                  <div className="insight-item">
                    <strong>Sleep</strong>
                    <span>{summary.averageSleepLabel === '0h' ? 'Add your first prediction to unlock sleep insights.' : `Your recent average is ${summary.averageSleepLabel}.`}</span>
                  </div>
                  <div className="insight-item">
                    <strong>Nutrition</strong>
                    <span>{profile.food_preference || 'Balanced'} plan with {profile.goal || 'fitness'} as the main goal.</span>
                  </div>
                </div>
              </div>

              <div className="panel-card profile-panel glass-panel">
                <h3>Your Health Profile</h3>
                <div className="mini-grid">
                  <div className="mini-card"><span className="hint">Goal</span><strong>{profile.goal || 'Stay Fit'}</strong></div>
                  <div className="mini-card"><span className="hint">Activity</span><strong>{profile.activity_level || 'Moderate'}</strong></div>
                  <div className="mini-card"><span className="hint">Height</span><strong>{profile.height || '--'} cm</strong></div>
                  <div className="mini-card"><span className="hint">Weight</span><strong>{profile.weight || '--'} kg</strong></div>
                </div>
              </div>
            </div>
          </section>

          <section className="dashboard-grid luxury expanded-dashboard-grid">
            <div className="panel-card glass-panel bottle-panel">
              <div className="panel-head">
                <h3>Water Bottle Tracker</h3>
                <span className="top-pill">{todayWater.toFixed(2)}L today</span>
              </div>
              <div className="bottle-wrap">
                <div className="water-bottle">
                  <div className="water-bottle-cap" />
                  <div className="water-bottle-body">
                    <div className="water-fill" style={{ height: `${Math.max(waterProgress, 4)}%` }}>
                      <span className="water-wave" />
                    </div>
                  </div>
                </div>
                <div className="bottle-copy">
                  <strong>{waterProgress}% of goal</strong>
                  <p>Daily hydration adherence remains visible as part of your research-style dashboard.</p>
                </div>
              </div>
            </div>

            <div className="panel-card glass-panel month-calendar-panel">
              <div className="panel-head">
                <h3>Streak Calendar</h3>
                <div className="calendar-nav">
                  <button type="button" className="ghost-btn compact" onClick={openPreviousMonth}>Prev</button>
                  <span className="top-pill calendar-month-label">{calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                  <button type="button" className="ghost-btn compact" onClick={openNextMonth}>Next</button>
                </div>
              </div>

              <div className="calendar-weekdays">
                {DAY_LABELS.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>

              <div className="month-calendar-grid">
                {calendarCells.map((cell) =>
                  cell.type === 'empty' ? (
                    <div key={cell.key} className="month-day empty" />
                  ) : (
                    <button
                      key={cell.key}
                      type="button"
                      className={`month-day month-day-button ${cell.active ? 'active' : ''} ${cell.isToday ? 'today' : ''} ${selectedDateKey === cell.key ? 'selected' : ''}`}
                      onClick={() => setSelectedDateKey(cell.key)}
                      onDoubleClick={() => navigate(`/predict?date=${cell.key}`)}
                    >
                      <span>{cell.day}</span>
                      <strong>{cell.active ? 'Done' : 'Free'}</strong>
                    </button>
                  )
                )}
              </div>
              <div className="button-row calendar-actions">
                <button type="button" className="ghost-btn compact" onClick={() => navigate(`/predict?date=${selectedDateKey}`)}>Edit selected day</button>
                <button type="button" className="ghost-btn compact" onClick={() => setSelectedDateKey(getDateKey(new Date()))}>Jump to today</button>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </AppShell>
  );
}
