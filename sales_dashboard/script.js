document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('data.json');
        const originalData = await response.json();

        const colorsDark = {
            ari: '#f472b6',
            ekkamai: '#a78bfa',
            rama9: '#4ade80',
            bangkhae: '#fbbf24',
            textPrimary: '#fafafa',
            textSecondary: '#a1a1aa',
            forecast: '#fbbf24',
            yoy: 'rgba(161, 161, 170, 0.45)',
            bgBase: '#09090b',
            gridColor: 'rgba(255, 255, 255, 0.08)',
            tooltipBg: 'rgba(24, 24, 27, 0.95)',
            tooltipBorder: 'rgba(255,255,255,0.08)'
        };

        const colorsLight = {
            ari: '#ec4899',
            ekkamai: '#8b5cf6',
            rama9: '#22c55e',
            bangkhae: '#f59e0b',
            textPrimary: '#1a1a2e',
            textSecondary: '#52525b',
            forecast: '#f59e0b',
            yoy: 'rgba(100, 100, 110, 0.4)',
            bgBase: '#f5f5f7',
            gridColor: 'rgba(0, 0, 0, 0.07)',
            tooltipBg: 'rgba(255, 255, 255, 0.96)',
            tooltipBorder: 'rgba(0, 0, 0, 0.08)'
        };

        let isLightMode = localStorage.getItem('dashboard-theme') === 'light';
        let colors = isLightMode ? { ...colorsLight } : { ...colorsDark };

        // Apply initial theme state
        if (isLightMode) {
            document.body.classList.add('light-mode');
        }

        const branchNamesTh = { Ari: 'อารีย์', Ekkamai: 'เอกมัย', Rama9: 'พระราม 9', BangKhae: 'บางแค' };
        const getDatasetConfigs = () => ({
            Ari:      { label: 'อารีย์',   color: colors.ari },
            Ekkamai:  { label: 'เอกมัย',   color: colors.ekkamai },
            Rama9:    { label: 'พระราม 9', color: colors.rama9 },
            BangKhae: { label: 'บางแค',    color: colors.bangkhae }
        });
        let datasetConfigs = getDatasetConfigs();

        // ── Thai month names for generating future labels ──
        const thaiMonthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

        // Parse Thai month label -> { monthIdx (0-11), year (Buddhist Era) }
        const parseThaiMonth = (label) => {
            const parts = label.split('/');
            if (parts.length !== 2) return null;
            const monthStr = parts[0].trim();
            const year = parseInt(parts[1].trim());
            const monthIdx = thaiMonthNames.indexOf(monthStr);
            if (monthIdx === -1 || isNaN(year)) return null;
            return { monthIdx, year };
        };

        // Generate Thai month label from monthIdx and year
        const makeThaiLabel = (monthIdx, year) => `${thaiMonthNames[monthIdx]}/${year}`;

        const formatCurrency = (v) => {
            if (v == null) return '—';
            return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(v);
        };

        const formatCurrencyShort = (v) => {
            if (v == null) return '—';
            if (v >= 1000000) return '฿' + new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(v / 1000000) + 'M';
            if (v >= 1000)    return '฿' + new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 }).format(v / 1000) + 'K';
            return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(v);
        };

        const getAbsTotal = (absIdx, branches) =>
            branches.reduce((s, b) => s + (originalData.branches[b]?.[absIdx] ?? 0), 0);

        // ══════════════════════════════════════════════════════
        // FORECAST ENGINE — 3 methods
        // ══════════════════════════════════════════════════════

        /**
         * Generate future month labels starting after the last month in data.
         * @param {number} count - number of months to generate
         * @returns {string[]} array of Thai month labels
         */
        const generateFutureLabels = (count) => {
            const lastLabel = originalData.months[originalData.months.length - 1];
            const parsed = parseThaiMonth(lastLabel);
            if (!parsed) return [];
            const labels = [];
            let m = parsed.monthIdx;
            let y = parsed.year;
            for (let i = 0; i < count; i++) {
                m++;
                if (m > 11) { m = 0; y++; }
                labels.push(makeThaiLabel(m, y));
            }
            return labels;
        };

        /**
         * Calculate how many months until end of 2570 (Dec 2570).
         */
        const monthsUntilEnd2570 = () => {
            const lastLabel = originalData.months[originalData.months.length - 1];
            const parsed = parseThaiMonth(lastLabel);
            if (!parsed) return 12;
            const lastAbsMonth = parsed.year * 12 + parsed.monthIdx;
            const target = 2570 * 12 + 11; // ธ.ค./2570
            return Math.max(1, target - lastAbsMonth);
        };

        /**
         * Seasonal YoY forecast for a single branch.
         * Uses the ratio pattern from 12 months ago to project forward.
         */
        const forecastSeasonalBranch = (branchData, count) => {
            const n = branchData.length;
            const result = [];
            const extendedData = [...branchData];

            for (let i = 0; i < count; i++) {
                const currentIdx = n + i;
                const lastYearIdx = currentIdx - 12;
                const prevLastYearIdx = currentIdx - 1 - 12;

                if (lastYearIdx >= 0 && lastYearIdx < extendedData.length &&
                    prevLastYearIdx >= 0 && prevLastYearIdx < extendedData.length &&
                    extendedData[prevLastYearIdx] > 0) {
                    // Seasonal ratio: next = current * (lastYear[next] / lastYear[current])
                    const ratio = extendedData[lastYearIdx] / extendedData[prevLastYearIdx];
                    const predicted = extendedData[currentIdx - 1] * ratio;
                    result.push(Math.max(0, Math.round(predicted)));
                } else {
                    // Fallback: linear regression over last 6 points
                    const recent = extendedData.slice(-6);
                    const ln = recent.length;
                    let sX = 0, sY = 0, sXY = 0, sXX = 0;
                    for (let j = 0; j < ln; j++) {
                        sX += j + 1; sY += recent[j]; sXY += (j + 1) * recent[j]; sXX += (j + 1) ** 2;
                    }
                    const m = (ln * sXY - sX * sY) / (ln * sXX - sX * sX);
                    const c = (sY - m * sX) / ln;
                    const next = m * (ln + 1) + c;
                    result.push(Math.max(0, Math.round(next)));
                }
                extendedData.push(result[result.length - 1]);
            }
            return result;
        };

        /**
         * Linear Trend forecast for a single branch.
         * Uses linear regression on the most recent 12 data points (or all available).
         */
        const forecastLinearBranch = (branchData, count) => {
            const windowSize = Math.min(12, branchData.length);
            const recent = branchData.slice(-windowSize);
            const n = recent.length;
            let sX = 0, sY = 0, sXY = 0, sXX = 0;
            for (let i = 0; i < n; i++) {
                const x = i + 1;
                sX += x; sY += recent[i]; sXY += x * recent[i]; sXX += x * x;
            }
            const slope = (n * sXY - sX * sY) / (n * sXX - sX * sX);
            const intercept = (sY - slope * sX) / n;

            const result = [];
            for (let i = 0; i < count; i++) {
                const x = n + i + 1;
                result.push(Math.max(0, Math.round(slope * x + intercept)));
            }
            return result;
        };

        /**
         * Moving Average forecast for a single branch.
         * Uses 3-month rolling average, iteratively extending.
         */
        const forecastMovingAvgBranch = (branchData, count) => {
            const result = [];
            const extended = [...branchData];
            const window = 3;
            for (let i = 0; i < count; i++) {
                const slice = extended.slice(-window);
                const avg = slice.reduce((s, v) => s + v, 0) / slice.length;
                result.push(Math.max(0, Math.round(avg)));
                extended.push(result[result.length - 1]);
            }
            return result;
        };

        /**
         * Generate full forecast data for all branches.
         * @returns {{ labels, branchForecasts: { [key]: number[] }, totalForecasts, confidenceBand: {upper, lower} }}
         */
        const generateForecast = (method, horizonMonths, branches) => {
            const labels = generateFutureLabels(horizonMonths);

            const branchForecasts = {};
            for (const b of Object.keys(originalData.branches)) {
                const data = originalData.branches[b];
                switch (method) {
                    case 'seasonal':
                        branchForecasts[b] = forecastSeasonalBranch(data, horizonMonths);
                        break;
                    case 'linear':
                        branchForecasts[b] = forecastLinearBranch(data, horizonMonths);
                        break;
                    case 'moving_avg':
                        branchForecasts[b] = forecastMovingAvgBranch(data, horizonMonths);
                        break;
                    default:
                        branchForecasts[b] = forecastSeasonalBranch(data, horizonMonths);
                }
            }

            // Total forecast (sum across selected branches)
            const totalForecasts = labels.map((_, i) =>
                branches.reduce((s, b) => s + (branchForecasts[b]?.[i] ?? 0), 0)
            );

            // Confidence Band: ±1 std dev based on historical residuals
            const historicalData = originalData.total_monthly;
            const n = historicalData.length;
            const mean = historicalData.reduce((s, v) => s + v, 0) / n;
            const variance = historicalData.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
            const stdDev = Math.sqrt(variance);
            // Widen confidence band as forecast goes further out
            const confidenceBand = {
                upper: totalForecasts.map((v, i) => Math.round(v + stdDev * (1 + i * 0.08))),
                lower: totalForecasts.map((v, i) => Math.max(0, Math.round(v - stdDev * (1 + i * 0.08))))
            };

            return { labels, branchForecasts, totalForecasts, confidenceBand };
        };

        // ══════════════════════════════════════════════════════
        // Existing dashboard forecast (single next-month)
        // ══════════════════════════════════════════════════════

        const predictNextYoY = (totalTrend, fromIdx, branches) => {
            const lastAbsIdx = fromIdx + totalTrend.length - 1;
            const nextAbsIdx = lastAbsIdx + 1;
            const nextLastYearIdx = nextAbsIdx - 12;
            const currLastYearIdx = lastAbsIdx - 12;
            if (
                nextLastYearIdx >= 0 && currLastYearIdx >= 0 &&
                nextLastYearIdx < originalData.months.length &&
                currLastYearIdx < originalData.months.length
            ) {
                const nextLY = getAbsTotal(nextLastYearIdx, branches);
                const currLY = getAbsTotal(currLastYearIdx, branches);
                if (currLY > 0) return totalTrend[totalTrend.length - 1] * (nextLY / currLY);
            }
            // Fallback: linear regression over last 6 points
            const arr = totalTrend.slice(-6);
            const n = arr.length;
            let sX = 0, sY = 0, sXY = 0, sXX = 0;
            for (let i = 0; i < n; i++) {
                sX += i + 1; sY += arr[i]; sXY += (i + 1) * arr[i]; sXX += (i + 1) ** 2;
            }
            const m = (n * sXY - sX * sY) / (n * sXX - sX * sX);
            const c = (sY - m * sX) / n;
            const next = m * (n + 1) + c;
            return next > 0 ? next : 0;
        };

        // Chart.js Global Defaults
        Chart.defaults.color = colors.textSecondary;
        Chart.defaults.font.family = "'Inter', sans-serif";
        Chart.defaults.font.weight = 500;

        const getCommonScales = () => ({
            y: {
                beginAtZero: false,
                grace: '5%',
                grid: { color: colors.gridColor, drawBorder: false, borderDash: [4, 4] },
                border: { display: false },
                ticks: {
                    font: { size: 12, weight: 500 },
                    color: colors.textSecondary,
                    padding: 12,
                    maxTicksLimit: 5,
                    callback: function(value) {
                        if (value >= 1000000) return '฿' + new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 }).format(value / 1000000) + 'M';
                        if (value >= 1000)    return '฿' + new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(value / 1000) + 'K';
                        return '฿' + new Intl.NumberFormat('th-TH').format(value);
                    }
                }
            },
            x: {
                grid: { display: false, drawBorder: false },
                border: { display: false },
                ticks: { font: { size: 11, weight: 500 }, color: colors.textSecondary, padding: 8, maxRotation: 45, minRotation: 30, autoSkip: true, maxTicksLimit: 12 }
            }
        });

        const getCommonPlugins = () => ({
            legend: {
                labels: { color: colors.textPrimary, padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { size: 12, weight: 500 } }
            },
            tooltip: {
                backgroundColor: colors.tooltipBg,
                titleColor: colors.textPrimary,
                bodyColor: colors.textSecondary,
                borderColor: colors.tooltipBorder,
                borderWidth: 1,
                padding: 14,
                cornerRadius: 10,
                boxPadding: 6,
                titleFont: { size: 13, weight: 600 },
                bodyFont: { size: 12, weight: 500 },
                callbacks: {
                    label: function(ctx) {
                        let l = ctx.dataset.label || '';
                        if (l) l += ': ';
                        if (ctx.parsed.y !== null) l += formatCurrency(ctx.parsed.y);
                        return l;
                    }
                }
            }
        });

        // DOM
        const branchFilter = document.getElementById('branchFilter');
        const fromFilter   = document.getElementById('fromFilter');
        const toFilter     = document.getElementById('toFilter');
        const forecastHorizonEl = document.getElementById('forecastHorizon');
        const forecastMethodEl  = document.getElementById('forecastMethod');
        let trendChart, barChart, doughnutChart, forecastChartInstance;

        // Populate range selects
        originalData.months.forEach((m, i) => {
            [fromFilter, toFilter].forEach(sel => {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = m;
                sel.appendChild(opt);
            });
        });
        fromFilter.value = '0';
        toFilter.value   = String(originalData.months.length - 1);

        const setChangeEl = (id, pct, label) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (pct === null || isNaN(pct)) { el.textContent = ''; return; }
            const sign  = pct >= 0 ? '+' : '';
            const arrow = pct >= 0 ? '↑' : '↓';
            el.textContent = `${arrow} ${sign}${pct.toFixed(1)}% ${label}`;
            el.className = 'kpi-change ' + (pct >= 0 ? 'change-up' : 'change-down');
        };

        // ─── Update Dashboard ───
        const updateDashboard = () => {
            const selBranch = branchFilter.value;
            let fromIdx = parseInt(fromFilter.value);
            let toIdx   = parseInt(toFilter.value);
            if (fromIdx > toIdx) { [fromIdx, toIdx] = [toIdx, fromIdx]; }

            const months     = originalData.months.slice(fromIdx, toIdx + 1);
            const branchData = {};
            for (const k in originalData.branches)
                branchData[k] = originalData.branches[k].slice(fromIdx, toIdx + 1);

            const branches      = selBranch === 'all' ? Object.keys(branchData) : [selBranch];
            const isSingleMonth = months.length === 1;

            const totalTrend = months.map((_, i) => branches.reduce((s, b) => s + branchData[b][i], 0));
            let totalSales = 0;
            const bTotals  = { Ari: 0, Ekkamai: 0, Rama9: 0, BangKhae: 0 };
            for (const b of branches) {
                const t = branchData[b].reduce((s, v) => s + v, 0);
                bTotals[b] = t;
                totalSales += t;
            }
            const avgMonthly = totalSales / months.length;

            let bestKey = branches[0], bestVal = bTotals[bestKey];
            for (const b of branches) { if (bTotals[b] > bestVal) { bestVal = bTotals[b]; bestKey = b; } }

            // YoY comparison: same date range, one year prior
            const yoyFrom = fromIdx - 12, yoyTo = toIdx - 12;
            let yoyTrend    = null;
            let yoySales    = 0;
            if (yoyFrom >= 0 && yoyTo < originalData.months.length) {
                yoyTrend  = months.map((_, i) => branches.reduce((s, b) => s + originalData.branches[b][yoyFrom + i], 0));
                yoySales  = yoyTrend.reduce((s, v) => s + v, 0);
            }

            // % changes — YoY preferred, fallback to same-length previous period
            const prevFrom = fromIdx - months.length, prevTo = fromIdx - 1;
            let prevPeriodSales = 0, prevAvg = null;
            if (prevFrom >= 0 && prevTo >= 0) {
                const prevTotal = branches.reduce((s, b) =>
                    s + originalData.branches[b].slice(prevFrom, prevTo + 1).reduce((a, v) => a + v, 0), 0);
                prevPeriodSales = prevTotal;
                prevAvg = prevTotal / months.length;
            }

            let totalChangePct = null, totalChangeLabel = '';
            if (yoySales > 0) {
                totalChangePct  = (totalSales - yoySales) / yoySales * 100;
                totalChangeLabel = 'เทียบปีก่อน';
            } else if (prevPeriodSales > 0) {
                totalChangePct  = (totalSales - prevPeriodSales) / prevPeriodSales * 100;
                totalChangeLabel = 'เทียบช่วงก่อน';
            }

            let avgChangePct = null, avgChangeLabel = '';
            if (prevAvg) {
                avgChangePct  = (avgMonthly - prevAvg) / prevAvg * 100;
                avgChangeLabel = 'เทียบช่วงก่อน';
            } else if (yoySales > 0) {
                const yoyAvg = yoySales / months.length;
                avgChangePct  = (avgMonthly - yoyAvg) / yoyAvg * 100;
                avgChangeLabel = 'เทียบปีก่อน';
            }

            // Forecast (YoY seasonal ratio) — single next month
            let predicted = null;
            if (months.length >= 2) predicted = predictNextYoY(totalTrend, fromIdx, branches);
            const forecastChangePct = (predicted !== null && totalTrend.length > 0)
                ? ((predicted - totalTrend[totalTrend.length - 1]) / totalTrend[totalTrend.length - 1] * 100)
                : null;

            // ── Update KPI values ──
            document.getElementById('total-sales-val').textContent  = formatCurrencyShort(totalSales);
            document.getElementById('avg-monthly-val').textContent  = formatCurrencyShort(avgMonthly);

            setChangeEl('total-sales-change', totalChangePct,  totalChangeLabel);
            setChangeEl('avg-monthly-change', avgChangePct,    avgChangeLabel);

            const bestEl    = document.getElementById('best-branch-val');
            const labelEl   = bestEl.closest('.kpi-card').querySelector('.kpi-label');
            const bestChgEl = document.getElementById('best-branch-change');
            if (selBranch !== 'all') {
                bestEl.textContent    = branchNamesTh[selBranch];
                labelEl.textContent   = 'สาขาที่เลือก';
                bestChgEl.textContent = '';
            } else {
                bestEl.textContent  = branchNamesTh[bestKey];
                labelEl.textContent = 'สาขาที่ขายดีที่สุด';
                const share = totalSales > 0 ? (bTotals[bestKey] / totalSales * 100).toFixed(1) + '%' : '';
                bestChgEl.textContent = share ? `สัดส่วน ${share}` : '';
                bestChgEl.className   = 'kpi-change change-neutral';
            }

            const fcCard = document.getElementById('forecast-card');
            if (predicted !== null && months.length >= 2) {
                document.getElementById('forecast-val').textContent = formatCurrencyShort(predicted);
                fcCard.style.display = '';
                setChangeEl('forecast-change', forecastChangePct, 'เทียบเดือนล่าสุด');
            } else {
                document.getElementById('forecast-val').textContent = '—';
                fcCard.style.display = isSingleMonth ? 'none' : '';
                document.getElementById('forecast-change').textContent = '';
            }

            renderRanking(branches, bTotals, totalSales, yoyTrend, yoyFrom);
            renderCharts(months, branchData, branches, bTotals, totalTrend, predicted, yoyTrend, yoyFrom);
            updateForecastSection(branches);
        };

        // ─── Ranking Table ───
        const renderRanking = (branches, bTotals, totalSales, yoyTrend, yoyFrom) => {
            const tbody = document.getElementById('ranking-tbody');
            if (!tbody) return;

            const rankingSection = document.querySelector('.ranking-section');
            if (branches.length <= 1) { rankingSection.style.display = 'none'; return; }
            rankingSection.style.display = '';

            const sorted = [...branches].sort((a, b) => bTotals[b] - bTotals[a]);

            tbody.innerHTML = sorted.map((b, i) => {
                const rank      = i + 1;
                const total     = bTotals[b];
                const share     = totalSales > 0 ? (total / totalSales * 100) : 0;
                const cfg       = datasetConfigs[b];

                // YoY for this branch
                let yoyPct = null;
                if (yoyTrend && yoyFrom >= 0) {
                    const yoyBranchTotal = originalData.branches[b]
                        .slice(yoyFrom, yoyFrom + yoyTrend.length)
                        .reduce((s, v) => s + v, 0);
                    if (yoyBranchTotal > 0) yoyPct = ((total - yoyBranchTotal) / yoyBranchTotal * 100);
                }

                const rankClass = rank <= 3 ? `rank-${rank}` : '';
                const yoyHtml   = yoyPct !== null
                    ? `<span class="kpi-change ${yoyPct >= 0 ? 'change-up' : 'change-down'}" style="font-size:0.72rem;padding:0.15rem 0.45rem">
                            ${yoyPct >= 0 ? '↑' : '↓'} ${yoyPct >= 0 ? '+' : ''}${yoyPct.toFixed(1)}%
                        </span>`
                    : '<span style="color:var(--text-muted);font-size:0.78rem">—</span>';

                return `<tr>
                    <td class="rank-num ${rankClass}">${rank}</td>
                    <td><div class="branch-cell"><span class="branch-dot" style="background:${cfg.color}"></span>${cfg.label}</div></td>
                    <td class="text-right">${formatCurrencyShort(total)}</td>
                    <td class="text-right">
                        <div class="share-bar-wrap">
                            <div class="share-bar"><div class="share-bar-fill" style="width:${share.toFixed(1)}%;background:${cfg.color}"></div></div>
                            <span>${share.toFixed(1)}%</span>
                        </div>
                    </td>
                    <td class="text-right">${yoyHtml}</td>
                </tr>`;
            }).join('');
        };

        // ─── Render Charts ───
        const renderCharts = (months, bData, actives, bTotals, totalTrend, predicted, yoyTrend, yoyFrom) => {
            if (trendChart)    trendChart.destroy();
            if (barChart)      barChart.destroy();
            if (doughnutChart) doughnutChart.destroy();

            const isSingleMonth = months.length === 1;

            // ── 1. Trend Chart ──
            const ctxT = document.getElementById('trendChart').getContext('2d');
            const grad = ctxT.createLinearGradient(0, 0, 0, 380);
            grad.addColorStop(0, 'rgba(96, 165, 250, 0.25)');
            grad.addColorStop(1, 'rgba(96, 165, 250, 0.0)');

            let tLabels  = [...months];
            let tActual  = [...totalTrend];
            let tForecast = new Array(totalTrend.length).fill(null);

            if (predicted !== null && !isSingleMonth) {
                tLabels.push('คาดการณ์');
                tActual.push(null);
                tForecast[totalTrend.length - 1] = totalTrend[totalTrend.length - 1];
                tForecast.push(predicted);
            }

            const trendDatasets = isSingleMonth ? [
                {
                    label: 'ยอดขายจริง',
                    data: tActual,
                    backgroundColor: 'rgba(96, 165, 250, 0.6)',
                    hoverBackgroundColor: '#60a5fa',
                    borderRadius: 6,
                    maxBarThickness: 64
                }
            ] : [
                {
                    label: 'ยอดขายจริง',
                    data: tActual,
                    borderColor: '#60a5fa',
                    backgroundColor: grad,
                    borderWidth: 3,
                    pointBackgroundColor: '#60a5fa',
                    pointBorderColor: colors.bgBase,
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'คาดการณ์',
                    data: tForecast,
                    borderColor: colors.forecast,
                    borderWidth: 2.5,
                    borderDash: [6, 4],
                    pointBackgroundColor: colors.forecast,
                    pointBorderColor: colors.bgBase,
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    fill: false,
                    tension: 0,
                    spanGaps: true
                }
            ];

            // YoY comparison line (dashed grey) — only for multi-month views
            if (!isSingleMonth && yoyTrend && yoyTrend.length === months.length) {
                trendDatasets.push({
                    label: 'ปีก่อนหน้า',
                    data: yoyTrend,
                    borderColor: colors.yoy,
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: false,
                    tension: 0.4
                });
            }

            trendChart = new Chart(ctxT, {
                type: isSingleMonth ? 'bar' : 'line',
                data: { labels: tLabels, datasets: trendDatasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: 0 },
                    plugins: {
                        ...getCommonPlugins(),
                        legend: { display: !isSingleMonth, labels: { ...getCommonPlugins().legend.labels } }
                    },
                    scales: {
                        y: {
                            min: 0,
                            max: isSingleMonth ? undefined : 5000000,
                            grid: { color: colors.gridColor, drawBorder: false, borderDash: [4, 4] },
                            border: { display: false },
                            ticks: {
                                font: { size: 12, weight: 500 },
                                color: colors.textSecondary,
                                padding: 12,
                                stepSize: isSingleMonth ? undefined : 1000000,
                                maxTicksLimit: 6,
                                autoSkip: false,
                                callback: (v) => '฿' + (v / 1000000) + 'M'
                            }
                        },
                        x: getCommonScales().x
                    },
                    interaction: { mode: 'index', intersect: false }
                }
            });

            // ── 2. Branch Comparison Chart ──
            const ctxB = document.getElementById('barChart').getContext('2d');
            const isSingleBranch = actives.length === 1;

            barChart = new Chart(ctxB, {
                type: isSingleMonth ? 'bar' : 'line',
                data: {
                    labels: isSingleMonth ? actives.map(b => datasetConfigs[b].label) : months,
                    datasets: isSingleMonth ? [{
                        label: 'ยอดขายรายสาขา',
                        data: actives.map(b => bData[b][0]),
                        backgroundColor: actives.map(b => datasetConfigs[b].color + 'aa'),
                        hoverBackgroundColor: actives.map(b => datasetConfigs[b].color),
                        borderRadius: 6,
                        maxBarThickness: 64
                    }] : actives.map(b => ({
                        label: datasetConfigs[b].label,
                        data: bData[b],
                        borderColor: datasetConfigs[b].color,
                        backgroundColor: datasetConfigs[b].color + '18',
                        borderWidth: 2.5,
                        pointRadius: 4,
                        pointBackgroundColor: datasetConfigs[b].color,
                        pointBorderColor: colors.bgBase,
                        pointBorderWidth: 2,
                        tension: 0.4,
                        fill: false
                    }))
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: 0 },
                    plugins: {
                        ...getCommonPlugins(),
                        legend: { display: !isSingleBranch && !isSingleMonth, labels: { ...getCommonPlugins().legend.labels } },
                        title: isSingleBranch && !isSingleMonth ? {
                            display: true,
                            text: 'เลือก "ทุกสาขา" เพื่อเปรียบเทียบ',
                            color: colors.textSecondary,
                            font: { size: 12, weight: 400 },
                            padding: { top: 10, bottom: 10 }
                        } : {}
                    },
                    scales: getCommonScales(),
                    interaction: { mode: 'index', intersect: false }
                }
            });

            // ── 3. Doughnut Chart ──
            const ctxD = document.getElementById('doughnutChart').getContext('2d');
            const dL = actives.map(b => datasetConfigs[b].label);
            const dV = actives.map(b => bTotals[b]);
            const dC = actives.map(b => datasetConfigs[b].color);
            const dTotal = dV.reduce((a, b) => a + b, 0);

            const doughnutContainer = document.getElementById('doughnutChart').closest('.bento-card');
            doughnutContainer.style.display = actives.length === 1 ? 'none' : '';

            doughnutChart = new Chart(ctxD, {
                type: 'doughnut',
                data: {
                    labels: dL,
                    datasets: [{ data: dV, backgroundColor: dC, borderColor: colors.bgBase, borderWidth: 3, hoverOffset: 8 }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '72%',
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: { color: colors.textPrimary, padding: 18, usePointStyle: true, pointStyleWidth: 10, font: { size: 13, weight: 500 } }
                        },
                        tooltip: {
                            ...getCommonPlugins().tooltip,
                            callbacks: {
                                label: function(ctx) {
                                    const v   = ctx.parsed;
                                    const pct = dTotal > 0 ? ((v / dTotal) * 100).toFixed(1) + '%' : '0%';
                                    return ` ${formatCurrency(v)}  (${pct})`;
                                }
                            }
                        }
                    }
                }
            });
        };

        // ══════════════════════════════════════════════════════
        // FORECAST SECTION — Render
        // ══════════════════════════════════════════════════════

        const updateForecastSection = (branches) => {
            const method = forecastMethodEl.value;
            const horizonRaw = forecastHorizonEl.value;
            const horizonMonths = horizonRaw === 'max' ? monthsUntilEnd2570() : parseInt(horizonRaw);

            const forecast = generateForecast(method, horizonMonths, branches);

            // ── Summary KPIs ──
            const totalForecast = forecast.totalForecasts.reduce((s, v) => s + v, 0);
            document.getElementById('fc-total-val').textContent = formatCurrencyShort(totalForecast);

            // Compare with same-length recent actual period
            const recentActualTotal = originalData.total_monthly.slice(-horizonMonths).reduce((s, v) => s + v, 0);
            if (recentActualTotal > 0) {
                const changePct = ((totalForecast - recentActualTotal) / recentActualTotal * 100);
                setChangeEl('fc-total-change', changePct, 'เทียบช่วงล่าสุด');
            } else {
                document.getElementById('fc-total-change').textContent = '';
            }

            // Peak month
            let peakIdx = 0;
            for (let i = 1; i < forecast.totalForecasts.length; i++) {
                if (forecast.totalForecasts[i] > forecast.totalForecasts[peakIdx]) peakIdx = i;
            }
            document.getElementById('fc-peak-val').textContent = forecast.labels[peakIdx] || '—';
            const peakEl = document.getElementById('fc-peak-change');
            peakEl.textContent = formatCurrencyShort(forecast.totalForecasts[peakIdx]);
            peakEl.className = 'kpi-change change-neutral';

            // Average MoM growth
            let momGrowthSum = 0, momCount = 0;
            // Include transition from last actual to first forecast
            const lastActual = originalData.total_monthly[originalData.total_monthly.length - 1];
            if (lastActual > 0 && forecast.totalForecasts.length > 0) {
                momGrowthSum += (forecast.totalForecasts[0] - lastActual) / lastActual * 100;
                momCount++;
            }
            for (let i = 1; i < forecast.totalForecasts.length; i++) {
                if (forecast.totalForecasts[i - 1] > 0) {
                    momGrowthSum += (forecast.totalForecasts[i] - forecast.totalForecasts[i - 1]) / forecast.totalForecasts[i - 1] * 100;
                    momCount++;
                }
            }
            const avgMoM = momCount > 0 ? momGrowthSum / momCount : 0;
            const growthEl = document.getElementById('fc-growth-val');
            growthEl.textContent = `${avgMoM >= 0 ? '+' : ''}${avgMoM.toFixed(1)}%`;
            const growthChangeEl = document.getElementById('fc-growth-change');
            growthChangeEl.textContent = avgMoM >= 0 ? 'แนวโน้มเติบโต' : 'แนวโน้มลดลง';
            growthChangeEl.className = 'kpi-change ' + (avgMoM >= 0 ? 'change-up' : 'change-down');

            // ── Render Forecast Chart ──
            renderForecastChart(forecast, branches);

            // ── Render Forecast Table ──
            renderForecastTable(forecast, branches);
        };

        const renderForecastChart = (forecast, branches) => {
            if (forecastChartInstance) forecastChartInstance.destroy();

            const ctx = document.getElementById('forecastChart').getContext('2d');

            // Combine last 6 actual months + forecast
            const actualCount = Math.min(6, originalData.months.length);
            const actualMonths = originalData.months.slice(-actualCount);
            const actualTotals = [];
            for (let i = originalData.months.length - actualCount; i < originalData.months.length; i++) {
                actualTotals.push(branches.reduce((s, b) => s + (originalData.branches[b]?.[i] ?? 0), 0));
            }

            const allLabels = [...actualMonths, ...forecast.labels];
            const actualLine = [...actualTotals, ...new Array(forecast.labels.length).fill(null)];

            // Forecast line: starts from last actual point for continuity
            const forecastLine = new Array(actualCount - 1).fill(null);
            forecastLine.push(actualTotals[actualTotals.length - 1]); // bridge point
            forecastLine.push(...forecast.totalForecasts);

            // Confidence band
            const upperBand = new Array(actualCount - 1).fill(null);
            upperBand.push(actualTotals[actualTotals.length - 1]);
            upperBand.push(...forecast.confidenceBand.upper);

            const lowerBand = new Array(actualCount - 1).fill(null);
            lowerBand.push(actualTotals[actualTotals.length - 1]);
            lowerBand.push(...forecast.confidenceBand.lower);

            // Gradients
            const gradActual = ctx.createLinearGradient(0, 0, 0, 420);
            gradActual.addColorStop(0, 'rgba(96, 165, 250, 0.2)');
            gradActual.addColorStop(1, 'rgba(96, 165, 250, 0.0)');

            const gradForecast = ctx.createLinearGradient(0, 0, 0, 420);
            gradForecast.addColorStop(0, 'rgba(251, 191, 36, 0.15)');
            gradForecast.addColorStop(1, 'rgba(251, 191, 36, 0.0)');

            const gradConfidence = ctx.createLinearGradient(0, 0, 0, 420);
            gradConfidence.addColorStop(0, 'rgba(251, 191, 36, 0.08)');
            gradConfidence.addColorStop(1, 'rgba(251, 191, 36, 0.01)');

            // Annotation line: divider between actual and forecast
            const annotationIdx = actualCount - 1;

            forecastChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: allLabels,
                    datasets: [
                        {
                            label: 'ยอดขายจริง',
                            data: actualLine,
                            borderColor: '#60a5fa',
                            backgroundColor: gradActual,
                            borderWidth: 3,
                            pointBackgroundColor: '#60a5fa',
                            pointBorderColor: colors.bgBase,
                            pointBorderWidth: 2,
                            pointRadius: 5,
                            pointHoverRadius: 7,
                            fill: true,
                            tension: 0.4,
                            order: 2
                        },
                        {
                            label: 'คาดการณ์',
                            data: forecastLine,
                            borderColor: colors.forecast,
                            backgroundColor: gradForecast,
                            borderWidth: 3,
                            borderDash: [8, 5],
                            pointBackgroundColor: colors.forecast,
                            pointBorderColor: colors.bgBase,
                            pointBorderWidth: 2,
                            pointRadius: 5,
                            pointHoverRadius: 7,
                            fill: true,
                            tension: 0.4,
                            spanGaps: true,
                            order: 3
                        },
                        {
                            label: 'ช่วงความเชื่อมั่น (บน)',
                            data: upperBand,
                            borderColor: 'rgba(251, 191, 36, 0.25)',
                            borderWidth: 1,
                            borderDash: [3, 3],
                            pointRadius: 0,
                            fill: false,
                            tension: 0.4,
                            spanGaps: true,
                            order: 1
                        },
                        {
                            label: 'ช่วงความเชื่อมั่น (ล่าง)',
                            data: lowerBand,
                            borderColor: 'rgba(251, 191, 36, 0.25)',
                            borderWidth: 1,
                            borderDash: [3, 3],
                            pointRadius: 0,
                            fill: '-1',
                            backgroundColor: gradConfidence,
                            tension: 0.4,
                            spanGaps: true,
                            order: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: 0 },
                    plugins: {
                        legend: {
                            labels: {
                                ...getCommonPlugins().legend.labels,
                                filter: (item) => !item.text.includes('ช่วงความเชื่อมั่น')
                            }
                        },
                        tooltip: {
                            ...getCommonPlugins().tooltip,
                            callbacks: {
                                label: function(ctx) {
                                    if (ctx.dataset.label.includes('ช่วงความเชื่อมั่น')) return null;
                                    let l = ctx.dataset.label || '';
                                    if (l) l += ': ';
                                    if (ctx.parsed.y !== null) l += formatCurrency(ctx.parsed.y);
                                    return l;
                                }
                            }
                        },
                        annotation: {
                            annotations: {
                                forecastDivider: {
                                    type: 'line',
                                    xMin: annotationIdx,
                                    xMax: annotationIdx,
                                    borderColor: 'rgba(251, 191, 36, 0.5)',
                                    borderWidth: 2,
                                    borderDash: [6, 4],
                                    label: {
                                        display: true,
                                        content: '▸ เริ่มคาดการณ์',
                                        position: 'start',
                                        backgroundColor: 'rgba(251, 191, 36, 0.12)',
                                        color: colors.forecast,
                                        font: { size: 11, weight: 600 },
                                        padding: { x: 8, y: 4 },
                                        borderRadius: 6
                                    }
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            ...getCommonScales().y,
                            beginAtZero: false,
                            grace: '10%'
                        },
                        x: {
                            ...getCommonScales().x,
                            ticks: {
                                ...getCommonScales().x.ticks,
                                maxTicksLimit: 18
                            }
                        }
                    },
                    interaction: { mode: 'index', intersect: false }
                }
            });
        };

        const renderForecastTable = (forecast, branches) => {
            const tbody = document.getElementById('forecast-tbody');
            if (!tbody) return;

            const selBranch = branchFilter.value;
            const branchKeys = selBranch === 'all' ? Object.keys(originalData.branches) : [selBranch];

            // Last 3 actual months for context
            const actualCount = Math.min(3, originalData.months.length);
            const rows = [];

            // Actual rows
            for (let i = originalData.months.length - actualCount; i < originalData.months.length; i++) {
                const branchVals = {};
                for (const b of branchKeys) {
                    branchVals[b] = originalData.branches[b][i] || 0;
                }
                const total = branchKeys.reduce((s, b) => s + branchVals[b], 0);
                rows.push({ label: originalData.months[i], isActual: true, branchVals, total });
            }

            // Forecast rows
            for (let i = 0; i < forecast.labels.length; i++) {
                const branchVals = {};
                for (const b of branchKeys) {
                    branchVals[b] = forecast.branchForecasts[b]?.[i] || 0;
                }
                const total = branchKeys.reduce((s, b) => s + branchVals[b], 0);
                rows.push({ label: forecast.labels[i], isActual: false, branchVals, total });
            }

            // Calculate MoM %
            for (let i = 1; i < rows.length; i++) {
                if (rows[i - 1].total > 0) {
                    rows[i].mom = ((rows[i].total - rows[i - 1].total) / rows[i - 1].total * 100);
                }
            }

            // Build table header based on selected branches
            const thead = document.querySelector('#forecastTable thead tr');
            if (selBranch === 'all') {
                thead.innerHTML = `
                    <th>เดือน</th>
                    <th class="text-right">อารีย์</th>
                    <th class="text-right">เอกมัย</th>
                    <th class="text-right">พระราม 9</th>
                    <th class="text-right">บางแค</th>
                    <th class="text-right fc-col-total">ยอดรวม</th>
                    <th class="text-right">%MoM</th>
                `;
            } else {
                thead.innerHTML = `
                    <th>เดือน</th>
                    <th class="text-right">${branchNamesTh[selBranch]}</th>
                    <th class="text-right fc-col-total">ยอดรวม</th>
                    <th class="text-right">%MoM</th>
                `;
            }

            tbody.innerHTML = rows.map(row => {
                const tag = row.isActual
                    ? '<span class="fc-label-tag fc-tag-actual">จริง</span>'
                    : '<span class="fc-label-tag fc-tag-forecast">คาดการณ์</span>';

                const momHtml = row.mom != null
                    ? `<span class="kpi-change ${row.mom >= 0 ? 'change-up' : 'change-down'}" style="font-size:0.72rem;padding:0.15rem 0.45rem">
                        ${row.mom >= 0 ? '↑' : '↓'} ${row.mom >= 0 ? '+' : ''}${row.mom.toFixed(1)}%
                       </span>`
                    : '<span style="color:var(--text-muted)">—</span>';

                const branchCells = selBranch === 'all'
                    ? ['Ari', 'Ekkamai', 'Rama9', 'BangKhae'].map(b =>
                        `<td class="text-right">${formatCurrencyShort(row.branchVals[b] || 0)}</td>`
                    ).join('')
                    : `<td class="text-right">${formatCurrencyShort(row.branchVals[selBranch] || 0)}</td>`;

                return `<tr class="${row.isActual ? '' : 'fc-row-forecast'}">
                    <td>${row.label} ${tag}</td>
                    ${branchCells}
                    <td class="text-right" style="font-weight:600;color:var(--accent-amber)">${formatCurrencyShort(row.total)}</td>
                    <td class="text-right">${momHtml}</td>
                </tr>`;
            }).join('');
        };

        // ── Sync toFilter so it can't go before fromFilter ──
        fromFilter.addEventListener('change', () => {
            if (parseInt(toFilter.value) < parseInt(fromFilter.value))
                toFilter.value = fromFilter.value;
            clearActivePreset();
            updateDashboard();
        });
        toFilter.addEventListener('change', () => {
            if (parseInt(fromFilter.value) > parseInt(toFilter.value))
                fromFilter.value = toFilter.value;
            clearActivePreset();
            updateDashboard();
        });
        branchFilter.addEventListener('change', updateDashboard);

        // ── Forecast Controls ──
        forecastHorizonEl.addEventListener('change', () => {
            const branches = branchFilter.value === 'all' ? Object.keys(originalData.branches) : [branchFilter.value];
            updateForecastSection(branches);
        });
        forecastMethodEl.addEventListener('change', () => {
            const branches = branchFilter.value === 'all' ? Object.keys(originalData.branches) : [branchFilter.value];
            updateForecastSection(branches);
        });

        // ── Preset Shortcuts ──
        const clearActivePreset = () =>
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));

        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                clearActivePreset();
                btn.classList.add('active');
                fromFilter.value = btn.dataset.from;
                toFilter.value   = btn.dataset.to;
                updateDashboard();
            });
        });

        // ── Theme Toggle (Light / Dark) ──
        const themeToggle = document.getElementById('themeToggle');
        const themeLabelEl = themeToggle?.querySelector('.theme-label');
        if (themeToggle) {
            // Sync initial button state
            if (isLightMode) {
                themeToggle.classList.add('active');
                if (themeLabelEl) themeLabelEl.textContent = 'Dark';
            }

            themeToggle.addEventListener('click', () => {
                isLightMode = !isLightMode;
                localStorage.setItem('dashboard-theme', isLightMode ? 'light' : 'dark');
                document.body.classList.toggle('light-mode', isLightMode);
                themeToggle.classList.toggle('active', isLightMode);

                // Update button label
                if (themeLabelEl) themeLabelEl.textContent = isLightMode ? 'Dark' : 'Light';

                // Swap color palette
                Object.assign(colors, isLightMode ? colorsLight : colorsDark);
                datasetConfigs = getDatasetConfigs();

                // Update Chart.js global defaults
                Chart.defaults.color = colors.textSecondary;

                // Re-render everything
                updateDashboard();
            });
        }

        updateDashboard();

    } catch (err) {
        console.error('Dashboard error:', err);
    }
});
