/* Deterministic mock data for the Stackly client workspace. No live user data lives here. */
(function () {
  'use strict';

  const META = Object.freeze({
    now: '2026-11-04T16:20:00',
    today: '2026-11-04',
    weekLabel: 'Last 12 weeks',
    stages: Object.freeze(['Discovery', 'Route design', 'Logistics', 'Approvals', 'Ready'])
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

  function makeTrail(end) {
    const points = [];
    for (let index = 0; index < 8; index += 1) {
      const base = end * ((index + 1) / 8);
      const wobble = index === 0 ? 0 : Math.sin(index * 1.3) * 3;
      points.push(clamp(Math.round(base + wobble), 0, 100));
    }
    points[7] = end;
    return points;
  }

  const weeklyTrend = [46, 49, 48, 52, 55, 57, 56, 60, 63, 65, 64, 68];
  const dailyProgress = [];
  for (let index = 0; index < 90; index += 1) {
    const position = index * (weeklyTrend.length - 1) / 89;
    const lower = Math.floor(position);
    const upper = Math.min(lower + 1, weeklyTrend.length - 1);
    const fraction = position - lower;
    const base = weeklyTrend[lower] + (weeklyTrend[upper] - weeklyTrend[lower]) * fraction;
    const wobble = Math.sin(index * 0.83) * 0.9 + Math.cos(index * 1.61) * 0.4;
    dailyProgress.push({
      date: dateISO(index - 89),
      value: Math.round(clamp(base + wobble, 0, 100) * 10) / 10
    });
  }

  const heatmapWeeks = [];
  for (let week = 0; week < 20; week += 1) {
    const days = [];
    for (let day = 0; day < 7; day += 1) {
      const index = week * 7 + day;
      const raw = 1.7 + Math.sin(index * 0.71) * 1.45 + Math.cos(index * 0.23) * 0.85 + (index % 11 === 0 ? 1 : 0);
      days.push({
        date: addDays('2026-06-15', index),
        value: clamp(Math.round(raw), 0, 5)
      });
    }
    heatmapWeeks.push({ start: days[0].date, days: days });
  }

  const journeys = [
    {
      id: 'dolomites',
      name: 'Dolomites Traverse',
      region: 'Italy',
      stage: 'Approvals',
      owner: 'M. Alvarez',
      progress: 72,
      nextDate: '2026-11-14',
      status: 'on-track',
      travellers: 8,
      stageSplit: [12, 28, 24, 22, 14]
    },
    {
      id: 'kerala',
      name: 'Kerala Backwater Slow',
      region: 'India',
      stage: 'Logistics',
      owner: 'R. Nair',
      progress: 48,
      nextDate: '2026-12-02',
      status: 'on-track',
      travellers: 6,
      stageSplit: [20, 22, 18, 10, 30]
    },
    {
      id: 'highlands',
      name: 'Scottish Highlands Walk',
      region: 'Scotland',
      stage: 'Ready',
      owner: 'E. Fraser',
      progress: 88,
      nextDate: '2026-11-09',
      status: 'at-risk',
      travellers: 8,
      stageSplit: [8, 18, 22, 34, 18]
    },
    {
      id: 'ladakh',
      name: 'Ladakh High Passes',
      region: 'India',
      stage: 'Discovery',
      owner: 'T. Dorjay',
      progress: 24,
      nextDate: '2027-01-18',
      status: 'blocked',
      travellers: 6,
      stageSplit: [34, 26, 14, 6, 20]
    },
    {
      id: 'norway',
      name: 'Norway Fjord Kayak',
      region: 'Norway',
      stage: 'Logistics',
      owner: 'K. Solberg',
      progress: 61,
      nextDate: '2026-11-21',
      status: 'on-track',
      travellers: 8,
      stageSplit: [14, 20, 26, 20, 20]
    },
    {
      id: 'atlas',
      name: 'Moroccan Atlas Traverse',
      region: 'Morocco',
      stage: 'Complete',
      owner: 'S. Benali',
      progress: 100,
      nextDate: null,
      status: 'complete',
      travellers: 8,
      stageSplit: [20, 20, 20, 20, 20]
    },
    {
      id: 'slovenia',
      name: 'Slovenian Alps Traverse',
      region: 'Slovenia',
      stage: 'Route design',
      owner: 'J. Novak',
      progress: 37,
      nextDate: '2027-02-05',
      status: 'on-track',
      travellers: 6,
      stageSplit: [26, 24, 16, 10, 24]
    },
    {
      id: 'iceland',
      name: 'Iceland Ring Road',
      region: 'Iceland',
      stage: 'Discovery',
      owner: 'A. Jonsdottir',
      progress: 19,
      nextDate: '2027-03-22',
      status: 'at-risk',
      travellers: 8,
      stageSplit: [40, 22, 12, 6, 20]
    }
  ].map(function (journey) {
    journey.progressTrail = makeTrail(journey.progress);
    return journey;
  });

  const kpis = [
    {
      id: 'active',
      label: 'Active journeys',
      value: 7,
      unit: '',
      delta: '+2',
      deltaTone: 'positive',
      note: 'vs last period',
      series: [3, 3, 4, 4, 5, 5, 6, 6, 5, 6, 6, 7],
      weekLabels: Array.from({ length: 12 }, function (_, index) { return dateISO(index * 7 - 77); })
    },
    {
      id: 'plan',
      label: 'Plan completion',
      value: 68,
      unit: '%',
      delta: '+6 pts',
      deltaTone: 'positive',
      note: 'vs last period',
      series: [54, 56, 57, 58, 60, 61, 62, 63, 65, 66, 67, 68],
      weekLabels: Array.from({ length: 12 }, function (_, index) { return dateISO(index * 7 - 77); })
    },
    {
      id: 'milestones',
      label: 'Milestones due',
      value: 5,
      unit: '',
      delta: '-1',
      deltaTone: 'neutral',
      note: 'next 30 days',
      series: [2, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 5],
      weekLabels: Array.from({ length: 12 }, function (_, index) { return dateISO(index * 7 - 77); })
    },
    {
      id: 'actions',
      label: 'Open actions',
      value: 23,
      unit: '',
      delta: '+4',
      deltaTone: 'negative',
      note: 'vs last period',
      series: [31, 30, 30, 28, 29, 27, 26, 27, 25, 24, 24, 23],
      weekLabels: Array.from({ length: 12 }, function (_, index) { return dateISO(index * 7 - 77); })
    }
  ];

  const milestones = [
    {
      id: 'ms-highlands',
      name: 'Final route brief',
      journey: 'Scottish Highlands Walk',
      due: '2026-11-09',
      status: 'at-risk',
      owner: 'E. Fraser',
      detail: 'Weather window review and day-three alternative confirmed with the guide.'
    },
    {
      id: 'ms-dolomites',
      name: 'Hut confirmations',
      journey: 'Dolomites Traverse',
      due: '2026-11-14',
      status: 'on-track',
      owner: 'M. Alvarez',
      detail: 'Two rifugio holds convert to confirmed bookings once the final guest count is locked.'
    },
    {
      id: 'ms-norway',
      name: 'Ferry window',
      journey: 'Norway Fjord Kayak',
      due: '2026-11-21',
      status: 'on-track',
      owner: 'K. Solberg',
      detail: 'Confirm the morning crossing and the backup afternoon sailing for the group transfer.'
    },
    {
      id: 'ms-kerala',
      name: 'Houseboat deposit',
      journey: 'Kerala Backwater Slow',
      due: '2026-12-02',
      status: 'on-track',
      owner: 'R. Nair',
      detail: 'Deposit due for two nights on the quieter northern backwater route.'
    },
    {
      id: 'ms-iceland',
      name: 'Vehicle quote',
      journey: 'Iceland Ring Road',
      due: '2026-12-08',
      status: 'at-risk',
      owner: 'A. Jonsdottir',
      detail: 'Four-wheel-drive quote pending; route decisions depend on the final vehicle class.'
    }
  ];

  const activity = [
    { id: 'a1', type: 'milestone', text: 'Route brief approved for Dolomites Traverse.', at: minutesAgo(38) },
    { id: 'a2', type: 'document', text: 'Maya Alvarez shared two documents in Norway Fjord Kayak.', at: minutesAgo(190) },
    { id: 'a3', type: 'risk', text: 'Scottish Highlands Walk was flagged at risk.', at: minutesAgo(1560) },
    { id: 'a4', type: 'message', text: 'New message from Ravi Nair about the houseboat dates.', at: minutesAgo(1860) },
    { id: 'a5', type: 'stage', text: 'Ladakh High Passes moved back to Discovery.', at: minutesAgo(2880) },
    { id: 'a6', type: 'complete', text: 'Moroccan Atlas Traverse was marked complete.', at: minutesAgo(5760) }
  ];

  const workstreamNames = ['Route design', 'Ground logistics', 'Guest care', 'Risk & safety', 'Documentation'];

  function capacity(values) {
    return values.map(function (value, index) {
      return { name: workstreamNames[index], committed: value[0], target: value[1] };
    });
  }

  const quarters = [
    {
      id: 'Q1',
      label: 'Q1',
      months: 'Jan–Mar 2026',
      burndown: {
        remaining: [46, 41, 37, 33, 29, 24, 19, 12],
        ideal: [46, 40, 34, 28, 22, 16, 10, 4]
      },
      capacity: capacity([[64, 70], [58, 65], [42, 55], [49, 60], [35, 45]]),
      gantt: [
        { name: 'Dolomites route fit', start: 1, end: 3, status: 'on-track' },
        { name: 'Kerala partner hold', start: 2, end: 5, status: 'on-track' },
        { name: 'Highlands permits', start: 3, end: 6, status: 'at-risk' },
        { name: 'Ladakh recce', start: 5, end: 8, status: 'blocked' },
        { name: 'Norway ferry holds', start: 4, end: 7, status: 'on-track' }
      ],
      milestones: [
        { name: 'Route sign-off', journey: 'Dolomites Traverse', due: '2026-02-12', status: 'complete' },
        { name: 'Houseboat hold', journey: 'Kerala Backwater Slow', due: '2026-02-24', status: 'complete' },
        { name: 'Permit submission', journey: 'Scottish Highlands Walk', due: '2026-03-04', status: 'at-risk' },
        { name: 'Ferry window', journey: 'Norway Fjord Kayak', due: '2026-03-18', status: 'on-track' },
        { name: 'Guest briefing', journey: 'Slovenian Alps Traverse', due: '2026-03-27', status: 'complete' }
      ]
    },
    {
      id: 'Q2',
      label: 'Q2',
      months: 'Apr–Jun 2026',
      burndown: {
        remaining: [52, 47, 42, 36, 31, 24, 16, 8],
        ideal: [52, 45, 38, 31, 24, 17, 10, 3]
      },
      capacity: capacity([[72, 75], [66, 70], [54, 60], [57, 65], [44, 50]]),
      gantt: [
        { name: 'Highlands brief v2', start: 1, end: 4, status: 'on-track' },
        { name: 'Norway kayak recce', start: 2, end: 5, status: 'on-track' },
        { name: 'Ladakh permit draft', start: 3, end: 7, status: 'at-risk' },
        { name: 'Slovenia hut holds', start: 4, end: 6, status: 'on-track' },
        { name: 'Iceland vehicle scope', start: 6, end: 8, status: 'at-risk' }
      ],
      milestones: [
        { name: 'Route brief v2', journey: 'Scottish Highlands Walk', due: '2026-04-10', status: 'complete' },
        { name: 'Kayak safety plan', journey: 'Norway Fjord Kayak', due: '2026-04-28', status: 'complete' },
        { name: 'Permit draft', journey: 'Ladakh High Passes', due: '2026-05-15', status: 'at-risk' },
        { name: 'Hut holds', journey: 'Slovenian Alps Traverse', due: '2026-06-02', status: 'on-track' },
        { name: 'Vehicle shortlist', journey: 'Iceland Ring Road', due: '2026-06-21', status: 'at-risk' }
      ]
    },
    {
      id: 'Q3',
      label: 'Q3',
      months: 'Jul–Sep 2026',
      burndown: {
        remaining: [43, 39, 34, 30, 25, 19, 13, 6],
        ideal: [43, 37, 31, 25, 19, 13, 7, 1]
      },
      capacity: capacity([[76, 80], [69, 75], [58, 65], [61, 70], [50, 55]]),
      gantt: [
        { name: 'Dolomites logistics', start: 1, end: 4, status: 'on-track' },
        { name: 'Atlas close-out', start: 1, end: 3, status: 'on-track' },
        { name: 'Kerala houseboat hold', start: 3, end: 6, status: 'on-track' },
        { name: 'Highlands guide call', start: 4, end: 7, status: 'on-track' },
        { name: 'Iceland weather review', start: 5, end: 8, status: 'at-risk' }
      ],
      milestones: [
        { name: 'Atlas close-out', journey: 'Moroccan Atlas Traverse', due: '2026-07-15', status: 'complete' },
        { name: 'Dolomites logistics', journey: 'Dolomites Traverse', due: '2026-08-03', status: 'complete' },
        { name: 'Houseboat hold', journey: 'Kerala Backwater Slow', due: '2026-08-26', status: 'on-track' },
        { name: 'Guide briefing', journey: 'Scottish Highlands Walk', due: '2026-09-11', status: 'on-track' },
        { name: 'Weather review', journey: 'Iceland Ring Road', due: '2026-09-29', status: 'at-risk' }
      ]
    },
    {
      id: 'Q4',
      label: 'Q4',
      months: 'Oct–Dec 2026',
      burndown: {
        remaining: [48, 43, 39, 34, 29, 24, 18, 11],
        ideal: [48, 42, 36, 30, 24, 18, 12, 6]
      },
      capacity: capacity([[72, 80], [88, 85], [64, 75], [58, 70], [46, 60]]),
      gantt: [
        { name: 'Highlands final brief', start: 1, end: 3, status: 'at-risk' },
        { name: 'Dolomites hut confirmations', start: 1, end: 4, status: 'on-track' },
        { name: 'Norway ferry window', start: 2, end: 5, status: 'on-track' },
        { name: 'Kerala houseboat deposit', start: 4, end: 7, status: 'on-track' },
        { name: 'Iceland vehicle quote', start: 5, end: 8, status: 'at-risk' }
      ],
      milestones: [
        { name: 'Final route brief', journey: 'Scottish Highlands Walk', due: '2026-11-09', status: 'at-risk' },
        { name: 'Hut confirmations', journey: 'Dolomites Traverse', due: '2026-11-14', status: 'on-track' },
        { name: 'Ferry window', journey: 'Norway Fjord Kayak', due: '2026-11-21', status: 'on-track' },
        { name: 'Houseboat deposit', journey: 'Kerala Backwater Slow', due: '2026-12-02', status: 'on-track' },
        { name: 'Vehicle quote', journey: 'Iceland Ring Road', due: '2026-12-08', status: 'at-risk' }
      ]
    }
  ];

  const monthly = {
    labels: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
    series: [
      { name: 'Journey updates', values: [12, 14, 13, 16, 17, 15], color: 'var(--chart-1)' },
      { name: 'Milestones closed', values: [4, 6, 5, 7, 8, 6], color: 'var(--chart-2)' },
      { name: 'Documents shared', values: [3, 5, 4, 6, 7, 9], color: 'var(--chart-3)' }
    ]
  };

  const capability = {
    axes: ['Route design', 'Risk planning', 'Logistics', 'Budget control', 'Guest care'],
    values: [82, 68, 74, 61, 88]
  };

  const documents = [
    { id: 'doc-1', name: 'Dolomites route brief.pdf', type: 'pdf', category: 'PDF', size: 2516582, updated: '2026-11-02', status: 'Approved', owner: 'M. Alvarez' },
    { id: 'doc-2', name: 'Highlands risk register.xlsx', type: 'sheet', category: 'Spreadsheet', size: 880640, updated: '2026-11-01', status: 'In review', owner: 'E. Fraser' },
    { id: 'doc-3', name: 'Norway packing list.docx', type: 'doc', category: 'Brief', size: 327680, updated: '2026-10-29', status: 'Approved', owner: 'K. Solberg' },
    { id: 'doc-4', name: 'Ladakh permits checklist.pdf', type: 'pdf', category: 'PDF', size: 1153434, updated: '2026-10-27', status: 'Draft', owner: 'T. Dorjay' },
    { id: 'doc-5', name: 'Atlas route photos.jpg', type: 'image', category: 'Image', size: 5033165, updated: '2026-10-24', status: 'Approved', owner: 'S. Benali' },
    { id: 'doc-6', name: 'Guest manifest template.csv', type: 'data', category: 'Data', size: 98304, updated: '2026-10-18', status: 'In review', owner: 'Planning desk' }
  ];

  const storage = {
    usedBytes: 2576980378,
    totalBytes: 5368709120,
    note: 'Recent files only. Archived trip media is included in the workspace total.'
  };

  const threads = [
    {
      id: 'thread-maya',
      name: 'Maya Alvarez',
      role: 'Lead planner',
      unread: true,
      updated: '2026-11-04T11:06:00',
      messages: [
        { id: 'm1', from: 'them', body: 'Route brief for the Highlands is back from review. Two notes on the final day.', at: '2026-11-04T09:12:00' },
        { id: 'm2', from: 'me', body: 'Thanks. I’ll read it before our call.', at: '2026-11-04T09:20:00' },
        { id: 'm3', from: 'them', body: 'Also the contingency hut is held until Friday.', at: '2026-11-04T11:05:00' },
        { id: 'm4', from: 'them', body: 'No action needed yet — just so you have it.', at: '2026-11-04T11:06:00' }
      ]
    },
    {
      id: 'thread-ravi',
      name: 'Ravi Nair',
      role: 'Local partner',
      unread: true,
      updated: '2026-11-03T16:02:00',
      messages: [
        { id: 'r1', from: 'them', body: 'Houseboat dates for December are open. Want me to hold 12–15?', at: '2026-11-03T15:40:00' },
        { id: 'r2', from: 'me', body: 'Yes, please hold them for now.', at: '2026-11-03T16:02:00' }
      ]
    },
    {
      id: 'thread-ellis',
      name: 'Ellis Fraser',
      role: 'Mountain guide',
      unread: false,
      updated: '2026-11-01T11:15:00',
      messages: [
        { id: 'e1', from: 'me', body: 'Can we shift the ridge day to the Thursday?', at: '2026-11-01T10:10:00' },
        { id: 'e2', from: 'them', body: 'Thursday works. I’ll update the brief.', at: '2026-11-01T10:42:00' },
        { id: 'e3', from: 'them', body: 'Done — v4 is in Documents.', at: '2026-11-01T11:15:00' }
      ]
    },
    {
      id: 'thread-desk',
      name: 'Stackly planning desk',
      role: 'Support',
      unread: false,
      updated: '2026-10-28T09:00:00',
      messages: []
    }
  ];

  const notifications = [
    {
      id: 'note-1',
      title: 'Highlands brief ready',
      body: 'The final route brief is in Documents for review.',
      at: minutesAgo(40),
      route: '#/documents'
    },
    {
      id: 'note-2',
      title: 'Two documents shared',
      body: 'Maya added the Norway ferry and packing files.',
      at: minutesAgo(185),
      route: '#/documents'
    },
    {
      id: 'note-3',
      title: 'Milestone due Monday',
      body: 'Final route brief for Scottish Highlands Walk.',
      at: minutesAgo(1500),
      route: '#/journeys'
    }
  ];

  const preferences = {
    timezone: 'Asia/Kolkata',
    weeklyDigest: true,
    emailNotifications: true,
    compact: false
  };

  const timezones = [
    { value: 'Asia/Kolkata', label: 'Asia/Kolkata — GMT+5:30' },
    { value: 'Europe/London', label: 'Europe/London — GMT+0' },
    { value: 'Europe/Berlin', label: 'Europe/Berlin — GMT+1' },
    { value: 'America/New_York', label: 'America/New_York — GMT-5' },
    { value: 'Asia/Singapore', label: 'Asia/Singapore — GMT+8' },
    { value: 'UTC', label: 'UTC' }
  ];

  window.ClientData = deepFreeze({
    meta: META,
    journeys: journeys,
    kpis: kpis,
    overview: {
      dailyProgress: dailyProgress,
      weeklyTrend: weeklyTrend
    },
    milestones: milestones,
    activity: activity,
    quarters: quarters,
    workstreamNames: workstreamNames,
    monthly: monthly,
    capability: capability,
    heatmap: {
      weeks: heatmapWeeks,
      startDate: '2026-06-15',
      endDate: '2026-11-01',
      max: 5
    },
    documents: documents,
    storage: storage,
    threads: threads,
    notifications: notifications,
    preferences: preferences,
    timezones: timezones
  });
})();
