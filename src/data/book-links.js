// Where each book's main button on /books points, keyed by the book's slug in the
// books table. This is the one place to change a store link: the URLs here are
// used exactly as written (UTM parameters included), and they take precedence
// over the `links` column in Supabase. A book not listed here falls back to its
// first link in the database.
export const BOOK_LINKS = {
  "closer-than-you-think": {
    label: "Buy at Barnes & Noble",
    url: "https://www.barnesandnoble.com/w/closer-than-you-think-devlin-foster/1151458991?ean=2940184788739&utm_source=hva&utm_medium=books",
  },
  "choose-your-own-saturday": {
    label: "Buy at Barnes & Noble",
    url: "https://www.barnesandnoble.com/w/choose-your-own-saturday-devlin-foster/1151479117?ean=2940184879239&utm_source=hva&utm_medium=books",
  },
  "catskill-waterfalls": {
    label: "Buy at Barnes & Noble",
    url: "https://www.barnesandnoble.com/w/catskill-waterfalls-devlin-foster/1151459185?ean=2940184788791&utm_source=hva&utm_medium=books",
  },
  "catskills-fire-tower-challenge": {
    label: "Buy on Gumroad",
    url: "https://devlinfoster.gumroad.com/l/catskills-fire-towers?utm_source=hva&utm_medium=books",
  },
  "trails-that-say-yes": {
    label: "Buy at Barnes & Noble",
    url: "https://www.barnesandnoble.com/w/trails-that-say-yes-devlin-foster/1151457321?ean=2940184788661&utm_source=hva&utm_medium=books",
  },
  "hudson-valley-finds": {
    label: "Buy at Barnes & Noble",
    url: "https://www.barnesandnoble.com/w/hudson-valley-finds-devlin-foster/1151479099?ean=2940184879277&utm_source=hva&utm_medium=books",
  },
  "free-legal-backcountry-camping": {
    label: "Buy on Gumroad",
    url: "https://devlinfoster.gumroad.com/l/longpath-camping?utm_source=hva&utm_medium=books",
  },
  "rambles-1863": {
    label: "Read free on Gumroad",
    url: "https://devlinfoster.gumroad.com/l/rambles-1863?utm_source=hva&utm_medium=books",
  },
  "world-kitchen-on-a-budget": {
    label: "Buy at Barnes & Noble",
    url: "https://www.barnesandnoble.com/w/the-world-kitchen-on-a-budget-devlin-foster/1151323091?ean=2940185281819&utm_source=hva&utm_medium=books",
  },
  "when-the-numbers-change": {
    label: "Buy at Barnes & Noble",
    url: "https://www.barnesandnoble.com/w/when-the-numbers-change-devlin-foster/1151359465?ean=2940184837802&utm_source=hva&utm_medium=books",
  },
  "freezer-full": {
    label: "Buy at Barnes & Noble",
    url: "https://www.barnesandnoble.com/w/freezer-full-devlin-foster/1151584598?ean=9798179045335&utm_source=hva&utm_medium=books",
  },
  "freezer-full-mohawk-valley": {
    label: "Buy at Barnes & Noble",
    url: "https://www.barnesandnoble.com/w/freezer-full-devlin-foster/1151584565?ean=9798179047605&utm_source=hva&utm_medium=books",
  },
};
