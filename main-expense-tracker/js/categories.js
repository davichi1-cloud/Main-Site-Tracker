/**
 * categories.js — the expense category taxonomy.
 *
 * CATEGORY_GROUPS drives the on-screen Add Expense dropdown and filters —
 * unchanged, familiar groupings (Building Materials, Labour, etc).
 *
 * EXPORT_GROUP_MAP is separate: it's only used when generating the
 * Excel export, to file each specific category into the client's
 * preferred workbook sheets (Hotel, Accommodation, Materials, PPE,
 * Labour_Workmanship, Utilities, Security_Storekeeper, Other). The
 * dropdown never sees these names — they only appear in the exported file.
 */
const CATEGORY_GROUPS = {
  'Hotel': ['Hotel Accommodation'],
  'Accommodation': ['House Rent', 'House Cleaning', 'House Setup Materials'],
  'Building Materials': ['Cement', 'Sand', 'Granite', 'Blocks', 'Bricks', 'Iron Rods', 'Timber', 'Roofing Materials', 'Paint', 'Tiles', 'Plumbing Materials', 'Electrical Materials', 'Doors & Windows', 'Glass & Aluminium'],
  'Labour': ['Mason', 'Carpenter', 'Electrician', 'Plumber', 'Welder', 'Painter', 'General Labour'],
  'Equipment & Machinery': ['Equipment Hire', 'Generator Fuel', 'Diesel', 'Petrol', 'Machinery Repair', 'Tool Purchase'],
  'Logistics': ['Transportation', 'Haulage', 'Loading & Offloading'],
  'Site Operations': ['Security', 'Site Cleaning', 'Water Supply', 'Office Supplies', 'Internet & Communication', 'PPE & Safety Equipment', 'Waste Disposal'],
  'Other': ['Miscellaneous']
};

const CATEGORY_FLAT = Object.values(CATEGORY_GROUPS).flat();

// Every leaf category above, filed into the client's export sheet names.
// Anything not listed here falls back to "Other" at export time.
const EXPORT_GROUP_MAP = {
  // Hotel
  'Hotel Accommodation': 'Hotel',
  // Accommodation
  'House Rent': 'Accommodation', 'House Cleaning': 'Accommodation', 'House Setup Materials': 'Accommodation',
  // Materials
  'Cement': 'Materials', 'Sand': 'Materials', 'Granite': 'Materials', 'Blocks': 'Materials',
  'Bricks': 'Materials', 'Iron Rods': 'Materials', 'Timber': 'Materials', 'Roofing Materials': 'Materials',
  'Paint': 'Materials', 'Tiles': 'Materials', 'Plumbing Materials': 'Materials', 'Electrical Materials': 'Materials',
  'Doors & Windows': 'Materials', 'Glass & Aluminium': 'Materials',
  // Labour_Workmanship
  'Mason': 'Labour_Workmanship', 'Carpenter': 'Labour_Workmanship', 'Electrician': 'Labour_Workmanship',
  'Plumber': 'Labour_Workmanship', 'Welder': 'Labour_Workmanship', 'Painter': 'Labour_Workmanship',
  'General Labour': 'Labour_Workmanship',
  // Utilities
  'Generator Fuel': 'Utilities', 'Diesel': 'Utilities', 'Petrol': 'Utilities',
  'Water Supply': 'Utilities', 'Internet & Communication': 'Utilities',
  // Security_Storekeeper
  'Security': 'Security_Storekeeper',
  // PPE
  'PPE & Safety Equipment': 'PPE',
  // Other (explicit — anything else also defaults here)
  'Equipment Hire': 'Other', 'Machinery Repair': 'Other', 'Tool Purchase': 'Other',
  'Transportation': 'Other', 'Haulage': 'Other', 'Loading & Offloading': 'Other',
  'Site Cleaning': 'Other', 'Office Supplies': 'Other', 'Waste Disposal': 'Other', 'Miscellaneous': 'Other'
};

// Friendly labels for the export-only group names above (sheet names
// themselves stay exactly as the client's workbook: Labour_Workmanship,
// Security_Storekeeper, with underscores).
const EXPORT_GROUP_LABELS = {
  'Labour_Workmanship': 'Labour & Workmanship',
  'Security_Storekeeper': 'Security & Storekeeper'
};

function populateCategorySelect(selectEl, includeBlank) {
  let html = includeBlank ? '<option value="">All categories</option>' : '';
  Object.keys(CATEGORY_GROUPS).forEach(group => {
    html += `<optgroup label="${group}">`;
    CATEGORY_GROUPS[group].forEach(c => {
      html += `<option value="${c}">${c}</option>`;
    });
    html += `</optgroup>`;
  });
  selectEl.innerHTML = html;
}
