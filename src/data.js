// ==== Championship data (fictional) ========================================
// Teams: perf.p = power-unit factor, perf.a = aero (downforce) factor.
// Colours follow the 2026 grid's liveries; names are fictional and can be
// renamed by the player in the roster editor (stored on their device).
const TEAMS = [
  { id: 'rossa',   name: 'Scuderia Rossa',     c1: '#9e0a17', c2: '#ffffff', c3: '#111111', style: 'sf25', perf: { p: 1.000, a: 0.995 },
    drivers: [{ name: 'Matteo Corsini', code: 'COR', num: 16, skill: 0.985 }, { name: 'Elias Navarro', code: 'NAV', num: 44, skill: 0.990 }] },
  { id: 'argento', name: 'Argento Motorsport', c1: '#c2c7cc', c2: '#00d2be', c3: '#0d0f12', perf: { p: 1.000, a: 0.990 },
    drivers: [{ name: 'Jonah Whitcombe', code: 'WHI', num: 63, skill: 0.985 }, { name: 'Aurelio Santos', code: 'SAN', num: 12, skill: 0.975 }] },
  { id: 'taurus',  name: 'Taurus Racing',      c1: '#1b2450', c2: '#db0a40', c3: '#ffc906', tip: '#ffc906', perf: { p: 0.995, a: 1.000 },
    drivers: [{ name: 'Dries van Leeuwen', code: 'VLE', num: 1, skill: 1.000 }, { name: 'Kenta Moriyama', code: 'MOR', num: 22, skill: 0.970 }] },
  { id: 'ardent',  name: 'Ardent GP',          c1: '#ff8000', c2: '#121417', c3: '#47c7fc', perf: { p: 1.000, a: 1.000 },
    drivers: [{ name: 'Callum Price', code: 'PRI', num: 4, skill: 0.990 }, { name: 'Theo Lambert', code: 'LAM', num: 81, skill: 0.988 }] },
  { id: 'verdant', name: 'Verdant Racing',     c1: '#00594f', c2: '#cedc00', c3: '#0d0d0d', perf: { p: 0.990, a: 0.985 },
    drivers: [{ name: 'Rafael Ortega', code: 'ORT', num: 14, skill: 0.975 }, { name: 'Hugo Strand', code: 'STR', num: 18, skill: 0.955 }] },
  { id: 'massif',  name: 'Massif F1 Team',     c1: '#0067c6', c2: '#ff87bc', c3: '#ffffff', perf: { p: 0.985, a: 0.985 },
    drivers: [{ name: 'Antoine Garnier', code: 'GAR', num: 10, skill: 0.965 }, { name: 'Niko Varga', code: 'VAR', num: 43, skill: 0.955 }] },
  { id: 'grove',   name: 'Grove Racing',       c1: '#0a2a6b', c2: '#00aeef', c3: '#ffffff', perf: { p: 1.000, a: 0.980 },
    drivers: [{ name: 'Alex Sinclair', code: 'SIN', num: 23, skill: 0.970 }, { name: 'Carlos Medina', code: 'MED', num: 55, skill: 0.978 }] },
  { id: 'faenza',  name: 'Faenza Junior',      c1: '#f2f4f8', c2: '#2453ff', c3: '#e8002d', perf: { p: 0.995, a: 0.985 },
    drivers: [{ name: 'Liam Ashby', code: 'ASH', num: 30, skill: 0.962 }, { name: 'Yannis Mercier', code: 'MER', num: 6, skill: 0.960 }] },
  { id: 'kanna',   name: 'Kannapolis Racing',  c1: '#f0f0f0', c2: '#e10600', c3: '#111111', perf: { p: 0.990, a: 0.980 },
    drivers: [{ name: 'Esteban Rocha', code: 'ROC', num: 31, skill: 0.960 }, { name: 'Ollie Barnes', code: 'BAR', num: 87, skill: 0.955 }] },
  { id: 'nord', matte: true,    name: 'Nordwerk Racing',    c1: '#9aa1a8', c2: '#e30613', c3: '#111111', perf: { p: 0.985, a: 0.980 },
    drivers: [{ name: 'Nico Hollstein', code: 'HOL', num: 27, skill: 0.962 }, { name: 'Gabriel Costa', code: 'COS', num: 5, skill: 0.955 }] },
  { id: 'liberty', split: true, name: 'Liberty Crest',      c1: '#0b0b0b', c2: '#d9dcdf', c3: '#c9a227', perf: { p: 0.980, a: 0.975 },
    drivers: [{ name: 'Sergio Valdes', code: 'VAL', num: 11, skill: 0.965 }, { name: 'Marcus Lindqvist', code: 'LIN', num: 77, skill: 0.958 }] },
];

