export const state = {
  ready: false,
  brands: [],
  machines: [],
  sets: [],
  bodyweights: [],
  route: { screen: 'brands', brandId: null, machineId: null },
  search: { brands: '', machines: '' },
  reorder: { brands: false, machines: false },
  recentActivityExpanded: {},
  modal: null,
  confirmSheet: null,
  toast: null,
  menuOpen: false,
  preferences: {
    chartSeriesMode: 'e1rmMax',
  },
};
