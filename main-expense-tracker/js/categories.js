/**
 * categories.js — the expense category taxonomy, grouped for the form
 * and flattened for filters.
 */
const CATEGORY_GROUPS = {
  'Building Materials': ['Cement', 'Sand', 'Granite', 'Blocks', 'Bricks', 'Iron Rods', 'Timber', 'Roofing Materials', 'Paint', 'Tiles', 'Plumbing Materials', 'Electrical Materials', 'Doors & Windows', 'Glass & Aluminium'],
  'Labour': ['Mason', 'Carpenter', 'Electrician', 'Plumber', 'Welder', 'Painter', 'General Labour'],
  'Equipment & Machinery': ['Equipment Hire', 'Generator Fuel', 'Diesel', 'Petrol', 'Machinery Repair', 'Tool Purchase'],
  'Logistics': ['Transportation', 'Haulage', 'Loading & Offloading'],
  'Site Operations': ['Security', 'Site Cleaning', 'Water Supply', 'Office Supplies', 'Internet & Communication', 'PPE & Safety Equipment', 'Waste Disposal'],
  'Other': ['Miscellaneous']
};

const CATEGORY_FLAT = Object.values(CATEGORY_GROUPS).flat();

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