// Tracks are written as map vertices [x, y, cornerRadius] in metres, in
// driving order. Each vertex becomes a corner filleted to that radius; the
// builder then smooths curvature into clothoid-like transitions. The start
// line sits halfway along the straight from the last vertex to the first.
// player renames (team name, driver name, 3-letter code, number) kept on this device;
// driver.code stays the internal id so career points survive a rename
const ROSTER_DEFAULT = JSON.parse(JSON.stringify(TEAMS.map((t) => ({ id: t.id, name: t.name, drivers: t.drivers.map((d) => ({ name: d.name, abbr: d.code, num: d.num })) }))));
function applyRoster(edits) {
  TEAMS.forEach((t, i) => {
    const e = (edits && edits.find((x) => x.id === t.id)) || ROSTER_DEFAULT[i];
    t.name = e.name || ROSTER_DEFAULT[i].name;
    t.drivers.forEach((d, k) => { const ed = e.drivers[k] || ROSTER_DEFAULT[i].drivers[k]; d.name = ed.name || d.name; d.abbr = (ed.abbr || d.code).toUpperCase().slice(0, 3); d.num = ed.num || d.num; });
  });
}

const TRACKS = [
  { id: 'parco', name: 'Autodromo del Parco', country: 'Italy', style: 'Temple of speed: long straights and chicanes', width: 14, wall: 15, runoff: 'grass', theme: 'parkland', laps: 5,
    pts: [[0, 1150, 16], [35, 1185, 16], [60, 1700, 320], [640, 1520, 18], [680, 1555, 18], [960, 1460, 70], [1010, 1300, 45], [930, 380, 45], [860, 300, 45], [870, 210, 70], [760, -330, 55], [0, -520, 200]] },
  { id: 'silver', name: 'Silverwood', country: 'Great Britain', style: 'Old airfield with fast sweepers', width: 15, wall: 18, runoff: 'tarmac', theme: 'airfield', laps: 5,
    pts: [[500, 0, 110], [620, -150, 90], [700, -170, 60], [700, -300, 80], [900, -1100, 110], [700, -1150, 40], [600, -1220, 45], [100, -1150, 140], [-150, -1050, 160], [-300, -1050, 30], [-310, -700, 25], [-500, -560, 50], [-520, -200, 50], [-420, -120, 45], [-250, -160, 60], [-150, 0, 100]] },
  { id: 'ardenne', name: 'Ardenne Forest Ring', country: 'Belgium', style: 'Long lap through the forest', width: 14, wall: 16, runoff: 'grass', theme: 'forest', laps: 4,
    pts: [[100, 400, 18], [180, 200, 60], [290, 120, 80], [360, -20, 150], [1300, -480, 40], [1340, -560, 40], [1440, -600, 55], [1460, -800, 40], [1250, -830, 110], [1000, -1000, 120], [1050, -1250, 60], [1000, -1350, 60], [1050, -1500, 70], [700, -1520, 300], [150, -650, 20], [200, -560, 20]] },
  { id: 'riviera', name: 'Riviera Street Circuit', country: 'Monaco', style: 'Narrow streets, barriers and hairpins', width: 10, wall: 7, runoff: 'street', theme: 'street', laps: 6,
    pts: [[200, 0, 16], [240, 300, 200], [180, 450, 35], [40, 460, 25], [30, 600, 14], [160, 640, 9], [60, 720, 16], [-120, 760, 20], [-350, 650, 250], [-430, 430, 14], [-400, 390, 14], [-430, 260, 40], [-360, 150, 25], [-330, 140, 25], [-310, 100, 25], [-270, 80, 20], [-200, -20, 10], [-230, -60, 12]] },
  { id: 'serra', name: 'Serra Azul', country: 'Brazil', style: 'Anticlockwise, with a twisting infield', width: 14, wall: 16, runoff: 'grass', theme: 'tropical', laps: 5,
    pts: [[0, 0, 30], [80, -60, 40], [120, -200, 90], [400, -300, 150], [1100, -200, 55], [1150, 0, 90], [1050, 150, 60], [1080, 330, 40], [900, 420, 30], [850, 250, 18], [700, 350, 60], [600, 250, 35], [450, 330, 40], [300, 550, 250], [60, 500, 120]] },
  { id: 'ile', name: "Circuit de l'Ile", country: 'Canada', style: 'Island stop-and-go with a hairpin', width: 13, wall: 11, runoff: 'tarmac', theme: 'island', laps: 6,
    pts: [[-200, 260, 45], [-330, 200, 20], [-200, 80, 90], [100, 60, 25], [140, 90, 25], [500, 80, 200], [800, 30, 30], [840, 70, 30], [1300, 60, 18], [1100, 200, 60], [400, 240, 25], [360, 280, 25]] },
  { id: 'sakhir', name: 'Sahra Sands', country: 'Bahrain', style: 'Desert night race under floodlights', width: 15, wall: 20, runoff: 'tarmac', theme: 'desert', laps: 5,
    pts: [[600, 0, 22], [520, -150, 50], [560, -300, 80], [450, -750, 35], [100, -800, 60], [20, -900, 50], [-100, -920, 60], [-300, -1050, 15], [-250, -850, 40], [-320, -650, 25], [-650, -600, 60], [-700, -150, 35]] },
  { id: 'lonestar', name: 'Lone Star Raceway', country: 'United States', style: 'Uphill hairpin, esses and a stadium', width: 15, wall: 18, runoff: 'tarmac', theme: 'prairie', laps: 5,
    pts: [[0, 600, 16], [-100, 560, 100], [-250, 600, 70], [-380, 560, 70], [-500, 620, 70], [-640, 580, 80], [-760, 640, 60], [-900, 560, 18], [-150, 300, 25], [-200, 150, 40], [-350, 120, 20], [-330, -80, 70], [-200, -260, 90], [-50, -200, 40]] },
];

