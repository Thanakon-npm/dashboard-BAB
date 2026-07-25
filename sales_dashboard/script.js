document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('data.json');
        const originalData = await response.json();

        const colors = {
            ari: '#f472b6',
            ekkamai: '#a78bfa',
            rama9: '#4ade80',
            bangkhae: '#fbbf24',
            textPrimary: '#fafafa',
            textSecondary: '#a1a1aa',
            forecast: '#fbbf24',
            yoy: 'rgba(161, 161, 170, 0.45)'
        };

        const branchNamesTh = { Ari: 'อารีย์', Ekkamai: 'เอกมัย', Rama9: 'พระราม 9', BangKhae: 'บางแค' };
        const datasetConfigs = {
            Ari:      { label: 'อารีย์',   color: colors.ari },
            Ekkamai:  { label: 'เอกมัย',   color: colors.ekkamai },
            Rama9:    { label: 'พระราม 9', color: colors.rama9 },
            BangKhae: { label: 'บางแค',    color: colors.bangkhae }
        };

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

        // Forecast: seasonal ratio method (YoY) — more accurate than linear regression for seasonal data
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

        const commonScales = {
            y: {
                beginAtZero: false,
                grace: '5%',
                grid: { color: 'rgba(255, 255, 255, 0.08)', drawBorder: false, borderDash: [4, 4] },
                border: { display: false },
                ticks: {
                    font: { size: 12, weight: 500 },
                    color: '#a1a1aa',
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
                ticks: { font: { size: 11, weight: 500 }, color: '#a1a1aa', padding: 8, maxRotation: 45, minRotation: 30, autoSkip: true, maxTicksLimit: 12 }
            }
        };

        const commonPlugins = {
            legend: {
                labels: { color: colors.textPrimary, padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { size: 12, weight: 500 } }
            },
            tooltip: {
                backgroundColor: 'rgba(24, 24, 27, 0.95)',
                titleColor: colors.textPrimary,
                bodyColor: colors.textSecondary,
                borderColor: 'rgba(255,255,255,0.08)',
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
        };

        // DOM
        const branchFilter = document.getElementById('branchFilter');
        const fromFilter   = document.getElementById('fromFilter');
        const toFilter     = document.getElementById('toFilter');
        let trendChart, barChart, doughnutChart;

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

            // Forecast (YoY seasonal ratio)
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
                    pointBorderColor: '#09090b',
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
                    pointBorderColor: '#09090b',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    fill: false,
                    tension: 0,
                    spanGaps: true
                }
            ];

            // YoY comparison line (dashed grey) — only for multi-month views
            if (!isSingleMonth && yoyTrend && yoyTrend.length === months.length) {
                const yoyLabels = originalData.months.slice(yoyFrom, yoyFrom + months.length)
                    .map(m => m.replace('/2568', '').replace('/2569', ''));
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
                        ...commonPlugins,
                        legend: { display: !isSingleMonth, labels: { ...commonPlugins.legend.labels } }
                    },
                    scales: {
                        y: {
                            min: 0,
                            max: isSingleMonth ? undefined : 5000000,
                            grid: { color: 'rgba(255, 255, 255, 0.08)', drawBorder: false, borderDash: [4, 4] },
                            border: { display: false },
                            ticks: {
                                font: { size: 12, weight: 500 },
                                color: '#a1a1aa',
                                padding: 12,
                                stepSize: isSingleMonth ? undefined : 1000000,
                                maxTicksLimit: 6,
                                autoSkip: false,
                                callback: (v) => '฿' + (v / 1000000) + 'M'
                            }
                        },
                        x: commonScales.x
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
                        pointBorderColor: '#09090b',
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
                        ...commonPlugins,
                        legend: { display: !isSingleBranch && !isSingleMonth, labels: { ...commonPlugins.legend.labels } },
                        title: isSingleBranch && !isSingleMonth ? {
                            display: true,
                            text: 'เลือก "ทุกสาขา" เพื่อเปรียบเทียบ',
                            color: colors.textSecondary,
                            font: { size: 12, weight: 400 },
                            padding: { top: 10, bottom: 10 }
                        } : {}
                    },
                    scales: commonScales,
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
                    datasets: [{ data: dV, backgroundColor: dC, borderColor: '#09090b', borderWidth: 3, hoverOffset: 8 }]
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
                            ...commonPlugins.tooltip,
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

        updateDashboard();

    } catch (err) {
        console.error('Dashboard error:', err);
    }
});
