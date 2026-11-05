/* Deterministic mock data for the Stackly consultant workspace. */
(function () {
  'use strict';

  const META = Object.freeze({
    now: '2026-11-04T16:20:00',
    today: '2026-11-04',
    stages: Object.freeze(['Discovery', 'Strategy', 'Delivery', 'Review', 'Renewal']),
    months: Object.freeze(['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'])
  });

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function dateISO(offsetDays) {
    const date = new Date('2026-11-04T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date.toISOString().slice(0, 10);
  }

  function addDays(iso, offsetDays) {
    const date = new Date(iso + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date.toISOString().slice(0, 10);
  }

  function minutesAgo(minutes) {
    return new Date(Date.parse(META.now) - minutes * 60000).toISOString();
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function healthBand(health) {
    if (health >= 80) return 'healthy';
    if (health >= 60) return 'watch';
    if (health >= 40) return 'at-risk';
    return 'churned';
  }

  function makeTrend(end, seed) {
    const points = [];
    for (let index = 0; index < 8; index += 1) {
      const ratio = 0.78 + (index / 7) * 0.22;
      const wobble = Math.sin(index * 1.1 + seed) * 2.2;
      points.push(clamp(Math.round(end * ratio + wobble), 0, 100));
    }
    points[7] = end;
    return points;
  }

  const seasonal = [0.78, 0.8, 0.82, 0.84, 0.86, 0.88, 0.9, 0.92, 0.94, 0.96, 0.98, 1];
  const forecastSeason = [0.8, 0.82, 0.84, 0.86, 0.88, 0.9, 0.92, 0.94, 0.96, 0.98, 1, 1.02];

  function makeMonthly(mrr, seed) {
    return seasonal.map(function (factor, index) {
      if (index === seasonal.length - 1) return mrr;
      const wobble = Math.sin(index * 0.9 + seed) * 0.012;
      return Math.round(mrr * (factor + wobble));
    });
  }

  function makeForecast(mrr, seed) {
    return forecastSeason.map(function (factor, index) {
      if (index === forecastSeason.length - 1) return Math.round(mrr * 1.02);
      const wobble = Math.cos(index * 0.8 + seed) * 0.01;
      return Math.round(mrr * (factor + wobble));
    });
  }

  function makeOverdueTrend(amount, seed) {
    if (!amount) return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    return seasonal.map(function (factor, index) {
      if (index === 11) return amount;
      return Math.round(amount * (0.72 + factor * 0.2 + Math.sin(index + seed) * 0.04));
    });
  }

  const rawClients = [
    {
      id: 'acme',
      name: 'Acme Adventures',
      industry: 'Adventure travel',
      stage: 'Delivery',
      health: 58,
      mrr: 4800,
      nextReview: '2026-11-11',
      owner: 'Priya',
      milestoneOverdue: 1,
      invoices: { paid: 12000, pending: 4000, overdue: 2800 },
      stageSplit: [5, 15, 42, 18, 20],
      touchpoints: [
        { channel: 'Call', summary: 'Recovery plan agreed; operations lead owns the guest-data actions.' },
        { channel: 'Email', summary: 'Shared revised delivery milestones and the overdue invoice note.' },
        { channel: 'Meeting', summary: 'Weekly health review moved to Wednesday mornings.' }
      ]
    },
    {
      id: 'northwind',
      name: 'Northwind Journeys',
      industry: 'Tour operator',
      stage: 'Renewal',
      health: 84,
      mrr: 7200,
      nextReview: '2026-11-20',
      owner: 'Marcus',
      milestoneOverdue: 0,
      invoices: { paid: 24000, pending: 3000, overdue: 0 },
      stageSplit: [0, 10, 20, 20, 50],
      touchpoints: [
        { channel: 'Meeting', summary: 'Renewal workshop scoped to the spring programme.' },
        { channel: 'Email', summary: 'Partner brief approved with two minor copy edits.' },
        { channel: 'Call', summary: 'Finance confirmed the next purchase order window.' }
      ]
    },
    {
      id: 'blue-harbor',
      name: 'Blue Harbor Trips',
      industry: 'Coastal travel',
      stage: 'Delivery',
      health: 74,
      mrr: 3500,
      nextReview: '2026-11-18',
      owner: 'Elena',
      milestoneOverdue: 0,
      invoices: { paid: 9000, pending: 2500, overdue: 1400 },
      stageSplit: [5, 20, 45, 20, 10],
      touchpoints: [
        { channel: 'Email', summary: 'Guest feedback synthesis is two days behind schedule.' },
        { channel: 'Call', summary: 'Agreed a shorter review loop for the harbour operations playbook.' },
        { channel: 'Meeting', summary: 'Seasonal capacity assumptions confirmed with the partner team.' }
      ]
    },
    {
      id: 'meridian',
      name: 'Meridian Trails',
      industry: 'Expedition operator',
      stage: 'Strategy',
      health: 88,
      mrr: 6100,
      nextReview: '2026-11-17',
      owner: 'Priya',
      milestoneOverdue: 0,
      invoices: { paid: 18000, pending: 2000, overdue: 0 },
      stageSplit: [10, 45, 25, 10, 10],
      touchpoints: [
        { channel: 'Workshop', summary: 'Strategy roadmap signed off with the founder group.' },
        { channel: 'Email', summary: 'Executive brief moved into final review.' },
        { channel: 'Call', summary: 'Weekly check-in held; no blockers recorded.' }
      ]
    },
    {
      id: 'trailhead',
      name: 'Trailhead Outdoors',
      industry: 'Outdoor retail',
      stage: 'Delivery',
      health: 68,
      mrr: 2800,
      nextReview: '2026-11-24',
      owner: 'Jonas',
      milestoneOverdue: 0,
      invoices: { paid: 8000, pending: 1500, overdue: 0 },
      stageSplit: [5, 15, 50, 20, 10],
      touchpoints: [
        { channel: 'Call', summary: 'Field operations notes are progressing; safety review remains blocked.' },
        { channel: 'Email', summary: 'Delivery checklist approved by the store operations lead.' },
        { channel: 'Meeting', summary: 'Next review moved to avoid a conflicting trade event.' }
      ]
    },
    {
      id: 'highline',
      name: 'Highline Expeditions',
      industry: 'Adventure tourism',
      stage: 'Review',
      health: 82,
      mrr: 5400,
      nextReview: '2026-11-19',
      owner: 'Aisha',
      milestoneOverdue: 0,
      invoices: { paid: 14000, pending: 2000, overdue: 0 },
      stageSplit: [0, 15, 40, 30, 15],
      touchpoints: [
        { channel: 'Meeting', summary: 'Guest care audit reviewed; one regional action remains.' },
        { channel: 'Email', summary: 'Partner onboarding map approved for the new season.' },
        { channel: 'Call', summary: 'Consultant handover scheduled for the review close.' }
      ]
    },
    {
      id: 'sable',
      name: 'Sable & Pine',
      industry: 'Eco lodges',
      stage: 'Delivery',
      health: 52,
      mrr: 3900,
      nextReview: '2026-11-12',
      owner: 'Marcus',
      milestoneOverdue: 1,
      invoices: { paid: 6000, pending: 3000, overdue: 1800 },
      stageSplit: [10, 25, 35, 20, 10],
      touchpoints: [
        { channel: 'Call', summary: 'Renewal forecast blocked on missing property data.' },
        { channel: 'Email', summary: 'Ops documentation returned with redlines.' },
        { channel: 'Meeting', summary: 'Agreed a two-week recovery window with the founder.' }
      ]
    },
    {
      id: 'foundry',
      name: 'Foundry Travel',
      industry: 'Corporate travel',
      stage: 'Renewal',
      health: 32,
      mrr: 2200,
      nextReview: '2026-11-14',
      owner: 'Elena',
      milestoneOverdue: 0,
      invoices: { paid: 4000, pending: 1000, overdue: 900 },
      stageSplit: [0, 15, 25, 20, 40],
      touchpoints: [
        { channel: 'Email', summary: 'Close-out pack requested before the account is archived.' },
        { channel: 'Call', summary: 'Finance handover reviewed; final invoice remains open.' },
        { channel: 'Meeting', summary: 'Deactivation review held with the client sponsor.' }
      ]
    }
  ];

  const clients = rawClients.map(function (client, index) {
    const actual = makeMonthly(client.mrr, index + 1);
    const forecast = makeForecast(client.mrr, index + 1);
    const overdueTrend = makeOverdueTrend(client.invoices.overdue, index + 1);
    const invoiceTotal = client.invoices.paid + client.invoices.pending + client.invoices.overdue;
    return {
      id: client.id,
      name: client.name,
      industry: client.industry,
      stage: client.stage,
      health: client.health,
      healthBand: healthBand(client.health),
      healthTrend: makeTrend(client.health, index + 1),
      mrr: client.mrr,
      monthlyActual: actual,
      monthlyForecast: forecast,
      overdueTrend: overdueTrend,
      nextReview: client.nextReview,
      owner: client.owner,
      milestoneOverdue: client.milestoneOverdue,
      invoices: {
        paid: client.invoices.paid,
        pending: client.invoices.pending,
        overdue: client.invoices.overdue,
        total: invoiceTotal,
        late: client.invoices.overdue > 0
      },
      stageSplit: client.stageSplit,
      touchpoints: client.touchpoints.map(function (touchpoint, touchIndex) {
        return {
          id: client.id + '-touch-' + (touchIndex + 1),
          channel: touchpoint.channel,
          summary: touchpoint.summary,
          at: minutesAgo((index + 1) * 1300 + touchIndex * 4300)
        };
      })
    };
  });

  const healthCounts = {
    healthy: clients.filter(function (client) { return client.healthBand === 'healthy'; }).length,
    watch: clients.filter(function (client) { return client.healthBand === 'watch'; }).length,
    'at-risk': clients.filter(function (client) { return client.healthBand === 'at-risk'; }).length,
    churned: clients.filter(function (client) { return client.healthBand === 'churned'; }).length
  };

  const mrr = clients.reduce(function (total, client) { return total + client.mrr; }, 0);
  const arr = mrr * 12;
  const healthAverage = Math.round(clients.reduce(function (total, client) { return total + client.health; }, 0) / clients.length);
  const portfolioActual = META.months.map(function (_, monthIndex) {
    return clients.reduce(function (total, client) { return total + client.monthlyActual[monthIndex]; }, 0);
  });
  const portfolioForecast = META.months.map(function (_, monthIndex) {
    return clients.reduce(function (total, client) { return total + client.monthlyForecast[monthIndex]; }, 0);
  });
  const portfolioOverdueTrend = META.months.map(function (_, monthIndex) {
    return clients.reduce(function (total, client) { return total + client.overdueTrend[monthIndex]; }, 0);
  });
  const invoiceTotals = {
    paid: clients.reduce(function (total, client) { return total + client.invoices.paid; }, 0),
    pending: clients.reduce(function (total, client) { return total + client.invoices.pending; }, 0),
    overdue: clients.reduce(function (total, client) { return total + client.invoices.overdue; }, 0)
  };
  invoiceTotals.total = invoiceTotals.paid + invoiceTotals.pending + invoiceTotals.overdue;
  const revenueAtRisk = clients.reduce(function (total, client) {
    return total + ((client.health < 60 || client.invoices.late) ? client.mrr : 0);
  }, 0);

  const attention = clients.filter(function (client) {
    return client.health < 60 || client.milestoneOverdue > 0 || client.invoices.late;
  }).map(function (client) {
    const reasons = [];
    if (client.health < 60) reasons.push('Health ' + client.health);
    if (client.milestoneOverdue > 0) reasons.push(client.milestoneOverdue + ' milestone overdue');
    if (client.invoices.late) reasons.push('Invoice late');
    return { clientId: client.id, reasons: reasons };
  });

  const deliverables = [
    { id: 'd1', clientId: 'acme', name: 'Discovery synthesis', owner: 'Priya', status: 'In progress', progress: 45, due: '2026-10-31', notes: 'Interview themes are complete; the synthesis needs a client-facing readout.', dependencyNote: 'Waits on two stakeholder quotes from the operations lead.' },
    { id: 'd2', clientId: 'acme', name: 'Stakeholder interview pack', owner: 'Elena', status: 'Review', progress: 80, due: '2026-11-06', notes: 'Pack is with the sponsor for a final accuracy pass.', dependencyNote: 'No blocking dependency.' },
    { id: 'd3', clientId: 'acme', name: 'Renewal workshop', owner: 'Priya', status: 'Blocked', progress: 20, due: '2026-11-18', notes: 'Workshop format is agreed, but the client sponsor has not confirmed the date.', dependencyNote: 'Depends on the recovery plan sign-off.' },
    { id: 'd4', clientId: 'northwind', name: 'Route margin review', owner: 'Marcus', status: 'Complete', progress: 100, due: '2026-10-20', completedAt: '2026-10-16', notes: 'Margin review delivered with three route scenarios.', dependencyNote: 'No blocking dependency.' },
    { id: 'd5', clientId: 'northwind', name: 'Partner brief', owner: 'Aisha', status: 'In progress', progress: 70, due: '2026-11-09', notes: 'Two partner profiles need a copy edit before circulation.', dependencyNote: 'Depends on partner photography.' },
    { id: 'd6', clientId: 'northwind', name: 'Renewal pack', owner: 'Marcus', status: 'Complete', progress: 100, due: '2026-11-20', completedAt: '2026-11-01', notes: 'Renewal pack approved and shared with finance.', dependencyNote: 'No blocking dependency.' },
    { id: 'd7', clientId: 'blue-harbor', name: 'Guest feedback synthesis', owner: 'Elena', status: 'In progress', progress: 60, due: '2026-11-05', notes: 'Coding is complete; summary slides remain.', dependencyNote: 'Waits on the latest survey export.' },
    { id: 'd8', clientId: 'blue-harbor', name: 'Harbour operations playbook', owner: 'Lena', status: 'Review', progress: 85, due: '2026-10-29', notes: 'Playbook returned with a short list of operational redlines.', dependencyNote: 'No blocking dependency.' },
    { id: 'd9', clientId: 'blue-harbor', name: 'Discovery map', owner: 'Elena', status: 'Complete', progress: 100, due: '2026-10-25', completedAt: '2026-10-20', notes: 'Discovery map delivered and archived.', dependencyNote: 'No blocking dependency.' },
    { id: 'd10', clientId: 'meridian', name: 'Strategy roadmap', owner: 'Priya', status: 'Complete', progress: 100, due: '2026-10-15', completedAt: '2026-10-12', notes: 'Roadmap signed off by the founder group.', dependencyNote: 'No blocking dependency.' },
    { id: 'd11', clientId: 'meridian', name: 'Workshop materials', owner: 'Noor', status: 'In progress', progress: 55, due: '2026-11-12', notes: 'Materials are drafted for the second working session.', dependencyNote: 'Depends on the route portfolio refresh.' },
    { id: 'd12', clientId: 'meridian', name: 'Executive brief', owner: 'Priya', status: 'Review', progress: 90, due: '2026-11-11', notes: 'Final brief is in client review.', dependencyNote: 'No blocking dependency.' },
    { id: 'd13', clientId: 'trailhead', name: 'Delivery checklist', owner: 'Jonas', status: 'Complete', progress: 100, due: '2026-10-22', completedAt: '2026-10-19', notes: 'Checklist approved by store operations.', dependencyNote: 'No blocking dependency.' },
    { id: 'd14', clientId: 'trailhead', name: 'Field operations notes', owner: 'Theo', status: 'In progress', progress: 40, due: '2026-11-16', notes: 'Notes are being consolidated by region.', dependencyNote: 'No blocking dependency.' },
    { id: 'd15', clientId: 'trailhead', name: 'Safety review', owner: 'Jonas', status: 'Blocked', progress: 30, due: '2026-11-03', notes: 'Safety review is waiting on the insurer response.', dependencyNote: 'Depends on external insurer sign-off.' },
    { id: 'd16', clientId: 'highline', name: 'Partner onboarding map', owner: 'Aisha', status: 'Complete', progress: 100, due: '2026-10-30', completedAt: '2026-10-26', notes: 'Onboarding map approved for the new season.', dependencyNote: 'No blocking dependency.' },
    { id: 'd17', clientId: 'highline', name: 'Regional brief', owner: 'Noor', status: 'In progress', progress: 65, due: '2026-11-13', notes: 'Regional brief is in draft; two partner sections remain.', dependencyNote: 'Depends on partner onboarding map.' },
    { id: 'd18', clientId: 'highline', name: 'Guest care audit', owner: 'Aisha', status: 'Review', progress: 75, due: '2026-11-07', notes: 'Audit findings are ready for client review.', dependencyNote: 'No blocking dependency.' },
    { id: 'd19', clientId: 'sable', name: 'Ops documentation', owner: 'Marcus', status: 'Review', progress: 70, due: '2026-10-28', notes: 'Documentation is back with redlines.', dependencyNote: 'No blocking dependency.' },
    { id: 'd20', clientId: 'sable', name: 'Workbook refresh', owner: 'Noor', status: 'Complete', progress: 100, due: '2026-10-24', completedAt: '2026-10-21', notes: 'Workbook refresh approved by the founder.', dependencyNote: 'No blocking dependency.' },
    { id: 'd21', clientId: 'sable', name: 'Renewal forecast', owner: 'Marcus', status: 'Blocked', progress: 25, due: '2026-11-19', notes: 'Property data is incomplete, so the forecast cannot be finalised.', dependencyNote: 'Depends on the missing property dataset.' },
    { id: 'd22', clientId: 'foundry', name: 'Finance handover', owner: 'Elena', status: 'Complete', progress: 100, due: '2026-09-30', completedAt: '2026-09-25', notes: 'Handover completed with finance.', dependencyNote: 'No blocking dependency.' },
    { id: 'd23', clientId: 'foundry', name: 'Close-out pack', owner: 'Theo', status: 'In progress', progress: 50, due: '2026-11-02', notes: 'Close-out pack is being assembled for archive.', dependencyNote: 'Depends on final invoice confirmation.' },
    { id: 'd24', clientId: 'foundry', name: 'Archive checklist', owner: 'Elena', status: 'Complete', progress: 100, due: '2026-10-10', completedAt: '2026-10-06', notes: 'Archive checklist completed and stored.', dependencyNote: 'No blocking dependency.' }
  ].map(function (deliverable) {
    const client = clients.find(function (candidate) { return candidate.id === deliverable.clientId; });
    return Object.assign({}, deliverable, { clientName: client ? client.name : 'Unknown client' });
  });

  const engagements = [
    { id: 'e1', name: 'Discovery sprint', clientId: 'acme', phase: 'Discovery', progress: 35, due: '2026-11-15', consultant: 'Priya', start: 1, end: 3, status: 'at-risk' },
    { id: 'e2', name: 'Route portfolio refresh', clientId: 'northwind', phase: 'Strategy', progress: 72, due: '2026-11-22', consultant: 'Marcus', start: 1, end: 4, status: 'on-track' },
    { id: 'e3', name: 'Guest journey audit', clientId: 'blue-harbor', phase: 'Discovery', progress: 48, due: '2026-12-05', consultant: 'Elena', start: 2, end: 5, status: 'at-risk' },
    { id: 'e4', name: 'Renewal playbook', clientId: 'meridian', phase: 'Strategy', progress: 90, due: '2026-11-28', consultant: 'Priya', start: 2, end: 4, status: 'on-track' },
    { id: 'e5', name: 'Field ops redesign', clientId: 'trailhead', phase: 'Delivery', progress: 55, due: '2026-12-12', consultant: 'Jonas', start: 3, end: 6, status: 'on-track' },
    { id: 'e6', name: 'Partner onboarding', clientId: 'highline', phase: 'Delivery', progress: 64, due: '2026-12-18', consultant: 'Aisha', start: 4, end: 7, status: 'on-track' },
    { id: 'e7', name: 'Ops documentation', clientId: 'sable', phase: 'Delivery', progress: 28, due: '2026-12-20', consultant: 'Marcus', start: 4, end: 8, status: 'blocked' },
    { id: 'e8', name: 'Finance handover', clientId: 'foundry', phase: 'Review', progress: 15, due: '2027-01-15', consultant: 'Elena', start: 6, end: 8, status: 'at-risk' },
    { id: 'e9', name: 'Fleet planning', clientId: 'acme', phase: 'Strategy', progress: 20, due: '2026-12-30', consultant: 'Priya', start: 5, end: 7, status: 'on-track' },
    { id: 'e10', name: 'Sales enablement', clientId: 'northwind', phase: 'Delivery', progress: 40, due: '2027-01-10', consultant: 'Marcus', start: 6, end: 8, status: 'on-track' }
  ].map(function (engagement) {
    const client = clients.find(function (candidate) { return candidate.id === engagement.clientId; });
    return Object.assign({}, engagement, { clientName: client ? client.name : 'Unknown client' });
  });

  const engagementWindow = Object.freeze({
    labels: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'],
    today: 7.4,
    dependencies: [
      { from: 'e1', to: 'e2' },
      { from: 'e3', to: 'e6' }
    ]
  });

  const utilizationOffsets = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4];
  const weekLabels = [];
  for (let week = 0; week < 20; week += 1) {
    const start = addDays('2026-06-15', week * 7);
    const date = new Date(start + 'T12:00:00Z');
    weekLabels.push(new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date));
  }

  const memberSeed = [
    { id: 'priya', name: 'Priya', role: 'Principal consultant', base: 95, clientIds: ['acme', 'northwind', 'meridian'] },
    { id: 'marcus', name: 'Marcus', role: 'Principal consultant', base: 90, clientIds: ['northwind', 'sable'] },
    { id: 'elena', name: 'Elena', role: 'Senior consultant', base: 86, clientIds: ['acme', 'blue-harbor', 'foundry'] },
    { id: 'jonas', name: 'Jonas', role: 'Senior consultant', base: 83, clientIds: ['trailhead', 'highline'] },
    { id: 'aisha', name: 'Aisha', role: 'Consultant', base: 79, clientIds: ['northwind', 'highline'] },
    { id: 'noor', name: 'Noor', role: 'Consultant', base: 75, clientIds: ['meridian', 'sable'] },
    { id: 'theo', name: 'Theo', role: 'Analyst', base: 58, clientIds: ['acme', 'trailhead', 'foundry'] },
    { id: 'lena', name: 'Lena', role: 'Analyst', base: 55, clientIds: ['blue-harbor', 'highline'] }
  ];

  const members = memberSeed.map(function (member, memberIndex) {
    const weeks = utilizationOffsets.map(function (offset, weekIndex) {
      const drift = Math.sin((weekIndex + memberIndex * 1.7) * 0.7) * 2;
      return clamp(Math.round(member.base + offset + drift), 35, 100);
    });
    const average = weeks.reduce(function (sum, value) { return sum + value; }, 0) / weeks.length;
    const recent = weeks.slice(-4).reduce(function (sum, value) { return sum + value; }, 0) / 4;
    return {
      id: member.id,
      name: member.name,
      role: member.role,
      clientIds: member.clientIds,
      weeks: weeks,
      average: Math.round(average),
      allocated: Math.round(recent),
      available: 100 - Math.round(recent),
      benchDays: average < 60 ? Math.max(2, Math.round((100 - average) / 100 * 16)) : 0
    };
  });

  const utilizationAverage = Math.round(
    members.reduce(function (total, member) {
      return total + member.average;
    }, 0) / members.length
  );
  const bench = members.filter(function (member) { return member.average < 60; });
  const forecastUtilization = [78, 79, 81, 82, 83, 84, 85, 86, 84, 83, 82, 81];

  const timesheets = [
    { id: 't1', memberId: 'priya', clientId: 'acme', hours: 6.5, date: '2026-11-02', status: 'pending' },
    { id: 't2', memberId: 'elena', clientId: 'blue-harbor', hours: 4, date: '2026-11-03', status: 'pending' },
    { id: 't3', memberId: 'marcus', clientId: 'northwind', hours: 7.5, date: '2026-11-02', status: 'approved' },
    { id: 't4', memberId: 'theo', clientId: 'trailhead', hours: 5, date: '2026-11-04', status: 'pending' },
    { id: 't5', memberId: 'aisha', clientId: 'highline', hours: 6, date: '2026-11-03', status: 'pending' },
    { id: 't6', memberId: 'noor', clientId: 'meridian', hours: 3.5, date: '2026-11-04', status: 'pending' },
    { id: 't7', memberId: 'jonas', clientId: 'highline', hours: 8, date: '2026-11-02', status: 'approved' },
    { id: 't8', memberId: 'lena', clientId: 'blue-harbor', hours: 2.5, date: '2026-11-04', status: 'pending' },
    { id: 't9', memberId: 'priya', clientId: 'meridian', hours: 4, date: '2026-11-03', status: 'approved' },
    { id: 't10', memberId: 'elena', clientId: 'foundry', hours: 3, date: '2026-11-01', status: 'pending' },
    { id: 't11', memberId: 'marcus', clientId: 'sable', hours: 5.5, date: '2026-11-04', status: 'pending' },
    { id: 't12', memberId: 'noor', clientId: 'sable', hours: 2, date: '2026-11-03', status: 'pending' }
  ].map(function (entry) {
    const client = clients.find(function (candidate) { return candidate.id === entry.clientId; });
    const member = members.find(function (candidate) { return candidate.id === entry.memberId; });
    return Object.assign({}, entry, {
      clientName: client ? client.name : 'Unknown client',
      memberName: member ? member.name : 'Unknown'
    });
  });

  const throughputWeekStarts = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'];
  const throughputLabels = throughputWeekStarts.map(function (start) {
    const date = new Date(start + 'T12:00:00Z');
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date);
  });
  const throughput = throughputWeekStarts.map(function () { return 0; });
  const throughputByClient = {};
  clients.forEach(function (client) { throughputByClient[client.id] = throughputWeekStarts.map(function () { return 0; }); });
  deliverables.forEach(function (deliverable) {
    if (deliverable.status !== 'Complete' || !deliverable.completedAt) return;
    let weekIndex = -1;
    throughputWeekStarts.forEach(function (start, index) {
      const end = addDays(start, 7);
      if (deliverable.completedAt >= start && deliverable.completedAt < end) weekIndex = index;
    });
    if (weekIndex === -1) return;
    throughput[weekIndex] += 1;
    if (throughputByClient[deliverable.clientId]) throughputByClient[deliverable.clientId][weekIndex] += 1;
  });

  const revenue = {
    months: META.months,
    actual: portfolioActual,
    forecast: portfolioForecast,
    mrr: mrr,
    arr: arr,
    forecastCurrent: portfolioForecast[portfolioForecast.length - 1],
    invoiceTotals: invoiceTotals,
    overdueTrend: portfolioOverdueTrend,
    revenueAtRisk: revenueAtRisk,
    topClients: clients.slice().sort(function (a, b) { return b.mrr - a.mrr; }).slice(0, 5).map(function (client) {
      return { id: client.id, name: client.name, mrr: client.mrr };
    })
  };

  const threads = [
    {
      id: 'thread-northwind-maya',
      clientId: 'northwind',
      participant: 'Maya',
      role: 'Program lead',
      unread: true,
      updated: '2026-11-04T11:20:00',
      messages: [
        { id: 'nm1', from: 'them', body: 'The renewal pack landed well with our finance team. One question on the spring route split.', at: '2026-11-04T10:02:00' },
        { id: 'nm2', from: 'me', body: 'Good to hear. Iâ€™ll add a one-page bridge between the route split and the margin model.', at: '2026-11-04T10:18:00' },
        { id: 'nm3', from: 'them', body: 'Perfect. Can we review it Thursday morning?', at: '2026-11-04T11:20:00' }
      ]
    },
    {
      id: 'thread-acme-dev',
      clientId: 'acme',
      participant: 'Dev',
      role: 'Operations lead',
      unread: true,
      updated: '2026-11-04T11:05:00',
      messages: [
        { id: 'ad1', from: 'them', body: 'We can get you the guest data export by noon tomorrow.', at: '2026-11-04T09:40:00' },
        { id: 'ad2', from: 'me', body: 'That works. Iâ€™ll keep the recovery readout open until it arrives.', at: '2026-11-04T11:05:00' }
      ]
    },
    {
      id: 'thread-blue-erin',
      clientId: 'blue-harbor',
      participant: 'Erin',
      role: 'Partner',
      unread: false,
      updated: '2026-11-03T16:40:00',
      messages: [
        { id: 'be1', from: 'them', body: 'The harbour team has two extra notes for the operations playbook.', at: '2026-11-03T15:55:00' },
        { id: 'be2', from: 'me', body: 'Send them through. We can fold them into the review version.', at: '2026-11-03T16:40:00' }
      ]
    },
    {
      id: 'thread-sable-tomas',
      clientId: 'sable',
      participant: 'Tomas',
      role: 'Founder',
      unread: false,
      updated: '2026-11-02T09:15:00',
      messages: [
        { id: 'st1', from: 'me', body: 'The workbook refresh is approved. Iâ€™ve flagged the property data gap for the renewal forecast.', at: '2026-11-02T08:55:00', mode: 'normal' },
        { id: 'st2', from: 'them', body: 'Understood. We should have the missing property list by Friday.', at: '2026-11-02T09:15:00' },
        { id: 'st3', from: 'me', body: 'Internal: keep the renewal forecast in blocked state until the list is verified.', at: '2026-11-02T09:18:00', mode: 'internal' }
      ]
    },
    {
      id: 'thread-northwind-nina',
      clientId: 'northwind',
      participant: 'Nina',
      role: 'Finance',
      unread: true,
      updated: '2026-11-01T14:20:00',
      messages: [
        { id: 'nn1', from: 'them', body: 'The PO window opens Monday. Iâ€™ll confirm the reference once itâ€™s issued.', at: '2026-11-01T14:20:00' }
      ]
    },
    {
      id: 'thread-meridian-owen',
      clientId: 'meridian',
      participant: 'Owen',
      role: 'Commercial lead',
      unread: false,
      updated: '2026-10-30T10:10:00',
      messages: []
    }
  ].map(function (thread) {
    const client = clients.find(function (candidate) { return candidate.id === thread.clientId; });
    return Object.assign({}, thread, { clientName: client ? client.name : 'Unknown client' });
  });

  const rateCard = [
    { id: 'principal', role: 'Principal consultant', rate: 260 },
    { id: 'senior', role: 'Senior consultant', rate: 210 },
    { id: 'consultant', role: 'Consultant', rate: 165 },
    { id: 'analyst', role: 'Analyst', rate: 120 }
  ];
  const blendedRate = rateCard.reduce(function (total, row) { return total + row.rate; }, 0) / rateCard.length;

  const schedule = [
    { id: 's1', day: 'Wed', date: '2026-11-05', time: '10:00', title: 'Delivery review', clientId: 'acme', type: 'Review' },
    { id: 's2', day: 'Wed', date: '2026-11-05', time: '13:00', title: 'Ops walkthrough', clientId: 'trailhead', type: 'Workshop' },
    { id: 's3', day: 'Thu', date: '2026-11-06', time: '14:00', title: 'Renewal workshop', clientId: 'northwind', type: 'Workshop' },
    { id: 's4', day: 'Thu', date: '2026-11-06', time: '16:00', title: 'Review close-out', clientId: 'highline', type: 'Review' },
    { id: 's5', day: 'Fri', date: '2026-11-07', time: '09:30', title: 'Quarterly planning', clientId: 'meridian', type: 'Planning' },
    { id: 's6', day: 'Fri', date: '2026-11-07', time: '10:30', title: 'Archive check', clientId: 'foundry', type: 'Review' },
    { id: 's7', day: 'Mon', date: '2026-11-09', time: '11:00', title: 'Partner check-in', clientId: 'blue-harbor', type: 'Call' },
    { id: 's8', day: 'Tue', date: '2026-11-10', time: '15:30', title: 'Health review', clientId: 'sable', type: 'Review' }
  ].map(function (item) {
    const client = clients.find(function (candidate) { return candidate.id === item.clientId; });
    return Object.assign({}, item, { clientName: client ? client.name : 'Unknown client' });
  });

  const notifications = [
    {
      id: 'cnote-1',
      type: 'risk',
      title: 'Invoice overdue â€” Acme Adventures',
      body: '$2.8k overdue. A recovery call is scheduled for Wednesday.',
      at: minutesAgo(45),
      route: '#/revenue?client=acme'
    },
    {
      id: 'cnote-2',
      type: 'risk',
      title: 'Engagement at risk â€” Blue Harbor Trips',
      body: 'Guest journey audit is behind its review checkpoint.',
      at: minutesAgo(170),
      route: '#/engagements?client=blue-harbor'
    },
    {
      id: 'cnote-3',
      type: 'schedule',
      title: 'Review due Thursday â€” Northwind Journeys',
      body: 'Renewal pack review with the client sponsor.',
      at: minutesAgo(1320),
      route: '#/deliverables?client=northwind'
    }
  ];

  const preferences = {
    title: 'Principal Consultant',
    timezone: 'Europe/London',
    weeklyAvailability: 32,
    capacityTarget: 80,
    currency: 'USD',
    digest: true,
    riskAlerts: true,
    scheduleAlerts: true,
    compact: false
  };

  const timezones = [
    { value: 'Europe/London', label: 'Europe/London â€” GMT+0' },
    { value: 'Europe/Berlin', label: 'Europe/Berlin â€” GMT+1' },
    { value: 'Asia/Kolkata', label: 'Asia/Kolkata â€” GMT+5:30' },
    { value: 'America/New_York', label: 'America/New_York â€” GMT-5' },
    { value: 'Asia/Singapore', label: 'Asia/Singapore â€” GMT+8' },
    { value: 'UTC', label: 'UTC' }
  ];

  const currencies = [
    { value: 'USD', label: 'USD â€” US dollar', symbol: '$' },
    { value: 'EUR', label: 'EUR â€” Euro', symbol: 'â‚¬' },
    { value: 'GBP', label: 'GBP â€” Pound sterling', symbol: 'Â£' },
    { value: 'INR', label: 'INR â€” Indian rupee', symbol: 'â‚¹' }
  ];

  const activeClients = clients.filter(function (client) { return client.healthBand !== 'churned'; }).length;
  const deliverableStatus = {};
  deliverables.forEach(function (deliverable) {
    deliverableStatus[deliverable.status] = (deliverableStatus[deliverable.status] || 0) + 1;
  });

  window.ConsultantData = deepFreeze({
    meta: META,
    clients: clients,
    healthCounts: healthCounts,
    attention: attention,
    portfolioKpis: [
      {
        id: 'active-clients',
        label: 'Active clients',
        value: activeClients,
        display: String(activeClients),
        delta: '+1',
        deltaTone: 'positive',
        series: [6, 7, 7, 7, 7, 8, 8, 7, 7, 7, 7, 7]
      },
      {
        id: 'health',
        label: 'Portfolio health score',
        value: healthAverage,
        display: String(healthAverage),
        delta: '+3 pts',
        deltaTone: 'positive',
        series: [62, 63, 62, 64, 65, 64, 66, 65, 66, 67, 66, 67]
      },
      {
        id: 'utilization',
        label: 'Utilization this month',
        value: utilizationAverage,
        display: utilizationAverage + '%',
        delta: '+2 pts',
        deltaTone: 'positive',
        series: [72, 73, 75, 74, 76, 77, 76, 78, 77, 79, 78, 78]
      },
      {
        id: 'revenue-risk',
        label: 'Revenue at risk',
        value: revenueAtRisk,
        display: '14.4k',
        delta: '-1.2k',
        deltaTone: 'negative',
        series: [12800, 13200, 12600, 13500, 13800, 13600, 14100, 14000, 14300, 14200, 14500, 14400]
      }
    ],
    revenue: revenue,
    engagements: engagements,
    engagementWindow: engagementWindow,
    deliverables: deliverables,
    deliverableStatus: deliverableStatus,
    throughput: throughput,
    throughputLabels: throughputLabels,
    throughputByClient: throughputByClient,
    members: members,
    weekLabels: weekLabels,
    utilizationAverage: utilizationAverage,
    bench: bench,
    forecastUtilization: forecastUtilization,
    timesheets: timesheets,
    threads: threads,
    schedule: schedule,
    notifications: notifications,
    rateCard: rateCard,
    blendedRate: blendedRate,
    preferences: preferences,
    timezones: timezones,
    currencies: currencies,
    summary: {
      clients: clients.length,
      engagements: engagements.length,
      members: members.length,
      weeks: weekLabels.length,
      months: META.months.length,
      deliverables: deliverables.length,
      threads: threads.length,
      healthCounts: healthCounts,
      healthAverage: healthAverage,
      utilizationAverage: utilizationAverage,
      mrr: mrr,
      arr: arr,
      invoiceTotals: invoiceTotals,
      overdueTotal: invoiceTotals.overdue,
      revenueAtRisk: revenueAtRisk,
      activeClients: activeClients,
      benchCount: bench.length,
      completedDeliverables: deliverableStatus.Complete || 0,
      throughputTotal: throughput.reduce(function (total, value) { return total + value; }, 0)
    }
  });
})();