const THEMES = {
  parkland: { ground: '#4a6b2f', ground2: '#5b7d38', sky: ['#5d8fd0', '#cfe0ee'], sun: [0.45, 0.55, 0.3], sunColor: '#fff1d6', trees: 2600, treeKind: 'mixed', buildings: 40, hills: '#5f7a63', time: 'day' },
  airfield: { ground: '#557a33', ground2: '#668c3d', sky: ['#7d9cc0', '#dfe6ec'], sun: [-0.4, 0.45, 0.4], sunColor: '#fff6e5', trees: 900, treeKind: 'broad', buildings: 50, hills: '#6f8a6e', time: 'overcast' },
  forest: { ground: '#3e5e2a', ground2: '#4b6d31', sky: ['#5f88b8', '#d5e2ea'], sun: [0.3, 0.5, -0.5], sunColor: '#fff0d0', trees: 6000, treeKind: 'pine', buildings: 10, hills: '#3f5b45', time: 'day' },
  street: { ground: '#5a5650', ground2: '#69645c', sky: ['#4c86d6', '#d9e8f3'], sun: [0.5, 0.6, 0.2], sunColor: '#fff4dd', trees: 250, treeKind: 'palm', buildings: 900, hills: '#7a8a8c', time: 'day' },
  tropical: { ground: '#4f7a2c', ground2: '#5f8d33', sky: ['#4f87c9', '#e3ecef'], sun: [-0.5, 0.6, 0.3], sunColor: '#fff3d2', trees: 1800, treeKind: 'broad', buildings: 300, hills: '#58784f', time: 'day' },
  island: { ground: '#527a35', ground2: '#5f8b3d', sky: ['#5a8fd3', '#dbe8f1'], sun: [0.2, 0.55, 0.6], sunColor: '#fff3dc', trees: 1700, treeKind: 'broad', buildings: 60, hills: '#6d8796', time: 'day', water: true },
  desert: { ground: '#b8925f', ground2: '#c9a56f', sky: ['#0b1430', '#3a3550'], sun: [0.3, 0.6, 0.2], sunColor: '#ffe6bf', trees: 160, treeKind: 'palm', buildings: 60, hills: '#7a6248', time: 'night' },
  prairie: { ground: '#6b7b3a', ground2: '#7d8c44', sky: ['#4a83cf', '#e6e9e2'], sun: [-0.3, 0.42, -0.6], sunColor: '#ffe9c4', trees: 700, treeKind: 'broad', buildings: 40, hills: '#8a8a63', time: 'day' },
};

// ratings shown in the menus (0-99), derived from the same numbers the simulation uses
function driverRating(dr) { return Math.round(Math.min(99, 60 + (dr.skill - 0.945) / 0.055 * 39)); }
function teamStats(tm) {
  const r = (v, lo, hi) => Math.round(Math.max(40, Math.min(99, 60 + (v - lo) / (hi - lo) * 39)));
  const power = r(tm.perf.p, 0.975, 1), aero = r(tm.perf.a, 0.97, 1), drivers = Math.round(tm.drivers.reduce((a, d) => a + driverRating(d), 0) / tm.drivers.length);
  const score = (t) => t.perf.p * 0.35 + t.perf.a * 0.45 + (t.drivers.reduce((a, d) => a + d.skill, 0) / t.drivers.length) * 0.2;
  const rank = TEAMS.slice().sort((a, b) => score(b) - score(a)).indexOf(tm) + 1;
  const tier = rank <= 3 ? 'front' : rank <= 7 ? 'mid' : 'back';
  return { power, aero, drivers, overall: Math.round(power * 0.35 + aero * 0.45 + drivers * 0.2), rank, tier, tierLabel: { front: 'Front-runner', mid: 'Midfield', back: 'Backmarker' }[tier] };
}
