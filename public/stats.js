let session;

(async () => {
  session = await requireLogin();
  if (!session) return;

  document.getElementById('userEmail').textContent = session.user.email;
  if (session.user.user_metadata?.is_admin) {
    document.getElementById('adminLink').style.display = 'inline';
  }

  await loadStats();
})();

async function loadStats() {
  const res = await fetch('/api/stats', { headers: authHeaders(session) });
  if (!res.ok) { document.getElementById('loading').textContent = 'Erreur de chargement.'; return; }
  const data = await res.json();

  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'block';

  // KPIs
  document.getElementById('kpiTotal').textContent = data.total;
  document.getElementById('kpiToday').textContent = data.today;
  document.getElementById('kpiWeek').textContent  = data.week;
  document.getElementById('kpiMonth').textContent = data.month;

  // Graphique 30j
  renderChart(data.byDay);

  // Par template
  renderBars('byTemplate', data.byTemplate);

  // Par utilisateur (admin seulement)
  if (data.isAdmin && Object.keys(data.byUser).length > 0) {
    document.getElementById('byUserSection').style.display = 'block';
    renderBars('byUser', data.byUser);
  } else {
    // En mode non-admin, passe la colonne en pleine largeur
    document.getElementById('bottomGrid').style.gridTemplateColumns = '1fr';
  }

  // Derniers envois
  renderRecent(data.recent, data.isAdmin);
}

function renderChart(byDay) {
  const area = document.getElementById('chartArea');
  area.innerHTML = '';
  if (Object.keys(byDay).length === 0) {
    area.innerHTML = '<p class="empty">Aucun envoi ces 30 derniers jours</p>';
    return;
  }

  // Générer les 30 derniers jours
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const maxVal = Math.max(...days.map(d => byDay[d] || 0), 1);

  days.forEach((day, i) => {
    const count = byDay[day] || 0;
    const pct = (count / maxVal) * 100;
    const col = document.createElement('div');
    col.className = 'chart-col';
    col.title = `${day} : ${count} email${count > 1 ? 's' : ''}`;

    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    bar.style.height = `${Math.max(pct, count > 0 ? 4 : 0)}%`;

    const label = document.createElement('div');
    label.className = 'chart-day';
    // Affiche le jour du mois tous les 5 jours
    label.textContent = (i % 5 === 0 || i === 29) ? day.slice(8) : '';

    col.appendChild(bar);
    col.appendChild(label);
    area.appendChild(col);
  });
}

function renderBars(containerId, obj) {
  const el = document.getElementById(containerId);
  const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) { el.innerHTML = '<p class="empty">Aucune donnée</p>'; return; }
  const max = entries[0][1];
  el.innerHTML = entries.map(([label, count]) => `
    <div class="bar-row">
      <div class="bar-label" title="${label}">${label}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(count / max) * 100}%"></div>
      </div>
      <div class="bar-count">${count}</div>
    </div>
  `).join('');
}

function renderRecent(recent, isAdmin) {
  const el = document.getElementById('recentTable');
  if (recent.length === 0) { el.innerHTML = '<p class="empty">Aucun envoi pour le moment</p>'; return; }

  const adminCol = isAdmin ? '<th>Commercial</th>' : '';
  const rows = recent.map(r => {
    const date = new Date(r.sent_at);
    const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const adminCell = isAdmin ? `<td style="color:#818cf8">${r.user_email || '—'}</td>` : '';
    return `<tr>
      ${adminCell}
      <td>${r.recipient_email}</td>
      <td><span class="tag">${r.template_name || '—'}</span></td>
      <td style="color:#555">${dateStr} ${timeStr}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `<table class="recent-table">
    <thead><tr>${adminCol}<th>Destinataire</th><th>Template</th><th>Date</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}
