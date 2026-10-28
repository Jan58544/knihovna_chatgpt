// Supplied, verified Knihovny.cz response. Tests never contact the live catalogue.
export const catalogueResponse = {
  resultCount: 1,
  records: [{
    id: 'mkp.3521868',
    title: 'Životy slavných a starých provensálských básníků, kteří žili v dobách hrabat z kraje Provença',
    authors: {
      primary: { 'Jean de Nostredame, asi 1507-1577': [] },
      secondary: { 'Josef Prokop, 1971-': [], 'Vojtěch Domlátil, 1979-': [] },
      corporate: [],
    },
    publishers: ['Argo,'],
    placesOfPublication: ['Praha :'],
    publicationDates: ['2011'],
    physicalDescriptions: ['218 s. : il. ; 22 cm'],
    isbns: ['978-80-257-0367-0'],
    issns: [],
    cnb: 'cnb002163342',
    formats: ['0/BOOKS/'],
  }],
  status: 'OK',
};
export const requestedFields = [
  'id', 'title', 'authors', 'publishers', 'placesOfPublication',
  'publicationDates', 'physicalDescriptions', 'isbns', 'issns', 'cnb', 'formats',
];
